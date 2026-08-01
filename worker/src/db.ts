import { ApiError } from "./http.js";
import { getSessionToken, randomToken, sessionExpiry, sha256 } from "./security.js";
import type { Env, SessionUser } from "./types.js";

interface SessionRow {
  id: string;
  username: string;
  email: string | null;
  avatar: string;
  role: string;
  is_banned: number;
  token_hash: string;
  sessionCreatedAt: string;
  adminLastActiveAt: string | null;
}

export const PRIVILEGED_SESSION_IDLE_MS = 15 * 60 * 1_000;
export const PRIVILEGED_SESSION_MAX_AGE_MS = 8 * 60 * 60 * 1_000;
export const RETENTION_CLEANUP_BATCH_SIZE = 500;
export const RETENTION_CLEANUP_MAX_PASSES = 10;

export interface BoundedCleanupOperation {
  name: string;
  prepare: () => D1PreparedStatement;
  probe: () => D1PreparedStatement;
}

export class RetentionCleanupSaturationError extends Error {
  readonly code = "RETENTION_CLEANUP_SATURATED";

  constructor(
    readonly job: string,
    readonly operations: readonly string[],
    readonly perOperationCeiling: number,
  ) {
    super(
      `RETENTION_CLEANUP_SATURATED job=${job} operations=${operations.join(",")} `
      + `perOperationCeiling=${perOperationCeiling}`,
    );
    this.name = "RetentionCleanupSaturationError";
  }
}

function cleanupResultChanges(
  result: D1Result | undefined,
  job: string,
  operation: string,
): number {
  const changes = result?.meta?.changes;
  if (typeof changes !== "number" || !Number.isSafeInteger(changes) || changes < 0) {
    throw new Error(
      `RETENTION_CLEANUP_RESULT_INVALID job=${job} operation=${operation}`,
    );
  }
  return changes;
}

/**
 * Each statement must affect no more than RETENTION_CLEANUP_BATCH_SIZE rows.
 * Saturated batches are retried up to a finite ceiling, then one-row read-only
 * probes distinguish an exact drain from a remaining alertable backlog.
 */
export async function runBoundedRetentionCleanup(
  db: D1Database,
  job: string,
  operations: readonly BoundedCleanupOperation[],
): Promise<void> {
  if (operations.length < 1) return;

  let saturatedOperations: string[] = [];
  for (let pass = 1; pass <= RETENTION_CLEANUP_MAX_PASSES; pass += 1) {
    const results = await db.batch(operations.map(({ prepare }) => prepare()));
    if (results.length !== operations.length) {
      throw new Error(`RETENTION_CLEANUP_RESULT_INVALID job=${job} operation=batch-size`);
    }
    saturatedOperations = operations.flatMap((operation, index) => (
      cleanupResultChanges(results[index], job, operation.name) >= RETENTION_CLEANUP_BATCH_SIZE
        ? [operation.name]
        : []
    ));
    if (saturatedOperations.length === 0) return;
  }

  const saturated = operations.filter(({ name }) => saturatedOperations.includes(name));
  const probes = await db.batch(saturated.map(({ probe }) => probe()));
  if (probes.length !== saturated.length) {
    throw new Error(`RETENTION_CLEANUP_RESULT_INVALID job=${job} operation=probe-size`);
  }
  const remainingOperations = saturated.flatMap((operation, index) => {
    const rows = probes[index]?.results;
    if (!Array.isArray(rows)) {
      throw new Error(
        `RETENTION_CLEANUP_RESULT_INVALID job=${job} operation=${operation.name}-probe`,
      );
    }
    return rows.length > 0 ? [operation.name] : [];
  });
  if (remainingOperations.length === 0) return;

  throw new RetentionCleanupSaturationError(
    job,
    remainingOperations,
    RETENTION_CLEANUP_BATCH_SIZE * RETENTION_CLEANUP_MAX_PASSES,
  );
}

export async function createSession(env: Env, userId: string): Promise<string> {
  const token = randomToken(32);
  const tokenHash = await sha256(token);
  const now = new Date().toISOString();
  await env.DB.batch([
    env.DB.prepare(
      "INSERT INTO sessions (token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)",
    ).bind(tokenHash, userId, now, sessionExpiry()),
    env.DB.prepare(
      `DELETE FROM sessions
        WHERE user_id = ?
          AND token_hash NOT IN (
            SELECT token_hash
              FROM sessions
             WHERE user_id = ?
             ORDER BY created_at DESC, rowid DESC
             LIMIT 5
          )`,
    ).bind(userId, userId),
  ]);
  return token;
}

export async function sessionUser(request: Request, env: Env): Promise<SessionUser | null> {
  const token = getSessionToken(request, env.STATIC_ORIGIN);
  if (!token) return null;

  const tokenHash = await sha256(token);
  const now = new Date().toISOString();
  const row = await env.DB.prepare(
    `SELECT u.id, u.username, u.email, u.avatar, u.role, u.is_banned, s.token_hash,
            s.created_at AS sessionCreatedAt, s.admin_last_active_at AS adminLastActiveAt
       FROM sessions s
       JOIN users u ON u.id = s.user_id
      WHERE s.token_hash = ? AND s.expires_at > ?`,
  ).bind(tokenHash, now).first<SessionRow>();

  if (!row) return null;
  if (row.is_banned) {
    await env.DB.prepare("DELETE FROM sessions WHERE token_hash = ?").bind(tokenHash).run();
    return null;
  }

  return {
    id: row.id,
    username: row.username,
    email: row.email,
    avatar: row.avatar,
    role: row.role,
    tokenHash: row.token_hash,
    sessionCreatedAt: row.sessionCreatedAt,
    adminLastActiveAt: row.adminLastActiveAt,
  };
}

