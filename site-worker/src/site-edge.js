import {
  directRetiredSeoRouteTarget,
  normalizeRetiredSeoRoute,
  RETIRED_SEO_ROUTE_REDIRECTS,
} from "./seo-route-migrations.js";
import {
  arabicTopicPath,
  englishTopicPath,
  movedCardRouteTarget,
  movedCardTopics,
  retiredTopicRedirectPairs,
  retiredTopicRouteTarget,
  retiredTvShowTarget,
} from "./topic-route-migrations.js";
import { legacyPuzzleTarget, isPuzzleStateURL } from "../../puzzle-routes.js";

const APEX_HOST = "riddlearabia.com";
const WWW_HOST = "www.riddlearabia.com";
const MTA_STS_HOSTS = new Set(["mta-sts.riddlearabia.com"]);
const MTA_STS_PATH = "/.well-known/mta-sts.txt";
const HTML_CACHE = "public, max-age=0, must-revalidate";
const MUTABLE_ASSET_CACHE = "public, max-age=3600, must-revalidate";
const MEDIA_CACHE = "public, max-age=86400, stale-while-revalidate=604800";
const REDIRECT_CACHE = "public, max-age=86400";
const RELEASE_METADATA_CACHE = "public, max-age=300, must-revalidate";
const NO_STORE = "no-store";
const QUARANTINE_ROBOTS_POLICY = "noindex, nofollow, noarchive, nosnippet";
const EXPECTED_QUARANTINED_CATEGORIES = Object.freeze([
  "survival",
  "law-middle-east",
  "medical-questions",
  "pharmacy",
  "economics-and-finance",
]);
const MAX_QUARANTINE_PATH_DECODE_PASSES = 3;
const KIDS_DISCOVERY_PARAMETERS = Object.freeze([
  "search", "age", "area", "minutes", "materialGroup", "format", "reading", "adult", "screenFree", "noPrinter",
]);

const RELEASE_METADATA_PATHS = new Set([
  "/manifest.webmanifest",
  "/robots.txt",
  "/sitemap.xml",
  "/sw.js",
  "/.well-known/security.txt",
]);
const ADMIN_DOCUMENT_PATHS = new Set(["/admin", "/admin.html"]);
const ADMIN_RUNTIME_ENVIRONMENT_PATTERN = /^[a-z][a-z0-9-]{0,31}$/u;
const LOOPBACK_ADMIN_API_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);
const ALLOWED_METHODS = "GET, HEAD";

// Build-time compressed copies of HTML pages (scripts/build-static-site.mjs).
// They are internal files: never routable, only chosen for an HTML response.
export const PRECOMPRESSED_DIRECTORY = "/__precompressed/";
const PRECOMPRESSED_EXTENSIONS = Object.freeze({ br: "br", gzip: "gz" });
// Cloudflare overwrites the visitor's Accept-Encoding with its own value and
// keeps the original in request.cf.clientAcceptEncoding
// (https://developers.cloudflare.com/fundamentals/reference/http-headers/#accept-encoding).
// Without that original, one of these values may stand for a visitor that
// sent no Accept-Encoding at all, so it is not treated as consent.
const CLOUDFLARE_ACCEPT_ENCODING_VALUES = new Set(["br,gzip", "gzip,br", "gzip"]);

function invariant(condition, message) {
  if (!condition) throw new Error(message);
}

function isPrimaryHost(hostname) {
  return hostname === APEX_HOST || hostname === WWW_HOST;
}

function isSharedPartyQuizURL(url) {
  return ["/how-well-do-you-know-me", "/ar/games/how-well-do-you-know-me/"].includes(url.pathname)
    && url.searchParams.has("quiz");
}

function isKidsFilterURL(url) {
  return /^\/(?:kids-riddles|ar\/topics\/kids-riddles)(?:\/|$)/u.test(url.pathname)
    && KIDS_DISCOVERY_PARAMETERS.some(name => url.searchParams.has(name));
}

