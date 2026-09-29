// Standards-based Web Push: RFC 8291 (aes128gcm) and RFC 8292 (VAPID).
// Only known browser push services are accepted; redirects are never followed.
export interface PushConfig { VAPID_PUBLIC_KEY?: string; VAPID_PRIVATE_KEY?: string; VAPID_SUBJECT?: string }
export interface DuelSubscription { endpoint: string; keys: { p256dh: string; auth: string } }
export interface DuelReminder { subscription: DuelSubscription; lang: "en" | "ar"; vapidKey?: string; pending?: { key: string; revision: number; kind: "turn" | "rematch"; attempts: number; nextAt: number }; lastKey?: string }
const encoder = new TextEncoder();
export function base64url(bytes: Uint8Array): string { return btoa(String.fromCharCode(...bytes)).replace(/\+/gu, "-").replace(/\//gu, "_").replace(/=+$/u, ""); }
function decode(value: string): Uint8Array<ArrayBuffer> { return Uint8Array.from(atob(value.replace(/-/gu, "+").replace(/_/gu, "/")), c => c.charCodeAt(0)); }
function concat(...parts: Uint8Array[]): Uint8Array<ArrayBuffer> { const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0)); let offset = 0; for (const part of parts) { out.set(part, offset); offset += part.length; } return out; }
export function pushConfigured(config: PushConfig): boolean {
  return /^[A-Za-z0-9_-]{87}$/u.test(config.VAPID_PUBLIC_KEY || "") && /^[A-Za-z0-9_-]{43}$/u.test(config.VAPID_PRIVATE_KEY || "") && /^(mailto:[^\s@]+@[^\s@]+|https:\/\/[^\s]+)$/u.test(config.VAPID_SUBJECT || "");
}
const readiness = new WeakMap<PushConfig, Promise<boolean>>();
export function pushReady(config: PushConfig): Promise<boolean> {
  if (!pushConfigured(config)) return Promise.resolve(false);
  const cached = readiness.get(config); if (cached) return cached;
  const result = (async () => {
    try {
      const raw = decode(config.VAPID_PUBLIC_KEY!);
      const publicKey = await crypto.subtle.importKey("raw", raw, { name: "ECDSA", namedCurve: "P-256" }, false, ["verify"]);
      const key = await crypto.subtle.importKey("jwk", { kty: "EC", crv: "P-256", x: base64url(raw.slice(1, 33)), y: base64url(raw.slice(33)), d: config.VAPID_PRIVATE_KEY!, ext: true }, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
      const message = encoder.encode("Riddle Arabia push configuration check");
      const signature = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, message);
      return await crypto.subtle.verify({ name: "ECDSA", hash: "SHA-256" }, publicKey, signature, message);
    } catch { return false; }
  })();
  readiness.set(config, result); return result;
}
export async function validateSubscription(input: unknown): Promise<DuelSubscription> {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("Invalid subscription");
  const value = input as Record<string, unknown>;
  if (typeof value.endpoint !== "string" || value.endpoint.length > 2048 || !value.keys || typeof value.keys !== "object") throw new Error("Invalid subscription");
  const url = new URL(value.endpoint), host = url.hostname;
  const allowed = host === "fcm.googleapis.com" || host === "updates.push.services.mozilla.com" || /^[a-z0-9-]+\.push\.apple\.com$/u.test(host) || /^[a-z0-9-]+\.notify\.windows\.com$/u.test(host);
  if (!allowed || url.protocol !== "https:" || url.port || url.username || url.password || url.hash || url.pathname === "/") throw new Error("Unsupported push service");
  const keys = value.keys as Record<string, unknown>;
  if (typeof keys.p256dh !== "string" || !/^[A-Za-z0-9_-]{87}$/u.test(keys.p256dh) || typeof keys.auth !== "string" || !/^[A-Za-z0-9_-]{22}$/u.test(keys.auth)) throw new Error("Invalid subscription keys");
  const publicKey = decode(keys.p256dh);
  if (publicKey[0] !== 4 || decode(keys.auth).length !== 16) throw new Error("Invalid subscription keys");
  await crypto.subtle.importKey("raw", publicKey, { name: "ECDH", namedCurve: "P-256" }, false, []);
  return { endpoint: url.href, keys: { p256dh: keys.p256dh, auth: keys.auth } };
}
async function hkdf(ikm: Uint8Array<ArrayBuffer>, salt: Uint8Array<ArrayBuffer>, info: Uint8Array<ArrayBuffer>, length: number): Promise<Uint8Array<ArrayBuffer>> {
  const key = await crypto.subtle.importKey("raw", ikm, "HKDF", false, ["deriveBits"]);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: "HKDF", hash: "SHA-256", salt, info }, key, length * 8));
}
export async function encryptPush(subscription: DuelSubscription, payload: string): Promise<Uint8Array<ArrayBuffer>> {
  const message = encoder.encode(payload);
  if (message.length > 3000) throw new Error("Push payload too large");
  const uaPublic = decode(subscription.keys.p256dh);
  const pair = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
  const asPublic = new Uint8Array(await crypto.subtle.exportKey("raw", pair.publicKey));
  const receiver = await crypto.subtle.importKey("raw", uaPublic, { name: "ECDH", namedCurve: "P-256" }, false, []);
  const shared = new Uint8Array(await crypto.subtle.deriveBits({ name: "ECDH", public: receiver }, pair.privateKey, 256));
  const ikm = await hkdf(shared, decode(subscription.keys.auth), concat(encoder.encode("WebPush: info\0"), uaPublic, asPublic), 32);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const cek = await hkdf(ikm, salt, encoder.encode("Content-Encoding: aes128gcm\0"), 16);
  const nonce = await hkdf(ikm, salt, encoder.encode("Content-Encoding: nonce\0"), 12);
  const key = await crypto.subtle.importKey("raw", cek, "AES-GCM", false, ["encrypt"]);
  const encrypted = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce }, key, concat(message, new Uint8Array([2]))));
  // salt(16), record size(4, network byte order), key length(1), server key(65).
  return concat(salt, new Uint8Array([0, 0, 16, 0, 65]), asPublic, encrypted);
}
export async function vapidAuthorization(config: PushConfig, endpoint: string, now = Date.now()): Promise<string> {
  if (!pushConfigured(config)) throw new Error("Push is not configured");
  const raw = decode(config.VAPID_PUBLIC_KEY!);
  const key = await crypto.subtle.importKey("jwk", { kty: "EC", crv: "P-256", x: base64url(raw.slice(1, 33)), y: base64url(raw.slice(33)), d: config.VAPID_PRIVATE_KEY!, ext: true }, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
  const input = `${base64url(encoder.encode(JSON.stringify({ typ: "JWT", alg: "ES256" })))}.${base64url(encoder.encode(JSON.stringify({ aud: new URL(endpoint).origin, exp: Math.floor(now / 1000) + 3600, sub: config.VAPID_SUBJECT })))}`;
  const signature = new Uint8Array(await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, encoder.encode(input)));
  return `vapid t=${input}.${base64url(signature)}, k=${config.VAPID_PUBLIC_KEY}`;
}
export async function sendDuelPush(config: PushConfig, reminder: DuelReminder, code: string): Promise<"sent" | "gone" | "retry" | "failed"> {
  const subscription = await validateSubscription(reminder.subscription);
  const ar = reminder.lang === "ar", rematch = reminder.pending?.kind === "rematch";
  const payload = JSON.stringify({ type: "word-duel", code, lang: reminder.lang, kind: rematch ? "rematch" : "turn",
    title: ar ? "مبارزة الكلمات · ريدل أرابيا" : "Word Duel · Riddle Arabia",
    body: rematch ? (ar ? "صديقك يدعوك إلى مباراة جديدة. افتح الغرفة للقبول أو الرفض." : "Your friend invited you to a rematch. Open the room to accept or decline.") : (ar ? "حان دورك. افتح الغرفة لمتابعة المباراة." : "It’s your turn. Open the room to continue."),
  });
  const body = await encryptPush(subscription, payload);
  const authorization = await vapidAuthorization(config, subscription.endpoint);
  const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 5000);
  try {
    const response = await fetch(subscription.endpoint, { method: "POST", redirect: "error", signal: controller.signal, body,
      headers: { Authorization: authorization, "Content-Encoding": "aes128gcm", "Content-Type": "application/octet-stream", TTL: "300", Urgency: "normal", Topic: `duel_${code}` } });
    if (response.ok) return "sent";
    if (response.status === 404 || response.status === 410) return "gone";
    return response.status === 429 || response.status >= 500 ? "retry" : "failed";
  } catch { return "retry"; } finally { clearTimeout(timer); }
}
