import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { createServer } from "node:http";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const WORKER_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SITE_ROOT = resolve(WORKER_ROOT, "..");
const WRANGLER = join(WORKER_ROOT, "node_modules", ".bin", "wrangler");
const TEST_PASSWORD = "Local-integration-password-42";
const RESET_PASSWORD = "Local-integration-reset-84";

function listen(server, port = 0) {
  return new Promise((resolveListen, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", () => {
      server.off("error", reject);
      const address = server.address();
      assert(address && typeof address === "object");
      resolveListen(address.port);
    });
  });
}

function close(server) {
  return new Promise((resolveClose, reject) => {
    server.close((error) => error ? reject(error) : resolveClose());
  });
}

async function freePort() {
  const server = createServer();
  const port = await listen(server);
  await close(server);
  return port;
}

function createStaticServer() {
  return createServer(async (request, response) => {
    try {
      const pathname = new URL(request.url || "/", "http://127.0.0.1").pathname;
      const match = /^\/data\/([a-z0-9-]+\.json)$/u.exec(pathname);
      if (!match) {
        response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
        response.end("Not found");
        return;
      }
      const body = await readFile(join(SITE_ROOT, "data", match[1]));
      response.writeHead(200, {
        "cache-control": "no-store",
        "content-type": "application/json; charset=utf-8",
      });
      response.end(body);
    } catch {
      response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
      response.end("Not found");
    }
  });
}

function expectSessionCookie(response) {
  const combined = typeof response.headers.getSetCookie === "function"
    ? response.headers.getSetCookie().join(",")
    : response.headers.get("set-cookie") || "";
  const match = /(?:^|,\s*)((?:__Host-)?jakh_session=[^;,]+)/u.exec(combined);
  assert(match?.[1], "The API did not issue the expected session cookie");
  return match[1];
}

async function requestJson(baseUrl, path, {
  body,
  cookie,
  expected = 200,
  method = body === undefined ? "GET" : "POST",
} = {}) {
  const headers = new Headers({ accept: "application/json" });
  if (body !== undefined) headers.set("content-type", "application/json");
  if (!new Set(["GET", "HEAD"]).has(method)) headers.set("origin", baseUrl);
  if (cookie) headers.set("cookie", cookie);
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
    redirect: "manual",
  });
  let payload;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }
  assert.equal(
    response.status,
    expected,
    `${method} ${path} returned ${response.status}: ${JSON.stringify(payload)}`,
  );
  return { payload, response };
}

async function waitForHealth(baseUrl, child, output) {
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`Wrangler exited before readiness (${child.exitCode})\n${output()}`);
    }
    try {
      const response = await fetch(`${baseUrl}/api/health`, { redirect: "manual" });
      if (response.status === 200) return response.json();
    } catch {
      // The listener is expected to refuse connections during startup.
    }
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 250));
  }
  throw new Error(`Wrangler did not become ready within 60 seconds\n${output()}`);
}

async function stopChild(child) {
  if (child.exitCode !== null) return;
  child.kill("SIGTERM");
  await Promise.race([
    new Promise((resolveExit) => child.once("exit", resolveExit)),
    new Promise((resolveDelay) => setTimeout(resolveDelay, 5_000)),
  ]);
  if (child.exitCode === null) child.kill("SIGKILL");
}

