import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { after, before, test } from "node:test";
import { runInNewContext } from "node:vm";
import { startAdminWorkspaceFixture, SCIENCE_ID, REPORT_ID, ADMIN_ID } from "./admin-workspace-fixture.mjs";

let fixture;
before(async () => { fixture = await startAdminWorkspaceFixture(); });
after(async () => { await fixture?.close(); });

async function request(path, options = {}) {
  const response = await fetch(`${fixture.baseUrl}${path}`, { ...options, headers: { "content-type": "application/json", ...options.headers } });
  return { response, body: await response.json() };
}

test("fixture HTML sends admin API traffic to this loopback server", async () => {
  const response = await fetch(`${fixture.baseUrl}/admin?role=ADMIN`);
  const html = await response.text();
  assert.match(html, new RegExp(`data-admin-api-origin="${fixture.baseUrl}/api"`));
  assert.match(html, /data-admin-environment="local-fixture"/u);
  assert.match(response.headers.get("set-cookie"), /admin_fixture_role=ADMIN/u);
  assert.equal(response.headers.get("x-admin-fixture"), "synthetic-loopback");
  const { body } = await request("/api/user/profile", { headers: { cookie: "admin_fixture_role=ADMIN" } });
  assert.equal(body.id, ADMIN_ID);
  assert.equal(body.role, "ADMIN");
});

test("fixture has searchable categories and preserves source punctuation", async () => {
  const { body: catalog } = await request("/data/catalog.json");
  assert.equal(catalog.categories.length, 2);
  const { body: cards } = await request("/data/science.json");
  assert.ok(cards.length > 30, "Pagination fixture must span at least two default result pages");
  assert.ok(cards[0].review.sources[0].title.includes("|"), "Structured sources must retain punctuation from legacy values");
  const { body: overview } = await request("/api/admin/overview");
  assert.equal(overview.editorial.inReview, 2);
  assert.equal(overview.recentEdits.length, 5);
  assert.equal(overview.editorial.publishedOverrides, 2, "A draft with an older published version still has a live override");
});

test("fixture authenticator gate distinguishes enrollment, verification and anonymous access", async () => {
  fixture.reset();
  try {
    fixture.control({ securityEnabled: false, securityVerified: false });
    assert.equal((await request('/api/user/security')).body.enabled, false);
    const enrollment = await request('/api/admin/overview');
    assert.equal(enrollment.response.status, 403);
    assert.equal(enrollment.body.code, 'MFA_ENROLLMENT_REQUIRED');
    fixture.control({ securityEnabled: true });
    const verification = await request('/api/admin/overview');
    assert.equal(verification.response.status, 403);
    assert.equal(verification.body.code, 'MFA_REQUIRED');
    const invalid = await request('/api/user/security/verify', { method: 'POST', body: JSON.stringify({ code: 'invalid-fixture-code' }) });
    assert.equal(invalid.response.status, 400);
    assert.equal(fixture.getState().securityVerified, false);
    const valid = await request('/api/user/security/verify', { method: 'POST', body: JSON.stringify({ code: '123456' }) });
    assert.equal(valid.body.verified, true);
    assert.equal((await request('/api/admin/overview')).response.status, 200);
    fixture.control({ authenticated: false });
    const anonymous = await request('/api/user/security');
    assert.equal(anonymous.response.status, 401);
    assert.equal(anonymous.body.code, 'UNAUTHORIZED');
  } finally { fixture.reset(); }
});

test("fixture serves the real local authenticator dialog assets without widening its file access", async () => {
  for (const path of ['/auth-security.js', '/auth-security.css']) {
    const response = await fetch(`${fixture.baseUrl}${path}`);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('x-admin-fixture'), 'synthetic-loopback');
  }
  assert.equal((await fetch(`${fixture.baseUrl}/auth-security.js.backup`)).status, 404);
});

test("real gate rendering keeps unverified OWNER and ADMIN actions visible in both languages", async () => {
  const source = await readFile(new URL('../admin.js', import.meta.url), 'utf8');
  const start = source.indexOf('  function renderGate() {');
  const end = source.indexOf('\n  function showApp()', start);
  assert.ok(start > 0 && end > start);
  for (const lang of ['en', 'ar']) for (const [role, gateMode, expectedAccess] of [
    ['OWNER', 'mfa', false], ['ADMIN', 'mfa', false],
    ['OWNER', 'checking', true], ['ADMIN', 'checking', true],
    [null, 'checking', false], [null, 'signedOut', false], [null, 'unauthorized', false], [null, 'offline', false],
  ]) {
    const node = () => ({ hidden: false, children: [], append(...nodes) { this.children.push(...nodes); }, addEventListener() {} });
    const els = Object.fromEntries(['gate', 'gateTitle', 'gateMessage', 'gateActions', 'refreshButton', 'logoutButton'].map(id => [id, node()]));
    runInNewContext(`${source.slice(start, end)}\nrenderGate();`, {
      els, state: { lang, gateMode, me: role ? { role } : null }, ADMIN_ROLES: new Set(['OWNER', 'ADMIN']),
      t: key => `${lang}:${key}`, clearNode: target => { target.children = []; }, document: { createElement: node },
      signInHref: () => '/fixture-sign-in', gateButton: node, retryButton: node, verifyAdminAccess() {},
    });
    assert.equal(els.gate.hidden, expectedAccess, `${lang}/${role}/${gateMode}: gate visibility`);
    assert.equal(els.refreshButton.hidden, !expectedAccess);
    if (gateMode === 'mfa') {
      assert.equal(els.gateActions.children[0].textContent, `${lang}:mfaAction`);
      assert.equal(els.gateActions.children[0].type, 'button');
    }
  }
});

