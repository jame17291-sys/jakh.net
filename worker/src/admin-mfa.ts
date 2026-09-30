import { enforceRateLimit, requireUser, touchPrivilegedSession, PRIVILEGED_SESSION_MAX_AGE_MS, runBoundedRetentionCleanup } from "./db.js";
import { ApiError, json, parseJson } from "./http.js";
import { verifyPasswordInHasher } from "./password-hasher.js";
import { randomToken, sha256, validateNewPassword, validatePassword } from "./security.js";
import type { Env, SessionUser } from "./types.js";

const encoder = new TextEncoder();
const SETUP_LIFETIME_MS = 10 * 60 * 1_000;
const BASE32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
interface Credential { credential_id: string; secret_ciphertext: string; last_used_step: number; enabled_at: string }
interface Pending { credential_id: string; previous_credential_id: string | null; secret_ciphertext: string; expires_at: string }

function toBase64(value: Uint8Array): string {
  return btoa(String.fromCharCode(...value));
}
function fromBase64(value: string): Uint8Array<ArrayBuffer> {
  return Uint8Array.from(atob(value), (character) => character.charCodeAt(0));
}
export function base32Encode(bytes: Uint8Array): string {
  let bits = 0; let value = 0; let output = "";
  for (const byte of bytes) {
    value = (value << 8) | byte; bits += 8;
    while (bits >= 5) { output += BASE32[(value >>> (bits - 5)) & 31]; bits -= 5; }
  }
  if (bits > 0) output += BASE32[(value << (5 - bits)) & 31];
  return output;
}
function base32Decode(secret: string): Uint8Array<ArrayBuffer> {
  if (!/^[A-Z2-7]+$/u.test(secret)) throw new Error("Invalid authenticator secret");
  let bits = 0; let value = 0; const bytes: number[] = [];
  for (const character of secret) {
    value = (value << 5) | BASE32.indexOf(character); bits += 5;
    if (bits >= 8) { bytes.push((value >>> (bits - 8)) & 255); bits -= 8; }
  }
  return Uint8Array.from(bytes);
}

// RFC 6238 / RFC 4226, SHA-1, 30-second counter, six digits for standard
// authenticator compatibility. Counter storage supports dates beyond 2038.
export async function totpAtStep(secret: string, step: number, digits = 6): Promise<string> {
  const counter = new Uint8Array(8);
  new DataView(counter.buffer).setBigUint64(0, BigInt(step));
  const key = await crypto.subtle.importKey("raw", base32Decode(secret), { name: "HMAC", hash: "SHA-1" }, false, ["sign"]);
  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", key, counter));
  const offset = (mac[mac.length - 1] || 0) & 15;
  const value = new DataView(mac.buffer).getUint32(offset) & 0x7fffffff;
  return String(value % (10 ** digits)).padStart(digits, "0");
}
export async function matchingTotpStep(secret: string, code: string, now = Date.now()): Promise<number | null> {
  if (!/^\d{6}$/u.test(code)) return null;
  const step = Math.floor(now / 30_000);
  let match: number | null = null;
  for (const candidate of [step - 1, step, step + 1]) {
    if (candidate < 0) continue;
    const expected = await totpAtStep(secret, candidate);
    let difference = 0;
    for (let index = 0; index < 6; index += 1) difference |= expected.charCodeAt(index) ^ code.charCodeAt(index);
    if (difference === 0) match = candidate;
  }
  return match;
}

