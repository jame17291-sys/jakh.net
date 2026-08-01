import { createSession, enforceRateLimit, requireUser, sessionUser } from "./db.js";
import { canonicalStatus, getCardIndex, validateCard } from "./catalog.js";
import { ApiError, json, parseJson } from "./http.js";
import {
  hashPasswordInHasher,
  verifyPasswordInHasher,
} from "./password-hasher.js";
import {
  clearSessionCookies,
  clientIp,
  LEGACY_PASSWORD_ITERATIONS,
  normalizeEmail,
  normalizeLoginIdentifier,
  normalizeUsername,
  PASSWORD_ITERATIONS,
  randomToken,
  sessionCookie,
  sessionExpiry,
  sha256,
  validatePassword,
} from "./security.js";
import { PRIVACY_NOTICE_VERSION } from "./privacy.js";
import type { Env } from "./types.js";

const AVATARS = new Set(["👤", "🦊", "🦉", "🐉", "⚡️", "🔥", "👻", "👽", "🦄", "🦁", "🐼", "👑", "🚀", "🧠", "🧙‍♂️", "👾"]);
const ID_PATTERN = /^[A-Za-z0-9_-]{2,96}$/u;
const CATEGORY_PATTERN = /^[a-z0-9-]{2,64}$/u;
const RECOVERY_CODE_PATTERN = /^[A-Za-z0-9_-]{43}$/u;
const PRIVACY_REQUEST_TYPES = new Set([
  "access",
  "correction",
  "deletion-help",
  "objection",
  "other",
]);
const PRIVACY_REQUEST_PREFIX = "JAKH_PRIVACY_REQUEST_V1";
const MAX_SYNC_ITEMS = 100;
export const API_VERSION = "1.4.0";
const SCHEMA_VERSION = "8";
export const COMPATIBLE_SCHEMAS = Object.freeze(["6", "7", "8"] as const);

export interface FeatureReadiness {
  registration: boolean;
  accountRecovery: boolean;
  accountDeletion: boolean;
}

type SchemaGatedFeature = keyof FeatureReadiness;

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

interface RecoveryUserRow {
  id: string;
  username: string;
  email: string | null;
  role: string;
  recovery_code_hash: string;
}

interface SessionMaterial {
  token: string;
  tokenHash: string;
  createdAt: string;
  expiresAt: string;
}

interface RecoveryMaterial {
  code: string;
  codeHash: string;
}

function now(): string {
  return new Date().toISOString();
}

async function requestRateKey(request: Request, env: Env, scope: string): Promise<string> {
  return sha256(`${env.IP_HASH_SALT}:${scope}:${clientIp(request)}`);
}

async function accountRateKey(env: Env, scope: string, usernameKey: string): Promise<string> {
  return sha256(`${env.IP_HASH_SALT}:${scope}:${usernameKey}`);
}

async function createSessionMaterial(): Promise<SessionMaterial> {
  const token = randomToken(32);
  return {
    token,
    tokenHash: await sha256(token),
    createdAt: now(),
    expiresAt: sessionExpiry(),
  };
}

async function createRecoveryMaterial(): Promise<RecoveryMaterial> {
  const code = randomToken(32);
  return { code, codeHash: await sha256(code) };
}

function recoveryCredentialsError(): ApiError {
  return new ApiError(401, "Recovery credentials are invalid");
}

function normalizeRecoveryCode(value: unknown): string {
  if (typeof value !== "string" || !RECOVERY_CODE_PATTERN.test(value)) {
    throw recoveryCredentialsError();
  }
  return value;
}

function changedExactlyOne(result: D1Result | undefined): boolean {
  return result?.results?.length === 1 || result?.meta?.changes === 1;
}

function setCookie(response: Response, cookie: string): Response {
  const headers = new Headers(response.headers);
  headers.append("set-cookie", cookie);
  return new Response(response.body, { status: response.status, headers });
}

