import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import handler from "../dist/index.js";
import {
  adminAudit,
  adminContent,
  adminContentRevisions,
  adminOverview,
  adminSuggestions,
  adminUsers,
  publishAdminContent,
  revokeNonOwnerSessions,
  restoreAdminContentRevision,
  saveAdminContent,
  unpublishAdminContent,
  updateSuggestion,
  updateUserBan,
  updateUserRole,
} from "../dist/admin.js";

const SESSION_TOKEN = "A".repeat(43);

function request(path, method = "GET", body) {
  return new Request(`https://api.jakh.net${path}`, {
    method,
    headers: {
      cookie: `__Host-jakh_session=${SESSION_TOKEN}`,
      "cf-connecting-ip": "203.0.113.88",
      ...(body === undefined ? {} : { "content-type": "application/json" }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

function adminEnv({
  actorRole = "ADMIN",
  targetRole = "USER",
  stepUp = null,
  suggestionStatus = "new",
  nonOwnerSessionCount = 3,
  contentEdit = null,
  contentRevision = null,
  contentRows = [],
  revisionRows = [],
} = {}) {
  const prepared = [];
  const batches = [];
  const env = {
    IP_HASH_SALT: "ip-hash-salt-longer-than-24-characters",
    DB: {
      prepare(sql) {
        const statement = {
          sql,
          values: [],
          bind(...values) {
            this.values = values;
            return this;
          },
          async first() {
            if (sql.includes("SELECT COUNT(*) AS count") && sql.includes("FROM sessions s") && sql.includes("JOIN users u")) {
              return { count: nonOwnerSessionCount };
            }
            if (sql.includes("FROM sessions s") && sql.includes("JOIN users u")) {
              return {
                id: "actor-1",
                username: "admin",
                email: "admin@example.test",
                avatar: "👤",
                role: actorRole,
                is_banned: 0,
                token_hash: "stored-session-hash",
                sessionCreatedAt: new Date().toISOString(),
                adminLastActiveAt: null,
              };
            }
            if (sql.includes("INSERT INTO rate_limits")) return { count: 1 };
            if (sql.includes("FROM schema_meta")) return { value: "9" };
            if (sql.includes("FROM admin_step_ups")) return stepUp;
            if (sql.includes("FROM content_question_edits WHERE question_id")) return contentEdit;
            if (sql.includes("FROM content_question_revisions WHERE id")) return contentRevision;
            if (sql.includes("SELECT id, role, is_banned")) {
              return { id: "target-1", role: targetRole, isBanned: 0 };
            }
            if (sql.includes("SELECT id, status FROM suggestions")) {
              return { id: "suggestion-1", status: suggestionStatus };
            }
            return null;
          },
          async all() {
            if (sql.includes("FROM users WHERE")) {
              return {
                results: [{
                  id: "member-1",
                  username: "member",
                  email: "member@example.test",
                  role: "USER",
                  isBanned: 0,
                  createdAt: "2026-08-01T00:00:00.000Z",
                  lastLoginAt: null,
                }],
              };
            }
            if (sql.includes("FROM content_question_edits e")) return { results: contentRows };
            if (sql.includes("FROM content_question_revisions r")) return { results: revisionRows };
            return { results: [] };
          },
          async run() { return { success: true }; },
        };
        prepared.push(statement);
        return statement;
      },
      async batch(statements) {
        batches.push(statements);
        return [{ success: true }];
      },
    },
  };
  return { ...env, prepared, batches };
}

function peopleQuery(env) {
  return env.prepared.find((statement) => statement.sql.includes("FROM users WHERE"));
}

function auditDetail(env) {
  const statement = env.batches.flat().find((item) => item.sql.includes("INSERT INTO admin_audit_log"));
  return JSON.parse(statement.values[5]);
}

test("administrators receive people records without contact email", async () => {
  const response = await adminUsers(request("/api/admin/users"), adminEnv());
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.permissions.canViewEmail, false);
  assert.equal(body.users[0].email, null);
});

test("people search is username-only for administrators and includes email for owners", async () => {
  const search = "member@example.test";
  const admin = adminEnv();
  await adminUsers(request(`/api/admin/users?search=${encodeURIComponent(search)}`), admin);
  assert.match(peopleQuery(admin).sql, /username LIKE \? ESCAPE '\\'/);
  assert.doesNotMatch(peopleQuery(admin).sql, /email LIKE \?/);
  assert.deepEqual(peopleQuery(admin).values.slice(0, 1), [`%${search}%`]);

  const owner = adminEnv({ actorRole: "OWNER" });
  await adminUsers(request(`/api/admin/users?search=${encodeURIComponent(search)}`), owner);
  assert.match(peopleQuery(owner).sql, /username LIKE \? ESCAPE '\\' OR email LIKE \? ESCAPE '\\'/);
  assert.deepEqual(peopleQuery(owner).values.slice(0, 2), [`%${search}%`, `%${search}%`]);
});

test("owner role changes require a recent password confirmation", async () => {
  await assert.rejects(
    updateUserRole(
      request("/api/admin/users/target-1/role", "PATCH", { role: "ADMIN" }),
      adminEnv({ actorRole: "OWNER" }),
      "target-1",
    ),
    (error) => error?.status === 401 && error?.code === "STEP_UP_REQUIRED",
  );
});

test("an administrator cannot suspend a peer administrator", async () => {
  await assert.rejects(
    updateUserBan(
      request("/api/admin/users/target-1/ban", "PATCH", { banned: true }),
      adminEnv({
        actorRole: "ADMIN",
        targetRole: "ADMIN",
        stepUp: { verifiedAt: new Date().toISOString() },
      }),
      "target-1",
    ),
    (error) => error?.status === 403 && error?.code === "ADMIN_PROTECTED",
  );
});

test("audit history remains owner-only", async () => {
  await assert.rejects(
    adminAudit(request("/api/admin/audit"), adminEnv({ actorRole: "ADMIN" })),
    (error) => error?.status === 403 && error?.code === "OWNER_REQUIRED",
  );
});

test("admin mutations record an optional human-readable reason", async () => {
  const reason = "Reviewed the supporting evidence.";
  const roleEnv = adminEnv({ actorRole: "OWNER", stepUp: { verifiedAt: new Date().toISOString() } });
  await updateUserRole(
    request("/api/admin/users/target-1/role", "PATCH", { role: "ADMIN", reason }),
    roleEnv,
    "target-1",
  );
  assert.equal(auditDetail(roleEnv).reason, reason);

  const banEnv = adminEnv({ stepUp: { verifiedAt: new Date().toISOString() } });
  await updateUserBan(
    request("/api/admin/users/target-1/ban", "PATCH", { banned: true, reason }),
    banEnv,
    "target-1",
  );
  assert.equal(auditDetail(banEnv).reason, reason);

  const feedbackEnv = adminEnv();
  await updateSuggestion(
    request("/api/admin/suggestions/suggestion-1", "PATCH", { status: "reviewed", reason }),
    feedbackEnv,
    "suggestion-1",
  );
  assert.equal(auditDetail(feedbackEnv).reason, reason);

  const revokeEnv = adminEnv({ actorRole: "OWNER", stepUp: { verifiedAt: new Date().toISOString() } });
  await revokeNonOwnerSessions(
    request("/api/admin/security/revoke-non-owner-sessions", "POST", { reason }),
    revokeEnv,
  );
  assert.equal(auditDetail(revokeEnv).reason, reason);
});

test("audit reasons are optional and bounded", async () => {
  const env = adminEnv({ actorRole: "OWNER", stepUp: { verifiedAt: new Date().toISOString() } });
  const response = await updateUserRole(
    request("/api/admin/users/target-1/role", "PATCH", { role: "ADMIN" }),
    env,
    "target-1",
  );
  assert.equal(response.status, 200);
  assert.equal("reason" in auditDetail(env), false);

  const revokeEnv = adminEnv({ actorRole: "OWNER", stepUp: { verifiedAt: new Date().toISOString() } });
  const revokeResponse = await revokeNonOwnerSessions(
    request("/api/admin/security/revoke-non-owner-sessions", "POST"),
    revokeEnv,
  );
  assert.equal(revokeResponse.status, 200);
  assert.equal("reason" in auditDetail(revokeEnv), false);

  await assert.rejects(
    updateUserBan(
      request("/api/admin/users/target-1/ban", "PATCH", { banned: true, reason: "x".repeat(281) }),
      adminEnv({ stepUp: { verifiedAt: new Date().toISOString() } }),
      "target-1",
    ),
    (error) => error?.status === 400 && error?.code === "AUDIT_REASON_INVALID",
  );
});

const contentSnapshot = {
  question: {
    en: "What change turns a gas into a liquid?",
    ar: "ما اسم تحوّل الغاز إلى سائل؟",
  },
  answer: { en: "Condensation", ar: "التكاثف" },
  explanation: {
    en: "Cooling a gas can turn it into a liquid.",
    ar: "عندما يبرد الغاز قد يتكاثف ويتحوّل إلى سائل.",
  },
  sources: [{
    title: "Water cycle",
    publisher: "Science institution",
    url: "https://example.edu/water-cycle",
  }],
};

test("Content Studio saves a private bilingual draft with an immutable revision", async () => {
  const env = adminEnv();
  const response = await saveAdminContent(
    request("/api/admin/content/science-003", "PUT", {
      categorySlug: "science",
      workflowStatus: "IN_REVIEW",
      content: contentSnapshot,
    }),
    env,
    "science-003",
  );
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    success: true,
    questionId: "science-003",
    categorySlug: "science",
    version: 1,
    workflowStatus: "IN_REVIEW",
    revisionId: env.batches[0][1].values[0],
  });
  const editInsert = env.batches[0][0];
  assert.doesNotMatch(editInsert.sql, /published_snapshot_json/u, "saving a draft must not write the public snapshot");
  assert.deepEqual(JSON.parse(editInsert.values[2]), contentSnapshot);
  assert.match(env.batches[0][1].sql, /content_question_revisions/u);
  assert.equal(env.batches[0][1].values[4], "SUBMITTED");
});

test("Content Studio rejects non-catalog cards and unsafe source URLs", async () => {
  await assert.rejects(
    saveAdminContent(
      request("/api/admin/content/unknown-card", "PUT", {
        categorySlug: "science",
        content: contentSnapshot,
      }),
      adminEnv(),
      "unknown-card",
    ),
    (error) => error?.status === 400 && error?.code === "CARD_CATEGORY_MISMATCH",
  );
  await assert.rejects(
    saveAdminContent(
      request("/api/admin/content/science-003", "PUT", {
        categorySlug: "science",
        content: {
          ...contentSnapshot,
          sources: [{ ...contentSnapshot.sources[0], url: "http://example.edu/water-cycle" }],
        },
      }),
      adminEnv(),
      "science-003",
    ),
    (error) => error?.status === 400 && error?.code === "CONTENT_SOURCE_URL_INVALID",
  );
});

test("publishing requires review and creates the explicit approved snapshot", async () => {
  const draftJson = JSON.stringify(contentSnapshot);
  const env = adminEnv({
    stepUp: { verifiedAt: new Date().toISOString() },
    contentEdit: {
      questionId: "science-003",
      categorySlug: "science",
      draftJson,
      workflowStatus: "IN_REVIEW",
      version: 2,
      publishedVersion: null,
      editorUserId: "another-admin",
    },
  });
  const response = await publishAdminContent(
    request("/api/admin/content/science-003/publish", "POST"),
    env,
    "science-003",
  );
  assert.equal(response.status, 200);
  assert.equal((await response.json()).changed, true);
  assert.match(env.batches[0][0].sql, /published_snapshot_json = draft_json/u);
  assert.match(env.batches[0][1].sql, /'PUBLISHED'/u);
  assert.equal(auditDetail(env).reviewMode, "independent");

  await assert.rejects(
    publishAdminContent(
      request("/api/admin/content/science-003/publish", "POST"),
      adminEnv({
        stepUp: { verifiedAt: new Date().toISOString() },
        contentEdit: { questionId: "science-003", categorySlug: "science", draftJson, workflowStatus: "DRAFT", version: 3, publishedVersion: null },
      }),
      "science-003",
    ),
    (error) => error?.status === 409 && error?.code === "CONTENT_REVIEW_REQUIRED",
  );

  await assert.rejects(
    publishAdminContent(
      request("/api/admin/content/science-003/publish", "POST"),
      adminEnv({
        stepUp: { verifiedAt: new Date().toISOString() },
        contentEdit: {
          questionId: "science-003",
          categorySlug: "science",
          draftJson: JSON.stringify({ ...contentSnapshot, sources: [] }),
          workflowStatus: "IN_REVIEW",
          version: 4,
          publishedVersion: null,
        },
      }),
      "science-003",
    ),
    (error) => error?.status === 409 && error?.code === "CONTENT_SOURCES_REQUIRED",
  );
});

test("Content Studio enforces independent approval and records owner overrides", async () => {
  const draftJson = JSON.stringify(contentSnapshot);
  const selfAuthoredDraft = {
    questionId: "science-003",
    categorySlug: "science",
    draftJson,
    workflowStatus: "IN_REVIEW",
    version: 2,
    publishedVersion: null,
    editorUserId: "actor-1",
  };

  const selfPublishEnv = adminEnv({
    stepUp: { verifiedAt: new Date().toISOString() },
    contentEdit: selfAuthoredDraft,
  });
  await assert.rejects(
    publishAdminContent(
      request("/api/admin/content/science-003/publish", "POST", { reason: "I reviewed my own work." }),
      selfPublishEnv,
      "science-003",
    ),
    (error) => error?.status === 403 && error?.code === "CONTENT_SELF_PUBLISH_FORBIDDEN",
  );
  assert.equal(selfPublishEnv.batches.length, 0);

  await assert.rejects(
    publishAdminContent(
      request("/api/admin/content/science-003/publish", "POST"),
      adminEnv({
        actorRole: "OWNER",
        stepUp: { verifiedAt: new Date().toISOString() },
        contentEdit: selfAuthoredDraft,
      }),
      "science-003",
    ),
    (error) => error?.status === 400 && error?.code === "CONTENT_OWNER_OVERRIDE_REASON_REQUIRED",
  );

  await assert.rejects(
    publishAdminContent(
      request("/api/admin/content/science-003/publish", "POST", { reason: "   " }),
      adminEnv({
        actorRole: "OWNER",
        stepUp: { verifiedAt: new Date().toISOString() },
        contentEdit: selfAuthoredDraft,
      }),
      "science-003",
    ),
    (error) => error?.status === 400 && error?.code === "AUDIT_REASON_INVALID",
  );

  const ownerOverrideEnv = adminEnv({
    actorRole: "OWNER",
    stepUp: { verifiedAt: new Date().toISOString() },
    contentEdit: selfAuthoredDraft,
  });
  const reason = "Emergency correction after verifying the Arabic and English sources.";
  const response = await publishAdminContent(
    request("/api/admin/content/science-003/publish", "POST", { reason }),
    ownerOverrideEnv,
    "science-003",
  );
  assert.equal((await response.json()).changed, true);
  assert.deepEqual(auditDetail(ownerOverrideEnv), {
    categorySlug: "science",
    version: 2,
    reviewMode: "owner_override",
    reason,
  });
});

test("unpublish and restore preserve history while returning edits to draft", async () => {
  const draftJson = JSON.stringify(contentSnapshot);
  const publishedDraft = {
    questionId: "science-003",
    categorySlug: "science",
    draftJson,
    version: 2,
    publishedSnapshotJson: draftJson,
  };
  await assert.rejects(
    unpublishAdminContent(
      request("/api/admin/content/science-003/unpublish", "POST"),
      adminEnv({
        stepUp: { verifiedAt: new Date().toISOString() },
        contentEdit: publishedDraft,
      }),
      "science-003",
    ),
    (error) => error?.status === 400 && error?.code === "CONTENT_UNPUBLISH_REASON_REQUIRED",
  );

  const unpublishEnv = adminEnv({
    stepUp: { verifiedAt: new Date().toISOString() },
    contentEdit: publishedDraft,
  });
  const unpublishReason = "The answer needs correction before it remains live.";
  const unpublished = await unpublishAdminContent(
    request("/api/admin/content/science-003/unpublish", "POST", { reason: unpublishReason }),
    unpublishEnv,
    "science-003",
  );
  assert.equal((await unpublished.json()).version, 3);
  assert.match(unpublishEnv.batches[0][0].sql, /published_snapshot_json = NULL/u);
  assert.match(unpublishEnv.batches[0][1].sql, /'UNPUBLISHED'/u);
  assert.equal(auditDetail(unpublishEnv).reason, unpublishReason);

  const revisionId = "11111111-1111-4111-8111-111111111111";
  const restoreEnv = adminEnv({
    contentEdit: { categorySlug: "science", version: 3 },
    contentRevision: { categorySlug: "science", snapshotJson: draftJson },
  });
  await assert.rejects(
    restoreAdminContentRevision(
      request("/api/admin/content/science-003/restore", "POST", { revisionId }),
      restoreEnv,
      "science-003",
    ),
    (error) => error?.status === 400 && error?.code === "CONTENT_RESTORE_REASON_REQUIRED",
  );
  const restoreReason = "Restore the previously reviewed bilingual version after checking its sources.";
  const restored = await restoreAdminContentRevision(
    request("/api/admin/content/science-003/restore", "POST", { revisionId, reason: restoreReason }),
    restoreEnv,
    "science-003",
  );
  assert.equal((await restored.json()).version, 4);
  assert.match(restoreEnv.batches[0][0].sql, /workflow_status = 'DRAFT'/u);
  assert.match(restoreEnv.batches[0][1].sql, /'RESTORED'/u);
  assert.equal(auditDetail(restoreEnv).reason, restoreReason);
});

test("Content Studio list and revision history expose parsed, non-secret records", async () => {
  const now = "2026-08-03T00:00:00.000Z";
  const env = adminEnv({
    contentRows: [{
      questionId: "science-003",
      categorySlug: "science",
      draftJson: JSON.stringify(contentSnapshot),
      workflowStatus: "IN_REVIEW",
      version: 2,
      publishedVersion: null,
      publishedSnapshotJson: null,
      editorUsername: "editor",
      reviewerUsername: null,
      createdAt: now,
      updatedAt: now,
      publishedAt: null,
    }],
    revisionRows: [{
      id: "11111111-1111-4111-8111-111111111111",
      questionId: "science-003",
      categorySlug: "science",
      version: 2,
      action: "SUBMITTED",
      snapshotJson: JSON.stringify(contentSnapshot),
      actorUsername: "editor",
      createdAt: now,
    }],
  });
  const list = await adminContent(request("/api/admin/content?category=science&status=IN_REVIEW"), env);
  assert.equal((await list.json()).edits[0].draft.question.ar, contentSnapshot.question.ar);
  const history = await adminContentRevisions(
    request("/api/admin/content/science-003/revisions"),
    env,
    "science-003",
  );
  assert.equal((await history.json()).revisions[0].snapshot.answer.ar, "التكاثف");
});

test("Content Studio handles updated drafts and idempotent publication actions", async () => {
  const updatedEnv = adminEnv({
    contentEdit: { questionId: "science-003", categorySlug: "science", version: 4 },
  });
  const updated = await saveAdminContent(
    request("/api/admin/content/science-003", "PUT", {
      categorySlug: "science",
      workflowStatus: "DRAFT",
      content: { ...contentSnapshot, sources: undefined },
    }),
    updatedEnv,
    "science-003",
  );
  assert.equal((await updated.json()).version, 5);
  assert.equal(updatedEnv.batches[0][1].values[4], "UPDATED");

  const publishedEnv = adminEnv({
    stepUp: { verifiedAt: new Date().toISOString() },
    contentEdit: {
      questionId: "science-003",
      categorySlug: "science",
      draftJson: JSON.stringify(contentSnapshot),
      workflowStatus: "PUBLISHED",
      version: 5,
      publishedVersion: 5,
    },
  });
  assert.deepEqual(await (await publishAdminContent(
    request("/api/admin/content/science-003/publish", "POST"),
    publishedEnv,
    "science-003",
  )).json(), { success: true, changed: false, version: 5 });
  assert.equal(publishedEnv.batches.length, 0);

  const unpublishedEnv = adminEnv({
    stepUp: { verifiedAt: new Date().toISOString() },
    contentEdit: {
      questionId: "science-003",
      categorySlug: "science",
      draftJson: JSON.stringify(contentSnapshot),
      version: 5,
      publishedSnapshotJson: null,
    },
  });
  assert.deepEqual(await (await unpublishAdminContent(
    request("/api/admin/content/science-003/unpublish", "POST"),
    unpublishedEnv,
    "science-003",
  )).json(), { success: true, changed: false, version: 5 });
  assert.equal(unpublishedEnv.batches.length, 0);
});

async function persistedAdminEnv(t, role = "ADMIN", schemaVersion = 9) {
  const database = new DatabaseSync(":memory:");
  t.after(() => database.close());
  database.exec("PRAGMA foreign_keys = ON");
  const migrationsDirectory = new URL("../migrations/", import.meta.url);
  const migrations = (await readdir(migrationsDirectory))
    .filter((name) => /^\d{4}_.+\.sql$/u.test(name) && Number(name.slice(0, 4)) <= schemaVersion)
    .sort();
  for (const name of migrations) database.exec(await readFile(new URL(name, migrationsDirectory), "utf8"));
  const now = new Date().toISOString();
  database.prepare(
    `INSERT INTO users (id, username, username_key, email, password_hash, password_salt,
                        password_iterations, role, created_at, updated_at)
     VALUES ('actor-1', 'admin', 'admin', 'admin@example.test', 'private-hash', 'private-salt', 100000, ?, ?, ?)`,
  ).run(role, now, now);
  database.prepare(
    "INSERT INTO sessions (token_hash, user_id, created_at, expires_at) VALUES (?, 'actor-1', ?, ?)",
  ).run(createHash("sha256").update(SESSION_TOKEN).digest("base64url"), now, new Date(Date.now() + 60_000).toISOString());
  const queries = [];
  const env = {
    IP_HASH_SALT: "ip-hash-salt-longer-than-24-characters",
    DB: {
      prepare(sql) {
        queries.push(sql);
        const statement = database.prepare(sql);
        return {
          values: [],
          bind(...values) { this.values = values; return this; },
          async first() { return statement.get(...this.values) || null; },
          async all() { return { results: statement.all(...this.values), success: true }; },
          async run() { return { meta: statement.run(...this.values), success: true }; },
        };
      },
      async batch(statements) {
        database.exec("BEGIN");
        try {
          const results = [];
          for (const statement of statements) results.push(await statement.run());
          database.exec("COMMIT");
          return results;
        } catch (error) {
          database.exec("ROLLBACK");
          throw error;
        }
      },
    },
  };
  return { database, env, queries };
}

function insertSuggestion(database, id = "suggestion-1", status = "new", createdAt = "2026-09-23T10:00:00.000Z") {
  database.prepare(
    "INSERT INTO suggestions (id, text, email, status, created_at) VALUES (?, 'Question needs review', 'reporter@example.test', ?, ?)",
  ).run(id, status, createdAt);
}

test("overview counts editorial work separately from live overrides and returns only the latest eight edits", async (t) => {
  const { database, env, queries } = await persistedAdminEnv(t);
  const empty = await (await adminOverview(request("/api/admin/overview"), env)).json();
  assert.equal(empty.editorialAvailable, true);
  assert.deepEqual(empty.editorial, { drafts: 0, inReview: 0, publishedOverrides: 0 });
  assert.deepEqual(empty.recentEdits, []);

  for (let index = 0; index < 12; index += 1) {
    const workflowStatus = ["DRAFT", "IN_REVIEW", "PUBLISHED"][index % 3];
    const published = workflowStatus === "PUBLISHED" || index < 2;
    const updatedAt = `2026-09-${String(index + 1).padStart(2, "0")}T10:00:00.000Z`;
    database.prepare(
      `INSERT INTO content_question_edits (question_id, category_slug, draft_json, workflow_status,
       version, published_version, published_snapshot_json, editor_user_id, created_at, updated_at, published_at)
       VALUES (?, 'science', ?, ?, 3, ?, ?, 'actor-1', ?, ?, ?)`,
    ).run(`science-${index}`, JSON.stringify(contentSnapshot), workflowStatus,
      published ? 2 : null, published ? JSON.stringify(contentSnapshot) : null,
      updatedAt, updatedAt, published ? updatedAt : null);
  }
  insertSuggestion(database);
  const body = await (await adminOverview(request("/api/admin/overview"), env)).json();
  assert.deepEqual(body.editorial, { drafts: 4, inReview: 4, publishedOverrides: 6 });
  assert.equal(body.metrics.pendingSuggestions, 1);
  assert.deepEqual(body.recentEdits.map((row) => row.questionId), Array.from({ length: 8 }, (_, i) => `science-${11 - i}`));
  assert.deepEqual(Object.keys(body.recentEdits[0]).sort(), [
    "questionId", "categorySlug", "workflowStatus", "version", "publishedVersion", "editorUsername", "updatedAt",
  ].sort());
  assert.equal(body.recentEdits[0].editorUsername, "admin");
  assert.equal(body.recentUsers[0].email, null);
  assert.equal(body.recentSuggestions[0].email, null);
  assert.equal("resolutionNote" in body.recentSuggestions[0], false);
  assert.equal(queries.filter((sql) => sql.includes("FROM schema_meta")).length, 2, "read schema once per overview request");
  assert.equal(queries.some((sql) => sql.includes("admin_audit_log")), false, "overview must not query feedback resolution history");
  assert.doesNotMatch(JSON.stringify(body), /private-hash|private-salt|draftJson/u);
});

test("schema 8 overview keeps account and feedback data available without touching editorial tables or audit history", async (t) => {
  const { database, env, queries } = await persistedAdminEnv(t, "ADMIN", 8);
  insertSuggestion(database);
  const response = await adminOverview(request("/api/admin/overview"), env);
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.editorialAvailable, false);
  assert.equal(body.editorial, null);
  assert.deepEqual(body.recentEdits, []);
  assert.equal(body.metrics.users, 1);
  assert.equal(body.metrics.administrators, 1);
  assert.equal(body.metrics.pendingSuggestions, 1);
  assert.equal(body.recentUsers[0].username, "admin");
  assert.equal(body.recentUsers[0].email, null);
  assert.equal(body.recentSuggestions[0].text, "Question needs review");
  assert.equal(body.recentSuggestions[0].email, null);
  assert.equal("resolutionNote" in body.recentSuggestions[0], false);
  assert.equal(queries.filter((sql) => sql.includes("FROM schema_meta")).length, 1);
  assert.equal(queries.some((sql) => /content_question_edits|admin_audit_log/u.test(sql)), false);
});

test("resolution notes survive reload and same-status saves without exposing audit details or contact emails", async (t) => {
  const { database, env } = await persistedAdminEnv(t);
  insertSuggestion(database);
  const changed = await updateSuggestion(request("/api/admin/suggestions/suggestion-1", "PATCH", {
    status: "reviewed", reason: "  Compared both languages with the source.  ",
  }), env, "suggestion-1");
  assert.deepEqual(await changed.json(), { success: true, changed: true, noteSaved: true });

  await updateSuggestion(request("/api/admin/suggestions/suggestion-1", "PATCH", { status: "implemented" }), env, "suggestion-1");
  let body = await (await adminSuggestions(request("/api/admin/suggestions"), env)).json();
  assert.equal(body.suggestions[0].resolutionNote.text, "Compared both languages with the source.");

  const noteOnly = await updateSuggestion(request("/api/admin/suggestions/suggestion-1", "PATCH", {
    status: "implemented", reason: "Published the independently reviewed correction.",
  }), env, "suggestion-1");
  assert.deepEqual(await noteOnly.json(), { success: true, changed: true, noteSaved: true });
  const audit = database.prepare("SELECT action, detail, created_at FROM admin_audit_log ORDER BY rowid DESC LIMIT 1").get();
  assert.equal(audit.action, "suggestion.note_added");
  assert.deepEqual(JSON.parse(audit.detail), { status: "implemented", reason: "Published the independently reviewed correction." });

  body = await (await adminSuggestions(request("/api/admin/suggestions?status=implemented"), env)).json();
  assert.equal(body.suggestions[0].status, "implemented");
  assert.equal(body.suggestions[0].email, null);
  assert.deepEqual(body.suggestions[0].resolutionNote, {
    text: "Published the independently reviewed correction.", authorUsername: "admin", createdAt: audit.created_at,
  });
  assert.deepEqual(Object.keys(body.suggestions[0]).sort(), ["id", "text", "email", "status", "createdAt", "resolutionNote"].sort());
  const overview = await (await adminOverview(request("/api/admin/overview"), env)).json();
  assert.equal("resolutionNote" in overview.recentSuggestions[0], false);

  database.prepare("UPDATE users SET role = 'OWNER' WHERE id = 'actor-1'").run();
  body = await (await adminSuggestions(request("/api/admin/suggestions"), env)).json();
  assert.equal(body.suggestions[0].email, "reporter@example.test");
  assert.equal(body.permissions.canViewEmail, true);
});

test("latest valid note ignores empty legacy details, malformed reasons, and unrelated audit events", async (t) => {
  const { database, env } = await persistedAdminEnv(t);
  insertSuggestion(database);
  insertSuggestion(database, "suggestion-2", "reviewed", "2026-09-22T10:00:00.000Z");
  const insert = database.prepare(
    `INSERT INTO admin_audit_log (id, actor_user_id, action, target_type, target_id, detail, created_at)
     VALUES (?, NULL, ?, ?, ?, ?, '2026-09-23T10:00:00.000Z')`,
  );
  insert.run("valid", "suggestion.status_changed", "suggestion", "suggestion-1", JSON.stringify({ reason: "Verified the replacement wording.", privateDetail: "never disclose" }));
  for (const [index, detail] of ["", "invalid-json", JSON.stringify({}), JSON.stringify({ reason: 5 }),
    JSON.stringify({ reason: "   " }), JSON.stringify({ reason: "bad\nline" }), JSON.stringify({ reason: "nul\u0000char" }),
    JSON.stringify({ reason: "x".repeat(281) })].entries()) {
    insert.run(`invalid-${index}`, "suggestion.note_added", "suggestion", "suggestion-1", detail);
  }
  insert.run("unrelated-action", "user.role_changed", "suggestion", "suggestion-1", JSON.stringify({ reason: "Do not disclose" }));
  insert.run("unrelated-type", "suggestion.note_added", "user", "suggestion-1", JSON.stringify({ reason: "Do not disclose" }));
  insert.run("another-note", "suggestion.note_added", "suggestion", "suggestion-2", JSON.stringify({ reason: "A different report." }));
  const body = await (await adminSuggestions(request("/api/admin/suggestions?limit=1"), env)).json();
  assert.equal(body.nextOffset, 1);
  assert.deepEqual(body.suggestions[0].resolutionNote, {
    text: "Verified the replacement wording.", authorUsername: null, createdAt: "2026-09-23T10:00:00.000Z",
  });
  assert.doesNotMatch(JSON.stringify(body), /never disclose|Do not disclose|A different report/u);
});

test("unchanged status without a reason is a no-op and invalid notes never write", async (t) => {
  const { database, env } = await persistedAdminEnv(t);
  insertSuggestion(database);
  const unchanged = await updateSuggestion(request("/api/admin/suggestions/suggestion-1", "PATCH", { status: "new" }), env, "suggestion-1");
  assert.deepEqual(await unchanged.json(), { success: true, changed: false });
  for (const reason of ["", "   ", "x".repeat(281), "line\nbreak", 42]) {
    await assert.rejects(updateSuggestion(request("/api/admin/suggestions/suggestion-1", "PATCH", { status: "reviewed", reason }), env, "suggestion-1"),
      (error) => error?.status === 400 && error?.code === "AUDIT_REASON_INVALID");
  }
  assert.equal(database.prepare("SELECT COUNT(*) AS count FROM admin_audit_log").get().count, 0);
  assert.equal(database.prepare("SELECT status FROM suggestions").get().status, "new");
});

test("editorial overview and feedback notes remain inaccessible to regular users and signed-out visitors", async (t) => {
  const { database, env } = await persistedAdminEnv(t, "USER");
  insertSuggestion(database);
  const calls = [
    () => adminOverview(request("/api/admin/overview"), env),
    () => adminSuggestions(request("/api/admin/suggestions"), env),
    () => updateSuggestion(request("/api/admin/suggestions/suggestion-1", "PATCH", { status: "new", reason: "Unauthorized note" }), env, "suggestion-1"),
  ];
  for (const call of calls) await assert.rejects(call(), (error) => error?.status === 403 && error?.code === "ADMIN_REQUIRED");
  database.prepare("DELETE FROM sessions").run();
  for (const call of calls) await assert.rejects(call(), (error) => error?.status === 401);
  assert.equal(database.prepare("SELECT COUNT(*) AS count FROM admin_audit_log").get().count, 0);
  assert.equal(database.prepare("SELECT status FROM suggestions").get().status, "new");
});

test("the dispatcher saves feedback notes for generated token and UUID IDs while enforcing authentication and origin", async (t) => {
  const { database, env } = await persistedAdminEnv(t);
  Object.assign(env, {
    PASSWORD_PEPPER: "password-pepper-longer-than-24-characters",
    ALLOWED_ORIGINS: "https://riddlearabia.com",
    STATIC_ORIGIN: "https://riddlearabia.com",
  });
  const tokenId = "ab_-CD0123456789efGHijkl";
  const uuidId = "11111111-1111-4111-8111-111111111111";
  function updateRequest(id, { origin = "https://riddlearabia.com", authenticated = true } = {}) {
    return new Request(`https://api.jakh.net/api/admin/suggestions/${id}`, {
      method: "PATCH",
      headers: {
        origin,
        "content-type": "application/json",
        ...(authenticated ? { cookie: `__Host-jakh_session=${SESSION_TOKEN}` } : {}),
      },
      body: JSON.stringify({ status: "reviewed", reason: "Checked the original report." }),
    });
  }
  for (const id of [tokenId, uuidId]) {
    insertSuggestion(database, id);
    const response = await handler.fetch(updateRequest(id), env);
    assert.equal(response.status, 200);
    assert.equal((await response.json()).noteSaved, true);
    assert.equal(database.prepare("SELECT status FROM suggestions WHERE id = ?").get(id).status, "reviewed");
  }
  for (const id of ["short", "a".repeat(23), "a".repeat(25), "z".repeat(36), "111111111111411181111111111111111111", `${tokenId}/extra`]) {
    const response = await handler.fetch(updateRequest(id), env);
    assert.equal(response.status, 404, `reject malformed ID ${id}`);
  }
  assert.equal((await handler.fetch(updateRequest(tokenId, { authenticated: false }), env)).status, 401);
  assert.equal((await handler.fetch(updateRequest(tokenId, { origin: "https://untrusted.example" }), env)).status, 403);
  database.prepare("UPDATE users SET role = 'USER' WHERE id = 'actor-1'").run();
  const forbidden = await handler.fetch(updateRequest(tokenId), env);
  assert.equal(forbidden.status, 403);
  assert.equal((await forbidden.json()).code, "ADMIN_REQUIRED");
  assert.equal(database.prepare("SELECT COUNT(*) AS count FROM admin_audit_log").get().count, 2);
});
