import { ApiError, json, parseJson } from './http.js';
import { randomToken, sha256 } from './security.js';
import { buildKnowMeSelection, cleanKnowMeName, KNOW_ME_CODE_PATTERN, KNOW_ME_MAX_PLAYERS, KNOW_ME_STORAGE_KEY, KNOW_ME_TOKEN_PATTERN, KNOW_ME_TTL_MS, knowMeSnapshot, validateKnowMeAnswers, type KnowMeState } from './know-me-rules.js';

const RATE_STORAGE_KEY = 'know-me-rates';
type Rate = { start: number; count: number };

// Only isolated `know-me:<code>` instances use these storage keys. No quiz state
// is placed in the existing battle or Word Duel records.
export class KnowMeRoom {
  private queue: Promise<unknown> = Promise.resolve();
  constructor(private readonly ctx: DurableObjectState) {}

  fetch(request: Request): Promise<Response> {
    const next = this.queue.then(() => this.handle(request)).catch((error: unknown) => {
      if (error instanceof ApiError) return json({ error: error.message, code: error.code }, error.status, error.headers);
      throw error;
    });
    this.queue = next.catch(() => undefined);
    return next;
  }

  async alarm(): Promise<void> {
    const next = this.queue.then(async () => {
      const room = await this.ctx.storage.get<KnowMeState>(KNOW_ME_STORAGE_KEY);
      if (!room || room.expiresAt <= Date.now()) await this.ctx.storage.deleteAll();
      else await this.ctx.storage.setAlarm(room.expiresAt);
    });
    this.queue = next.catch(() => undefined);
    await next;
  }

  private async rateLimit(request: Request, now: number): Promise<void> {
    const key = request.headers.get('x-know-me-client-key');
    if (!key || !KNOW_ME_TOKEN_PATTERN.test(key)) throw new ApiError(403, 'Quiz access could not be verified.', undefined, 'INVALID_PLAYER_TOKEN');
    const rates = await this.ctx.storage.get<Record<string, Rate>>(RATE_STORAGE_KEY) || {};
    for (const [id, rate] of Object.entries(rates)) if (rate.start + 60_000 <= now) delete rates[id];
    if (!rates[key] && Object.keys(rates).length >= 64) throw new ApiError(429, 'This quiz is busy. Try again in a minute.', { 'retry-after': '60' }, 'RATE_LIMITED');
    const rate = rates[key] || { start: now, count: 0 };
    rate.count++;
    rates[key] = rate;
    await this.ctx.storage.put(RATE_STORAGE_KEY, rates);
    if (rate.count > 120) throw new ApiError(429, 'Too many requests. Wait a minute.', { 'retry-after': '60' }, 'RATE_LIMITED');
  }

  private async handle(request: Request): Promise<Response> {
    if (request.method !== 'POST') throw new ApiError(405, 'Use POST.', undefined, 'METHOD_NOT_ALLOWED');
    const path = new URL(request.url).pathname;
    if (!['/init', '/state', '/submit', '/close'].includes(path)) throw new ApiError(404, 'Not found', undefined, 'NOT_FOUND');
    const body = await parseJson<Record<string, unknown>>(request, 4096);
    if (typeof body.token !== 'string' || !KNOW_ME_TOKEN_PATTERN.test(body.token)) throw new ApiError(403, 'Quiz access could not be verified.', undefined, 'INVALID_PLAYER_TOKEN');
    const tokenHash = await sha256(body.token);
    const now = Date.now();
    let room = await this.ctx.storage.get<KnowMeState>(KNOW_ME_STORAGE_KEY);
    if (room && room.expiresAt <= now) {
      await this.ctx.storage.deleteAll();
      if (path === '/close') return json({ closed: true });
      throw new ApiError(410, 'This quiz has expired. Ask your friend for a new link.', undefined, 'QUIZ_EXPIRED');
    }
    if (!room && path === '/close') return json({ closed: true });
    if (!room && path !== '/init') throw new ApiError(404, 'Quiz not found. Check the link with your friend.', undefined, 'QUIZ_NOT_FOUND');
    await this.rateLimit(request, now);
    if (path === '/init') {
      if (room) return room.ownerTokenHash === tokenHash ? json(knowMeSnapshot(room, tokenHash)) : json({ error: 'Quiz exists', code: 'QUIZ_EXISTS' }, 409);
      const ownerName = cleanKnowMeName(body.name);
      if (!ownerName) throw new ApiError(400, 'Enter a name of up to 24 characters.', undefined, 'INVALID_PLAYER_NAME');
      if ((body.lang !== 'en' && body.lang !== 'ar') || typeof body.code !== 'string' || !KNOW_ME_CODE_PATTERN.test(body.code)) throw new ApiError(400, 'Choose a language and a valid quiz.', undefined, 'INVALID_QUIZ');
      const selected = buildKnowMeSelection(body.questions);
      room = { kind: 'know-me', code: body.code, lang: body.lang, ownerName, ownerTokenHash: tokenHash, ...selected, players: [], createdAt: now, expiresAt: now + KNOW_ME_TTL_MS };
      await this.ctx.storage.put(KNOW_ME_STORAGE_KEY, room);
      await this.ctx.storage.setAlarm(room.expiresAt);
      return json(knowMeSnapshot(room, tokenHash), 201);
    }
    if (!room) throw new ApiError(404, 'Quiz not found.', undefined, 'QUIZ_NOT_FOUND');
    if (path === '/close') {
      if (room.ownerTokenHash !== tokenHash) throw new ApiError(403, 'Only the quiz creator can close it.', undefined, 'QUIZ_OWNER_REQUIRED');
      await this.ctx.storage.deleteAll();
      return json({ closed: true });
    }
    if (path === '/state') return json(knowMeSnapshot(room, tokenHash));
    if (room.ownerTokenHash === tokenHash) throw new ApiError(400, 'Share your quiz with friends to play.', undefined, 'QUIZ_OWNER_CANNOT_SUBMIT');
    // A lost submit response can be retried without another score or a grading
    // oracle that lets this browser change its answers after seeing the result.
    if (room.players.some(player => player.tokenHash === tokenHash)) return json(knowMeSnapshot(room, tokenHash));
    if (room.players.length >= KNOW_ME_MAX_PLAYERS) throw new ApiError(409, 'This quiz already has 50 scores. Ask your friend for a new quiz.', undefined, 'QUIZ_FULL');
    const name = cleanKnowMeName(body.name);
    if (!name) throw new ApiError(400, 'Enter a name of up to 24 characters.', undefined, 'INVALID_PLAYER_NAME');
    const answers = validateKnowMeAnswers(body.answers);
    const score = answers.reduce((total, answer, index) => total + Number(answer === room!.answers[index]), 0);
    room.players.push({ id: randomToken(12), name, tokenHash, score, submittedAt: now });
    await this.ctx.storage.put(KNOW_ME_STORAGE_KEY, room);
    return json(knowMeSnapshot(room, tokenHash));
  }
}
