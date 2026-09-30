import assert from "node:assert/strict";
import test from "node:test";
import {
  runSyntheticAccountMonitor,
  SYNTHETIC_ACCOUNT_PREFIX,
  SYNTHETIC_CONFIRMATION,
  SyntheticMonitorError,
  syntheticConfigFromEnv,
} from "./synthetic-account-monitor.mjs";

const COMMIT = "b".repeat(40);
const WORKER_VERSION = "11111111-2222-3333-4444-555555555555";

function json(payload, status = 200, headers = {}) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });
}

function mockApi({ failPath = null, cleanupFails = false, passwordFailure = null, missingRegistrationCookie = false, retainOldSession = false } = {}) {
  const state = {
    exists: false,
    username: null,
    password: null,
    cookie: "jakh_session=synthetic-session",
    deleted: [],
    requests: [],
    analytics: "denied",
    cookies: new Set(),
    initialPassword: null,
    nextPassword: null,
    logins: 0,
  };
  const fetchImpl = async (input, init = {}) => {
    const url = new URL(input);
    const method = init.method || "GET";
    const path = url.pathname;
    const body = init.body ? JSON.parse(init.body) : null;
    const cookie = new Headers(init.headers).get("cookie");
    state.requests.push({ method, path, body, cookie });
    if (failPath === path && method !== "DELETE") return json({ code: "INJECTED" }, 500);

    if (path === "/api/health") {
      return json({
        ok: true,
        schema: "10",
        targetSchema: "10",
        workerVersionId: WORKER_VERSION,
        features: { registration: true, accountRecovery: true, accountDeletion: true, contentStudio: true, adminMfa: true },
      });
    }
    if (path === "/api/auth/register") {
      assert.match(body.username, /^jakh_synth_[0-9a-f]{9}$/u);
      assert.equal(Object.hasOwn(body, "email"), false);
      state.exists = true;
      state.username = body.username;
      state.password = body.password;
      state.initialPassword = body.password;
      state.cookies.add(state.cookie);
      return json({
        user: { username: body.username },
        recoveryCode: "A".repeat(43),
      }, 201, missingRegistrationCookie ? {} : { "set-cookie": `${state.cookie}; Path=/; HttpOnly` });
    }
    if (path === "/api/auth/login") {
      assert.equal(Object.hasOwn(body, "identifier"), false, "real login API expects username");
      assert.equal(body.username, state.username);
      if (state.exists && body.username === state.username && body.password === state.password) {
        const loginCookie = `jakh_session=synthetic-login-${++state.logins}`;
        state.cookies.add(loginCookie);
        return json({ user: { username: state.username } }, 200, {
          "set-cookie": `${loginCookie}; Path=/; HttpOnly`,
        });
      }
      return json({ code: "INVALID_CREDENTIALS" }, 401);
    }
    if (path === "/api/auth/session") {
      return json(state.exists && state.cookies.has(cookie)
        ? { authenticated: true, user: { username: state.username } }
        : { authenticated: false });
    }
    if (path.startsWith("/api/user/") && !state.cookies.has(cookie)) return json({ code: "UNAUTHORIZED" }, 401);
    if (path === "/api/user/password") {
      assert.equal(body.currentPassword, state.password);
      assert.notEqual(body.newPassword, state.password);
      assert.ok(body.newPassword.length >= 15);
      state.nextPassword = body.newPassword;
      if (passwordFailure === "before-commit") return json({ code: "INTERNAL_SERVER_ERROR" }, 500);
      state.password = body.newPassword;
      if (!retainOldSession) state.cookies.clear();
      state.cookie = "jakh_session=synthetic-rotated";
      state.cookies.add(state.cookie);
      if (passwordFailure === "after-commit-network") throw new Error(`${body.currentPassword} ${body.newPassword} ${cookie} private response detail`);
      return json({ success: true }, 200, passwordFailure === "missing-cookie" ? {} : { "set-cookie": `${state.cookie}; Path=/; HttpOnly` });
    }
    if (path === "/api/user/privacy" && method === "GET") {
      return json({ privacy: { analytics: state.analytics } });
    }
    if (path === "/api/user/privacy" && method === "PUT") {
      state.analytics = body.analytics;
      return json({ privacy: { analytics: state.analytics } });
    }
    if (path === "/api/user/export") {
      return json({ exportVersion: 2, account: { username: state.username } });
    }
    if (path === "/api/scores/server-checked/challenge" && method === "POST") {
      return json({
        serverChecked: true,
        proctored: false,
        challengeId: "challenge-1",
        submissionToken: "token-1",
      }, 201);
    }
    if (path === "/api/scores/server-checked/challenge" && method === "DELETE") {
      return json({ discarded: true });
    }
    if (path === "/api/user/account" && method === "DELETE") {
      if (cleanupFails) return json({ code: "INJECTED_DELETE_FAILURE" }, 500);
      assert.match(body.username, /^jakh_synth_[0-9a-f]{9}$/u);
      assert.equal(body.username, state.username);
      assert.equal(body.currentPassword, state.password);
      assert.equal(body.confirmPermanentDeletion, true);
      state.deleted.push(body.username);
      state.exists = false;
      state.cookies.clear();
      return json({ success: true });
    }
    return json({ code: "NOT_FOUND" }, 404);
  };
  return { state, fetchImpl };
}

