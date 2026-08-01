import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
const styles = fs.readFileSync(path.join(root, 'styles.css'), 'utf8');
const searchLeaderboard = fs.readFileSync(path.join(root, 'search-leaderboard.js'), 'utf8');
const indexHtml = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const playHtml = fs.readFileSync(path.join(root, 'play.html'), 'utf8');
const mindLabHtml = fs.readFileSync(path.join(root, 'mind-lab.html'), 'utf8');

function topLevelFunction(name, source = app) {
  const asyncStart = source.indexOf(`async function ${name}(`);
  const start = asyncStart >= 0 ? asyncStart : source.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, `missing function ${name}`);
  const end = source.indexOf('\n}', start);
  assert.notEqual(end, -1, `unterminated function ${name}`);
  return source.slice(start, end + 2);
}

function functionBlock(name, nextName, source = app) {
  const start = source.indexOf(`function ${name}(`);
  const end = source.indexOf(`function ${nextName}(`, start + 1);
  assert.ok(start >= 0 && end > start, `missing ${name}/${nextName} boundary`);
  return source.slice(start, end);
}

test('client quarantine path guard rejects data suffix aliases before startup', () => {
  const quarantineSet = app.match(/const QUARANTINED_CATEGORY_SLUGS = new Set\([^\n]+\);/u)?.[0];
  assert.ok(quarantineSet, 'missing client quarantine category set');
  const context = vm.createContext({ Set, decodeURIComponent });
  vm.runInContext([
    quarantineSet,
    topLevelFunction('requestPathIsQuarantined'),
    'this.isHeld = requestPathIsQuarantined;',
  ].join('\n'), context);
  for (const pathname of [
    '/data/survival.json/',
    '/data/survival.json/archive',
    '/data/survival.json%2farchive',
    '/survival%3Fx=1',
    '/survival%23fragment',
    '/data/survival.json%3Fx=1',
    '/data/survival.json%23fragment',
    '/science%00/safe',
    '/ar/topics/survival.html',
    '/ar/topics/survival.html/archive',
    '/ar/topics/survival%2ehtml',
  ]) assert.equal(context.isHeld(pathname), true, pathname);
  assert.equal(context.isHeld('/data/survival.json-safe'), false);
});

test('storage SecurityError and quota failures preserve an in-memory current view', () => {
  const context = vm.createContext({
    state: { storageDurable: true },
    storageMemory: { local: new Map(), session: new Map() },
    window: {
      localStorage: {
        getItem() { throw new DOMException('blocked', 'SecurityError'); },
        setItem() { throw new DOMException('full', 'QuotaExceededError'); },
        removeItem() { throw new DOMException('blocked', 'SecurityError'); },
      },
    },
    DOMException,
  });
  vm.runInContext([
    topLevelFunction('safeStorageGet'),
    topLevelFunction('safeStorageSet'),
    topLevelFunction('safeStorageRemove'),
    'this.safeGet = safeStorageGet; this.safeSet = safeStorageSet; this.safeRemove = safeStorageRemove;',
  ].join('\n'), context);
  assert.equal(context.safeSet('local', 'progress', '42'), false);
  assert.equal(context.safeGet('local', 'progress'), '42');
  assert.equal(context.state.storageDurable, false);
  assert.equal(context.safeRemove('local', 'progress'), false);
  assert.equal(context.safeGet('local', 'progress'), null);
  assert.doesNotMatch(app, /\blocalStorage\.|\bsessionStorage\./u);
});

test('install dismissal expires instead of suppressing the prompt forever', () => {
  const storage = new Map();
  const context = vm.createContext({
    INSTALL_PROMPT_DISMISSAL_KEY: 'jakh-install-dismissed',
    INSTALL_PROMPT_DISMISSAL_TTL_MS: 30 * 24 * 60 * 60 * 1000,
    safeStorageGet: (_area, key) => storage.get(key) ?? null,
    safeStorageRemove: (_area, key) => storage.delete(key),
    Date,
    JSON,
    Number,
  });
  vm.runInContext(`${topLevelFunction('installPromptIsSuppressed')}\nthis.isSuppressed = installPromptIsSuppressed;`, context);

  storage.set('jakh-install-dismissed', JSON.stringify({ dismissedAt: Date.now(), reason: 'dismissed' }));
  assert.equal(context.isSuppressed(Date.now()), true);

  const expiredAt = Date.now() - (31 * 24 * 60 * 60 * 1000);
  storage.set('jakh-install-dismissed', JSON.stringify({ dismissedAt: expiredAt, reason: 'dismissed' }));
  assert.equal(context.isSuppressed(Date.now()), false);
  assert.equal(storage.has('jakh-install-dismissed'), false);

  storage.set('jakh-install-dismissed', '1');
  assert.equal(context.isSuppressed(Date.now()), false);
  assert.equal(storage.has('jakh-install-dismissed'), false);
});