export function isQuarantinedPath(siteManifest, pathname) {
  const categories = siteManifest.publication?.quarantinedCategories || [];
  let normalized = String(pathname || "/").split(/[?#]/u, 1)[0];
  for (let pass = 0; pass < MAX_QUARANTINE_PATH_DECODE_PASSES; pass += 1) {
    let decoded;
    try {
      decoded = decodeURIComponent(normalized);
    } catch {
      return true;
    }
    if (decoded === normalized) break;
    normalized = decoded;
  }
  if (/%[0-9a-f]{2}/iu.test(normalized)) return true;
  if (/[?#\u0000-\u001f\u007f]/u.test(normalized)) return true;
  const segments = [];
  for (const segment of normalized.replaceAll("\\", "/").split("/")) {
    if (!segment || segment === ".") continue;
    if (segment === "..") segments.pop();
    else segments.push(segment);
  }
  normalized = `/${segments.join("/")}`.toLowerCase();
  for (const slug of categories) {
    if (normalized === `/data/${slug}.json` || normalized.startsWith(`/data/${slug}.json/`)) return true;
    if (
      normalized === `/${slug}`
      || normalized === `/${slug}.html`
      || normalized.startsWith(`/${slug}/`)
      || normalized.startsWith(`/${slug}.html/`)
    ) return true;
    if (
      normalized === `/ar/topics/${slug}`
      || normalized === `/ar/topics/${slug}.html`
      || normalized.startsWith(`/ar/topics/${slug}/`)
      || normalized.startsWith(`/ar/topics/${slug}.html/`)
    ) return true;
  }
  return false;
}

function fileExtension(pathname) {
  const filename = pathname.split("/").at(-1) || "";
  const dot = filename.lastIndexOf(".");
  return dot < 0 ? "" : filename.slice(dot).toLowerCase();
}

function isPrecompressedPath(pathname) {
  return String(pathname || "").toLowerCase().startsWith(PRECOMPRESSED_DIRECTORY);
}

function manifestFile(siteManifest, pathname) {
  const physicalPath = siteManifest.routes[pathname] || pathname;
  return {
    path: physicalPath,
    // Compressed copies are only ever chosen for the page they encode.
    record: isPrecompressedPath(physicalPath) ? null : siteManifest.files[physicalPath] || null,
  };
}

function htmlVariants(siteManifest, physicalPath) {
  const settings = siteManifest.htmlPrecompression;
  if (settings?.enabled !== true) return null;
  return settings.variants?.[physicalPath] || null;
}

// The visitor's own Accept-Encoding: request.cf.clientAcceptEncoding when
// Cloudflare replaced the header, otherwise the header itself.
export function visitorAcceptEncoding(request) {
  const header = request.headers.get("accept-encoding") || "";
  const cf = request.cf;
  if (!cf || typeof cf !== "object") return header;
  if (typeof cf.clientAcceptEncoding === "string") return cf.clientAcceptEncoding;
  return CLOUDFLARE_ACCEPT_ENCODING_VALUES.has(header.replace(/\s+/gu, "").toLowerCase()) ? "" : header;
}

// Picks the first of `available` (in preference order) with the highest
// quality the visitor gave it. Only explicitly named codings count: a bare
// `*` does not prove a client can decode brotli or gzip.
export function negotiateHtmlEncoding(acceptEncoding, available) {
  const qualities = new Map();
  for (const entry of String(acceptEncoding || "").split(",")) {
    const [rawName, ...parameters] = entry.split(";");
    let coding = rawName.trim().toLowerCase();
    if (!coding) continue;
    if (coding === "x-gzip") coding = "gzip";
    let quality = 1;
    for (const parameter of parameters) {
      const separator = parameter.indexOf("=");
      if (separator < 0 || parameter.slice(0, separator).trim().toLowerCase() !== "q") continue;
      const value = parameter.slice(separator + 1).trim();
      quality = /^(?:0(?:\.\d{0,3})?|1(?:\.0{0,3})?)$/u.test(value) ? Number(value) : 0;
    }
    // A repeated coding keeps its most cautious quality.
    qualities.set(coding, Math.min(qualities.get(coding) ?? quality, quality));
  }
  let chosen = null;
  let chosenQuality = 0;
  for (const coding of available) {
    const quality = qualities.get(coding) ?? 0;
    if (quality > chosenQuality) {
      chosen = coding;
      chosenQuality = quality;
    }
  }
  return chosen;
}

function varyOnAcceptEncoding(headers) {
  const current = headers.get("vary");
  const names = (current || "").split(",").map((name) => name.trim().toLowerCase());
  if (names.includes("*") || names.includes("accept-encoding")) return;
  headers.set("vary", current ? `${current}, Accept-Encoding` : "Accept-Encoding");
}

export function fingerprintCompatibilitySource(siteManifest, pathname) {
  for (const [stable, current] of Object.entries(siteManifest.fingerprints || {})) {
    if (pathname === current) return null;
    const dot = stable.lastIndexOf(".");
    if (dot < 1) continue;
    const stem = stable.slice(0, dot).replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
    const extension = stable.slice(dot).replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
    if (new RegExp(`^${stem}\\.[a-f0-9]{12,64}${extension}$`, "iu").test(pathname)) {
      return stable;
    }
  }
  return null;
}

function weakEtag(record) {
  return record?.sha256 ? `W/"${record.sha256}"` : null;
}

function requestMatchesEtag(request, etag) {
  if (!etag) return false;
  return (request.headers.get("if-none-match") || "")
    .split(",")
    .map((value) => value.trim())
    .some((value) => value === "*" || value === etag);
}

function hasBuildIdentityInName(pathname, record) {
  if (!record?.sha256) return false;
  const filename = pathname.split("/").at(-1) || "";
  const embedded = filename.match(/\.([a-f0-9]{12,64})(?=\.[^.]+$)/iu)?.[1]?.toLowerCase();
  return Boolean(embedded && record.sha256.toLowerCase().startsWith(embedded));
}

function adminRuntimeApiOrigin(siteManifest) {
  const runtime = siteManifest?.adminRuntime;
  if (!runtime || typeof runtime.apiOrigin !== "string") return null;
  try {
    const apiUrl = new URL(runtime.apiOrigin);
    const pathname = apiUrl.pathname.replace(/\/+$/u, "");
    const isLoopback = LOOPBACK_ADMIN_API_HOSTS.has(apiUrl.hostname.toLowerCase());
    if (
      (apiUrl.protocol !== "https:" && !(apiUrl.protocol === "http:" && isLoopback))
      || apiUrl.username
      || apiUrl.password
      || apiUrl.search
      || apiUrl.hash
      || pathname !== "/api"
    ) return null;
    return apiUrl.origin;
  } catch {
    return null;
  }
}

export function cachePolicy({ pathname, status, contentType, record }) {
  if (status >= 400) return NO_STORE;
  if (status >= 300 && status !== 304) return REDIRECT_CACHE;
  if (ADMIN_DOCUMENT_PATHS.has(pathname)) return NO_STORE;
  if (RELEASE_METADATA_PATHS.has(pathname)) return pathname === "/sw.js" ? HTML_CACHE : RELEASE_METADATA_CACHE;
  if (/^text\/html(?:;|$)/iu.test(contentType || "")) return HTML_CACHE;
  if (hasBuildIdentityInName(pathname, record)) return "public, max-age=31536000, immutable";
  const extension = fileExtension(pathname);
  if ([".css", ".js", ".json", ".map", ".mjs"].includes(extension)) return MUTABLE_ASSET_CACHE;
  if ([".gif", ".ico", ".jpeg", ".jpg", ".png", ".svg", ".webp", ".woff", ".woff2"].includes(extension)) {
    return MEDIA_CACHE;
  }
  return MUTABLE_ASSET_CACHE;
}

function inlineHashesFor(siteManifest, pathname, status) {
  if (status === 404) return siteManifest.inlineScripts["/__404__"] || [];
  return siteManifest.inlineScripts[pathname] || [];
}

export function contentSecurityPolicy(siteManifest, pathname, status) {
  const inlineHashes = inlineHashesFor(siteManifest, pathname, status)
    .map((hash) => `'${hash}'`)
    .join(" ");
  const scriptSources = ["'self'", inlineHashes, "https://www.googletagmanager.com"]
    .filter(Boolean)
    .join(" ");
  const connectSources = [
    "'self'",
    "https://api.riddlearabia.com",
    "wss://api.riddlearabia.com",
    "https://www.google-analytics.com",
    "https://analytics.google.com",
    "https://region1.google-analytics.com",
  ];
  const configuredAdminApiOrigin = ADMIN_DOCUMENT_PATHS.has(pathname)
    ? adminRuntimeApiOrigin(siteManifest)
    : null;
  if (configuredAdminApiOrigin && !connectSources.includes(configuredAdminApiOrigin)) {
    connectSources.push(configuredAdminApiOrigin);
  }
  return [
    "default-src 'self'",
    "base-uri 'none'",
    "object-src 'none'",
    "frame-ancestors 'none'",
    "frame-src 'none'",
    "form-action 'self'",
    `script-src ${scriptSources}`,
    "script-src-attr 'none'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https://www.google-analytics.com https://www.googletagmanager.com",
    "font-src 'self' data:",
    `connect-src ${connectSources.join(" ")}`,
    "manifest-src 'self'",
    "media-src 'self' blob:",
    "worker-src 'self' blob:",
    "upgrade-insecure-requests",
  ].join("; ");
}

function siteResponseHeaders(sourceHeaders, status, {
  siteManifest,
  pathname,
  record = null,
  cacheControl,
  requestUrl,
} = {}) {
  const headers = new Headers(sourceHeaders);
  headers.set("strict-transport-security", "max-age=31536000; includeSubDomains");
  headers.set("content-security-policy", contentSecurityPolicy(siteManifest, pathname, status));
  headers.set("x-content-type-options", "nosniff");
  headers.set("referrer-policy", "strict-origin-when-cross-origin");
  headers.set("permissions-policy", "camera=(), geolocation=(), microphone=(), payment=(), usb=()");
  headers.set("x-frame-options", "DENY");
  headers.set("x-xss-protection", "0");
  headers.set("cross-origin-opener-policy", "same-origin");
  headers.set("origin-agent-cluster", "?1");
  headers.set("x-jakh-site-version", siteManifest.buildId);
  headers.set(
    "cache-control",
    cacheControl || cachePolicy({
      pathname,
      status,
      contentType: headers.get("content-type") || "",
      record,
    }),
  );
  const etag = weakEtag(record);
  // A 304 must repeat the validator of the 200 it confirms (RFC 9110 15.4.5).
  if (etag && ((status >= 200 && status < 300) || status === 304)) headers.set("etag", etag);
  // Query state is playable and shareable, but it is not a separate public
  // search destination. Do not let its headers enter a clean-page offline cache.
  if (requestUrl && (isPuzzleStateURL(requestUrl) || isKidsFilterURL(requestUrl) || isSharedPartyQuizURL(requestUrl))) {
    headers.set("x-robots-tag", "noindex, follow");
    headers.set("cache-control", NO_STORE);
  }
  if (requestUrl && isSharedPartyQuizURL(requestUrl)) headers.set("referrer-policy", "no-referrer");
  // Preserve the reviewed HTML and its hash-based CSP. Cloudflare's automatic
  // analytics/JSD injections cannot execute under this policy and must not add
  // unconsented scripts. This leaves WAF rules enabled; JSD-dependent rules
  // require a separately reviewed nonce integration before they can be used.
  const htmlDocument = /^text\/html(?:;|$)/iu.test(headers.get("content-type") || "")
    || (status === 304 && manifestFile(siteManifest, pathname).path.endsWith(".html"));
  if (htmlDocument) headers.set("cache-control", `${headers.get("cache-control")}, no-transform`);
  if (record && /^\/google[0-9a-f]{16}\.html$/u.test(pathname)) headers.set("x-robots-tag", "noindex");
  return headers;
}

export function applySiteHeaders(response, options = {}) {
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: siteResponseHeaders(response.headers, response.status, options),
  });
}

// index.js adds the Worker version to every response. Set it in place: a new
// Response(body, init) would drop `encodeBody: "manual"`, and the runtime
// would then compress an already-compressed body a second time.
export function withWorkerVersion(response, versionId) {
  if (typeof versionId !== "string") return response;
  try {
    response.headers.set("x-jakh-worker-version", versionId);
    return response;
  } catch {
    // Only a Response taken unchanged from fetch() has immutable headers, and
    // this handler never returns one; keep the old copy as a fallback.
    const headers = new Headers(response.headers);
    headers.set("x-jakh-worker-version", versionId);
    return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
  }
}

// Fetches the stored compressed copy as a plain GET, without the visitor's
// conditional, range or encoding headers. Anything unexpected returns null
// so the caller serves the uncompressed page exactly as before.
async function fetchPrecompressedCopy(env, requestUrl, siteManifest, path) {
  const record = siteManifest.files[path];
  if (!record) return null;
  let asset;
  try {
    asset = await env.ASSETS.fetch(new Request(new URL(path, requestUrl), { method: "GET" }));
  } catch {
    return null;
  }
  const storedEncoding = (asset.headers.get("content-encoding") || "identity").trim().toLowerCase();
  const length = asset.headers.get("content-length");
  if (
    asset.status !== 200
    || !asset.body
    || storedEncoding !== "identity"
    || (length !== null && Number(length) !== record.bytes)
  ) {
    asset.body?.cancel().catch(() => {});
    return null;
  }
  return asset;
}

function errorResponse(siteManifest, pathname, status, message) {
  return applySiteHeaders(new Response(message, {
    status,
    headers: { "content-type": "text/plain; charset=utf-8" },
  }), { siteManifest, pathname, cacheControl: NO_STORE });
}

const HELD_TEXT = "This content is temporarily unavailable.\n";

// A small self-contained bilingual page for people who follow an old link to a
// held topic. No scripts, no assets and no links to any held category.
export function heldContentPage(pathname) {
  const arabic = /^\/ar(?:\/|$)/iu.test(String(pathname || ""));
  const style = "body{margin:0;font-family:system-ui,-apple-system,'Segoe UI',Tahoma,sans-serif;"
    + "background:#fbf6ec;color:#322016;line-height:1.6}main{max-width:36rem;margin:12vh auto;padding:0 1rem}"
    + "h1{font-size:1.5rem;margin:0 0 .5rem}p{margin:.25rem 0 1rem;color:#725846}"
    + "a{color:#94431f;font-weight:600}section+section{margin-top:2rem;padding-top:1.5rem;border-top:1px solid #e6d8c6}";
  const ar = `<section lang="ar" dir="rtl"><h1>هذا المحتوى غير متاح مؤقتًا</h1>`
    + `<p>جرّب موضوعًا آخر من موضوعات ريدل أرابيا.</p>`
    + `<p><a href="/ar/">الصفحة الرئيسية</a> · <a href="/ar/mind-lab/">تصفّح الموضوعات</a></p></section>`;
  const en = `<section lang="en" dir="ltr"><h1>This content is temporarily unavailable.</h1>`
    + `<p>Try another Riddle Arabia topic.</p>`
    + `<p><a href="/">Home</a> · <a href="/mind-lab">Browse topics</a></p></section>`;
  return `<!DOCTYPE html><html lang="${arabic ? "ar" : "en"}" dir="${arabic ? "rtl" : "ltr"}"><head>`
    + `<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">`
    + `<meta name="robots" content="noindex, nofollow"><title>${arabic ? "غير متاح مؤقتًا | ريدل أرابيا" : "Temporarily unavailable | Riddle Arabia"}</title>`
    + `<style>${style}</style></head><body><main>${arabic ? ar + en : en + ar}</main></body></html>\n`;
}

function wantsHeldPage(pathname) {
  const lower = String(pathname || "").toLowerCase();
  return !lower.startsWith("/data/") && !/\.json(?:$|[/?#%])/u.test(lower);
}

function quarantineResponse(siteManifest, pathname, method) {
  const page = wantsHeldPage(pathname);
  const response = applySiteHeaders(new Response(
    method === "HEAD" ? null : (page ? heldContentPage(pathname) : HELD_TEXT),
    {
      status: 410,
      headers: { "content-type": page ? "text/html; charset=utf-8" : "text/plain; charset=utf-8" },
    },
  ), { siteManifest, pathname, cacheControl: NO_STORE });
  response.headers.set("x-robots-tag", QUARANTINE_ROBOTS_POLICY);
  response.headers.set("x-jakh-content-quarantine", "active");
  response.headers.set("clear-site-data", '"cache"');
  return response;
}

function redirectResponse(siteManifest, target) {
  return applySiteHeaders(new Response(null, {
    status: 301,
    headers: { location: target.href },
  }), {
    siteManifest, pathname: target.pathname, cacheControl: REDIRECT_CACHE,
    requestUrl: isSharedPartyQuizURL(target) ? target : null,
  });
}

function retiredSeoPaginationTarget(siteManifest, pathname) {
  const english = pathname.match(/^\/([a-z0-9-]+)\/page\/[1-9]\d*(?:\/index\.html)?\/?$/iu);
  if (english) {
    const target = `/${english[1]}`;
    return siteManifest.routes[target] ? target : null;
  }
  const arabic = pathname.match(/^\/ar\/topics\/([a-z0-9-]+)\/page\/[1-9]\d*(?:\/index\.html)?\/?$/iu);
  if (arabic) {
    const target = `/ar/topics/${arabic[1]}/`;
    return siteManifest.routes[target] ? target : null;
  }
  return null;
}

export function retiredSeoRedirectTarget(siteManifest, pathname) {
  const normalized = normalizeRetiredSeoRoute(pathname);
  return directRetiredSeoRouteTarget(normalized)
    || retiredTopicRouteTarget(normalized)
    || retiredSeoPaginationTarget(siteManifest, normalized);
}

export function canonicalRedirect(siteManifest, requestUrl) {
  if (!isPrimaryHost(requestUrl.hostname)) return null;
  const target = new URL(requestUrl.href);
  let changed = false;
  if (target.hostname === WWW_HOST) {
    target.hostname = APEX_HOST;
    target.port = "";
    changed = true;
  }
  if (isPrimaryHost(target.hostname) && target.protocol !== "https:") {
    target.protocol = "https:";
    target.port = "";
    changed = true;
  }
  const movedCardTarget = movedCardRouteTarget(normalizeRetiredSeoRoute(target.pathname), target.searchParams.get("card"));
  const retiredSeoTarget = movedCardTarget || retiredSeoRedirectTarget(siteManifest, target.pathname);
  if (retiredSeoTarget) {
    target.pathname = retiredSeoTarget;
    changed = true;
  }
  const aliasTarget = siteManifest.aliases[target.pathname];
  if (aliasTarget) {
    target.pathname = aliasTarget;
    changed = true;
  }
  const retiredShowTarget = retiredTvShowTarget(target);
  if (retiredShowTarget) return retiredShowTarget;
  const puzzleTarget = legacyPuzzleTarget(target);
  if (puzzleTarget && siteManifest.routes[puzzleTarget.pathname]) return puzzleTarget;
  return changed ? target : null;
}

export function validateMtaStsPolicy(policy) {
  const fields = new Map();
  for (const rawLine of String(policy).split(/\r?\n/u)) {
    const line = rawLine.trim();
    if (!line) continue;
    const separator = line.indexOf(":");
    if (separator < 1) return false;
    const key = line.slice(0, separator).trim().toLowerCase();
    const value = line.slice(separator + 1).trim();
    if (!fields.has(key)) fields.set(key, []);
    fields.get(key).push(value);
  }
  const version = fields.get("version") || [];
  const mode = fields.get("mode") || [];
  const maxAge = fields.get("max_age") || [];
  if (version.length !== 1 || version[0] !== "STSv1") return false;
  if (mode.length !== 1 || !["none", "testing", "enforce"].includes(mode[0])) return false;
  if (maxAge.length !== 1 || !/^\d+$/u.test(maxAge[0])) return false;
  if (mode[0] !== "none" && !(fields.get("mx") || []).length) return false;
  return true;
}

function mtaStsResponse(siteManifest, env, pathname, mtaStsPolicy) {
  if (pathname !== MTA_STS_PATH || env.MTA_STS_ENABLED !== "true") {
    return errorResponse(siteManifest, pathname, 404, "Not found");
  }
  if (!validateMtaStsPolicy(mtaStsPolicy)) {
    return errorResponse(siteManifest, pathname, 503, "MTA-STS policy is not configured");
  }
  return applySiteHeaders(new Response(mtaStsPolicy.endsWith("\n") ? mtaStsPolicy : `${mtaStsPolicy}\n`, {
    status: 200,
    headers: { "content-type": "text/plain; charset=utf-8" },
  }), {
    siteManifest,
    pathname,
    cacheControl: RELEASE_METADATA_CACHE,
  });
}

function validateManifest(siteManifest) {
  invariant(siteManifest?.service === "jakh-site", "Invalid site manifest service");
  invariant(/^[a-f0-9]{64}$/u.test(siteManifest.buildId), "Invalid site manifest build ID");
  invariant(/^[a-f0-9]{64}$/u.test(siteManifest.sourceGraphId), "Invalid site manifest source graph ID");
  invariant(siteManifest.offlineCacheIdentity === `sg-${siteManifest.sourceGraphId}`, "Invalid offline cache identity");
  invariant(siteManifest.aliases && siteManifest.routes && siteManifest.files && siteManifest.fingerprints, "Incomplete site manifest");
  invariant(adminRuntimeApiOrigin(siteManifest), "Invalid admin API runtime origin");
  invariant(
    ADMIN_RUNTIME_ENVIRONMENT_PATTERN.test(siteManifest.adminRuntime?.environment || ""),
    "Invalid admin runtime environment",
  );
  invariant(siteManifest.publication?.state === "safety-quarantine-active", "Production publication quarantine is not active");
  invariant(/^[a-f0-9]{64}$/u.test(siteManifest.publication.policySha256 || ""), "Invalid publication policy digest");
  invariant(siteManifest.publication.fullQuestions === 3_982, "Invalid full publication corpus total");
  invariant(siteManifest.publication.publicQuestions === 3_704, "Invalid public publication corpus total");
  invariant(siteManifest.publication.quarantinedQuestions === 278, "Invalid quarantined publication total");
  invariant(siteManifest.publication.publicCategories === 48, "Invalid public category total");
  invariant(
    Array.isArray(siteManifest.publication.quarantinedCategories)
      && siteManifest.publication.quarantinedCategories.length === 5
      && new Set(siteManifest.publication.quarantinedCategories).size === 5
      && siteManifest.publication.quarantinedCategories.every((slug) => /^[a-z0-9-]{2,64}$/u.test(slug)),
    "Invalid quarantined category manifest",
  );
  invariant(
    [...siteManifest.publication.quarantinedCategories].sort().join("\0")
      === [...EXPECTED_QUARANTINED_CATEGORIES].sort().join("\0"),
    "Quarantined category manifest does not match the reviewed production policy",
  );
  for (const { from, to } of RETIRED_SEO_ROUTE_REDIRECTS) {
    invariant(
      Boolean(siteManifest.routes[to]),
      `Retired SEO redirect target is absent from release routes: ${from} -> ${to}`,
    );
  }
  for (const { from, to } of retiredTopicRedirectPairs()) {
    invariant(
      Boolean(siteManifest.routes[to]),
      `Retired topic redirect target is absent from release routes: ${from} -> ${to}`,
    );
    invariant(
      !siteManifest.routes[from] && !siteManifest.aliases[from],
      `Retired topic route is still in the release graph: ${from}`,
    );
  }
  for (const slug of movedCardTopics()) {
    for (const route of [englishTopicPath(slug), arabicTopicPath(slug)]) {
      invariant(Boolean(siteManifest.routes[route]), `Moved card topic is absent from release routes: ${route}`);
    }
  }
  for (const path of Object.keys(siteManifest.files)) {
    invariant(!isQuarantinedPath(siteManifest, path), `Quarantined path is present in site files: ${path}`);
  }
  for (const path of [...Object.keys(siteManifest.routes), ...Object.keys(siteManifest.aliases)]) {
    invariant(!isQuarantinedPath(siteManifest, path), `Quarantined path is present in site routes: ${path}`);
  }
  for (const path of [
    ...Object.keys(siteManifest.routes),
    ...Object.values(siteManifest.routes),
    ...Object.keys(siteManifest.aliases),
  ]) {
    invariant(!isPrecompressedPath(path), `Precompressed copy is routable: ${path}`);
  }
  const precompression = siteManifest.htmlPrecompression;
  if (precompression !== undefined) {
    invariant(
      precompression && typeof precompression.enabled === "boolean"
        && precompression.directory === PRECOMPRESSED_DIRECTORY
        && Array.isArray(precompression.encodings)
        && precompression.encodings.every((name) => Object.hasOwn(PRECOMPRESSED_EXTENSIONS, name))
        && precompression.variants && typeof precompression.variants === "object",
      "Invalid HTML precompression settings",
    );
    for (const [source, variants] of Object.entries(precompression.variants)) {
      const record = siteManifest.files[source];
      invariant(precompression.enabled, "Precompressed HTML copies are listed while precompression is off");
      invariant(
        record && source.endsWith(".html") && !isPrecompressedPath(source),
        `Precompressed source is not a deployed HTML file: ${source}`,
      );
      for (const [encoding, target] of Object.entries(variants)) {
        invariant(
          precompression.encodings.includes(encoding)
            && target === `${PRECOMPRESSED_DIRECTORY}${record.sha256}.${PRECOMPRESSED_EXTENSIONS[encoding]}`
            && Boolean(siteManifest.files[target]),
          `Invalid precompressed ${encoding} copy of ${source}`,
        );
      }
    }
  }
  for (const [stable, fingerprinted] of Object.entries(siteManifest.fingerprints)) {
    invariant(Boolean(siteManifest.files[stable]), `Missing stable fingerprint source: ${stable}`);
    const record = siteManifest.files[fingerprinted];
    invariant(Boolean(record), `Missing fingerprinted asset: ${fingerprinted}`);
    invariant(hasBuildIdentityInName(fingerprinted, record), `Fingerprint does not match asset bytes: ${fingerprinted}`);
  }
}

export function createSiteHandler({ siteManifest, mtaStsPolicy }) {
  validateManifest(siteManifest);
  invariant(validateMtaStsPolicy(mtaStsPolicy), "Bundled MTA-STS policy is invalid");

  // Serves a build-time compressed copy of an HTML page when the visitor
  // accepts one. The Worker does no compression and never reads the body:
  // it passes the stored bytes through with `encodeBody: "manual"`. Returns
  // null whenever the uncompressed page should be served instead.
  async function precompressedHtml(request, env, url, physicalPath, status, policy) {
    if (request.method.toUpperCase() !== "GET" || request.headers.has("range")) return null;
    const variants = htmlVariants(siteManifest, physicalPath);
    if (!variants) return null;
    const encoding = negotiateHtmlEncoding(
      visitorAcceptEncoding(request),
      siteManifest.htmlPrecompression.encodings.filter((name) => variants[name]),
    );
    if (!encoding) return null;
    const asset = await fetchPrecompressedCopy(env, url, siteManifest, variants[encoding]);
    if (!asset) return null;
    // Start from clean headers: the stored file's type, length and ETag
    // describe the compressed file, not the page.
    const headers = siteResponseHeaders({ "content-type": "text/html; charset=utf-8" }, status, policy);
    headers.set("content-encoding", encoding);
    varyOnAcceptEncoding(headers);
    return new Response(asset.body, { status, headers, encodeBody: "manual" });
  }

  async function notFoundPage(request, env, url) {
    const policy = { siteManifest, pathname: url.pathname, record: siteManifest.files["/404.html"] };
    const encoded = await precompressedHtml(request, env, url, "/404.html", 404, policy);
    if (encoded) return encoded;
    const asset = await env.ASSETS.fetch(new Request(new URL("/404.html", url), request));
    const response = applySiteHeaders(new Response(asset.body, {
      status: 404,
      headers: asset.headers,
    }), policy);
    if (htmlVariants(siteManifest, "/404.html")) varyOnAcceptEncoding(response.headers);
    return response;
  }

  return {
    async fetch(request, env) {
      const url = new URL(request.url);
      const method = request.method.toUpperCase();
      if (!new Set(["GET", "HEAD"]).has(method)) {
        const notAllowed = errorResponse(siteManifest, url.pathname, 405, "Method not allowed");
        notAllowed.headers.set("allow", ALLOWED_METHODS);
        return notAllowed;
      }
      if (MTA_STS_HOSTS.has(url.hostname)) {
        return mtaStsResponse(siteManifest, env, url.pathname, mtaStsPolicy);
      }
      if (!isPrimaryHost(url.hostname)) {
        return errorResponse(siteManifest, url.pathname, 404, "Not found");
      }
      if (isQuarantinedPath(siteManifest, url.pathname)) {
        return quarantineResponse(siteManifest, url.pathname, method);
      }
      const redirect = canonicalRedirect(siteManifest, url);
      if (redirect) return redirectResponse(siteManifest, redirect);

      if (url.pathname === "/404.html" || url.pathname === "/404") {
        return notFoundPage(request, env, url);
      }

      const resolved = manifestFile(siteManifest, url.pathname);
      const compatibilitySource = resolved.record
        ? null
        : fingerprintCompatibilitySource(siteManifest, url.pathname);
      const served = compatibilitySource
        ? manifestFile(siteManifest, compatibilitySource)
        : resolved;
      if (!served.record) {
        try {
          return await notFoundPage(request, env, url);
        } catch {
          return errorResponse(siteManifest, url.pathname, 503, "Static site temporarily unavailable");
        }
      }
      const etag = weakEtag(served.record);
      // Compressed copies exist only for HTML pages, never for the stable
      // compatibility fallbacks of fingerprinted scripts and styles.
      const hasVariants = !compatibilitySource && Boolean(htmlVariants(siteManifest, served.path));
      if (requestMatchesEtag(request, etag)) {
        const contentType = served.path.endsWith(".html")
          ? "text/html; charset=utf-8"
          : "";
        const conditional = applySiteHeaders(new Response(null, { status: 304 }), {
          siteManifest,
          pathname: url.pathname,
          record: served.record,
          requestUrl: url,
          cacheControl: compatibilitySource ? NO_STORE : cachePolicy({
            pathname: served.path,
            status: 304,
            contentType,
            record: served.record,
          }),
        });
        if (compatibilitySource) conditional.headers.set("x-jakh-compatibility-fallback", compatibilitySource);
        // The weak ETag is shared by the identity and compressed forms; a 304
        // repeats the Vary of the 200 it revalidates.
        if (hasVariants) varyOnAcceptEncoding(conditional.headers);
        return conditional;
      }

      try {
        const policy = {
          siteManifest,
          pathname: url.pathname,
          record: served.record,
          requestUrl: url,
          cacheControl: compatibilitySource ? NO_STORE : undefined,
        };
        if (hasVariants) {
          const encoded = await precompressedHtml(request, env, url, served.path, 200, policy);
          if (encoded) return encoded;
        }
        // Always ask the asset binding for the exact manifest file. This keeps
        // its HTML/path normalization from turning an unreviewed request alias
        // into a deployed file after the quarantine check has already run.
        const assetRequest = new Request(new URL(served.path, url), request);
        const asset = await env.ASSETS.fetch(assetRequest);
        const response = method === "HEAD"
          ? new Response(null, { status: asset.status, statusText: asset.statusText, headers: asset.headers })
          : asset;
        const withPolicy = applySiteHeaders(response, policy);
        if (compatibilitySource) withPolicy.headers.set("x-jakh-compatibility-fallback", compatibilitySource);
        if (hasVariants) varyOnAcceptEncoding(withPolicy.headers);
        return withPolicy;
      } catch {
        return errorResponse(siteManifest, url.pathname, 503, "Static site temporarily unavailable");
      }
    },
  };
}
