import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const app = fs.readFileSync(new URL('../app.js', import.meta.url), 'utf8');
function functionSource(name) {
  const start = app.indexOf(`function ${name}(`);
  assert.ok(start >= 0, `missing ${name}`);
  return app.slice(start, app.indexOf('\n}', start) + 2);
}
const preparationFunctions = ['quickFireChoiceKey', 'quickFireCorrectKeys', 'preparedQuickFire'];
function loadFunctions(context, names) {
  vm.runInContext(names.map(functionSource).join('\n'), context);
  return context;
}
function card(id = 'card-1', difficulty = 'hard') {
  return {
    id, difficulty,
    question: { en: 'Which number is two plus three?', ar: 'ما ناتج جمع اثنين وثلاثة؟' },
    answer: { en: '5', ar: '5' },
    quickFire: {
      answer: { en: '5', ar: '٥' },
      distractors: { en: ['4', '6', '7'], ar: ['٤', '٦', '٧'] },
      explanation: { en: 'Two plus three equals five.', ar: 'جمع اثنين وثلاثة يساوي خمسة.' },
    },
  };
}

test('every public practice level reveals freely, even with exhausted legacy trial state', () => {
  const changes = [];
  const context = loadFunctions(vm.createContext({
    state: { dbUser: null, lang: 'en', flipped: new Set(), audioEnabled: false,
      categoryData: { title: { en: 'Practice', ar: 'تدريب' } } },
    safeStorageGet() { throw new Error('Legacy trial state must never be consulted'); },
    isFavorite: () => false, getProgressResult: () => null, t: key => key,
    escapeHtml: value => String(value), _activeAudioCardId: null,
    hapticTap() {}, trackEvent() {}, updateCardEl: id => changes.push(id),
  }), ['createCardMarkup', 'handleFlip']);
  for (const user of [null, { id: 'new-account' }]) {
    context.state.dbUser = user;
    for (const difficulty of ['easy', 'medium', 'hard', 'very-advanced']) {
      const sample = card(`${user ? 'user' : 'guest'}-${difficulty}`, difficulty);
      const markup = context.createCardMarkup(sample);
      assert.match(markup, /data-action="flip"/u);
      assert.match(markup, /card-answer/u);
      assert.doesNotMatch(markup, /paywall|is-locked|data-trial/u);
      context.handleFlip(sample.id, { dataset: { trial: '1' } });
      assert.ok(context.state.flipped.has(sample.id));
      context.handleFlip(sample.id, { dataset: { trial: '1' } });
      assert.equal(context.state.flipped.has(sample.id), false);
    }
  }
  assert.equal(changes.length, 16);
  assert.doesNotMatch(app, /jakh-trial-used|openPaywallModal|isLevelUnlocked|premium riddles|unlock Head Scratcher/u);
});

test('authored Quick Fire validation requires bilingual short unique choices and canonical answers', () => {
  const context = loadFunctions(vm.createContext({}), preparationFunctions);
  assert.ok(context.preparedQuickFire(card()));
  const mutations = [
    value => { delete value.quickFire; },
    value => { delete value.quickFire.distractors.ar; },
    value => { value.quickFire.distractors.en = ['4', '6']; },
    value => { value.quickFire.distractors.en[1] = ' 4 '; },
    value => { value.quickFire.distractors.ar[1] = '٤'; },
    value => { value.quickFire.distractors.en[0] = '５'; },
    value => { value.quickFire.answer.en = '7'; },
    value => { value.quickFire.answer.en = '-5'; },
    value => { value.quickFire.distractors.ar[0] = '5'; },
    value => { value.quickFire.explanation.ar = ' '; },
    value => { value.question.en = ''; },
    value => { value.quickFire.distractors.en[0] = 'x'.repeat(121); },
    value => { value.quickFire.distractors.en[0] = 'word '.repeat(21); },
    value => { value.quickFire.distractors.en[0] = {}; },
    value => { value.acceptedAnswers = { en: 'not an array' }; },
    value => { value.acceptedAnswers = { en: ['6'] }; },
  ];
  for (const mutate of mutations) {
    const candidate = card(); mutate(candidate);
    assert.equal(context.preparedQuickFire(candidate), null, String(mutate));
  }
  const alias = card();
  alias.answer.en = 'Five: the result of adding two and three.';
  alias.acceptedAnswers = { en: ['5'] };
  assert.ok(context.preparedQuickFire(alias));
  const words = card();
  words.answer.en = 'A towel.';
  words.quickFire.answer.en = 'The towel';
  assert.ok(context.preparedQuickFire(words));
  words.quickFire.distractors.en[0] = 'a TOWEL';
  assert.equal(context.preparedQuickFire(words), null);
});