test('cloud retries are limited to network/408/425/429/5xx and backoff is bounded', () => {
  const context = vm.createContext({});
  vm.runInContext([
    topLevelFunction('isRetryableCloudError'),
    topLevelFunction('cloudQueueBackoffMs'),
    'this.retryable = isRetryableCloudError; this.backoff = cloudQueueBackoffMs;',
  ].join('\n'), context);
  assert.equal(context.retryable(new TypeError('network')), true);
  for (const status of [408, 425, 429, 500, 503]) assert.equal(context.retryable({ status }), true);
  for (const status of [400, 401, 403, 404, 409, 422]) assert.equal(context.retryable({ status }), false);
  assert.equal(context.backoff(1), 5_000);
  assert.equal(context.backoff(99), 3_600_000);
});

test('cloud queue remains current-user scoped and capped at 100', () => {
  let saved = null;
  const existing = Array.from({ length: 140 }, (_, index) => ({
    key: `old:${index}`,
    userId: index % 2 ? 'other' : 'current',
  }));
  const context = vm.createContext({
    state: { dbUser: { id: 'current' } },
    loadCloudQueue: () => existing,
    saveCloudQueue: value => { saved = value; },
    cloudQueueBackoffMs: () => 5_000,
    CLOUD_QUEUE_MAX: 100,
    CLOUD_QUEUE_MAX_ATTEMPTS: 5,
    publicCardIds: new Set(['public-1']),
    Date,
  });
  vm.runInContext([
    topLevelFunction('cloudMutationIsDeletionOnly'),
    topLevelFunction('cloudMutationMayPublish'),
    topLevelFunction('queueCloudMutation'),
    'this.enqueue = queueCloudMutation;',
  ].join('\n'), context);
  assert.equal(context.enqueue('current', 'new', '/endpoint', 'POST', { cardId: 'public-1' }), true);
  assert.ok(saved.length <= 100);
  assert.ok(saved.every(item => item.userId === 'current'));
  assert.equal(saved.at(-1).key, 'new');
  assert.match(app, /clearAllCloudMutations\(\);\s*\n\s*state\.dbUser = null;/u);
});

test('cloud mutations serialize latest intent and never enqueue across an account switch', async () => {
  const calls = [];
  let releaseFirst;
  const firstGate = new Promise(resolve => { releaseFirst = resolve; });
  const serializationContext = vm.createContext({
    state: { dbUser: { id: 'user-a' } },
    cloudMutationChains: new Map(),
    dispatchCloudMutation: async (_userId, _key, _endpoint, _method, body) => {
      calls.push(body.value);
      if (body.value === 'first') await firstGate;
      return { synced: true, retryQueued: false };
    },
    Promise,
  });
  vm.runInContext(`${topLevelFunction('sendCloudMutation')}\nthis.send = sendCloudMutation;`, serializationContext);
  const first = serializationContext.send('favorite:1', '/favorite', 'POST', { value: 'first' });
  const second = serializationContext.send('favorite:1', '/favorite', 'POST', { value: 'latest' });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(calls.join(','), 'first');
  releaseFirst();
  await Promise.all([first, second]);
  assert.equal(calls.join(','), 'first,latest');

  let rejectRequest;
  let queued = 0;
  const switchContext = vm.createContext({
    state: { dbUser: { id: 'user-a' } },
    apiFetch: () => new Promise((_resolve, reject) => { rejectRequest = reject; }),
    clearCloudMutation() {},
    isRetryableCloudError: () => true,
    queueCloudMutation: () => { queued += 1; return true; },
    cloudMutationMayPublish: mutation => mutation.body?.cardId === 'public-1',
    publicCardIds: new Set(['public-1']),
    JSON,
  });
  vm.runInContext(`${topLevelFunction('dispatchCloudMutation')}\nthis.dispatch = dispatchCloudMutation;`, switchContext);
  const pending = switchContext.dispatch('user-a', 'progress:1', '/progress', 'POST', { cardId: 'public-1', status: 'correct' });
  switchContext.state.dbUser = { id: 'user-b' };
  rejectRequest(new TypeError('network'));
  const result = await pending;
  assert.equal(result.retryQueued, false);
  assert.equal(queued, 0);
});

