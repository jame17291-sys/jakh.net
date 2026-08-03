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

import {
  isQuarantinedArtifactPath,
  isQuarantinedRequestPath,
  loadProductionQuarantine,
  publicCardIndexProjection,
  publicCatalogProjection,
  publicSearchArtifacts,
} from "./publication-quarantine.mjs";

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

function hrefPathFromAnchor(anchor) {
  const href = anchor.match(/\bhref\s*=\s*["']([^"']+)["']/iu)?.[1];
  if (!href) return null;
  try {
    return new URL(href, "https://jakh.net").pathname;
  } catch {
    return null;
  }
}

function removeQuarantinedAnchors(html, categorySlugs) {
  return html.replace(/<a\b[^>]*>[\s\S]*?<\/a\s*>/giu, (anchor) => {
    const pathname = hrefPathFromAnchor(anchor);
    return pathname && isQuarantinedRequestPath(pathname, categorySlugs) ? "" : anchor;
  });
}

function removeQuarantinedSitemapEntries(xml, categorySlugs) {
  return xml.replace(/\s*<url>[\s\S]*?<\/url>/gu, (entry) => {
    const location = entry.match(/<loc>([^<]+)<\/loc>/u)?.[1];
    if (!location) return entry;
    try {
      return isQuarantinedRequestPath(new URL(location).pathname, categorySlugs) ? "" : entry;
    } catch {
      return entry;
    }
  });
}

