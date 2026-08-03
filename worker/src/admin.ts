import { enforceRateLimit, requireUser, touchPrivilegedSession } from "./db.js";
import { validateCard } from "./catalog.js";
import { ApiError, json, parseJson } from "./http.js";
import { verifyPasswordInHasher } from "./password-hasher.js";
import { clientIp, sha256, validatePassword } from "./security.js";
import type { Env, SessionUser } from "./types.js";

type AssignableRole = "ADMIN" | "USER";
type AdminUserRole = AssignableRole | "OWNER";
type SuggestionStatus = "new" | "reviewed" | "implemented" | "rejected";
type ContentWorkflowStatus = "DRAFT" | "IN_REVIEW" | "PUBLISHED";

interface ContentSource {
  title: string;
  publisher: string;
  url: string;
}

interface ContentSnapshot {
  question: { en: string; ar: string };
  answer: { en: string; ar: string };
  explanation: { en: string; ar: string };
  sources: ContentSource[];
}

interface ContentEditRow {
  questionId: string;
  categorySlug: string;
  draftJson: string;
  workflowStatus: ContentWorkflowStatus;
  version: number;
  publishedVersion: number | null;
  publishedSnapshotJson: string | null;
  editorUsername: string | null;
  reviewerUsername: string | null;
  createdAt: string;
  updatedAt: string;
  publishedAt: string | null;
}

interface ContentRevisionRow {
  id: string;
  questionId: string;
  categorySlug: string;
  version: number;
  action: string;
  snapshotJson: string;
  actorUsername: string | null;
  createdAt: string;
}

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
const CONTENT_WORKFLOW_STATUSES = new Set<ContentWorkflowStatus>(["DRAFT", "IN_REVIEW", "PUBLISHED"]);
const CONTENT_ID_PATTERN = /^[A-Za-z0-9_-]{2,96}$/u;
const CONTENT_CATEGORY_PATTERN = /^[a-z0-9-]{2,64}$/u;
const CONTENT_TEXT_MAX_LENGTH = 4_000;
const CONTENT_SOURCE_LIMIT = 8;

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

function contentText(value: unknown, label: string, { required = true } = {}): string {
  if (typeof value !== "string") {
    throw new ApiError(400, `${label} must be text`, undefined, "CONTENT_TEXT_INVALID");
  }
  const normalized = value.trim().replace(/\r\n?/gu, "\n");
  if ((required && !normalized) || normalized.length > CONTENT_TEXT_MAX_LENGTH) {
    throw new ApiError(
      400,
      `${label} must be ${required ? "1" : "0"}–${CONTENT_TEXT_MAX_LENGTH} characters`,
      undefined,
      "CONTENT_TEXT_INVALID",
    );
  }
  return normalized;
}

function contentLanguagePair(value: unknown, label: string, { required = true } = {}): { en: string; ar: string } {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new ApiError(400, `${label} must include English and Arabic text`, undefined, "CONTENT_LANGUAGE_PAIR_INVALID");
  }
  const pair = value as Record<string, unknown>;
  return {
    en: contentText(pair.en, `${label}.en`, { required }),
    ar: contentText(pair.ar, `${label}.ar`, { required }),
  };
}

function contentSources(value: unknown): ContentSource[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > CONTENT_SOURCE_LIMIT) {
    throw new ApiError(400, `Sources must contain at most ${CONTENT_SOURCE_LIMIT} entries`, undefined, "CONTENT_SOURCES_INVALID");
  }
  const seenUrls = new Set<string>();
  return value.map((candidate, index) => {
    if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) {
      throw new ApiError(400, `Source ${index + 1} is invalid`, undefined, "CONTENT_SOURCE_INVALID");
    }
    const source = candidate as Record<string, unknown>;
    const title = contentText(source.title, `sources[${index}].title`);
    const publisher = contentText(source.publisher, `sources[${index}].publisher`);
    let url: URL;
    try {
      url = new URL(String(source.url || ""));
    } catch {
      throw new ApiError(400, `Source ${index + 1} URL is invalid`, undefined, "CONTENT_SOURCE_URL_INVALID");
    }
    if (url.protocol !== "https:" || seenUrls.has(url.href)) {
      throw new ApiError(400, `Source ${index + 1} must use a unique HTTPS URL`, undefined, "CONTENT_SOURCE_URL_INVALID");
    }
    seenUrls.add(url.href);
    return { title, publisher, url: url.href };
  });
}