test("real refresh re-gates both MFA failures while retaining ordinary forbidden-error handling", async () => {
  const source = await readFile(new URL('../admin.js', import.meta.url), 'utf8');
  const start = source.indexOf('  async function refreshVisible(');
  const end = source.indexOf('\n  async function establishAccess()', start);
  assert.ok(start > 0 && end > start);
  class AdminApiError extends Error { constructor(status, code) { super(code); this.status = status; this.code = code; } }
  for (const [status, code, expectedGate] of [[403, 'MFA_REQUIRED', true], [403, 'MFA_ENROLLMENT_REQUIRED', true], [401, 'UNAUTHORIZED', true], [403, 'FORBIDDEN', false]]) {
    const error = new AdminApiError(status, code), gated = [], toasts = [];
    await runInNewContext(`${source.slice(start, end)}\nrefreshVisible(false);`, {
      state: { activeTab: 'overview' }, AdminApiError,
      loadOverview: async () => { throw error; }, loadHealth: async () => {}, loadSecurity: async () => {},
      handleActionError: failure => gated.push(failure), showToast: (...args) => toasts.push(args), t: key => key,
    });
    assert.equal(gated.length, expectedGate ? 1 : 0, code);
    assert.equal(toasts.length, expectedGate ? 0 : 1, code);
    if (expectedGate) assert.equal(gated[0], error);
    else assert.equal(toasts[0][0], 'requestFailed');
  }
});

test("save failure leaves persisted content intact, then retry saves once", async () => {
  fixture.reset();
  const before = fixture.getState().edits.find((edit) => edit.questionId === SCIENCE_ID);
  fixture.control({ failNextSave: true });
  const content = structuredClone(before.draft);
  content.question.en = "An edited fixture question?";
  const options = { method: "PUT", body: JSON.stringify({ categorySlug: "science", content, workflowStatus: "DRAFT" }) };
  const failure = await request(`/api/admin/content/${SCIENCE_ID}`, options);
  assert.equal(failure.response.status, 503);
  assert.deepEqual(fixture.getState().edits.find((edit) => edit.questionId === SCIENCE_ID), before);
  const success = await request(`/api/admin/content/${SCIENCE_ID}`, options);
  assert.equal(success.response.status, 200);
  assert.equal(success.body.edit.version, before.version + 1);
  assert.equal(success.body.edit.draft.question.en, content.question.en);
});

test("notes persist separately from the original report and its status", async () => {
  fixture.reset();
  const before = fixture.getState().suggestions.find((item) => item.id === REPORT_ID);
  const { body } = await request(`/api/admin/suggestions/${REPORT_ID}`, { method: "PATCH", body: JSON.stringify({ status: before.status, reason: "Verified current question and retained original report." }) });
  assert.equal(body.changed, true);
  assert.equal(body.noteSaved, true);
  const after = fixture.getState().suggestions.find((item) => item.id === REPORT_ID);
  assert.equal(after.text, before.text);
  assert.equal(after.status, before.status);
  assert.equal(after.resolutionNote.text, "Verified current question and retained original report.");
});

test("fixture rejects admin self-publishing and owner publish without a reason", async () => {
  fixture.reset();
  fixture.control({ stepUp: true });
  const admin = await request("/api/admin/content/science-fixture-002/publish", { method: "POST", headers: { cookie: "admin_fixture_role=ADMIN" }, body: JSON.stringify({ reason: "Must remain blocked" }) });
  assert.equal(admin.response.status, 403);
  const owner = await request("/api/admin/content/science-fixture-003/publish", { method: "POST", body: "{}" });
  assert.equal(owner.response.status, 400);
});

test("fixture never proxies unrecognized requests or serves repository secrets", async () => {
  for (const path of ["/api/unknown", "/package.json", "/worker/.dev.vars", "/.git/config"]) {
    const response = await fetch(`${fixture.baseUrl}${path}`);
    assert.equal(response.status, 404, path);
  }
});

test("delayed refresh captures an old snapshot so browser races are deterministic", async () => {
  fixture.reset();
  const original = fixture.getState().edits.find((edit) => edit.questionId === SCIENCE_ID);
  const gate = fixture.holdNext("GET", "/api/admin/content");
  const pending = request("/api/admin/content");
  try {
    const deadline = Date.now() + 5000;
    while (!gate.wasReceived() && Date.now() < deadline) await new Promise((done) => setTimeout(done, 10));
    assert.equal(gate.wasReceived(), true, "The read request must reach the fixture before the mutation");
    const content = structuredClone(original.draft);
    content.question.en = "Saved after refresh captured its response?";
    const saved = await request(`/api/admin/content/${SCIENCE_ID}`, { method: "PUT", body: JSON.stringify({ categorySlug: "science", content, workflowStatus: "DRAFT" }) });
    assert.equal(saved.response.status, 200);
    gate.release();
    const stale = await pending;
    assert.equal(stale.body.edits.find((edit) => edit.questionId === SCIENCE_ID).draft.question.en, original.draft.question.en);
    assert.equal(fixture.getState().edits.find((edit) => edit.questionId === SCIENCE_ID).draft.question.en, content.question.en);
  } finally { gate.release(); }
});

test("feedback pagination returns distinct pages for draft-preservation regressions", async () => {
  fixture.reset();
  fixture.control({ feedbackPageSize: 2 });
  const first = await request("/api/admin/suggestions?offset=0&limit=40");
  const second = await request(`/api/admin/suggestions?offset=${first.body.nextOffset}&limit=40`);
  assert.equal(first.body.suggestions.length, 2);
  assert.equal(first.body.nextOffset, 2);
  assert.equal(second.body.suggestions.length, 1);
  assert.equal(second.body.nextOffset, null);
  assert.equal(new Set([...first.body.suggestions, ...second.body.suggestions].map((item) => item.id)).size, 3);
});
