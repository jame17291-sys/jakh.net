import { readFile, appendFile, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { join } from "node:path";
import { verifyStaticApiRelease } from "./static-api-release-gate.mjs";
import { diagnoseIdentityToken } from "./autopilot-identity-diagnostics.mjs";

export const REPOSITORY = "jame17291-sys/jakh.net";
export const REPOSITORY_ID = "1227088138";
export const API_ORIGIN = "https://api.riddlearabia.com";
export const AUDIENCE = `${API_ORIGIN}/autopilot`;
export const SHA = /^[a-f0-9]{40}$/u;
export const RUN_ID = /^[1-9][0-9]{0,19}$/u;
export const DAY = /^\d{4}-\d{2}-\d{2}$/u;
const AUTOPILOT_ERROR_STATUSES = new Map([
  ["AUTOPILOT_IDENTITY_INVALID", 401],
  ["AUTOPILOT_IDENTITY_EXPIRED", 401],
  ["AUTOPILOT_IDENTITY_SCOPE_INVALID", 403],
  ["AUTOPILOT_IDENTITY_UNAVAILABLE", 503],
  ["AUTOPILOT_PAYLOAD_INVALID", 400],
]);

export function context(env = process.env) {
  if (env.GITHUB_REPOSITORY !== REPOSITORY || env.GITHUB_REPOSITORY_ID !== REPOSITORY_ID
    || env.GITHUB_REF !== "refs/heads/main" || env.GITHUB_REF_PROTECTED !== "true"
    || !SHA.test(env.GITHUB_SHA || "") || !RUN_ID.test(env.GITHUB_RUN_ID || "")
    || !["schedule", "workflow_dispatch"].includes(env.GITHUB_EVENT_NAME)) {
    throw new Error("Autopilot requires this repository's protected main workflow.");
  }
  return { repository: REPOSITORY, sha: env.GITHUB_SHA, runId: env.GITHUB_RUN_ID,
    runUrl: `https://github.com/${REPOSITORY}/actions/runs/${env.GITHUB_RUN_ID}` };
}

async function responseJson(response, label, identityDiagnostics = false) {
  if (Number(response.headers.get("content-length") || 0) > 2_000_000) throw new Error(`${label}: response too large`);
  const text = await response.text();
  if (text.length > 2_000_000) throw new Error(`${label}: response too large`);
  if (!response.ok) {
    let code;
    if (identityDiagnostics) {
      // Keep only fixed authentication codes; remote messages, bodies and token claims stay private.
      try {
        const payload = JSON.parse(text);
        if (typeof payload?.code === "string" && AUTOPILOT_ERROR_STATUSES.get(payload.code) === response.status) code = payload.code;
      } catch { /* Non-JSON error responses remain status-only. */ }
    }
    const error = new Error(`${label}: HTTP ${response.status}${code ? ` (${code})` : ""}`);
    error.status = response.status;
    if (code) error.code = code;
    throw error;
  }
  return text ? JSON.parse(text) : null;
}

export function githubClient(env = process.env, fetchImpl = fetch) {
  if (!env.GITHUB_TOKEN) throw new Error("The ephemeral GitHub workflow token is missing.");
  return async (path, { method = "GET", body } = {}) => {
    if (!(path === `/repos/${REPOSITORY}` || path.startsWith(`/repos/${REPOSITORY}/`)) || path.includes("..")
      || /[\r\n]/u.test(path) || /[%\\]/u.test(path.split("?")[0])) {
      throw new Error("GitHub requests are restricted to the Riddle Arabia repository.");
    }
    const response = await fetchImpl(`https://api.github.com${path}`, {
      method, redirect: "error", signal: AbortSignal.timeout(30_000),
      headers: { authorization: `Bearer ${env.GITHUB_TOKEN}`, accept: "application/vnd.github+json",
        "content-type": "application/json", "x-github-api-version": "2022-11-28",
        "user-agent": "riddle-arabia-autopilot/1" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return responseJson(response, `GitHub ${method} ${path.split("?")[0]}`);
  };
}

export async function oidcToken(env = process.env, fetchImpl = fetch) {
  if (!env.ACTIONS_ID_TOKEN_REQUEST_URL || !env.ACTIONS_ID_TOKEN_REQUEST_TOKEN) {
    throw new Error("GitHub Actions OIDC identity is unavailable.");
  }
  const url = new URL(env.ACTIONS_ID_TOKEN_REQUEST_URL);
  if (url.protocol !== "https:" || !url.hostname.endsWith(".actions.githubusercontent.com") || url.username || url.password) {
    throw new Error("Untrusted GitHub OIDC endpoint.");
  }
  url.searchParams.set("audience", AUDIENCE);
  const response = await fetchImpl(url, { redirect: "error", signal: AbortSignal.timeout(20_000),
    headers: { authorization: `Bearer ${env.ACTIONS_ID_TOKEN_REQUEST_TOKEN}` } });
  const payload = await responseJson(response, "GitHub identity");
  if (typeof payload?.value !== "string" || payload.value.length > 20_000) throw new Error("Invalid GitHub identity response.");
  return payload.value;
}

export async function autopilotRequest(action, body, { env = process.env, fetchImpl = fetch } = {}) {
  if (!["claim", "report", "release", "authorize-release"].includes(action)) throw new Error("Unknown Autopilot operation.");
  const token = await oidcToken(env, fetchImpl);
  return requestAutopilotWithToken(action, body, token, fetchImpl);
}

async function requestAutopilotWithToken(action, body, token, fetchImpl) {
  return responseJson(await fetchImpl(`${API_ORIGIN}/api/internal/autopilot/${action}`, {
    method: "POST", redirect: "error", signal: AbortSignal.timeout(25_000),
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify(body),
  }), `Autopilot ${action}`, true);
}

export async function diagnoseAutopilotIdentity(env = process.env, fetchImpl = fetch) {
  const current = context(env);
  if (env.GITHUB_EVENT_NAME !== "workflow_dispatch") throw new Error("Identity diagnostics require an explicit manual run.");
  const receipt = { version: 1, mode: "identity_check_only", runId: current.runId,
    sourceSha: current.sha, checkedAt: new Date().toISOString() };
  let runner;
  try {
    // Compare the runner and Worker using one freshly issued token held only in memory.
    const token = await oidcToken(env, fetchImpl);
    runner = await diagnoseIdentityToken(token, { fetchImpl });
    // The existing handler authenticates first, then rejects this unknown key before any D1 access.
    await requestAutopilotWithToken("claim", { diagnosticOnly: true }, token, fetchImpl);
    return { ...receipt, status: "failed", code: "IDENTITY_PREFLIGHT_UNEXPECTED_ACCEPTANCE", runner };
  } catch (error) {
    const knownCode = AUTOPILOT_ERROR_STATUSES.get(error.code) === error.status ? error.code : undefined;
    if (error.status === 400 && knownCode === "AUTOPILOT_PAYLOAD_INVALID") {
      return { ...receipt, status: "identity_verified_without_claim", httpStatus: 400, code: knownCode, runner };
    }
    return { ...receipt, status: "failed", code: knownCode || "IDENTITY_REQUEST_FAILED",
      ...(Number.isInteger(error.status) && error.status >= 100 && error.status <= 599 ? { httpStatus: error.status } : {}),
      ...(runner ? { runner } : {}) };
  }
}

export function assertMain(branch, expectedSha) {
  if (branch?.name !== "main" || branch.protected !== true || branch.commit?.sha !== expectedSha) {
    throw new Error("Protected main changed; the maintenance candidate must be checked again on a later run.");
  }
}

export function releaseInputs(kind, { runId, day }) {
  if (!RUN_ID.test(runId || "") || !DAY.test(day || "")) throw new Error("Invalid maintenance release identity.");
  if (kind === "api") return { release_phase: "compatibility", domain_cutover: "false", autopilot_run_id: runId, autopilot_day: day };
  if (kind === "static") return { confirmation: "DEPLOY riddlearabia.com FROM protected main", domain_cutover: "false", autopilot_run_id: runId, autopilot_day: day };
  throw new Error("Unknown maintenance release stage.");
}

export async function authorizeRelease(env = process.env, fetchImpl = fetch) {
  const current = context(env);
  if (env.AUTOPILOT_RELEASE_ENABLED !== "true") throw new Error("Automatic release has not been enabled by the owner.");
  if (!RUN_ID.test(env.AUTOPILOT_RUN_ID || "") || !DAY.test(env.AUTOPILOT_DAY || "")) throw new Error("Missing daily release reservation.");
  if (env.AUTOPILOT_DOMAIN_CUTOVER === "true" || (env.AUTOPILOT_RELEASE_PHASE && env.AUTOPILOT_RELEASE_PHASE !== "compatibility")) {
    throw new Error("Autopilot cannot migrate a database or change domains.");
  }
  const gh = githubClient(env, fetchImpl);
  assertMain(await gh(`/repos/${REPOSITORY}/branches/main`), current.sha);
  const receipt = await autopilotRequest("authorize-release", {
    day: env.AUTOPILOT_DAY, maintenanceRunId: env.AUTOPILOT_RUN_ID, candidateSha: current.sha,
  }, { env, fetchImpl });
  if (receipt?.authorized !== true) throw new Error("The maintenance release was not authorized.");
  if (env.AUTOPILOT_PREDECESSOR_DIR) {
    if (receipt.stage !== "api" || !SHA.test(receipt.run?.sourceSha || "")) throw new Error("Automatic API predecessor identity is missing.");
    const deployment = JSON.parse(await readFile(join(env.AUTOPILOT_PREDECESSOR_DIR, "worker-before-reread.json"), "utf8"));
    const health = JSON.parse(await readFile(join(env.AUTOPILOT_PREDECESSOR_DIR, "health-before.json"), "utf8"));
    const proof = verifyStaticApiRelease({ deployment, health, httpStatus: "200", expectedCommit: receipt.run.sourceSha, expectedSchema: "10" });
    if (proof.errors.length) throw new Error(`The automatic repair base is not the live API source: ${proof.errors.join("; ")}`);
  }
  process.stdout.write(`Authorized daily ${receipt.stage} release for ${current.sha}.\n`);
  return receipt;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const command = process.argv[2];
    if (command === "authorize-release") await authorizeRelease();
    else if (command === "diagnose-identity") {
      const receipt = await diagnoseAutopilotIdentity();
      if (process.argv[3]) await writeFile(process.argv[3], `${JSON.stringify(receipt, null, 2)}\n`);
      process.stdout.write(`${JSON.stringify(receipt)}\n`);
      if (receipt.status !== "identity_verified_without_claim") process.exitCode = 1;
    }
    else if (["claim", "report", "release"].includes(command)) {
      const body = process.argv[3] ? JSON.parse(await readFile(process.argv[3], "utf8")) : {};
      const result = await autopilotRequest(command, body);
      if (process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY, `Autopilot ${command} completed.\n`);
      process.stdout.write(`${JSON.stringify(result)}\n`);
    } else throw new Error("Use diagnose-identity, authorize-release, claim, report or release.");
  } catch (error) { process.stderr.write(`${error.message}\n`); process.exitCode = 1; }
}
