/** Loopback-only, in-memory admin fixture. Never forwards requests to a live service. */
import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { dirname, extname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const NOW = "2026-09-23T08:00:00.000Z";
export const OWNER_ID = "fixture-owner";
export const ADMIN_ID = "fixture-admin";
export const SCIENCE_ID = "science-fixture-001";
export const REPORT_QUESTION_ID = "tv-shows-trivia-139";
export const REPORT_ID = "report_changed_wording01";
export const MISSING_REPORT_ID = "report_missing_question1";
export const CURRENT_QUESTION = "Which fictional detective lives at 221B Baker Street?";
export const REPORTED_QUESTION = "Which detective lived on the moon?";

const SOURCE = {
  title: "Reference | edition two",
  publisher: "Fixture editorial library",
  url: "https://example.test/reference?language=en&edition=2",
};

export function createAdminFixtureState() {
  const science = Array.from({ length: 36 }, (_, index) => ({
    id: `science-fixture-${String(index + 1).padStart(3, "0")}`,
    difficulty: "medium",
    question: {
      en: index === 0 ? "Which gas makes up most of Earth's atmosphere?" : `Science fixture question ${index + 1}?`,
      ar: index === 0 ? "أي غاز يشكل معظم الغلاف الجوي للأرض؟" : `سؤال العلوم التجريبي ${index + 1}؟`,
    },
    answer: { en: index === 0 ? "Nitrogen" : `Answer ${index + 1}`, ar: index === 0 ? "النيتروجين" : `إجابة ${index + 1}` },
    explanation: { en: "A local, synthetic reference explanation.", ar: "شرح مرجعي تجريبي محلي." },
    review: { sources: [structuredClone(SOURCE)] },
  }));
  const television = [{
    id: REPORT_QUESTION_ID,
    difficulty: "easy",
    question: { en: CURRENT_QUESTION, ar: "أي محقق خيالي يسكن في شارع بيكر؟" },
    answer: { en: "Sherlock Holmes", ar: "شرلوك هولمز" },
    explanation: { en: "This current wording differs from the original report.", ar: "تختلف الصياغة الحالية عن نص البلاغ الأصلي." },
    review: { sources: [structuredClone(SOURCE)] },
  }];
  const makeEdit = (card, categorySlug, workflowStatus, editorUserId) => ({
    questionId: card.id,
    categorySlug,
    draft: { question: card.question, answer: card.answer, explanation: card.explanation, sources: card.review.sources },
    workflowStatus,
    version: 3,
    publishedVersion: workflowStatus === "PUBLISHED" ? 3 : null,
    hasPublishedVersion: workflowStatus === "PUBLISHED",
    editorUserId,
    editorUsername: editorUserId === OWNER_ID ? "FixtureOwner" : "FixtureAdmin",
    reviewerUsername: null,
    createdAt: NOW,
    updatedAt: NOW,
    publishedAt: workflowStatus === "PUBLISHED" ? NOW : null,
  });
  return {
    categories: [
      { slug: "science", title: { en: "Science", ar: "العلوم" }, count: science.length },
      { slug: "tv-shows", title: { en: "TV Shows", ar: "المسلسلات" }, count: television.length },
    ],
    cards: { science, "tv-shows": television },
    edits: [
      makeEdit(science[0], "science", "DRAFT", OWNER_ID),
      makeEdit(science[1], "science", "IN_REVIEW", ADMIN_ID),
      makeEdit(science[2], "science", "IN_REVIEW", OWNER_ID),
      { ...makeEdit(science[3], "science", "DRAFT", OWNER_ID), publishedVersion: 2, hasPublishedVersion: true, publishedAt: NOW },
      makeEdit(television[0], "tv-shows", "PUBLISHED", OWNER_ID),
    ],
    suggestions: [
      { id: REPORT_ID, text: `[REPORT] tv-shows/${REPORT_QUESTION_ID}: ${REPORTED_QUESTION}`, email: "reporter@example.test", status: "new", createdAt: NOW, resolutionNote: null },
      { id: MISSING_REPORT_ID, text: "[REPORT] tv-shows/tv-shows-removed-999: A question removed from the current catalog?", email: null, status: "new", createdAt: NOW, resolutionNote: null },
      { id: "suggestion-normal", text: "Please add more geography questions.", email: null, status: "reviewed", createdAt: NOW, resolutionNote: { text: "Queued for editorial planning.", authorUsername: "FixtureOwner", createdAt: NOW } },
    ],
    events: [],
    requests: [],
    failNextSave: false,
    failNextNote: false,
    saveDelayMs: 0,
    feedbackPageSize: null,
    stepUp: false,
  };
}

const MIME = { ".html": "text/html", ".js": "application/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".woff2": "font/woff2", ".ico": "image/x-icon", ".png": "image/png" };

export async function startAdminWorkspaceFixture({ port = 0, siteRoot = ROOT } = {}) {
  let state = createAdminFixtureState();
  const gates = [];
  async function holdRequest(method, path) {
    const gate = gates.find((candidate) => !candidate.matched && candidate.method === method && candidate.path === path);
    if (!gate) return;
    gate.matched = true;
    await gate.promise;
  }
  function releaseAll() { for (const gate of gates.splice(0)) gate.release(); }
  const server = createServer(async (request, response) => {
    const origin = `http://${request.headers.host}`;
    const url = new URL(request.url, origin);
    const role = /(?:^|;\s*)admin_fixture_role=ADMIN(?:;|$)/u.test(request.headers.cookie || "") ? "ADMIN" : "OWNER";
    const actorId = role === "OWNER" ? OWNER_ID : ADMIN_ID;
    const username = role === "OWNER" ? "FixtureOwner" : "FixtureAdmin";
    const json = (body, status = 200) => {
      response.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "x-admin-fixture": "synthetic-loopback" });
      response.end(JSON.stringify(body));
    };
    try {
      let body = {};
      if (!["GET", "HEAD"].includes(request.method)) {
        let raw = "";
        for await (const chunk of request) {
          raw += chunk;
          if (raw.length > 128_000) throw new Error("Fixture request too large");
        }
        if (raw) body = JSON.parse(raw);
      }
      if (url.pathname === "/__fixture/reset" && request.method === "POST") {
        state = createAdminFixtureState();
        return json({ ok: true });
      }
      if (url.pathname === "/__fixture/control" && request.method === "POST") {
        for (const key of ["failNextSave", "failNextNote", "stepUp"]) if (typeof body[key] === "boolean") state[key] = body[key];
        return json({ ok: true });
      }
      if (url.pathname === "/__fixture/state") return json(state);
      if (url.pathname === "/data/catalog.json") return json({ categories: state.categories });
      const categoryPath = url.pathname.match(/^\/data\/([^/]+)\.json$/u);
      if (categoryPath && state.cards[categoryPath[1]]) return json(state.cards[categoryPath[1]]);
      if (url.pathname.startsWith("/api/")) {
        state.requests.push({ path: url.pathname, query: url.search, method: request.method, body, role });
        const path = url.pathname.slice(4);
        if (path === "/health") return json({ ok: true, schema: "9", targetSchema: "9", features: { contentStudio: true } });
        if (path === "/user/profile") return json({ id: actorId, username, email: "owner@example.test", avatar: "R", role });
        if (path === "/auth/session") return json({ authenticated: true });
        if (path === "/admin/security") return json({ stepUp: { expiresAt: state.stepUp ? new Date(Date.now() + 600_000).toISOString() : null } });
        if (path === "/admin/security/reauthenticate" && request.method === "POST") {
          state.stepUp = true;
          return json({ success: true, stepUp: { expiresAt: new Date(Date.now() + 600_000).toISOString() } });
        }
        if (path === "/admin/overview") return json({
          metrics: { users: 12, administrators: 2, activeSessions: 4, solved: 350, pendingSuggestions: state.suggestions.filter((item) => item.status === "new").length, suspendedUsers: 1 },
          permissions: { canViewEmail: role === "OWNER" },
          recentUsers: [{ id: "fixture-member", username: "FixtureMember", email: "member@example.test", role: "USER", createdAt: NOW }],
          recentSuggestions: state.suggestions,
          editorialAvailable: true,
          editorial: {
            drafts: state.edits.filter((edit) => edit.workflowStatus === "DRAFT").length,
            inReview: state.edits.filter((edit) => edit.workflowStatus === "IN_REVIEW").length,
            publishedOverrides: state.edits.filter((edit) => edit.hasPublishedVersion).length,
          },
          recentEdits: state.edits,
        });
        if (path === "/admin/content" && request.method === "GET") {
          // Capture before waiting to reproduce an old read returning after a newer mutation.
          const edits = structuredClone(state.edits.filter((edit) => !url.searchParams.get("category") || edit.categorySlug === url.searchParams.get("category")));
          await holdRequest(request.method, url.pathname);
          return json({ edits, nextOffset: null });
        }
        const content = path.match(/^\/admin\/content\/([^/]+)(?:\/(publish|unpublish|restore|revisions))?$/u);
        if (content) {
          const questionId = decodeURIComponent(content[1]);
          const edit = state.edits.find((item) => item.questionId === questionId);
          if (content[2] === "revisions") return json({ revisions: edit ? [{ id: `revision-${questionId}`, questionId, categorySlug: edit.categorySlug, version: edit.version, action: "SAVED", snapshot: edit.draft, actorUsername: edit.editorUsername, createdAt: NOW }] : [] });
          if (!content[2] && request.method === "PUT") {
            await holdRequest(request.method, url.pathname);
            if (state.saveDelayMs > 0) await new Promise((done) => setTimeout(done, state.saveDelayMs));
            if (state.failNextSave) {
              state.failNextSave = false;
              return json({ error: "Fixture save failed. Your draft has not been saved.", code: "FIXTURE_SAVE_FAILED" }, 503);
            }
            const card = state.cards[body.categorySlug]?.find((item) => item.id === questionId);
            if (!card) return json({ error: "Question not found in supplied category", code: "NOT_FOUND" }, 404);
            const next = {
              ...(edit || {}), questionId, categorySlug: body.categorySlug, draft: body.content,
              workflowStatus: body.workflowStatus, version: (edit?.version || 0) + 1,
              editorUserId: actorId, editorUsername: username, updatedAt: NOW,
              hasPublishedVersion: edit?.hasPublishedVersion || false,
              publishedVersion: edit?.publishedVersion || null,
            };
            state.edits = [...state.edits.filter((item) => item.questionId !== questionId), next];
            return json({ success: true, version: next.version, edit: next });
          }
          if (content[2] === "publish" && request.method === "POST") {
            if (!state.stepUp) return json({ error: "Password confirmation required", code: "ADMIN_STEP_UP_REQUIRED" }, 403);
            if (!edit) return json({ error: "Question not found", code: "NOT_FOUND" }, 404);
            if (role === "ADMIN" && edit.editorUserId === actorId) return json({ error: "Independent review required", code: "CONTENT_INDEPENDENT_REVIEW_REQUIRED" }, 403);
            if (!String(body.reason || "").trim()) return json({ error: "Audit reason required", code: "ADMIN_REASON_REQUIRED" }, 400);
            Object.assign(edit, { workflowStatus: "PUBLISHED", publishedVersion: edit.version, hasPublishedVersion: true });
            return json({ success: true, edit });
          }
        }
        if (path === "/admin/suggestions" && request.method === "GET") {
          const filtered = state.suggestions.filter((item) => !url.searchParams.get("status") || item.status === url.searchParams.get("status"));
          const offset = Number(url.searchParams.get("offset") || 0);
          const limit = state.feedbackPageSize || Number(url.searchParams.get("limit") || 40);
          const body = structuredClone({ suggestions: filtered.slice(offset, offset + limit), nextOffset: offset + limit < filtered.length ? offset + limit : null, permissions: { canViewEmail: role === "OWNER" } });
          await holdRequest(request.method, url.pathname);
          return json(body);
        }
        const suggestion = path.match(/^\/admin\/suggestions\/([^/]+)$/u);
        if (suggestion && request.method === "PATCH") {
          await holdRequest(request.method, url.pathname);
          if (state.failNextNote) { state.failNextNote = false; return json({ error: "Fixture note could not be saved", code: "FIXTURE_NOTE_FAILED" }, 503); }
          const item = state.suggestions.find((candidate) => candidate.id === decodeURIComponent(suggestion[1]));
          if (!item) return json({ error: "Feedback not found", code: "NOT_FOUND" }, 404);
          const reason = String(body.reason || "").trim();
          const changed = item.status !== body.status || Boolean(reason);
          item.status = body.status;
          if (reason) item.resolutionNote = { text: reason, authorUsername: username, createdAt: NOW };
          return json({ success: true, changed, noteSaved: Boolean(reason) });
        }
        if (path === "/admin/users") return json({ users: [{ id: actorId, username, role, email: "admin@example.test", createdAt: NOW, isBanned: false }], nextOffset: null, permissions: { canViewEmail: role === "OWNER" } });
        if (path === "/admin/audit") return json({ events: state.events });
        return json({ error: "Unknown fixture API request", code: "NOT_FOUND" }, 404);
      }
      let relative = decodeURIComponent(url.pathname).replace(/^\/+/, "");
      if (!relative || relative === "admin" || relative === "admin/") relative = "admin.html";
      const file = resolve(siteRoot, relative);
      if (!file.startsWith(`${resolve(siteRoot)}${sep}`) || !/^(admin(?:-config)?\.(html|css|js)|fonts\/|assets\/|favicon\.)/u.test(relative)) {
        response.writeHead(404); response.end("Fixture serves only admin assets"); return;
      }
      let bytes = await readFile(file);
      const headers = { "content-type": `${MIME[extname(file)] || "application/octet-stream"}; charset=utf-8`, "cache-control": "no-store", "x-admin-fixture": "synthetic-loopback" };
      if (relative === "admin.html") {
        bytes = Buffer.from(bytes.toString().replace(/data-admin-api-origin="[^"]*"/u, `data-admin-api-origin="${origin}/api"`).replace(/data-admin-environment="[^"]*"/u, 'data-admin-environment="local-fixture"'));
        headers["set-cookie"] = `admin_fixture_role=${url.searchParams.get("role") === "ADMIN" ? "ADMIN" : "OWNER"}; Path=/; SameSite=Strict`;
      }
      response.writeHead(200, headers);
      response.end(request.method === "HEAD" ? undefined : bytes);
    } catch (error) {
      json({ error: error.message }, error.code === "ENOENT" ? 404 : 500);
    }
  });
  await new Promise((done, reject) => { server.once("error", reject); server.listen(port, "127.0.0.1", done); });
  const address = server.address();
  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    getState: () => structuredClone(state),
    reset: () => { releaseAll(); state = createAdminFixtureState(); },
    control: (values) => Object.assign(state, values),
    holdNext(method, path) {
      let release;
      const promise = new Promise((resolveGate) => { release = resolveGate; });
      const gate = { method, path, promise, release, matched: false };
      gates.push(gate);
      return { release, wasReceived: () => gate.matched };
    },
    releaseAll,
    close: () => new Promise((done, reject) => { releaseAll(); server.closeAllConnections(); server.close((error) => error ? reject(error) : done()); }),
  };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const portFlag = process.argv.indexOf("--port");
  const fixture = await startAdminWorkspaceFixture({ port: portFlag >= 0 ? Number(process.argv[portFlag + 1]) : 4178 });
  console.log(`Admin fixture ready: ${fixture.baseUrl}/admin (synthetic OWNER)`);
  console.log(`Administrator fixture: ${fixture.baseUrl}/admin?role=ADMIN`);
  console.log("All API data and changes remain in memory on this loopback server.");
  for (const signal of ["SIGINT", "SIGTERM"]) process.once(signal, () => { void fixture.close().then(() => process.exit(0)); });
}
