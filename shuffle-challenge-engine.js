// Pure round logic for Shuffle Challenge. The page module owns rendering and
// storage; everything here is deterministic given `random`, so it is testable.
export const ROUND_SIZE = 10;
export const LEVELS = Object.freeze(['mixed', 'easy', 'medium', 'hard', 'very-advanced']);
export const RESULTS = Object.freeze(['knew', 'missed', 'skipped']);
export const SEEN_LIMIT = 300;
const CARD_LEVELS = new Set(LEVELS.filter(level => level !== 'mixed'));
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;

// Card levels a topic never plays at, whatever its cards say. Kids Riddles is
// for children, so it stays out of Very advanced rounds (and its cards never
// stand in for that level in Mixed rounds).
export const EXCLUDED_TOPIC_LEVELS = Object.freeze({ 'kids-riddles': Object.freeze(['very-advanced']) });

export function normalizeLevel(value) { return LEVELS.includes(value) ? value : 'mixed'; }

export function topicAllowsLevel(slug, difficulty) {
  return CARD_LEVELS.has(difficulty) && !(EXCLUDED_TOPIC_LEVELS[slug] || []).includes(difficulty);
}

export function shuffle(items, random = Math.random) {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

// `index` is the public card index ({ id: [topicSlug, difficulty] }), already
// projected to publishable cards. `topics` is the allowed set of topic slugs.
// A topic gets a pool only when it has at least one card it may play at the
// chosen level, so a round never draws a topic at a level it cannot fill.
export function poolsByTopic(index, level, topics) {
  const allowed = new Set(topics), wanted = normalizeLevel(level), pools = new Map();
  for (const [id, entry] of Object.entries(index || {})) {
    if (!Array.isArray(entry)) continue;
    const [slug, difficulty] = entry;
    if (!allowed.has(slug) || !topicAllowsLevel(slug, difficulty)) continue;
    if (wanted !== 'mixed' && difficulty !== wanted) continue;
    if (!pools.has(slug)) pools.set(slug, []);
    pools.get(slug).push(id);
  }
  return pools;
}

// One card per topic, so a round always visits ROUND_SIZE different topics.
// Recently seen cards are avoided while a topic still has unseen ones.
export function planRound({ index, topics, level, seen = [], size = ROUND_SIZE, random = Math.random }) {
  const pools = poolsByTopic(index, level, topics), recent = new Set(seen), items = [];
  for (const slug of shuffle([...pools.keys()], random)) {
    if (items.length >= size) break;
    const ids = pools.get(slug), fresh = ids.filter(id => !recent.has(id)), choices = fresh.length ? fresh : ids;
    items.push({ slug, id: choices[Math.floor(random() * choices.length)], result: null });
  }
  return { v: 1, level: normalizeLevel(level), items, position: 0, revealed: false };
}

// Pick another card from the same topic when the planned one is no longer
// available (for example withdrawn after a Content Studio review).
export function replacementId(cards, { level, exclude = [], random = Math.random, slug = '' }) {
  const wanted = normalizeLevel(level), skip = new Set(exclude);
  const options = (Array.isArray(cards) ? cards : []).filter(card => card && typeof card.id === 'string'
    && !skip.has(card.id) && (wanted === 'mixed' || card.difficulty === wanted)
    && (!slug || topicAllowsLevel(slug, card.difficulty)));
  return options.length ? options[Math.floor(random() * options.length)].id : null;
}

export function restoreRound(value, isUnavailable = () => false) {
  if (!value || typeof value !== 'object' || value.v !== 1 || !Array.isArray(value.items)) return null;
  const items = value.items
    .filter(item => item && SLUG.test(item.slug) && typeof item.id === 'string' && SLUG.test(item.id)
      && !isUnavailable({ cardId: item.id, categorySlug: item.slug }))
    .slice(0, ROUND_SIZE)
    .map(item => ({ slug: item.slug, id: item.id, result: RESULTS.includes(item.result) ? item.result : null }));
  if (!items.length) return null;
  const firstOpen = items.findIndex(item => !item.result);
  const position = firstOpen === -1 ? items.length : firstOpen;
  return { v: 1, level: normalizeLevel(value.level), items, position, revealed: position < items.length && value.revealed === true };
}

export function reveal(round) { return isFinished(round) ? round : { ...round, revealed: true }; }

export function answerCard(round, result) {
  if (isFinished(round) || !RESULTS.includes(result)) return round;
  const items = round.items.map((item, i) => i === round.position ? { ...item, result } : item);
  return { ...round, items, position: round.position + 1, revealed: false };
}

export function replaceCurrent(round, id) {
  if (isFinished(round) || typeof id !== 'string') return round;
  return { ...round, items: round.items.map((item, i) => i === round.position ? { ...item, id } : item) };
}

// Card ids are stable across topic moves; follow a planned card to the topic
// that holds it now.
export function retopicCurrent(round, slug) {
  if (isFinished(round) || typeof slug !== 'string' || !SLUG.test(slug)) return round;
  return { ...round, items: round.items.map((item, i) => i === round.position ? { ...item, slug } : item) };
}

export function isFinished(round) { return !round || round.position >= round.items.length; }

export function roundScore(round) {
  const items = round?.items || [];
  const count = result => items.filter(item => item.result === result).length;
  return { knew: count('knew'), missed: count('missed'), skipped: count('skipped'), total: items.length };
}

export function rememberSeen(seen, ids, limit = SEEN_LIMIT) {
  const list = Array.isArray(seen) ? seen.filter(id => typeof id === 'string') : [];
  const next = [...list.filter(id => !ids.includes(id)), ...ids];
  return next.slice(Math.max(0, next.length - limit));
}

export function updateBest(bests, level, knew) {
  const clean = bests && typeof bests === 'object' && !Array.isArray(bests) ? bests : {};
  const key = normalizeLevel(level), previous = Number.isInteger(clean[key]) ? clean[key] : 0;
  return { ...clean, [key]: Math.max(previous, Math.max(0, Math.min(ROUND_SIZE, knew | 0))) };
}

// --- Streak and shareable recap -------------------------------------------
// A streak counts consecutive local calendar days with at least one finished
// round. It lives only in this browser (no account, nothing sent anywhere).
// `today` is a YYYY-MM-DD string in local time so the day boundary follows
// the player's clock, not UTC.
const DAY = /^\d{4}-\d{2}-\d{2}$/u;

export function localDay(date = new Date()) {
  const pad = n => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function dayNumber(day) { return Math.round(Date.UTC(+day.slice(0, 4), +day.slice(5, 7) - 1, +day.slice(8, 10)) / 86_400_000); }

export function restoreStreak(value) {
  if (!value || typeof value !== 'object' || value.v !== 1) return { v: 1, count: 0, last: null, best: 0 };
  const count = Number.isInteger(value.count) && value.count > 0 ? value.count : 0;
  const last = typeof value.last === 'string' && DAY.test(value.last) ? value.last : null;
  const best = Number.isInteger(value.best) && value.best > 0 ? value.best : 0;
  return { v: 1, count: last ? count : 0, last, best: Math.max(best, last ? count : 0) };
}

// Called once per finished round. A second round on the same day keeps the
// count; a round the day after extends it; a longer gap starts again at 1.
export function recordStreakDay(streak, today = localDay()) {
  const clean = restoreStreak(streak);
  if (!DAY.test(today)) return clean;
  let count = 1;
  if (clean.last === today) count = clean.count || 1;
  else if (clean.last && dayNumber(today) - dayNumber(clean.last) === 1) count = clean.count + 1;
  return { v: 1, count, last: today, best: Math.max(clean.best, count) };
}

// What the streak is worth right now: unchanged if played today or yesterday,
// otherwise it has lapsed and shows as 0 until the next finished round.
export function currentStreak(streak, today = localDay()) {
  const clean = restoreStreak(streak);
  if (!clean.last || !DAY.test(today)) return 0;
  const gap = dayNumber(today) - dayNumber(clean.last);
  return gap === 0 || gap === 1 ? clean.count : 0;
}

export const SHARE_REF = 'shuffle-share';
const RESULT_GLYPH = { knew: '🟩', missed: '🟥', skipped: '⬜' };

// Plain text in the Wordle-grid style: a headline, one glyph per card, and the
// public link with a ref parameter so return visits are visible in server
// logs without any identity. No topic names: the grid should spoil nothing.
// `streakLabel` arrives already localised (Arabic counted nouns live in the
// page module), and is left out when empty.
export function shareText(round, { lang = 'en', streakLabel = '', levelLabel = '', url = 'https://riddlearabia.com/daily', today = localDay() } = {}) {
  const score = roundScore(round);
  const grid = (round?.items || []).map(item => RESULT_GLYPH[item.result] || RESULT_GLYPH.skipped).join('');
  const link = new URL(url);
  link.searchParams.set('ref', SHARE_REF);
  const title = lang === 'ar' ? 'خلطة ريدل أرابيا' : 'Riddle Arabia Shuffle';
  const lines = [`${title} ${today}${levelLabel ? ` · ${levelLabel}` : ''}`, `${score.knew}/${score.total}`, grid, streakLabel ? `🔥 ${streakLabel}` : '', link.href];
  return lines.filter(Boolean).join('\n');
}
