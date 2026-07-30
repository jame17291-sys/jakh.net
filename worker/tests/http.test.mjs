import assert from "node:assert/strict";
import test from "node:test";
import {
  ApiError,
  json,
  originIsAllowed,
  parseJson,
  redirectToHttps,
  withCors,
} from "../dist/http.js";

function requestFromChunks(chunks, headers = {}) {
  let index = 0;
  let cancelled = false;
  const body = new ReadableStream({
    pull(controller) {
      const chunk = chunks[index];
      index += 1;
      if (chunk) {
        controller.enqueue(chunk);
      } else {
        controller.close();
      }
    },
    cancel() {
      cancelled = true;
    },
  });

  return {
    request: new Request("https://api.jakh.net/test", {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body,
      duplex: "half",
    }),
    wasCancelled: () => cancelled,
  };
}

test("parseJson handles UTF-8 characters split across stream chunks", async () => {
  const encoded = new TextEncoder().encode(JSON.stringify({ label: "سؤال" }));
  const { request } = requestFromChunks([
    encoded.slice(0, 12),
    encoded.slice(12, 13),
    encoded.slice(13),
  ]);

  assert.deepEqual(await parseJson(request, encoded.byteLength), { label: "سؤال" });
});

test("parseJson rejects a streamed body that exceeds a misleading Content-Length", async () => {
  const encoder = new TextEncoder();
  const streamed = requestFromChunks(
    [encoder.encode('{"value":"'), encoder.encode('too large"}')],
    { "content-length": "2" },
  );

  await assert.rejects(
    parseJson(streamed.request, 12),
    (error) => error instanceof ApiError && error.status === 413,
  );
  assert.equal(streamed.wasCancelled(), true);
});

test("parseJson rejects non-object JSON bodies", async () => {
  for (const body of ["null", "[]", "\"text\"", "42"]) {
    await assert.rejects(
      parseJson(new Request("https://api.jakh.net/test", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body,
      })),
      (error) => error instanceof ApiError && error.status === 400,
    );
  }
});

test("withCors leaves Cloudflare WebSocket upgrade responses untouched", () => {
  const upgradeResponse = { status: 101 };
  const request = new Request("https://api.jakh.net/ws/battle", {
    headers: { origin: "https://jakh.net" },
  });

  assert.equal(
    withCors(upgradeResponse, request, "https://jakh.net"),
    upgradeResponse,
  );
});

test("withCors does not duplicate existing Vary tokens", async () => {
  const request = new Request("https://api.jakh.net/api/health", {
    headers: { origin: "https://jakh.net" },
  });
  const response = withCors(
    new Response("ok", { headers: { vary: "Accept-Encoding, origin" } }),
    request,
    "https://jakh.net",
  );

  assert.equal(response.headers.get("access-control-allow-origin"), "https://jakh.net");
  assert.equal(response.headers.get("access-control-allow-credentials"), "true");
  assert.equal(
    response.headers.get("strict-transport-security"),
    "max-age=31536000; includeSubDomains",
  );
  assert.equal(response.headers.get("x-frame-options"), null);
  assert.deepEqual(
    response.headers.get("vary").split(",").map((token) => token.trim().toLowerCase()),
    ["accept-encoding", "origin"],
  );
  assert.equal(await response.text(), "ok");
});

test("withCors adds HSTS even when no CORS origin is present", () => {
  const response = withCors(
    new Response("ok"),
    new Request("https://api.jakh.net/api/health"),
    "https://jakh.net",
  );

  assert.equal(
    response.headers.get("strict-transport-security"),
    "max-age=31536000; includeSubDomains",
  );
  assert.equal(response.headers.has("access-control-allow-origin"), false);
});

test("unsafe requests require an explicitly allowed Origin", () => {
  const allowed = "https://jakh.net,https://www.jakh.net";
  assert.equal(originIsAllowed(
    new Request("https://api.jakh.net/api/user/avatar", { method: "PUT" }),
    allowed,
  ), false);
  assert.equal(originIsAllowed(
    new Request("https://api.jakh.net/api/user/avatar", {
      method: "PUT",
      headers: { origin: "https://jakh.net" },
    }),
    allowed,
  ), true);
  assert.equal(originIsAllowed(
    new Request("https://api.jakh.net/api/health"),
    allowed,
  ), true);
});

test("JSON API responses carry browser isolation headers", () => {
  const response = withCors(
    json({ ok: true }),
    new Request("https://api.jakh.net/api/health"),
    "https://jakh.net",
  );
  assert.match(response.headers.get("content-security-policy"), /default-src 'none'/u);
  assert.equal(response.headers.get("cross-origin-resource-policy"), "same-site");
  assert.match(response.headers.get("permissions-policy"), /camera=\(\)/u);
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");
  assert.equal(response.headers.get("x-frame-options"), "DENY");
});

test("HTTP requests redirect permanently to the same HTTPS path and query", () => {
  const redirect = redirectToHttps(
    new Request("http://api.jakh.net/api/health?source=smoke"),
  );

  assert.equal(redirect?.status, 308);
  assert.equal(
    redirect?.headers.get("location"),
    "https://api.jakh.net/api/health?source=smoke",
  );
  assert.equal(redirect?.headers.get("cache-control"), "no-store");
  assert.equal(
    redirectToHttps(new Request("https://api.jakh.net/api/health")),
    null,
  );
});
