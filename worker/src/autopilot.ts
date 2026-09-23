import { enforceRateLimit, requireUser, touchPrivilegedSession } from "./db.js";
import { ApiError, json, originIsAllowed, parseJson } from "./http.js";
import { clientIp, sha256 } from "./security.js";
import type { Env } from "./types.js";

const REPOSITORY = "jame17291-sys/jakh.net";
const ISSUER = "https://token.actions.githubusercontent.com";
const JWKS_URL = `${ISSUER}/.well-known/jwks`;
const AUDIENCE = "https://api.riddlearabia.com/autopilot";
const ENABLED_KEY = "autopilot:v1:enabled";
const RUN_PREFIX = "autopilot:v1:run:";
const WORKFLOW_PREFIX = `${REPOSITORY}/.github/workflows/`;
const SHA = /^[a-f0-9]{40}$/u;
const RUN_ID = /^[1-9][0-9]{0,19}$/u;
const POLICY = Object.freeze({ schedule: "Daily at 07:23 Dubai", maxRunsPerDay: 1, maxReleasesPerDay: 1, aiBudgetUsd: 0 });
const STATUSES = new Set(["inspecting", "no_changes", "needs_attention", "fixing", "testing", "release_reserved", "deployed", "failed", "rolled_back", "paused"]);
const TERMINAL = new Set(["no_changes", "needs_attention", "deployed", "failed", "rolled_back", "paused"]);
const FINDING_KEYS = ["brokenLinks", "accessibility", "performance", "dependencies", "content", "total"] as const;
type Findings = Record<typeof FINDING_KEYS[number], number>;
interface Run {
  day: string;
  runId: string;
  runAttempt: string;
  url: string;
  status: string;
  startedAt: string;
  updatedAt: string;
  sourceSha: string;
  findings: Findings;
  fixesApplied: number;
  checksPassed: number;
  checksFailed: number;
  candidateSha: string | null;
  releaseReservedAt: string | null;
  buildId: string | null;
  workerVersion: string | null;
  deploymentRunId: string | null;
  deploymentUrl: string | null;
  apiReleaseRunId: string | null;
  apiReleaseRunAttempt: string | null;
  staticReleaseRunId: string | null;
  staticReleaseRunAttempt: string | null;
}
interface Identity { runId: string; runAttempt: string; sourceSha: string; stage: "maintenance" | "api" | "static" }
interface KeySet { keys: (JsonWebKey & { kid?: string; use?: string; alg?: string })[] }
let cachedKeys: { expiresAt: number; keys: KeySet["keys"] } | null = null;

