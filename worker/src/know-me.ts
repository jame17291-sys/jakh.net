import { enforceRateLimit } from './db.js';
import { ApiError, json, parseJson } from './http.js';
import { buildKnowMeSelection, cleanKnowMeName, KNOW_ME_TOKEN_PATTERN } from './know-me-rules.js';
import { clientIp, sha256 } from './security.js';
import type { Env } from './types.js';

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export async function routeKnowMe(request: Request, env: Env): Promise<Response> {
  if (request.method !== 'POST') throw new ApiError(405, 'Use POST.', undefined, 'METHOD_NOT_ALLOWED');
  if (!env.BATTLE_ROOMS) throw new ApiError(503, 'Friend quizzes are temporarily unavailable. Please try again later.', undefined, 'KNOW_ME_UNAVAILABLE');
  const path = new URL(request.url).pathname;
  const match = /^\/api\/know-me\/([A-HJ-NP-Z2-9]{12})\/(state|submit|close)$/u.exec(path);
  if (path !== '/api/know-me/create' && !match) throw new ApiError(404, 'Quiz not found. Check the link with your friend.', undefined, 'INVALID_QUIZ_CODE');
  const body = await parseJson<Record<string, unknown>>(request, 4096);
  if (typeof body.token !== 'string' || !KNOW_ME_TOKEN_PATTERN.test(body.token)) throw new ApiError(403, 'Quiz access could not be verified.', undefined, 'INVALID_PLAYER_TOKEN');
  if (path === '/api/know-me/create') {
    if (!cleanKnowMeName(body.name)) throw new ApiError(400, 'Enter a name of up to 24 characters.', undefined, 'INVALID_PLAYER_NAME');
    if (body.lang !== 'en' && body.lang !== 'ar') throw new ApiError(400, 'Choose a language.', undefined, 'INVALID_QUIZ');
    buildKnowMeSelection(body.questions);
  }
  const networkHash = await sha256(`${env.IP_HASH_SALT}:know-me:${clientIp(request)}`);
  await enforceRateLimit(env, `${networkHash}:${path === '/api/know-me/create' ? 'create' : 'play'}`, path === '/api/know-me/create' ? 12 : 120, path === '/api/know-me/create' ? 3600 : 60);
  const headers = { 'content-type': 'application/json', 'x-know-me-client-key': networkHash };
  if (path === '/api/know-me/create') {
    for (let attempt = 0; attempt < 5; attempt++) {
      // Stable, server-salted codes make lost-response retries resume the same
      // quiz while keeping a public link independent of its owner's token.
      const digest = await sha256(`${env.IP_HASH_SALT}:know-me-code:${body.token}:${attempt}`);
      const bytes = atob(digest.replace(/-/gu, '+').replace(/_/gu, '/'));
      const code = Array.from(bytes.slice(0, 12), byte => CODE_ALPHABET[byte.charCodeAt(0) % CODE_ALPHABET.length]).join('');
      const stub = env.BATTLE_ROOMS.get(env.BATTLE_ROOMS.idFromName(`know-me:${code}`));
      const response = await stub.fetch(new Request('https://know-me.internal/know-me/init', { method: 'POST', headers, body: JSON.stringify({ ...body, code }) }));
      if (response.status !== 409) return response;
    }
    return json({ error: 'Could not create the quiz. Please retry.', code: 'QUIZ_CREATE_FAILED' }, 503);
  }
  const stub = env.BATTLE_ROOMS.get(env.BATTLE_ROOMS.idFromName(`know-me:${match![1]!}`));
  return stub.fetch(new Request(`https://know-me.internal/know-me/${match![2]}`, { method: 'POST', headers, body: JSON.stringify(body) }));
}