export async function requireUser(request: Request, env: Env): Promise<SessionUser> {
  const user = await sessionUser(request, env);
  if (!user) throw new ApiError(401, "Unauthorized");
  return user;
}

/**
 * Admin console use must remain deliberately short-lived even though a normal
 * JAKH learning session can remain signed in for longer. This updates activity
 * only for API-enforced privileged requests, never public-site activity.
 */
export async function touchPrivilegedSession(env: Env, user: SessionUser): Promise<void> {
  const now = new Date();
  const nowMs = now.getTime();
  const createdAtMs = Date.parse(user.sessionCreatedAt);
  const lastActiveMs = user.adminLastActiveAt === null ? null : Date.parse(user.adminLastActiveAt);
  const invalidTimestamp = !Number.isFinite(createdAtMs)
    || (user.adminLastActiveAt !== null && !Number.isFinite(lastActiveMs));
  const expired = invalidTimestamp
    || nowMs - createdAtMs >= PRIVILEGED_SESSION_MAX_AGE_MS
    || (lastActiveMs !== null && nowMs - lastActiveMs >= PRIVILEGED_SESSION_IDLE_MS);

  if (expired) {
    await env.DB.batch([
      env.DB.prepare("DELETE FROM admin_step_ups WHERE token_hash = ?").bind(user.tokenHash),
      env.DB.prepare("DELETE FROM sessions WHERE token_hash = ?").bind(user.tokenHash),
    ]);
    throw new ApiError(
      401,
      "Your privileged session expired. Sign in again to continue.",
      undefined,
      "ADMIN_SESSION_EXPIRED",
    );
  }

  await env.DB.prepare(
    "UPDATE sessions SET admin_last_active_at = ? WHERE token_hash = ?",
  ).bind(now.toISOString(), user.tokenHash).run();
}

export async function enforceRateLimit(
  env: Env,
  key: string,
  limit: number,
  windowSeconds: number,
): Promise<void> {
  const now = Math.floor(Date.now() / 1000);
  const windowStart = Math.floor(now / windowSeconds) * windowSeconds;
  const expiresAt = windowStart + windowSeconds * 2;
  const row = await env.DB.prepare(
    `INSERT INTO rate_limits (key, window_start, count, expires_at)
     VALUES (?, ?, 1, ?)
     ON CONFLICT(key) DO UPDATE SET
       count = CASE
         WHEN rate_limits.window_start = excluded.window_start THEN rate_limits.count + 1
         ELSE 1
       END,
       window_start = excluded.window_start,
       expires_at = excluded.expires_at
     RETURNING count`,
  ).bind(key, windowStart, expiresAt).first<{ count: number }>();

  const base64UrlAlphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
  const firstValue = base64UrlAlphabet.indexOf(key[0] || "");
  if (row?.count === 1 && firstValue >= 0 && firstValue % 32 === 0) {
    await env.DB.prepare(
      `DELETE FROM rate_limits
        WHERE key IN (
          SELECT key FROM rate_limits
           WHERE expires_at < ?
           LIMIT 100
        )`,
    ).bind(now).run();
  }

  if ((row?.count || 1) > limit) {
    throw new ApiError(429, "Too many attempts. Please try again later.", {
      "retry-after": String(windowSeconds),
    });
  }
}

export async function cleanupExpiredSecurityState(env: Env): Promise<void> {
  const nowIso = new Date().toISOString();
  const nowSeconds = Math.floor(Date.now() / 1000);
  await runBoundedRetentionCleanup(env.DB, "security-state", [
    {
      name: "expired-sessions",
      prepare: () => env.DB.prepare(
        `DELETE FROM sessions
          WHERE token_hash IN (
            SELECT token_hash FROM sessions
             WHERE expires_at <= ?
             LIMIT ${RETENTION_CLEANUP_BATCH_SIZE}
          )`,
      ).bind(nowIso),
      probe: () => env.DB.prepare(
        `SELECT token_hash FROM sessions
          WHERE expires_at <= ?
          LIMIT 1`,
      ).bind(nowIso),
    },
    {
      name: "expired-rate-limits",
      prepare: () => env.DB.prepare(
        `DELETE FROM rate_limits
          WHERE key IN (
            SELECT key FROM rate_limits
             WHERE expires_at < ?
             LIMIT ${RETENTION_CLEANUP_BATCH_SIZE}
          )`,
      ).bind(nowSeconds),
      probe: () => env.DB.prepare(
        `SELECT key FROM rate_limits
          WHERE expires_at < ?
          LIMIT 1`,
      ).bind(nowSeconds),
    },
  ]);
}
