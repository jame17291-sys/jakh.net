import { randomBytes } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const SYNTHETIC_ACCOUNT_PREFIX = "jakh_synth_";
export const SYNTHETIC_CONFIRMATION = "CREATE_AND_DELETE_JAKH_SYNTHETIC_ACCOUNT";
const PRODUCTION_API_ORIGIN = "https://api.riddlearabia.com";
const PRODUCTION_SITE_ORIGIN = "https://riddlearabia.com";
const USERNAME_PATTERN = /^jakh_synth_[0-9a-f]{9}$/u;
const COMMIT_PATTERN = /^[0-9a-f]{40}$/u;
const DEFAULT_TIMEOUT_MS = 10_000;
const WORKER_VERSION_PATTERN = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/u;

function normalizeOrigin(value, label) {
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`${label} must be an absolute origin`);
  }
  if (parsed.pathname !== "/" || parsed.search || parsed.hash) {
    throw new Error(`${label} must not contain a path, query, or fragment`);
  }
  return parsed.origin;
}

function safeError(error) {
  return error instanceof Error ? error.message : String(error);
}

function sessionCookie(response) {
  const combined = typeof response.headers.getSetCookie === "function"
    ? response.headers.getSetCookie().join(",")
    : response.headers.get("set-cookie") || "";
  const match = /(?:^|,\s*)((?:__Host-)?jakh_session=[^;,]+)/u.exec(combined);
  if (!match?.[1]) throw new Error("API did not issue a session cookie");
  return match[1];
}

async function responsePayload(response) {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

class SyntheticHttpError extends Error {
  constructor(method, path, response, payload) {
    const knownCodes = new Set(["INVALID_CREDENTIALS", "CURRENT_PASSWORD_INCORRECT", "UNAUTHORIZED", "RATE_LIMITED", "INTERNAL_SERVER_ERROR", "PASSWORD_POLICY_INVALID", "PASSWORD_TOO_WEAK"]);
    const code = knownCodes.has(payload?.code) ? ` code=${payload.code}` : "";
    super(`${method} ${path} returned HTTP ${response.status}${code}`);
    this.name = "SyntheticHttpError";
    this.status = response.status;
  }
}

export class SyntheticMonitorError extends Error {
  constructor(message, receipt) {
    super(message);
    this.name = "SyntheticMonitorError";
    this.receipt = receipt;
  }
}

export function syntheticConfigFromEnv(env = process.env) {
  if (env.JAKH_SYNTHETIC_ACCOUNT_CONFIRM !== SYNTHETIC_CONFIRMATION) {
    throw new Error(
      `JAKH_SYNTHETIC_ACCOUNT_CONFIRM must equal ${SYNTHETIC_CONFIRMATION}`,
    );
  }
  if (env.JAKH_SYNTHETIC_ACCOUNT_PREFIX !== SYNTHETIC_ACCOUNT_PREFIX) {
    throw new Error(`JAKH_SYNTHETIC_ACCOUNT_PREFIX must equal ${SYNTHETIC_ACCOUNT_PREFIX}`);
  }
  const releaseCommit = String(env.JAKH_SYNTHETIC_RELEASE_COMMIT || "").trim();
  if (!COMMIT_PATTERN.test(releaseCommit)) {
    throw new Error("JAKH_SYNTHETIC_RELEASE_COMMIT must be a full lowercase commit SHA");
  }
  const resultPath = String(env.JAKH_SYNTHETIC_RESULT_PATH || "").trim();
  if (!resultPath) throw new Error("JAKH_SYNTHETIC_RESULT_PATH is required");

  const apiOrigin = normalizeOrigin(env.JAKH_API_ORIGIN || PRODUCTION_API_ORIGIN, "API origin");
  const siteOrigin = normalizeOrigin(env.JAKH_SITE_ORIGIN || PRODUCTION_SITE_ORIGIN, "site origin");
  if (apiOrigin !== PRODUCTION_API_ORIGIN || siteOrigin !== PRODUCTION_SITE_ORIGIN) {
    throw new Error("the production synthetic runner is pinned to riddlearabia.com and api.riddlearabia.com");
  }
  return {
    apiOrigin,
    siteOrigin,
    releaseCommit,
    resultPath: resolve(resultPath),
    confirmation: env.JAKH_SYNTHETIC_ACCOUNT_CONFIRM,
    confirmedPrefix: env.JAKH_SYNTHETIC_ACCOUNT_PREFIX,
    timeoutMs: DEFAULT_TIMEOUT_MS,
  };
}

function validateRunOptions(options) {
  if (options?.confirmation !== SYNTHETIC_CONFIRMATION) {
    throw new Error(`synthetic confirmation must equal ${SYNTHETIC_CONFIRMATION}`);
  }
  if (options?.confirmedPrefix !== SYNTHETIC_ACCOUNT_PREFIX) {
    throw new Error(`synthetic prefix confirmation must equal ${SYNTHETIC_ACCOUNT_PREFIX}`);
  }
  const apiOrigin = normalizeOrigin(options.apiOrigin, "API origin");
  const siteOrigin = normalizeOrigin(options.siteOrigin, "site origin");
  if (!options.allowNonProduction && (
    apiOrigin !== PRODUCTION_API_ORIGIN
    || siteOrigin !== PRODUCTION_SITE_ORIGIN
  )) {
    throw new Error("non-production origins require an explicit test-only override");
  }
  if (!COMMIT_PATTERN.test(options.releaseCommit || "")) {
    throw new Error("release commit must be a full lowercase commit SHA");
  }
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1_000 || timeoutMs > 30_000) {
    throw new Error("synthetic request timeout must be between 1000 and 30000 milliseconds");
  }
  const suffix = options.usernameSuffix
    || randomBytes(5).toString("hex").slice(0, 9);
  const username = `${SYNTHETIC_ACCOUNT_PREFIX}${suffix}`;
  if (!USERNAME_PATTERN.test(username)) throw new Error("generated synthetic username is invalid");
  return {
    apiOrigin,
    siteOrigin,
    releaseCommit: options.releaseCommit,
    username,
    fetchImpl: options.fetchImpl || globalThis.fetch,
    now: options.now || (() => new Date()),
    timeoutMs,
  };
}

