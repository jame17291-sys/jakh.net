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

function json(payload, status = 200, headers = {}) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });
}

function mockApi({ failPath = null, cleanupFails = false } = {}) {
  const state = {
    exists: false,
    username: null,
    password: null,
    cookie: "jakh_session=synthetic-session",
    deleted: [],
    requests: [],
    analytics: "denied",
  };
  const fetchImpl = async (input, init = {}) => {
    const url = new URL(input);
    const method = init.method || "GET";
    const path = url.pathname;
    const body = init.body ? JSON.parse(init.body) : null;
    state.requests.push({ method, path, body });
    if (failPath === path && method !== "DELETE") return json({ code: "INJECTED" }, 500);

    if (path === "/api/health") {
      return json({
        ok: true,
        schema: "8",
        targetSchema: "8",
        features: { registration: true, accountRecovery: true, accountDeletion: true },
      });
    }
    if (path === "/api/auth/register") {
      assert.match(body.username, /^jakh_synth_[0-9a-f]{9}$/u);
      assert.equal(Object.hasOwn(body, "email"), false);
      state.exists = true;
      state.username = body.username;
      state.password = body.password;
      return json({
        user: { username: body.username },
        recoveryCode: "A".repeat(43),
      }, 201, { "set-cookie": `${state.cookie}; Path=/; HttpOnly` });
    }
    if (path === "/api/auth/login") {
      if (state.exists && body.identifier === state.username && body.password === state.password) {
        return json({ user: { username: state.username } }, 200, {
          "set-cookie": `${state.cookie}; Path=/; HttpOnly`,
        });
      }
      return json({ code: "INVALID_CREDENTIALS" }, 401);
    }
    if (path === "/api/auth/session") {
      return json(state.exists
        ? { authenticated: true, user: { username: state.username } }
        : { authenticated: false });
    }
    if (path === "/api/user/privacy" && method === "GET") {
      return json({ privacy: { analytics: state.analytics } });
    }
    if (path === "/api/user/privacy" && method === "PUT") {
      state.analytics = body.analytics;
      return json({ privacy: { analytics: state.analytics } });
    }
    if (path === "/api/user/export") {
      return json({ profile: { username: state.username } });
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
  }), /pinned to jakh\.net/u);
});

test("synthetic monitor exercises account contracts and permanently deletes only its prefixed identity", async () => {
  const api = mockApi();
  const receipt = await runSyntheticAccountMonitor(options(api.fetchImpl));

  assert.equal(receipt.status, "passed");
  assert.equal(receipt.username, "jakh_synth_1234abcde");
  assert.equal(receipt.cleanup.confirmed, true);
  assert.deepEqual(api.state.deleted, ["jakh_synth_1234abcde"]);
  assert.equal(api.state.exists, false);
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