function options(fetchImpl) {
  return {
    apiOrigin: "https://api.example.test",
    siteOrigin: "https://site.example.test",
    releaseCommit: COMMIT,
    confirmation: SYNTHETIC_CONFIRMATION,
    confirmedPrefix: SYNTHETIC_ACCOUNT_PREFIX,
    usernameSuffix: "1234abcde",
    allowNonProduction: true,
    fetchImpl,
  };
}

test("environment gate refuses every incomplete or redirected production invocation", () => {
  assert.throws(() => syntheticConfigFromEnv({}), /must equal/u);
  assert.throws(() => syntheticConfigFromEnv({
    JAKH_SYNTHETIC_ACCOUNT_CONFIRM: SYNTHETIC_CONFIRMATION,
    JAKH_SYNTHETIC_ACCOUNT_PREFIX: SYNTHETIC_ACCOUNT_PREFIX,
    JAKH_SYNTHETIC_RELEASE_COMMIT: COMMIT,
    JAKH_SYNTHETIC_RESULT_PATH: "/tmp/result.json",
    JAKH_API_ORIGIN: "https://other.example",
  }), /pinned to riddlearabia\.com/u);
});

test("synthetic monitor exercises account contracts and permanently deletes only its prefixed identity", async () => {
  const api = mockApi();
  const receipt = await runSyntheticAccountMonitor(options(api.fetchImpl));

  assert.equal(receipt.status, "passed");
  assert.deepEqual(receipt.workerIdentity, { before: WORKER_VERSION, after: WORKER_VERSION, unchanged: true });
  assert.equal(receipt.username, "jakh_synth_1234abcde");
  assert.equal(receipt.cleanup.confirmed, true);
  assert.deepEqual(api.state.deleted, ["jakh_synth_1234abcde"]);
  assert.equal(api.state.exists, false);
  assert.deepEqual(receipt.passwordRotation, { updated: true, sessionRotated: true, priorSessionRevoked: true,
    priorPasswordRejected: true, newSessionVerified: true, newPasswordLoginVerified: true });
  assert.ok(receipt.checks.some(({ name, status }) => name === "POST /api/auth/login" && status === 401));
  assert.ok(receipt.checks.some(({ name }) => name === "GET /api/user/export"));
  assert.ok(receipt.checks.some(({ name }) => name === "DELETE /api/scores/server-checked/challenge"));
});

test("a mid-run failure still deletes the created synthetic account", async () => {
  const api = mockApi({ failPath: "/api/user/export" });
  await assert.rejects(
    () => runSyntheticAccountMonitor(options(api.fetchImpl)),
    (error) => {
      assert(error instanceof SyntheticMonitorError);
      assert.equal(error.receipt.status, "failed");
      assert.equal(error.receipt.cleanup.confirmed, true);
      return true;
    },
  );
  assert.deepEqual(api.state.deleted, ["jakh_synth_1234abcde"]);
  assert.equal(api.state.exists, false);
});

for (const wrongShape of ["profile-only", "different-account"]) {
  test(`an export with ${wrongShape} fails identity verification and still cleans up`, async () => {
    const api = mockApi();
    const fetchImpl = async (input, init) => {
      if (new URL(input).pathname === "/api/user/export") {
        return json({
          exportVersion: 2,
          profile: { username: api.state.username },
          ...(wrongShape === "different-account" ? { account: { username: "not_the_created_account" } } : {}),
        });
      }
      return api.fetchImpl(input, init);
    };
    await assert.rejects(() => runSyntheticAccountMonitor(options(fetchImpl)), error => {
      assert(error instanceof SyntheticMonitorError);
      assert.match(error.receipt.failure, /export does not identify the created account/u);
      assert.equal(error.receipt.cleanup.confirmed, true);
      return true;
    });
    assert.equal(api.state.exists, false);
    assert.deepEqual(api.state.deleted, ["jakh_synth_1234abcde"]);
    assert.equal(api.state.requests.some(request => request.path === "/api/scores/server-checked/challenge"), false);
  });
}

test("cleanup failure is never hidden behind the primary result", async () => {
  const api = mockApi({ cleanupFails: true });
  await assert.rejects(
    () => runSyntheticAccountMonitor(options(api.fetchImpl)),
    (error) => {
      assert(error instanceof SyntheticMonitorError);
      assert.equal(error.receipt.status, "failed");
      assert.equal(error.receipt.cleanup.confirmed, false);
      assert.match(error.message, /permanent-account-deletion|HTTP 500/u);
      return true;
    },
  );
  assert.equal(api.state.exists, true);
});

