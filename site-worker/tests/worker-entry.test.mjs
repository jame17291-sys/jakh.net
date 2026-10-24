import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { register } from "node:module";
import { join, resolve } from "node:path";
import test from "node:test";
import { brotliDecompressSync, gunzipSync } from "node:zlib";

// The real Worker entry point (src/index.js) imports its MTA-STS policy as a
// Wrangler text module. Teach Node the same rule for this test process only.
register(`data:text/javascript,${encodeURIComponent(`
  import { readFile } from "node:fs/promises";
  import { fileURLToPath } from "node:url";
  export async function load(url, context, nextLoad) {
    if (url.startsWith("file:") && url.endsWith(".txt")) {
      const text = await readFile(fileURLToPath(url), "utf8");
      return { format: "module", shortCircuit: true, source: "export default " + JSON.stringify(text) + ";" };
    }
    return nextLoad(url, context);
  }
`)}`);

const repositoryRoot = resolve(import.meta.dirname, "../..");
const distRoot = join(repositoryRoot, "site-worker/dist");
const siteManifest = JSON.parse(await readFile(join(repositoryRoot, "site-worker/generated/site-manifest.json"), "utf8"));
const WORKER_VERSION = "11111111-2222-4333-8444-555555555555";

// Workers keep `encodeBody` on the Response object. A Response built from a
// plain init dictionary is "automatic": the runtime then encodes the body to
// match its Content-Encoding header, even if the bytes are already encoded.
// This stand-in records the setting the same way so the test can prove the
// entry point never hands the runtime a precompressed body in automatic mode.
const NodeResponse = globalThis.Response;
class WorkersResponse extends NodeResponse {
  #encodeBody;
  constructor(body, init = undefined) {
    super(body, init);
    this.#encodeBody = init?.encodeBody === "manual"
      || (init instanceof WorkersResponse && init.encodeBody === "manual")
      ? "manual"
      : "automatic";
  }
  get encodeBody() {
    return this.#encodeBody;
  }
}

function contentType(pathname) {
  if (pathname.endsWith(".html")) return "text/html; charset=utf-8";
  if (pathname.endsWith(".js")) return "text/javascript; charset=utf-8";
  if (pathname.endsWith(".css")) return "text/css; charset=utf-8";
  if (pathname.endsWith(".gz")) return "application/gzip";
  return "application/octet-stream";
}

const environment = {
  MTA_STS_ENABLED: "false",
  CF_VERSION_METADATA: { id: WORKER_VERSION },
  ASSETS: {
    async fetch(request) {
      const pathname = new URL(request.url).pathname;
      assert.ok(siteManifest.files[pathname], `The Worker requested an undeclared asset: ${pathname}`);
      const bytes = await readFile(join(distRoot, pathname.slice(1)));
      return new NodeResponse(bytes, {
        headers: { "content-type": contentType(pathname), "content-length": String(bytes.length) },
      });
    },
  },
};

test("the deployed entry point keeps stored compressed HTML byte-exact and never re-encodes it", async (t) => {
  globalThis.Response = WorkersResponse;
  t.after(() => {
    globalThis.Response = NodeResponse;
  });
  const worker = (await import("../src/index.js")).default;
  assert.equal(siteManifest.htmlPrecompression?.enabled, true, "the production build precompresses HTML");

  const pages = ["/", "/ar/alghaz/", "/admin", "/__missing_page__"];
  const checked = new Set();
  for (const pathname of pages) {
    for (const [acceptEncoding, expected] of [["gzip, deflate, br, zstd", "br"], ["gzip, deflate", "gzip"], ["identity", null]]) {
      const request = new Request(`https://riddlearabia.com${pathname}`, { headers: { "accept-encoding": "br, gzip" } });
      Object.defineProperty(request, "cf", { value: { clientAcceptEncoding: acceptEncoding } });
      const response = await worker.fetch(request, environment, {});
      assert.equal(response.headers.get("x-jakh-worker-version"), WORKER_VERSION, pathname);
      assert.equal(response.headers.get("content-encoding"), expected, `${pathname} ${acceptEncoding}`);
      if (response.headers.has("content-encoding")) {
        assert.equal(response.encodeBody, "manual", `${pathname}: a compressed body must bypass runtime encoding`);
      }
      const physical = response.status === 404 ? "/404.html" : siteManifest.routes[pathname];
      const stored = await readFile(join(distRoot, physical.slice(1)));
      const body = Buffer.from(await response.arrayBuffer());
      const decoded = expected === "br" ? brotliDecompressSync(body) : expected === "gzip" ? gunzipSync(body) : body;
      assert.ok(decoded.equals(stored), `${pathname} ${acceptEncoding}: decoded HTML must equal the stored file`);
      checked.add(`${pathname}:${expected}`);
    }
  }
  assert.equal(checked.size, pages.length * 3);

  // Every response leaving the entry point obeys the same rule.
  for (const pathname of ["/sw.js", "/robots.txt", siteManifest.fingerprints["/app.js"], "/science.html", "/survival"]) {
    const request = new Request(`https://riddlearabia.com${pathname}`);
    Object.defineProperty(request, "cf", { value: { clientAcceptEncoding: "gzip, deflate, br" } });
    const response = await worker.fetch(request, environment, {});
    assert.equal(response.headers.get("x-jakh-worker-version"), WORKER_VERSION, pathname);
    if (response.headers.has("content-encoding")) assert.equal(response.encodeBody, "manual", pathname);
  }
});
