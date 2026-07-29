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
}

export async function createSession(env: Env, userId: string): Promise<string> {
  const token = randomToken(32);
  const tokenHash = await sha256(token);
  const now = new Date().toISOString();
  await env.DB.prepare(
    "INSERT INTO sessions (token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)",
  ).bind(tokenHash, userId, now, sessionExpiry()).run();
  return token;
}

export async function sessionUser(request: Request, env: Env): Promise<SessionUser | null> {
  const token = getSessionToken(request);
  if (!token) return null;

  const tokenHash = await sha256(token);
  const now = new Date().toISOString();
  const row = await env.DB.prepare(
    `SELECT u.id, u.username, u.email, u.avatar, u.role, u.is_banned, s.token_hash
       FROM sessions s
       JOIN users u ON u.id = s.user_id
      WHERE s.token_hash = ? AND s.expires_at > ?`,
  ).bind(tokenHash, now).first<SessionRow>();

  if (!row || row.is_banned) {
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
  };
}

export async function requireUser(request: Request, env: Env): Promise<SessionUser> {
  const user = await sessionUser(request, env);
  if (!user) throw new ApiError(401, "Unauthorized");
  return user;
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

  if ((row?.count || 1) > limit) {
    throw new ApiError(429, "Too many attempts. Please try again later.", {
      "retry-after": String(windowSeconds),
    });
  }
}
