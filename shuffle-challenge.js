import {
  ROUND_SIZE, LEVELS, normalizeLevel, planRound, replacementId, restoreRound, reveal, answerCard,
  replaceCurrent, isFinished, roundScore, rememberSeen, updateBest,
} from './shuffle-challenge-engine.js';

const KEYS = { round: 'ra-shuffle-round-v1', seen: 'ra-shuffle-seen-v1', best: 'ra-shuffle-best-v1', level: 'ra-shuffle-level-v1' };
const LONG_QUESTION = 170;
const LONG_ANSWER = 90;
const COLOR = /^(?:var\(--[a-z0-9-]+\)|#[0-9a-f]{3,8})$/iu;
const LEVEL_COLOR = { easy: 'var(--easy)', medium: 'var(--medium)', hard: 'var(--hard)', 'very-advanced': 'var(--advanced)' };

const COPY = {
  en: {
    setupTitle: 'Pick your level',
    setupNote: '10 cards from 10 different topics, drawn at random from all {n} topics.',
    levelLegend: 'Level',
    hints: { mixed: 'Any level', easy: 'Easy', medium: 'Medium', hard: 'Hard', 'very-advanced': 'Expert' },
    mixed: 'Mixed',
    start: 'Shuffle & play',
    savedNote: 'Your round and best scores stay on this device.',
    loading: 'Shuffling the deck…',
    unavailable: 'The topic list could not load right now. Please try again shortly.',
    loadError: 'This card could not load. Check your connection and try again.',
    retry: 'Try again',
    progress: 'Card {i} of {n}',
    known: '{n} known',
    showAnswer: 'Show answer',
    skip: 'Skip',
    answer: 'Answer',
    knew: 'I knew it',
    missed: 'Not this time',
    newRound: 'New shuffle',
    doneEyebrow: 'Round complete',
    doneTitle: 'You knew {k} of {n}',
    best: 'Your best at this level: {b} of {n}',
    playAgain: 'Shuffle again',
    changeLevel: 'Change level',
    recap: 'Topics in this round',
    results: { knew: 'Knew it', missed: 'Not this time', skipped: 'Skipped' },
    explore: 'Open topic',
  },
  ar: {
    setupTitle: 'اختر المستوى',
    setupNote: '10 بطاقات من 10 مواضيع مختلفة، تُسحب عشوائيًا من بين {n} موضوعًا.',
    levelLegend: 'المستوى',
    hints: { mixed: 'كل المستويات', easy: 'سهل', medium: 'متوسط', hard: 'صعب', 'very-advanced': 'صعب جدًا' },
    mixed: 'منوّع',
    start: 'اخلط وابدأ',
    savedNote: 'تبقى جولتك وأفضل نتائجك على هذا الجهاز فقط.',
    loading: 'جارٍ خلط البطاقات…',
    unavailable: 'تعذّر تحميل قائمة المواضيع الآن. حاول مرة أخرى بعد قليل.',
    loadError: 'تعذّر تحميل هذه البطاقة. تحقّق من اتصالك ثم حاول مجددًا.',
    retry: 'حاول مجددًا',
    progress: 'البطاقة {i} من {n}',
    known: 'إجابات معروفة: {n}',
    showAnswer: 'اكشف الإجابة',
    skip: 'تخطَّ',
    answer: 'الإجابة',
    knew: 'كنت أعرفها',
    missed: 'لم أعرفها هذه المرة',
    newRound: 'خلطة جديدة',
    doneEyebrow: 'انتهت الجولة',
    doneTitle: 'النتيجة: {k} من {n}',
    best: 'أفضل نتيجة لك في هذا المستوى: {b} من {n}',
    playAgain: 'اخلط مرة أخرى',
    changeLevel: 'غيّر المستوى',
    recap: 'مواضيع هذه الجولة',
    results: { knew: 'كنت أعرفها', missed: 'لم أعرفها', skipped: 'تم التخطي' },
    explore: 'افتح الموضوع',
  },
};

const fill = (text, values) => text.replace(/\{(\w+)\}/gu, (_, key) => String(values[key] ?? ''));

export function createShuffleChallenge(api) {
  const root = document.getElementById('shuffleChallenge');
  if (!root) return null;
  const e = api.escapeHtml;
  const topicCards = new Map();
  let lang = api.state.lang === 'ar' ? 'ar' : 'en';
  let copy = COPY[lang];
  let round = restoreRound(api.loadJson(KEYS.round, null), api.isRecordUnavailable);
  let level = normalizeLevel(api.loadJson(KEYS.level, round?.level || 'mixed'));
  let view = !round ? 'setup' : isFinished(round) ? 'summary' : 'play';
  let renderToken = 0;
  let pendingFocus = null;

  const topics = () => api.topics();
  const topicMeta = slug => topics().find(topic => topic.slug === slug);
  const levelLabel = value => value === 'mixed' ? copy.mixed : api.levelLabel(value);
  const saveRound = () => api.saveJson(KEYS.round, round);

  function loadCards(slug) {
    if (!topicCards.has(slug)) {
      const pending = api.loadTopicCards(slug).catch(error => { topicCards.delete(slug); throw error; });
      topicCards.set(slug, pending);
    }
    return topicCards.get(slug);
  }

  function focusSoon(selector) { pendingFocus = selector; }
  function applyFocus() {
    if (!pendingFocus) return;
    const target = root.querySelector(pendingFocus);
    pendingFocus = null;
    target?.focus({ preventScroll: false });
  }

  function setupMarkup() {
    const count = topics().length;
    const options = LEVELS.map(value => {
      const label = levelLabel(value), hint = copy.hints[value];
      return `<label class="shuffle-level-option" style="--level-color:${LEVEL_COLOR[value] || 'var(--accent)'}">
        <input type="radio" name="shuffleLevel" value="${e(value)}" ${value === level ? 'checked' : ''} />
        <span class="shuffle-level-name">${e(label)}</span>${hint && hint !== label ? `<span class="shuffle-level-hint">${e(hint)}</span>` : ''}
      </label>`;
    }).join('');
    return `<section class="shuffle-panel shuffle-setup" aria-labelledby="shuffleSetupTitle">
      <h2 id="shuffleSetupTitle" tabindex="-1">${e(copy.setupTitle)}</h2>
      <p class="shuffle-setup-note">${e(fill(copy.setupNote, { n: count }))}</p>
      <fieldset class="shuffle-levels"><legend class="sr-only">${e(copy.levelLegend)}</legend>${options}</fieldset>
      <button type="button" class="primary-btn shuffle-start" data-shuffle="start">🔀 ${e(copy.start)}</button>
      <p class="shuffle-fine-print">${e(copy.savedNote)}</p>
    </section>`;
  }

  function progressMarkup() {
    const score = roundScore(round), current = Math.min(round.position + 1, round.items.length);
    const percent = Math.round((round.position / round.items.length) * 100);
    return `<div class="shuffle-progress">
      <span class="shuffle-progress-count">${e(fill(copy.progress, { i: current, n: round.items.length }))}</span>
      <span class="shuffle-progress-bar" aria-hidden="true"><span style="width:${percent}%"></span></span>
      <span class="shuffle-progress-score">✓ ${e(fill(copy.known, { n: score.knew }))}</span>
    </div>`;
  }

  function cardMarkup(card, meta) {
    const item = round.items[round.position];
    const question = card.question[lang], answer = card.answer[lang];
    const topicColor = COLOR.test(meta?.color || '') ? meta.color : 'var(--accent)';
    const actions = round.revealed
      ? `<button type="button" class="primary-btn shuffle-knew" data-shuffle="knew">✓ ${e(copy.knew)}</button>
         <button type="button" class="ghost-btn shuffle-missed" data-shuffle="missed">✗ ${e(copy.missed)}</button>`
      : `<button type="button" class="primary-btn shuffle-reveal" data-shuffle="reveal">${e(copy.showAnswer)}</button>
         <button type="button" class="ghost-btn shuffle-skip" data-shuffle="skip">${e(copy.skip)}</button>`;
    return `<article class="shuffle-card${round.revealed ? ' is-revealed' : ''}" style="--topic-color:${topicColor};--level-color:${LEVEL_COLOR[card.difficulty] || 'var(--accent)'}" data-card-id="${e(item.id)}">
      <header class="shuffle-card-head">
        <span class="shuffle-topic"><span aria-hidden="true">${e(meta?.emoji || '🎯')}</span> ${e(meta?.title?.[lang] || item.slug)}</span>
        <span class="shuffle-level-badge">${e(api.levelLabel(card.difficulty))}</span>
      </header>
      <h2 class="shuffle-question${question.length > LONG_QUESTION ? ' is-long' : ''}" tabindex="-1">${e(question)}</h2>
      ${round.revealed ? `<div class="shuffle-answer"><p class="shuffle-answer-label">${e(copy.answer)}</p><p class="shuffle-answer-text${answer.length > LONG_ANSWER ? ' is-long' : ''}">${e(answer)}</p></div>` : ''}
      <footer class="shuffle-actions">${actions}</footer>
    </article>`;
  }

  function stageMarkup(inner) {
    return `<section class="shuffle-stage" aria-label="${e(fill(copy.progress, { i: round.position + 1, n: round.items.length }))}">
      ${progressMarkup()}
      ${inner}
      <div class="shuffle-stage-foot"><button type="button" class="text-btn" data-shuffle="new">↺ ${e(copy.newRound)}</button></div>
    </section>`;
  }

  function summaryMarkup() {
    const score = roundScore(round), bests = api.loadJson(KEYS.best, {});
    const best = Number.isInteger(bests?.[round.level]) ? bests[round.level] : score.knew;
    const icon = { knew: '✓', missed: '✗', skipped: '→' };
    const recap = round.items.map(item => {
      const meta = topicMeta(item.slug), result = item.result || 'skipped';
      return `<li class="shuffle-recap-item is-${e(result)}">
        <span class="shuffle-recap-icon" aria-hidden="true">${icon[result]}</span>
        <span class="shuffle-recap-topic"><span aria-hidden="true">${e(meta?.emoji || '🎯')}</span> ${e(meta?.title?.[lang] || item.slug)}</span>
        <span class="shuffle-recap-result">${e(copy.results[result])}</span>
        <a class="shuffle-recap-link" href="${e(api.topicRoute(item.slug, lang))}">${e(copy.explore)}<span class="sr-only"> · ${e(meta?.title?.[lang] || item.slug)}</span></a>
      </li>`;
    }).join('');
    return `<section class="shuffle-panel shuffle-summary" aria-labelledby="shuffleSummaryTitle">
      <p class="shuffle-eyebrow">${e(copy.doneEyebrow)} · ${e(levelLabel(round.level))}</p>
      <h2 id="shuffleSummaryTitle" tabindex="-1">${e(fill(copy.doneTitle, { k: score.knew, n: score.total }))}</h2>
      <p class="shuffle-best">${e(fill(copy.best, { b: best, n: ROUND_SIZE }))}</p>
      <div class="shuffle-summary-actions">
        <button type="button" class="primary-btn" data-shuffle="again">🔀 ${e(copy.playAgain)}</button>
        <button type="button" class="ghost-btn" data-shuffle="level">${e(copy.changeLevel)}</button>
      </div>
      <h3 class="shuffle-recap-title">${e(copy.recap)}</h3>
      <ol class="shuffle-recap">${recap}</ol>
    </section>`;
  }

  // A card that fails to load can be retried or skipped; a failed start can only be retried.
  const messageMarkup = (text, retry) => `<div class="shuffle-card shuffle-message" role="status"><p>${e(text)}</p><footer class="shuffle-actions"><button type="button" class="primary-btn" data-shuffle="${retry}">${e(copy.retry)}</button>${retry === 'retry' ? `<button type="button" class="ghost-btn" data-shuffle="skip">${e(copy.skip)}</button>` : ''}</footer></div>`;

  async function renderPlay(token) {
    const item = round.items[round.position];
    root.innerHTML = stageMarkup(`<div class="shuffle-card shuffle-message" aria-busy="true"><p>${e(copy.loading)}</p></div>`);
    let cards;
    try { cards = await loadCards(item.slug); } catch (_) {
      if (token === renderToken) { root.innerHTML = stageMarkup(messageMarkup(copy.loadError, 'retry')); applyFocus(); }
      return;
    }
    if (token !== renderToken) return;
    const card = cards.find(entry => entry.id === item.id);
    if (!card?.question?.[lang] || !card?.answer?.[lang]) {
      const id = replacementId(cards, { level: round.level, exclude: round.items.map(entry => entry.id) });
      round = id ? replaceCurrent(round, id) : answerCard(round, 'skipped');
      finishIfDone();
      saveRound();
      render();
      return;
    }
    root.innerHTML = stageMarkup(cardMarkup(card, topicMeta(item.slug)));
    applyFocus();
    const next = round.items[round.position + 1];
    if (next) loadCards(next.slug).catch(() => {});
  }

  function render() {
    const token = ++renderToken;
    root.dataset.view = view;
    root.setAttribute('aria-busy', 'false');
    if (view === 'setup') { root.innerHTML = setupMarkup(); applyFocus(); return; }
    if (view === 'summary' && round) { root.innerHTML = summaryMarkup(); applyFocus(); return; }
    if (view === 'error') { root.innerHTML = messageMarkup(copy.unavailable, 'start'); applyFocus(); return; }
    void renderPlay(token);
  }

  async function start() {
    root.setAttribute('aria-busy', 'true');
    root.innerHTML = `<div class="shuffle-card shuffle-message" aria-busy="true"><p>${e(copy.loading)}</p></div>`;
    let index;
    try { index = await api.loadCardIndex(); } catch (_) { index = null; }
    const plan = index ? planRound({ index, topics: topics().map(topic => topic.slug), level, seen: api.loadJson(KEYS.seen, []) }) : null;
    if (!plan?.items.length) { view = 'error'; render(); return; }
    round = plan;
    saveRound();
    api.trackEvent('shuffle_round_start', { level });
    view = 'play';
    focusSoon('.shuffle-question');
    render();
  }

  function finishIfDone() {
    if (!isFinished(round)) return;
    const score = roundScore(round);
    api.saveJson(KEYS.best, updateBest(api.loadJson(KEYS.best, {}), round.level, score.knew));
    api.saveJson(KEYS.seen, rememberSeen(api.loadJson(KEYS.seen, []), round.items.map(item => item.id)));
    api.trackEvent('shuffle_round_complete', { level: round.level, known: score.knew });
    view = 'summary';
    focusSoon('#shuffleSummaryTitle');
  }

  function act(action) {
    if (action === 'start' || action === 'again') { void start(); return; }
    if (action === 'level' || action === 'new') {
      round = null; api.saveJson(KEYS.round, null);
      view = 'setup'; focusSoon('#shuffleSetupTitle'); render(); return;
    }
    if (action === 'retry') { focusSoon('.shuffle-question'); render(); return; }
    if (!round || isFinished(round)) return;
    if (action === 'reveal') { round = reveal(round); focusSoon('.shuffle-knew'); }
    else if (['knew', 'missed', 'skip'].includes(action)) {
      round = answerCard(round, action === 'skip' ? 'skipped' : action);
      focusSoon('.shuffle-question');
      finishIfDone();
    } else return;
    saveRound();
    render();
  }

  root.addEventListener('click', event => {
    const button = event.target.closest('[data-shuffle]');
    if (button && root.contains(button)) act(button.dataset.shuffle);
  });
  root.addEventListener('change', event => {
    if (event.target.name !== 'shuffleLevel') return;
    level = normalizeLevel(event.target.value);
    api.saveJson(KEYS.level, level);
  });

  render();
  return {
    // Shared page refreshes re-run rerender(); only rebuild when the language changed.
    refresh() {
      const next = api.state.lang === 'ar' ? 'ar' : 'en';
      if (next === lang) return;
      lang = next; copy = COPY[lang];
      render();
    },
  };
}