test('signed-in cloud failures never leak account mutations into guest keys', () => {
  const favorite = functionBlock('toggleFavorite', 'markCard');
  const progress = functionBlock('markCard', 'unmarkCard');
  const unmark = functionBlock('unmarkCard', 'describeFocusTarget');
  assert.doesNotMatch(favorite.slice(favorite.indexOf('const dbUser')), /GUEST_KEYS/u);
  assert.doesNotMatch(progress.slice(progress.indexOf('const dbUser')), /GUEST_KEYS/u);
  assert.doesNotMatch(unmark.slice(unmark.indexOf('const dbUser')), /GUEST_KEYS/u);
});

test('Quick Fire never fills the canonical answer panel before a response', () => {
  const modal = functionBlock('createTimedQuizModal', 'startTimedQuiz');
  const show = functionBlock('showTimedCard', 'revealAndAdvance');
  assert.match(modal, /id="tqAnswerWrap" class="tq-a-wrap hidden"/u);
  assert.match(modal, /id="tqAnswer"[^>]*><\/p>/u);
  assert.match(show, /tqA\.textContent = ''/u);
  assert.doesNotMatch(show, /tqA\.textContent = card\.answer/u);
  assert.match(show, /createReviewMarkup\(card\)/u);
});

test('Quick Fire answer/timeout races record exactly one completed response', () => {
  let marks = 0;
  let advances = 0;
  const classList = () => ({ add() {}, remove() {} });
  const optionButtons = Array.from({ length: 4 }, () => ({ disabled: false, classList: classList() }));
  const elements = {
    tqAnswer: { textContent: '', classList: classList() },
    tqAnswerWrap: { classList: classList() },
    tqFeedback: { textContent: '', classList: classList() },
  };
  const context = vm.createContext({
    timedQuizState: {
      answered: false,
      timer: 1,
      index: 0,
      score: 0,
      completed: 0,
      correctOption: 2,
      cards: [{ id: 'card-1', answer: { en: 'Answer', ar: 'جواب' } }],
    },
    state: { lang: 'en' },
    document: {
      querySelectorAll: () => optionButtons,
      getElementById: id => elements[id] || null,
    },
    isTimedQuizVisible: () => true,
    clearInterval() {},
    markCard: () => { marks += 1; },
    revealAndAdvance: () => { advances += 1; },
  });
  vm.runInContext(`${topLevelFunction('answerTimedCard')}\nthis.answer = answerTimedCard;`, context);
  assert.equal(context.answer(2), true);
  assert.equal(context.answer(null, 'timeout'), false);
  assert.equal(context.timedQuizState.score, 1);
  assert.equal(context.timedQuizState.completed, 1);
  assert.equal(marks, 1);
  assert.equal(advances, 1);
});

