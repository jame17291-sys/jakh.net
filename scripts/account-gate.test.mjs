// Owner decision, 17 Nov 2026: playing any game, and seeing questions above
// Piece of Cake, needs a free account. The gate is a browser-side membership
// prompt; the question bank stays public data.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const root = new URL('../', import.meta.url);
const read = file => fs.readFileSync(new URL(file, root), 'utf8');
const app = read('app.js');
const gate = read('account-gate.js');

function functionSource(name) {
  const start = app.indexOf(`async function ${name}(`) >= 0 ? app.indexOf(`async function ${name}(`) : app.indexOf(`function ${name}(`);
  assert.ok(start >= 0, `missing ${name}`);
  return app.slice(start, app.indexOf('\n}', start) + 2);
}

function card(id, difficulty) {
  return { id, difficulty, question: { en: id, ar: id }, answer: { en: 'a', ar: 'a' } };
}

function appContext(extra = {}) {
  const storage = new Map();
  const context = vm.createContext({
    state: { dbUser: null, difficulty: 'all', view: 'all', subcategory: 'all', search: '', sort: 'featured', lang: 'en',
      categoryData: { cards: ['easy', 'medium', 'hard', 'very-advanced', 'easy'].map((level, index) => card(`c${index}`, level)) } },
    safeStorageGet: (_area, key) => storage.get(key) ?? null,
    safeStorageSet: (_area, key, value) => storage.set(key, String(value)),
    window: {},
    ...extra,
  });
  vm.runInContext(['isGuest', 'syncMember', 'getFilteredCards'].map(functionSource).join('\n'), context);
  return { context, storage };
}

test('a guest is shown Piece of Cake cards only; a member is shown every level', () => {
  const { context, storage } = appContext();
  assert.equal(context.isGuest(), true);
  assert.deepEqual([...new Set(context.getFilteredCards().map(item => item.difficulty))], ['easy']);
  context.state.difficulty = 'hard';
  assert.equal(context.getFilteredCards().length, 0, 'a level link cannot reveal harder cards to a guest');
  context.state.difficulty = 'all';
  context.state.dbUser = { id: 'member' };
  assert.equal(context.isGuest(), false);
  assert.equal(context.getFilteredCards().length, 5);
  // A returning member is recognised before the session check answers.
  context.state.dbUser = null;
  storage.set('ra-member', '1');
  assert.equal(context.isGuest(), false);
});

test('a confirmed session updates the membership hint and the page gate', () => {
  const calls = [];
  const { context } = appContext();
  context.window.raGate = { sync: value => calls.push(value) };
  context.state.dbUser = { id: 'member' };
  context.syncMember();
  context.state.dbUser = null;
  context.syncMember();
  assert.deepEqual(calls, [true, false]);
  const session = app.slice(app.indexOf('async function checkCloudSession('), app.indexOf('function isGuest('));
  assert.equal(session.match(/syncMember\(\);/gu)?.length, 3, 'signed-in, signed-out and rejected sessions each sync');
  assert.doesNotMatch(session.slice(session.lastIndexOf('state.dbUser = previousUser')), /syncMember/u, 'an unreachable API never signs a member out of the gate');
  assert.match(app, /state\.dbUser = null;\n\s+syncMember\(\);\n\s+notifyAuthChange\('signed-out'\)/u);
});

test('Quick Fire and Battle ask a guest to register before anything starts', () => {
  for (const name of ['startTimedQuiz', 'openBattleModal']) {
    const body = functionSource(name).split('\n');
    assert.match(body[1], /^\s+if \(isGuest\(\)\) return void window\.raGate\?\.prompt\(\);$/u, `${name}: the guest check comes first`);
  }
  assert.match(app, /params\.get\('profile'\) === '1'\) void openAuthModal\(null, params\.has\('signup'\) \? 'register' : 'signin'\)/u);
  assert.match(functionSource('renderRecoveryCodeReceipt'), /const destination = postAuthDestination\(\);\n\s+if \(destination\) return void location\.assign\(destination\);/u,
    'a new member returns to the page that asked them to register');
});

test('every public page that has the shared navigation also loads the gate', () => {
  const pages = execFileSync('git', ['ls-files', '*.html'], { cwd: root, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 }).split('\n').filter(Boolean);
  let gated = 0;
  for (const page of pages) {
    const source = read(page);
    if (!source.includes('src="/site-navigation.js"')) continue;
    assert.ok(source.includes('<script defer src="/site-navigation.js"></script><script defer src="/account-gate.js"></script>'), `${page}: loads account-gate.js`);
    gated += 1;
  }
  assert.ok(gated > 1_000, 'the gate covers kids, game, topic and collection pages');
});

