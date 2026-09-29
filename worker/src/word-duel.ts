import { enforceRateLimit } from "./db.js";
import { ApiError, json, parseJson } from "./http.js";
import { clientIp, sha256 } from "./security.js";
import type { Env } from "./types.js";
import { vocabulary, VOCABULARY_VERSION } from "./word-duel-rules.js";
import { cleanDuelName } from "./word-duel-room.js";

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export async function routeWordDuel(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  if (url.pathname === "/api/word-duel/vocabulary" && request.method === "GET") {
    const lang = url.searchParams.get("lang") === "ar" ? "ar" : "en";
    return json({ lang, version: VOCABULARY_VERSION, words: vocabulary(lang) });
  }
  if (request.method !== "POST") throw new ApiError(405, "Use POST.", undefined, "METHOD_NOT_ALLOWED");
  if (!env.WORD_DUEL_ROOMS) throw new ApiError(503, "Online Word Duel is temporarily unavailable. Please try again later.", undefined, "DUEL_UNAVAILABLE");
  const path = url.pathname;
  const match = /^\/api\/word-duel\/([A-HJ-NP-Z2-9]{8})\/(join|state|action)$/u.exec(path);
  if (path !== "/api/word-duel/create" && !match) throw new ApiError(404, "Not found", undefined, "NOT_FOUND");
  const networkHash = await sha256(`${env.IP_HASH_SALT}:word-duel:${clientIp(request)}`);
  if (path === "/api/word-duel/create") await enforceRateLimit(env, `${networkHash}:create`, 12, 3600);
  if (match?.[2] === "join") await enforceRateLimit(env, `${networkHash}:join`, 30, 60);
  // Limit unknown-room probes before allocating a Durable Object. Normal polling
  // uses 15 requests per minute per browser; this also permits shared networks.
  if (match?.[2] === "state" || match?.[2] === "action") await enforceRateLimit(env, `${networkHash}:play`, 120, 60);
  const body = await parseJson<Record<string, unknown>>(request, 4096);
  const headers = { "content-type": "application/json", "x-duel-client-key": networkHash };
  if (path === "/api/word-duel/create") {
    if (typeof body.token !== "string" || !/^[A-Za-z0-9_-]{43}$/u.test(body.token) || !cleanDuelName(body.name) || (body.lang !== "en" && body.lang !== "ar")) {
      throw new ApiError(400, "Enter your name and choose a language.", undefined, "INVALID_ROOM");
    }
    for (let attempt = 0; attempt < 5; attempt++) {
      // Derive a random-looking, stable code from the private token. A create retry
      // after a lost response resumes the original room, rather than losing its seat.
      const digest = await sha256(`${env.IP_HASH_SALT}:word-duel-code:${body.token}:${attempt}`);
      const bytes = atob(digest.replace(/-/gu, "+").replace(/_/gu, "/"));
      const code = Array.from(bytes.slice(0, 8), (byte) => CODE_ALPHABET[byte.charCodeAt(0) % CODE_ALPHABET.length]).join("");
      const stub = env.WORD_DUEL_ROOMS.get(env.WORD_DUEL_ROOMS.idFromName(code));
      const response = await stub.fetch(new Request("https://word-duel.internal/init", { method: "POST", headers, body: JSON.stringify({ ...body, code }) }));
      if (response.status !== 409) return response;
    }
    throw new ApiError(503, "Could not create a room. Please retry.", undefined, "ROOM_CREATE_FAILED");
  }
  const stub = env.WORD_DUEL_ROOMS.get(env.WORD_DUEL_ROOMS.idFromName(match![1]!));
  return stub.fetch(new Request(`https://word-duel.internal/${match![2]}`, { method: "POST", headers, body: JSON.stringify(body) }));
}