test('daily reveal is not completion; only explicit outcome buttons persist', () => {
  const daily = functionBlock('renderDailyChallenge', 'scrollToDailyChallenge');
  const flipHandler = daily.slice(daily.indexOf("getElementById('flipDailyBtn')"), daily.indexOf('const recordOutcome'));
  assert.doesNotMatch(flipHandler, /saveJson|safeStorageSet/u);
  assert.match(daily, /id="dailyKnewBtn"/u);
  assert.match(daily, /id="dailyReviewBtn"/u);
  assert.match(daily, /saveJson\(outcomeKey, \{ cardId: card\.id, categoryId: card\.categorySlug, result/u);
  assert.match(daily, /createReviewMarkup\(card\)/u);
});

test('global search evaluates every hit, ranks deterministically, and reports total/top N', () => {
  const context = vm.createContext({ Map });
  vm.runInContext([
    topLevelFunction('normalizeGlobalSearchText', searchLeaderboard),
    topLevelFunction('rankGlobalSearch', searchLeaderboard),
    'this.rank = rankGlobalSearch;',
  ].join('\n'), context);
  const categories = [
    { slug: 'alpha', title: { en: 'Planets', ar: 'كواكب' } },
    { slug: 'beta', title: { en: 'Other', ar: 'أخرى' } },
  ];
  const payload = {
    categories: ['alpha', 'beta'],
    cards: [
      [1, 'red', 'What is red?', 'Mars'],
      [0, 'planets', 'Planets', 'Many'],
      [1, 'planet', 'Name a planet', 'Mars'],
    ],
  };
  const hits = context.rank(payload, categories, 'planet', 'en');
  assert.equal(hits.length, 2);
  assert.equal(hits[0].cat.slug, 'alpha');
  assert.match(searchLeaderboard, /Showing the top \$\{shownHits\.length\}, ranked by relevance/u);
  assert.doesNotMatch(functionBlock('runGlobalSearch', 'verifiedCategoryOptions', searchLeaderboard), /hits\.length >= 30/u);
});

test('share fallback handles Web Share failure, cancellation, Clipboard failure, and manual selection', async () => {
  const calls = { clipboard: 0, fallback: 0, toast: 0 };
  const context = vm.createContext({
    navigator: {
      share: async () => { throw Object.assign(new Error('denied'), { name: 'NotAllowedError' }); },
      clipboard: { writeText: async () => { calls.clipboard += 1; throw new Error('blocked'); } },
    },
    showSelectableShareFallback: () => { calls.fallback += 1; },
    showToast: () => { calls.toast += 1; },
    t: () => 'copied',
  });
  vm.runInContext(`${topLevelFunction('shareOrCopy')}\nthis.shareOrCopy = shareOrCopy;`, context);
  assert.equal(await context.shareOrCopy({ title: 'T', text: 'Body', url: 'https://example.test' }), 'manual');
  assert.deepEqual(calls, { clipboard: 1, fallback: 1, toast: 0 });
  context.navigator.share = async () => { throw Object.assign(new Error('cancel'), { name: 'AbortError' }); };
  assert.equal(await context.shareOrCopy({ title: 'T', text: 'Body' }), 'cancelled');
  assert.equal(calls.clipboard, 1);
});

test('reset clears stale filter/share query params while preserving unrelated parameters', () => {
  let replaced = '';
  const location = { href: 'https://jakh.net/math?q=sum&difficulty=hard&card=math-1&utm_source=a#questions' };
  const context = vm.createContext({
    state: { page: 'category' },
    location,
    URL,
    history: { replaceState(_state, _title, value) { replaced = value; } },
  });
  vm.runInContext(`${topLevelFunction('clearCategoryFilterParams')}\nthis.clear = clearCategoryFilterParams;`, context);
  context.clear();
  assert.equal(replaced, '/math?utm_source=a#questions');
  assert.match(functionBlock('bindCommonEvents', 'rerender'), /clearCategoryFilterParams\(\);/u);
});

test('category count copy distinguishes rendered, matched, total, and remaining', () => {
  const render = functionBlock('renderCards', 'renderRelatedCategories');
  assert.match(render, /const rendered = visible\.length/u);
  assert.match(render, /const matched = filtered\.length/u);
  assert.match(render, /const categoryTotal = state\.categoryData\.cards\.length/u);
  assert.match(render, /more available via “Show more\.”/u);
});

test('truthful product and server-checking wording is enforced', () => {
  const ownedCopy = [app, searchLeaderboard, indexHtml, playHtml].join('\n');
  for (const claim of [/Team Battle/iu, /unlock all/iu, /10 complete browser games/iu, /10 games live/iu, /server-verified/iu, /verified score/iu]) {
    assert.doesNotMatch(ownedCopy, claim);
  }
  assert.match(app, /Battle Room/u);
  assert.match(app, /browser adaptations and simplified games/u);
  assert.match(searchLeaderboard, /scoreType === 'server-checked'/u);
  assert.match(searchLeaderboard, /proctored === false/u);
  assert.match(searchLeaderboard, /serverCheckedAutomationDisclaimer/u);
  assert.match(searchLeaderboard, /\/scores\/server-checked\/challenge/u);
  assert.match(searchLeaderboard, /\/scores\/server-checked\/submit/u);
});

test('anonymous session, transient identity, review disclosure, and signed-out markup contracts remain honest', () => {
  const session = functionBlock('checkCloudSession', 'postAuthDestination');
  assert.ok(session.indexOf("apiFetch('/auth/session')") < session.indexOf("apiFetch('/user/profile')"));
  assert.match(session, /state\.dbUser = previousUser/u);
  assert.match(session, /error\?\.status === 401 \|\| error\?\.status === 403/u);
  const starter = functionBlock('renderVerifiedStarter', 'startVerifiedChallenge', searchLeaderboard);
  assert.doesNotMatch(starter, /mount\.innerHTML = `\s*mount\.innerHTML/u);
  assert.match(starter, /verified-signin-prompt/u);
  const challenge = functionBlock('renderVerifiedChallenge', 'submitVerifiedChallenge', searchLeaderboard);
  assert.match(challenge, /verifiedReviewUnavailable/u);
  assert.match(challenge, /createReviewMarkup\(\{ review: item\.review \}\)/u);
});

test('server-checked cancellation keeps the token locally on failure and validates discard responses', () => {
  const challenge = functionBlock('renderVerifiedChallenge', 'submitVerifiedChallenge', searchLeaderboard);
  const cancelStart = challenge.indexOf("document.getElementById('verifiedCancelBtn')");
  const cancel = challenge.slice(cancelStart);
  assert.ok(cancelStart >= 0, 'missing normal challenge cancellation handler');
  assert.match(cancel, /apiFetch\('\/scores\/server-checked\/challenge',\s*\{\s*method: 'DELETE'/u);
  assert.match(cancel, /categoryId: challenge\.categoryId/u);
  assert.match(cancel, /challengeId: challenge\.challengeId/u);
  assert.match(cancel, /submissionToken: challenge\.submissionToken/u);
  assert.match(cancel, /typeof result\?\.discarded !== 'boolean'/u);

  const validateIndex = cancel.indexOf("typeof result?.discarded !== 'boolean'");
  const clearIndex = cancel.indexOf('verifiedChallenge = null');
  const catchIndex = cancel.indexOf('} catch (error)');
  assert.ok(validateIndex >= 0 && clearIndex > validateIndex && catchIndex > clearIndex,
    'local challenge state must clear only after a valid successful DELETE response');
  assert.doesNotMatch(cancel.slice(catchIndex), /verifiedChallenge\s*=/u,
    'failed DELETE must preserve the local answers and submission token');
  assert.match(app + searchLeaderboard, /Your answers and token are still kept in this tab/u);
});

test('ACTIVE conflict warns before category-only discard and retries only after validated success', () => {
  const active = functionBlock('renderActiveChallengeConflict', 'renderVerifiedChallenge', searchLeaderboard);
  assert.match(active, /verifiedActiveWarning/u);
  assert.match(searchLeaderboard, /invalidate a challenge still open in another tab/u);
  assert.match(active, /apiFetch\('\/scores\/server-checked\/challenge',\s*\{\s*method: 'DELETE'/u);
  assert.match(active, /body: JSON\.stringify\(\{ categoryId \}\)/u);
  assert.doesNotMatch(active, /challengeId|submissionToken/u,
    'ACTIVE recovery must use the explicit category-only discard contract');
  assert.match(active, /typeof result\?\.discarded !== 'boolean'/u);

  const validateIndex = active.indexOf("typeof result?.discarded !== 'boolean'");
  const retryIndex = active.indexOf('await startVerifiedChallenge');
  assert.ok(validateIndex >= 0 && retryIndex > validateIndex,
    'replacement challenge must start only after a validated discard response');
});

test('catalog, hero, offline badge, focus lifecycle, and centralized SW registration stay bounded', () => {
  assert.match(app, /let catalogPromise = null/u);
  assert.match(app, /if \(!catalogPromise\)/u);
  assert.match(app, /if \(!els\.categoryImage\.getAttribute\('src'\)\)/u);
  assert.match(app, /\^jakh-data-v\\d\+\$/u);
  assert.match(app, /\^jakh-navigation-v\\d\+\$/u);
  assert.match(app, /cachedDataPaths\.has\(`\/data\/\$\{slug\}\.json`\) && cachedNavigationPaths\.has\(pathname\)/u);
  const quick = functionBlock('createTimedQuizModal', 'startTimedQuiz');
  const start = functionBlock('startTimedQuiz', 'showTimedCard');
  const completion = functionBlock('showCategoryCompleteModal', 'showSelectableShareFallback');
  assert.match(quick, /releaseFocus\(overlay, \{ restore: true \}\)/u);
  assert.match(start, /trapFocus\(overlay/u);
  assert.match(completion, /trapFocus\(el/u);
  assert.match(completion, /releaseFocus\(el, \{ restore, discard: !restore \}\)/u);
  for (const html of [indexHtml, mindLabHtml, playHtml]) assert.doesNotMatch(html, /getRegistration\(['"]\/sw\.js/u);
  assert.equal((app.match(/serviceWorker\.register\('\/sw\.js'\)/gu) || []).length, 1);
  assert.match(styles, /\.share-fallback-card textarea/u);
});