async function run() {
  const stateDir = await mkdtemp(join(tmpdir(), "jakh-api-integration-"));
  const staticServer = createStaticServer();
  let wrangler;
  let devOutput = "";

  try {
    const migration = spawnSync(
      WRANGLER,
      ["d1", "migrations", "apply", "DB", "--local", "--persist-to", stateDir],
      {
        cwd: WORKER_ROOT,
        encoding: "utf8",
        env: {
          ...process.env,
          CI: "1",
          WRANGLER_LOG_PATH: join(stateDir, "migrations.log"),
        },
        maxBuffer: 8 * 1_024 * 1_024,
      },
    );
    if (migration.status !== 0) {
      throw new Error(`Local D1 migration failed\n${migration.stdout}\n${migration.stderr}`);
    }

    const staticPort = await listen(staticServer);
    const workerPort = await freePort();
    const inspectorPort = await freePort();
    const baseUrl = `http://127.0.0.1:${workerPort}`;
    const staticOrigin = `http://127.0.0.1:${staticPort}`;
    const localConfig = join(stateDir, "wrangler.integration.json");
    await writeFile(localConfig, `${JSON.stringify({
      name: "jakh-api-local-integration",
      main: join(WORKER_ROOT, "src", "index.ts"),
      compatibility_date: "2026-07-29",
      vars: {
        ALLOWED_ORIGINS: baseUrl,
        STATIC_ORIGIN: staticOrigin,
        IP_HASH_SALT: "local-integration-ip-salt-0123456789",
        PASSWORD_PEPPER: "local-integration-password-pepper-0123456789",
      },
      d1_databases: [{
        binding: "DB",
        database_name: "jakh-db",
        database_id: "7fa30e72-85e4-4254-be85-40a9dfd8295c",
        migrations_dir: join(WORKER_ROOT, "migrations"),
      }],
      durable_objects: {
        bindings: [
          { name: "BATTLE_ROOMS", class_name: "BattleRoom" },
          { name: "PASSWORD_HASHERS", class_name: "PasswordHasher" },
        ],
      },
      migrations: [{
        tag: "v1",
        new_sqlite_classes: ["BattleRoom", "PasswordHasher"],
      }],
    }, null, 2)}\n`, { mode: 0o600 });
    wrangler = spawn(
      WRANGLER,
      [
        "dev",
        "--config", localConfig,
        "--local",
        "--persist-to", stateDir,
        "--ip", "127.0.0.1",
        "--port", String(workerPort),
        "--inspector-port", String(inspectorPort),
        "--log-level", "warn",
        "--test-scheduled",
      ],
      {
        cwd: WORKER_ROOT,
        env: {
          ...process.env,
          CI: "1",
          WRANGLER_LOG_PATH: join(stateDir, "dev.log"),
        },
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    const appendOutput = (chunk) => {
      devOutput = `${devOutput}${chunk}`.slice(-100_000);
    };
    wrangler.stdout.on("data", appendOutput);
    wrangler.stderr.on("data", appendOutput);

    const health = await waitForHealth(baseUrl, wrangler, () => devOutput);
    assert.deepEqual(health.features, {
      registration: true,
      accountRecovery: true,
      accountDeletion: true,
    });
    assert.equal(health.schema, "8");

    const anonymous = await requestJson(baseUrl, "/api/auth/session");
    assert.deepEqual(anonymous.payload, { authenticated: false });

    const suffix = Date.now().toString(36);
    const username = `it_${suffix}`;
    const registration = await requestJson(baseUrl, "/api/auth/register", {
      expected: 201,
      body: {
        username,
        email: `${username}@example.test`,
        password: TEST_PASSWORD,
      },
    });
    assert.equal(registration.payload.user.username, username);
    assert.match(registration.payload.recoveryCode, /^[A-Za-z0-9_-]{43}$/u);
    const originalRecoveryCode = registration.payload.recoveryCode;
    const originalCookie = expectSessionCookie(registration.response);

    const session = await requestJson(baseUrl, "/api/auth/session", { cookie: originalCookie });
    assert.equal(session.payload.authenticated, true);
    assert.deepEqual(Object.keys(session.payload.user).sort(), ["avatar", "id", "role", "username"]);

    const defaultPrivacy = await requestJson(baseUrl, "/api/user/privacy", { cookie: originalCookie });
    assert.equal(defaultPrivacy.payload.privacy.analytics, "denied");
    const allowedPrivacy = await requestJson(baseUrl, "/api/user/privacy", {
      method: "PUT",
      cookie: originalCookie,
      body: { analytics: "allowed" },
    });
    assert.equal(allowedPrivacy.payload.privacy.analytics, "allowed");
    const deniedPrivacy = await requestJson(baseUrl, "/api/user/privacy", {
      method: "PUT",
      cookie: originalCookie,
      body: { analytics: "denied" },
    });
    assert.equal(deniedPrivacy.payload.existingUsageAnalyticsDeleted, true);

    const privacyRequest = await requestJson(baseUrl, "/api/privacy/requests", {
      expected: 201,
      body: {
        type: "access",
        text: "Local integration privacy access request",
        email: "integration-privacy@example.test",
        saveWithAccount: false,
      },
    });
    assert.deepEqual(privacyRequest.payload.privacyRequest, {
      accepted: true,
      type: "access",
      savedWithAccount: false,
    });

    const challenge = await requestJson(baseUrl, "/api/scores/server-checked/challenge", {
      expected: 201,
      cookie: originalCookie,
      body: { categoryId: "science" },
    });
    assert.equal(challenge.payload.serverChecked, true);
    assert.equal(challenge.payload.proctored, false);
    assert.equal(challenge.payload.scoreType, "server-checked");
    assert.equal(challenge.payload.questions.length, 10);
    assert(challenge.payload.questions.every((question) => !("answer" in question)));
    const discard = await requestJson(baseUrl, "/api/scores/server-checked/challenge", {
      method: "DELETE",
      cookie: originalCookie,
      body: {
        categoryId: "science",
        challengeId: challenge.payload.challengeId,
        submissionToken: challenge.payload.submissionToken,
      },
    });
    assert.deepEqual(discard.payload, { discarded: true });

    const scheduled = await fetch(`${baseUrl}/cdn-cgi/handler/scheduled`);
    assert.equal(scheduled.status, 200, "The real scheduled-maintenance handler did not complete");

    await requestJson(baseUrl, "/api/auth/logout", {
      method: "POST",
      cookie: originalCookie,
      body: {},
    });
    const loggedOut = await requestJson(baseUrl, "/api/auth/session", { cookie: originalCookie });
    assert.deepEqual(loggedOut.payload, { authenticated: false });

    const recovery = await requestJson(baseUrl, "/api/auth/recovery/reset", {
      body: {
        username,
        recoveryCode: originalRecoveryCode,
        newPassword: RESET_PASSWORD,
      },
    });
    assert.match(recovery.payload.recoveryCode, /^[A-Za-z0-9_-]{43}$/u);
    assert.notEqual(recovery.payload.recoveryCode, originalRecoveryCode);
    const recoveryCookie = expectSessionCookie(recovery.response);

    const reusedRecovery = await requestJson(baseUrl, "/api/auth/recovery/reset", {
      expected: 401,
      body: {
        username,
        recoveryCode: originalRecoveryCode,
        newPassword: TEST_PASSWORD,
      },
    });
    assert.equal(reusedRecovery.payload.code, "RECOVERY_CREDENTIALS_INVALID");

    const deletion = await requestJson(baseUrl, "/api/user/account", {
      method: "DELETE",
      cookie: recoveryCookie,
      body: {
        username,
        currentPassword: RESET_PASSWORD,
        confirmPermanentDeletion: true,
      },
    });
    assert.equal(deletion.payload.success, true);
    const deletedSession = await requestJson(baseUrl, "/api/auth/session", { cookie: recoveryCookie });
    assert.deepEqual(deletedSession.payload, { authenticated: false });

    console.log("Local Wrangler/D1 integration passed: migrations, auth, recovery, privacy, scoring, scheduled maintenance, and deletion.");
  } finally {
    if (wrangler) await stopChild(wrangler);
    if (staticServer.listening) await close(staticServer);
    await rm(stateDir, { recursive: true, force: true });
  }
}

await run();
