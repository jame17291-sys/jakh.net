import { enforceRateLimit, requireUser, touchPrivilegedSession } from "./db.js";
import { ApiError, json, parseJson } from "./http.js";
import { verifyPasswordInHasher } from "./password-hasher.js";
import { clientIp, sha256, validatePassword } from "./security.js";
import type { Env, SessionUser } from "./types.js";

type AssignableRole = "ADMIN" | "USER";
type AdminUserRole = AssignableRole | "OWNER";
type SuggestionStatus = "new" | "reviewed" | "implemented" | "rejected";

interface AdminUserRow {
  id: string;
  username: string;
  email: string | null;
  role: AdminUserRole;
  isBanned: number;
  createdAt: string;
  lastLoginAt: string | null;
}

interface RecentUserRow {
  username: string;
  email: string | null;
  role: AdminUserRole;
  createdAt: string;
}

interface SuggestionRow {
  id: string;
  text: string;
  email: string | null;
  status: SuggestionStatus;
  createdAt: string;
}

interface StepUpRow {
  verifiedAt: string;
}

interface PasswordRow {
  password_hash: string;
  password_salt: string;
  password_iterations: number;
}

const STEP_UP_MAX_AGE_MS = 10 * 60 * 1_000;
const AUDIT_REASON_MAX_LENGTH = 280;
const ASSIGNABLE_ROLES = new Set<AssignableRole>(["USER", "ADMIN"]);
const SUGGESTION_STATUSES = new Set<SuggestionStatus>(["new", "reviewed", "implemented", "rejected"]);

function timestamp(): string {
  return new Date().toISOString();
}