function readinessForSchema(schema: string): FeatureReadiness {
  const schemaNumber = Number(schema);
  const supported = COMPATIBLE_SCHEMAS.includes(
    schema as (typeof COMPATIBLE_SCHEMAS)[number],
  );
  return {
    registration: supported && schemaNumber >= 7,
    accountRecovery: supported && schemaNumber >= 7,
    accountDeletion: supported && schemaNumber >= 8,
  };
}

async function databaseSchema(env: Env): Promise<string | null> {
  const row = await env.DB.prepare(
    "SELECT value FROM schema_meta WHERE key = 'schema_version'",
  ).first<{ value: string }>();
  return typeof row?.value === "string" ? row.value : null;
}

export async function requireSchemaFeature(
  env: Env,
  feature: SchemaGatedFeature,
): Promise<void> {
  let schema: string | null = null;
  try {
    schema = await databaseSchema(env);
  } catch {
    // A missing or unreadable schema is not safe to treat as feature-ready.
  }
  if (schema && readinessForSchema(schema)[feature]) return;
  throw new ApiError(
    503,
    "This account feature is temporarily unavailable during a database upgrade",
    { "retry-after": "300" },
    "FEATURE_UNAVAILABLE",
  );
}

export async function health(env: Env): Promise<Response> {
  const configured = env.PASSWORD_PEPPER?.length >= 24
    && env.IP_HASH_SALT?.length >= 24
    && Boolean(env.BATTLE_ROOMS)
    && Boolean(env.PASSWORD_HASHERS);
  if (!configured) return json({ ok: false, service: "jakh-api" }, 503);
  try {
    const [schema, cardIndex] = await Promise.all([databaseSchema(env), getCardIndex(env)]);
    const compatible = schema !== null && COMPATIBLE_SCHEMAS.includes(
      schema as (typeof COMPATIBLE_SCHEMAS)[number],
    );
    const ready = compatible && Object.keys(cardIndex).length > 0;
    return json({
      ok: ready,
      service: "jakh-api",
      version: API_VERSION,
      schema,
      targetSchema: SCHEMA_VERSION,
      compatibleSchemas: [...COMPATIBLE_SCHEMAS],
      features: schema ? readinessForSchema(schema) : readinessForSchema("0"),
    }, ready ? 200 : 503);
  } catch {
    return json({
      ok: false,
      service: "jakh-api",
      version: API_VERSION,
      schema: null,
      targetSchema: SCHEMA_VERSION,
      compatibleSchemas: [...COMPATIBLE_SCHEMAS],
      features: readinessForSchema("0"),
    }, 503);
  }
}

export async function register(request: Request, env: Env): Promise<Response> {
  const rateKey = await requestRateKey(request, env, "register");
  await enforceRateLimit(env, rateKey, 8, 15 * 60);
  const body = await parseJson<{ username?: unknown; password?: unknown; email?: unknown }>(request);
  const { username, key } = normalizeUsername(body.username);
  const password = validatePassword(body.password);
  const email = normalizeEmail(body.email);
  const passwordRecord = await hashPasswordInHasher(env, password);
  const userId = crypto.randomUUID();
  const timestamp = now();
  const recovery = await createRecoveryMaterial();
  const session = await createSessionMaterial();

  try {
    await env.DB.batch([
      env.DB.prepare(
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
      ),
      env.DB.prepare(
        `INSERT INTO account_recovery_codes (user_id, code_hash, created_at, updated_at)
         VALUES (?, ?, ?, ?)`,
      ).bind(userId, recovery.codeHash, timestamp, timestamp),
      env.DB.prepare(
        `INSERT INTO sessions (token_hash, user_id, created_at, expires_at)
         VALUES (?, ?, ?, ?)`,
      ).bind(session.tokenHash, userId, session.createdAt, session.expiresAt),
    ]);
  } catch (error) {
    if (String(error).toLowerCase().includes("unique")) {
      throw new ApiError(409, "Username or email already exists");
    }
    throw error;
  }

  return setCookie(
    json({
      user: { id: userId, username, email, role: "USER" },
      recoveryCode: recovery.code,
    }, 201),
    sessionCookie(request, session.token),
  );
}

