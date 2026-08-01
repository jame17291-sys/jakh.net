import assert from "node:assert/strict";
import test from "node:test";
import { adminAudit, adminUsers, updateUserBan, updateUserRole } from "../dist/admin.js";

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

function adminEnv({ actorRole = "ADMIN", targetRole = "USER", stepUp = null } = {}) {
  return {
    IP_HASH_SALT: "ip-hash-salt-longer-than-24-characters",
    DB: {
      prepare(sql) {
        return {
          bind() { return this; },
          async first() {
            if (sql.includes("FROM sessions s") && sql.includes("JOIN users u")) {
              return {
                id: "actor-1",
                username: "admin",
                email: "admin@example.test",
                avatar: "👤",
                role: actorRole,
                is_banned: 0,
                token_hash: "stored-session-hash",
              };
            }
            if (sql.includes("INSERT INTO rate_limits")) return { count: 1 };
            if (sql.includes("FROM admin_step_ups")) return stepUp;
            if (sql.includes("SELECT id, role, is_banned")) {
              return { id: "target-1", role: targetRole, isBanned: 0 };
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
      },
      async batch() { return [{ success: true }]; },
    },
  };
}

test("administrators receive people records without contact email", async () => {
  const response = await adminUsers(request("/api/admin/users"), adminEnv());
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.permissions.canViewEmail, false);
  assert.equal(body.users[0].email, null);
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
