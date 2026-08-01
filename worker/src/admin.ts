import { enforceRateLimit, requireUser } from "./db.js";
import { ApiError, json, parseJson } from "./http.js";
import { clientIp, sha256 } from "./security.js";
import type { Env, SessionUser } from "./types.js";

type AdminRole = "ADMIN" | "OWNER";

function timestamp(): string { return new Date().toISOString(); }

async function requireAdmin(request: Request, env: Env): Promise<SessionUser> {
  const user = await requireUser(request, env);
  if (user.role !== "ADMIN" && user.role !== "OWNER") {
    throw new ApiError(403, "Administrator access is required", undefined, "ADMIN_REQUIRED");
  }
  return user;
}

async function requireOwner(request: Request, env: Env): Promise<SessionUser> {
  const user = await requireAdmin(request, env);
  if (user.role !== "OWNER") {
    throw new ApiError(403, "Owner access is required", undefined, "OWNER_REQUIRED");
  }
  return user;
}

async function rateLimitAdmin(request: Request, env: Env, user: SessionUser, action: string): Promise<void> {
  const key = await sha256(`${env.IP_HASH_SALT}:admin:${action}:${user.id}:${clientIp(request)}`);
  await enforceRateLimit(env, key, 60, 60 * 60);
}

async function audit(env: Env, actor: SessionUser, action: string, targetType: string, targetId: string, detail: string): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO admin_audit_log (id, actor_user_id, action, target_type, target_id, detail, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).bind(crypto.randomUUID(), actor.id, action, targetType, targetId, detail, timestamp()).run();
}

export async function adminOverview(request: Request, env: Env): Promise<Response> {
  await requireAdmin(request, env);
  const [users, admins, solves, pendingSuggestions, recentUsers, suggestions] = await Promise.all([
    env.DB.prepare("SELECT COUNT(*) AS count FROM users").first<{ count: number }>(),
    env.DB.prepare("SELECT COUNT(*) AS count FROM users WHERE role IN ('ADMIN', 'OWNER')").first<{ count: number }>(),
    env.DB.prepare("SELECT COUNT(*) AS count FROM progress WHERE status NOT LIKE 'wrong-%'").first<{ count: number }>(),
    env.DB.prepare("SELECT COUNT(*) AS count FROM suggestions WHERE status = 'new'").first<{ count: number }>(),
    env.DB.prepare("SELECT username, email, role, created_at AS createdAt FROM users ORDER BY created_at DESC LIMIT 8").all(),
    env.DB.prepare("SELECT id, text, email, status, created_at AS createdAt FROM suggestions ORDER BY created_at DESC LIMIT 8").all(),
  ]);
  return json({
    metrics: { users: users?.count || 0, administrators: admins?.count || 0, solved: solves?.count || 0, pendingSuggestions: pendingSuggestions?.count || 0 },
    recentUsers: recentUsers.results,
    recentSuggestions: suggestions.results,
  });
}

export async function adminUsers(request: Request, env: Env): Promise<Response> {
  await requireAdmin(request, env);
  const url = new URL(request.url);
  const search = (url.searchParams.get("search") || "").trim().slice(0, 64);
  const query = search ? `%${search.replaceAll("%", "\\%").replaceAll("_", "\\_")}%` : "%";
  const rows = await env.DB.prepare(
    `SELECT id, username, email, role, is_banned AS isBanned, created_at AS createdAt, last_login_at AS lastLoginAt
       FROM users WHERE username LIKE ? ESCAPE '\\' OR email LIKE ? ESCAPE '\\'
      ORDER BY created_at DESC LIMIT 100`,
  ).bind(query, query).all();
  return json({ users: rows.results });
}

export async function updateUserRole(request: Request, env: Env, targetId: string): Promise<Response> {
  const owner = await requireOwner(request, env);
  await rateLimitAdmin(request, env, owner, "role");
  const body = await parseJson<{ role?: unknown }>(request, 1_024);
  if (body.role !== "USER" && body.role !== "ADMIN") throw new ApiError(400, "Invalid role", undefined, "ROLE_INVALID");
  const target = await env.DB.prepare("SELECT id, role FROM users WHERE id = ?").bind(targetId).first<{ id: string; role: string }>();
  if (!target) throw new ApiError(404, "User not found", undefined, "USER_NOT_FOUND");
  if (target.role === "OWNER") throw new ApiError(403, "Owner role cannot be changed", undefined, "OWNER_PROTECTED");
  await env.DB.prepare("UPDATE users SET role = ?, updated_at = ? WHERE id = ?").bind(body.role, timestamp(), targetId).run();
  await audit(env, owner, "user.role_changed", "user", targetId, JSON.stringify({ role: body.role }));
  return json({ success: true });
}

export async function updateUserBan(request: Request, env: Env, targetId: string): Promise<Response> {
  const admin = await requireAdmin(request, env);
  await rateLimitAdmin(request, env, admin, "ban");
  const body = await parseJson<{ banned?: unknown }>(request, 1_024);
  if (typeof body.banned !== "boolean") throw new ApiError(400, "Invalid ban state", undefined, "BAN_STATE_INVALID");
  const target = await env.DB.prepare("SELECT id, role FROM users WHERE id = ?").bind(targetId).first<{ id: string; role: string }>();
  if (!target) throw new ApiError(404, "User not found", undefined, "USER_NOT_FOUND");
  if (target.role === "OWNER" || target.id === admin.id) throw new ApiError(403, "This account is protected", undefined, "ACCOUNT_PROTECTED");
  await env.DB.batch([
    env.DB.prepare("UPDATE users SET is_banned = ?, updated_at = ? WHERE id = ?").bind(body.banned ? 1 : 0, timestamp(), targetId),
    ...(body.banned ? [env.DB.prepare("DELETE FROM sessions WHERE user_id = ?").bind(targetId)] : []),
  ]);
  await audit(env, admin, body.banned ? "user.banned" : "user.unbanned", "user", targetId, "");
  return json({ success: true });
}

export async function adminSuggestions(request: Request, env: Env): Promise<Response> {
  await requireAdmin(request, env);
  const rows = await env.DB.prepare(
    "SELECT id, text, email, status, created_at AS createdAt FROM suggestions ORDER BY created_at DESC LIMIT 100",
  ).all();
  return json({ suggestions: rows.results });
}

export async function updateSuggestion(request: Request, env: Env, suggestionId: string): Promise<Response> {
  const admin = await requireAdmin(request, env);
  await rateLimitAdmin(request, env, admin, "suggestion");
  const body = await parseJson<{ status?: unknown }>(request, 1_024);
  if (!(["new", "reviewed", "implemented", "rejected"] as const).includes(body.status as never)) {
    throw new ApiError(400, "Invalid suggestion status", undefined, "SUGGESTION_STATUS_INVALID");
  }
  const suggestion = await env.DB.prepare("SELECT id FROM suggestions WHERE id = ?").bind(suggestionId).first<{ id: string }>();
  if (!suggestion) throw new ApiError(404, "Suggestion not found", undefined, "SUGGESTION_NOT_FOUND");
  await env.DB.prepare("UPDATE suggestions SET status = ? WHERE id = ?").bind(body.status, suggestionId).run();
  await audit(env, admin, "suggestion.status_changed", "suggestion", suggestionId, JSON.stringify({ status: body.status }));
  return json({ success: true });
}