test('choice normalization preserves mathematical signs, fractions and decimal distinctions', () => {
  const context = loadFunctions(vm.createContext({}), preparationFunctions);
  for (const [left, right] of [['-5', '5'], ['+5', '5'], ['1/2', '1 2'], ['1.5', '1 5'], ['50%', '50']]) {
    assert.notEqual(context.quickFireChoiceKey(left, 'en'), context.quickFireChoiceKey(right, 'en'));
  }
  for (const [left, right] of [['−5', '-5'], ['۱٫۵', '1.5'], ['١⁄٢', '1/2']]) {
    assert.equal(context.quickFireChoiceKey(left, 'ar'), context.quickFireChoiceKey(right, 'ar'));
  }
});

function quizHarness(cards = Array.from({ length: 5 }, (_, index) => card(`card-${index}`))) {
  const nodes = new Map();
  const intervals = new Map();
  const timeouts = new Map();
  const events = [];
  const marks = [];
  const shares = [];
  const challengeShares = [];
  let timerId = 0;
  class Element {
    constructor(id = '') {
      this.id = id; this.textContent = ''; this.style = {}; this.listeners = {};
      this.classes = new Set(); this.children = [];
      this.classList = { add: (...values) => values.forEach(value => this.classes.add(value)),
        remove: (...values) => values.forEach(value => this.classes.delete(value)), contains: value => this.classes.has(value) };
    }
    set innerHTML(value) {
      this.html = value;
      for (const [, id] of value.matchAll(/id="([^"]+)"/gu)) nodes.set(id, new Element(id));
    }
    get innerHTML() { return this.html || ''; }
    setAttribute() {}
    focus() { this.focused = true; }
    addEventListener(event, listener) { this.listeners[event] = listener; }
    appendChild(child) { child.parent = this; this.children.push(child); if (child.id) nodes.set(child.id, child); }
    insertBefore(child) { this.appendChild(child); }
    querySelector(selector) {
      if (selector === '.hero-actions') return nodes.get('result-actions');
      if (selector.startsWith('[data-tq-option')) return buttons[0];
      return this.children.find(child => child.className?.split(' ').includes(selector.slice(1))) || null;
    }
    remove() { if (this.parent) this.parent.children = this.parent.children.filter(child => child !== this); }
  }
  const buttons = Array.from({ length: 4 }, () => new Element());
  for (const id of ['timedQuizOverlay', 'tqQuestion', 'tqAnswer', 'tqAnswerWrap', 'tqOptions', 'tqFeedback', 'tqProgressText', 'tqCountdown', 'tqTrackFill', 'tqActions', 'tqResult', 'tqScoreBig', 'tqScoreSub', 'tqPlayAgain', 'result-actions']) nodes.set(id, new Element(id));
  nodes.get('timedQuizOverlay').classList.add('hidden');
  const context = loadFunctions(vm.createContext({
    state: { lang: 'en', dbUser: null, categorySlug: 'math', categoryData: { cards, title: { en: 'Math', ar: 'رياضيات' } } },
    timedQuizState: { session: 0, timer: null, advanceTimeout: null },
    document: { getElementById: id => nodes.get(id) || null, querySelectorAll: () => buttons,
      createElement: () => new Element(), body: new Element() },
    setInterval: callback => { const id = ++timerId; intervals.set(id, callback); return id; },
    clearInterval: id => intervals.delete(id),
    setTimeout: callback => { const id = ++timerId; timeouts.set(id, callback); return id; },
    clearTimeout: id => timeouts.delete(id),
    shuffleArray: items => [...items], escapeHtml: value => String(value),
    trackEvent: (name, value) => events.push({ name, value }), showToast: value => events.push({ name: 'toast', value }),
    markCard: (id, result) => marks.push({ id, result }),
    trapFocus() {}, saveJson() {}, checkNewAchievements() {}, releaseFocus() {}, openBattleModal() {},
    shareResult: (...args) => shares.push(args), shareOrCopy: value => challengeShares.push(value),
    t: key => key, location: { origin: 'https://riddlearabia.com' }, categoryRouteForLanguage: (slug, lang) => `/${lang}/${slug}`,
  }), [...preparationFunctions, 'clearTimedQuizTimers', 'isTimedQuizVisible', 'createTimedQuizModal', 'startTimedQuiz', 'showTimedCard', 'revealAndAdvance', 'advanceTimedQuiz', 'answerTimedCard', 'endTimedQuiz']);
  return { context, nodes, intervals, timeouts, events, marks, shares, challengeShares };
}

