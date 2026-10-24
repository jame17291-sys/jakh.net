import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";
import { gunzipSync } from "node:zlib";

import { inlineScriptHashes } from "../../scripts/build-static-site.mjs";
import { acceptsGzip, createSiteHandler } from "../src/site-edge.js";

const repositoryRoot = resolve(import.meta.dirname, "../..");
const distRoot = resolve(repositoryRoot, "site-worker/dist");
const siteManifest = JSON.parse(await readFile(resolve(repositoryRoot, "site-worker/generated/site-manifest.json"), "utf8"));
const mtaStsPolicy = await readFile(resolve(repositoryRoot, "site-worker/assets/mta-sts.txt"), "utf8");
const handler = createSiteHandler({ siteManifest, mtaStsPolicy });
const ORIGIN = "https://riddlearabia.com";
const BROWSER_ACCEPT_ENCODING = "gzip, deflate, br, zstd";

function contentType(pathname) {
  if (pathname.endsWith(".html")) return "text/html; charset=utf-8";
  if (pathname.endsWith(".js")) return "text/javascript; charset=utf-8";
  if (pathname.endsWith(".css")) return "text/css; charset=utf-8";
  if (pathname.endsWith(".json")) return "application/json";
  return "application/octet-stream";
}

// Serve the exact built bytes the way the static-assets binding does: an
// identity body with its own length.
function environment({ encoding } = {}) {
  const requests = [];
  return {
    requests,
    MTA_STS_ENABLED: "false",
    ASSETS: {
      async fetch(request) {
        requests.push(request);
        const pathname = new URL(request.url).pathname;
        const bytes = await readFile(resolve(distRoot, pathname.slice(1)));
        const headers = { "content-type": contentType(pathname), "content-length": String(bytes.length) };
        if (encoding) headers["content-encoding"] = encoding;
        return new Response(bytes, { status: 200, headers });
      },
    },
  };
}

function request(pathname, { method = "GET", acceptEncoding, cf, headers = {} } = {}) {
  const value = new Request(`${ORIGIN}${pathname}`, {
    method,
    headers: { ...(acceptEncoding === undefined ? {} : { "accept-encoding": acceptEncoding }), ...headers },
  });
  if (cf) Object.defineProperty(value, "cf", { value: cf });
  return value;
}

function varies(response) {
  return (response.headers.get("vary") || "").split(",").map((name) => name.trim().toLowerCase()).includes("accept-encoding");
}

function cspScriptHashes(response) {
  const directive = response.headers.get("content-security-policy").split(";").find((part) => part.trim().startsWith("script-src "));
  return [...directive.matchAll(/'(sha256-[^']+)'/gu)].map(([, hash]) => hash).sort();
}

async function builtBytes(route) {
  return readFile(resolve(distRoot, siteManifest.routes[route].slice(1)));
}

test("Accept-Encoding parsing honours q-values, x-gzip and wildcards", () => {
  for (const value of ["gzip", "GZIP", "br, gzip", "gzip;q=0.5", "x-gzip", "*", "br;q=1, *;q=0.1", "deflate, gzip ; q=1.0", BROWSER_ACCEPT_ENCODING]) {
    assert.equal(acceptsGzip(value), true, value);
  }
  for (const value of ["", null, undefined, "identity", "br", "deflate, br", "gzip;q=0", "gzip;q=0.000", "*;q=0", "gzip;q=0, *", "gzip;q=bad", "br, *;q=0"]) {
    assert.equal(acceptsGzip(value), false, String(value));
  }
});

test("large HTML is gzip-compressed for browsers while keeping no-transform, ETag and CSP", async () => {
  const route = "/ar/alghaz/";
  const original = await builtBytes(route);
  const response = await handler.fetch(request(route, { acceptEncoding: BROWSER_ACCEPT_ENCODING }), environment());
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("content-encoding"), "gzip");
  assert.equal(response.headers.get("content-length"), null, "a stale identity length must not describe the gzip body");
  assert.ok(varies(response), "shared caches must key HTML on Accept-Encoding");
  assert.match(response.headers.get("cache-control"), /(?:^|,\s*)no-transform(?:,|$)/u);
  assert.equal(response.headers.get("etag"), `W/"${siteManifest.files[siteManifest.routes[route]].sha256}"`);
  const wire = Buffer.from(await response.arrayBuffer());
  const decoded = gunzipSync(wire);
  assert.ok(decoded.equals(original), "decoding must return the exact published bytes");
  assert.ok(wire.length < original.length * 0.25, `expected at least 75% smaller, got ${wire.length} of ${original.length} bytes`);
  // The CSP lists the hashes of the inline scripts the browser will run; they
  // are computed from the decoded document and must be untouched by gzip.
  const decodedHashes = inlineScriptHashes(decoded.toString("utf8"));
  assert.ok(decodedHashes.length > 0, "the measured page has inline JSON-LD");
  assert.deepEqual(decodedHashes, [...siteManifest.inlineScripts[route]].sort());
  assert.deepEqual(cspScriptHashes(response), decodedHashes);
});