async function encryptionKey(env: Env): Promise<CryptoKey> {
  const key = await crypto.subtle.importKey("raw", encoder.encode(env.PASSWORD_PEPPER), "HKDF", false, ["deriveKey"]);
  return crypto.subtle.deriveKey({ name: "HKDF", hash: "SHA-256", salt: encoder.encode("riddlearabia/admin-totp/v1"), info: encoder.encode("secret-encryption") }, key, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
}
export async function encryptMfaSecret(env: Env, userId: string, secret: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: encoder.encode(userId) }, await encryptionKey(env), encoder.encode(secret));
  return `v1.${toBase64(iv)}.${toBase64(new Uint8Array(encrypted))}`;
}
export async function decryptMfaSecret(env: Env, userId: string, value: string): Promise<string> {
  const [version, iv, ciphertext] = value.split(".");
  if (version !== "v1" || !iv || !ciphertext) throw new Error("Unsupported authenticator record");
  const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: fromBase64(iv), additionalData: encoder.encode(userId) }, await encryptionKey(env), fromBase64(ciphertext));
  return new TextDecoder().decode(plain);
}
async function requireMfaSchema(env: Env): Promise<void> {
  const row = await env.DB.prepare("SELECT value FROM schema_meta WHERE key = 'schema_version'").first<{ value: string }>();
  if (!row || Number(row.value) < 10) throw new ApiError(503, "Administrator security is temporarily unavailable during a database upgrade", { "retry-after": "300" }, "MFA_UNAVAILABLE");
}
async function privilegedUser(request: Request, env: Env): Promise<SessionUser> {
  const user = await requireUser(request, env);
  if (user.role !== "ADMIN" && user.role !== "OWNER") throw new ApiError(403, "Administrator access is required", undefined, "ADMIN_REQUIRED");
  await requireMfaSchema(env);
  await touchPrivilegedSession(env, user);
  return user;
}
async function credential(env: Env, userId: string): Promise<Credential | null> {
  return env.DB.prepare("SELECT credential_id, secret_ciphertext, last_used_step, enabled_at FROM admin_totp WHERE user_id = ?").bind(userId).first<Credential>();
}
async function verifiedSession(env: Env, user: SessionUser, credentialId: string): Promise<boolean> {
  const row = await env.DB.prepare("SELECT verified_at FROM admin_mfa_sessions WHERE token_hash = ? AND user_id = ? AND credential_id = ?")
    .bind(user.tokenHash, user.id, credentialId).first<{ verified_at: string }>();
  const verified = Date.parse(row?.verified_at || "");
  return Number.isFinite(verified) && verified <= Date.now() && Date.now() - verified < PRIVILEGED_SESSION_MAX_AGE_MS;
}
export async function requireAdminMfa(env: Env, user: SessionUser): Promise<void> {
  await requireMfaSchema(env);
  const active = await credential(env, user.id);
  if (!active) throw new ApiError(403, "Set up an authenticator to access administration", undefined, "MFA_ENROLLMENT_REQUIRED");
  if (!await verifiedSession(env, user, active.credential_id)) throw new ApiError(403, "Enter an authenticator or recovery code to access administration", undefined, "MFA_REQUIRED");
}
export async function requireEnrolledAdminMfa(env: Env, user: SessionUser): Promise<void> {
  if (user.role !== "ADMIN" && user.role !== "OWNER") return;
  await requireMfaSchema(env);
  if (!await credential(env, user.id)) return;
  await touchPrivilegedSession(env, user);
  await requireAdminMfa(env, user);
}

export async function cleanupExpiredMfaSetup(env: Env): Promise<void> {
  const schema = await env.DB.prepare("SELECT value FROM schema_meta WHERE key = 'schema_version'").first<{ value: string }>();
  if (!schema || Number(schema.value) < 10) return;
  const now = new Date().toISOString();
  await runBoundedRetentionCleanup(env.DB, "mfa-setup", [{
    name: "expired-mfa-setup",
    prepare: () => env.DB.prepare("DELETE FROM admin_totp_pending WHERE user_id IN (SELECT user_id FROM admin_totp_pending WHERE expires_at <= ? LIMIT 500)").bind(now),
    probe: () => env.DB.prepare("SELECT user_id FROM admin_totp_pending WHERE expires_at <= ? LIMIT 1").bind(now),
  }]);
}
async function limit(env: Env, user: SessionUser, action: string, maximum: number): Promise<void> {
  await enforceRateLimit(env, await sha256(`${env.IP_HASH_SALT}:admin-mfa:${action}:${user.id}`), maximum, 15 * 60);
}
async function freshPassword(env: Env, user: SessionUser, input: unknown): Promise<void> {
  const password = validatePassword(input);
  const row = await env.DB.prepare("SELECT password_hash, password_salt, password_iterations FROM users WHERE id = ?")
    .bind(user.id).first<{ password_hash: string; password_salt: string; password_iterations: number }>();
  if (!row || !await verifyPasswordInHasher(env, password, row.password_hash, row.password_salt, row.password_iterations)) {
    throw new ApiError(401, "Current password is incorrect", undefined, "CURRENT_PASSWORD_INCORRECT");
  }
  try { validateNewPassword(password, "Password", [user.username, user.email]); }
  catch { throw new ApiError(400, "Change your password to a long, unique passphrase before setting up an authenticator", undefined, "PASSWORD_ROTATION_REQUIRED"); }
}
function invalidCode(): ApiError { return new ApiError(400, "The code is invalid, expired, or already used. Try a new code.", undefined, "MFA_CODE_INVALID"); }
function codeInput(value: unknown): string { return typeof value === "string" ? value.trim().replaceAll(" ", "") : ""; }

