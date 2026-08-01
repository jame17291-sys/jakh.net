#!/usr/bin/env node

import { createHash } from "node:crypto";
import {
  lstat,
  mkdir,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { dirname, extname, relative, resolve, sep } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

const SCRIPT_DIRECTORY = dirname(fileURLToPath(import.meta.url));
export const REPOSITORY_ROOT = resolve(SCRIPT_DIRECTORY, "..");
export const DEFAULT_OUTPUT_DIRECTORY = resolve(REPOSITORY_ROOT, "site-worker/dist");
export const DEFAULT_MANIFEST_PATH = resolve(REPOSITORY_ROOT, "site-worker/generated/site-manifest.json");
export const DEFAULT_MANIFEST_MODULE_PATH = resolve(REPOSITORY_ROOT, "site-worker/generated/site-manifest.js");
export const FINGERPRINT_PREFIX_LENGTH = 16;

export const FINGERPRINT_SOURCE_PATHS = Object.freeze([
  "/app.js",
  "/styles.css",
  "/privacy.css",
  "/battle-mode.js",
  "/battle-mode.css",
  "/search-leaderboard.js",
  "/search-leaderboard.css",
  "/data/search-index.en.json",
  "/data/search-index.ar.json",
]);

const DEPLOYABLE_EXTENSIONS = new Set([
  ".css",
  ".gif",
  ".html",
  ".ico",
  ".jpeg",
  ".jpg",
  ".js",
  ".json",
  ".map",
  ".mjs",
  ".png",
  ".svg",
  ".txt",
  ".webmanifest",
  ".webp",
  ".woff",
  ".woff2",
  ".xml",
]);

const EXCLUDED_TOP_LEVEL = new Set([
  ".git",
  ".github",
  ".agents",
  ".codex",
  "docs",
  "node_modules",
  "scripts",
  "site-worker",
  "worker",
  "_site",
]);

function invariant(condition, message) {
  if (!condition) throw new Error(message);
}

function normalizeRelativePath(value) {
  return value.split(sep).join("/").replace(/^\.\//u, "");
}

export function isDeployableFile(relativePath) {
  const normalized = normalizeRelativePath(relativePath);
  if (!normalized || normalized.startsWith("/") || normalized.includes("../")) return false;
  const [topLevel] = normalized.split("/");
  if (EXCLUDED_TOP_LEVEL.has(topLevel)) return false;
  if (normalized === "package.json" || normalized === "package-lock.json") return false;
  if (normalized === "CNAME" || normalized === "SECURITY.md" || normalized === ".nojekyll") return false;
  return DEPLOYABLE_EXTENSIONS.has(extname(normalized).toLowerCase());
}

export function trackedDeployableFiles(sourceRoot = REPOSITORY_ROOT) {
  const result = spawnSync("git", ["ls-files", "-z"], {
    cwd: sourceRoot,
    encoding: "buffer",
    maxBuffer: 16 * 1024 * 1024,
  });
  invariant(result.status === 0, `git ls-files failed: ${result.stderr?.toString("utf8").trim() || "unknown error"}`);
  return result.stdout
    .toString("utf8")
    .split("\0")
    .filter(Boolean)
    .map(normalizeRelativePath)
    .filter(isDeployableFile)
    .sort((left, right) => left.localeCompare(right, "en"));
}

function sha256(buffer, encoding = "hex") {
  return createHash("sha256").update(buffer).digest(encoding);
}

function urlPathToRelative(urlPath) {
  invariant(/^\/[A-Za-z0-9._/-]+$/u.test(urlPath), `Unsafe artifact URL path: ${urlPath}`);
  return urlPath.slice(1);
}

function contentFingerprintedPath(stableUrlPath, bytes) {
  const extension = extname(stableUrlPath);
  invariant(extension, `Fingerprint source has no extension: ${stableUrlPath}`);
  const stem = stableUrlPath.slice(0, -extension.length);
  return `${stem}.${sha256(bytes).slice(0, FINGERPRINT_PREFIX_LENGTH)}${extension}`;
}

function replaceQuotedUrl(source, stableUrlPath, fingerprintedUrlPath) {
  const escaped = stableUrlPath.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
  const pattern = new RegExp(`(["'])${escaped}\\1`, "gu");
  let replacements = 0;
  const value = source.replace(pattern, (_match, quote) => {
    replacements += 1;
    return `${quote}${fingerprintedUrlPath}${quote}`;
  });
  return { value, replacements };
}

function rewriteSearchLeaderboard(source, fingerprints) {
  const english = fingerprints["/data/search-index.en.json"];
  const arabic = fingerprints["/data/search-index.ar.json"];
  const dynamicShard = "fetchJson(`/data/search-index.${language}.json`)";
  if (!source.includes(dynamicShard)) return source;
  invariant(english && arabic, "search-leaderboard.js requires both fingerprinted language shards");
  const replacement = `fetchJson(language === 'ar' ? '${arabic}' : '${english}')`;
  const rewritten = source.replace(dynamicShard, replacement);
  invariant(!rewritten.includes(dynamicShard), "Dynamic search shard reference was not fully rewritten");
  return rewritten;
}

function rewriteApplication(source, fingerprints) {
  let rewritten = source;
  for (const dependency of [
    "/battle-mode.js",
    "/battle-mode.css",
    "/search-leaderboard.js",
    "/search-leaderboard.css",
  ]) {
    const target = fingerprints[dependency];
    if (!target) continue;
    rewritten = replaceQuotedUrl(rewritten, dependency, target).value;
  }
  return rewritten;
}

function rewriteHtmlAssetReferences(html, relativePath, fingerprints) {
  const base = new URL(normalizeRelativePath(relativePath), "https://jakh.net/");
  return html.replace(
    /(<(?:link|script)\b[^>]*?\b(?:href|src)\s*=\s*)(["'])([^"']+)(\2)/giu,
    (match, prefix, quote, reference, closingQuote) => {
      let pathname;
      try {
        pathname = new URL(reference, base).pathname;
      } catch {
        return match;
      }
      const fingerprinted = fingerprints[pathname];
      if (!["/app.js", "/styles.css", "/privacy.css"].includes(pathname) || !fingerprinted) return match;
      return `${prefix}${quote}${fingerprinted}${closingQuote}`;
    },
  );
}

const CACHE_IDENTITY_PLACEHOLDER = "__JAKH_SOURCE_GRAPH_ID__";

function rewriteServiceWorkerTemplate(source, fingerprints) {
  let rewritten = source;
  const declaration = /const CACHE_VERSION\s*=\s*['"][^'"]+['"];?/u;
  invariant(declaration.test(rewritten), "sw.js must declare CACHE_VERSION");
  rewritten = rewritten.replace(declaration, `const CACHE_VERSION = '${CACHE_IDENTITY_PLACEHOLDER}';`);

  for (const stable of ["/app.js", "/styles.css", "/privacy.css"]) {
    const target = fingerprints[stable];
    if (!target) continue;
    const result = replaceQuotedUrl(rewritten, stable, target);
    rewritten = result.value;
    if (stable !== "/privacy.css") {
      invariant(result.replacements > 0, `sw.js REQUIRED_CORE_ASSETS does not reference ${stable}`);
    }
  }

  const privacyTarget = fingerprints["/privacy.css"];
  if (privacyTarget && !rewritten.includes(`'${privacyTarget}'`) && !rewritten.includes(`"${privacyTarget}"`)) {
    const stylesTarget = fingerprints["/styles.css"];
    const stylesLine = `  '${stylesTarget}',`;
    invariant(rewritten.includes(stylesLine), "Cannot add privacy.css after the required styles.css asset");
    rewritten = rewritten.replace(stylesLine, `${stylesLine}\n  '${privacyTarget}',`);
  }
  return rewritten;
}

function artifactGraphDigest(artifactBytes) {
  const hasher = createHash("sha256");
  for (const [relativePath, bytes] of [...artifactBytes].sort(([left], [right]) => left.localeCompare(right, "en"))) {
    hasher.update(relativePath).update("\0").update(sha256(bytes)).update("\0");
  }
  return hasher.digest("hex");
}

function filenameCarriesDigest(urlPath, digest) {
  const filename = urlPath.split("/").at(-1) || "";
  const embedded = filename.match(/\.([a-f0-9]{12,64})(?=\.[^.]+$)/iu)?.[1]?.toLowerCase();
  return Boolean(embedded && digest.startsWith(embedded));
}

function validateFingerprintManifest(manifest) {
  invariant(manifest.fingerprints && typeof manifest.fingerprints === "object", "Manifest fingerprints are missing");
  for (const [stable, fingerprinted] of Object.entries(manifest.fingerprints)) {
    invariant(stable !== fingerprinted, `Fingerprint mapping for ${stable} is not versioned`);
    invariant(Boolean(manifest.files[stable]), `Fingerprint source is absent from manifest: ${stable}`);
    const record = manifest.files[fingerprinted];
    invariant(Boolean(record), `Fingerprint target is absent from manifest: ${fingerprinted}`);
    invariant(filenameCarriesDigest(fingerprinted, record.sha256), `Fingerprint target does not match its bytes: ${fingerprinted}`);
  }
}

export function inlineScriptHashes(html) {
  const hashes = new Set();
  for (const match of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/giu)) {
    const [, attributes, source] = match;
    if (/\bsrc\s*=/iu.test(attributes) || source.length === 0) continue;
    hashes.add(`sha256-${sha256(Buffer.from(source, "utf8"), "base64")}`);
  }
  return [...hashes].sort();
}

function htmlCanonicalPath(relativePath, html) {
  for (const match of html.matchAll(/<link\b[^>]*>/giu)) {
    const tag = match[0];
    if (!/\brel\s*=\s*["']canonical["']/iu.test(tag)) continue;
    const href = tag.match(/\bhref\s*=\s*["']([^"']+)["']/iu)?.[1];
    if (!href) continue;
    const parsed = new URL(href, "https://jakh.net");
    invariant(parsed.protocol === "https:" && ["jakh.net", "www.jakh.net"].includes(parsed.hostname), `${relativePath} has an invalid canonical origin`);
    return parsed.pathname;
  }

  if (relativePath === "index.html") return "/";
  if (relativePath.endsWith("/index.html")) return `/${relativePath.slice(0, -"index.html".length)}`;
  return `/${relativePath.slice(0, -".html".length)}`;
}

function physicalUrlPath(relativePath) {
  return `/${normalizeRelativePath(relativePath)}`;
}

function assertSafeGeneratedPath(sourceRoot, target, label) {
  const source = resolve(sourceRoot);
  const destination = resolve(target);
  invariant(destination !== source, `${label} cannot be the source root`);
  invariant(destination !== dirname(source), `${label} cannot be the source parent`);
  invariant(destination !== resolve("/"), `${label} cannot be the filesystem root`);
}

function parseArguments(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    invariant(token.startsWith("--"), `Unexpected argument: ${token}`);
    const name = token.slice(2);
    const value = argv[index + 1];
    invariant(value && !value.startsWith("--"), `Missing value for --${name}`);
    options[name] = value;
    index += 1;
  }
  return options;
}

export async function buildStaticSite({
  sourceRoot = REPOSITORY_ROOT,
  outputDirectory = DEFAULT_OUTPUT_DIRECTORY,
  manifestPath = DEFAULT_MANIFEST_PATH,
  manifestModulePath = DEFAULT_MANIFEST_MODULE_PATH,
  fileList,
} = {}) {
  const source = resolve(sourceRoot);
  const output = resolve(outputDirectory);
  const manifestTarget = resolve(manifestPath);
  const moduleTarget = resolve(manifestModulePath);
  assertSafeGeneratedPath(source, output, "Output directory");
  assertSafeGeneratedPath(source, manifestTarget, "Manifest path");
  assertSafeGeneratedPath(source, moduleTarget, "Manifest module path");

  const selectedFiles = (fileList || trackedDeployableFiles(source))
    .map(normalizeRelativePath)
    .filter(isDeployableFile)
    .sort((left, right) => left.localeCompare(right, "en"));
  invariant(selectedFiles.length > 0, "No deployable tracked files were found");
  invariant(new Set(selectedFiles).size === selectedFiles.length, "Deployable file list contains duplicates");
  invariant(selectedFiles.includes("index.html"), "The static artifact must include index.html");
  invariant(selectedFiles.includes("404.html"), "The static artifact must include 404.html");

  await rm(output, { recursive: true, force: true });
  await mkdir(output, { recursive: true });

  const sourceBytes = new Map();
  for (const relativePath of selectedFiles) {
    const sourcePath = resolve(source, relativePath);
    const sourceRelative = relative(source, sourcePath);
    invariant(sourceRelative && !sourceRelative.startsWith(`..${sep}`) && sourceRelative !== "..", `Source path escapes repository: ${relativePath}`);
    const metadata = await lstat(sourcePath);
    invariant(metadata.isFile() && !metadata.isSymbolicLink(), `Deployable source must be a regular file: ${relativePath}`);
    sourceBytes.set(relativePath, await readFile(sourcePath));
  }

  // Stable source URLs remain available as revalidated compatibility assets.
  // Fingerprinted copies are constructed leaves-first so a changed dependency
  // deterministically changes every parent that embeds its URL.
  const artifactBytes = new Map(sourceBytes);
  const fingerprints = {};
  const addFingerprint = (stableUrlPath, bytes) => {
    const target = contentFingerprintedPath(stableUrlPath, bytes);
    const relativeTarget = urlPathToRelative(target);
    invariant(!artifactBytes.has(relativeTarget), `Generated fingerprint collides with source file: ${target}`);
    artifactBytes.set(relativeTarget, bytes);
    fingerprints[stableUrlPath] = target;
    return target;
  };

  for (const stableUrlPath of [
    "/styles.css",
    "/privacy.css",
    "/battle-mode.js",
    "/battle-mode.css",
    "/search-leaderboard.css",
    "/data/search-index.en.json",
    "/data/search-index.ar.json",
  ]) {
    const bytes = sourceBytes.get(urlPathToRelative(stableUrlPath));
    if (bytes) addFingerprint(stableUrlPath, bytes);
  }

  const searchSource = sourceBytes.get("search-leaderboard.js");
  if (searchSource) {
    const rewritten = rewriteSearchLeaderboard(searchSource.toString("utf8"), fingerprints);
    addFingerprint("/search-leaderboard.js", Buffer.from(rewritten, "utf8"));
  }

  const applicationSource = sourceBytes.get("app.js");
  if (applicationSource) {
    const rewritten = rewriteApplication(applicationSource.toString("utf8"), fingerprints);
    addFingerprint("/app.js", Buffer.from(rewritten, "utf8"));
  }

  for (const relativePath of selectedFiles.filter((value) => value.endsWith(".html"))) {
    const rewritten = rewriteHtmlAssetReferences(
      sourceBytes.get(relativePath).toString("utf8"),
      relativePath,
      fingerprints,
    );
    artifactBytes.set(relativePath, Buffer.from(rewritten, "utf8"));
  }

  let sourceGraphId = artifactGraphDigest(artifactBytes);
  let offlineCacheIdentity = null;
  if (sourceBytes.has("sw.js")) {
    const template = rewriteServiceWorkerTemplate(sourceBytes.get("sw.js").toString("utf8"), fingerprints);
    artifactBytes.set("sw.js", Buffer.from(template, "utf8"));
    sourceGraphId = artifactGraphDigest(artifactBytes);
    offlineCacheIdentity = `sg-${sourceGraphId}`;
    const serviceWorker = template.replace(CACHE_IDENTITY_PLACEHOLDER, offlineCacheIdentity);
    invariant(!serviceWorker.includes(CACHE_IDENTITY_PLACEHOLDER), "Service-worker cache identity placeholder was not resolved");
    artifactBytes.set("sw.js", Buffer.from(serviceWorker, "utf8"));
  }

  const files = {};
  const routes = {};
  const aliases = {};
  const inlineScripts = {};
  let totalBytes = 0;

  for (const [relativePath, bytes] of [...artifactBytes].sort(([left], [right]) => left.localeCompare(right, "en"))) {
    const digest = sha256(bytes);
    const urlPath = physicalUrlPath(relativePath);
    files[urlPath] = { sha256: digest, bytes: bytes.length };
    totalBytes += bytes.length;

    const destination = resolve(output, relativePath);
    invariant(relative(output, destination) && !relative(output, destination).startsWith(`..${sep}`), `Output path escapes artifact: ${relativePath}`);
    await mkdir(dirname(destination), { recursive: true });
    await writeFile(destination, bytes);

    if (relativePath.endsWith(".html")) {
      const html = bytes.toString("utf8");
      const route = relativePath === "404.html" ? "/__404__" : htmlCanonicalPath(relativePath, html);
      invariant(!routes[route], `Multiple HTML files resolve to ${route}: ${routes[route]} and ${urlPath}`);
      routes[route] = urlPath;
      inlineScripts[route] = inlineScriptHashes(html);
      if (relativePath !== "404.html" && route !== urlPath) aliases[urlPath] = route;
    }
  }

  for (const [alias, target] of Object.entries(aliases)) {
    invariant(!aliases[target], `Alias ${alias} points to another alias ${target}`);
    invariant(Boolean(routes[target]), `Alias ${alias} points to an unknown route ${target}`);
  }

  const buildHasher = createHash("sha256");
  for (const [path, record] of Object.entries(files).sort(([left], [right]) => left.localeCompare(right, "en"))) {
    buildHasher.update(path).update("\0").update(record.sha256).update("\0");
  }
  const buildId = buildHasher.digest("hex");
  const manifest = {
    formatVersion: 2,
    service: "jakh-site",
    buildId,
    sourceGraphId,
    offlineCacheIdentity,
    fileCount: Object.keys(files).length,
    totalBytes,
    files,
    fingerprints: Object.fromEntries(
      Object.entries(fingerprints).sort(([left], [right]) => left.localeCompare(right, "en")),
    ),
    routes,
    aliases,
    inlineScripts,
  };
  validateFingerprintManifest(manifest);

  const serialized = `${JSON.stringify(manifest, null, 2)}\n`;
  await mkdir(dirname(manifestTarget), { recursive: true });
  await writeFile(manifestTarget, serialized, "utf8");
  await mkdir(dirname(moduleTarget), { recursive: true });
  await writeFile(moduleTarget, `// Generated by scripts/build-static-site.mjs. Do not edit.\nexport default ${JSON.stringify(manifest)};\n`, "utf8");
  return manifest;
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  const sourceRoot = options.source ? resolve(options.source) : REPOSITORY_ROOT;
  const outputDirectory = options.output ? resolve(options.output) : DEFAULT_OUTPUT_DIRECTORY;
  const manifestPath = options.manifest ? resolve(options.manifest) : DEFAULT_MANIFEST_PATH;
  const manifestModulePath = options.module ? resolve(options.module) : DEFAULT_MANIFEST_MODULE_PATH;
  const manifest = await buildStaticSite({ sourceRoot, outputDirectory, manifestPath, manifestModulePath });
  process.stdout.write(
    `Built ${manifest.fileCount} static files (${manifest.totalBytes} bytes) as ${manifest.buildId}.\n`,
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error) => {
    process.stderr.write(`${error.stack || error.message}\n`);
    process.exitCode = 1;
  });
}
