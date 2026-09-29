import { ApiError, json, parseJson } from "./http.js";
import { randomToken, sha256 } from "./security.js";
import { DuelError, makeDeck, playAction, privateSnapshot, type DuelRoomState } from "./word-duel-rules.js";

const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/u;
export const WORD_DUEL_STORAGE_KEY = "word-duel-room";
const RATE_STORAGE_KEY = "word-duel-rates";
type Rate = { start: number; count: number };
export function cleanDuelName(input: unknown): string {
  if (typeof input !== "string") return "";
  return [...input.normalize("NFKC").replace(/[\u0000-\u001f\u007f-\u009f\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069]/gu, "").trim().replace(/\s+/gu, " ")].slice(0, 20).join("");
}

// Helper for isolated `word-duel:<code>` instances of the existing BattleRoom
// namespace. Keeping the deployed class unchanged preserves Worker rollback.
export class WordDuelRoom {
  // Serialize full read/validate/write operations, including async token hashing.
  private queue: Promise<unknown> = Promise.resolve();
  constructor(private readonly ctx: DurableObjectState) {}
  fetch(request: Request): Promise<Response> {
    const next = this.queue.then(() => this.handle(request)).catch((error: unknown) => {
      if (error instanceof DuelError || error instanceof ApiError) return json({ error: error.message, code: error.code }, error.status);
      throw error;
    });
    this.queue = next.catch(() => undefined);
    return next;
  }
  async alarm(): Promise<void> {
    const next = this.queue.then(async () => {
      const room = await this.ctx.storage.get<DuelRoomState>(WORD_DUEL_STORAGE_KEY);
      if (!room || room.expiresAt <= Date.now()) await this.ctx.storage.deleteAll();
      else await this.ctx.storage.setAlarm(room.expiresAt);
    });
    this.queue = next.catch(() => undefined);
    await next;
  }
  private async save(room: DuelRoomState): Promise<void> {
    await this.ctx.storage.put(WORD_DUEL_STORAGE_KEY, room);
    await this.ctx.storage.setAlarm(room.expiresAt);
  }
  private async rateLimit(request: Request, now: number): Promise<void> {
    const key = request.headers.get("x-duel-client-key");
    if (!key || !TOKEN_PATTERN.test(key)) throw new DuelError("UNAUTHORIZED", "Invalid room access.", 403);
    const rates = await this.ctx.storage.get<Record<string, Rate>>(RATE_STORAGE_KEY) || {};
    for (const [id, value] of Object.entries(rates)) if (value.start + 60_000 <= now) delete rates[id];
    if (!rates[key] && Object.keys(rates).length >= 64) throw new DuelError("RATE_LIMITED", "This room is busy. Try again in a minute.", 429);
    const rate = rates[key] || { start: now, count: 0 };
    rate.count++;
    rates[key] = rate;
    await this.ctx.storage.put(RATE_STORAGE_KEY, rates);
    if (rate.count > 60) throw new DuelError("RATE_LIMITED", "Too many requests. Wait a minute.", 429);
  }
  private async handle(request: Request): Promise<Response> {
    if (request.method !== "POST") return json({ code: "METHOD_NOT_ALLOWED", error: "Use POST." }, 405);
    const body = await parseJson<Record<string, unknown>>(request, 4096);
    const now = Date.now();
    const path = new URL(request.url).pathname;
    let room = await this.ctx.storage.get<DuelRoomState>(WORD_DUEL_STORAGE_KEY);
    if (room && room.expiresAt <= now) {
      await this.ctx.storage.deleteAll();
      room = undefined;
      if (path !== "/init") throw new DuelError("ROOM_EXPIRED", "This room has expired. Create a new match.", 410);
    }
    if (path !== "/init" && !room) throw new DuelError("ROOM_NOT_FOUND", "Room not found. Check the code or create a new match.", 404);
    await this.rateLimit(request, now);
    const token = body.token;
    if (typeof token !== "string" || !TOKEN_PATTERN.test(token)) throw new DuelError("UNAUTHORIZED", "Room access could not be verified.", 403);
    const tokenHash = await sha256(token);
    if (path === "/init") {
      if (room) {
        const existing = room.players.find((p) => p.tokenHash === tokenHash);
        return existing ? json(privateSnapshot(room, existing.id)) : json({ error: "Room exists", code: "ROOM_EXISTS" }, 409);
      }
      const name = cleanDuelName(body.name);
      if (!name || (body.lang !== "en" && body.lang !== "ar") || typeof body.code !== "string" || !/^[A-HJ-NP-Z2-9]{8}$/u.test(body.code)) throw new DuelError("INVALID_ROOM", "Enter a name and choose a language.");
      const deck = makeDeck(body.lang);
      room = {
        kind: "word-duel", code: body.code, lang: body.lang, board: Array.from({ length: 81 }, () => null),
        players: [{ id: randomToken(12), name, tokenHash, rack: deck.racks[0]!, score: 0 }],
        // Reserve the other starter at the end; no client ever receives these letters.
        bag: [...deck.bag, ...deck.racks[1]!], phase: "waiting", turn: 0, revision: 0,
        scoreless: 0, turns: 0, lastMove: null, createdAt: now, expiresAt: now + 30 * 60_000,
      };
      await this.save(room);
      return json(privateSnapshot(room, room.players[0]!.id), 201);
    }
    if (!room) throw new DuelError("ROOM_NOT_FOUND", "Room not found.", 404);
    let player = room.players.find((p) => p.tokenHash === tokenHash);
    if (path === "/join") {
      // A retry after a lost response resumes the same seat, without exposing it to a new token.
      if (player) return json(privateSnapshot(room, player.id));
      if (room.phase !== "waiting" || room.players.length >= 2) throw new DuelError("ROOM_FULL", "This room already has two players.", 409);
      const name = cleanDuelName(body.name);
      if (!name) throw new DuelError("NAME_REQUIRED", "Enter your player name.");
      player = { id: randomToken(12), name, tokenHash, rack: room.bag.splice(-7), score: 0 };
      room.players.push(player); room.phase = "playing"; room.revision++;
      room.expiresAt = now + 24 * 60 * 60_000;
      await this.save(room);
      return json(privateSnapshot(room, player.id));
    }
    if (!player) throw new DuelError("UNAUTHORIZED", "Room access could not be verified. Resume from the device that joined.", 403);
    if (path === "/state") return json(privateSnapshot(room, player.id));
    if (path === "/action") {
      room = playAction(room, player.id, body, now);
      await this.save(room);
      return json(privateSnapshot(room, player.id));
    }
    return json({ error: "Not found", code: "NOT_FOUND" }, 404);
  }
}