export async function adminMfaStatus(request: Request, env: Env): Promise<Response> {
  const user = await privilegedUser(request, env);
  const active = await credential(env, user.id);
  const remaining = active ? await env.DB.prepare("SELECT COUNT(*) AS count FROM admin_mfa_recovery_codes WHERE user_id = ? AND credential_id = ?").bind(user.id, active.credential_id).first<{ count: number }>() : null;
  return json({ required: true, enabled: Boolean(active), verified: active ? await verifiedSession(env, user, active.credential_id) : false, recoveryCodesRemaining: remaining?.count || 0 });
}
export async function beginAdminMfa(request: Request, env: Env): Promise<Response> {
  const user = await privilegedUser(request, env);
  await limit(env, user, "setup", 5);
  const body = await parseJson<{ password?: unknown }>(request, 2_048);
  await freshPassword(env, user, body.password);
  const active = await credential(env, user.id);
  if (active) await requireAdminMfa(env, user);
  const secret = base32Encode(crypto.getRandomValues(new Uint8Array(20)));
  const credentialId = randomToken(24);
  const expiresAt = new Date(Date.now() + SETUP_LIFETIME_MS).toISOString();
  await env.DB.batch([
    env.DB.prepare("DELETE FROM admin_totp_pending WHERE user_id IN (SELECT user_id FROM admin_totp_pending WHERE expires_at <= ? LIMIT 500)").bind(new Date().toISOString()),
    env.DB.prepare(`INSERT INTO admin_totp_pending (user_id, token_hash, credential_id, previous_credential_id, secret_ciphertext, expires_at)
      VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(user_id) DO UPDATE SET token_hash = excluded.token_hash, credential_id = excluded.credential_id,
      previous_credential_id = excluded.previous_credential_id, secret_ciphertext = excluded.secret_ciphertext, expires_at = excluded.expires_at`)
      .bind(user.id, user.tokenHash, credentialId, active?.credential_id || null, await encryptMfaSecret(env, user.id, secret), expiresAt),
  ]);
  const label = encodeURIComponent(`Riddle Arabia:${user.username}`);
  return json({ secret, expiresAt, otpauthUri: `otpauth://totp/${label}?secret=${secret}&issuer=Riddle%20Arabia&algorithm=SHA1&digits=6&period=30` });
}

export async function confirmAdminMfa(request: Request, env: Env): Promise<Response> {
  const user = await privilegedUser(request, env);
  await limit(env, user, "code", 10);
  const body = await parseJson<{ code?: unknown }>(request, 1_024);
  const pending = await env.DB.prepare("SELECT credential_id, previous_credential_id, secret_ciphertext, expires_at FROM admin_totp_pending WHERE user_id = ? AND token_hash = ? AND expires_at > ?")
    .bind(user.id, user.tokenHash, new Date().toISOString()).first<Pending>();
  if (!pending) throw new ApiError(400, "Authenticator setup expired. Start again.", undefined, "MFA_SETUP_EXPIRED");
  const step = await matchingTotpStep(await decryptMfaSecret(env, user.id, pending.secret_ciphertext), codeInput(body.code));
  if (step === null) throw invalidCode();
  const installedCredentialId = randomToken(24);
  const codes = Array.from({ length: 10 }, () => randomToken(16));
  const digests = await Promise.all(codes.map((code) => sha256(`admin-mfa-recovery:${user.id}:${code}`)));
  const now = new Date().toISOString();
  // The credential ID is a per-setup nonce. All subsequent writes are bound to
  // its successful installation, so concurrent confirmations cannot issue
  // extra recovery codes or replace an authenticator changed in another tab.
  const results = await env.DB.batch([
    env.DB.prepare(`INSERT INTO admin_totp (user_id, credential_id, secret_ciphertext, last_used_step, enabled_at)
      SELECT user_id, ?, secret_ciphertext, ?, ? FROM admin_totp_pending
      WHERE user_id = ? AND token_hash = ? AND credential_id = ? AND expires_at > ?
      AND ((previous_credential_id IS NULL AND NOT EXISTS (SELECT 1 FROM admin_totp WHERE user_id = ?))
        OR previous_credential_id = (SELECT credential_id FROM admin_totp WHERE user_id = ?))
      ON CONFLICT(user_id) DO UPDATE SET credential_id = excluded.credential_id, secret_ciphertext = excluded.secret_ciphertext,
      last_used_step = excluded.last_used_step, enabled_at = excluded.enabled_at RETURNING credential_id`)
      .bind(installedCredentialId, step, now, user.id, user.tokenHash, pending.credential_id, now, user.id, user.id),
    env.DB.prepare("DELETE FROM admin_mfa_sessions WHERE user_id = ? AND EXISTS (SELECT 1 FROM admin_totp WHERE user_id = ? AND credential_id = ?)").bind(user.id, user.id, installedCredentialId),
    env.DB.prepare("DELETE FROM admin_mfa_recovery_codes WHERE user_id = ? AND EXISTS (SELECT 1 FROM admin_totp WHERE user_id = ? AND credential_id = ?)").bind(user.id, user.id, installedCredentialId),
    ...digests.map((digest) => env.DB.prepare(`INSERT INTO admin_mfa_recovery_codes (code_hash, user_id, credential_id, created_at)
      SELECT ?, user_id, credential_id, ? FROM admin_totp WHERE user_id = ? AND credential_id = ?`)
      .bind(digest, now, user.id, installedCredentialId)),
    env.DB.prepare(`INSERT INTO admin_mfa_sessions (token_hash, user_id, credential_id, verified_at)
      SELECT ?, user_id, credential_id, ? FROM admin_totp WHERE user_id = ? AND credential_id = ?
      ON CONFLICT(token_hash) DO UPDATE SET credential_id = excluded.credential_id, verified_at = excluded.verified_at`)
      .bind(user.tokenHash, now, user.id, installedCredentialId),
    env.DB.prepare(`INSERT INTO admin_audit_log (id, actor_user_id, action, target_type, target_id, detail, created_at)
      SELECT ?, user_id, ?, 'account', user_id, '{}', ? FROM admin_totp WHERE user_id = ? AND credential_id = ?`)
      .bind(crypto.randomUUID(), pending.previous_credential_id ? "security.authenticator_replaced" : "security.authenticator_enabled", now, user.id, installedCredentialId),
    env.DB.prepare("DELETE FROM admin_totp_pending WHERE user_id = ? AND credential_id = ?").bind(user.id, pending.credential_id),
  ]);
  if (!results[0]?.results?.length) throw new ApiError(409, "Authenticator setup changed. Start again.", undefined, "MFA_SETUP_EXPIRED");
  return json({ success: true, recoveryCodes: codes });
}

