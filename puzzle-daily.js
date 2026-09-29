import { puzzleURL } from './puzzle-routes.js';
import { PUZZLES, dayKey, seedFor, storageKey } from './puzzle-catalog.js';

export const DAILY_GAMES = PUZZLES.filter(p => !['bonus', 'duel'].includes(p.id));
export const ACTIVITY_KEY = 'ra-puzzle-activity-v1';
export const COLLECTION_SIZE = 30;
export const FIRST_PUZZLE_DAY = '2026-09-29';
const DAY_MS = 86400000;
const WORD_GAMES = new Set(['word', 'hive', 'links', 'trails', 'letter-square']);
const GAME_IDS = new Set(DAILY_GAMES.map(p => p.id));
export function validDay(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}
export function previousDay(value) { return new Date(Date.parse(`${value}T00:00:00Z`) - DAY_MS).toISOString().slice(0, 10); }
export function requestedDay(value, today = dayKey()) {
  return validDay(value) && value >= FIRST_PUZZLE_DAY && value <= today ? value : today;
}
export function dailyIndex(day, game, variant = 'standard') {
  const ordinal = Math.floor(Date.parse(`${day}T00:00:00Z`) / DAY_MS);
  return (ordinal + seedFor(`${game}:${variant}:edition-2`) % COLLECTION_SIZE) % COLLECTION_SIZE;
}
export function progressKey(game, lang, day, variant = 'standard') {
  const original = storageKey(game, lang, day, variant);
  return WORD_GAMES.has(game) ? original.replace('ra-puzzles-v1:', 'ra-puzzles-v2:') : original;
}
export function sudokuDifficulty(value) { return ['easy', 'medium', 'hard'].includes(value) ? value : null; }
export function sudokuProgressKey(base, difficulty) {
  const level = sudokuDifficulty(difficulty);
  if (!level) throw new Error('Invalid Sudoku difficulty');
  return `${base}:difficulty:${level}`;
}
// Keep the original key as the last-played board for compatibility. Each level
// has its own slot, so a shared link or difficulty switch cannot discard another.
export function createSudokuProgress(store, base, requested) {
  const previous = store.read(base);
  const oldLevel = sudokuDifficulty(previous?.difficulty);
  if (oldLevel && store.read(sudokuProgressKey(base, oldLevel)) === null) store.save(sudokuProgressKey(base, oldLevel), previous);
  let level = sudokuDifficulty(requested) || oldLevel || 'medium';
  const read = fallback => store.read(sudokuProgressKey(base, level)) ?? structuredClone(fallback);
  return {
    get difficulty() { return level; },
    get key() { return sudokuProgressKey(base, level); },
    read,
    select(difficulty, fallback = {}) { const next = sudokuDifficulty(difficulty); if (!next) throw new Error('Invalid Sudoku difficulty'); level = next; return read(fallback); },
    save(state) {
      const next = sudokuDifficulty(state?.difficulty); if (!next) throw new Error('Invalid Sudoku difficulty');
      level = next; store.save(sudokuProgressKey(base, level), state); store.save(base, state);
    },
    reset() {
      store.reset(sudokuProgressKey(base, level));
      if (store.read(base)?.difficulty === level) store.reset(base);
    },
  };
}
export function resetCountdown(now = new Date()) {
  const today = dayKey(now), midnight = Date.parse(`${today}T00:00:00+04:00`) + DAY_MS;
  const minutes = Math.max(0, Math.ceil((midnight - now.getTime()) / 60000));
  return { hours: Math.floor(minutes / 60), minutes: minutes % 60, at: new Date(midnight).toISOString() };
}
export function cleanActivity(value, today = dayKey()) {
  const days = {};
  if (!value || typeof value !== 'object' || Array.isArray(value)) return { version: 1, days };
  const cutoff = new Date(Date.parse(`${today}T00:00:00Z`) - 399 * DAY_MS).toISOString().slice(0, 10);
  for (const [date, entries] of Object.entries(value.days || {})) {
    if (!validDay(date) || date > today || date < cutoff || !entries || typeof entries !== 'object' || Array.isArray(entries)) continue;
    const accepted = {};
    for (const [key, entry] of Object.entries(entries)) {
      if (!entry || !GAME_IDS.has(entry.game) || !['en', 'ar'].includes(entry.lang) || key !== `${entry.lang}:${entry.game}`) continue;
      accepted[key] = { game: entry.game, lang: entry.lang, assisted: entry.assisted === true };
    }
    if (Object.keys(accepted).length) days[date] = accepted;
  }
  return { version: 1, days };
}
export function recordCompletion(value, { game, lang, date, variant = 'standard', assisted = false }, today = dayKey()) {
  const activity = cleanActivity(value, today);
  // An archived puzzle never retroactively fills a missed day or earns today's streak.
  if (date !== today || variant !== 'standard' || !GAME_IDS.has(game) || !['en', 'ar'].includes(lang)) return activity;
  activity.days[date] ||= {};
  const key = `${lang}:${game}`;
  activity.days[date][key] ||= { game, lang, assisted: assisted === true };
  return activity;
}
export function dailySummary(value, lang, today = dayKey()) {
  const activity = cleanActivity(value, today), dates = Object.keys(activity.days).sort();
  const completed = Object.values(activity.days[today] || {}).filter(entry => entry.lang === lang).map(entry => entry.game);
  let current = 0, cursor = activity.days[today] ? today : previousDay(today), best = 0, run = 0, last = null;
  while (activity.days[cursor]) { current++; cursor = previousDay(cursor); }
  for (const date of dates) { run = last === previousDay(date) ? run + 1 : 1; best = Math.max(best, run); last = date; }
  return { completed, current, best, total: DAILY_GAMES.length, playedToday: !!activity.days[today] };
}
export function challengeURL({ game, lang, date, variant = 'standard', difficulty }, origin = 'https://riddlearabia.com') {
  if (!GAME_IDS.has(game) || !validDay(date) || !['en', 'ar'].includes(lang)) throw new Error('Invalid puzzle link');
  const url = new URL(puzzleURL(game, lang, {date, edition:'2'}, origin));
  if (variant !== 'standard') url.searchParams.set('variant', variant);
  if (game === 'sudoku') url.searchParams.set('difficulty', sudokuDifficulty(difficulty) || 'medium');
  return url.href;
}
function count(value, cap = 10000) { return Array.isArray(value) ? Math.min(value.length, cap) : 0; }
function number(value) { return Number.isFinite(value) ? Math.max(0, Math.min(Math.floor(value), 1000000)) : 0; }
export function resultText({ game, lang, date, variant = 'standard', difficulty }, state = {}, origin) {
  const entry = DAILY_GAMES.find(p => p.id === game);
  if (!entry) throw new Error('Unknown game');
  const ar = lang === 'ar', t = (en, arabic) => ar ? arabic : en;
  const solved = state.completed === true, ended = solved || state.finished === true;
  const lines = [t('Riddle Arabia', 'ريدل أرابيا'), `${entry.title[ar ? 1 : 0]} · ${date}`];
  const level = sudokuDifficulty(state.difficulty) || sudokuDifficulty(difficulty) || 'medium';
  if (game === 'sudoku') lines.push(t(`Difficulty: ${level}`, `المستوى: ${{easy:'سهل',medium:'متوسط',hard:'صعب'}[level]}`));
  if (solved) lines.push(t('✓ Solved', '✓ تم الحل'));
  else if (ended) lines.push(t('Today’s attempt complete', 'اكتملت محاولة اليوم'));
  else lines.push(t('Can you solve this puzzle?', 'هل تستطيع حل هذا اللغز؟'));
  if (ended) {
    if (game === 'word') lines.push(t(`${count(state.guesses, 6)}/${variant === 'clue' ? 5 : 6} guesses`, `${count(state.guesses, 6)}/${variant === 'clue' ? 5 : 6} محاولات`));
    if (game === 'links') lines.push(t(`${count(state.mistakes, 4)} mistakes`, `${count(state.mistakes, 4)} أخطاء`));
    if (game === 'hive') lines.push(t(`${count(state.found)} words found`, `${count(state.found)} كلمة مكتشفة`));
    if (game === 'letter-square') lines.push(t(`${count(state.chain)} words`, `${count(state.chain)} كلمات`));
    if (game === 'mosaic') lines.push(t(`${number(state.score)} points`, `${number(state.score)} نقطة`));
    if (['sudoku', 'trails', 'mosaic'].includes(game)) lines.push(t(`${number(state.hints ?? state.hintsUsed)} hints`, `${number(state.hints ?? state.hintsUsed)} تلميحات`));
    if (state.assisted || variant === 'clue' || variant === 'starter') lines.push(t('Played with help', 'بمساعدة'));
  }
  lines.push(t('Play the same puzzle:', 'جرّب اللغز نفسه:'), challengeURL({ game, lang, date, variant, difficulty: level }, origin));
  return lines.join('\n');
}