test('Quick Fire refuses unprepared or too-small pools without random fallback in either language', () => {
  const legacy = Array.from({ length: 20 }, (_, index) => { const value = card(`legacy-${index}`); delete value.quickFire; return value; });
  for (const lang of ['en', 'ar']) {
    const { context, nodes, events } = quizHarness([...legacy, ...Array.from({ length: 4 }, (_, index) => card(`ready-${index}`))]);
    context.state.lang = lang;
    context.startTimedQuiz();
    assert.equal(nodes.get('timedQuizOverlay').classList.contains('hidden'), true);
    assert.equal(events.at(-1).name, 'toast');
    assert.match(events.at(-1).value, lang === 'ar' ? /التدريب المجاني/u : /free card practice/u);
  }
  assert.doesNotMatch(functionSource('showTimedCard'), /state\.categoryData\.cards|\.slice\(0, 3\)/u);
});

test('authored choices reveal explanations only after answering and wait for Next without score races', () => {
  const { context, nodes, intervals, marks } = quizHarness();
  context.startTimedQuiz();
  assert.equal(nodes.get('tqAnswer').textContent, '');
  assert.equal(nodes.get('tqAnswerWrap').classList.contains('hidden'), true);
  assert.equal(Array.from(context.timedQuizState.currentOptions).join(','), '5,4,6,7');
  const staleTick = intervals.get(context.timedQuizState.timer);
  assert.equal(context.answerTimedCard(99), false);
  assert.equal(context.answerTimedCard(context.timedQuizState.correctOption), true);
  assert.equal(context.answerTimedCard(null, 'timeout'), false);
  assert.match(nodes.get('tqAnswer').textContent, /Two plus three/u);
  assert.match(nodes.get('tqActions').innerHTML, /tqNextBtn/u);
  assert.equal(context.timedQuizState.index, 0);
  assert.equal(intervals.size, 0);
  assert.equal(marks.length, 1);
  context.advanceTimedQuiz();
  context.advanceTimedQuiz();
  assert.equal(context.timedQuizState.index, 1);
  const timeLeft = context.timedQuizState.timeLeft;
  staleTick();
  assert.equal(context.timedQuizState.timeLeft, timeLeft);
  assert.equal(context.timedQuizState.completed, 1);
});

