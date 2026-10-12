import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { originIsAllowed, preflight, withCors } from "../dist/http.js";

function configuration(path) {
  return JSON.parse(readFileSync(new URL(path, import.meta.url), "utf8").replace(/^\s*\/\/.*$/gmu, ""));
}
const api = configuration("../wrangler.jsonc");
const site = configuration("../../site-worker/wrangler.jsonc");

test("the deployed API trusts Riddle Arabia and refuses credentials from the domain being reused", () => {
  for (const origin of ["https://riddlearabia.com", "https://www.riddlearabia.com"]) {
    const request = new Request("https://api.riddlearabia.com/api/auth/login", { method: "OPTIONS", headers: { origin } });
    assert.equal(originIsAllowed(request, api.vars.ALLOWED_ORIGINS), true);
    const response = preflight(request, api.vars.ALLOWED_ORIGINS);
    assert.equal(response.status, 204);
    assert.equal(response.headers.get("access-control-allow-origin"), origin);
    assert.equal(response.headers.get("access-control-allow-credentials"), "true");
  }
  for (const origin of ["https://jakh.net", "https://www.jakh.net", "https://new-project.jakh.net"]) {
    const request = new Request("https://api.riddlearabia.com/api/auth/login", { method: "OPTIONS", headers: { origin } });
    assert.equal(originIsAllowed(request, api.vars.ALLOWED_ORIGINS), false);
    assert.equal(preflight(request, api.vars.ALLOWED_ORIGINS).status, 403);
    const response = withCors(new Response(null, { status: 200 }), request, api.vars.ALLOWED_ORIGINS);
    assert.equal(response.headers.get("access-control-allow-origin"), null);
    assert.equal(response.headers.get("access-control-allow-credentials"), null);
  }
});

test("production configuration cannot reclaim a jakh.net hostname on the next deployment", () => {
  for (const config of [site, api]) {
    for (const route of config.routes) {
      const host = new URL(`https://${route.pattern}`).hostname;
      assert.ok(host !== "jakh.net" && !host.endsWith(".jakh.net"), `detached domain ${host} is still configured`);
    }
  }
  for (const host of ["riddlearabia.com", "www.riddlearabia.com"]) {
    assert.ok(site.routes.some(route => route.pattern === host && route.custom_domain === true));
  }
  assert.ok(api.routes.some(route => route.pattern === "api.riddlearabia.com" && route.custom_domain === true));
  assert.equal(api.vars.STATIC_ORIGIN, "https://riddlearabia.com");
});
