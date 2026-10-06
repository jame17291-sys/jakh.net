export const PARTY_ROUTES = Object.freeze({ mostLikely: 'most-likely-to', knowMe: 'how-well-do-you-know-me' });
export const partyPath = (game, lang = 'en') => lang === 'ar' ? `/ar/games/${PARTY_ROUTES[game]}/` : `/${PARTY_ROUTES[game]}`;
export const escapeParty = value => String(value ?? '').replace(/[&<>"']/gu, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
export function cleanPartyName(value) {
  if (typeof value !== 'string') return null;
  const name = value.normalize('NFKC').replace(/\s+/gu, ' ').trim();
  return name && name.length <= 24 && !/[<>&\p{Cc}\p{Cf}]/u.test(name) ? name : null;
}
export function partyNames(value) {
  const names = String(value).split(/[\n,،]/u).map(v => v.trim()).filter(Boolean).map(cleanPartyName);
  if (names.length < 2 || names.length > 12 || names.some(v => !v) || new Set(names.map(v => v.toLocaleLowerCase())).size !== names.length) throw Error('names');
  return names;
}
export function shuffleParty(items, random = Math.random) {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) { const j = Math.floor(random() * (i + 1)); [result[i], result[j]] = [result[j], result[i]]; }
  return result;
}
export function validatePartyData(data) {
  if (data?.version !== 1) throw Error('data');
  for (const key of ['mostLikely', 'knowMe']) {
    const group = data[key];
    if (!Array.isArray(group?.packs) || !Array.isArray(group.questions) || group.questions.length < 20) throw Error('data');
    const packs = new Set(group.packs.map(p => p.id)), ids = new Set();
    for (const q of group.questions) {
      if (!/^[a-z0-9-]{3,80}$/u.test(q.id) || ids.has(q.id) || !packs.has(q.pack) || !q.text?.en?.trim() || !q.text?.ar?.trim()) throw Error('data');
      ids.add(q.id);
      if (key === 'knowMe' && (q.options?.length !== 4 || q.options.some(o => !o.en?.trim() || !o.ar?.trim()))) throw Error('data');
    }
  }
  return data;
}
export function createMostLikely(data, { names, pack = 'all', rounds = 10, mode = 'point' }, random = Math.random) {
  const players = partyNames(names);
  if (![10, 15, 20].includes(rounds) || !['point', 'vote'].includes(mode)) throw Error('settings');
  const questions = data.mostLikely.questions.filter(q => pack === 'all' || q.pack === pack);
  if (questions.length < rounds) throw Error('pack');
  return { players, questions: shuffleParty(questions, random).slice(0, rounds), mode, index: 0, phase: 'question', voter: 0, votes: [], selected: [], scores: players.map(() => 0), history: [] };
}
export function startPartyVoting(round) {
  if (round.phase !== 'question') return;
  round.phase = round.mode === 'vote' ? 'handoff' : 'point';
}
export function readyPartyVoter(round) { if (round.phase === 'handoff') round.phase = 'voting'; }
export function castPartyVote(round, index) {
  if (round.phase !== 'voting' || !Number.isInteger(index) || index < 0 || index >= round.players.length) return false;
  round.votes.push(index);
  round.voter++;
  if (round.voter < round.players.length) round.phase = 'handoff';
  else {
    const counts = round.players.map((_, i) => round.votes.filter(v => v === i).length), high = Math.max(...counts);
    finishPartyQuestion(round, counts.flatMap((v, i) => v === high ? [i] : []), counts);
  }
  return true;
}
export function finishPartyQuestion(round, selected = [], counts = null) {
  if (!['point', 'voting', 'question', 'handoff'].includes(round.phase)) return false;
  const winners = [...new Set(selected)].filter(i => Number.isInteger(i) && i >= 0 && i < round.players.length);
  winners.forEach(i => round.scores[i]++);
  round.selected = winners;
  round.history.push({ id: round.questions[round.index].id, winners, counts, skipped: winners.length === 0 });
  round.phase = 'reveal';
  round.votes = []; // Private individual ballots do not remain in the round.
  return true;
}
export function nextPartyQuestion(round) {
  if (round.phase !== 'reveal') return;
  round.index++;
  round.voter = 0; round.votes = []; round.selected = [];
  round.phase = round.index >= round.questions.length ? 'finished' : 'question';
}
export function createKnowMeDraft(data, pack = 'all', random = Math.random) {
  const questions = data.knowMe.questions.filter(q => pack === 'all' || q.pack === pack);
  if (questions.length < 10) throw Error('pack');
  return { questions: shuffleParty(questions, random).slice(0, 10), answers: Array(10).fill(null), index: 0, seen: new Set(), pack };
}
export function replaceKnowMeQuestion(draft, data, random = Math.random) {
  const used = new Set([...draft.questions.map(q => q.id), ...draft.seen]);
  let candidates = data.knowMe.questions.filter(q => (draft.pack === 'all' || q.pack === draft.pack) && !used.has(q.id));
  if (!candidates.length) { draft.seen.clear(); candidates = data.knowMe.questions.filter(q => (draft.pack === 'all' || q.pack === draft.pack) && !draft.questions.some(chosen => chosen.id === q.id)); }
  if (!candidates.length) return false;
  draft.seen.add(draft.questions[draft.index].id);
  draft.questions[draft.index] = shuffleParty(candidates, random)[0];
  draft.answers[draft.index] = null;
  return true;
}
export function quizCreationPayload(draft, name, lang, token) {
  const clean = cleanPartyName(name);
  if (!clean || !['en', 'ar'].includes(lang) || !/^[A-Za-z0-9_-]{43}$/u.test(token)) throw Error('name');
  if (draft.answers.length !== 10 || draft.answers.some(a => !Number.isInteger(a) || a < 0 || a > 3)) throw Error('answers');
  return { token, name: clean, lang, questions: draft.questions.map((q, i) => ({ id: q.id, answerIndex: draft.answers[i] })) };
}
export function validQuizCode(code) { return typeof code === 'string' && /^[A-HJ-NP-Z2-9]{12}$/u.test(code); }
export function validQuizToken(token) { return typeof token === 'string' && /^[A-Za-z0-9_-]{43}$/u.test(token); }
export function newQuizToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes)).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
}
