import { createSession, enforceRateLimit, requireUser, sessionUser } from "./db.js";
import { ApiError, json, parseJson } from "./http.js";
import {
  clearSessionCookies,
  clientIp,
  hashPassword,
  normalizeEmail,
  normalizeUsername,
  randomToken,
  sessionCookie,
  sha256,
  validatePassword,
  verifyPassword,
} from "./security.js";
import type { Env } from "./types.js";

const AVATARS = new Set(["👤", "🦊", "🦉", "🐉", "⚡️", "🔥", "👻", "👽", "🦄", "🦁", "🐼", "👑", "🚀", "🧠", "🧙‍♂️", "👾"]);
const STATUSES = new Set(["easy", "medium", "hard", "very-advanced", "wrong-easy", "wrong-medium", "wrong-hard", "wrong-very-advanced"]);
const ID_PATTERN = /^[A-Za-z0-9_-]{2,96}$/u;
const CATEGORY_PATTERN = /^[a-z0-9-]{2,64}$/u;
const POINTS_SQL = `CASE p.status
  WHEN 'easy' THEN 1
  WHEN 'medium' THEN 2
  WHEN 'hard' THEN 3
  WHEN 'very-advanced' THEN 5
  ELSE 0
END`;

interface UserPasswordRow {
  id: string;
  username: string;
  email: string | null;
  avatar: string;
  role: string;
  is_banned: number;
  password_hash: string;
  password_salt: string;
  password_iterations: number;
}

function now(): string {
  return new Date().toISOString();
}

async function requestRateKey(request: Request, env: Env, scope: string): Promise<string> {
  return sha256(`${env.IP_HASH_SALT}:${scope}:${clientIp(request)}`);
}

function setCookie(response: Response, cookie: string): Response {
  const headers = new Headers(response.headers);
  headers.append("set-cookie", cookie);
  return new Response(response.body, { status: response.status, headers });
}

export async function health(env: Env): Promise<Response> {
  const configured = env.PASSWORD_PEPPER?.length >= 24 && env.IP_HASH_SALT?.length >= 24;
  try {
    const result = await env.DB.prepare("SELECT 1 AS ok").first<{ ok: number }>();
    if (!configured || result?.ok !== 1) return json({ ok: false, service: "jakh-api" }, 503);
    return json({ ok: true, service: "jakh-api", version: "1.0.0" });
  } catch {
    return json({ ok: false, service: "jakh-api" }, 503);
  }
}

