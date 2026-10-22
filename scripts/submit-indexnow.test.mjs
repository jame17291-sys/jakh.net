import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  buildPayloads,
  dubaiDate,
  main,
  MAX_URLS_PER_REQUEST,
  parseSitemapEntries,
  readKey,
  selectUrls,
} from "./submit-indexnow.mjs";

const KEY = "0123456789abcdef0123456789abcdef";

function sitemap(entries) {
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${
    entries.map(([loc, lastmod]) => `  <url><loc>${loc}</loc>${lastmod ? `<lastmod>${lastmod}</lastmod>` : ""}</url>`).join("\n")
  }\n</urlset>\n`;
}

async function fixtureRoot({ key = KEY, keyContent = KEY, xml }) {
  const root = await mkdtemp(join(tmpdir(), "indexnow-"));
  await writeFile(join(root, `${key}.txt`), `${keyContent}\n`);
  await writeFile(join(root, "sitemap.xml"), xml);
  return root;
}

test("parses only clean primary-origin sitemap URLs and their lastmod", () => {
  const entries = parseSitemapEntries(sitemap([
    ["https://riddlearabia.com/", "2026-10-20"],
    ["https://riddlearabia.com/ar/", null],
    ["https://riddlearabia.com/", "2026-10-20"],
  ]));
  assert.deepEqual(entries, [
    { url: "https://riddlearabia.com/", lastmod: "2026-10-20" },
    { url: "https://riddlearabia.com/ar/", lastmod: null },
  ]);
});

test("rejects sitemap URLs on other hosts, including the retired jakh.net", () => {
  assert.throws(() => parseSitemapEntries(sitemap([["https://jakh.net/", "2026-10-01"]])), /clean https:\/\/riddlearabia\.com/u);
  assert.throws(() => parseSitemapEntries(sitemap([["https://riddlearabia.com/play?game=chess", null]])), /clean/u);
});

test("the committed sitemap is fully submittable", async () => {
  const entries = parseSitemapEntries(await readFile(new URL("../sitemap.xml", import.meta.url), "utf8"));
  assert.ok(entries.length > 50, "sitemap should list the public pages");
  assert.ok(entries.some((entry) => entry.url === "https://riddlearabia.com/"));
  assert.ok(entries.some((entry) => entry.url === "https://riddlearabia.com/ar/"));
});

test("recent scope keeps pages changed within the window on the Dubai calendar", () => {
  const entries = [
    { url: "https://riddlearabia.com/a", lastmod: "2026-10-23" },
    { url: "https://riddlearabia.com/b", lastmod: "2026-10-20" },
    { url: "https://riddlearabia.com/c", lastmod: "2026-10-19" },
    { url: "https://riddlearabia.com/d", lastmod: null },
  ];
  // 21:30 UTC on 22 Oct is already 23 Oct in Dubai.
  const now = new Date("2026-10-22T21:30:00Z");
  assert.equal(dubaiDate(now), "2026-10-23");
  assert.deepEqual(selectUrls(entries, { scope: "recent", recentDays: 3, now }), [
    "https://riddlearabia.com/a",
    "https://riddlearabia.com/b",
  ]);
  assert.equal(selectUrls(entries, { scope: "all" }).length, 4);
  assert.throws(() => selectUrls(entries, { scope: "everything" }), /Unknown scope/u);
});

test("payloads name the host and key location and respect the 10,000 URL limit", () => {
  const urls = Array.from({ length: MAX_URLS_PER_REQUEST + 1 }, (_, i) => `https://riddlearabia.com/p${i}`);
  const payloads = buildPayloads(urls, KEY);
  assert.equal(payloads.length, 2);
  assert.equal(payloads[0].urlList.length, MAX_URLS_PER_REQUEST);
  assert.equal(payloads[1].urlList.length, 1);
  assert.equal(payloads[0].host, "riddlearabia.com");
  assert.equal(payloads[0].keyLocation, `https://riddlearabia.com/${KEY}.txt`);
  assert.throws(() => buildPayloads(urls, "not-a-key"), /32 lowercase hex/u);
});

test("the repository has exactly one well-formed key file", async () => {
  assert.match(await readKey(), /^[a-f0-9]{32}$/u);
});

test("a key file must contain its own key", async () => {
  const root = await fixtureRoot({ keyContent: "ffffffffffffffffffffffffffffffff", xml: sitemap([["https://riddlearabia.com/", "2026-10-23"]]) });
  await assert.rejects(readKey(root), /must contain exactly its own key/u);
});

test("submission verifies the live key, then posts the selected URLs", async () => {
  const root = await fixtureRoot({ xml: sitemap([["https://riddlearabia.com/", "2026-10-23"], ["https://riddlearabia.com/ar/", "2026-10-23"]]) });
  const calls = [];
  const fetchImpl = async (url, init = {}) => {
    calls.push({ url, init });
    if (url.endsWith(`${KEY}.txt`)) return new Response(`${KEY}\n`, { status: 200 });
    return new Response("", { status: 202 });
  };
  const result = await main(["--all"], { root, fetchImpl, log: () => {} });
  assert.equal(result.submitted, 2);
  assert.equal(calls.length, 2);
  assert.equal(calls[1].url, "https://api.indexnow.org/indexnow");
  assert.equal(calls[1].init.method, "POST");
  assert.deepEqual(JSON.parse(calls[1].init.body).urlList, ["https://riddlearabia.com/", "https://riddlearabia.com/ar/"]);
});

test("submission stops before posting when the key file is not live yet", async () => {
  const root = await fixtureRoot({ xml: sitemap([["https://riddlearabia.com/", "2026-10-23"]]) });
  let posted = false;
  const fetchImpl = async (url) => {
    if (url.endsWith(`${KEY}.txt`)) return new Response("Not found", { status: 404 });
    posted = true;
    return new Response("", { status: 200 });
  };
  await assert.rejects(main(["--all"], { root, fetchImpl, log: () => {} }), /not live/u);
  assert.equal(posted, false);
});

test("a rejected submission fails loudly", async () => {
  const root = await fixtureRoot({ xml: sitemap([["https://riddlearabia.com/", "2026-10-23"]]) });
  const fetchImpl = async (url) => (url.endsWith(`${KEY}.txt`)
    ? new Response(KEY, { status: 200 })
    : new Response("Unprocessable", { status: 422 }));
  await assert.rejects(main(["--all"], { root, fetchImpl, log: () => {} }), /HTTP 422/u);
});

test("dry run and empty recent windows never contact the network", async () => {
  const root = await fixtureRoot({ xml: sitemap([["https://riddlearabia.com/", "2000-01-01"]]) });
  const fetchImpl = async () => assert.fail("network must not be used");
  assert.deepEqual(await main(["--all", "--dry-run"], { root, fetchImpl, log: () => {} }), { submitted: 0, dryRun: true });
  assert.deepEqual(await main([], { root, fetchImpl, log: () => {} }), { submitted: 0 });
});
