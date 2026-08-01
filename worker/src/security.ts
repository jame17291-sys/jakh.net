import { ApiError } from "./http.js";

const encoder = new TextEncoder();
// Phase A keeps new hashes on the currently deployed cost while teaching the
// runtime to read the stronger format. Phase B flips the default only after
// this dual-reader release is live, preserving a safe rollback target.
export const PASSWORD_ITERATIONS = 100_000;
export const FUTURE_PASSWORD_ITERATIONS = 600_000;
const SESSION_MAX_AGE_SECONDS = 14 * 24 * 60 * 60;
const SESSION_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/u;

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

export function getSessionToken(request: Request, configuredStaticOrigin = ""): string | null {
  const cookies = parseCookies(request);
  const url = new URL(request.url);
  let configuredLocalDevelopment = false;
  try {
    const staticOrigin = new URL(configuredStaticOrigin);
    configuredLocalDevelopment = staticOrigin.protocol === "http:"
      && (staticOrigin.hostname === "localhost" || staticOrigin.hostname === "127.0.0.1");
  } catch {
    configuredLocalDevelopment = false;
  }
  const localDevelopment = (
    url.protocol === "http:"
    && (url.hostname === "localhost" || url.hostname === "127.0.0.1")
  ) || configuredLocalDevelopment;
  const token = cookies.get("__Host-jakh_session")
    || (localDevelopment ? cookies.get("jakh_session") : null)
    || null;
  return token && SESSION_TOKEN_PATTERN.test(token) ? token : null;
}

export function sessionCookie(request: Request, token: string): string {
  const secure = new URL(request.url).protocol === "https:";
  const name = secure ? "__Host-jakh_session" : "jakh_session";
  return [
    `${name}=${token}`,
    "Path=/",
    "HttpOnly",
    secure ? "Secure" : "",
    "SameSite=Strict",
    "Priority=High",
    `Max-Age=${SESSION_MAX_AGE_SECONDS}`,
  ].filter(Boolean).join("; ");
}

export function clearSessionCookies(): string[] {
  const attributes = "Path=/; HttpOnly; Max-Age=0; SameSite=Strict; Priority=High";
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

/**
 * Accept either of the identifiers users actually remember at sign-in while
 * keeping account creation's username rules deliberately strict.
 */
export function normalizeLoginIdentifier(value: unknown): {
  column: "username_key" | "email";
  value: string;
} {
  if (typeof value !== "string") {
    throw new ApiError(400, "Username or email is required");
  }
  const identifier = value.trim();
  if (!identifier) throw new ApiError(400, "Username or email is required");
  if (identifier.includes("@")) {
    const email = normalizeEmail(identifier);
    if (!email) throw new ApiError(400, "Invalid email");
    return { column: "email", value: email };
  }
  return { column: "username_key", value: normalizeUsername(identifier).key };
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

function ipv4Address(value: string): string | null {
  if (!/^(?:\d{1,3}\.){3}\d{1,3}$/u.test(value)) return null;
  const octets = value.split(".").map(Number);
  return octets.every((octet) => octet >= 0 && octet <= 255)
    ? octets.join(".")
    : null;
}

function ipv6Network(value: string): string | null {
  let address = value.split("%", 1)[0]?.toLowerCase() || "";
  if (!address.includes(":")) return null;
  const embeddedIpv4 = /^(.*:)([^:]+)$/u.exec(address);
  if (embeddedIpv4?.[1] && embeddedIpv4[2]?.includes(".")) {
    const ipv4 = ipv4Address(embeddedIpv4[2]);
    if (!ipv4) return null;
    const octets = ipv4.split(".").map(Number);
    address = `${embeddedIpv4[1]}${(((octets[0] || 0) << 8) | (octets[1] || 0)).toString(16)}:${(((octets[2] || 0) << 8) | (octets[3] || 0)).toString(16)}`;
  }
  const halves = address.split("::");
  if (halves.length > 2) return null;
  const left = (halves[0] || "").split(":").filter(Boolean);
  const right = (halves[1] || "").split(":").filter(Boolean);
  if (
    [...left, ...right].some((part) => !/^[0-9a-f]{1,4}$/u.test(part))
    || (halves.length === 1 && left.length !== 8)
    || left.length + right.length > 8
  ) {
    return null;
  }
  const omitted = halves.length === 2 ? 8 - left.length - right.length : 0;
  if (halves.length === 2 && omitted < 1) return null;
  const groups = [...left, ...Array<string>(omitted).fill("0"), ...right]
    .map((part) => part.padStart(4, "0"));
  return `${groups.slice(0, 4).join(":")}::/64`;
}

export function clientIp(request: Request): string {
  const value = request.headers.get("cf-connecting-ip")?.trim() || "";
  const ipv4 = ipv4Address(value);
  if (ipv4) return ipv4;
  const mappedIpv4 = /^::ffff:(.+)$/iu.exec(value)?.[1];
  if (mappedIpv4) return ipv4Address(mappedIpv4) || "local";
  return ipv6Network(value) || "local";
}

export function requireSecrets(pepper: string | undefined, salt: string | undefined): void {
  if (!pepper || pepper.length < 24 || !salt || salt.length < 24) {
    throw new ApiError(503, "API security configuration is incomplete");
  }
}
