export const ROUND_SIZE = 10;
export const QUESTION_SECONDS = 20;
export const SHOWS = [
  { id: 'friends', key: 'Friends', en: 'Friends', ar: 'فريندز', seasons: 10, genre: { en: 'Comedy', ar: 'كوميديا' } },
  { id: 'bab-al-hara', key: 'Bab Al-Hara', en: 'Bab Al-Hara', ar: 'باب الحارة', seasons: 13, genre: { en: 'Syrian drama', ar: 'دراما سورية' } },
  { id: 'breaking-bad', key: 'Breaking Bad', en: 'Breaking Bad', ar: 'بريكينغ باد', seasons: 5, genre: { en: 'Crime drama', ar: 'دراما وجريمة' } },
  { id: 'maraya', key: 'Maraya', en: 'Maraya', ar: 'مرايا', seasons: 0, genre: { en: 'Social comedy', ar: 'كوميديا اجتماعية' } },
  { id: 'stranger-things', key: 'Stranger Things', en: 'Stranger Things', ar: 'سترينجر ثينغز', seasons: 5, genre: { en: 'Sci-fi & mystery', ar: 'خيال علمي وغموض' } },
  { id: 'tash-ma-tash', key: 'Tash Ma Tash', en: 'Tash Ma Tash', ar: 'طاش ما طاش', seasons: 0, genre: { en: 'Saudi comedy', ar: 'كوميديا سعودية' } },
  { id: 'game-of-thrones', key: 'Game of Thrones', en: 'Game of Thrones', ar: 'صراع العروش', seasons: 8, genre: { en: 'Fantasy', ar: 'فانتازيا' } },
  { id: 'ertugrul', key: 'Diriliş: Ertuğrul', en: 'Diriliş: Ertuğrul', ar: 'قيامة أرطغرل', seasons: 5, genre: { en: 'Historical adventure', ar: 'مغامرات تاريخية' } },
  { id: 'the-wire', key: 'The Wire', en: 'The Wire', ar: 'ذا واير', seasons: 5, genre: { en: 'Crime drama', ar: 'دراما وجريمة' } },
  { id: 'al-hashasheen', key: 'Al-Hashasheen', en: 'Al-Hashasheen', ar: 'الحشاشين', seasons: 1, genre: { en: 'Historical drama', ar: 'دراما تاريخية' } },
];

// Seal every displayed field together: content edits require a fresh spoiler check.
export function contentKey(card) {
  const text = JSON.stringify([card.question?.en, card.question?.ar, card.answer?.en, card.answer?.ar,
    card.tvQuiz?.distractors?.en, card.tvQuiz?.distractors?.ar,
    card.tvQuiz?.explanation?.en, card.tvQuiz?.explanation?.ar, card.tvQuiz?.spoilerSeason]);
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return (h >>> 0).toString(16);
}

export function isPrepared(card) {
  const q = card?.tvQuiz;
  const text = value => typeof value === 'string' && value.trim().length > 0;
  return Boolean(q && q.version === 1 && q.contentKey === contentKey(card)
    && Number.isInteger(q.spoilerSeason) && q.spoilerSeason >= 0
    && SHOWS.some(s => s.key === card.subcategory?.en && q.spoilerSeason <= s.seasons)
    && ['en', 'ar'].every(lang => text(card.question?.[lang])
      && text(card.answer?.[lang]) && text(q.explanation?.[lang])
      && Array.isArray(q.distractors?.[lang]) && q.distractors[lang].length === 3
      && q.distractors[lang].every(v => typeof v === 'string' && v.trim())
      && new Set([card.answer[lang], ...q.distractors[lang]].map(v => v.trim().toLocaleLowerCase())).size === 4));
}

export function eligibleCards(cards, show = 'all', season = 0) {
  const selected = SHOWS.find(s => s.id === show || s.key === show);
  const limit = selected ? Math.max(0, Math.min(Number(season) || 0, selected.seasons)) : 0;
  return cards.filter(c => isPrepared(c) && (!selected || c.subcategory.en === selected.key)
    && c.tvQuiz.spoilerSeason <= limit);
}