export async function verifyAdminMfa(request: Request, env: Env): Promise<Response> {
  const user = await privilegedUser(request, env);
  await limit(env, user, "code", 10);
  const body = await parseJson<{ code?: unknown }>(request, 1_024);
  const active = await credential(env, user.id);
  if (!active) throw new ApiError(403, "Set up an authenticator to access administration", undefined, "MFA_ENROLLMENT_REQUIRED");
  const code = codeInput(body.code);
  let claimed: D1Result;
  if (/^[A-Za-z0-9_-]{22}$/u.test(code)) {
    claimed = await env.DB.prepare("DELETE FROM admin_mfa_recovery_codes WHERE user_id = ? AND credential_id = ? AND code_hash = ? RETURNING code_hash")
      .bind(user.id, active.credential_id, await sha256(`admin-mfa-recovery:${user.id}:${code}`)).run();
  } else {
    const step = await matchingTotpStep(await decryptMfaSecret(env, user.id, active.secret_ciphertext), code);
    if (step === null) throw invalidCode();
    claimed = await env.DB.prepare("UPDATE admin_totp SET last_used_step = ? WHERE user_id = ? AND credential_id = ? AND last_used_step < ? RETURNING credential_id")
      .bind(step, user.id, active.credential_id, step).run();
  }
  if (!claimed.results?.length) throw invalidCode();
  const now = new Date().toISOString();
  const [verified] = await env.DB.batch([
    env.DB.prepare(`INSERT INTO admin_mfa_sessions (token_hash, user_id, credential_id, verified_at)
      SELECT ?, user_id, credential_id, ? FROM admin_totp WHERE user_id = ? AND credential_id = ?
      ON CONFLICT(token_hash) DO UPDATE SET credential_id = excluded.credential_id, verified_at = excluded.verified_at RETURNING token_hash`)
      .bind(user.tokenHash, now, user.id, active.credential_id),
    env.DB.prepare(`INSERT INTO admin_audit_log (id, actor_user_id, action, target_type, target_id, detail, created_at)
      SELECT ?, user_id, ?, 'account', user_id, ?, ? FROM admin_totp WHERE user_id = ? AND credential_id = ?`)
      .bind(crypto.randomUUID(), /^[A-Za-z0-9_-]{22}$/u.test(code) ? "security.authenticator_recovery_used" : "security.authenticator_verified",
        JSON.stringify({ method: /^[A-Za-z0-9_-]{22}$/u.test(code) ? "recovery_code" : "totp" }), now, user.id, active.credential_id),
  ]);
  if (!verified?.results?.length) throw invalidCode();
  return json({ success: true });
}