test('timeout marks once; replay invalidates old timers and refreshes share-score closures', () => {
  const { context, intervals, nodes, events, shares, challengeShares } = quizHarness();
  context.startTimedQuiz();
  const previousTick = intervals.get(context.timedQuizState.timer);
  for (let index = 0; index < 15; index += 1) previousTick();
  assert.equal(context.timedQuizState.completed, 1);
  assert.equal(context.timedQuizState.score, 0);
  previousTick();
  assert.equal(context.timedQuizState.completed, 1);
  context.timedQuizState.score = 1; context.timedQuizState.completed = 5;
  context.endTimedQuiz(); context.endTimedQuiz();
  assert.equal(events.filter(event => event.name === 'timed_quiz_end').length, 1);
  nodes.get('result-actions').querySelector('.tq-share-btn').onclick();
  assert.equal(shares.at(-1)[0], 1);
  context.startTimedQuiz();
  previousTick();
  assert.equal(context.timedQuizState.timeLeft, 15);
  assert.equal(context.timedQuizState.score, 0);
  context.timedQuizState.score = 4; context.timedQuizState.completed = 5;
  context.endTimedQuiz();
  nodes.get('result-actions').querySelector('.tq-share-btn').onclick();
  nodes.get('tqChallengeFriendBtn').listeners.click();
  assert.equal(shares.at(-1)[0], 4);
  assert.match(challengeShares.at(-1).text, /4\/5/u);
  assert.equal(nodes.get('tqPlayAgain').focused, true);
});

test('Arabic play uses authored Arabic options and Arabic explanation', () => {
  const { context, nodes } = quizHarness();
  context.state.lang = 'ar'; context.startTimedQuiz();
  assert.equal(Array.from(context.timedQuizState.currentOptions).join(','), '٥,٤,٦,٧');
  context.answerTimedCard(0);
  assert.match(nodes.get('tqAnswer').textContent, /جمع اثنين وثلاثة/u);
  assert.match(nodes.get('tqActions').innerHTML, /السؤال التالي/u);
});

test('a complete round records once and a mid-round exit never claims completion', () => {
  const { context, nodes, events, intervals } = quizHarness();
  nodes.delete('timedQuizOverlay');
  context.createTimedQuizModal();
  context.startTimedQuiz();
  const oldTick = intervals.get(context.timedQuizState.timer);
  nodes.get('tqExitBtn').listeners.click();
  nodes.get('tqExitBtn').listeners.click();
  oldTick();
  const exits = events.filter(event => event.name === 'timed_quiz_exit');
  assert.equal(exits.length, 1);
  assert.deepEqual(JSON.parse(JSON.stringify(exits[0].value)), { category: 'math', completed: 0, total: 5 });
  assert.equal(events.filter(event => event.name === 'timed_quiz_end').length, 0);
  context.startTimedQuiz();
  for (let index = 0; index < 5; index += 1) {
    context.answerTimedCard(0);
    context.advanceTimedQuiz();
  }
  assert.equal(context.timedQuizState.completed, 5);
  assert.equal(context.timedQuizState.score, 5);
  assert.equal(events.filter(event => event.name === 'timed_quiz_end').length, 1);
  assert.equal(context.answerTimedCard(0), false);
  context.advanceTimedQuiz();
  nodes.get('tqClose').listeners.click();
  assert.equal(events.filter(event => event.name === 'timed_quiz_exit').length, 1);
});

test('duplicate card IDs cannot inflate an undersized authored pool', () => {
  const { context, nodes } = quizHarness(Array.from({ length: 8 }, () => card('same-id')));
  context.startTimedQuiz();
  assert.equal(nodes.get('timedQuizOverlay').classList.contains('hidden'), true);
});

test('all authored seed cards pass the actual client validator in both languages', () => {
  const context = loadFunctions(vm.createContext({}), preparationFunctions);
  for (const slug of ['classic-riddles', 'math', 'logic-puzzles']) {
    const cards = JSON.parse(fs.readFileSync(new URL(`../data/${slug}.json`, import.meta.url), 'utf8'));
    const authored = cards.filter(value => value.quickFire);
    assert.ok(authored.length >= 5, slug);
    for (const value of authored) {
      const ready = context.preparedQuickFire(value);
      assert.ok(ready, value.id);
      for (const lang of ['en', 'ar']) assert.equal(ready[lang].distractors.length, 3, `${value.id}:${lang}`);
    }
  }
});