export async function login(request: Request, env: Env): Promise<Response> {
  const body = await parseJson<{ username?: unknown; password?: unknown }>(request);
  const identifier = normalizeLoginIdentifier(body.username);
  const password = validatePassword(body.password);
  const rateKey = await requestRateKey(request, env, "login");
  await enforceRateLimit(env, rateKey, 20, 15 * 60);

  const user = await env.DB.prepare(
    `SELECT id, username, email, avatar, role, is_banned, password_hash, password_salt, password_iterations
       FROM users WHERE ${identifier.column} = ?`,
  ).bind(identifier.value).first<UserPasswordRow>();

  if (!user) {
    await hashPasswordInHasher(
      env,
      password,
      "AAAAAAAAAAAAAAAAAAAAAA",
      LEGACY_PASSWORD_ITERATIONS,
    );
    await hashPasswordInHasher(
      env,
      password,
      "AAAAAAAAAAAAAAAAAAAAAA",
      PASSWORD_ITERATIONS,
    );
    throw new ApiError(401, "Invalid credentials");
  }
  const passwordIsValid = await verifyPasswordInHasher(
    env,
    password,
    user.password_hash,
    user.password_salt,
    user.password_iterations,
  );
  if (!passwordIsValid) {
    const paddingIterations = user.password_iterations === LEGACY_PASSWORD_ITERATIONS
      ? PASSWORD_ITERATIONS
      : LEGACY_PASSWORD_ITERATIONS;
    await hashPasswordInHasher(
      env,
      password,
      "AAAAAAAAAAAAAAAAAAAAAA",
      paddingIterations,
    );
    throw new ApiError(401, "Invalid credentials");
  }
  if (user.is_banned) throw new ApiError(403, "This account has been suspended");

  const timestamp = now();
  await env.DB.prepare("UPDATE users SET last_login_at = ?, updated_at = ? WHERE id = ?")
    .bind(timestamp, timestamp, user.id).run();
  const token = await createSession(env, user.id);
  return setCookie(
    json({ user: { id: user.id, username: user.username, email: user.email, role: user.role } }),
    sessionCookie(request, token),
  );
}