test("clients that do not accept gzip receive the identity document with the same policy", async () => {
  const route = "/ar/alghaz/";
  const original = await builtBytes(route);
  const compressed = await handler.fetch(request(route, { acceptEncoding: "gzip" }), environment());
  for (const acceptEncoding of [undefined, "", "identity", "br", "gzip;q=0", "*;q=0"]) {
    const response = await handler.fetch(request(route, { acceptEncoding }), environment());
    assert.equal(response.status, 200, String(acceptEncoding));
    assert.equal(response.headers.get("content-encoding"), null, String(acceptEncoding));
    assert.ok(varies(response), String(acceptEncoding));
    assert.match(response.headers.get("cache-control"), /(?:^|,\s*)no-transform(?:,|$)/u);
    assert.equal(response.headers.get("etag"), compressed.headers.get("etag"));
    assert.equal(response.headers.get("content-security-policy"), compressed.headers.get("content-security-policy"));
    assert.ok(Buffer.from(await response.arrayBuffer()).equals(original), String(acceptEncoding));
  }
});

test("the visitor's original Accept-Encoding wins over Cloudflare's rewritten request header", async () => {
  const route = "/ar/alghaz/";
  const rewritten = await handler.fetch(request(route, {
    acceptEncoding: "br, gzip", cf: { clientAcceptEncoding: "identity" },
  }), environment());
  assert.equal(rewritten.headers.get("content-encoding"), null);
  const original = await handler.fetch(request(route, {
    acceptEncoding: "br, gzip", cf: { clientAcceptEncoding: "gzip, deflate" },
  }), environment());
  assert.equal(original.headers.get("content-encoding"), "gzip");
  const unchanged = await handler.fetch(request(route, { acceptEncoding: "br, gzip", cf: {} }), environment());
  assert.equal(unchanged.headers.get("content-encoding"), "gzip", "an unreplaced header is the visitor's own value");
});

test("HEAD advertises the GET representation headers without a body or stale length", async () => {
  const route = "/ar/alghaz/";
  const get = await handler.fetch(request(route, { acceptEncoding: "gzip" }), environment());
  const head = await handler.fetch(request(route, { method: "HEAD", acceptEncoding: "gzip" }), environment());
  assert.equal(head.status, 200);
  assert.equal(head.body, null);
  assert.equal(head.headers.get("content-encoding"), "gzip");
  assert.equal(head.headers.get("content-length"), null);
  assert.ok(varies(head));
  for (const name of ["etag", "cache-control", "content-security-policy", "content-type"]) {
    assert.equal(head.headers.get(name), get.headers.get(name), name);
  }
  const identityHead = await handler.fetch(request(route, { method: "HEAD" }), environment());
  assert.equal(identityHead.headers.get("content-encoding"), null);
  assert.ok(varies(identityHead));
});

test("revalidation answers 304 with the shared weak ETag and the same Vary for either encoding", async () => {
  const route = "/ar/alghaz/";
  const first = await handler.fetch(request(route, { acceptEncoding: "gzip" }), environment());
  for (const acceptEncoding of ["gzip", undefined]) {
    const env = environment();
    const conditional = await handler.fetch(request(route, {
      acceptEncoding, headers: { "if-none-match": first.headers.get("etag") },
    }), env);
    assert.equal(conditional.status, 304);
    assert.equal(conditional.body, null);
    assert.equal(conditional.headers.get("content-encoding"), null);
    assert.ok(varies(conditional));
    assert.equal(conditional.headers.get("cache-control"), first.headers.get("cache-control"));
    assert.equal(env.requests.length, 0, "a matching validator never reads the asset");
  }
});

test("the HTML 404 page is compressed too, but non-HTML assets are left to Cloudflare", async () => {
  const missing = await handler.fetch(request("/definitely-missing", { acceptEncoding: "gzip" }), environment());
  assert.equal(missing.status, 404);
  assert.equal(missing.headers.get("content-encoding"), "gzip");
  assert.match(missing.headers.get("cache-control"), /no-transform/u);
  assert.ok(gunzipSync(Buffer.from(await missing.arrayBuffer())).equals(await readFile(resolve(distRoot, "404.html"))));

  for (const pathname of [siteManifest.fingerprints["/app.js"], siteManifest.fingerprints["/data/card-index.json"], "/sw.js"]) {
    const response = await handler.fetch(request(pathname, { acceptEncoding: "gzip" }), environment());
    assert.equal(response.status, 200, pathname);
    assert.equal(response.headers.get("content-encoding"), null, pathname);
    assert.equal(varies(response), false, pathname);
    assert.doesNotMatch(response.headers.get("cache-control"), /no-transform/u, pathname);
  }
});

test("an already-encoded asset body is passed through instead of being encoded twice", async () => {
  const response = await handler.fetch(request("/ar/alghaz/", { acceptEncoding: "gzip" }), environment({ encoding: "br" }));
  assert.equal(response.headers.get("content-encoding"), "br");
  assert.ok(varies(response));
});

test("compressed HTML tells the Workers runtime the body is already encoded", async () => {
  const NativeResponse = globalThis.Response;
  const inits = [];
  globalThis.Response = class RecordingResponse extends NativeResponse {
    constructor(body, init) {
      super(body, init);
      inits.push(init || {});
    }
  };
  try {
    const response = await handler.fetch(request("/ar/alghaz/", { acceptEncoding: "gzip" }), environment());
    assert.equal(response.headers.get("content-encoding"), "gzip");
    assert.equal(inits.at(-1).encodeBody, "manual", "the final Response must opt out of automatic encoding");
    assert.equal(inits.filter((init) => init.encodeBody === "manual").length, 1);
    await response.arrayBuffer();
  } finally {
    globalThis.Response = NativeResponse;
  }
});