function rewritePublishedClaimValue(source, {
  fullCategories,
  fullQuestions,
  publicCategories,
  publicQuestions,
}) {
  const fullQuestionsFormatted = Number(fullQuestions).toLocaleString("en-US");
  const publicQuestionsFormatted = Number(publicQuestions).toLocaleString("en-US");
  let rewritten = String(source)
    .replaceAll(fullQuestionsFormatted, publicQuestionsFormatted)
    .replace(new RegExp(`\\b${fullQuestions}\\b`, "gu"), String(publicQuestions))
    .replace(
      new RegExp(`\\b${fullCategories}(?=\\s+(?:(?:clear|quiz)\\s+)?(?:topics|categories)\\b|(?=-topic\\b))`, "giu"),
      String(publicCategories),
    )
    .replace(
      new RegExp(`${fullCategories}(?=\\s+(?:موضوع(?:اً|ًا)?|فئة)(?![\\p{L}\\p{M}\\p{N}]))`, "gu"),
      String(publicCategories),
    )
    .replaceAll("3,500+", "3,200+");
  rewritten = rewritten.replace(
    /(<[^>]+\bid=["']badgeCategories2?["'][^>]*>)\s*\d[\d,]*\s*(<\/[^>]+>)/giu,
    `$1${publicCategories}$2`,
  );
  return rewritten;
}

const PUBLIC_CLAIM_KEYS = Object.freeze([
  "aboutIntro",
  "collectionsIntro",
  "description",
  "globalSearchPlaceholder",
  "metaDescription",
  "metaImageAlt",
  "mindHeroEyebrow",
  "name",
  "portalMindDesc",
  "portalMindStat",
  "socialImageAlt",
]);
const PUBLIC_TEXT_I18N_KEYS = new Set([
  "aboutIntro",
  "collectionsIntro",
  "mindHeroEyebrow",
  "portalMindDesc",
  "portalMindStat",
]);
const PUBLIC_TEXT_IDS = new Set([
  "badgeCategories",
  "badgeCategories2",
  "badgeQuestions",
  "directoryResultsLabel",
]);

function rewriteKnownScriptClaims(source, claimContext) {
  const keys = PUBLIC_CLAIM_KEYS.join("|");
  return String(source).replace(
    new RegExp(`((?:["']?)(?:${keys})(?:["']?)\\s*:\\s*)(["'])([^\\r\\n]*?)\\2`, "gu"),
    (match, prefix, quote, value) => `${prefix}${quote}${rewritePublishedClaimValue(value, claimContext)}${quote}`,
  );
}

export function rewriteKnownHtmlClaims(html, claimContext) {
  let rewritten = String(html)
    .replace(/<meta\b[^>]*>/giu, (tag) => (
      /\b(?:name|property)=["'](?:description|og:(?:description|image:alt|title)|twitter:(?:description|image:alt|title))["']/iu.test(tag)
        ? rewritePublishedClaimValue(tag, claimContext)
        : tag
    ))
    .replace(/(<title\b[^>]*>)([^<]*)(<\/title>)/giu, (_match, open, value, close) => (
      `${open}${rewritePublishedClaimValue(value, claimContext)}${close}`
    ))
    .replace(/<([a-z][a-z0-9-]*)\b([^>]*)>([^<]*)<\/\1>/giu, (match, tag, attributes, value) => {
      const i18nKey = attributes.match(/\bdata-i18n=["']([^"']+)["']/iu)?.[1];
      const id = attributes.match(/\bid=["']([^"']+)["']/iu)?.[1];
      if (!PUBLIC_TEXT_I18N_KEYS.has(i18nKey) && !PUBLIC_TEXT_IDS.has(id)) return match;
      let publishedValue = rewritePublishedClaimValue(value, claimContext);
      if (id === "badgeCategories") {
        publishedValue = String(claimContext.publicCategories);
      } else if (id === "badgeQuestions") {
        publishedValue = Number(claimContext.publicQuestions).toLocaleString("en-US");
      }
      return `<${tag}${attributes}>${publishedValue}</${tag}>`;
    });
  rewritten = rewriteKnownScriptClaims(rewritten, claimContext);
  return rewritten;
}

function rewriteWebManifestClaims(source, claimContext) {
  const manifest = JSON.parse(String(source));
  for (const key of ["name", "short_name", "description"]) {
    if (typeof manifest[key] === "string") manifest[key] = rewritePublishedClaimValue(manifest[key], claimContext);
  }
  return `${JSON.stringify(manifest, null, 2)}\n`;
}

function escapeProjectedHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function rewritePublishedSectionTotals(html, publicCatalog) {
  const isArabic = /<html\b[^>]*\blang=["']ar["']/iu.test(html);
  const language = isArabic ? "ar" : "en";
  const categoriesBySlug = new Map(
    (publicCatalog.categories || []).map((category) => [category.slug, category]),
  );
  const totalCategories = (publicCatalog.categories || []).length;
  let rewritten = html;
  const tabCount = (count) => isArabic ? `${count} موضوعًا` : `${count} topics`;
  const sectionCount = (count, questions) => isArabic
    ? `${count} موضوعًا · ${questions.toLocaleString("en-US")} سؤال`
    : `${count} topics · ${questions.toLocaleString("en-US")} questions`;

  const replaceTab = (key, count) => {
    const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
    const pattern = new RegExp(
      `(<button\\b[^>]*\\bdata-cluster=["']${escapedKey}["'][^>]*>[\\s\\S]*?<span\\b[^>]*\\bclass=["'][^"']*\\bml-cluster-tab-count\\b[^"']*["'][^>]*>)[^<]*(<\\/span>)`,
      "iu",
    );
    rewritten = rewritten.replace(pattern, `$1${tabCount(count)}$2`);
  };
  replaceTab("all", totalCategories);

  for (const section of publicCatalog.sections || []) {
    const members = (section.members || []).map((slug) => categoriesBySlug.get(slug)).filter(Boolean);
    const questions = members.reduce((total, category) => total + Number(category.count || 0), 0);
    replaceTab(section.key, members.length);
    const escapedKey = section.key.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
    const sectionPattern = new RegExp(
      `(<section\\b[^>]*\\bid=["']section-${escapedKey}["'][^>]*>[\\s\\S]*?<div><h3>)[\\s\\S]*?(<\\/h3><p>)[\\s\\S]*?(<\\/p><\\/div>[\\s\\S]*?<p\\b[^>]*\\bclass=["'][^"']*\\bdirectory-section-count\\b[^"']*["'][^>]*>)[^<]*(<\\/p>)`,
      "iu",
    );
    rewritten = rewritten.replace(
      sectionPattern,
      `$1${escapeProjectedHtml(section.title?.[language] || section.title?.en || section.key)}`
      + `$2${escapeProjectedHtml(section.description?.[language] || section.description?.en || "")}`
      + `$3${sectionCount(members.length, questions)}$4`,
    );
  }
  return rewritten;
}

function applyPublicProjection(sourceBytes, { catalog, quarantine, sourceRoot }) {
  const publicCatalog = publicCatalogProjection(catalog, quarantine);
  const fullQuestions = Number(catalog.site?.totalQuestions || 0);
  const fullCategories = (catalog.categories || []).length;
  const publicQuestions = Number(publicCatalog.site?.totalQuestions || 0);
  const publicCategories = (publicCatalog.categories || []).length;

  invariant(fullQuestions > publicQuestions, "production quarantine did not reduce the public corpus");
  invariant(fullCategories > publicCategories, "production quarantine did not reduce public categories");
  invariant(fullQuestions - publicQuestions === quarantine.manifest.totalCards, "public corpus total does not match quarantine");
  sourceBytes.set("data/catalog.json", Buffer.from(`${JSON.stringify(publicCatalog, null, 2)}\n`, "utf8"));

  const cardIndexBytes = sourceBytes.get("data/card-index.json");
  invariant(cardIndexBytes, "public card index is missing");
  const cardIndex = JSON.parse(cardIndexBytes.toString("utf8"));
  const publicCardIndex = publicCardIndexProjection(cardIndex, quarantine);
  invariant(
    Object.keys(cardIndex).length - Object.keys(publicCardIndex).length === quarantine.manifest.totalCards,
    "public card-index quarantine total is inconsistent",
  );
  sourceBytes.set("data/card-index.json", Buffer.from(`${JSON.stringify(publicCardIndex)}\n`, "utf8"));

  for (const [relativePath, serialized] of publicSearchArtifacts({
    catalog,
    root: sourceRoot,
    quarantine,
  })) {
    invariant(sourceBytes.has(relativePath), `public search artifact source is missing: ${relativePath}`);
    sourceBytes.set(relativePath, Buffer.from(serialized, "utf8"));
  }

  const claimContext = { fullCategories, fullQuestions, publicCategories, publicQuestions };
  for (const [relativePath, bytes] of sourceBytes) {
    if (relativePath.endsWith(".html")) {
      let html = removeQuarantinedAnchors(bytes.toString("utf8"), quarantine.categorySlugs);
      html = rewriteKnownHtmlClaims(html, claimContext);
      html = rewritePublishedSectionTotals(html, publicCatalog);
      sourceBytes.set(relativePath, Buffer.from(html, "utf8"));
    } else if (relativePath.endsWith(".js")) {
      const script = bytes.toString("utf8");
      sourceBytes.set(
        relativePath,
        Buffer.from(rewriteKnownScriptClaims(script, claimContext), "utf8"),
      );
    } else if (relativePath.endsWith(".webmanifest")) {
      sourceBytes.set(relativePath, Buffer.from(rewriteWebManifestClaims(bytes.toString("utf8"), claimContext), "utf8"));
    } else if (relativePath === "sitemap.xml") {
      const sitemap = removeQuarantinedSitemapEntries(bytes.toString("utf8"), quarantine.categorySlugs);
      sourceBytes.set(relativePath, Buffer.from(sitemap, "utf8"));
    }
  }
  return { publicCatalog, publicCategories, publicQuestions };
}

export function assertPublicProjection(artifactBytes, { publication, quarantine }) {
  const forbiddenIds = [...quarantine.cardIds];
  const textExtensions = new Set([".css", ".html", ".js", ".json", ".map", ".mjs", ".svg", ".txt", ".webmanifest", ".xml"]);
  const htmlEscape = (value) => value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
  const forbiddenTextVariants = new Set();
  for (const fragment of quarantine.sensitiveTextFragments) {
    const normalized = fragment.normalize("NFC");
    forbiddenTextVariants.add(normalized);
    forbiddenTextVariants.add(JSON.stringify(normalized).slice(1, -1));
    forbiddenTextVariants.add(htmlEscape(normalized));
    forbiddenTextVariants.add(encodeURIComponent(normalized));
  }
  const forbiddenTextPattern = new RegExp(
    [...forbiddenTextVariants]
      .sort((left, right) => right.length - left.length)
      .map((value) => value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&"))
      .join("|"),
    "u",
  );
  for (const [relativePath, bytes] of artifactBytes) {
    invariant(!isQuarantinedArtifactPath(relativePath, quarantine), `quarantined artifact path was emitted: ${relativePath}`);
    const extension = extname(relativePath).toLowerCase();
    if (!textExtensions.has(extension)) continue;
    const source = bytes.toString("utf8").normalize("NFC");
    invariant(
      !forbiddenTextPattern.test(source),
      `held question, answer, or advice text leaked into ${relativePath}`,
    );
    for (const match of source.matchAll(/\/?assets\/[A-Za-z0-9._/-]+/gu)) {
      const assetPath = match[0].replace(/^\//u, "");
      invariant(
        !isQuarantinedArtifactPath(assetPath, quarantine),
        `quarantined asset ${assetPath} leaked into ${relativePath}`,
      );
    }
    for (const cardId of forbiddenIds) {
      invariant(!source.includes(cardId), `quarantined card ${cardId} leaked into ${relativePath}`);
    }
    if (relativePath.endsWith(".html") || relativePath === "sitemap.xml") {
      for (const slug of quarantine.categorySlugs) {
        invariant(
          !new RegExp(`(?:href|content|item|loc)=["']?(?:https://jakh\\.net)?/(?:ar/topics/)?${slug}(?:[/?#."'<]|$)`, "iu").test(source),
          `quarantined route ${slug} leaked into ${relativePath}`,
        );
      }
    }
    if (relativePath === "sitemap.xml") {
      for (const match of source.matchAll(/<loc>([^<]+)<\/loc>/gu)) {
        const location = new URL(match[1]);
        invariant(
          !isQuarantinedRequestPath(location.pathname, quarantine.categorySlugs),
          `quarantined sitemap URL leaked into ${relativePath}: ${location.href}`,
        );
      }
    }
    if ([".html", ".js", ".webmanifest"].includes(extension)) {
      invariant(!source.includes("3,553"), `retired public count 3,553 leaked into ${relativePath}`);
      invariant(!/\b3553\b/u.test(source), `retired public count 3553 leaked into ${relativePath}`);
      invariant(!source.includes("3,500+"), `retired public approximation 3,500+ leaked into ${relativePath}`);
      invariant(
        !/\b56\s+(?:(?:clear|quiz)\s+)?(?:topics|categories)\b|\b56-topic\b|56\s+(?:موضوع(?:اً|ًا)?|فئة)(?![\p{L}\p{M}\p{N}])/iu.test(source),
        `retired public category count 56 leaked into ${relativePath}`,
      );
    }
    if (relativePath.endsWith("privacy.html") || relativePath.endsWith("privacy/index.html")) {
      invariant(!/GitHub Pages serves the public website|تعرض GitHub Pages الموقع العام/iu.test(source), `retired hosting claim leaked into ${relativePath}`);
    }
  }
  invariant(publication.publicCategories === 51, `public category contract changed from 51 to ${publication.publicCategories}`);
  invariant(publication.publicQuestions === 3_275, `public question contract changed from 3275 to ${publication.publicQuestions}`);
  invariant(quarantine.manifest.totalCards === 278, "production quarantine contract changed from 278 cards");
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

  let selectedFiles = (fileList || trackedDeployableFiles(source))
    .map(normalizeRelativePath)
    .filter(isDeployableFile)
    .sort((left, right) => left.localeCompare(right, "en"));
  invariant(selectedFiles.length > 0, "No deployable tracked files were found");
  invariant(new Set(selectedFiles).size === selectedFiles.length, "Deployable file list contains duplicates");
  invariant(selectedFiles.includes("index.html"), "The static artifact must include index.html");
  invariant(selectedFiles.includes("404.html"), "The static artifact must include 404.html");

  let quarantine = null;
  if (selectedFiles.includes("data/catalog.json")) {
    quarantine = loadProductionQuarantine(source);
    selectedFiles = selectedFiles.filter((relativePath) => (
      !isQuarantinedArtifactPath(relativePath, quarantine)
    ));
  }

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

  const publication = quarantine
    ? applyPublicProjection(sourceBytes, {
      catalog: JSON.parse((await readFile(resolve(source, "data/catalog.json"))).toString("utf8")),
      quarantine,
      sourceRoot: source,
    })
    : null;

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

  if (quarantine && publication) {
    assertPublicProjection(artifactBytes, { publication, quarantine });
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

  // Arabic pages use directory canonicals, but older links may use the
  // equivalent `.html` spelling. Declare those spellings explicitly so the
  // Worker can normalize them before the static-assets binding sees them.
  for (const route of Object.keys(routes)) {
    if (!route.startsWith("/ar/") || route === "/ar/" || !route.endsWith("/")) continue;
    const alias = `${route.slice(0, -1)}.html`;
    invariant(!files[alias] && !routes[alias] && !aliases[alias], `Arabic HTML alias collides with the release graph: ${alias}`);
    aliases[alias] = route;
  }

  for (const [alias, target] of Object.entries(aliases)) {
    invariant(!aliases[target], `Alias ${alias} points to another alias ${target}`);
    invariant(Boolean(routes[target]), `Alias ${alias} points to an unknown route ${target}`);
  }

  const buildHasher = createHash("sha256");
  if (quarantine) {
    buildHasher.update("production-publication-policy\0").update(quarantine.policySha256).update("\0");
  }
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
    ...(quarantine && publication ? {
      publication: {
        state: "safety-quarantine-active",
        policySha256: quarantine.policySha256,
        fullQuestions: publication.publicQuestions + quarantine.manifest.totalCards,
        publicQuestions: publication.publicQuestions,
        quarantinedQuestions: quarantine.manifest.totalCards,
        publicCategories: publication.publicCategories,
        quarantinedCategories: [...quarantine.categorySlugs],
      },
    } : {}),
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
