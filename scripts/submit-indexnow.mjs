#!/usr/bin/env node
// Tells IndexNow search engines (Bing, Yandex, Naver, Seznam and every engine
// that shares IndexNow submissions, which also feeds DuckDuckGo, Yahoo and
// Ecosia through Bing) which public Riddle Arabia pages exist or changed.
//
// Google does not take IndexNow; it needs Search Console (see
// docs/SEARCH-DISCOVERY.md). This script only reads the committed sitemap and
// a public key file. It sends no visitor data and needs no secret: an IndexNow
// key is public by design and only proves the submitter controls the host.

import { readFile, readdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export const SITE_ORIGIN = "https://riddlearabia.com";
export const SITE_HOST = "riddlearabia.com";
export const INDEXNOW_ENDPOINT = "https://api.indexnow.org/indexnow";
export const MAX_URLS_PER_REQUEST = 10_000;
// Automatic runs only send pages whose sitemap <lastmod> is this recent, so a
// daily maintenance release does not resubmit the unchanged catalogue.
export const DEFAULT_RECENT_DAYS = 3;

const KEY_FILE_PATTERN = /^([a-f0-9]{32})\.txt$/u;
const REPOSITORY_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function invariant(condition, message) {
  if (!condition) throw new Error(message);
}

function decodeXml(value) {
  return value
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", "\"")
    .replaceAll("&apos;", "'")
    .replaceAll("&amp;", "&")
    .trim();
}

/** Returns [{ url, lastmod }] for every <url> entry on the primary origin. */
export function parseSitemapEntries(xml) {
  const entries = [];
  const seen = new Set();
  for (const block of String(xml).matchAll(/<url\b[^>]*>([\s\S]*?)<\/url>/giu)) {
    const loc = block[1].match(/<loc\b[^>]*>([\s\S]*?)<\/loc>/iu)?.[1];
    if (!loc) continue;
    const url = decodeXml(loc);
    let parsed;
    try {
      parsed = new URL(url);
    } catch {
      throw new Error(`Sitemap contains an invalid URL: ${url}`);
    }
    invariant(
      parsed.origin === SITE_ORIGIN && !parsed.search && !parsed.hash,
      `Sitemap URL is not a clean ${SITE_ORIGIN} canonical: ${url}`,
    );
    if (seen.has(parsed.href)) continue;
    seen.add(parsed.href);
    const lastmod = block[1].match(/<lastmod\b[^>]*>([\s\S]*?)<\/lastmod>/iu)?.[1]?.trim() || null;
    entries.push({ url: parsed.href, lastmod });
  }
  return entries;
}

/** Sitemap dates use the Dubai calendar day; compare whole days, not instants. */
export function dubaiDate(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Dubai", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(now);
}

export function selectUrls(entries, { scope = "recent", recentDays = DEFAULT_RECENT_DAYS, now = new Date() } = {}) {
  invariant(scope === "all" || scope === "recent", `Unknown scope: ${scope}`);
  if (scope === "all") return entries.map((entry) => entry.url);
  invariant(Number.isInteger(recentDays) && recentDays >= 0, "recentDays must be a non-negative integer");
  const cutoff = new Date(`${dubaiDate(now)}T00:00:00Z`);
  cutoff.setUTCDate(cutoff.getUTCDate() - recentDays);
  const cutoffDay = cutoff.toISOString().slice(0, 10);
  return entries
    .filter((entry) => entry.lastmod && entry.lastmod.slice(0, 10) >= cutoffDay)
    .map((entry) => entry.url);
}

export function buildPayloads(urls, key) {
  invariant(/^[a-f0-9]{32}$/u.test(key), "IndexNow key must be 32 lowercase hex characters");
  const payloads = [];
  for (let start = 0; start < urls.length; start += MAX_URLS_PER_REQUEST) {
    payloads.push({
      host: SITE_HOST,
      key,
      keyLocation: `${SITE_ORIGIN}/${key}.txt`,
      urlList: urls.slice(start, start + MAX_URLS_PER_REQUEST),
    });
  }
  return payloads;
}

/** Finds the single committed key file and checks that it holds its own name. */
export async function readKey(root = REPOSITORY_ROOT) {
  const keys = [];
  for (const name of await readdir(root)) {
    const match = name.match(KEY_FILE_PATTERN);
    if (!match) continue;
    const content = (await readFile(resolve(root, name), "utf8")).trim();
    invariant(content === match[1], `${name} must contain exactly its own key`);
    keys.push(match[1]);
  }
  invariant(keys.length === 1, `Expected exactly one IndexNow key file at the repository root, found ${keys.length}`);
  return keys[0];
}

function parseArguments(argv) {
  const options = { scope: "recent", recentDays: DEFAULT_RECENT_DAYS, dryRun: false };
  for (const argument of argv) {
    if (argument === "--dry-run") options.dryRun = true;
    else if (argument === "--all") options.scope = "all";
    else if (argument.startsWith("--scope=")) options.scope = argument.slice("--scope=".length);
    else if (argument.startsWith("--recent-days=")) options.recentDays = Number(argument.slice("--recent-days=".length));
    else throw new Error(`Unknown argument: ${argument}`);
  }
  return options;
}

async function fetchWithTimeout(url, init = {}, timeoutMs = 20_000) {
  return fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
}

export async function main(argv = process.argv.slice(2), { root = REPOSITORY_ROOT, fetchImpl = fetchWithTimeout, log = console.log } = {}) {
  const options = parseArguments(argv);
  const key = await readKey(root);
  const entries = parseSitemapEntries(await readFile(resolve(root, "sitemap.xml"), "utf8"));
  invariant(entries.length > 0, "sitemap.xml has no submittable URLs");
  const urls = selectUrls(entries, options);
  log(`IndexNow: ${urls.length} of ${entries.length} sitemap URLs selected (scope ${options.scope}).`);
  if (urls.length === 0) {
    log("IndexNow: nothing changed recently; no submission needed.");
    return { submitted: 0 };
  }
  if (options.dryRun) {
    for (const url of urls.slice(0, 20)) log(`  ${url}`);
    if (urls.length > 20) log(`  ... and ${urls.length - 20} more`);
    return { submitted: 0, dryRun: true };
  }

  // Engines verify the key against the live host. Fail clearly if the release
  // that adds the key file has not reached production yet.
  const keyResponse = await fetchImpl(`${SITE_ORIGIN}/${key}.txt`, { headers: { "cache-control": "no-cache" } });
  const liveKey = keyResponse.ok ? (await keyResponse.text()).trim() : "";
  invariant(
    liveKey === key,
    `The IndexNow key file is not live at ${SITE_ORIGIN}/${key}.txt (HTTP ${keyResponse.status}). Release the static site first.`,
  );

  let submitted = 0;
  for (const payload of buildPayloads(urls, key)) {
    const response = await fetchImpl(INDEXNOW_ENDPOINT, {
      method: "POST",
      headers: { "content-type": "application/json; charset=utf-8" },
      body: JSON.stringify(payload),
    });
    // 200 = accepted, 202 = accepted while the key is being validated.
    invariant(
      response.status === 200 || response.status === 202,
      `IndexNow rejected the submission with HTTP ${response.status}: ${(await response.text()).slice(0, 300)}`,
    );
    submitted += payload.urlList.length;
    log(`IndexNow: accepted ${payload.urlList.length} URLs (HTTP ${response.status}).`);
  }
  return { submitted };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