function failure(status: number, code: string): never {
  throw new ApiError(status, code.replaceAll("_", " ").toLowerCase(), undefined, code);
}
function timestamp(): string { return new Date().toISOString(); }
function today(): string { return timestamp().slice(0, 10); }
function runUrl(runId: string): string { return `https://github.com/${REPOSITORY}/actions/runs/${runId}`; }
function asObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) failure(400, "AUTOPILOT_PAYLOAD_INVALID");
  return value as Record<string, unknown>;
}
function onlyKeys(body: Record<string, unknown>, keys: string[]): void {
  if (Object.keys(body).some((key) => !keys.includes(key))) failure(400, "AUTOPILOT_PAYLOAD_INVALID");
}
function decodeSegment(value: string): Uint8Array<ArrayBuffer> {
  if (!/^[A-Za-z0-9_-]+$/u.test(value)) failure(401, "AUTOPILOT_IDENTITY_INVALID");
  const binary = atob(value.replaceAll("-", "+").replaceAll("_", "/").padEnd(Math.ceil(value.length / 4) * 4, "="));
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}
async function signingKeys(): Promise<KeySet["keys"]> {
  if (cachedKeys && cachedKeys.expiresAt > Date.now()) return cachedKeys.keys;
  const response = await fetch(JWKS_URL, { redirect: "error", signal: AbortSignal.timeout(5_000) });
  if (!response.ok) failure(503, "AUTOPILOT_IDENTITY_UNAVAILABLE");
  // GitHub's fixed endpoint is the only key source; token-controlled URLs are never followed.
  const body = await response.text();
  if (body.length > 65_536) failure(503, "AUTOPILOT_IDENTITY_UNAVAILABLE");
  const keySet = JSON.parse(body) as KeySet;
  if (!Array.isArray(keySet.keys) || keySet.keys.length > 20) failure(503, "AUTOPILOT_IDENTITY_UNAVAILABLE");
  cachedKeys = { expiresAt: Date.now() + 5 * 60_000, keys: keySet.keys };
  return keySet.keys;
}
export async function verifyAutopilotIdentity(request: Request, releaseWorkflow = false): Promise<Identity> {
  const authorization = request.headers.get("authorization") || "";
  if (!authorization.startsWith("Bearer ") || authorization.length > 16_384) failure(401, "AUTOPILOT_IDENTITY_INVALID");
  try {
    const parts = authorization.slice(7).split(".");
    if (parts.length !== 3) failure(401, "AUTOPILOT_IDENTITY_INVALID");
    const [encodedHeader = "", encodedClaims = "", encodedSignature = ""] = parts;
    const header = JSON.parse(new TextDecoder().decode(decodeSegment(encodedHeader))) as Record<string, unknown>;
    const claims = JSON.parse(new TextDecoder().decode(decodeSegment(encodedClaims))) as Record<string, unknown>;
    if (header.alg !== "RS256" || typeof header.kid !== "string" || header.kid.length > 128 || header.jku || header.jwk || header.x5u || header.crit) {
      failure(401, "AUTOPILOT_IDENTITY_INVALID");
    }
    const key = (await signingKeys()).find((entry) => entry.kid === header.kid && entry.kty === "RSA" && entry.use === "sig" && (!entry.alg || entry.alg === "RS256"));
    if (!key) failure(401, "AUTOPILOT_IDENTITY_INVALID");
    const imported = await crypto.subtle.importKey("jwk", key, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]);
    if (!await crypto.subtle.verify("RSASSA-PKCS1-v1_5", imported, decodeSegment(encodedSignature), new TextEncoder().encode(`${encodedHeader}.${encodedClaims}`))) {
      failure(401, "AUTOPILOT_IDENTITY_INVALID");
    }
    const now = Math.floor(Date.now() / 1_000);
    if (typeof claims.exp !== "number" || typeof claims.iat !== "number" || typeof claims.nbf !== "number"
      || claims.exp <= now || claims.iat > now + 30 || claims.iat < now - 600 || claims.nbf > now + 30
      || claims.exp - claims.iat > 900 || claims.exp <= claims.iat) failure(401, "AUTOPILOT_IDENTITY_EXPIRED");
    if (claims.iss !== ISSUER || claims.aud !== AUDIENCE || claims.repository !== REPOSITORY
      || claims.repository_id !== "1227088138" || claims.repository_owner_id !== "281123018"
      || claims.workflow_sha !== claims.sha || claims.runner_environment !== "github-hosted"
      || claims.ref !== "refs/heads/main" || (claims.ref_protected !== "true" && claims.ref_protected !== true)
      || claims.ref_type !== "branch" || typeof claims.sha !== "string" || !SHA.test(claims.sha)
      || typeof claims.run_id !== "string" || !RUN_ID.test(claims.run_id)
      || typeof claims.run_attempt !== "string" || !/^[1-9][0-9]{0,3}$/u.test(claims.run_attempt)
      || typeof claims.jti !== "string" || !/^[A-Za-z0-9_-]{8,128}$/u.test(claims.jti)) failure(403, "AUTOPILOT_IDENTITY_SCOPE_INVALID");
    let stage: Identity["stage"] = "maintenance";
    if (releaseWorkflow) {
      if (claims.workflow_ref === `${WORKFLOW_PREFIX}api-deploy.yml@refs/heads/main`) stage = "api";
      else if (claims.workflow_ref === `${WORKFLOW_PREFIX}static-site.yml@refs/heads/main`) stage = "static";
      else failure(403, "AUTOPILOT_IDENTITY_SCOPE_INVALID");
      if (claims.event_name !== "workflow_dispatch") failure(403, "AUTOPILOT_IDENTITY_SCOPE_INVALID");
    } else if (claims.workflow_ref !== `${WORKFLOW_PREFIX}site-autopilot.yml@refs/heads/main`
      || !["schedule", "workflow_dispatch"].includes(String(claims.event_name))) failure(403, "AUTOPILOT_IDENTITY_SCOPE_INVALID");
    return { runId: claims.run_id, runAttempt: claims.run_attempt, sourceSha: claims.sha, stage };
  } catch (error) {
    if (error instanceof ApiError) throw error;
    failure(401, "AUTOPILOT_IDENTITY_INVALID");
  }
}
async function isEnabled(env: Env): Promise<boolean> {
  return (await env.DB.prepare("SELECT value FROM schema_meta WHERE key = ?").bind(ENABLED_KEY).first<{ value: string }>())?.value === "true";
}
async function requireEnabled(env: Env): Promise<void> { if (!await isEnabled(env)) failure(423, "AUTOPILOT_PAUSED"); }
async function requireOwner(request: Request, env: Env): Promise<void> {
  const user = await requireUser(request, env);
  if (user.role !== "OWNER") failure(403, "OWNER_REQUIRED");
  await touchPrivilegedSession(env, user);
}
async function readRun(env: Env, day: string): Promise<{ run: Run; raw: string }> {
  const row = await env.DB.prepare("SELECT value FROM schema_meta WHERE key = ?").bind(RUN_PREFIX + day).first<{ value: string }>();
  if (!row) failure(409, "AUTOPILOT_RUN_NOT_CLAIMED");
  return { run: JSON.parse(row.value) as Run, raw: row.value };
}
function requireDay(value: unknown): string {
  if (value !== today()) failure(409, "AUTOPILOT_DAY_INVALID");
  return String(value);
}
function ownRun(run: Run, identity: Identity): void {
  if (run.runId !== identity.runId || run.runAttempt !== identity.runAttempt || run.sourceSha !== identity.sourceSha) failure(409, "AUTOPILOT_RUN_MISMATCH");
}
async function replaceRun(env: Env, run: Run, previous: string, allowPaused = false): Promise<void> {
  const result = await env.DB.prepare(
    `UPDATE schema_meta SET value = ? WHERE key = ? AND value = ?
     AND (? = 1 OR EXISTS (SELECT 1 FROM schema_meta WHERE key = ? AND value = 'true'))`,
  ).bind(JSON.stringify(run), RUN_PREFIX + run.day, previous, allowPaused ? 1 : 0, ENABLED_KEY).run();
  if (result.meta?.changes !== 1) {
    await requireEnabled(env);
    failure(409, "AUTOPILOT_RUN_CHANGED");
  }
}
export async function adminAutopilot(request: Request, env: Env): Promise<Response> {
  await requireOwner(request, env);
  const rows = await env.DB.prepare("SELECT value FROM schema_meta WHERE key GLOB 'autopilot:v1:run:*' ORDER BY key DESC LIMIT 30").all<{ value: string }>();
  const runs = rows.results.map((row) => JSON.parse(row.value) as Run);
  return json({ enabled: await isEnabled(env), policy: POLICY, runs, lastRun: runs[0] || null });
}
export async function updateAdminAutopilot(request: Request, env: Env): Promise<Response> {
  if (!request.headers.get("origin") || !originIsAllowed(request, env.ALLOWED_ORIGINS)) failure(403, "ORIGIN_NOT_ALLOWED");
  const user = await requireUser(request, env);
  if (user.role !== "OWNER") failure(403, "OWNER_REQUIRED");
  await touchPrivilegedSession(env, user);
  await enforceRateLimit(env, await sha256(`${env.IP_HASH_SALT}:autopilot:${user.id}:${clientIp(request)}`), 20, 3_600);
  const body = await parseJson<Record<string, unknown>>(request, 256);
  onlyKeys(body, ["enabled"]);
  if (typeof body.enabled !== "boolean") failure(400, "AUTOPILOT_PAYLOAD_INVALID");
  const now = timestamp();
  const statements = [env.DB.prepare("INSERT INTO schema_meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").bind(ENABLED_KEY, String(body.enabled)),
    env.DB.prepare("INSERT INTO admin_audit_log (id, actor_user_id, action, target_type, target_id, detail, created_at) VALUES (?, ?, ?, 'autopilot', 'policy', ?, ?)")
      .bind(crypto.randomUUID(), user.id, body.enabled ? "autopilot.resumed" : "autopilot.paused", JSON.stringify({ enabled: body.enabled }), now)];
  if (!body.enabled) statements.push(env.DB.prepare(
    `UPDATE schema_meta SET value = json_set(value, '$.status', 'paused', '$.updatedAt', ?)
     WHERE key GLOB 'autopilot:v1:run:*' AND json_extract(value, '$.status') IN ('inspecting','fixing','testing','release_reserved')`,
  ).bind(now));
  await env.DB.batch(statements);
  return adminAutopilot(request, env);
}
export async function claimAutopilot(request: Request, env: Env): Promise<Response> {
  const identity = await verifyAutopilotIdentity(request);
  onlyKeys(await parseJson<Record<string, unknown>>(request, 256), []);
  await requireEnabled(env);
  const now = timestamp();
  const day = now.slice(0, 10);
  const run: Run = {
    day, runId: identity.runId, runAttempt: identity.runAttempt, sourceSha: identity.sourceSha, url: runUrl(identity.runId),
    status: "inspecting", startedAt: now, updatedAt: now,
    findings: { brokenLinks: 0, accessibility: 0, performance: 0, dependencies: 0, content: 0, total: 0 },
    fixesApplied: 0, checksPassed: 0, checksFailed: 0, candidateSha: null, releaseReservedAt: null,
    buildId: null, workerVersion: null, deploymentRunId: null, deploymentUrl: null,
    apiReleaseRunId: null, apiReleaseRunAttempt: null, staticReleaseRunId: null, staticReleaseRunAttempt: null,
  };
  await env.DB.batch([
    env.DB.prepare(`INSERT OR IGNORE INTO schema_meta (key, value) SELECT ?, ? WHERE EXISTS (SELECT 1 FROM schema_meta WHERE key = ? AND value = 'true')`)
      .bind(RUN_PREFIX + day, JSON.stringify(run), ENABLED_KEY),
    env.DB.prepare(`DELETE FROM schema_meta WHERE key GLOB 'autopilot:v1:run:*' AND key NOT IN (SELECT key FROM schema_meta WHERE key GLOB 'autopilot:v1:run:*' ORDER BY key DESC LIMIT 30)`),
  ]);
  await requireEnabled(env);
  const stored = (await readRun(env, day)).run;
  ownRun(stored, identity);
  if (stored.status === "paused") failure(423, "AUTOPILOT_PAUSED");
  return json({ claimed: true, day, run: stored });
}
export async function reserveAutopilotRelease(request: Request, env: Env): Promise<Response> {
  const identity = await verifyAutopilotIdentity(request);
  const body = await parseJson<Record<string, unknown>>(request, 512);
  onlyKeys(body, ["day", "candidateSha"]);
  const day = requireDay(body.day);
  if (typeof body.candidateSha !== "string" || !SHA.test(body.candidateSha)) failure(400, "AUTOPILOT_PAYLOAD_INVALID");
  await requireEnabled(env);
  const { run, raw } = await readRun(env, day);
  ownRun(run, identity);
  if (run.status === "paused") failure(423, "AUTOPILOT_PAUSED");
  if (TERMINAL.has(run.status)) failure(409, "AUTOPILOT_RUN_FINISHED");
  if (run.releaseReservedAt) {
    if (run.candidateSha !== body.candidateSha) failure(409, "AUTOPILOT_RELEASE_ALREADY_RESERVED");
    return json({ reserved: true, run });
  }
  run.candidateSha = body.candidateSha;
  run.releaseReservedAt = timestamp();
  run.updatedAt = run.releaseReservedAt;
  run.status = "release_reserved";
  await replaceRun(env, run, raw);
  return json({ reserved: true, run });
}
export async function authorizeAutopilotRelease(request: Request, env: Env): Promise<Response> {
  const identity = await verifyAutopilotIdentity(request, true);
  const body = await parseJson<Record<string, unknown>>(request, 512);
  onlyKeys(body, ["day", "maintenanceRunId", "candidateSha"]);
  const day = requireDay(body.day);
  await requireEnabled(env);
  const { run, raw } = await readRun(env, day);
  if (run.status === "paused") failure(423, "AUTOPILOT_PAUSED");
  if (!run.releaseReservedAt || run.runId !== body.maintenanceRunId || run.candidateSha !== body.candidateSha || run.candidateSha !== identity.sourceSha) failure(409, "AUTOPILOT_RELEASE_MISMATCH");
  if (identity.stage === "static" && !run.apiReleaseRunId) failure(409, "AUTOPILOT_API_RELEASE_REQUIRED");
  if (TERMINAL.has(run.status)) failure(409, "AUTOPILOT_RUN_FINISHED");
  const idKey = identity.stage === "api" ? "apiReleaseRunId" : "staticReleaseRunId";
  const attemptKey = identity.stage === "api" ? "apiReleaseRunAttempt" : "staticReleaseRunAttempt";
  if (run[idKey]) {
    if (run[idKey] !== identity.runId || run[attemptKey] !== identity.runAttempt) failure(409, "AUTOPILOT_RELEASE_ALREADY_AUTHORIZED");
    return json({ authorized: true, stage: identity.stage, run });
  }
  run[idKey] = identity.runId;
  run[attemptKey] = identity.runAttempt;
  run.updatedAt = timestamp();
  await replaceRun(env, run, raw);
  return json({ authorized: true, stage: identity.stage, run });
}
function counter(value: unknown): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0 || value > 100_000) failure(400, "AUTOPILOT_PAYLOAD_INVALID");
  return value;
}
export async function reportAutopilot(request: Request, env: Env): Promise<Response> {
  const identity = await verifyAutopilotIdentity(request);
  const body = await parseJson<Record<string, unknown>>(request, 2_048);
  onlyKeys(body, ["day", "status", "findings", "fixesApplied", "checksPassed", "checksFailed", "candidateSha", "buildId", "workerVersion", "deploymentRunId"]);
  const day = requireDay(body.day);
  if (typeof body.status !== "string" || !STATUSES.has(body.status) || body.status === "release_reserved") failure(400, "AUTOPILOT_PAYLOAD_INVALID");
  const { run, raw } = await readRun(env, day);
  ownRun(run, identity);
  if (run.status === "paused" && body.status !== "paused") failure(423, "AUTOPILOT_PAUSED");
  if (TERMINAL.has(run.status) && run.status !== body.status && !(run.status === "deployed" && ["failed", "rolled_back"].includes(body.status))) failure(409, "AUTOPILOT_RUN_FINISHED");
  const allowPaused = ["failed", "paused", "rolled_back"].includes(body.status);
  if (!allowPaused) await requireEnabled(env);
  if (["deployed", "rolled_back"].includes(body.status) && !run.staticReleaseRunId) failure(409, "AUTOPILOT_RELEASE_MISMATCH");
  if (body.findings !== undefined) {
    const findings = asObject(body.findings);
    onlyKeys(findings, [...FINDING_KEYS]);
    for (const key of FINDING_KEYS) if (findings[key] !== undefined) run.findings[key] = counter(findings[key]);
  }
  for (const key of ["fixesApplied", "checksPassed", "checksFailed"] as const) if (body[key] !== undefined) run[key] = counter(body[key]);
  if (body.candidateSha !== undefined) {
    if (typeof body.candidateSha !== "string" || !SHA.test(body.candidateSha) || (run.candidateSha && run.candidateSha !== body.candidateSha)) failure(400, "AUTOPILOT_PAYLOAD_INVALID");
    run.candidateSha = body.candidateSha;
  }
  if (body.buildId !== undefined) {
    if (typeof body.buildId !== "string" || !/^[a-f0-9]{64}$/u.test(body.buildId)) failure(400, "AUTOPILOT_PAYLOAD_INVALID");
    run.buildId = body.buildId;
  }
  if (body.workerVersion !== undefined) {
    if (typeof body.workerVersion !== "string" || !/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/u.test(body.workerVersion)) failure(400, "AUTOPILOT_PAYLOAD_INVALID");
    run.workerVersion = body.workerVersion;
  }
  if (body.deploymentRunId !== undefined) {
    if (body.deploymentRunId !== run.staticReleaseRunId) failure(400, "AUTOPILOT_PAYLOAD_INVALID");
    run.deploymentRunId = String(body.deploymentRunId);
    run.deploymentUrl = runUrl(run.deploymentRunId);
  }
  run.status = body.status;
  run.updatedAt = timestamp();
  await replaceRun(env, run, raw, allowPaused);
  return json({ recorded: true, run });
}