export async function resetPasswordWithRecovery(request: Request, env: Env): Promise<Response> {
  await enforceRateLimit(
    env,
    await requestRateKey(request, env, "recovery-reset"),
    8,
    15 * 60,
  );
  const body = await parseJson<{
    username?: unknown;
    recoveryCode?: unknown;
    newPassword?: unknown;
  }>(request, 2_048);
  const { key: usernameKey } = normalizeUsername(body.username);
  const newPassword = validatePassword(body.newPassword, "New password");
  await enforceRateLimit(
    env,
    await accountRateKey(env, "recovery-reset-account", usernameKey),
    8,
    15 * 60,
  );
  const recoveryCode = normalizeRecoveryCode(body.recoveryCode);
  const submittedCodeHash = await sha256(recoveryCode);

  const user = await env.DB.prepare(
    `SELECT u.id, u.username, u.email, u.role, r.code_hash AS recovery_code_hash
       FROM users u
       JOIN account_recovery_codes r ON r.user_id = u.id
      WHERE u.username_key = ? AND u.is_banned = 0 AND r.code_hash = ?`,
  ).bind(usernameKey, submittedCodeHash).first<RecoveryUserRow>();
  if (!user) throw recoveryCredentialsError();

  const [passwordRecord, replacement, session] = await Promise.all([
    hashPasswordInHasher(env, newPassword),
    createRecoveryMaterial(),
    createSessionMaterial(),
  ]);
  const timestamp = now();
  const results = await env.DB.batch([
    env.DB.prepare(
      `UPDATE users
          SET password_hash = ?, password_salt = ?, password_iterations = ?, updated_at = ?
        WHERE id = ?
          AND is_banned = 0
          AND EXISTS (
            SELECT 1 FROM account_recovery_codes
             WHERE user_id = ? AND code_hash = ?
          )`,
    ).bind(
      passwordRecord.hash,
      passwordRecord.salt,
      passwordRecord.iterations,
      timestamp,
      user.id,
      user.id,
      user.recovery_code_hash,
    ),
    env.DB.prepare(
      `DELETE FROM sessions
        WHERE user_id = ?
          AND EXISTS (
            SELECT 1
              FROM users u
              JOIN account_recovery_codes r ON r.user_id = u.id
             WHERE u.id = ? AND u.is_banned = 0 AND r.code_hash = ?
               AND u.password_hash = ? AND u.password_salt = ? AND u.password_iterations = ?
          )`,
    ).bind(
      user.id,
      user.id,
      user.recovery_code_hash,
      passwordRecord.hash,
      passwordRecord.salt,
      passwordRecord.iterations,
    ),
    env.DB.prepare(
      `INSERT INTO sessions (token_hash, user_id, created_at, expires_at)
       SELECT ?, ?, ?, ?
        WHERE EXISTS (
          SELECT 1
            FROM users u
            JOIN account_recovery_codes r ON r.user_id = u.id
           WHERE u.id = ? AND u.is_banned = 0 AND r.code_hash = ?
             AND u.password_hash = ? AND u.password_salt = ? AND u.password_iterations = ?
        )`,
    ).bind(
      session.tokenHash,
      user.id,
      session.createdAt,
      session.expiresAt,
      user.id,
      user.recovery_code_hash,
      passwordRecord.hash,
      passwordRecord.salt,
      passwordRecord.iterations,
    ),
    env.DB.prepare(
      `UPDATE account_recovery_codes
          SET code_hash = ?, updated_at = ?
        WHERE user_id = ? AND code_hash = ?
          AND EXISTS (
            SELECT 1 FROM users
             WHERE id = ? AND is_banned = 0
               AND password_hash = ? AND password_salt = ? AND password_iterations = ?
          )
       RETURNING user_id`,
    ).bind(
      replacement.codeHash,
      timestamp,
      user.id,
      user.recovery_code_hash,
      user.id,
      passwordRecord.hash,
      passwordRecord.salt,
      passwordRecord.iterations,
    ),
  ]);

  if (!changedExactlyOne(results[3])) throw recoveryCredentialsError();
  return setCookie(
    json({
      user: { id: user.id, username: user.username, email: user.email, role: user.role },
      recoveryCode: replacement.code,
    }),
    sessionCookie(request, session.token),
  );
}

