import assert from "node:assert/strict";
import test from "node:test";
import {
  changePassword,
  login,
  register,
  resetPasswordWithRecovery,
  rotateRecoveryCode,
} from "../dist/routes.js";
import { sha256 } from "../dist/security.js";

const SESSION_TOKEN = "A".repeat(43);
const USER_ID = "11111111-1111-4111-8111-111111111111";
const LEGACY_HASH = "L".repeat(43);
const LEGACY_SALT = "s".repeat(22);
const CURRENT_PASSWORD = "current-password-123";
const NEW_PASSWORD = "new-password-456";

function prepared(sql, handlers = {}) {
  return {
    sql,
    values: [],
    bind(...values) {
      this.values = values;
      return this;
    },
    async first() {
      return handlers.first?.(this) ?? null;
    },
    async run() {
      return handlers.run?.(this) ?? { success: true, meta: { changes: 1 } };
    },
    async all() {
      return handlers.all?.(this) ?? { success: true, results: [] };
    },
  };
}

function passwordHasher(validPasswords = new Set([CURRENT_PASSWORD])) {
  const calls = [];
  let hashCount = 0;
  const stub = {
    async fetch(request) {
      const payload = await request.json();
      const path = new URL(request.url).pathname;
      calls.push({ path, payload });
      if (path === "/verify") {
        return Response.json({ valid: validPasswords.has(payload.password) });
      }
      hashCount += 1;
      const hashCharacter = String.fromCharCode(65 + (hashCount % 20));
      const saltCharacter = String.fromCharCode(97 + (hashCount % 20));
      return Response.json({
        hash: hashCharacter.repeat(43),
        salt: saltCharacter.repeat(22),
        iterations: payload.iterations,
      });
    },
  };
  return {
    calls,
    binding: {
      idFromName: (name) => name,
      get: () => stub,
    },
  };
}

function envWith(DB, hasher) {
  return {
    DB,
    PASSWORD_HASHERS: hasher.binding,
    PASSWORD_PEPPER: "password-pepper-longer-than-24-characters",
    IP_HASH_SALT: "ip-hash-salt-longer-than-24-characters",
    STATIC_ORIGIN: "https://jakh.net",
  };
}