test('the gate covers every kind of game and stores only a yes/no hint and the free-try page', () => {
  for (const selector of ['body[data-page="game"] main', '.mm-wrapper', '#puzzle-stage', '#party-app', '#ak-game', '#shuffleChallenge', '#tvTrivia', '.seo-qa-card.members-only']) {
    assert.ok(gate.includes(selector), `gate covers ${selector}`);
  }
  for (const kind of ['activity', 'pack', 'plan', 'riddles', 'toolkit']) assert.ok(gate.includes(`'${kind}'`), `kids ${kind} pages are gated`);
  const keys = [...gate.matchAll(/(?:local|session)Storage\.(?:get|set)Item\(([A-Z_]+)/gu)].map(match => match[1]);
  assert.deepEqual([...new Set(keys)].sort(), ['CHECKED_KEY', 'HINT_KEY', 'TRIAL_KEY']);
  assert.doesNotMatch(gate, /username|email|password|recovery/iu, 'the gate never touches account details');
  assert.match(gate, /credentials: 'include'/u);
  assert.doesNotMatch(gate, /jakh\.net/u);
});

function runGate({ hint = null, kidsPage = false, lang = 'en', path = '/chess', search = '', authForm = false, noHeader = false, trial = null, storageBlocked = false, analytics = null } = {}) {
  const store = new Map(hint === null ? [] : [['ra-member', hint]]);
  if (trial !== null) store.set('ra-trial', trial);
  const created = [];
  const events = [];
  const listeners = {};
  let reloads = 0;
  const classes = new Set();
  const inserted = [];
  const header = [];
  const replaced = [];
  const make = () => {
    const node = { dataset: {}, className: '', handlers: {}, appended: [], setAttribute() {}, set innerHTML(value) { this.html = value; }, get innerHTML() { return this.html; },
      querySelector: () => ({ append: child => node.appended.push(child) }), addEventListener(type, handler) { node.handlers[type] = handler; }, append: child => node.appended.push(child), remove() {} };
    created.push(node);
    return node;
  };
  const target = { before: node => inserted.push(node), closest: () => null };
  const document = {
    documentElement: { lang, classList: { toggle: (name, on) => { if (on) classes.add(name); else classes.delete(name); } } },
    body: { classList: { contains: name => kidsPage && name === 'kids-page' }, append() {} },
    head: { append() {} },
    scripts: [{ getAttribute: () => '/app.0123456789abcdef.js' }],
    createElement: make,
    querySelector: selector => (selector.includes('data-site-profile') ? (noHeader ? null : { before: node => header.push(node) }) : target),
    querySelectorAll: selector => (selector === 'a.ra-signup' ? header.splice(0).map(() => ({ remove() {} })) : []),
    getElementById: id => (id === 'authForm' && authForm ? {} : null),
    addEventListener(type, handler) { (listeners[type] ||= []).push(handler); },
  };
  const window = { addEventListener() {} };
  if (analytics !== null) {
    window.JakhPrivacy = { analyticsAllowed: () => analytics };
    window.gtag = (kind, name, params) => events.push([kind, name, { ...params }]);
  }
  vm.runInNewContext(gate, { document, window, location: { pathname: path, search, hash: '', hostname: 'riddlearabia.com', origin: 'https://riddlearabia.com', replace: target => replaced.push(target), reload: () => { reloads += 1; } }, URL, URLSearchParams,
    localStorage: { getItem: key => store.get(key) ?? null, setItem: (key, value) => { if (storageBlocked) throw new Error('blocked'); store.set(key, value); } }, sessionStorage: { getItem: () => null, setItem() {} },
    Event: class {}, Date, Number, Object, String, encodeURIComponent, fetch: () => { throw new Error('app pages confirm the session themselves'); } });
  return { classes, inserted, header, replaced, store, created, events, listeners, reloads: () => reloads, api: window.raGate };
}

test('a guest sees a registration panel in place of the game; a member sees the game', () => {
  const guest = runGate();
  assert.equal(guest.api.member(), false);
  assert.ok(guest.classes.has('ra-guest'));
  assert.equal(guest.inserted.length, 1);
  assert.match(guest.inserted[0].html, /Create a free account to play/u);
  assert.match(guest.inserted[0].html, /href="\/mind-lab\?profile=1&signup=1&next=%2Fchess"/u);
  assert.match(guest.inserted[0].html, /href="\/mind-lab\?profile=1&next=%2Fchess"/u);

  const arabic = runGate({ lang: 'ar', path: '/ar/games/chess/' });
  assert.match(arabic.inserted[0].html, /أنشئ حسابًا مجانيًا لتلعب/u);
  assert.match(arabic.inserted[0].html, /href="\/ar\/mind-lab\/\?profile=1&signup=1&next=%2Far%2Fgames%2Fchess%2F"/u);

  const kids = runGate({ kidsPage: true, path: '/kids-riddles/toolkit/' });
  assert.match(kids.inserted[0].html, /Ask a grown-up to create a free account/u);

  const member = runGate({ hint: '1' });
  assert.equal(member.api.member(), true);
  assert.equal(member.classes.has('ra-guest'), false);
  assert.equal(member.inserted.length, 0);
  member.api.sync(false);
  assert.ok(member.classes.has('ra-guest'), 'signing out locks the page again');
  assert.equal(member.store.get('ra-member'), '0');
});

test('a guest may open one game or activity a day; everything else stays locked', () => {
  const now = new Date();
  const day = `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}`;
  const offer = node => node.appended.find(child => child.className === 'ra-gate-secondary ra-trial-btn');

  const fresh = runGate();
  const button = offer(fresh.inserted[0]);
  assert.equal(button.textContent, 'Try one free game today');
  assert.equal(fresh.classes.has('ra-trial'), false);
  button.handlers.click();
  assert.equal(fresh.store.get('ra-trial'), `${day}|/chess`);
  assert.equal(fresh.reloads(), 1, 'the chosen game is loaded again with its play area open');

  const playing = runGate({ trial: `${day}|/chess` });
  assert.ok(playing.classes.has('ra-guest') && playing.classes.has('ra-trial'));
  assert.equal(playing.inserted[0].dataset.gate, 'trial');
  assert.match(playing.inserted[0].html, /This is your free try for today\. <a href="\/mind-lab\?profile=1&signup=1&next=%2Fchess">Create free account<\/a>/u);

  const elsewhere = runGate({ trial: `${day}|/chess`, path: '/sudoku' });
  assert.equal(elsewhere.classes.has('ra-trial'), false, 'a second game stays locked');
  assert.equal(offer(elsewhere.inserted[0]), undefined);
  assert.equal(elsewhere.inserted[0].appended[0].textContent, 'You have used today\u2019s free try.');

  const nextDay = runGate({ trial: '2026-1-1|/chess' });
  assert.equal(nextDay.classes.has('ra-trial'), false);
  assert.ok(offer(nextDay.inserted[0]), 'a new day brings a new free try');

  const kids = runGate({ kidsPage: true, lang: 'ar', path: '/ar/kids-riddles/riddles/' });
  assert.equal(offer(kids.inserted[0]).textContent, 'جرّب نشاطًا واحدًا مجانًا اليوم');

  const blocked = runGate({ storageBlocked: true });
  offer(blocked.inserted[0]).handlers.click();
  assert.equal(blocked.reloads(), 0);
  assert.ok(blocked.classes.has('ra-trial'), 'without storage the try lasts for this visit');

  const member = runGate({ hint: '1', trial: `${day}|/chess` });
  assert.equal(member.classes.has('ra-trial'), false);
  assert.equal(member.inserted.length, 0);

  // Harder levels, Quick Fire and Battle are not part of the free try.
  assert.match(gate, /html\.ra-guest \$\{LOCKED_CARDS\} \{ display: none !important; \}/u);
  assert.match(gate, /html\.ra-guest:not\(\.ra-trial\) \$\{\[\.\.\.PLAY_AREAS, \.\.\.PLAY_CONTROLS\]/u);
});

test('the sign-up funnel is counted only with analytics consent and carries no personal detail', () => {
  const offer = node => node.appended.find(child => child.className === 'ra-gate-secondary ra-trial-btn');
  const click = (run, target) => run.listeners.click.forEach(handler => handler({ target }));
  const anchor = (href, holder = null) => { const node = { getAttribute: () => href }; node.closest = selector => (selector === '.ra-gate' ? holder : node); return { closest: () => node }; };

  for (const analytics of [null, false]) {
    const silent = runGate({ analytics });
    offer(silent.inserted[0]).handlers.click();
    silent.api.prompt('levels');
    click(silent, anchor('/mind-lab?profile=1&signup=1&next=%2Fchess'));
    assert.deepEqual(silent.events, [], 'nothing is sent without consent');
  }

  const run = runGate({ analytics: true });
  assert.deepEqual(run.events, [['event', 'gate_view', { gate: 'play', surface: 'panel', language: 'en' }]]);
  run.api.prompt('levels');
  click(run, anchor('/mind-lab?profile=1&signup=1&next=%2Fchess'));
  click(run, anchor('/mind-lab?profile=1&signup=1&next=%2Fchess', { id: '', dataset: { gate: 'play' } }));
  click(run, anchor('/mind-lab?profile=1&next=%2Fchess', { id: 'raGateDialog', dataset: { gate: 'levels' } }));
  click(run, { closest: () => null });
  offer(run.inserted[0]).handlers.click();
  assert.deepEqual(run.events.slice(1).map(([, name, params]) => [name, params.gate, params.surface]), [
    ['gate_view', 'levels', 'dialog'],
    ['gate_signup_click', 'header', 'header'],
    ['gate_signup_click', 'play', 'panel'],
    ['gate_signin_click', 'levels', 'dialog'],
    ['gate_trial_start', 'play', 'panel'],
  ]);
  for (const [, , params] of run.events) assert.deepEqual(Object.keys(params).sort(), ['gate', 'language', 'surface']);

  const kids = runGate({ analytics: true, kidsPage: true, lang: 'ar', path: '/ar/kids-riddles/riddles/' });
  assert.deepEqual(kids.events[0][2], { gate: 'kids', surface: 'panel', language: 'ar' });
  assert.deepEqual(runGate({ analytics: true, hint: '1' }).events, [], 'members are never counted');
  // The gate sends through the consent module only; it loads no analytics itself.
  assert.doesNotMatch(gate, /googletagmanager|google-analytics|dataLayer/u);
});

test('a guest gets a Sign up free button in the page header; a member does not', () => {
  const guest = runGate({ path: '/riddles' });
  assert.equal(guest.header.length, 1);
  assert.equal(guest.header[0].className, 'ra-signup');
  const label = node => node.textContent + node.appended.map(child => child.textContent).join('');
  assert.equal(label(guest.header[0]), 'Sign up free');
  assert.equal(guest.header[0].appended[0].className, 'ra-signup-more');
  assert.equal(guest.header[0].href, '/mind-lab?profile=1&signup=1&next=%2Friddles');
  guest.api.sync(true);
  assert.equal(guest.header.length, 0, 'the button goes away once the visitor is a member');

  const arabic = runGate({ lang: 'ar', path: '/ar/alghaz/' });
  assert.equal(label(arabic.header[0]), 'سجّل مجانًا');
  assert.equal(arabic.header[0].href, '/ar/mind-lab/?profile=1&signup=1&next=%2Far%2Falghaz%2F');

  assert.equal(runGate({ hint: '1' }).header.length, 0);
  const member = runGate({ hint: '1' });
  member.api.sync(false);
  assert.equal(member.header.length, 1, 'signing out brings the button back');
  assert.equal(runGate({ noHeader: true }).header.length, 0, 'pages without the shared header are left alone');
  // The button must stay readable on hover and never push the phone header onto two rows.
  assert.match(gate, /\.site-utilities a\.ra-signup:hover \{ background: var\(--accent-ink/u);
  assert.match(gate, /@media \(max-width: 600px\) \{[^}]*\}\s*html\.ra-guest \.site-utilities \[data-site-profile\] \{ display: none; \}/u);
  assert.match(gate, /@media \(max-width: 479px\) \{ \.ra-signup-more \{ display: none; \} \}/u);
  assert.match(gate, /@media \(max-width: 359px\) \{\s*html\.ra-guest \.site-utilities a \{ padding-inline: \.4rem; \}/u);
});

test('an already signed-in member returns to the page that asked; an open form is never interrupted', () => {
  const search = '?profile=1&next=%2Fsudoku%3Fdate%3D2026-11-17';
  const returning = runGate({ path: '/mind-lab', search });
  returning.api.sync(true);
  assert.deepEqual(returning.replaced, ['/sudoku?date=2026-11-17']);

  const registering = runGate({ path: '/mind-lab', search, authForm: true });
  registering.api.sync(true);
  assert.deepEqual(registering.replaced, [], 'a new member sees their one-time code before leaving');
  assert.equal(registering.api.member(), true);

  for (const next of ['https://attacker.invalid/x', '//attacker.invalid/x', '/api/auth/session', '/mind-lab', '/ar/mind-lab/']) {
    const blocked = runGate({ path: '/mind-lab', search: `?profile=1&next=${encodeURIComponent(next)}` });
    blocked.api.sync(true);
    assert.deepEqual(blocked.replaced, [], `${next} is not a return destination`);
  }
});

test('only a guest facing a locked play area asks the API about the session', () => {
  const guard = gate.slice(gate.indexOf('const hasApp'), gate.indexOf('fetch('));
  assert.match(guard, /if \(hasApp \|\| member \|\| !document\.querySelector\('section\.ra-gate\[data-gate="play"\], section\.ra-gate\[data-gate="kids"\]'\)\) return;/u);
  assert.equal(gate.match(/\bfetch\(/gu).length, 1);
});

test('collection pages keep harder cards in the HTML and declare the registration wall', () => {
  for (const [file, lang] of [['riddles.html', 'en'], ['ar/alghaz/index.html', 'ar'], ['math-riddles.html', 'en'], ['ar/asila-anime/index.html', 'ar']]) {
    const source = read(file);
    const cards = [...source.matchAll(/<article class="seo-qa-card( members-only)?" id="([^"]+)"/gu)];
    assert.ok(cards.length >= 8, `${file}: cards stay in the page`);
    const levels = new Map();
    for (const [, locked, id] of cards) {
      const slug = id.replace(/-\d+$/u, '');
      if (!levels.has(slug)) levels.set(slug, new Map(JSON.parse(read(`data/${slug}.json`)).map(item => [item.id, item.difficulty])));
      assert.equal(Boolean(locked), levels.get(slug).get(id) !== 'easy', `${file}: ${id} is locked exactly when it is above Piece of Cake`);
    }
    const graph = JSON.parse(source.match(/<script type="application\/ld\+json">\s*([\s\S]*?)\s*<\/script>/u)[1])['@graph'];
    const page = graph.find(node => node['@type'] === 'WebPage');
    assert.equal(page.isAccessibleForFree, false, `${file}: page declares gated content`);
    assert.deepEqual(page.hasPart, { '@type': 'WebPageElement', isAccessibleForFree: false, cssSelector: '.members-only' });
    assert.equal(page.inLanguage, lang);
    assert.equal(graph.find(node => node['@type'] === 'Quiz').isAccessibleForFree, undefined, `${file}: no contradictory free claim`);
  }
});

test('public copy no longer promises play without an account', () => {
  const stale = /No sign-up needed|No account needed|no account needed|No account is needed|with or without an account|من دون تسجيل|لا تحتاج إلى حساب|بلا حساب|بحساب أو بدونه|مجانًا دون حساب/u;
  for (const file of ['index.html', 'ar/index.html', 'app.js', 'akshifha-copy.js', 'akshifha.html', 'party-games-copy.js', 'friendship-games-copy.js',
    'tv-trivia-copy.js', 'puzzle-duel.js', 'kids-riddles.html', 'most-likely-to.html', 'scripts/generate-kids-pages.mjs', 'scripts/generate-arabic-routes.mjs']) {
    assert.doesNotMatch(read(file), stale, `${file}: stale no-account promise`);
  }
});

test('global search shows a guest Piece of Cake questions only', () => {
  const search = read('search-leaderboard.js');
  assert.match(app, /fetchJson,\n\s+isGuest,\n\s+loadCardIndex,/u, 'the search module receives the guest check and the level list');
  assert.match(search, /if \(isGuest\(\)\) \{\n\s+const levels = await loadCardIndex\(\)\.catch\(\(\) => \(\{\}\)\);\n\s+hits = allHits\.filter\(hit => levels\[hit\.id\]\?\.\[1\] === 'easy'\);/u);
  for (const lang of ['Results from harder levels are for members', 'نتائج المستويات الأصعب للأعضاء']) assert.ok(search.includes(lang));
  const index = JSON.parse(read('data/card-index.json'));
  assert.ok(Object.values(index).every(entry => typeof entry[1] === 'string'), 'every card has a level for the guest filter');
});
