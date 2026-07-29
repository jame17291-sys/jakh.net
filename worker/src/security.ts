import { ApiError } from "./http.js";

const encoder = new TextEncoder();
const PASSWORD_ITERATIONS = 310_000;
const SESSION_MAX_AGE_SECONDS = 14 * 24 * 60 * 60;

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/u, "");
}

function base64UrlToBytes(value: string): Uint8Array {
  const base64 = value.replaceAll("-", "+").replaceAll("_", "/");
  const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, "=");
  const binary = atob(padded);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

export function randomToken(bytes = 32): string {
  const value = new Uint8Array(bytes);
  crypto.getRandomValues(value);
  return bytesToBase64Url(value);
}

export async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(value));
  return bytesToBase64Url(new Uint8Array(digest));
}

export async function hashPassword(
  password: string,
  pepper: string,
  salt = randomToken(16),
  iterations = PASSWORD_ITERATIONS,
): Promise<{ hash: string; salt: string; iterations: number }> {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(`${password}\u0000${pepper}`),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      hash: "SHA-256",
      salt: base64UrlToBytes(salt).slice().buffer as ArrayBuffer,
      iterations,
    },
    key,
    256,
  );
  return { hash: bytesToBase64Url(new Uint8Array(bits)), salt, iterations };
}

function constantTimeEqual(left: string, right: string): boolean {
  const a = encoder.encode(left);
  const b = encoder.encode(right);
  const length = Math.max(a.length, b.length);
  let difference = a.length ^ b.length;
  for (let index = 0; index < length; index += 1) {
    difference |= (a[index] || 0) ^ (b[index] || 0);
  }
  return difference === 0;
}

export async function verifyPassword(
  password: string,
  pepper: string,
  expectedHash: string,
  salt: string,
  iterations: number,
): Promise<boolean> {
  const derived = await hashPassword(password, pepper, salt, iterations);
  return constantTimeEqual(derived.hash, expectedHash);
}

export function parseCookies(request: Request): Map<string, string> {
  const cookies = new Map<string, string>();
  for (const part of (request.headers.get("cookie") || "").split(";")) {
    const separator = part.indexOf("=");
    if (separator < 1) continue;
    const key = part.slice(0, separator).trim();
    const value = part.slice(separator + 1).trim();
    if (key) cookies.set(key, value);
  }
  return cookies;
}

export function getSessionToken(request: Request): string | null {
  const cookies = parseCookies(request);
  return cookies.get("__Host-jakh_session") || cookies.get("jakh_session") || null;
}

export function sessionCookie(request: Request, token: string): string {
  const secure = new URL(request.url).protocol === "https:";
  const name = secure ? "__Host-jakh_session" : "jakh_session";
  return [
    `${name}=${token}`,
    "Path=/",
    "HttpOnly",
    secure ? "Secure" : "",
    "SameSite=Lax",
    `Max-Age=${SESSION_MAX_AGE_SECONDS}`,
  ].filter(Boolean).join("; ");
}

export function clearSessionCookies(): string[] {
  const attributes = "Path=/; HttpOnly; Max-Age=0; SameSite=Lax";
  return [
    `__Host-jakh_session=; ${attributes}; Secure`,
    `jakh_session=; ${attributes}`,
  ];
}

export function sessionExpiry(): string {
  return new Date(Date.now() + SESSION_MAX_AGE_SECONDS * 1000).toISOString();
}

export function normalizeUsername(value: unknown): { username: string; key: string } {
  if (typeof value !== "string") throw new ApiError(400, "Username is required");
  const username = value.trim();
  if (!/^[A-Za-z0-9_]{3,20}$/u.test(username)) {
    throw new ApiError(400, "Username must be 3–20 characters using letters, numbers, or underscores");
  }
  return { username, key: username.toLowerCase() };
}

export function validatePassword(value: unknown, label = "Password"): string {
  if (typeof value !== "string") throw new ApiError(400, `${label} is required`);
  if (value.length < 8 || value.length > 128) {
    throw new ApiError(400, `${label} must be 8–128 characters`);
  }
  return value;
}

export function normalizeEmail(value: unknown): string | null {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string") throw new ApiError(400, "Invalid email");
  const email = value.trim().toLowerCase();
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(email)) {
    throw new ApiError(400, "Invalid email");
  }
  return email;
}

export function clientIp(request: Request): string {
  return request.headers.get("cf-connecting-ip") || "local";
}

export function requireSecrets(pepper: string | undefined, salt: string | undefined): void {
  if (!pepper || pepper.length < 24 || !salt || salt.length < 24) {
    throw new ApiError(503, "API security configuration is incomplete");
  }
}