function apiRequest(path, body, authenticated = false) {
  return new Request(`https://api.jakh.net${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "cf-connecting-ip": "203.0.113.42",
      ...(authenticated ? { cookie: `__Host-jakh_session=${SESSION_TOKEN}` } : {}),
    },
    body: JSON.stringify(body),
  });
}

function boundStrings(statements) {
  return statements.flatMap((statement) => statement.values)
    .filter((value) => typeof value === "string");
}

function sessionRow() {
  return {
    id: USER_ID,
    username: "tester",
    email: "tester@example.com",
    avatar: "👤",
    role: "USER",
    is_banned: 0,
    token_hash: "stored-current-session-hash",
    sessionCreatedAt: "2026-08-01T00:00:00.000Z",
    adminLastActiveAt: null,
  };
}

function passwordRow() {
  return {
    password_hash: LEGACY_HASH,
    password_salt: LEGACY_SALT,
    password_iterations: 100_000,
  };
}

test("registration atomically creates the user, recovery digest, and session", async () => {
  const batches = [];
  let directWrites = 0;
  const hasher = passwordHasher();
  const DB = {
    prepare(sql) {
      return prepared(sql, {
        first: () => sql.includes("INSERT INTO rate_limits") ? { count: 1 } : null,
        run: () => {
          directWrites += 1;
          return { success: true, meta: { changes: 1 } };
        },
      });
    },
    async batch(statements) {
      batches.push(statements);
      return statements.map(() => ({ success: true, meta: { changes: 1 } }));
    },
  };

  const response = await register(apiRequest("/api/auth/register", {
    username: "Tester",
    password: "registration-password-123",
    email: "TESTER@example.com",
  }), envWith(DB, hasher));
  const payload = await response.json();

  assert.equal(response.status, 201);
  assert.deepEqual(payload.user, {
    id: payload.user.id,
    username: "Tester",
    email: "tester@example.com",
    role: "USER",
  });
  assert.match(payload.user.id, /^[0-9a-f-]{36}$/u);
  assert.match(payload.recoveryCode, /^[A-Za-z0-9_-]{43}$/u);
  assert.match(response.headers.get("set-cookie"), /^__Host-jakh_session=/u);
  assert.equal(batches.length, 1);
  assert.equal(batches[0].length, 3);
  assert.match(batches[0][0].sql, /INSERT INTO users/u);
  assert.match(batches[0][1].sql, /INSERT INTO account_recovery_codes/u);
  assert.match(batches[0][2].sql, /INSERT INTO sessions/u);
  assert.equal(batches[0][0].values[6], 600_000);
  assert.equal(batches[0][1].values[1], await sha256(payload.recoveryCode));
  assert.equal(boundStrings(batches[0]).includes(payload.recoveryCode), false);
  assert.equal(boundStrings(batches[0]).includes("registration-password-123"), false);
  assert.equal(directWrites, 0, "account state must be written only by the one D1 batch");
});

test("a failed registration batch cannot fall through to a partially created account", async () => {
  const batches = [];
  const hasher = passwordHasher();
  const DB = {
    prepare(sql) {
      return prepared(sql, {
        first: () => sql.includes("INSERT INTO rate_limits") ? { count: 1 } : null,
        run: () => { throw new Error("account writes must not run separately"); },
      });
    },
    async batch(statements) {
      batches.push(statements);
      throw new Error("D1 transaction failed");
    },
  };

  await assert.rejects(
    register(apiRequest("/api/auth/register", {
      username: "Tester",
      password: "registration-password-123",
    }), envWith(DB, hasher)),
    /D1 transaction failed/u,
  );
  assert.equal(batches.length, 1);
  assert.equal(batches[0].length, 3);
});

test("invalid login work is padded across unknown, legacy, and active account formats", async () => {
  async function attemptedIterations(user) {
    const hasher = passwordHasher(new Set());
    const DB = {
      prepare(sql) {
        return prepared(sql, {
          first: () => {
            if (sql.includes("INSERT INTO rate_limits")) return { count: 1 };
            if (sql.includes("FROM users WHERE")) return user;
            return null;
          },
        });
      },
      async batch() {
        throw new Error("invalid login must not create a session");
      },
    };
    await assert.rejects(
      login(apiRequest("/api/auth/login", {
        username: "Tester",
        password: "incorrect-password-123",
      }), envWith(DB, hasher)),
      (error) => error?.code === "INVALID_CREDENTIALS",
    );
    return hasher.calls.map((call) => call.payload.iterations);
  }

  assert.deepEqual(await attemptedIterations(null), [100_000, 600_000]);
  assert.deepEqual(await attemptedIterations({
    ...sessionRow(),
    ...passwordRow(),
  }), [100_000, 600_000]);
  assert.deepEqual(await attemptedIterations({
    ...sessionRow(),
    ...passwordRow(),
    password_iterations: 600_000,
  }), [600_000, 100_000]);
});

function recoveryDatabase(initialCodeHash, options = {}) {
  const state = {
    usernameKey: "tester",
    recoveryCodeHash: initialCodeHash,
    batches: [],
    rateLimitWrites: 0,
  };
  const DB = {
    prepare(sql) {
      return prepared(sql, {
        first(statement) {
          if (sql.includes("INSERT INTO rate_limits")) {
            state.rateLimitWrites += 1;
            return { count: 1 };
          }
          if (sql.includes("JOIN account_recovery_codes") && sql.includes("u.username_key")) {
            const [usernameKey, submittedHash] = statement.values;
            if (usernameKey === state.usernameKey && submittedHash === state.recoveryCodeHash) {
              return {
                id: USER_ID,
                username: "tester",
                email: "tester@example.com",
                role: "USER",
                recovery_code_hash: state.recoveryCodeHash,
              };
            }
          }
          return null;
        },
      });
    },
    async batch(statements) {
      state.batches.push(statements);
      if (options.failBatch) throw new Error("D1 transaction failed");
      const recoveryUpdate = statements[3];
      const replacementHash = recoveryUpdate.values[0];
      const submittedHash = recoveryUpdate.values[3];
      const changed = options.forceConcurrentReuse !== true
        && submittedHash === state.recoveryCodeHash;
      if (changed) state.recoveryCodeHash = replacementHash;
      return statements.map((_, index) => index === 3
        ? {
            success: true,
            results: changed ? [{ user_id: USER_ID }] : [],
            meta: { changes: changed ? 1 : 0 },
          }
        : { success: true, meta: { changes: changed ? 1 : 0 } });
    },
  };
  return { DB, state };
}

test("recovery reset consumes the submitted code, revokes sessions, and returns a replacement once", async () => {
  const submittedCode = "R".repeat(43);
  const { DB, state } = recoveryDatabase(await sha256(submittedCode));
  const hasher = passwordHasher();
  const env = envWith(DB, hasher);
  const firstResponse = await resetPasswordWithRecovery(apiRequest("/api/auth/recovery/reset", {
    username: "Tester",
    recoveryCode: submittedCode,
    newPassword: NEW_PASSWORD,
  }), env);
  const firstPayload = await firstResponse.json();

  assert.deepEqual(firstPayload.user, {
    id: USER_ID,
    username: "tester",
    email: "tester@example.com",
    role: "USER",
  });
  assert.match(firstPayload.recoveryCode, /^[A-Za-z0-9_-]{43}$/u);
  assert.notEqual(firstPayload.recoveryCode, submittedCode);
  assert.match(firstResponse.headers.get("set-cookie"), /^__Host-jakh_session=/u);
  assert.equal(state.batches.length, 1);
  assert.equal(state.batches[0].length, 4);
  assert.match(state.batches[0][0].sql, /UPDATE users/u);
  assert.match(state.batches[0][1].sql, /DELETE FROM sessions/u);
  assert.doesNotMatch(state.batches[0][1].sql, /token_hash\s*<>/u);
  assert.match(state.batches[0][2].sql, /INSERT INTO sessions/u);
  assert.match(state.batches[0][3].sql, /UPDATE account_recovery_codes/u);
  assert.equal(state.recoveryCodeHash, await sha256(firstPayload.recoveryCode));
  assert.equal(boundStrings(state.batches[0]).includes(submittedCode), false);
  assert.equal(boundStrings(state.batches[0]).includes(firstPayload.recoveryCode), false);
  assert.equal(boundStrings(state.batches[0]).includes(NEW_PASSWORD), false);
  assert.equal(hasher.calls.find((call) => call.path === "/hash")?.payload.iterations, 600_000);
  assert.equal(state.rateLimitWrites, 2, "both IP and account recovery limits must be enforced");

  await assert.rejects(
    resetPasswordWithRecovery(apiRequest("/api/auth/recovery/reset", {
      username: "Tester",
      recoveryCode: submittedCode,
      newPassword: "another-password-789",
    }), env),
    (error) => error?.status === 401 && error?.code === "RECOVERY_CREDENTIALS_INVALID",
  );

  const replacementResponse = await resetPasswordWithRecovery(apiRequest("/api/auth/recovery/reset", {
    username: "Tester",
    recoveryCode: firstPayload.recoveryCode,
    newPassword: "another-password-789",
  }), env);
  assert.equal(replacementResponse.status, 200, "the replacement is the only usable next code");
});

test("unknown accounts and incorrect recovery codes have the same public failure", async () => {
  const submittedCode = "R".repeat(43);
  const wrongCode = "W".repeat(43);
  const { DB, state } = recoveryDatabase(await sha256(submittedCode));
  const env = envWith(DB, passwordHasher());

  async function capture(username, recoveryCode) {
    try {
      await resetPasswordWithRecovery(apiRequest("/api/auth/recovery/reset", {
        username,
        recoveryCode,
        newPassword: NEW_PASSWORD,
      }), env);
      assert.fail("recovery must fail");
    } catch (error) {
      return { status: error.status, code: error.code, message: error.message };
    }
  }

  const wrong = await capture("Tester", wrongCode);
  const unknown = await capture("Nobody", submittedCode);
  assert.deepEqual(wrong, unknown);
  assert.deepEqual(wrong, {
    status: 401,
    code: "RECOVERY_CREDENTIALS_INVALID",
    message: "Recovery credentials are invalid",
  });
  assert.equal(state.batches.length, 0);
});

test("recovery transaction failures and concurrent code reuse do not return a session", async () => {
  const submittedCode = "R".repeat(43);
  const submittedHash = await sha256(submittedCode);

  for (const scenario of [
    { options: { failBatch: true }, expected: /D1 transaction failed/u },
    { options: { forceConcurrentReuse: true }, expected: "RECOVERY_CREDENTIALS_INVALID" },
  ]) {
    const { DB, state } = recoveryDatabase(submittedHash, scenario.options);
    const operation = resetPasswordWithRecovery(apiRequest("/api/auth/recovery/reset", {
      username: "Tester",
      recoveryCode: submittedCode,
      newPassword: NEW_PASSWORD,
    }), envWith(DB, passwordHasher()));
    if (scenario.expected instanceof RegExp) {
      await assert.rejects(operation, scenario.expected);
    } else {
      await assert.rejects(operation, (error) => error?.code === scenario.expected);
    }
    assert.equal(state.recoveryCodeHash, submittedHash);
    assert.equal(state.batches.length, 1);
  }
});

function authenticatedDatabase(options = {}) {
  const state = { writes: [], batches: [] };
  const DB = {
    prepare(sql) {
      return prepared(sql, {
        first() {
          if (sql.includes("FROM sessions s") && sql.includes("JOIN users u")) return sessionRow();
          if (sql.includes("INSERT INTO rate_limits")) return { count: 1 };
          if (sql.includes("SELECT password_hash")) return passwordRow();
          return null;
        },
        run(statement) {
          state.writes.push(statement);
          const changed = options.conditionalNoop !== true;
          return {
            success: true,
            results: changed ? [{ user_id: USER_ID }] : [],
            meta: { changes: changed ? 1 : 0 },
          };
        },
      });
    },
    async batch(statements) {
      state.batches.push(statements);
      if (options.failBatch) throw new Error("D1 transaction failed");
      const changed = options.conditionalNoop !== true;
      return statements.map((_, index) => index === statements.length - 1
        ? {
            success: true,
            results: changed ? [{ token_hash: "new-session-hash" }] : [],
            meta: { changes: changed ? 1 : 0 },
          }
        : { success: true, meta: { changes: changed ? 1 : 0 } });
    },
  };
  return { DB, state };
}

test("authenticated recovery-code rotation requires the current password and stores only a digest", async () => {
  const { DB, state } = authenticatedDatabase();
  const hasher = passwordHasher();
  const response = await rotateRecoveryCode(apiRequest("/api/auth/recovery/rotate", {
    password: CURRENT_PASSWORD,
  }, true), envWith(DB, hasher));
  const payload = await response.json();

  assert.deepEqual(Object.keys(payload), ["recoveryCode"]);
  assert.match(payload.recoveryCode, /^[A-Za-z0-9_-]{43}$/u);
  assert.equal(state.writes.length, 1);
  assert.match(state.writes[0].sql, /INSERT INTO account_recovery_codes/u);
  assert.match(state.writes[0].sql, /ON CONFLICT\(user_id\) DO UPDATE/u);
  assert.equal(state.writes[0].values[0], await sha256(payload.recoveryCode));
  assert.equal(boundStrings(state.writes).includes(payload.recoveryCode), false);
  assert.equal(boundStrings(state.writes).includes(CURRENT_PASSWORD), false);
  assert.equal(hasher.calls.find((call) => call.path === "/verify")?.payload.iterations, 100_000);
});

test("recovery-code rotation rejects an incorrect password without writing", async () => {
  const { DB, state } = authenticatedDatabase();
  const hasher = passwordHasher(new Set());
  await assert.rejects(
    rotateRecoveryCode(apiRequest("/api/auth/recovery/rotate", {
      password: "incorrect-password-123",
    }, true), envWith(DB, hasher)),
    (error) => error?.status === 401 && error?.code === "CURRENT_PASSWORD_INCORRECT",
  );
  assert.equal(state.writes.length, 0);
});

test("password change atomically revokes every session and issues a rotated current session", async () => {
  const { DB, state } = authenticatedDatabase();
  const hasher = passwordHasher();
  const response = await changePassword(apiRequest("/api/user/password", {
    currentPassword: CURRENT_PASSWORD,
    newPassword: NEW_PASSWORD,
  }, true), envWith(DB, hasher));
  const payload = await response.json();
  const cookie = response.headers.get("set-cookie");
  const rawNewSession = /^__Host-jakh_session=([^;]+)/u.exec(cookie)?.[1];

  assert.deepEqual(payload, { success: true, message: "Password updated successfully" });
  assert.match(rawNewSession, /^[A-Za-z0-9_-]{43}$/u);
  assert.notEqual(rawNewSession, SESSION_TOKEN);
  assert.equal(state.batches.length, 1);
  assert.equal(state.batches[0].length, 3);
  assert.match(state.batches[0][0].sql, /UPDATE users/u);
  assert.match(state.batches[0][1].sql, /DELETE FROM sessions/u);
  assert.doesNotMatch(state.batches[0][1].sql, /token_hash\s*<>/u);
  assert.match(state.batches[0][2].sql, /INSERT INTO sessions/u);
  assert.equal(state.batches[0][0].values[2], 600_000);
  assert.equal(state.batches[0][2].values[0], await sha256(rawNewSession));
  assert.equal(boundStrings(state.batches[0]).includes(rawNewSession), false);
  assert.equal(boundStrings(state.batches[0]).includes(NEW_PASSWORD), false);
});

test("password-change transaction failures and conditional races never return a replacement cookie", async () => {
  for (const scenario of [
    { options: { failBatch: true }, expected: /D1 transaction failed/u },
    { options: { conditionalNoop: true }, expected: "CURRENT_PASSWORD_INCORRECT" },
  ]) {
    const { DB, state } = authenticatedDatabase(scenario.options);
    const operation = changePassword(apiRequest("/api/user/password", {
      currentPassword: CURRENT_PASSWORD,
      newPassword: NEW_PASSWORD,
    }, true), envWith(DB, passwordHasher()));
    if (scenario.expected instanceof RegExp) {
      await assert.rejects(operation, scenario.expected);
    } else {
      await assert.rejects(operation, (error) => error?.code === scenario.expected);
    }
    assert.equal(state.batches.length, 1);
  }
});