function randomPassword() {
  return `Jakh-Synthetic-${randomBytes(24).toString("base64url")}`;
}

async function requestApi(state, path, {
  body,
  cookie = state.cookie,
  expected = 200,
  method = body === undefined ? "GET" : "POST",
  record = true,
} = {}) {
  const headers = new Headers({ accept: "application/json" });
  if (body !== undefined) headers.set("content-type", "application/json");
  if (!new Set(["GET", "HEAD"]).has(method)) headers.set("origin", state.siteOrigin);
  if (cookie) headers.set("cookie", cookie);
  let response, payload;
  try {
    response = await state.fetchImpl(`${state.apiOrigin}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      redirect: "manual",
      signal: AbortSignal.timeout(state.timeoutMs),
    });
    payload = await responsePayload(response);
  } catch {
    // A fetch implementation may include request details in its error. Keep
    // passwords, session cookies and response bodies out of failure receipts.
    throw new Error(`${method} ${path} failed before a readable API response`);
  }
  if (response.status !== expected) throw new SyntheticHttpError(method, path, response, payload);
  if (record) state.checks.push({ name: `${method} ${path}`, status: response.status });
  return { payload, response };
}

async function deleteOwnedAccount(state) {
  if (!USERNAME_PATTERN.test(state.username)) {
    throw new Error("cleanup refused a username outside the dedicated synthetic prefix");
  }
  // A lost password-update response may leave both the password and session
  // uncertain. Authenticate afresh using only this run's random candidates.
  let cookie, password;
  for (const candidate of [...state.passwordCandidates].reverse()) {
    try {
      const login = await requestApi(state, "/api/auth/login", {
        body: { username: state.username, password: candidate },
        cookie: null,
        record: false,
      });
      if (login.payload?.user?.username !== state.username) {
        throw new Error("cleanup login returned a different username");
      }
      cookie = sessionCookie(login.response);
      password = candidate;
      break;
    } catch {
      // Never try owner credentials, recovery codes or another account.
    }
  }
  if (!cookie) throw new Error("synthetic cleanup could not authenticate with this run's generated passwords");

  const deletion = await requestApi(state, "/api/user/account", {
    method: "DELETE",
    cookie,
    body: {
      username: state.username,
      currentPassword: password,
      confirmPermanentDeletion: true,
    },
    record: false,
  });
  if (deletion.payload?.success !== true) throw new Error("account deletion was not confirmed");
  const session = await requestApi(state, "/api/auth/session", {
    cookie,
    record: false,
  });
  if (session.payload?.authenticated !== false) {
    throw new Error("deleted synthetic session still authenticates");
  }
  return { required: true, confirmed: true, method: "permanent-account-deletion" };
}

export async function runSyntheticAccountMonitor(options) {
  const config = validateRunOptions(options);
  const startedAt = config.now().toISOString();
  const state = {
    ...config,
    checks: [],
    password: randomPassword(),
    passwordCandidates: [],
    cookie: null,
    accountMayExist: false,
  };
  state.passwordCandidates.push(state.password);
  const passwordRotation = { updated: false, sessionRotated: false, priorSessionRevoked: false,
    priorPasswordRejected: false, newSessionVerified: false, newPasswordLoginVerified: false };
  const workerIdentity = { before: null, after: null, unchanged: false };
  let primaryError = null;
  let cleanup = { required: false, confirmed: true, method: "not-created" };

  try {
    const health = await requestApi(state, "/api/health");
    if (
      health.payload?.ok !== true
      || health.payload?.schema !== "10"
      || health.payload?.targetSchema !== "10"
      || health.payload?.features?.registration !== true
      || health.payload?.features?.accountRecovery !== true
      || health.payload?.features?.accountDeletion !== true
      || health.payload?.features?.contentStudio !== true
      || health.payload?.features?.adminMfa !== true
      || !WORKER_VERSION_PATTERN.test(health.payload?.workerVersionId || "")
    ) {
      throw new Error("API health is not fully ready on target schema 10");
    }

    workerIdentity.before = health.payload.workerVersionId;
    state.accountMayExist = true;
    const registration = await requestApi(state, "/api/auth/register", {
      expected: 201,
      body: { username: state.username, password: state.password },
    });
    if (registration.payload?.user?.username !== state.username) {
      throw new Error("registration returned a different username");
    }
    if (!/^[A-Za-z0-9_-]{43}$/u.test(registration.payload?.recoveryCode || "")) {
      throw new Error("registration did not return a one-time recovery code");
    }
    state.cookie = sessionCookie(registration.response);

    const session = await requestApi(state, "/api/auth/session");
    if (session.payload?.authenticated !== true || session.payload?.user?.username !== state.username) {
      throw new Error("synthetic session contract is invalid");
    }

    const previousCookie = state.cookie;
    const previousPassword = state.password;
    const nextPassword = randomPassword();
    state.passwordCandidates.push(nextPassword);
    const update = await requestApi(state, "/api/user/password", {
      body: { currentPassword: previousPassword, newPassword: nextPassword },
    });
    if (update.payload?.success !== true) throw new Error("password update was not confirmed");
    passwordRotation.updated = true;
    state.password = nextPassword;
    state.cookie = sessionCookie(update.response);
    if (state.cookie === previousCookie) throw new Error("password update did not rotate the session cookie");
    passwordRotation.sessionRotated = true;

    const priorSession = await requestApi(state, "/api/auth/session", { cookie: previousCookie });
    if (priorSession.payload?.authenticated !== false) throw new Error("prior session still authenticates after password update");
    passwordRotation.priorSessionRevoked = true;
    const rotatedSession = await requestApi(state, "/api/auth/session");
    if (rotatedSession.payload?.authenticated !== true || rotatedSession.payload?.user?.username !== state.username) {
      throw new Error("replacement synthetic session contract is invalid");
    }
    passwordRotation.newSessionVerified = true;
    const oldLogin = await requestApi(state, "/api/auth/login", {
      body: { username: state.username, password: previousPassword }, cookie: null, expected: 401,
    });
    if (oldLogin.payload?.code !== "INVALID_CREDENTIALS") throw new Error("prior password rejection was not confirmed");
    passwordRotation.priorPasswordRejected = true;
    const login = await requestApi(state, "/api/auth/login", {
      body: { username: state.username, password: nextPassword }, cookie: null,
    });
    if (login.payload?.user?.username !== state.username) throw new Error("new-password login returned a different username");
    state.cookie = sessionCookie(login.response);
    const loggedIn = await requestApi(state, "/api/auth/session");
    if (loggedIn.payload?.authenticated !== true || loggedIn.payload?.user?.username !== state.username) {
      throw new Error("new-password login session contract is invalid");
    }
    passwordRotation.newPasswordLoginVerified = true;

    const privacy = await requestApi(state, "/api/user/privacy");
    if (privacy.payload?.privacy?.analytics !== "denied") {
      throw new Error("synthetic account analytics are not denied by default");
    }
    const allowed = await requestApi(state, "/api/user/privacy", {
      method: "PUT",
      body: { analytics: "allowed" },
    });
    if (allowed.payload?.privacy?.analytics !== "allowed") {
      throw new Error("synthetic analytics opt-in did not persist");
    }
    const denied = await requestApi(state, "/api/user/privacy", {
      method: "PUT",
      body: { analytics: "denied" },
    });
    if (denied.payload?.privacy?.analytics !== "denied") {
      throw new Error("synthetic analytics revocation did not persist");
    }

    const accountExport = await requestApi(state, "/api/user/export");
    if (accountExport.payload?.profile?.username !== state.username) {
      throw new Error("synthetic account export does not identify the created account");
    }

    const challenge = await requestApi(state, "/api/scores/server-checked/challenge", {
      expected: 201,
      body: { categoryId: "science" },
    });
    if (
      challenge.payload?.serverChecked !== true
      || challenge.payload?.proctored !== false
      || !challenge.payload?.challengeId
      || !challenge.payload?.submissionToken
    ) {
      throw new Error("server-checked challenge contract is invalid");
    }
    const discard = await requestApi(state, "/api/scores/server-checked/challenge", {
      method: "DELETE",
      body: {
        categoryId: "science",
        challengeId: challenge.payload.challengeId,
        submissionToken: challenge.payload.submissionToken,
      },
    });
    if (discard.payload?.discarded !== true) throw new Error("challenge cancellation was not confirmed");
  } catch (error) {
    primaryError = error;
  } finally {
    if (state.accountMayExist) {
      try {
        cleanup = await deleteOwnedAccount(state);
        state.accountMayExist = false;
      } catch (error) {
        cleanup = {
          required: true,
          confirmed: false,
          method: "permanent-account-deletion",
          error: safeError(error),
        };
      }
    }
  }

  if (workerIdentity.before) {
    try {
      const health = await requestApi(state, "/api/health", { cookie: null });
      workerIdentity.after = WORKER_VERSION_PATTERN.test(health.payload?.workerVersionId || "")
        ? health.payload.workerVersionId : null;
      workerIdentity.unchanged = workerIdentity.before === workerIdentity.after;
      if (health.payload?.ok !== true || !workerIdentity.unchanged) throw new Error("API Worker identity changed or was unavailable during the synthetic journey");
    } catch (error) { primaryError ||= error; }
  }

  const completedAt = config.now().toISOString();
  const receipt = {
    formatVersion: 1,
    status: !primaryError && cleanup.confirmed ? "passed" : "failed",
    releaseCommit: state.releaseCommit,
    apiOrigin: state.apiOrigin,
    siteOrigin: state.siteOrigin,
    username: state.username,
    usernamePrefix: SYNTHETIC_ACCOUNT_PREFIX,
    startedAt,
    completedAt,
    checks: state.checks,
    passwordRotation,
    workerIdentity,
    cleanup,
    failure: primaryError ? safeError(primaryError) : null,
  };
  if (receipt.status === "failed") {
    const reasons = [receipt.failure, cleanup.confirmed ? null : cleanup.error].filter(Boolean);
    throw new SyntheticMonitorError(`synthetic account monitor failed: ${reasons.join("; ")}`, receipt);
  }
  return receipt;
}

async function writeReceipt(path, receipt) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(receipt, null, 2)}\n`, { mode: 0o600 });
}

async function main() {
  const config = syntheticConfigFromEnv();
  try {
    const receipt = await runSyntheticAccountMonitor(config);
    await writeReceipt(config.resultPath, receipt);
    console.log(`Synthetic account monitor passed; cleanup confirmed for ${receipt.username}.`);
  } catch (error) {
    if (error instanceof SyntheticMonitorError) await writeReceipt(config.resultPath, error.receipt);
    throw error;
  }
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1]);
if (isMain) {
  main().catch((error) => {
    console.error(safeError(error));
    process.exitCode = 1;
  });
}
