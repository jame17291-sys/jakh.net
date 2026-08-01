import assert from "node:assert/strict";
import test from "node:test";
import {
  adminAudit,
  adminUsers,
  revokeNonOwnerSessions,
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
            if (sql.includes("FROM admin_step_ups")) return stepUp;
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