function contentSnapshot(value: unknown): ContentSnapshot {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new ApiError(400, "Content payload is invalid", undefined, "CONTENT_PAYLOAD_INVALID");
  }
  const body = value as Record<string, unknown>;
  return {
    question: contentLanguagePair(body.question, "question"),
    answer: contentLanguagePair(body.answer, "answer"),
    explanation: body.explanation === undefined
      ? { en: "", ar: "" }
      : contentLanguagePair(body.explanation, "explanation", { required: false }),
    sources: contentSources(body.sources),
  };
}

function parseStoredSnapshot(value: string | null): ContentSnapshot | null {
  if (!value) return null;
  try {
    return JSON.parse(value) as ContentSnapshot;
  } catch {
    return null;
  }
}

function contentEditResponse(row: ContentEditRow) {
  return {
    questionId: row.questionId,
    categorySlug: row.categorySlug,
    draft: parseStoredSnapshot(row.draftJson),
    workflowStatus: row.workflowStatus,
    version: row.version,
    publishedVersion: row.publishedVersion,
    hasPublishedVersion: Boolean(row.publishedSnapshotJson),
    editorUsername: row.editorUsername,
    reviewerUsername: row.reviewerUsername,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    publishedAt: row.publishedAt,
  };
}

async function requireContentStudioSchema(env: Env): Promise<void> {
  const schema = await env.DB.prepare(
    "SELECT value FROM schema_meta WHERE key = 'schema_version'",
  ).first<{ value: string }>();
  if (Number(schema?.value || 0) < 9) {
    throw new ApiError(
      503,
      "Content Studio is temporarily unavailable during a database upgrade",
      { "retry-after": "300" },
      "CONTENT_STUDIO_UNAVAILABLE",
    );
  }
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

export async function adminContent(request: Request, env: Env): Promise<Response> {
  await requireAdmin(request, env);
  await requireContentStudioSchema(env);
  const url = new URL(request.url);
  const category = (url.searchParams.get("category") || "").trim();
  const status = (url.searchParams.get("status") || "").trim().toUpperCase();
  const search = (url.searchParams.get("search") || "").trim().slice(0, 96);
  if (category && !CONTENT_CATEGORY_PATTERN.test(category)) {
    throw new ApiError(400, "Invalid content category", undefined, "CONTENT_CATEGORY_INVALID");
  }
  if (status && !CONTENT_WORKFLOW_STATUSES.has(status as ContentWorkflowStatus)) {
    throw new ApiError(400, "Invalid content status", undefined, "CONTENT_STATUS_INVALID");
  }
  const filters: string[] = [];
  const values: (string | number)[] = [];
  if (category) {
    filters.push("e.category_slug = ?");
    values.push(category);
  }
  if (status) {
    filters.push("e.workflow_status = ?");
    values.push(status);
  }
  if (search) {
    filters.push("(e.question_id LIKE ? ESCAPE '\\' OR e.draft_json LIKE ? ESCAPE '\\')");
    const query = `%${search.replaceAll("%", "\\%").replaceAll("_", "\\_")}%`;
    values.push(query, query);
  }
  const limit = boundedLimit(request, 50);
  const offset = boundedOffset(request);
  const where = filters.length ? `WHERE ${filters.join(" AND ")}` : "";
  const rows = await env.DB.prepare(
    `SELECT e.question_id AS questionId, e.category_slug AS categorySlug,
            e.draft_json AS draftJson, e.workflow_status AS workflowStatus,
            e.version, e.published_version AS publishedVersion,
            e.published_snapshot_json AS publishedSnapshotJson,
            editor.username AS editorUsername, reviewer.username AS reviewerUsername,
            e.created_at AS createdAt, e.updated_at AS updatedAt, e.published_at AS publishedAt
       FROM content_question_edits e
       LEFT JOIN users editor ON editor.id = e.editor_user_id
       LEFT JOIN users reviewer ON reviewer.id = e.reviewer_user_id
       ${where}
      ORDER BY e.updated_at DESC, e.question_id ASC
      LIMIT ? OFFSET ?`,
  ).bind(...values, limit + 1, offset).all<ContentEditRow>();
  const hasMore = rows.results.length > limit;
  return json({
    edits: rows.results.slice(0, limit).map(contentEditResponse),
    nextOffset: hasMore ? offset + limit : null,
  });
}

export async function adminContentRevisions(
  request: Request,
  env: Env,
  questionId: string,
): Promise<Response> {
  await requireAdmin(request, env);
  await requireContentStudioSchema(env);
  if (!CONTENT_ID_PATTERN.test(questionId)) {
    throw new ApiError(400, "Invalid question ID", undefined, "CONTENT_QUESTION_ID_INVALID");
  }
  const rows = await env.DB.prepare(
    `SELECT r.id, r.question_id AS questionId, r.category_slug AS categorySlug,
            r.version, r.action, r.snapshot_json AS snapshotJson,
            u.username AS actorUsername, r.created_at AS createdAt
       FROM content_question_revisions r
       LEFT JOIN users u ON u.id = r.actor_user_id
      WHERE r.question_id = ?
      ORDER BY r.created_at DESC, r.rowid DESC
      LIMIT ?`,
  ).bind(questionId, boundedLimit(request, 50)).all<ContentRevisionRow>();
  return json({
    revisions: rows.results.map((row) => ({
      id: row.id,
      questionId: row.questionId,
      categorySlug: row.categorySlug,
      version: row.version,
      action: row.action,
      snapshot: parseStoredSnapshot(row.snapshotJson),
      actorUsername: row.actorUsername,
      createdAt: row.createdAt,
    })),
  });
}

export async function saveAdminContent(
  request: Request,
  env: Env,
  questionId: string,
): Promise<Response> {
  const admin = await requireAdmin(request, env);
  await requireContentStudioSchema(env);
  await rateLimitAdmin(request, env, admin, "content-save");
  if (!CONTENT_ID_PATTERN.test(questionId)) {
    throw new ApiError(400, "Invalid question ID", undefined, "CONTENT_QUESTION_ID_INVALID");
  }
  const body = await parseJson<{
    categorySlug?: unknown;
    content?: unknown;
    workflowStatus?: unknown;
  }>(request, 32_768);
  const categorySlug = typeof body.categorySlug === "string" ? body.categorySlug.trim() : "";
  if (!CONTENT_CATEGORY_PATTERN.test(categorySlug)) {
    throw new ApiError(400, "Invalid content category", undefined, "CONTENT_CATEGORY_INVALID");
  }
  await validateCard(env, questionId, categorySlug);
  const workflowStatus = String(body.workflowStatus || "DRAFT").toUpperCase();
  if (workflowStatus !== "DRAFT" && workflowStatus !== "IN_REVIEW") {
    throw new ApiError(400, "Drafts may only be saved or submitted for review", undefined, "CONTENT_STATUS_INVALID");
  }
  const snapshot = contentSnapshot(body.content);
  const snapshotJson = JSON.stringify(snapshot);
  const existing = await env.DB.prepare(
    `SELECT question_id AS questionId, category_slug AS categorySlug, version
       FROM content_question_edits WHERE question_id = ?`,
  ).bind(questionId).first<Pick<ContentEditRow, "questionId" | "categorySlug" | "version">>();
  const version = (existing?.version || 0) + 1;
  const now = timestamp();
  const action = existing
    ? (workflowStatus === "IN_REVIEW" ? "SUBMITTED" : "UPDATED")
    : (workflowStatus === "IN_REVIEW" ? "SUBMITTED" : "CREATED");
  const revisionId = crypto.randomUUID();
  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO content_question_edits (
         question_id, category_slug, draft_json, workflow_status, version,
         editor_user_id, created_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(question_id) DO UPDATE SET
         category_slug = excluded.category_slug,
         draft_json = excluded.draft_json,
         workflow_status = excluded.workflow_status,
         version = excluded.version,
         editor_user_id = excluded.editor_user_id,
         updated_at = excluded.updated_at`,
    ).bind(questionId, categorySlug, snapshotJson, workflowStatus, version, admin.id, now, now),
    env.DB.prepare(
      `INSERT INTO content_question_revisions (
         id, question_id, category_slug, version, action, snapshot_json, actor_user_id, created_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(revisionId, questionId, categorySlug, version, action, snapshotJson, admin.id, now),
    auditStatement(env, admin, `content.${action.toLowerCase()}`, "question", questionId, {
      categorySlug,
      version,
      workflowStatus,
    }),
  ]);
  return json({ success: true, questionId, categorySlug, version, workflowStatus, revisionId });
}

export async function publishAdminContent(
  request: Request,
  env: Env,
  questionId: string,
): Promise<Response> {
  const admin = await requireAdmin(request, env);
  await requireContentStudioSchema(env);
  await rateLimitAdmin(request, env, admin, "content-publish");
  await requireRecentStepUp(env, admin);
  if (!CONTENT_ID_PATTERN.test(questionId)) {
    throw new ApiError(400, "Invalid question ID", undefined, "CONTENT_QUESTION_ID_INVALID");
  }
  const edit = await env.DB.prepare(
    `SELECT question_id AS questionId, category_slug AS categorySlug, draft_json AS draftJson,
            workflow_status AS workflowStatus, version, published_version AS publishedVersion
       FROM content_question_edits WHERE question_id = ?`,
  ).bind(questionId).first<Pick<ContentEditRow,
    "questionId" | "categorySlug" | "draftJson" | "workflowStatus" | "version" | "publishedVersion"
  >>();
  if (!edit) throw new ApiError(404, "Content draft not found", undefined, "CONTENT_NOT_FOUND");
  if (edit.workflowStatus === "PUBLISHED" && edit.publishedVersion === edit.version) {
    return json({ success: true, changed: false, version: edit.version });
  }
  if (edit.workflowStatus !== "IN_REVIEW") {
    throw new ApiError(
      409,
      "Content must be submitted for review before publication",
      undefined,
      "CONTENT_REVIEW_REQUIRED",
    );
  }
  const reviewedSnapshot = parseStoredSnapshot(edit.draftJson);
  if (!reviewedSnapshot?.sources.length) {
    throw new ApiError(
      409,
      "At least one authoritative HTTPS source is required before publication",
      undefined,
      "CONTENT_SOURCES_REQUIRED",
    );
  }
  await validateCard(env, questionId, edit.categorySlug);
  const now = timestamp();
  const revisionId = crypto.randomUUID();
  await env.DB.batch([
    env.DB.prepare(
      `UPDATE content_question_edits
          SET workflow_status = 'PUBLISHED', published_version = version,
              published_snapshot_json = draft_json, reviewer_user_id = ?,
              published_at = ?, updated_at = ?
        WHERE question_id = ?`,
    ).bind(admin.id, now, now, questionId),
    env.DB.prepare(
      `INSERT INTO content_question_revisions (
         id, question_id, category_slug, version, action, snapshot_json, actor_user_id, created_at
       ) VALUES (?, ?, ?, ?, 'PUBLISHED', ?, ?, ?)`,
    ).bind(revisionId, questionId, edit.categorySlug, edit.version, edit.draftJson, admin.id, now),
    auditStatement(env, admin, "content.published", "question", questionId, {
      categorySlug: edit.categorySlug,
      version: edit.version,
    }),
  ]);
  return json({ success: true, changed: true, version: edit.version, publishedAt: now });
}

export async function unpublishAdminContent(
  request: Request,
  env: Env,
  questionId: string,
): Promise<Response> {
  const admin = await requireAdmin(request, env);
  await requireContentStudioSchema(env);
  await rateLimitAdmin(request, env, admin, "content-unpublish");
  await requireRecentStepUp(env, admin);
  const edit = await env.DB.prepare(
    `SELECT question_id AS questionId, category_slug AS categorySlug, draft_json AS draftJson,
            version, published_snapshot_json AS publishedSnapshotJson
       FROM content_question_edits WHERE question_id = ?`,
  ).bind(questionId).first<Pick<ContentEditRow,
    "questionId" | "categorySlug" | "draftJson" | "version" | "publishedSnapshotJson"
  >>();
  if (!edit) throw new ApiError(404, "Content draft not found", undefined, "CONTENT_NOT_FOUND");
  if (!edit.publishedSnapshotJson) return json({ success: true, changed: false, version: edit.version });
  const version = edit.version + 1;
  const now = timestamp();
  await env.DB.batch([
    env.DB.prepare(
      `UPDATE content_question_edits
          SET workflow_status = 'DRAFT', version = ?, published_version = NULL,
              published_snapshot_json = NULL, reviewer_user_id = NULL,
              published_at = NULL, editor_user_id = ?, updated_at = ?
        WHERE question_id = ?`,
    ).bind(version, admin.id, now, questionId),
    env.DB.prepare(
      `INSERT INTO content_question_revisions (
         id, question_id, category_slug, version, action, snapshot_json, actor_user_id, created_at
       ) VALUES (?, ?, ?, ?, 'UNPUBLISHED', ?, ?, ?)`,
    ).bind(crypto.randomUUID(), questionId, edit.categorySlug, version, edit.draftJson, admin.id, now),
    auditStatement(env, admin, "content.unpublished", "question", questionId, {
      categorySlug: edit.categorySlug,
      version,
    }),
  ]);
  return json({ success: true, changed: true, version });
}

export async function restoreAdminContentRevision(
  request: Request,
  env: Env,
  questionId: string,
): Promise<Response> {
  const admin = await requireAdmin(request, env);
  await requireContentStudioSchema(env);
  await rateLimitAdmin(request, env, admin, "content-restore");
  const body = await parseJson<{ revisionId?: unknown }>(request, 1_024);
  const revisionId = typeof body.revisionId === "string" ? body.revisionId : "";
  if (!/^[A-Za-z0-9-]{36}$/u.test(revisionId)) {
    throw new ApiError(400, "Invalid revision ID", undefined, "CONTENT_REVISION_ID_INVALID");
  }
  const [edit, revision] = await Promise.all([
    env.DB.prepare(
      "SELECT category_slug AS categorySlug, version FROM content_question_edits WHERE question_id = ?",
    ).bind(questionId).first<Pick<ContentEditRow, "categorySlug" | "version">>(),
    env.DB.prepare(
      `SELECT category_slug AS categorySlug, snapshot_json AS snapshotJson
         FROM content_question_revisions WHERE id = ? AND question_id = ?`,
    ).bind(revisionId, questionId).first<Pick<ContentRevisionRow, "categorySlug" | "snapshotJson">>(),
  ]);
  if (!edit || !revision) throw new ApiError(404, "Content revision not found", undefined, "CONTENT_REVISION_NOT_FOUND");
  const version = edit.version + 1;
  const now = timestamp();
  const restoredRevisionId = crypto.randomUUID();
  await env.DB.batch([
    env.DB.prepare(
      `UPDATE content_question_edits
          SET category_slug = ?, draft_json = ?, workflow_status = 'DRAFT',
              version = ?, editor_user_id = ?, updated_at = ?
        WHERE question_id = ?`,
    ).bind(revision.categorySlug, revision.snapshotJson, version, admin.id, now, questionId),
    env.DB.prepare(
      `INSERT INTO content_question_revisions (
         id, question_id, category_slug, version, action, snapshot_json, actor_user_id, created_at
       ) VALUES (?, ?, ?, ?, 'RESTORED', ?, ?, ?)`,
    ).bind(restoredRevisionId, questionId, revision.categorySlug, version, revision.snapshotJson, admin.id, now),
    auditStatement(env, admin, "content.restored", "question", questionId, {
      fromRevisionId: revisionId,
      version,
    }),
  ]);
  return json({ success: true, questionId, version, revisionId: restoredRevisionId });
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