for (const passwordFailure of ["before-commit", "after-commit-network", "missing-cookie"]) {
  test(`cleanup resolves ${passwordFailure} using only the created account's generated passwords`, async () => {
    const api = mockApi({ passwordFailure });
    await assert.rejects(() => runSyntheticAccountMonitor(options(api.fetchImpl)), error => {
      assert(error instanceof SyntheticMonitorError);
      assert.equal(error.receipt.status, "failed");
      assert.equal(error.receipt.cleanup.confirmed, true);
      const receipt = JSON.stringify(error.receipt);
      for (const secret of [api.state.initialPassword, api.state.nextPassword, api.state.cookie, "private response detail"]) {
        assert.equal(receipt.includes(secret), false);
      }
      return true;
    });
    assert.equal(api.state.exists, false);
    assert.deepEqual(api.state.deleted, ["jakh_synth_1234abcde"]);
    const logins = api.state.requests.filter(request => request.path === "/api/auth/login");
    assert.equal(logins.length, passwordFailure === "before-commit" ? 2 : 1);
    for (const request of logins) {
      assert.equal(request.cookie, null);
      assert.equal(request.body.username, api.state.username);
      assert.ok([api.state.initialPassword, api.state.nextPassword].includes(request.body.password));
    }
  });
}

test("cleanup authenticates the test-created account when registration loses its session cookie", async () => {
  const api = mockApi({ missingRegistrationCookie: true });
  await assert.rejects(() => runSyntheticAccountMonitor(options(api.fetchImpl)), error => {
    assert.equal(error.receipt.cleanup.confirmed, true);
    return true;
  });
  assert.equal(api.state.exists, false);
  assert.equal(api.state.requests.filter(request => request.path === "/api/auth/login").length, 1);
});

test("a retained prior session fails the password proof and still cleans up", async () => {
  const api = mockApi({ retainOldSession: true });
  await assert.rejects(() => runSyntheticAccountMonitor(options(api.fetchImpl)), error => {
    assert.match(error.receipt.failure, /prior session still authenticates/u);
    assert.equal(error.receipt.passwordRotation.priorSessionRevoked, false);
    assert.equal(error.receipt.cleanup.confirmed, true);
    return true;
  });
  assert.equal(api.state.exists, false);
});

test("untrusted response codes cannot put generated passwords into receipts", async () => {
  const api = mockApi();
  const fetchImpl = async (input, init) => {
    if (new URL(input).pathname === "/api/user/password") {
      const body = JSON.parse(init.body);
      api.state.nextPassword = body.newPassword;
      return json({ code: `${body.currentPassword} ${body.newPassword}`, error: init.headers.get("cookie") }, 500);
    }
    return api.fetchImpl(input, init);
  };
  await assert.rejects(() => runSyntheticAccountMonitor(options(fetchImpl)), error => {
    assert.equal(error.receipt.cleanup.confirmed, true);
    const serialized = JSON.stringify(error.receipt);
    assert.equal(serialized.includes(api.state.initialPassword), false);
    assert.equal(serialized.includes(api.state.nextPassword), false);
    assert.equal(serialized.includes(api.state.cookie), false);
    return true;
  });
});

test("cleanup refuses a login response identifying any other account", async () => {
  const api = mockApi({ missingRegistrationCookie: true });
  const fetchImpl = async (input, init) => {
    if (new URL(input).pathname === "/api/auth/login") {
      return json({ user: { username: "not_the_created_account" } }, 200, { "set-cookie": "jakh_session=other" });
    }
    return api.fetchImpl(input, init);
  };
  await assert.rejects(() => runSyntheticAccountMonitor(options(fetchImpl)), error => {
    assert.equal(error.receipt.cleanup.confirmed, false);
    return true;
  });
  assert.deepEqual(api.state.deleted, []);
  assert.equal(api.state.requests.some(request => request.path === "/api/user/account"), false);
});


test("a changed live Worker cannot receive a passing password-journey receipt", async () => {
  const api = mockApi();
  let healthCalls = 0;
  const fetchImpl = async (input, init) => {
    const response = await api.fetchImpl(input, init);
    if (new URL(input).pathname === "/api/health" && ++healthCalls > 1) {
      const payload = await response.json();
      return json({ ...payload, workerVersionId: "99999999-2222-3333-4444-555555555555" });
    }
    return response;
  };
  await assert.rejects(() => runSyntheticAccountMonitor(options(fetchImpl)), error => {
    assert.equal(error.receipt.status, "failed");
    assert.equal(error.receipt.workerIdentity.unchanged, false);
    assert.equal(error.receipt.cleanup.confirmed, true);
    return true;
  });
  assert.equal(api.state.exists, false);
});