export async function authSession(request: Request, env: Env): Promise<Response> {
  const user = await sessionUser(request, env);
  if (!user) return json({ authenticated: false });
  return json({
    authenticated: true,
    user: {
      id: user.id,
      username: user.username,
      avatar: user.avatar,
      role: user.role,
    },
  });
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

export async function rotateRecoveryCode(request: Request, env: Env): Promise<Response> {
  const session = await requireUser(request, env);
  await enforceRateLimit(
    env,
    await requestRateKey(request, env, `recovery-rotate:${session.id}`),
    5,
    15 * 60,
  );
  const body = await parseJson<{ password?: unknown }>(request, 1_024);
  const currentPassword = validatePassword(body.password);
  const user = await env.DB.prepare(
    "SELECT password_hash, password_salt, password_iterations FROM users WHERE id = ?",
  ).bind(session.id).first<Pick<UserPasswordRow, "password_hash" | "password_salt" | "password_iterations">>();
  if (!user || !await verifyPasswordInHasher(
    env,
    currentPassword,
    user.password_hash,
    user.password_salt,
    user.password_iterations,
  )) {
    throw new ApiError(401, "Current password is incorrect");
  }

  const replacement = await createRecoveryMaterial();
  const timestamp = now();
  const result = await env.DB.prepare(
    `INSERT INTO account_recovery_codes (user_id, code_hash, created_at, updated_at)
     SELECT id, ?, ?, ?
       FROM users
      WHERE id = ? AND is_banned = 0
        AND password_hash = ? AND password_salt = ? AND password_iterations = ?
     ON CONFLICT(user_id) DO UPDATE SET
       code_hash = excluded.code_hash,
       updated_at = excluded.updated_at
     RETURNING user_id`,
  ).bind(
    replacement.codeHash,
    timestamp,
    timestamp,
    session.id,
    user.password_hash,
    user.password_salt,
    user.password_iterations,
  ).run();
  if (!changedExactlyOne(result)) throw new ApiError(401, "Current password is incorrect");
  return json({ recoveryCode: replacement.code });
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
  if (!user || !await verifyPasswordInHasher(
    env,
    currentPassword,
    user.password_hash,
    user.password_salt,
    user.password_iterations,
  )) {
    throw new ApiError(401, "Current password is incorrect");
  }

  const [passwordRecord, replacementSession] = await Promise.all([
    hashPasswordInHasher(env, newPassword),
    createSessionMaterial(),
  ]);
  const timestamp = now();
  const results = await env.DB.batch([
    env.DB.prepare(
      `UPDATE users
          SET password_hash = ?, password_salt = ?, password_iterations = ?, updated_at = ?
        WHERE id = ?
          AND password_hash = ? AND password_salt = ? AND password_iterations = ?`,
    ).bind(
      passwordRecord.hash,
      passwordRecord.salt,
      passwordRecord.iterations,
      timestamp,
      session.id,
      user.password_hash,
      user.password_salt,
      user.password_iterations,
    ),
    env.DB.prepare(
      `DELETE FROM sessions
        WHERE user_id = ?
          AND EXISTS (
            SELECT 1 FROM users
             WHERE id = ?
               AND password_hash = ? AND password_salt = ? AND password_iterations = ?
          )`,
    ).bind(
      session.id,
      session.id,
      passwordRecord.hash,
      passwordRecord.salt,
      passwordRecord.iterations,
    ),
    env.DB.prepare(
      `INSERT INTO sessions (token_hash, user_id, created_at, expires_at)
       SELECT ?, ?, ?, ?
        WHERE EXISTS (
          SELECT 1 FROM users
           WHERE id = ?
             AND password_hash = ? AND password_salt = ? AND password_iterations = ?
        )
       RETURNING token_hash`,
    ).bind(
      replacementSession.tokenHash,
      session.id,
      replacementSession.createdAt,
      replacementSession.expiresAt,
      session.id,
      passwordRecord.hash,
      passwordRecord.salt,
      passwordRecord.iterations,
    ),
  ]);
  if (!changedExactlyOne(results[2])) throw new ApiError(401, "Current password is incorrect");
  return setCookie(
    json({ success: true, message: "Password updated successfully" }),
    sessionCookie(request, replacementSession.token),
  );
}

function normalizeCardId(value: unknown): string {
  if (typeof value !== "string" || !ID_PATTERN.test(value)) throw new ApiError(400, "Invalid cardId");
  return value;
}

function normalizeCategory(value: unknown): string {
  if (typeof value !== "string" || !CATEGORY_PATTERN.test(value)) throw new ApiError(400, "Invalid categoryId");
  return value;
}

export async function saveProgress(request: Request, env: Env): Promise<Response> {
  const user = await requireUser(request, env);
  await enforceRateLimit(
    env,
    await requestRateKey(request, env, `progress:${user.id}`),
    300,
    60 * 60,
  );
  const body = await parseJson<{ cardId?: unknown; categoryId?: unknown; status?: unknown }>(request);
  const cardId = normalizeCardId(body.cardId);
  const categoryId = normalizeCategory(body.categoryId);
  const card = await validateCard(env, cardId, categoryId);
  const status = canonicalStatus(body.status, card.difficulty);
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
  await enforceRateLimit(
    env,
    await requestRateKey(request, env, `progress:${user.id}`),
    300,
    60 * 60,
  );
  const body = await parseJson<{ cardId?: unknown }>(request);
  const cardId = normalizeCardId(body.cardId);
  await env.DB.prepare("DELETE FROM progress WHERE user_id = ? AND card_id = ?").bind(user.id, cardId).run();
  return json({ success: true });
}

export async function favorite(request: Request, env: Env): Promise<Response> {
  const user = await requireUser(request, env);
  await enforceRateLimit(
    env,
    await requestRateKey(request, env, `favorite:${user.id}`),
    300,
    60 * 60,
  );
  const body = await parseJson<{ cardId?: unknown; categoryId?: unknown; action?: unknown }>(request);
  const cardId = normalizeCardId(body.cardId);
  const action = body.action === undefined ? "add" : body.action;
  if (action !== "add" && action !== "remove") throw new ApiError(400, "Invalid favorite action");

  if (action === "add") {
    const categoryId = normalizeCategory(body.categoryId);
    await validateCard(env, cardId, categoryId);
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

interface SyncProgressItem {
  cardId?: unknown;
  categoryId?: unknown;
  status?: unknown;
}

interface SyncFavoriteItem {
  cardId?: unknown;
  categoryId?: unknown;
}

export async function syncUserData(request: Request, env: Env): Promise<Response> {
  const user = await requireUser(request, env);
  await enforceRateLimit(
    env,
    await requestRateKey(request, env, `sync:${user.id}`),
    80,
    60 * 60,
  );
  const body = await parseJson<{
    progress?: unknown;
    favorites?: unknown;
  }>(request, 262_144);
  const progressItems = body.progress === undefined ? [] : body.progress;
  const favoriteItems = body.favorites === undefined ? [] : body.favorites;
  if (!Array.isArray(progressItems) || !Array.isArray(favoriteItems)) {
    throw new ApiError(400, "Invalid sync payload");
  }
  if (progressItems.length + favoriteItems.length > MAX_SYNC_ITEMS) {
    throw new ApiError(413, `Sync is limited to ${MAX_SYNC_ITEMS} items`);
  }

  const timestamp = now();
  const progress = new Map<string, {
    cardId: string;
    categoryId: string;
    status: string;
  }>();
  for (const raw of progressItems as SyncProgressItem[]) {
    if (!raw || typeof raw !== "object") throw new ApiError(400, "Invalid progress item");
    const cardId = normalizeCardId(raw.cardId);
    const categoryId = normalizeCategory(raw.categoryId);
    const card = await validateCard(env, cardId, categoryId);
    progress.set(cardId, {
      cardId,
      categoryId,
      status: canonicalStatus(raw.status, card.difficulty),
    });
  }

  const favorites = new Map<string, { cardId: string; categoryId: string }>();
  for (const raw of favoriteItems as SyncFavoriteItem[]) {
    if (!raw || typeof raw !== "object") throw new ApiError(400, "Invalid favorite item");
    const cardId = normalizeCardId(raw.cardId);
    const categoryId = normalizeCategory(raw.categoryId);
    await validateCard(env, cardId, categoryId);
    favorites.set(cardId, { cardId, categoryId });
  }

  const statements: D1PreparedStatement[] = [];
  for (const item of progress.values()) {
    const correctAt = item.status.startsWith("wrong-") ? null : timestamp;
    statements.push(env.DB.prepare(
      `INSERT INTO progress (
        user_id, card_id, category_id, status, first_correct_at, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(user_id, card_id) DO UPDATE SET
        category_id = excluded.category_id,
        status = excluded.status,
        first_correct_at = COALESCE(progress.first_correct_at, excluded.first_correct_at),
        updated_at = excluded.updated_at`,
    ).bind(
      user.id,
      item.cardId,
      item.categoryId,
      item.status,
      correctAt,
      timestamp,
      timestamp,
    ));
  }
  for (const item of favorites.values()) {
    statements.push(env.DB.prepare(
      `INSERT INTO favorites (user_id, card_id, category_id, created_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(user_id, card_id) DO UPDATE SET category_id = excluded.category_id`,
    ).bind(user.id, item.cardId, item.categoryId, timestamp));
  }
  if (statements.length) await env.DB.batch(statements);
  return json({
    success: true,
    progress: progress.size,
    favorites: favorites.size,
  });
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
  await enforceRateLimit(
    env,
    await requestRateKey(request, env, `analytics:${user.id}`),
    180,
    60 * 60,
  );
  const body = await parseJson<{ pageSlug?: unknown; timeSpent?: unknown }>(request);
  const pageSlug = normalizeCategory(body.pageSlug);
  const timeSpent = Number(body.timeSpent);
  if (!Number.isInteger(timeSpent) || timeSpent < 1 || timeSpent > 300) {
    throw new ApiError(400, "Invalid timeSpent");
  }
  const timestamp = now();
  const activityDate = timestamp.slice(0, 10);
  const recorded = await env.DB.prepare(
    `INSERT INTO analytics_daily (user_id, page_slug, activity_date, time_spent, updated_at)
     SELECT ?, ?, ?, ?, ?
      WHERE EXISTS (
        SELECT 1
          FROM privacy_preferences
         WHERE user_id = ?
           AND usage_analytics_enabled = 1
           AND notice_version = ?
      )
     ON CONFLICT(user_id, page_slug, activity_date) DO UPDATE SET
       time_spent = MIN(86400, analytics_daily.time_spent + excluded.time_spent),
       updated_at = excluded.updated_at
     RETURNING user_id`,
  ).bind(
    user.id,
    pageSlug,
    activityDate,
    timeSpent,
    timestamp,
    user.id,
    PRIVACY_NOTICE_VERSION,
  ).first<{ user_id: string }>();
  return json({ success: true, recorded: recorded?.user_id === user.id });
}

export async function suggestion(request: Request, env: Env): Promise<Response> {
  const ipHash = await requestRateKey(request, env, "suggestion");
  await enforceRateLimit(env, ipHash, 5, 60 * 60);
  const body = await parseJson<{
    text?: unknown;
    email?: unknown;
    saveWithAccount?: unknown;
  }>(request, 8_192);
  const user = body.saveWithAccount === true ? await requireUser(request, env) : null;
  if (typeof body.text !== "string") throw new ApiError(400, "Suggestion text is required");
  const text = body.text.trim();
  if (text.length < 5 || text.length > 2_000) throw new ApiError(400, "Suggestion must be 5–2,000 characters");
  const email = normalizeEmail(body.email);
  await env.DB.prepare(
    `INSERT INTO suggestions (id, user_id, text, email, ip_hash, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).bind(randomToken(18), user?.id || null, text, email, ipHash, now()).run();
  return json({ success: true, savedWithAccount: Boolean(user) }, 201);
}

export async function privacyRequest(request: Request, env: Env): Promise<Response> {
  const ipHash = await requestRateKey(request, env, "privacy-request");
  await enforceRateLimit(env, ipHash, 5, 60 * 60);
  const body = await parseJson<{
    type?: unknown;
    text?: unknown;
    email?: unknown;
    saveWithAccount?: unknown;
  }>(request, 8_192);

  if (typeof body.type !== "string" || !PRIVACY_REQUEST_TYPES.has(body.type)) {
    throw new ApiError(
      400,
      "Invalid privacy request type",
      undefined,
      "PRIVACY_REQUEST_TYPE_INVALID",
    );
  }
  if (typeof body.saveWithAccount !== "boolean") {
    throw new ApiError(
      400,
      "saveWithAccount must be true or false",
      undefined,
      "PRIVACY_REQUEST_LINK_CHOICE_REQUIRED",
    );
  }
  if (typeof body.text !== "string") {
    throw new ApiError(
      400,
      "Privacy request text is required",
      undefined,
      "PRIVACY_REQUEST_TEXT_REQUIRED",
    );
  }
  const text = body.text.trim();
  if (text.length < 5 || text.length > 2_000) {
    throw new ApiError(
      400,
      "Privacy request must be 5–2,000 characters",
      undefined,
      "PRIVACY_REQUEST_TEXT_INVALID",
    );
  }
  const emailValue = typeof body.email === "string" && body.email.trim() === ""
    ? null
    : body.email;
  const email = normalizeEmail(emailValue);
  const user = body.saveWithAccount ? await requireUser(request, env) : null;
  const storedText = `[${PRIVACY_REQUEST_PREFIX}:${body.type}]\n${text}`;

  await env.DB.prepare(
    `INSERT INTO suggestions (id, user_id, text, email, ip_hash, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).bind(crypto.randomUUID(), user?.id || null, storedText, email, ipHash, now()).run();

  return json({
    success: true,
    privacyRequest: {
      accepted: true,
      type: body.type,
      savedWithAccount: Boolean(user),
    },
  }, 201);
}