export async function register(request: Request, env: Env): Promise<Response> {
  const rateKey = await requestRateKey(request, env, "register");
  await enforceRateLimit(env, rateKey, 8, 15 * 60);
  const body = await parseJson<{ username?: unknown; password?: unknown; email?: unknown }>(request);
  const { username, key } = normalizeUsername(body.username);
  const password = validatePassword(body.password);
  const email = normalizeEmail(body.email);
  const passwordRecord = await hashPassword(password, env.PASSWORD_PEPPER);
  const userId = crypto.randomUUID();
  const timestamp = now();

  try {
    await env.DB.prepare(
      `INSERT INTO users (
        id, username, username_key, email, password_hash, password_salt,
        password_iterations, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(
      userId,
      username,
      key,
      email,
      passwordRecord.hash,
      passwordRecord.salt,
      passwordRecord.iterations,
      timestamp,
      timestamp,
    ).run();
  } catch (error) {
    if (String(error).toLowerCase().includes("unique")) {
      throw new ApiError(409, "Username or email already exists");
    }
    throw error;
  }

  const token = await createSession(env, userId);
  return setCookie(
    json({ user: { id: userId, username, email, role: "USER" } }, 201),
    sessionCookie(request, token),
  );
}

export async function login(request: Request, env: Env): Promise<Response> {
  const body = await parseJson<{ username?: unknown; password?: unknown }>(request);
  const { key } = normalizeUsername(body.username);
  const password = validatePassword(body.password);
  const rateKey = await requestRateKey(request, env, "login");
  await enforceRateLimit(env, rateKey, 20, 15 * 60);

  const user = await env.DB.prepare(
    `SELECT id, username, email, avatar, role, is_banned, password_hash, password_salt, password_iterations
       FROM users WHERE username_key = ?`,
  ).bind(key).first<UserPasswordRow>();

  if (!user) {
    await hashPassword(password, env.PASSWORD_PEPPER, "AAAAAAAAAAAAAAAAAAAAAA", 310_000);
    throw new ApiError(401, "Invalid credentials");
  }
  if (user.is_banned) throw new ApiError(403, "This account has been suspended");
  if (!await verifyPassword(password, env.PASSWORD_PEPPER, user.password_hash, user.password_salt, user.password_iterations)) {
    throw new ApiError(401, "Invalid credentials");
  }

  const timestamp = now();
  await env.DB.batch([
    env.DB.prepare("UPDATE users SET last_login_at = ?, updated_at = ? WHERE id = ?")
      .bind(timestamp, timestamp, user.id),
    env.DB.prepare("DELETE FROM sessions WHERE expires_at <= ?").bind(timestamp),
  ]);
  const token = await createSession(env, user.id);
  return setCookie(
    json({ user: { id: user.id, username: user.username, email: user.email, role: user.role } }),
    sessionCookie(request, token),
  );
}

export async function logout(request: Request, env: Env): Promise<Response> {
  const user = await sessionUser(request, env);
  if (user) await env.DB.prepare("DELETE FROM sessions WHERE token_hash = ?").bind(user.tokenHash).run();
  const response = json({ message: "Logged out successfully" });
  const headers = new Headers(response.headers);
  for (const cookie of clearSessionCookies()) headers.append("set-cookie", cookie);
  return new Response(response.body, { status: response.status, headers });
}

export async function profile(request: Request, env: Env): Promise<Response> {
  const user = await requireUser(request, env);
  const [progressResult, favoritesResult] = await Promise.all([
    env.DB.prepare(
      `SELECT card_id AS cardId, category_id AS categoryId, status, created_at AS createdAt
         FROM progress WHERE user_id = ? ORDER BY updated_at`,
    ).bind(user.id).all(),
    env.DB.prepare(
      `SELECT card_id AS cardId, category_id AS categoryId, created_at AS createdAt
         FROM favorites WHERE user_id = ? ORDER BY created_at`,
    ).bind(user.id).all(),
  ]);
  const progress = progressResult.results;
  const favorites = favoritesResult.results;
  return json({
    id: user.id,
    username: user.username,
    email: user.email,
    avatar: user.avatar,
    role: user.role,
    stats: {
      solvedCount: progress.filter((item) => !String(item.status).startsWith("wrong-")).length,
      favoritesCount: favorites.length,
    },
    progress,
    favorites,
  });
}

export async function avatar(request: Request, env: Env): Promise<Response> {
  const user = await requireUser(request, env);
  const body = await parseJson<{ avatar?: unknown }>(request);
  if (typeof body.avatar !== "string" || !AVATARS.has(body.avatar)) throw new ApiError(400, "Invalid avatar");
  await env.DB.prepare("UPDATE users SET avatar = ?, updated_at = ? WHERE id = ?")
    .bind(body.avatar, now(), user.id).run();
  return json({ success: true, avatar: body.avatar });
}

export async function changePassword(request: Request, env: Env): Promise<Response> {
  const session = await requireUser(request, env);
  const rateKey = await requestRateKey(request, env, `password:${session.id}`);
  await enforceRateLimit(env, rateKey, 5, 15 * 60);
  const body = await parseJson<{ currentPassword?: unknown; newPassword?: unknown }>(request);
  const currentPassword = validatePassword(body.currentPassword, "Current password");
  const newPassword = validatePassword(body.newPassword, "New password");
  if (currentPassword === newPassword) throw new ApiError(400, "New password must be different");

  const user = await env.DB.prepare(
    "SELECT password_hash, password_salt, password_iterations FROM users WHERE id = ?",
  ).bind(session.id).first<Pick<UserPasswordRow, "password_hash" | "password_salt" | "password_iterations">>();
  if (!user || !await verifyPassword(
    currentPassword,
    env.PASSWORD_PEPPER,
    user.password_hash,
    user.password_salt,
    user.password_iterations,
  )) {
    throw new ApiError(401, "Current password is incorrect");
  }

  const passwordRecord = await hashPassword(newPassword, env.PASSWORD_PEPPER);
  await env.DB.batch([
    env.DB.prepare(
      `UPDATE users SET password_hash = ?, password_salt = ?, password_iterations = ?, updated_at = ?
        WHERE id = ?`,
    ).bind(passwordRecord.hash, passwordRecord.salt, passwordRecord.iterations, now(), session.id),
    env.DB.prepare("DELETE FROM sessions WHERE user_id = ? AND token_hash <> ?")
      .bind(session.id, session.tokenHash),
  ]);
  return json({ success: true, message: "Password updated successfully" });
}

function normalizeCardId(value: unknown): string {
  if (typeof value !== "string" || !ID_PATTERN.test(value)) throw new ApiError(400, "Invalid cardId");
  return value;
}

function normalizeCategory(value: unknown): string {
  if (value === undefined || value === null || value === "") return "unknown";
  if (typeof value !== "string" || (value !== "unknown" && !CATEGORY_PATTERN.test(value))) {
    throw new ApiError(400, "Invalid categoryId");
  }
  return value;
}

export async function saveProgress(request: Request, env: Env): Promise<Response> {
  const user = await requireUser(request, env);
  const body = await parseJson<{ cardId?: unknown; categoryId?: unknown; status?: unknown }>(request);
  const cardId = normalizeCardId(body.cardId);
  const categoryId = normalizeCategory(body.categoryId);
  const status = body.status === "correct" ? "easy" : body.status;
  if (typeof status !== "string" || !STATUSES.has(status)) throw new ApiError(400, "Invalid status");
  const timestamp = now();
  const correctAt = status.startsWith("wrong-") ? null : timestamp;
  await env.DB.prepare(
    `INSERT INTO progress (
      user_id, card_id, category_id, status, first_correct_at, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(user_id, card_id) DO UPDATE SET
      category_id = excluded.category_id,
      status = excluded.status,
      first_correct_at = COALESCE(progress.first_correct_at, excluded.first_correct_at),
      updated_at = excluded.updated_at`,
  ).bind(user.id, cardId, categoryId, status, correctAt, timestamp, timestamp).run();
  return json({ success: true });
}

export async function deleteProgress(request: Request, env: Env): Promise<Response> {
  const user = await requireUser(request, env);
  const body = await parseJson<{ cardId?: unknown }>(request);
  const cardId = normalizeCardId(body.cardId);
  await env.DB.prepare("DELETE FROM progress WHERE user_id = ? AND card_id = ?").bind(user.id, cardId).run();
  return json({ success: true });
}

export async function favorite(request: Request, env: Env): Promise<Response> {
  const user = await requireUser(request, env);
  const body = await parseJson<{ cardId?: unknown; categoryId?: unknown; action?: unknown }>(request);
  const cardId = normalizeCardId(body.cardId);
  const categoryId = normalizeCategory(body.categoryId);
  const action = body.action === undefined ? "add" : body.action;
  if (action !== "add" && action !== "remove") throw new ApiError(400, "Invalid favorite action");

  if (action === "add") {
    await env.DB.prepare(
      `INSERT INTO favorites (user_id, card_id, category_id, created_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(user_id, card_id) DO UPDATE SET category_id = excluded.category_id`,
    ).bind(user.id, cardId, categoryId, now()).run();
  } else {
    await env.DB.prepare("DELETE FROM favorites WHERE user_id = ? AND card_id = ?").bind(user.id, cardId).run();
  }
  return json({ success: true });
}

function previousDate(date: string): string {
  const value = new Date(`${date}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() - 1);
  return value.toISOString().slice(0, 10);
}

export async function streak(request: Request, env: Env): Promise<Response> {
  const user = await requireUser(request, env);
  const [datesResult, record] = await Promise.all([
    env.DB.prepare(
      `SELECT DISTINCT substr(first_correct_at, 1, 10) AS activityDate
         FROM progress
        WHERE user_id = ? AND first_correct_at IS NOT NULL
        ORDER BY activityDate DESC`,
    ).bind(user.id).all<{ activityDate: string }>(),
    env.DB.prepare(
      "SELECT streak_freeze_count, streak_freeze_highest FROM users WHERE id = ?",
    ).bind(user.id).first<{ streak_freeze_count: number; streak_freeze_highest: number }>(),
  ]);
  const dates = datesResult.results.map((item) => item.activityDate);
  const today = new Date().toISOString().slice(0, 10);
  const yesterday = previousDate(today);
  let freezeCount = record?.streak_freeze_count || 0;
  if (!dates.length || (dates[0] !== today && dates[0] !== yesterday)) {
    return json({ streak: 0, freezeCount });
  }

  let count = 0;
  let expected = dates[0] as string;
  let available = freezeCount;
  let used = 0;
  for (const date of dates) {
    if (date === expected) {
      count += 1;
      expected = previousDate(expected);
    } else if (date === previousDate(expected) && available > 0) {
      available -= 1;
      used += 1;
      count += 2;
      expected = previousDate(date);
    } else {
      break;
    }
  }

  const highest = record?.streak_freeze_highest || 0;
  const earned = Math.max(0, Math.floor(count / 7) - Math.floor(highest / 7));
  freezeCount = Math.min(3, Math.max(0, freezeCount - used) + earned);
  if (earned || used || count > highest) {
    await env.DB.prepare(
      "UPDATE users SET streak_freeze_count = ?, streak_freeze_highest = ?, updated_at = ? WHERE id = ?",
    ).bind(freezeCount, Math.max(highest, count), now(), user.id).run();
  }
  return json({ streak: count, freezeCount });
}

export async function analytics(request: Request, env: Env): Promise<Response> {
  const user = await requireUser(request, env);
  const body = await parseJson<{ pageSlug?: unknown; timeSpent?: unknown }>(request);
  const pageSlug = normalizeCategory(body.pageSlug);
  const timeSpent = Number(body.timeSpent);
  if (!Number.isInteger(timeSpent) || timeSpent < 1 || timeSpent > 300) {
    throw new ApiError(400, "Invalid timeSpent");
  }
  const timestamp = now();
  const activityDate = timestamp.slice(0, 10);
  await env.DB.prepare(
    `INSERT INTO analytics_daily (user_id, page_slug, activity_date, time_spent, updated_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(user_id, page_slug, activity_date) DO UPDATE SET
       time_spent = MIN(86400, analytics_daily.time_spent + excluded.time_spent),
       updated_at = excluded.updated_at`,
  ).bind(user.id, pageSlug, activityDate, timeSpent, timestamp).run();
  return json({ success: true });
}

export async function leaderboard(env: Env): Promise<Response> {
  const result = await env.DB.prepare(
    `SELECT u.username, u.avatar, SUM(${POINTS_SQL}) AS score
       FROM users u
       JOIN progress p ON p.user_id = u.id
      WHERE u.is_banned = 0 AND p.status NOT LIKE 'wrong-%'
      GROUP BY u.id, u.username, u.avatar
      HAVING score > 0
      ORDER BY score DESC, u.created_at ASC
      LIMIT 20`,
  ).all<{ username: string; avatar: string; score: number }>();
  return json({
    leaderboard: result.results.map((row, index) => ({
      rank: index + 1,
      username: row.username,
      avatar: row.avatar,
      score: row.score,
    })),
  }, 200, { "cache-control": "public, max-age=30" });
}

export async function suggestion(request: Request, env: Env): Promise<Response> {
  const ipHash = await requestRateKey(request, env, "suggestion");
  await enforceRateLimit(env, ipHash, 5, 60 * 60);
  const body = await parseJson<{ text?: unknown; email?: unknown }>(request, 8_192);
  if (typeof body.text !== "string") throw new ApiError(400, "Suggestion text is required");
  const text = body.text.trim();
  if (text.length < 5 || text.length > 2_000) throw new ApiError(400, "Suggestion must be 5–2,000 characters");
  const email = normalizeEmail(body.email);
  await env.DB.prepare(
    "INSERT INTO suggestions (id, text, email, ip_hash, created_at) VALUES (?, ?, ?, ?, ?)",
  ).bind(randomToken(18), text, email, ipHash, now()).run();
  return json({ success: true }, 201);
}
