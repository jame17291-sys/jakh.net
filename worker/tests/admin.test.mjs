import assert from "node:assert/strict";
import test from "node:test";
import {
  adminAudit,
  adminContent,
  adminContentRevisions,
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

test("unpublish and restore preserve history while returning edits to draft", async () => {
  const draftJson = JSON.stringify(contentSnapshot);
  const unpublishEnv = adminEnv({
    stepUp: { verifiedAt: new Date().toISOString() },
    contentEdit: {
      questionId: "science-003",
      categorySlug: "science",
      draftJson,
      version: 2,
      publishedSnapshotJson: draftJson,
    },
  });
  const unpublished = await unpublishAdminContent(
    request("/api/admin/content/science-003/unpublish", "POST"),
    unpublishEnv,
    "science-003",
  );
  assert.equal((await unpublished.json()).version, 3);
  assert.match(unpublishEnv.batches[0][0].sql, /published_snapshot_json = NULL/u);
  assert.match(unpublishEnv.batches[0][1].sql, /'UNPUBLISHED'/u);

  const revisionId = "11111111-1111-4111-8111-111111111111";
  const restoreEnv = adminEnv({
    contentEdit: { categorySlug: "science", version: 3 },
    contentRevision: { categorySlug: "science", snapshotJson: draftJson },
  });
  const restored = await restoreAdminContentRevision(
    request("/api/admin/content/science-003/restore", "POST", { revisionId }),
    restoreEnv,
    "science-003",
  );
  assert.equal((await restored.json()).version, 4);
  assert.match(restoreEnv.batches[0][0].sql, /workflow_status = 'DRAFT'/u);
  assert.match(restoreEnv.batches[0][1].sql, /'RESTORED'/u);
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