function auditStatement(
  env: Env,
  actor: SessionUser,
  action: string,
  targetType: string,
  targetId: string,
  detail: unknown,
): D1PreparedStatement {
  return env.DB.prepare(
    `INSERT INTO admin_audit_log (id, actor_user_id, action, target_type, target_id, detail, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).bind(
    crypto.randomUUID(),
    actor.id,
    action,
    targetType,
    targetId,
    detail === "" ? "" : JSON.stringify(detail),
    timestamp(),
  );
}

async function requireAdmin(request: Request, env: Env): Promise<SessionUser> {
  const user = await requireUser(request, env);
  if (user.role !== "ADMIN" && user.role !== "OWNER") {
    throw new ApiError(403, "Administrator access is required", undefined, "ADMIN_REQUIRED");
  }
  await touchPrivilegedSession(env, user);
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

function boundedLimit(request: Request, defaultLimit = 50): number {
  const raw = new URL(request.url).searchParams.get("limit");
  if (raw === null) return defaultLimit;
  if (!/^\d{1,3}$/u.test(raw)) {
    throw new ApiError(400, "Invalid limit", undefined, "ADMIN_LIMIT_INVALID");
  }
  return Math.min(Math.max(Number(raw), 1), 100);
}

function boundedOffset(request: Request): number {
  const raw = new URL(request.url).searchParams.get("offset");
  if (raw === null) return 0;
  if (!/^\d{1,5}$/u.test(raw)) {
    throw new ApiError(400, "Invalid offset", undefined, "ADMIN_OFFSET_INVALID");
  }
  return Math.min(Number(raw), 10_000);
}

function redactEmail<T extends { email: string | null }>(row: T, canViewEmail: boolean): T {
  return canViewEmail ? row : { ...row, email: null };
}

function optionalAuditReason(value: unknown): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string") {
    throw new ApiError(
      400,
      `Reason must be a 1–${AUDIT_REASON_MAX_LENGTH} character human-readable message`,
      undefined,
      "AUDIT_REASON_INVALID",
    );
  }
  const reason = value.trim();
  if (
    !reason
    || reason.length > AUDIT_REASON_MAX_LENGTH
    || /[\u0000-\u001F\u007F-\u009F]/u.test(reason)
  ) {
    throw new ApiError(
      400,
      `Reason must be a 1–${AUDIT_REASON_MAX_LENGTH} character human-readable message`,
      undefined,
      "AUDIT_REASON_INVALID",
    );
  }
  return reason;
}

function detailWithReason<T extends Record<string, unknown>>(detail: T, reason: string | undefined): T & { reason?: string } {
  return reason === undefined ? detail : { ...detail, reason };
}

async function optionalReasonFromRequest(request: Request): Promise<string | undefined> {
  const contentType = request.headers.get("content-type") || "";
  if (!contentType.toLowerCase().startsWith("application/json") || request.body === null) return undefined;
  if (request.headers.get("content-length") === "0") return undefined;
  const body = await parseJson<{ reason?: unknown }>(request, 1_024);
  return optionalAuditReason(body.reason);
}

async function currentStepUp(env: Env, user: SessionUser): Promise<{ verifiedAt: string | null; expiresAt: string | null }> {
  const row = await env.DB.prepare(
    "SELECT verified_at AS verifiedAt FROM admin_step_ups WHERE token_hash = ? AND user_id = ?",
  ).bind(user.tokenHash, user.id).first<StepUpRow>();
  const verifiedMs = Date.parse(row?.verifiedAt || "");
  if (!Number.isFinite(verifiedMs) || verifiedMs + STEP_UP_MAX_AGE_MS <= Date.now()) {
    return { verifiedAt: null, expiresAt: null };
  }
  return {
    verifiedAt: row?.verifiedAt || null,
    expiresAt: new Date(verifiedMs + STEP_UP_MAX_AGE_MS).toISOString(),
  };
}

async function requireRecentStepUp(env: Env, user: SessionUser): Promise<void> {
  const stepUp = await currentStepUp(env, user);
  if (!stepUp.verifiedAt) {
    throw new ApiError(
      401,
      "Recent password confirmation is required",
      undefined,
      "STEP_UP_REQUIRED",
    );
  }
}

function optionalRole(request: Request): AdminUserRole | null {
  const role = new URL(request.url).searchParams.get("role");
  if (role === null || role === "") return null;
  if (role !== "USER" && role !== "ADMIN" && role !== "OWNER") {
    throw new ApiError(400, "Invalid role filter", undefined, "ADMIN_ROLE_FILTER_INVALID");
  }
  return role;
}

function optionalBanState(request: Request): number | null {
  const status = new URL(request.url).searchParams.get("status");
  if (status === null || status === "") return null;
  if (status === "active") return 0;
  if (status === "suspended") return 1;
  throw new ApiError(400, "Invalid status filter", undefined, "ADMIN_STATUS_FILTER_INVALID");
}

function optionalSuggestionStatus(request: Request): SuggestionStatus | null {
  const status = new URL(request.url).searchParams.get("status");
  if (status === null || status === "") return null;
  if (!SUGGESTION_STATUSES.has(status as SuggestionStatus)) {
    throw new ApiError(400, "Invalid suggestion status", undefined, "SUGGESTION_STATUS_INVALID");
  }
  return status as SuggestionStatus;
}

export async function adminOverview(request: Request, env: Env): Promise<Response> {
  const admin = await requireAdmin(request, env);
  const [users, admins, solves, pendingSuggestions, activeSessions, suspendedUsers, recentUsers, suggestions] = await Promise.all([
    env.DB.prepare("SELECT COUNT(*) AS count FROM users").first<{ count: number }>(),
    env.DB.prepare("SELECT COUNT(*) AS count FROM users WHERE role IN ('ADMIN', 'OWNER')").first<{ count: number }>(),
    env.DB.prepare("SELECT COUNT(*) AS count FROM progress WHERE status NOT LIKE 'wrong-%'").first<{ count: number }>(),
    env.DB.prepare("SELECT COUNT(*) AS count FROM suggestions WHERE status = 'new'").first<{ count: number }>(),
    env.DB.prepare("SELECT COUNT(*) AS count FROM sessions WHERE expires_at > ?").bind(timestamp()).first<{ count: number }>(),
    env.DB.prepare("SELECT COUNT(*) AS count FROM users WHERE is_banned = 1").first<{ count: number }>(),
    env.DB.prepare("SELECT username, email, role, created_at AS createdAt FROM users ORDER BY created_at DESC LIMIT 8").all<RecentUserRow>(),
    env.DB.prepare("SELECT id, text, email, status, created_at AS createdAt FROM suggestions ORDER BY created_at DESC LIMIT 8").all<SuggestionRow>(),
  ]);
  const canViewEmail = admin.role === "OWNER";
  return json({
    metrics: {
      users: users?.count || 0,
      administrators: admins?.count || 0,
      solved: solves?.count || 0,
      pendingSuggestions: pendingSuggestions?.count || 0,
      activeSessions: activeSessions?.count || 0,
      suspendedUsers: suspendedUsers?.count || 0,
    },
    recentUsers: recentUsers.results.map((row) => redactEmail(row, canViewEmail)),
    recentSuggestions: suggestions.results.map((row) => redactEmail(row, canViewEmail)),
    permissions: { canViewEmail },
  });
}

export async function adminUsers(request: Request, env: Env): Promise<Response> {
  const admin = await requireAdmin(request, env);
  const url = new URL(request.url);
  const search = (url.searchParams.get("search") || "").trim().slice(0, 64);
  const query = search ? `%${search.replaceAll("%", "\\%").replaceAll("_", "\\_")}%` : "%";
  const role = optionalRole(request);
  const banState = optionalBanState(request);
  const limit = boundedLimit(request, 40);
  const offset = boundedOffset(request);
  const canViewEmail = admin.role === "OWNER";
  const filters = [
    canViewEmail
      ? "(username LIKE ? ESCAPE '\\' OR email LIKE ? ESCAPE '\\')"
      : "username LIKE ? ESCAPE '\\'",
  ];
  const values: (string | number)[] = canViewEmail ? [query, query] : [query];
  if (role) {
    filters.push("role = ?");
    values.push(role);
  }
  if (banState !== null) {
    filters.push("is_banned = ?");
    values.push(banState);
  }
  const rows = await env.DB.prepare(
    `SELECT id, username, email, role, is_banned AS isBanned, created_at AS createdAt, last_login_at AS lastLoginAt
       FROM users WHERE ${filters.join(" AND ")}
      ORDER BY created_at DESC LIMIT ? OFFSET ?`,
  ).bind(...values, limit + 1, offset).all<AdminUserRow>();
  const hasMore = rows.results.length > limit;
  return json({
    users: rows.results.slice(0, limit).map((row) => redactEmail(row, canViewEmail)),
    nextOffset: hasMore ? offset + limit : null,
    permissions: { canViewEmail },
  });
}

export async function updateUserRole(request: Request, env: Env, targetId: string): Promise<Response> {
  const owner = await requireOwner(request, env);
  await rateLimitAdmin(request, env, owner, "role");
  await requireRecentStepUp(env, owner);
  const body = await parseJson<{ role?: unknown; reason?: unknown }>(request, 1_024);
  if (!ASSIGNABLE_ROLES.has(body.role as AssignableRole)) {
    throw new ApiError(400, "Invalid role", undefined, "ROLE_INVALID");
  }
  const reason = optionalAuditReason(body.reason);
  const target = await env.DB.prepare("SELECT id, role, is_banned AS isBanned FROM users WHERE id = ?")
    .bind(targetId).first<Pick<AdminUserRow, "id" | "role" | "isBanned">>();
  if (!target) throw new ApiError(404, "User not found", undefined, "USER_NOT_FOUND");
  if (target.role === "OWNER") throw new ApiError(403, "Owner role cannot be changed", undefined, "OWNER_PROTECTED");
  const role = body.role as AssignableRole;
  if (target.role === role) return json({ success: true, changed: false });
  const now = timestamp();
  await env.DB.batch([
    env.DB.prepare("UPDATE users SET role = ?, updated_at = ? WHERE id = ?").bind(role, now, targetId),
    env.DB.prepare("DELETE FROM sessions WHERE user_id = ?").bind(targetId),
    auditStatement(env, owner, "user.role_changed", "user", targetId, detailWithReason({
      from: target.role,
      to: role,
    }, reason)),
  ]);
  return json({ success: true, changed: true, sessionsRevoked: true });
}

export async function updateUserBan(request: Request, env: Env, targetId: string): Promise<Response> {
  const admin = await requireAdmin(request, env);
  await rateLimitAdmin(request, env, admin, "ban");
  await requireRecentStepUp(env, admin);
  const body = await parseJson<{ banned?: unknown; reason?: unknown }>(request, 1_024);
  if (typeof body.banned !== "boolean") throw new ApiError(400, "Invalid ban state", undefined, "BAN_STATE_INVALID");
  const reason = optionalAuditReason(body.reason);
  const target = await env.DB.prepare("SELECT id, role, is_banned AS isBanned FROM users WHERE id = ?")
    .bind(targetId).first<Pick<AdminUserRow, "id" | "role" | "isBanned">>();
  if (!target) throw new ApiError(404, "User not found", undefined, "USER_NOT_FOUND");
  if (target.role === "OWNER" || target.id === admin.id) {
    throw new ApiError(403, "This account is protected", undefined, "ACCOUNT_PROTECTED");
  }
  if (target.role === "ADMIN" && admin.role !== "OWNER") {
    throw new ApiError(403, "Only an owner can manage an administrator", undefined, "ADMIN_PROTECTED");
  }
  const isBanned = body.banned ? 1 : 0;
  if (target.isBanned === isBanned) return json({ success: true, changed: false });
  await env.DB.batch([
    env.DB.prepare("UPDATE users SET is_banned = ?, updated_at = ? WHERE id = ?")
      .bind(isBanned, timestamp(), targetId),
    ...(body.banned ? [env.DB.prepare("DELETE FROM sessions WHERE user_id = ?").bind(targetId)] : []),
    auditStatement(env, admin, body.banned ? "user.banned" : "user.unbanned", "user", targetId, detailWithReason({
      from: Boolean(target.isBanned),
      to: body.banned,
    }, reason)),
  ]);
  return json({ success: true, changed: true, sessionsRevoked: body.banned });
}

export async function adminSuggestions(request: Request, env: Env): Promise<Response> {
  const admin = await requireAdmin(request, env);
  const status = optionalSuggestionStatus(request);
  const limit = boundedLimit(request, 40);
  const offset = boundedOffset(request);
  const rows = status
    ? await env.DB.prepare(
      "SELECT id, text, email, status, created_at AS createdAt FROM suggestions WHERE status = ? ORDER BY created_at DESC LIMIT ? OFFSET ?",
    ).bind(status, limit + 1, offset).all<SuggestionRow>()
    : await env.DB.prepare(
      "SELECT id, text, email, status, created_at AS createdAt FROM suggestions ORDER BY created_at DESC LIMIT ? OFFSET ?",
    ).bind(limit + 1, offset).all<SuggestionRow>();
  const hasMore = rows.results.length > limit;
  return json({
    suggestions: rows.results.slice(0, limit).map((row) => redactEmail(row, admin.role === "OWNER")),
    nextOffset: hasMore ? offset + limit : null,
    permissions: { canViewEmail: admin.role === "OWNER" },
  });
}

export async function updateSuggestion(request: Request, env: Env, suggestionId: string): Promise<Response> {
  const admin = await requireAdmin(request, env);
  await rateLimitAdmin(request, env, admin, "suggestion");
  const body = await parseJson<{ status?: unknown; reason?: unknown }>(request, 1_024);
  if (!SUGGESTION_STATUSES.has(body.status as SuggestionStatus)) {
    throw new ApiError(400, "Invalid suggestion status", undefined, "SUGGESTION_STATUS_INVALID");
  }
  const reason = optionalAuditReason(body.reason);
  const suggestion = await env.DB.prepare("SELECT id, status FROM suggestions WHERE id = ?")
    .bind(suggestionId).first<Pick<SuggestionRow, "id" | "status">>();
  if (!suggestion) throw new ApiError(404, "Suggestion not found", undefined, "SUGGESTION_NOT_FOUND");
  const status = body.status as SuggestionStatus;
  if (suggestion.status === status) return json({ success: true, changed: false });
  await env.DB.batch([
    env.DB.prepare("UPDATE suggestions SET status = ? WHERE id = ?").bind(status, suggestionId),
    auditStatement(env, admin, "suggestion.status_changed", "suggestion", suggestionId, detailWithReason({
      from: suggestion.status,
      to: status,
    }, reason)),
  ]);
  return json({ success: true, changed: true });
}

export async function adminAudit(request: Request, env: Env): Promise<Response> {
  await requireOwner(request, env);
  const rows = await env.DB.prepare(
    `SELECT a.id, a.action, a.target_type AS targetType, a.target_id AS targetId,
            a.detail, a.created_at AS createdAt, COALESCE(u.username, 'Deleted account') AS actorUsername
       FROM admin_audit_log a
       LEFT JOIN users u ON u.id = a.actor_user_id
      ORDER BY a.created_at DESC, a.rowid DESC
      LIMIT ?`,
  ).bind(boundedLimit(request)).all();
  return json({ events: rows.results });
}

export async function adminSecurity(request: Request, env: Env): Promise<Response> {
  const admin = await requireAdmin(request, env);
  const stepUp = await currentStepUp(env, admin);
  return json({
    role: admin.role,
    stepUp: {
      ...stepUp,
      maxAgeSeconds: STEP_UP_MAX_AGE_MS / 1_000,
      requiredFor: ["role changes", "access suspension", "global session revocation"],
    },
    controls: { revokeNonOwnerSessions: admin.role === "OWNER" },
  });
}

export async function reauthenticateAdmin(request: Request, env: Env): Promise<Response> {
  const admin = await requireAdmin(request, env);
  await rateLimitAdmin(request, env, admin, "reauthenticate");
  const body = await parseJson<{ password?: unknown }>(request, 1_024);
  const password = validatePassword(body.password, "Password");
  const account = await env.DB.prepare(
    "SELECT password_hash, password_salt, password_iterations FROM users WHERE id = ?",
  ).bind(admin.id).first<PasswordRow>();
  const valid = account && await verifyPasswordInHasher(
    env,
    password,
    account.password_hash,
    account.password_salt,
    account.password_iterations,
  );
  if (!valid) {
    throw new ApiError(401, "Password confirmation failed", undefined, "STEP_UP_INVALID");
  }
  const verifiedAt = timestamp();
  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO admin_step_ups (token_hash, user_id, verified_at) VALUES (?, ?, ?)
       ON CONFLICT(token_hash) DO UPDATE SET user_id = excluded.user_id, verified_at = excluded.verified_at`,
    ).bind(admin.tokenHash, admin.id, verifiedAt),
    auditStatement(env, admin, "security.password_reconfirmed", "session", "current-session", { verifiedAt }),
  ]);
  return json({
    success: true,
    stepUp: {
      verifiedAt,
      expiresAt: new Date(Date.parse(verifiedAt) + STEP_UP_MAX_AGE_MS).toISOString(),
      maxAgeSeconds: STEP_UP_MAX_AGE_MS / 1_000,
    },
  });
}

export async function revokeNonOwnerSessions(request: Request, env: Env): Promise<Response> {
  const owner = await requireOwner(request, env);
  await rateLimitAdmin(request, env, owner, "revoke-non-owner-sessions");
  await requireRecentStepUp(env, owner);
  const reason = await optionalReasonFromRequest(request);
  const count = await env.DB.prepare(
    `SELECT COUNT(*) AS count
       FROM sessions s
       JOIN users u ON u.id = s.user_id
      WHERE u.role <> 'OWNER'`,
  ).first<{ count: number }>();
  const revokedSessions = count?.count || 0;
  await env.DB.batch([
    env.DB.prepare(
      `DELETE FROM sessions
        WHERE user_id IN (SELECT id FROM users WHERE role <> 'OWNER')`,
    ),
    auditStatement(
      env,
      owner,
      "security.non_owner_sessions_revoked",
      "session",
      "non-owner",
      detailWithReason({ revokedSessions }, reason),
    ),
  ]);
  return json({ success: true, revokedSessions });
}