export function shuffle(items, rng = Math.random) {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function createRound(cards, settings = {}, seen = [], rng = Math.random, now = Date.now()) {
  const show = SHOWS.find(s => s.id === settings.show || s.key === settings.show)?.id || 'all';
  const season = show === 'all' ? 0 : Math.max(0, Math.min(Number(settings.season) || 0, SHOWS.find(s => s.id === show).seasons));
  const pool = [...new Map(eligibleCards(cards, show, season).map(c => [c.id, c])).values()];
  if (pool.length < ROUND_SIZE) throw new Error('not-enough-questions');
  const seenIds = new Set(seen);
  const fresh = shuffle(pool.filter(c => !seenIds.has(c.id)), rng);
  const repeats = shuffle(pool.filter(c => seenIds.has(c.id)), rng);
  // Mixed rounds rotate through shows before using a second question from one show.
  const candidates = [...fresh, ...repeats];
  let selected = [];
  if (show === 'all') {
    for (const s of shuffle(SHOWS, rng)) {
      const card = candidates.find(c => c.subcategory.en === s.key);
      if (card) selected.push(card);
    }
  }
  selected = [...selected, ...candidates.filter(c => !selected.some(s => s.id === c.id))].slice(0, ROUND_SIZE);
  const difficulty = { easy: 0, medium: 1, hard: 2, 'very-advanced': 3 };
  selected.sort((a, b) => (difficulty[a.difficulty] ?? 1) - (difficulty[b.difficulty] ?? 1));
  return {
    version: 1, id: `${now}-${Math.floor(rng() * 1e9)}`, show, season,
    timed: settings.timed === true, index: 0, finished: false, startedAt: now,
    deadline: settings.timed ? now + QUESTION_SECONDS * 1000 : null,
    questions: selected.map(c => ({ id: c.id, key: c.tvQuiz.contentKey, order: shuffle([0, 1, 2, 3], rng) })),
    answers: [],
  };
}

export function remainingSeconds(round, now = Date.now()) {
  return round.timed && round.deadline ? Math.max(0, Math.ceil((round.deadline - now) / 1000)) : null;
}

export function answerRound(round, choice, now = Date.now()) {
  if (round.finished || round.answers[round.index]) return round;
  if (choice !== null && (!Number.isInteger(choice) || choice < 0 || choice > 3)) return round;
  const timedOut = round.timed && remainingSeconds(round, now) === 0;
  const selected = timedOut ? null : choice;
  return { ...round, answers: [...round.answers, { choice: selected, correct: selected === 0, timedOut }], deadline: null };
}

export function nextQuestion(round, now = Date.now()) {
  if (round.finished || !round.answers[round.index]) return round;
  if (round.index === round.questions.length - 1) return { ...round, finished: true, deadline: null };
  return { ...round, index: round.index + 1, deadline: round.timed ? now + QUESTION_SECONDS * 1000 : null };
}

export function restoreRound(raw, cards) {
  if (!raw || raw.version !== 1 || typeof raw.id !== 'string' || typeof raw.timed !== 'boolean'
    || typeof raw.finished !== 'boolean' || !Number.isInteger(raw.index) || raw.index < 0 || raw.index >= ROUND_SIZE
    || !Array.isArray(raw.questions) || raw.questions.length !== ROUND_SIZE || raw.questions.some(q => !q || typeof q.id !== 'string')
    || new Set(raw.questions.map(q => q.id)).size !== ROUND_SIZE
    || !Array.isArray(raw.answers) || raw.answers.length < raw.index || raw.answers.length > raw.index + 1
    || (raw.finished && (raw.index !== ROUND_SIZE - 1 || raw.answers.length !== ROUND_SIZE))) return null;
  if (raw.show !== 'all' && !SHOWS.some(s => s.id === raw.show)) return null;
  if (!Number.isInteger(raw.season) || raw.season < 0 || raw.season > (SHOWS.find(s => s.id === raw.show)?.seasons || 0)) return null;
  const allowed = new Map(eligibleCards(cards, raw.show, raw.season).map(c => [c.id, c]));
  if (raw.questions.some(q => !allowed.has(q.id) || allowed.get(q.id).tvQuiz.contentKey !== q.key
    || !Array.isArray(q.order) || q.order.length !== 4 || q.order.some(v => !Number.isInteger(v)) || [...q.order].sort().join(',') !== '0,1,2,3')) return null;
  if (raw.answers.some(a => !a || (a.choice !== null && ![0, 1, 2, 3].includes(a.choice)) || typeof a.timedOut !== 'boolean'
    || (a.timedOut && (!raw.timed || a.choice !== null)))) return null;
  const answered = raw.answers.length > raw.index;
  if (raw.timed && !answered && (!Number.isFinite(raw.deadline) || raw.deadline > Date.now() + QUESTION_SECONDS * 1000 + 1000)) return null;
  return { ...raw, answers: raw.answers.map(a => ({ ...a, correct: a.choice === 0 })), deadline: answered || !raw.timed ? null : raw.deadline };
}

export const roundScore = round => round.answers.filter(a => a.correct).length;
export const bestKey = round => `${round.show}:${round.season}:${round.timed ? 'timed' : 'relaxed'}`;
