/* Account gate: games and every level above Piece of Cake need a free account.
   This is a browser-side membership prompt, not a security boundary: the
   question bank stays public data. It never reads or stores account details,
   only a yes/no hint so returning members are not shown the prompt, and the
   page a guest chose as today's one free game or activity. */
(() => {
  'use strict';
  const HINT_KEY = 'ra-member';
  const CHECKED_KEY = 'ra-member-checked';
  const TRIAL_KEY = 'ra-trial';
  const root = document.documentElement;

  // Whole play areas that guests may not use. The surrounding page (title,
  // rules, how-to-play text) stays readable.
  const KIDS_LOCKED = ['activity', 'pack', 'plan', 'riddles', 'toolkit']
    .map(kind => `body[data-kids-page="${kind}"] .kids-shell > :not(nav):not(header):not(h1):not(.kids-hero):not(.ra-gate)`);
  const PLAY_AREAS = [
    'body[data-page="game"] main > :not(.hero):not(.mm-wrapper):not(.ra-gate)',
    '.mm-wrapper > :not(.mm-hero):not(.ra-gate)',
    '#puzzle-stage:not([hidden]) .puzzle-frame > :not(.puzzle-title-row):not(.ra-gate)',
    '#party-app',
    '#ak-loading', '#ak-game', '#ak-casebook',
    '#shuffleChallenge',
    '#tvTrivia > :not(.tv-hero):not(.ra-gate)',
    ...KIDS_LOCKED,
  ];
  // Start buttons that sit inside a heading block which otherwise stays visible.
  const PLAY_CONTROLS = ['#tvTrivia .tv-hero .tv-actions', '#puzzle-reset'];
  const LOCKED_CARDS = '.seo-qa-card.members-only';

  const COPY = {
    en: {
      playTitle: 'Create a free account to play',
      playBody: 'Games on Riddle Arabia are for members. Signing up is free.',
      kidsTitle: 'Ask a grown-up to create a free account',
      kidsBody: 'Kids activities are for member families. Signing up is free.',
      levelsTitle: 'Harder levels are for members',
      levelsBody: count => `Piece of Cake questions are open to everyone. Create a free account to unlock Brain Tickler, Head Scratcher and Brick Wall${count ? ` (${count} more here)` : ''}.`,
      register: 'Create free account',
      signIn: 'Sign in',
      signUp: 'Sign up free',
      playTrial: 'Try one free game today',
      kidsTrial: 'Try one free activity today',
      trialUsed: 'You have used today\u2019s free try.',
      trialNote: 'This is your free try for today.',
      close: 'Not now',
    },
    ar: {
      playTitle: 'أنشئ حسابًا مجانيًا لتلعب',
      playBody: 'ألعاب ريدل أرابيا متاحة للأعضاء. التسجيل مجاني.',
      kidsTitle: 'اطلب من شخص بالغ إنشاء حساب مجاني',
      kidsBody: 'أنشطة الأطفال متاحة للعائلات الأعضاء. التسجيل مجاني.',
      levelsTitle: 'المستويات الأصعب للأعضاء',
      levelsBody: count => `أسئلة المستوى السهل متاحة للجميع. أنشئ حسابًا مجانيًا لفتح المستويات: متوسط، صعب، صعب جدًا${count ? ` (عدد الأسئلة المقفلة هنا: ${count})` : ''}.`,
      register: 'أنشئ حسابًا مجانيًا',
      signIn: 'تسجيل الدخول',
      signUp: 'سجّل مجانًا',
      playTrial: 'جرّب لعبة واحدة مجانًا اليوم',
      kidsTrial: 'جرّب نشاطًا واحدًا مجانًا اليوم',
      trialUsed: 'استخدمت تجربتك المجانية لهذا اليوم.',
      trialNote: 'هذه تجربتك المجانية لهذا اليوم.',
      close: 'ليس الآن',
    },
  };

  const STYLE = `
html.ra-guest:not(.ra-trial) ${[...PLAY_AREAS, ...PLAY_CONTROLS].join(',\nhtml.ra-guest:not(.ra-trial) ')},
html.ra-guest ${LOCKED_CARDS} { display: none !important; }
.ra-gate { box-sizing: border-box; width: min(100% - 2rem, 640px); margin: 1.5rem auto; padding: 1.5rem 1.25rem; text-align: center;
  background: var(--panel, #fffdf8); color: var(--text, #322016); border: 1px solid var(--line-strong, rgba(72,42,23,.24));
  border-radius: var(--radius, 24px); box-shadow: var(--shadow, 0 3px 10px rgba(70,39,19,.08)); }
.ra-gate-lock { display: inline-grid; place-items: center; width: 3rem; height: 3rem; margin-bottom: .5rem; border-radius: 50%;
  background: var(--panel-strong, #f5e4c9); color: var(--accent, #94431f); }
.ra-gate h2 { margin: 0 0 .5rem; font-size: 1.35rem; line-height: 1.3; color: var(--text, #322016); }
.ra-gate p { margin: 0 auto 1rem; max-width: 46ch; color: var(--muted, #725846); line-height: 1.6; }
.ra-gate-actions { display: flex; flex-wrap: wrap; gap: .6rem; justify-content: center; }
.ra-gate-actions a, .ra-gate-actions button { display: inline-flex; align-items: center; justify-content: center; min-height: 44px;
  padding: .65rem 1.2rem; border-radius: 999px; font: inherit; font-weight: 700; text-decoration: none; cursor: pointer; }
.ra-gate-primary { background: var(--accent, #94431f); color: #fff; border: 1px solid var(--accent, #94431f); }
.ra-gate-secondary { background: transparent; color: var(--accent-ink, #733217); border: 1px solid var(--line-strong, rgba(72,42,23,.24)); }
.ra-gate-actions a:focus-visible, .ra-gate-actions button:focus-visible { outline: 3px solid var(--accent-3, #c5832e); outline-offset: 2px; }
.site-utilities a.ra-signup { padding-inline: .95rem; border-radius: 999px; background: var(--accent, #94431f); color: #fff; white-space: nowrap; }
.site-utilities a.ra-signup:hover { background: var(--accent-ink, #733217); }
.site-utilities a.ra-signup:focus-visible { outline: 3px solid var(--accent-3, #c5832e); outline-offset: 2px; }
@media (max-width: 600px) {
  .site-utilities a.ra-signup { padding-inline: .7rem; }
  html.ra-guest .site-utilities [data-site-profile] { display: none; }
}
@media (max-width: 359px) { .site-utilities a.ra-signup { padding-inline: .4rem; font-size: .75rem; } }
.ra-gate[data-gate="trial"] { padding: .7rem 1rem; margin: .75rem auto; }
.ra-gate[data-gate="trial"] p { margin: 0; }
.ra-gate[data-gate="trial"] a { color: var(--accent-ink, #733217); font-weight: 700; text-decoration: underline; }
dialog.ra-gate { position: fixed; inset: 0; margin: auto; max-height: calc(100dvh - 2rem); overflow: auto; }
dialog.ra-gate::backdrop { background: rgba(50, 32, 22, .55); }
`;
  const LOCK_ICON = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>';

  function readHint() {
    try { return localStorage.getItem(HINT_KEY) === '1'; } catch (_) { return false; }
  }
  let member = readHint();

  // One free game or activity a day: the guest picks a page and it stays open
  // on this browser until the local date changes.
  const here = () => location.pathname.replace(/\.html$/, '').replace(/\/+$/, '') || '/';
  function today() {
    const now = new Date();
    return `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}`;
  }
  function readTrial() {
    try {
      const [day, page] = (localStorage.getItem(TRIAL_KEY) || '').split('|');
      return day === today() ? page : '';
    } catch (_) { return ''; }
  }
  let trial = readTrial();

  const lang = () => (root.lang || '').toLowerCase().startsWith('ar') || /^\/ar(?:\/|$)/.test(location.pathname) ? 'ar' : 'en';

  function accountHref(register) {
    const next = location.pathname + location.search + location.hash;
    return `${lang() === 'ar' ? '/ar/mind-lab/' : '/mind-lab'}?profile=1${register ? '&signup=1' : ''}&next=${encodeURIComponent(next)}`;
  }

  function panelMarkup(kind, count, id) {
    const copy = COPY[lang()];
    const body = kind === 'levels' ? copy.levelsBody(count) : copy[`${kind}Body`];
    return `<span class="ra-gate-lock">${LOCK_ICON}</span>
<h2 id="${id}">${copy[`${kind}Title`]}</h2>
<p>${body}</p>
<div class="ra-gate-actions"><a class="ra-gate-primary" href="${accountHref(true)}">${copy.register}</a><a class="ra-gate-secondary" href="${accountHref(false)}">${copy.signIn}</a></div>`;
  }

  function panel(kind, count = 0, id = 'raGateTitle') {
    const section = document.createElement('section');
    section.className = 'ra-gate';
    section.dataset.gate = kind;
    section.setAttribute('aria-labelledby', id);
    section.innerHTML = panelMarkup(kind, count, id);
    return section;
  }

  // Guests get a clear way in from every page header. On phones it takes the
  // place of the Profile link; the form it opens also has a Sign in tab.
  function headerButton() {
    document.querySelectorAll('a.ra-signup').forEach(node => node.remove());
    const profile = document.querySelector('.site-utilities [data-site-profile]');
    if (member || !profile) return;
    const link = document.createElement('a');
    link.className = 'ra-signup';
    link.href = accountHref(true);
    link.textContent = COPY[lang()].signUp;
    profile.before(link);
  }

  function apply() {
    root.classList.toggle('ra-guest', !member);
    document.querySelectorAll('section.ra-gate[data-auto]').forEach(node => node.remove());
    headerButton();
    const playArea = member ? null : document.querySelector(PLAY_AREAS.join(','));
    const onTrial = !!playArea && trial === here();
    root.classList.toggle('ra-trial', onTrial);
    if (member) return;
    if (playArea) {
      const kind = document.body.classList.contains('kids-page') ? 'kids' : 'play';
      const copy = COPY[lang()];
      const section = panel(onTrial ? 'trial' : kind);
      section.dataset.auto = '';
      if (onTrial) {
        section.innerHTML = `<p id="raGateTitle">${copy.trialNote} <a href="${accountHref(true)}">${copy.register}</a></p>`;
      } else if (trial) {
        const used = document.createElement('p');
        used.className = 'ra-trial-used';
        used.textContent = copy.trialUsed;
        section.append(used);
      } else {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'ra-gate-secondary ra-trial-btn';
        button.textContent = copy[`${kind}Trial`];
        button.addEventListener('click', startTrial);
        section.querySelector('.ra-gate-actions').append(button);
      }
      // TV trivia redraws its own container, so the panel sits after it.
      const redrawn = playArea.closest('#tvTrivia');
      if (redrawn) redrawn.after(section);
      else playArea.before(section);
    }
    const lockedCards = document.querySelectorAll(LOCKED_CARDS);
    if (lockedCards.length) {
      const section = panel('levels', lockedCards.length, 'raLevelsGateTitle');
      section.dataset.auto = '';
      lockedCards[0].before(section);
    }
  }

  // Games set themselves up while the page loads, so the chosen page is loaded
  // again with its play area open. Without storage the try lasts for this visit.
  function startTrial() {
    trial = here();
    try {
      localStorage.setItem(TRIAL_KEY, `${today()}|${trial}`);
      location.reload();
    } catch (_) {
      apply();
    }
  }

  // Topic pages render their own cards; app.js passes the grid and the full
  // topic so the panel can say how many cards a guest is not shown.
  function levels(grid, cards) {
    document.getElementById('raLevelsGate')?.remove();
    const count = member || !grid ? 0 : cards.filter(card => card.difficulty !== 'easy').length;
    if (!count) return;
    const section = panel('levels', count, 'raLevelsGateTitle');
    section.id = 'raLevelsGate';
    (document.getElementById('loadMoreBtn') || grid).after(section);
  }

  function prompt(kind = 'play') {
    if (member) return false;
    document.getElementById('raGateDialog')?.remove();
    const dialog = document.createElement('dialog');
    dialog.id = 'raGateDialog';
    dialog.className = 'ra-gate';
    dialog.setAttribute('aria-labelledby', 'raGateDialogTitle');
    dialog.innerHTML = panelMarkup(kind, 0, 'raGateDialogTitle');
    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'ra-gate-secondary';
    close.textContent = COPY[lang()].close;
    close.addEventListener('click', () => dialog.close());
    dialog.querySelector('.ra-gate-actions').append(close);
    dialog.addEventListener('close', () => dialog.remove());
    document.body.append(dialog);
    if (typeof dialog.showModal === 'function') dialog.showModal();
    else dialog.setAttribute('open', '');
    return true;
  }

  // A member who was already signed in, but whose browser had no hint yet, is
  // sent back to the page that showed them the panel. While a sign-in or
  // registration form is open the app handles the return itself, so a new
  // member always sees their one-time code first.
  function returnToSender() {
    const query = new URLSearchParams(location.search);
    if (query.get('profile') !== '1' || !query.get('next') || document.getElementById('authForm')) return false;
    try {
      const target = new URL(query.get('next'), location.origin);
      if (target.origin !== location.origin || !/^\/(?!api|(ar\/)?mind-lab)[a-z0-9/.-]+$/.test(target.pathname)) return false;
      location.replace(target.pathname + target.search + target.hash);
      return true;
    } catch (_) {
      return false;
    }
  }

  function sync(isMember) {
    const next = isMember === true;
    try { localStorage.setItem(HINT_KEY, next ? '1' : '0'); } catch (_) {}
    if (next === member) return;
    member = next;
    if (member && returnToSender()) return;
    apply();
    document.getElementById('raGateDialog')?.remove();
    document.getElementById('raLevelsGate')?.remove();
  }

  window.raGate = Object.freeze({ member: () => member, prompt, levels, sync });

  const style = document.createElement('style');
  style.textContent = STYLE;
  document.head.append(style);
  apply();

  // A guest choosing a harder level on a topic page gets the prompt instead of an empty list.
  document.addEventListener('change', event => {
    const select = event.target;
    if (member || select?.id !== 'difficultySelect' || ['all', 'easy'].includes(select.value)) return;
    select.value = 'all';
    select.dispatchEvent(new Event('change', { bubbles: true }));
    prompt('levels');
  }, true);

  window.addEventListener('storage', event => {
    if (event.key === HINT_KEY && (event.newValue === '1') !== member) sync(event.newValue === '1');
  });

  // Pages running the main app confirm the session themselves and call sync().
  // Other pages ask only when a guest is looking at a locked play area, so
  // hubs, collections and members' pages make no account request at all.
  const hasApp = [...document.scripts].some(script => /(?:^|\/)app\.(?:[a-f0-9]{16}\.)?js(?:\?|$)/.test(script.getAttribute('src') || ''));
  if (hasApp || member || !document.querySelector('section.ra-gate[data-gate="play"], section.ra-gate[data-gate="kids"]')) return;
  let lastCheck = 0;
  try { lastCheck = Number(sessionStorage.getItem(CHECKED_KEY)) || 0; } catch (_) {}
  if (Date.now() - lastCheck < 60_000) return;
  const local = location.hostname === 'localhost' || location.hostname === '127.0.0.1';
  const api = local ? `${location.protocol}//${location.hostname}:8787` : 'https://api.riddlearabia.com';
  fetch(`${api}/api/auth/session`, { credentials: 'include', headers: { Accept: 'application/json' } })
    .then(response => {
      if (response.status === 401 || response.status === 403) return { authenticated: false };
      return response.ok ? response.json() : null;
    })
    .then(session => {
      if (!session || typeof session.authenticated !== 'boolean') return;
      try { sessionStorage.setItem(CHECKED_KEY, String(Date.now())); } catch (_) {}
      sync(session.authenticated);
    })
    .catch(() => {});
})();
