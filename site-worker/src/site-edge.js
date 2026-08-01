const APEX_HOST = "jakh.net";
const WWW_HOST = "www.jakh.net";
const MTA_STS_HOST = "mta-sts.jakh.net";
const MTA_STS_PATH = "/.well-known/mta-sts.txt";
const HTML_CACHE = "public, max-age=0, must-revalidate";
const MUTABLE_ASSET_CACHE = "public, max-age=3600, must-revalidate";
const MEDIA_CACHE = "public, max-age=86400, stale-while-revalidate=604800";
const REDIRECT_CACHE = "public, max-age=86400";
const RELEASE_METADATA_CACHE = "public, max-age=300, must-revalidate";
const NO_STORE = "no-store";

const RELEASE_METADATA_PATHS = new Set([
  "/manifest.webmanifest",
  "/robots.txt",
  "/sitemap.xml",
  "/sw.js",
  "/.well-known/security.txt",
]);

function invariant(condition, message) {
  if (!condition) throw new Error(message);
}

function isProductionHost(hostname) {
  return hostname === APEX_HOST || hostname === WWW_HOST;
}

function fileExtension(pathname) {
  const filename = pathname.split("/").at(-1) || "";
  const dot = filename.lastIndexOf(".");
  return dot < 0 ? "" : filename.slice(dot).toLowerCase();
}

function manifestFile(siteManifest, pathname) {
  const physicalPath = siteManifest.routes[pathname] || pathname;
  return {
    path: physicalPath,
    record: siteManifest.files[physicalPath] || null,
  };
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

export function cachePolicy({ pathname, status, contentType, record }) {
  if (status >= 400) return NO_STORE;
  if (status >= 300 && status !== 304) return REDIRECT_CACHE;
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
    "connect-src 'self' https://api.jakh.net wss://api.jakh.net https://www.google-analytics.com https://analytics.google.com https://region1.google-analytics.com",
    "manifest-src 'self'",
    "media-src 'self' blob:",
    "worker-src 'self' blob:",
    "upgrade-insecure-requests",
  ].join("; ");
}

export function applySiteHeaders(response, {
  siteManifest,
  pathname,
  record = null,
  cacheControl,
} = {}) {
  const headers = new Headers(response.headers);
  headers.set("strict-transport-security", "max-age=31536000; includeSubDomains");
  headers.set("content-security-policy", contentSecurityPolicy(siteManifest, pathname, response.status));
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
      status: response.status,
      contentType: headers.get("content-type") || "",
      record,
    }),
  );
  const etag = weakEtag(record);
  if (etag && response.status >= 200 && response.status < 300) headers.set("etag", etag);
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function errorResponse(siteManifest, pathname, status, message) {
  return applySiteHeaders(new Response(message, {
    status,
    headers: { "content-type": "text/plain; charset=utf-8" },
  }), { siteManifest, pathname, cacheControl: NO_STORE });
}

function redirectResponse(siteManifest, target) {
  return applySiteHeaders(new Response(null, {
    status: 301,
    headers: { location: target.href },
  }), { siteManifest, pathname: target.pathname, cacheControl: REDIRECT_CACHE });
}

export function canonicalRedirect(siteManifest, requestUrl) {
  const target = new URL(requestUrl.href);
  let changed = false;
  if (target.hostname === WWW_HOST) {
    target.hostname = APEX_HOST;
    target.port = "";
    changed = true;
  }
  if (isProductionHost(target.hostname) && target.protocol !== "https:") {
    target.protocol = "https:";
    target.port = "";
    changed = true;
  }
  const aliasTarget = siteManifest.aliases[target.pathname];
  if (aliasTarget) {
    target.pathname = aliasTarget;
    changed = true;
  }
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
  return {
    async fetch(request, env) {
      const url = new URL(request.url);
      if (!new Set(["GET", "HEAD"]).has(request.method.toUpperCase())) {
        return errorResponse(siteManifest, url.pathname, 405, "Method not allowed");
      }
      if (url.hostname === MTA_STS_HOST) {
        return mtaStsResponse(siteManifest, env, url.pathname, mtaStsPolicy);
      }
      const redirect = canonicalRedirect(siteManifest, url);
      if (redirect) return redirectResponse(siteManifest, redirect);

      if (url.pathname === "/404.html" || url.pathname === "/404") {
        const assetRequest = new Request(new URL("/404.html", url), request);
        const asset = await env.ASSETS.fetch(assetRequest);
        return applySiteHeaders(new Response(asset.body, {
          status: 404,
          headers: asset.headers,
        }), { siteManifest, pathname: url.pathname, record: siteManifest.files["/404.html"] });
      }

      const resolved = manifestFile(siteManifest, url.pathname);
      const compatibilitySource = resolved.record
        ? null
        : fingerprintCompatibilitySource(siteManifest, url.pathname);
      const served = compatibilitySource
        ? manifestFile(siteManifest, compatibilitySource)
        : resolved;
      const etag = weakEtag(served.record);
      if (requestMatchesEtag(request, etag)) {
        const contentType = served.path.endsWith(".html")
          ? "text/html; charset=utf-8"
          : "";
        const conditional = applySiteHeaders(new Response(null, { status: 304 }), {
          siteManifest,
          pathname: url.pathname,
          record: served.record,
          cacheControl: compatibilitySource ? NO_STORE : cachePolicy({
            pathname: served.path,
            status: 304,
            contentType,
            record: served.record,
          }),
        });
        if (compatibilitySource) conditional.headers.set("x-jakh-compatibility-fallback", compatibilitySource);
        return conditional;
      }

      try {
        const assetRequest = compatibilitySource
          ? new Request(new URL(compatibilitySource, url), request)
          : request;
        const asset = await env.ASSETS.fetch(assetRequest);
        const response = request.method.toUpperCase() === "HEAD"
          ? new Response(null, { status: asset.status, statusText: asset.statusText, headers: asset.headers })
          : asset;
        const withPolicy = applySiteHeaders(response, {
          siteManifest,
          pathname: url.pathname,
          record: served.record,
          cacheControl: compatibilitySource ? NO_STORE : undefined,
        });
        if (compatibilitySource) withPolicy.headers.set("x-jakh-compatibility-fallback", compatibilitySource);
        return withPolicy;
      } catch {
        return errorResponse(siteManifest, url.pathname, 503, "Static site temporarily unavailable");
      }
    },
  };
}
