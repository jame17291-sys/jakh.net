import catalog from './know-me-catalog.json' with { type: 'json' };
import { ApiError } from './http.js';

export const KNOW_ME_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/u;
export const KNOW_ME_CODE_PATTERN = /^[A-HJ-NP-Z2-9]{12}$/u;
export const KNOW_ME_STORAGE_KEY = 'know-me-room';
export const KNOW_ME_TTL_MS = 7 * 24 * 60 * 60_000;
export const KNOW_ME_MAX_PLAYERS = 50;
export const KNOW_ME_QUESTION_COUNT = 10;

export interface KnowMeQuestion {
  id: string;
  question: { en: string; ar: string };
  options: { en: string[]; ar: string[] };
}
interface CanonicalQuestion {
  id: string;
  text: { en: string; ar: string };
  options: { en: string; ar: string }[];
}
export interface KnowMePlayer {
  id: string;
  name: string;
  tokenHash: string;
  score: number;
  submittedAt: number;
}
export interface KnowMeState {
  kind: 'know-me';
  code: string;
  lang: 'en' | 'ar';
  ownerName: string;
  ownerTokenHash: string;
  questions: KnowMeQuestion[];
  answers: number[];
  players: KnowMePlayer[];
  createdAt: number;
  expiresAt: number;
}
const questions = new Map<string, CanonicalQuestion>((catalog as { questions: CanonicalQuestion[] }).questions.map(question => [question.id, question]));

export function cleanKnowMeName(input: unknown): string {
  if (typeof input !== 'string') return '';
  const value = input.normalize('NFKC').replace(/[\u0000-\u001f\u007f-\u009f\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069]/gu, '').trim().replace(/\s+/gu, ' ');
  return value && [...value].length <= 24 && !/[<>]/u.test(value) ? value : '';
}

export function validateKnowMeAnswers(input: unknown): number[] {
  if (!Array.isArray(input) || input.length !== KNOW_ME_QUESTION_COUNT || input.some(answer => !Number.isInteger(answer) || answer < 0 || answer > 3)) {
    throw new ApiError(400, 'Answer all ten questions.', undefined, 'INVALID_QUIZ_ANSWERS');
  }
  return [...input] as number[];
}

export function buildKnowMeSelection(input: unknown): { questions: KnowMeQuestion[]; answers: number[] } {
  if (!Array.isArray(input) || input.length !== KNOW_ME_QUESTION_COUNT) throw new ApiError(400, 'Choose ten different questions.', undefined, 'INVALID_QUIZ_QUESTIONS');
  const selected: KnowMeQuestion[] = [];
  const answers: unknown[] = [];
  const seen = new Set<string>();
  for (const item of input) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) throw new ApiError(400, 'Choose ten different questions.', undefined, 'INVALID_QUIZ_QUESTIONS');
    const { id, answerIndex } = item as { id?: unknown; answerIndex?: unknown };
    const canonical = typeof id === 'string' ? questions.get(id) : undefined;
    if (!canonical || seen.has(canonical.id)) throw new ApiError(400, 'Choose ten different questions.', undefined, 'INVALID_QUIZ_QUESTIONS');
    seen.add(canonical.id);
    selected.push({ id: canonical.id, question: { ...canonical.text }, options: { en: canonical.options.map(option => option.en), ar: canonical.options.map(option => option.ar) } });
    answers.push(answerIndex);
  }
  return { questions: selected, answers: validateKnowMeAnswers(answers) };
}

export function knowMeSnapshot(room: KnowMeState, tokenHash: string) {
  const ordered = [...room.players].sort((a, b) => b.score - a.score || a.submittedAt - b.submittedAt || a.id.localeCompare(b.id));
  const leaderboard = ordered.map(player => ({ id: player.id, name: player.name, score: player.score, rank: ordered.findIndex(candidate => candidate.score === player.score) + 1 }));
  const ownResult = leaderboard.find(player => room.players.find(candidate => candidate.id === player.id)?.tokenHash === tokenHash);
  return {
    code: room.code, lang: room.lang, ownerName: room.ownerName, expiresAt: room.expiresAt,
    questions: room.questions, leaderboard,
    role: tokenHash === room.ownerTokenHash ? 'owner' : ownResult ? 'player' : 'guest',
    result: ownResult ? { score: ownResult.score, total: KNOW_ME_QUESTION_COUNT, rank: ownResult.rank } : null,
  };
}
