import { readFile, stat } from "node:fs/promises";
import { createServer } from "node:http";
import { dirname, extname, join, normalize, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const REPOSITORY_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const MIME_TYPES = new Map([
  [".css", "text/css; charset=utf-8"],
  [".gif", "image/gif"],
  [".html", "text/html; charset=utf-8"],
  [".ico", "image/x-icon"],
  [".jpeg", "image/jpeg"],
  [".jpg", "image/jpeg"],
  [".js", "application/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".map", "application/json; charset=utf-8"],
  [".mjs", "application/javascript; charset=utf-8"],
  [".png", "image/png"],
  [".svg", "image/svg+xml"],
  [".txt", "text/plain; charset=utf-8"],
  [".webmanifest", "application/manifest+json; charset=utf-8"],
  [".webp", "image/webp"],
  [".woff", "font/woff"],
  [".woff2", "font/woff2"],
  [".xml", "application/xml; charset=utf-8"],
]);

function invariant(condition, message) {
  if (!condition) throw new Error(message);
}

async function regularFile(path) {
  try {
    return (await stat(path)).isFile();
  } catch {
    return false;
  }
}

function safeCandidate(siteRoot, relativePath) {
  const candidate = resolve(siteRoot, relativePath);
  if (candidate === siteRoot || candidate.startsWith(`${siteRoot}${sep}`)) return candidate;
  return null;
}

async function resolveSourcePath(siteRoot, pathname) {
  let decoded;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    return null;
  }
  const relative = normalize(decoded).replace(/^[/\\]+/u, "");
  const candidate = safeCandidate(siteRoot, relative || "index.html");
  if (!candidate) return null;

  const possibilities = [];
  if (decoded.endsWith("/")) possibilities.push(join(candidate, "index.html"));
  possibilities.push(candidate);
  if (!extname(candidate)) {
    possibilities.push(`${candidate}.html`);
    possibilities.push(join(candidate, "index.html"));
  }
  for (const possibility of possibilities) {
    if (await regularFile(possibility)) return possibility;
  }
  return null;
}

async function resolveArtifactPath(siteRoot, manifest, pathname) {
  const physical = manifest.routes[pathname] || pathname;
  const record = manifest.files[physical];
  if (!record) return null;
  let decoded;
  try {
    decoded = decodeURIComponent(physical).replace(/^[/\\]+/u, "");
  } catch {
    return null;
  }
  const candidate = safeCandidate(siteRoot, decoded);
  if (!candidate || !await regularFile(candidate)) return null;
  return candidate;
}

function responseHeaders(path) {
  const headers = new Headers({
    "content-type": MIME_TYPES.get(extname(path).toLowerCase()) || "application/octet-stream",
    "x-content-type-options": "nosniff",
  });
  if (path.endsWith(`${sep}sw.js`)) headers.set("service-worker-allowed", "/");
  return headers;
}

async function loadEdgeRuntime(manifestPath) {
  if (!manifestPath) return null;
  const manifest = JSON.parse(await readFile(resolve(manifestPath), "utf8"));
  invariant(manifest?.service === "jakh-site", "Artifact browser server requires a jakh-site manifest");
  const [{ createSiteHandler }, mtaStsPolicy] = await Promise.all([
    import("../site-worker/src/site-edge.js"),
    readFile(resolve(REPOSITORY_ROOT, "site-worker/assets/mta-sts.txt"), "utf8"),
  ]);
  return {
    manifest,
    handler: createSiteHandler({ siteManifest: manifest, mtaStsPolicy }),
  };
}

async function nodeResponse(response, request, edgeResponse, localOrigin) {
  const headers = Object.fromEntries(edgeResponse.headers.entries());
  // Browsers disagree on whether `upgrade-insecure-requests` should rewrite
  // subresources on the privileged HTTP loopback origin. WebKit upgrades them
  // to TLS, which a loopback-only test server intentionally does not expose.
  // Remove only that directive in this test adapter; site-edge unit tests still
  // assert the unmodified production policy, while every other CSP directive
  // and the page-specific inline hashes remain browser-enforced here.
  if (localOrigin.startsWith("http://") && headers["content-security-policy"]) {
    headers["content-security-policy"] = headers["content-security-policy"]
      .replace(/;\s*upgrade-insecure-requests\s*(?=;|$)/iu, "")
      .replace(/;\s*$/u, "");
    headers["x-jakh-local-csp-adjustment"] = "upgrade-insecure-requests-disabled-on-http-loopback";
  }
  const location = edgeResponse.headers.get("location");
  if (location) {
    const target = new URL(location);
    if (target.hostname === "jakh.net" || target.hostname === "www.jakh.net") {
      headers.location = `${localOrigin}${target.pathname}${target.search}${target.hash}`;
    }
  }
  response.writeHead(edgeResponse.status, headers);
  if (request.method === "HEAD" || edgeResponse.body === null) {
    response.end();
    return;
  }
  response.end(Buffer.from(await edgeResponse.arrayBuffer()));
}

export async function startBrowserSite({
  siteRoot = REPOSITORY_ROOT,
  manifestPath = null,
  loopbackHost = "127.0.0.1",
} = {}) {
  const root = resolve(siteRoot);
  const edge = await loadEdgeRuntime(manifestPath);
  let simulateNetworkFailure = false;

  const server = createServer(async (request, response) => {
    try {
      if (simulateNetworkFailure) {
        request.socket.destroy();
        return;
      }
      const localOrigin = `http://${request.headers.host || loopbackHost}`;
      const incoming = new URL(request.url || "/", localOrigin);

      if (!edge) {
        const path = await resolveSourcePath(root, incoming.pathname);
        if (!path) {
          response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
          response.end("Not found");
          return;
        }
        const headers = Object.fromEntries(responseHeaders(path).entries());
        headers["cache-control"] = "public, max-age=0, must-revalidate";
        response.writeHead(200, headers);
        response.end(request.method === "HEAD" ? undefined : await readFile(path));
        return;
      }

      const edgeRequestUrl = new URL(`${incoming.pathname}${incoming.search}`, "https://jakh.net");
      const edgeRequest = new Request(edgeRequestUrl, {
        method: request.method,
        headers: request.headers,
      });
      const environment = {
        MTA_STS_ENABLED: "false",
        ASSETS: {
          async fetch(assetRequest) {
            const assetUrl = new URL(assetRequest.url);
            const path = await resolveArtifactPath(root, edge.manifest, assetUrl.pathname);
            if (!path) {
              return new Response("Not found", {
                status: 404,
                headers: { "content-type": "text/plain; charset=utf-8" },
              });
            }
            return new Response(assetRequest.method === "HEAD" ? null : await readFile(path), {
              status: 200,
              headers: responseHeaders(path),
            });
          },
        },
      };
      await nodeResponse(response, request, await edge.handler.fetch(edgeRequest, environment), localOrigin);
    } catch (error) {
      response.writeHead(500, { "content-type": "text/plain; charset=utf-8" });
      response.end(error instanceof Error ? error.message : String(error));
    }
  });

  const port = await new Promise((resolveListen, reject) => {
    server.once("error", reject);
    server.listen(0, loopbackHost, () => {
      server.off("error", reject);
      const address = server.address();
      invariant(address && typeof address === "object", "Loopback server did not expose a port");
      resolveListen(address.port);
    });
  });

  return {
    artifactManifest: edge?.manifest || null,
    baseUrl: `http://${loopbackHost}:${port}`,
    setSimulatedNetworkFailure(value) {
      simulateNetworkFailure = value === true;
    },
    async close() {
      await new Promise((resolveClose, reject) => {
        server.close((error) => error ? reject(error) : resolveClose());
      });
    },
  };
}
