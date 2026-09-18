/**
 * Pure helpers for the Akshifha case collection.
 * Progress is deliberately local and unverified: it is never a leaderboard,
 * competitive score, streak, or proof that somebody solved a case.
 */
export const PUBLIC_ORIGIN = 'https://riddlearabia.com';
export const PROGRESS_VERSION = 1;
export const MAX_PROGRESS_CASES = 11;
const DAY_MS = 86_400_000;
const MAX_ATTEMPTS = 999;
const RESERVED_IDS = new Set(['constructor', 'prototype', '__proto__']);

function safeId(value) {
  return typeof value === 'string'
    && value.length <= 80
    && /^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(value)
    && !RESERVED_IDS.has(value);
}

function usableCases(cases) {
  if (!Array.isArray(cases)) return [];
  const seen = new Set();
  return cases.filter(item => {
    if (!item || !safeId(item.id) || seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
}

export function isValidDay(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/u.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function utcDay(now = new Date()) {
  let date;
  try {
    date = now instanceof Date ? new Date(now.getTime()) : new Date(now);
  } catch {
    date = new Date();
  }
  if (!Number.isFinite(date.getTime())) date = new Date();
  const day = date.toISOString().slice(0, 10);
  return isValidDay(day) ? day : new Date().toISOString().slice(0, 10);
}

/** The finite casebook repeats openly; this is not a claim of fresh daily content. */
export function chooseDailyCase(cases, now = new Date()) {
  const available = usableCases(cases);
  if (!available.length) return null;
  const dayNumber = Math.floor(new Date(`${utcDay(now)}T00:00:00.000Z`).getTime() / DAY_MS);
  return available[((dayNumber % available.length) + available.length) % available.length];
}

/**
 * An explicit, valid case ID pins a friend challenge to the same puzzle even
 * after midnight. `mode=practice` also supports an explicit practice case.
 * A day alone selects that day's daily puzzle. Ambiguous/malformed inputs are
 * reported to the UI and fall back safely; query scores/answers are never read.
 */
export function resolveCase(cases, search = '', now = new Date()) {
  const today = utcDay(now);
  let params;
  let invalidLink = false;
  try {
    if (search instanceof URLSearchParams) params = new URLSearchParams(search);
    else if (typeof search === 'string') params = new URLSearchParams(search);
    else {
      params = new URLSearchParams();
      invalidLink = true;
    }
  } catch {
    params = new URLSearchParams();
    invalidLink = true;
  }
  const dayValues = params.getAll('day');
  const validDay = dayValues.length === 1 && isValidDay(dayValues[0]);
  if (dayValues.length && !validDay) invalidLink = true;
  const day = validDay ? dayValues[0] : today;
  const caseValues = params.getAll('case');
  const available = usableCases(cases);
  const pinned = caseValues.length === 1 ? available.find(item => item.id === caseValues[0]) : null;
  if (caseValues.length && !pinned) invalidLink = true;
  const modeValues = params.getAll('mode');
  if (modeValues.length > 1 || (modeValues.length === 1 && !['practice', 'daily'].includes(modeValues[0]))) {
    invalidLink = true;
  }
  const practice = modeValues.length === 1 && modeValues[0] === 'practice' && (!caseValues.length || pinned);
  const mode = practice ? 'practice' : (pinned ? 'challenge' : 'daily');
  return {
    caseItem: pinned || chooseDailyCase(available, `${day}T00:00:00.000Z`),
    mode,
    day,
    invalidLink,
  };
}

/** A valid submission requires exactly two different, known evidence IDs. */
export function evaluateAnswer(caseItem, evidenceIds, optionId) {
  const invalid = { valid: false, correct: false };
  if (!caseItem || !Array.isArray(caseItem.evidence) || !Array.isArray(caseItem.options)
    || !Array.isArray(evidenceIds) || evidenceIds.length !== 2
    || !evidenceIds.every(id => typeof id === 'string')
    || new Set(evidenceIds).size !== 2 || typeof optionId !== 'string') return invalid;
  const availableEvidence = new Set(caseItem.evidence.map(item => item?.id));
  const availableOptions = new Set(caseItem.options.map(item => item?.id));
  const solution = caseItem.solution;
  if (!evidenceIds.every(id => availableEvidence.has(id)) || !availableOptions.has(optionId)
    || !solution || !Array.isArray(solution.evidenceIds) || solution.evidenceIds.length !== 2
    || new Set(solution.evidenceIds).size !== 2
    || !solution.evidenceIds.every(id => typeof id === 'string' && availableEvidence.has(id))
    || !availableOptions.has(solution.optionId)) return invalid;
  return {
    valid: true,
    correct: optionId === solution.optionId && evidenceIds.every(id => solution.evidenceIds.includes(id)),
  };
}

function normalizedResult(result) {
  if (!result || typeof result !== 'object' || Array.isArray(result)
    || !Number.isInteger(result.attempts) || result.attempts < 0 || result.attempts > MAX_ATTEMPTS
    || !Number.isInteger(result.hintsUsed) || result.hintsUsed < 0 || result.hintsUsed > 2
    || typeof result.revealed !== 'boolean'
    || (!result.revealed && result.attempts === 0)
    || result.correct === false || result.valid === false) return null;
  return { attempts: result.attempts, hintsUsed: result.hintsUsed, revealed: result.revealed };
}

/** Labels describe a personal result, never a verified rank against others. */
export function resultRank(result = {}) {
  const clean = normalizedResult(result);
  if (!clean) return 'in-progress';
  if (clean.revealed) return 'revealed';
  return clean.hintsUsed ? 'assisted' : 'solved';
}

/**
 * Share targets are fixed to the public site. Preview hosts, userinfo, paths,
 * lookalike hosts, and arbitrary origins can never leak into shared links.
 */
export function buildChallengeUrl({ origin = PUBLIC_ORIGIN, language = 'ar', caseId, day } = {}) {
  if (!safeId(caseId)) return null;
  const base = origin === PUBLIC_ORIGIN ? origin : PUBLIC_ORIGIN;
  const url = new URL(language === 'ar' ? '/ar/games/akshifha/' : '/akshifha', base);
  url.searchParams.set('case', caseId);
  if (isValidDay(day)) url.searchParams.set('day', day);
  return url.href;
}

/** Intentionally omits titles, evidence, solutions, and answer-bearing text. */
export function buildShareText({ language = 'ar', attempts, hintsUsed, revealed, correct, valid } = {}) {
  const result = { attempts, hintsUsed, revealed, correct, valid };
  const rank = resultRank(result);
  if (language === 'ar') {
    if (rank === 'revealed') return 'اكشفها · قرأت تفسير القضية. هل تستطيع حلها؟';
    if (rank === 'in-progress') return 'اكشفها · دليلان، استنتاج واحد. جرّب هذه القضية المجانية.';
    return `اكشفها · حللت القضية! المحاولات: ${attempts} · التلميحات: ${hintsUsed}. هل تستطيع حلها؟`;
  }
  if (rank === 'revealed') return 'Akshifha · I read the explanation. Can you solve the case?';
  if (rank === 'in-progress') return 'Akshifha · Two clues, one conclusion. Try this free case.';
  return `Akshifha · I solved the case in ${attempts} attempt${attempts === 1 ? '' : 's'}, using ${hintsUsed} hint${hintsUsed === 1 ? '' : 's'}. Can you solve it?`;
}

function allowedIds(values) {
  if (!Array.isArray(values)) return null;
  return new Set(values.map(value => typeof value === 'string' ? value : value?.id).filter(safeId));
}

function emptyProgress() {
  return { version: PROGRESS_VERSION, cases: {} };
}

/**
 * Tolerates damaged localStorage. Pass the authored CASES array (or IDs) to
 * discard unknown content. At most eleven personal completion records survive.
 * No imported score, streak, rank, timestamp, or extra property is trusted.
 */
export function sanitizeProgress(input, caseIds) {
  const clean = emptyProgress();
  try {
    const value = typeof input === 'string' && input.length <= 32_768 ? JSON.parse(input) : input;
    if (!value || typeof value !== 'object' || Array.isArray(value) || value.version !== PROGRESS_VERSION
      || !value.cases || typeof value.cases !== 'object' || Array.isArray(value.cases)) return clean;
    const allow = allowedIds(caseIds);
    for (const [id, record] of Object.entries(value.cases)) {
      if (!safeId(id) || (allow && !allow.has(id)) || !record || record.completed !== true) continue;
      const result = normalizedResult(record);
      if (!result) continue;
      clean.cases[id] = { completed: true, ...result };
      if (Object.keys(clean.cases).length === MAX_PROGRESS_CASES) break;
    }
  } catch {
    return emptyProgress();
  }
  return clean;
}

function isBetterResult(next, previous) {
  if (next.revealed !== previous.revealed) return !next.revealed;
  if (next.hintsUsed !== previous.hintsUsed) return next.hintsUsed < previous.hintsUsed;
  return next.attempts < previous.attempts;
}

/** Replays cannot add completions or replace a better personal result. */
export function recordCompletion(previous, caseId, result, caseIds) {
  const clean = sanitizeProgress(previous, caseIds);
  const allow = allowedIds(caseIds);
  if (!safeId(caseId) || (allow && !allow.has(caseId))) return clean;
  const next = normalizedResult(result);
  if (!next) return clean;
  const existing = clean.cases[caseId];
  if (existing && !isBetterResult(next, existing)) return clean;
  if (!existing && Object.keys(clean.cases).length >= MAX_PROGRESS_CASES) {
    delete clean.cases[Object.keys(clean.cases)[0]];
  }
  clean.cases[caseId] = { completed: true, ...next };
  return clean;
}

/** Prefer the next uncompleted case; after all cases, offer an honest replay. */
export function selectNextCase(cases, currentCaseId, progress) {
  const available = usableCases(cases);
  if (!available.length) return null;
  const completed = sanitizeProgress(progress, available).cases;
  const index = available.findIndex(item => item.id === currentCaseId);
  for (let offset = 1; offset <= available.length; offset += 1) {
    const candidate = available[(index + offset) % available.length];
    if (!completed[candidate.id]) return candidate;
  }
  return available[(index + 1) % available.length];
}

/** A returning player can explicitly continue a partially explored casebook. */
export function selectContinuationCase(cases, currentCaseId, progress) {
  const available = usableCases(cases);
  const clean = sanitizeProgress(progress, available);
  const completedCount = Object.keys(clean.cases).length;
  if (completedCount === 0 || completedCount === available.length) return null;
  return selectNextCase(available, currentCaseId, clean);
}
