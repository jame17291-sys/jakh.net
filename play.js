(function () {
  'use strict';

  const CATALOG = window.JakhBrainGames || [];
  const filters = [
    { key: 'all', en: 'All', ar: 'الكل' },
    { key: 'strategy', en: 'Strategy', ar: 'استراتيجية' },
    { key: 'logic', en: 'Logic', ar: 'منطق' },
    { key: 'ancient', en: 'Ancient', ar: 'قديمة' },
    { key: 'quick', en: 'Quick', ar: 'سريعة' },
    { key: 'deep', en: 'Deep', ar: 'عميقة' },
    { key: 'computer', en: 'Computer', ar: 'كمبيوتر' },
    { key: 'online', en: 'Online', ar: 'أونلاين' },
  ];

  const copy = {
    en: {
      navHome: 'Home',
      navMindLab: 'Mind Lab',
      navCategories: 'Mind Lab',
      navGameHub: 'Game Hub',
      navContact: 'Contact',
      authOpen: 'Sign in',
      language: 'Language',
      signIn: 'Sign in',
      profile: 'Profile',
      languageLabel: 'Language',
      eyebrow: 'Brain games',
      title: 'Play games that make you think.',
      lede: 'A bilingual set of classic brain games for logic, planning, memory, and focus. Every game supports computer play and an online room link.',
      gamesLive: 'games live',
      matching: 'matching',
      browseGames: 'Browse games',
      searchLabel: 'Search games',
      searchPlaceholder: 'Search strategy, ancient, chess...',
      accountTitle: 'Create account to play',
      accountCopy: 'Games are members-only so scores, rooms, and leaderboards stay tied to your account.',
      accountSigned: 'Signed in as {name}',
      accountSignedCopy: 'Your leaderboard runs can now use your account name.',
      featuredKicker: 'Recommended first',
      featuredTitle: 'Featured games',
      featuredCopy: 'Start with Chess, a quick logic game, or an ancient board game.',
      allGamesTitle: 'All brain games',
      allGamesCopy: 'Each game has simple rules, computer play, online invites, and its own score table.',
      available: '{count} games available',
      matchingCount: '{count} games matching',
      emptyState: 'No games match this search. Clear the search or choose All.',
      computer: 'Play computer',
      invite: 'Invite a player',
      leaderboardKicker: 'Per-game scores',
      leaderboardCopy: 'Leaderboards are contextual. Pick a game to see its current table.',
      topScores: 'Top {game} scores',
      leaderboardLoading: 'Loading scores...',
      leaderboardEmpty: 'No scores yet. Set the first mark.',
      leaderboardError: 'Could not load this leaderboard.',
      rank: 'Rank',
      player: 'Player',
      score: 'Score',
      skill: 'Skill',
      depth: 'Depth',
      time: 'Time',
      lesson: 'Trains',
      footerNote: 'All rights reserved to JAKH 2026',
      footerContact: 'Recommend changes',
      footerPrivacy: 'Privacy',
    },
    ar: {
      navHome: 'الرئيسية',
      navMindLab: 'مختبر العقل',
      navCategories: 'مختبر العقل',
      navGameHub: 'مركز الألعاب',
      navContact: 'تواصل',
      authOpen: 'تسجيل الدخول',
      language: 'اللغة',
      signIn: 'تسجيل الدخول',
      profile: 'الحساب',
      languageLabel: 'اللغة',
      eyebrow: 'ألعاب عقلية',
      title: 'العب ألعاباً تجعلك تفكر.',
      lede: 'مجموعة ثنائية اللغة من ألعاب عقلية كلاسيكية للمنطق والتخطيط والذاكرة والتركيز. كل لعبة تدعم اللعب ضد الكمبيوتر ورابط دعوة أونلاين.',
      gamesLive: 'لعبة متاحة',
      matching: 'مطابقة',
      browseGames: 'تصفح الألعاب',
      searchLabel: 'ابحث عن لعبة',
      searchPlaceholder: 'ابحث عن استراتيجية أو ألعاب قديمة أو شطرنج...',
      accountTitle: 'أنشئ حسابًا للعب',
      accountCopy: 'الألعاب للأعضاء فقط حتى تبقى النتائج والغرف ولوحات المتصدرين مرتبطة بحسابك.',
      accountSigned: 'تم تسجيل الدخول باسم {name}',
      accountSignedCopy: 'يمكن الآن ربط نتائجك باسم حسابك.',
      featuredKicker: 'ابدأ من هنا',
      featuredTitle: 'ألعاب مقترحة',
      featuredCopy: 'ابدأ بالشطرنج أو لعبة منطق سريعة أو لعبة قديمة.',
      allGamesTitle: 'كل ألعاب العقل',
      allGamesCopy: 'كل لعبة لها قواعد بسيطة، ولعب ضد الكمبيوتر، ودعوة أونلاين، وجدول نتائج.',
      available: '{count} لعبة متاحة',
      matchingCount: '{count} لعبة مطابقة',
      emptyState: 'لا توجد ألعاب تطابق البحث. امسح البحث أو اختر الكل.',
      computer: 'ضد الكمبيوتر',
      invite: 'دعوة لاعب',
      leaderboardKicker: 'نتائج كل لعبة',
      leaderboardCopy: 'لوحات النتائج مرتبطة بكل لعبة. اختر لعبة لعرض نتائجها.',
      topScores: 'أفضل نتائج {game}',
      leaderboardLoading: 'جاري تحميل النتائج...',
      leaderboardEmpty: 'لا توجد نتائج بعد. سجل أول نتيجة.',
      leaderboardError: 'تعذر تحميل لوحة النتائج.',
      rank: 'الترتيب',
      player: 'اللاعب',
      score: 'النقاط',
      skill: 'المهارة',
      depth: 'العمق',
      time: 'الوقت',
      lesson: 'يدرب',
      footerNote: 'جميع الحقوق محفوظة لـ JAKH 2026',
      footerContact: 'اقترح تغييرات',
      footerPrivacy: 'الخصوصية',
    },
  };

  const state = {
    lang: localStorage.getItem('jakh-lang') || 'en',
    filter: 'all',
    search: '',
    leaderboardGame: 'chess',
    leaderboardAbort: null,
    user: null,
  };

  const els = {};

  function init() {
    els.langSelect = document.getElementById('langSelect');
    forceDarkTheme();
    els.search = document.getElementById('gameSearch');
    els.filters = document.getElementById('gameFilters');

    els.grid = document.getElementById('gameGrid');
    els.empty = document.getElementById('gameEmptyState');
    els.total = document.getElementById('totalGames');
    els.visible = document.getElementById('visibleGames');
    els.results = document.getElementById('gameResultsLabel');
    els.accountButton = document.getElementById('openAuthBtn');
    els.accountStripButton = document.getElementById('accountStripButton');
    els.accountTitle = document.getElementById('accountTitle');
    els.accountCopy = document.getElementById('accountCopy');
    els.leaderboardTitle = document.getElementById('leaderboardTitle');

    // Wire auth button to auth modal
    // Header Sign In button — use brain modal (authModal body is empty on this page)
    document.getElementById('openAuthBtn')?.addEventListener('click', openAccountModal);

    // Inject mobile hamburger menu (play.html uses play.js, not app.js)
    if (!document.getElementById('hamburgerBtn')) {
      const header = document.querySelector('.site-header');
      const nav = document.querySelector('.header-actions');
      if (header && nav) {
        const hbtn = document.createElement('button');
        hbtn.id = 'hamburgerBtn';
        hbtn.className = 'hamburger-btn';
        hbtn.setAttribute('aria-label', state.lang === 'ar' ? 'القائمة' : 'Menu');
        hbtn.setAttribute('aria-expanded', 'false');
        hbtn.textContent = '☰';
        header.insertBefore(hbtn, nav);
        hbtn.addEventListener('click', function () {
          const open = nav.classList.toggle('nav-open');
          hbtn.setAttribute('aria-expanded', String(open));
        });
        document.addEventListener('click', function (e) {
          if (!nav.contains(e.target) && !hbtn.contains(e.target)) {
            nav.classList.remove('nav-open');
            hbtn.setAttribute('aria-expanded', 'false');
          }
        });
      }
    }
    els.leaderboardTabs = document.getElementById('leaderboardTabs');
    els.leaderboardTable = document.getElementById('leaderboardTable');

    if (els.langSelect) {
      els.langSelect.value = state.lang;
      els.langSelect.addEventListener('change', function () {
        state.lang = els.langSelect.value === 'ar' ? 'ar' : 'en';
        localStorage.setItem('jakh-lang', state.lang);
        applyLanguage();
        render();
        loadLeaderboard(state.leaderboardGame);
      });
    }

    els.search?.addEventListener('input', function () {
      state.search = els.search.value.trim().toLowerCase();
      renderGames();
    });

    els.filters?.addEventListener('click', function (event) {
      const button = event.target.closest('[data-filter]');
      if (!button) return;
      state.filter = button.dataset.filter;
      renderFilters();
      renderGames();
    });

    document.addEventListener('click', function (event) {
      if (!event.target.closest('[data-play-account]')) return;
      event.preventDefault();
      openAccountModal();
    });
    els.accountButton?.addEventListener('click', openAccountModal);
    els.accountStripButton?.addEventListener('click', openAccountModal);

    applyLanguage();
    forceDarkTheme();
    render();
    refreshProfile();
    loadLeaderboard(state.leaderboardGame);
  }

  function t(key, params) {
    let value = (copy[state.lang] && copy[state.lang][key]) || copy.en[key] || key;
    Object.entries(params || {}).forEach(function ([name, replacement]) {
      value = value.replace('{' + name + '}', replacement);
    });
    return value;
  }

  function tr(value) {
    return value && (value[state.lang] || value.en) || '';
  }

  function applyLanguage() {
    document.documentElement.lang = state.lang;
    document.documentElement.dir = state.lang === 'ar' ? 'rtl' : 'ltr';
    document.querySelectorAll('[data-i18n]').forEach(node => {
      node.textContent = t(node.dataset.i18n);
    });
    document.querySelectorAll('[data-placeholder]').forEach(node => {
      node.setAttribute('placeholder', t(node.dataset.placeholder));
    });
    forceDarkTheme();
  }

  function clearStoredTheme() {
    try {
      const settings = JSON.parse(localStorage.getItem('jakh-riddles-settings') || '{}');
      localStorage.removeItem('jakh-theme');
      if (settings && Object.prototype.hasOwnProperty.call(settings, 'theme')) {
        delete settings.theme;
        localStorage.setItem('jakh-riddles-settings', JSON.stringify(settings));
      }
    } catch (_) {
    }
  }

  function forceDarkTheme() {
    clearStoredTheme();
    document.documentElement.dataset.theme = 'dark';
    document.documentElement.style.colorScheme = 'dark';
    document.querySelectorAll('meta[name="theme-color"]').forEach(node => {
      node.setAttribute('content', '#0b1020');
    });
    document.querySelectorAll('[data-theme-toggle], [data-theme-select], #themeSelect, .theme-toggle-label').forEach(node => node.remove());
  }

  function render() {
    if (els.total) els.total.textContent = CATALOG.length;
    renderAccount();
    renderFilters();
    renderGames();
    renderLeaderboardTabs();
  }

  function renderAccount() {
    if (state.user) {
      if (els.accountButton) els.accountButton.textContent = t('profile');
      if (els.accountStripButton) els.accountStripButton.textContent = t('profile');
      if (els.accountTitle) els.accountTitle.textContent = t('accountSigned', { name: state.user.username });
      if (els.accountCopy) els.accountCopy.textContent = t('accountSignedCopy');
    } else {
      if (els.accountButton) els.accountButton.textContent = t('signIn');
      if (els.accountStripButton) els.accountStripButton.textContent = t('signIn');
      if (els.accountTitle) els.accountTitle.textContent = t('accountTitle');
      if (els.accountCopy) els.accountCopy.textContent = t('accountCopy');
    }
  }

  function renderFilters() {
    if (!els.filters) return;
    els.filters.innerHTML = filters.map(filter => (
      '<button class="brain-filter-btn" type="button" role="tab" aria-selected="' + (filter.key === state.filter) + '" data-filter="' + escapeHtml(filter.key) + '">' +
        escapeHtml(filter[state.lang] || filter.en) +
      '</button>'
    )).join('');
  }

  function filteredGames() {
    return CATALOG.filter(game => {
      const filterMatch = state.filter === 'all' || game.tags.includes(state.filter);
      const haystack = [
        tr(game.title), tr(game.summary), tr(game.skill), tr(game.depth), tr(game.lesson),
        tr(game.modes), tr(game.time),
      ].join(' ').toLowerCase();
      return filterMatch && (!state.search || haystack.includes(state.search));
    });
  }

  function renderGames() {
    const games = filteredGames();
    if (els.visible) els.visible.textContent = games.length;
    if (els.results) {
      els.results.textContent = t(state.search || state.filter !== 'all' ? 'matchingCount' : 'available', { count: games.length });
    }
    if (els.empty) els.empty.hidden = games.length > 0;
    if (els.grid) els.grid.innerHTML = games.map(game => card(game, false)).join('');
  }

  function card(game, featured) {
    const title = tr(game.title);
    const href = game.href;
    const lockedAttr = state.user ? '' : ' data-play-account="1"';
    const mainHref = state.user ? href : '#';
    const computerHref = state.user ? href + '&mode=computer' : '#';
    const onlineHref = state.user ? href + '&mode=online' : '#';
    return '<article class="brain-game-card' + (featured ? ' is-featured' : '') + '" style="--game-accent:' + escapeHtml(game.accent) + '">' +
      '<a class="brain-card-main" href="' + escapeHtml(mainHref) + '"' + lockedAttr + '>' +
        '<div class="brain-card-art" aria-hidden="true">' + renderArt(game, featured ? 'featured' : 'grid') + '</div>' +
        '<div class="brain-card-body">' +
          '<div class="brain-card-topline"><span>' + escapeHtml(tr(game.time)) + '</span><span>' + escapeHtml(tr(game.depth)) + '</span></div>' +
          '<h3>' + escapeHtml(title) + '</h3>' +
          '<p>' + escapeHtml(tr(game.summary)) + '</p>' +
          '<dl>' +
            '<div><dt>' + escapeHtml(t('skill')) + '</dt><dd>' + escapeHtml(tr(game.skill)) + '</dd></div>' +
            '<div><dt>' + escapeHtml(t('lesson')) + '</dt><dd>' + escapeHtml(tr(game.lesson)) + '</dd></div>' +
          '</dl>' +
        '</div>' +
      '</a>' +
      '<div class="brain-card-actions">' +
        '<a href="' + escapeHtml(computerHref) + '"' + lockedAttr + '>' + escapeHtml(t('computer')) + '</a>' +
        '<a href="' + escapeHtml(onlineHref) + '"' + lockedAttr + '>' + escapeHtml(t('invite')) + '</a>' +
      '</div>' +
    '</article>';
  }

  function renderArt(game, context) {
    const accent = escapeHtml(game.accent || '#c9a227');
    const label = escapeHtml(game.title.en);
    const uid = 'cover-' + escapeHtml(String(game.id || 'game').replace(/[^a-z0-9-]/gi, '')) + '-' + escapeHtml(context || 'card');
    return '<svg class="brain-cover-svg" viewBox="0 0 640 360" role="img" aria-label="' + label + ' cover" style="--cover-accent:' + accent + '">' +
      '<defs>' +
        '<linearGradient id="' + uid + '-glow" x1="0%" y1="0%" x2="100%" y2="100%">' +
          '<stop offset="0%" stop-color="var(--cover-accent)" stop-opacity="0.92"/>' +
          '<stop offset="48%" stop-color="#161a24" stop-opacity="0.96"/>' +
          '<stop offset="100%" stop-color="#05070b" stop-opacity="1"/>' +
        '</linearGradient>' +
        '<radialGradient id="' + uid + '-orb" cx="72%" cy="18%" r="60%">' +
          '<stop offset="0%" stop-color="var(--cover-accent)" stop-opacity="0.54"/>' +
          '<stop offset="100%" stop-color="var(--cover-accent)" stop-opacity="0"/>' +
        '</radialGradient>' +
      '</defs>' +
      '<rect width="640" height="360" rx="26" fill="url(#' + uid + '-glow)"/>' +
      '<rect width="640" height="360" rx="26" fill="url(#' + uid + '-orb)"/>' +
      '<g opacity="0.18" stroke="#fff" stroke-width="1">' + gridLines() + '</g>' +
      '<g class="brain-cover-scene">' + coverScene(game.id) + '</g>' +
      '<path d="M42 42h104M42 42v104M598 318H494M598 318V214" fill="none" stroke="#fff" stroke-opacity=".42" stroke-width="5" stroke-linecap="round"/>' +
    '</svg>';
  }

  function gridLines() {
    let html = '';
    for (let x = 64; x < 640; x += 64) html += '<path d="M' + x + ' 0v360"/>';
    for (let y = 60; y < 360; y += 60) html += '<path d="M0 ' + y + 'h640"/>';
    return html;
  }

  function coverScene(id) {
    const scenes = {
      chess: '<rect x="188" y="78" width="264" height="264" rx="10" fill="#0d111a" stroke="#fff" stroke-opacity=".22" stroke-width="3"/>' + boardSquares(188, 78, 33, 8, true) + pieces([[254,158,'#f8fafc'],[320,125,'#f8fafc'],[386,191,'#0f172a'],[287,257,'#0f172a'],[353,257,'#f8fafc']]),
      checkers: '<rect x="190" y="80" width="260" height="260" rx="12" fill="#120e12" stroke="#fff" stroke-opacity=".2" stroke-width="3"/>' + boardSquares(190, 80, 32.5, 8, false) + discs([[238,128],[303,128],[368,128],[270,193],[335,193],[400,193],[238,258],[303,258],[368,258]], '#f97316'),
      go: '<rect x="156" y="54" width="328" height="252" rx="14" fill="#c99a55" fill-opacity=".78"/>' + lineBoard(190, 84, 6, 48) + stones([[190,84,'#090b10'],[286,132,'#fff'],[382,180,'#090b10'],[238,228,'#fff'],[430,84,'#090b10'],[334,276,'#fff']]),
      reversi: '<rect x="172" y="64" width="296" height="252" rx="14" fill="#10281e" stroke="#fff" stroke-opacity=".18" stroke-width="3"/>' + boardSquares(172, 64, 37, 7, true) + flipDiscs([[246,138,0],[320,138,1],[283,175,1],[357,175,0],[246,249,1],[394,101,0]]),
      backgammon: '<rect x="126" y="64" width="388" height="248" rx="16" fill="#2a1726" stroke="#fff" stroke-opacity=".2" stroke-width="3"/>' + triangles() + discs([[180,102],[222,102],[432,274],[390,274]], '#f8fafc') + discs([[474,102],[432,102],[180,274],[222,274]], '#c084fc'),
      'nine-mens-morris': morrisBoard(),
      oware: '<rect x="116" y="104" width="408" height="152" rx="76" fill="#2b1708" stroke="#fff" stroke-opacity=".2" stroke-width="3"/>' + pits(),
      'four-in-a-row': '<rect x="142" y="66" width="356" height="244" rx="20" fill="#182033" stroke="#fff" stroke-opacity=".24" stroke-width="3"/>' + connectGrid(),
      gomoku: '<rect x="156" y="56" width="328" height="248" rx="14" fill="#151b28" stroke="#fff" stroke-opacity=".18" stroke-width="3"/>' + lineBoard(196, 88, 7, 34) + stones([[230,122,'#fff'],[264,156,'#fff'],[298,190,'#fff'],[332,224,'#fff'],[366,258,'#fff'],[298,122,'#020617'],[332,156,'#020617'],[366,190,'#020617']], true),
      'dots-and-boxes': dotsAndBoxes(),
      hex: hexField(),
      tapatan: '<g stroke="#fff" stroke-opacity=".45" stroke-width="5" stroke-linecap="round"><path d="M212 80h216v216H212zM212 80l216 216M428 80L212 296M320 80v216M212 188h216"/></g>' + discs([[212,80],[320,188],[428,296]], '#34d399') + discs([[428,80],[212,296]], '#fff'),
      alquerque: '<g stroke="#fff" stroke-opacity=".42" stroke-width="4"><path d="M170 70h300v240H170zM170 70l300 240M470 70L170 310M320 70v240M170 190h300M245 70v240M395 70v240"/></g>' + discs([[170,70],[245,70],[320,70],[395,70],[470,70]], '#60a5fa') + discs([[170,310],[245,310],[320,310],[395,310],[470,310]], '#fff'),
      fanorona: '<g stroke="#fff" stroke-opacity=".38" stroke-width="4"><path d="M130 86h380v188H130zM130 86l380 188M510 86L130 274"/><path d="M130 133h380M130 180h380M130 227h380M225 86v188M320 86v188M415 86v188"/></g>' + discs([[225,133],[320,180],[415,227]], '#fbbf24') + discs([[225,227],[320,133],[415,180]], '#fff'),
      'royal-game-of-ur': urBoard(),
      senet: '<rect x="128" y="116" width="384" height="128" rx="14" fill="#3b260d" stroke="#fff" stroke-opacity=".18" stroke-width="3"/>' + boardSquares(128, 116, 64, 2, true) + discs([[160,148],[288,148],[416,212]], '#ca8a04') + discs([[224,212],[352,148],[480,212]], '#fff'),
      'fox-and-geese': '<g stroke="#fff" stroke-opacity=".36" stroke-width="4"><path d="M320 70v230M205 185h230M238 103l164 164M402 103L238 267"/></g>' + discs([[320,70]], '#84cc16') + discs([[205,185],[263,185],[377,185],[435,185],[238,103],[402,103],[238,267],[402,267]], '#fff'),
      seega: '<rect x="170" y="70" width="300" height="240" rx="14" fill="#0f2f2c" stroke="#fff" stroke-opacity=".18" stroke-width="3"/>' + boardSquares(170, 70, 60, 4, true) + discs([[230,130],[290,190],[350,130],[410,190]], '#14b8a6') + discs([[230,250],[290,130],[350,250],[410,130]], '#fff'),
      konane: '<rect x="172" y="64" width="296" height="252" rx="14" fill="#211127" stroke="#fff" stroke-opacity=".18" stroke-width="3"/>' + boardSquares(172, 64, 37, 7, true) + discs([[209,101],[283,101],[357,101],[431,101],[246,138],[320,138],[394,138]], '#e879f9') + discs([[209,249],[283,249],[357,249],[431,249],[246,212],[320,212],[394,212]], '#fff'),
      hnefatafl: '<rect x="166" y="56" width="308" height="252" rx="14" fill="#111827" stroke="#fff" stroke-opacity=".18" stroke-width="3"/>' + boardSquares(166, 56, 28, 10, true) + discs([[320,182]], '#f8fafc') + discs([[236,98],[404,98],[236,266],[404,266],[320,98],[320,266],[236,182],[404,182]], '#94a3b8'),
    };
    return scenes[id] || morrisBoard();
  }

  function boardSquares(x, y, size, count, alternate) {
    let html = '';
    for (let row = 0; row < count; row++) {
      for (let col = 0; col < count; col++) {
        const active = alternate ? (row + col) % 2 === 0 : (row + col) % 2 !== 0;
        html += '<rect x="' + (x + col * size) + '" y="' + (y + row * size) + '" width="' + size + '" height="' + size + '" fill="' + (active ? 'rgba(255,255,255,.12)' : 'rgba(0,0,0,.18)') + '"/>';
      }
    }
    return html;
  }

  function discs(items, color) {
    return items.map(item => '<circle cx="' + item[0] + '" cy="' + item[1] + '" r="19" fill="' + color + '" fill-opacity=".94" stroke="#fff" stroke-opacity=".2" stroke-width="3"/>').join('');
  }

  function pieces(items) {
    return items.map(item => '<path d="M' + item[0] + ' ' + (item[1] + 28) + 'h42l-7-14h-28zM' + (item[0] + 8) + ' ' + (item[1] + 13) + 'h26l-6-36h-14z" fill="' + item[2] + '" stroke="#fff" stroke-opacity=".22" stroke-width="3" transform="translate(-21 0)"/>').join('');
  }

  function stones(items) {
    return items.map(item => '<circle cx="' + item[0] + '" cy="' + item[1] + '" r="17" fill="' + item[2] + '" stroke="#fff" stroke-opacity=".24" stroke-width="2"/>').join('');
  }

  function flipDiscs(items) {
    return items.map(item => '<circle cx="' + item[0] + '" cy="' + item[1] + '" r="20" fill="' + (item[2] ? '#fff' : '#020617') + '" stroke="#fff" stroke-opacity=".18" stroke-width="3"/>').join('');
  }

  function lineBoard(x, y, count, step) {
    let html = '<g stroke="#111827" stroke-opacity=".55" stroke-width="3">';
    for (let i = 0; i < count; i++) {
      html += '<path d="M' + x + ' ' + (y + i * step) + 'h' + ((count - 1) * step) + '"/><path d="M' + (x + i * step) + ' ' + y + 'v' + ((count - 1) * step) + '"/>';
    }
    return html + '</g>';
  }

  function triangles() {
    let html = '';
    for (let i = 0; i < 6; i++) {
      const x = 146 + i * 58;
      html += '<path d="M' + x + ' 78h42l-21 112z" fill="' + (i % 2 ? '#fff' : 'var(--cover-accent)') + '" fill-opacity=".5"/>';
      html += '<path d="M' + x + ' 298h42l-21-112z" fill="' + (i % 2 ? 'var(--cover-accent)' : '#fff') + '" fill-opacity=".45"/>';
    }
    return html;
  }

  function morrisBoard() {
    return '<g fill="none" stroke="#fff" stroke-opacity=".42" stroke-width="5"><rect x="170" y="70" width="300" height="220" rx="6"/><rect x="220" y="105" width="200" height="150" rx="6"/><rect x="270" y="140" width="100" height="80" rx="6"/><path d="M320 70v70M320 220v70M170 180h100M370 180h100"/></g>' + discs([[170,70],[320,140],[470,290]], '#38bdf8') + discs([[470,70],[270,180],[170,290]], '#fff');
  }

  function pits() {
    let html = '';
    for (let i = 0; i < 6; i++) {
      const x = 168 + i * 62;
      html += '<ellipse cx="' + x + '" cy="150" rx="25" ry="22" fill="#0b0d12" fill-opacity=".72" stroke="#fff" stroke-opacity=".16" stroke-width="3"/>';
      html += '<ellipse cx="' + x + '" cy="210" rx="25" ry="22" fill="#0b0d12" fill-opacity=".72" stroke="#fff" stroke-opacity=".16" stroke-width="3"/>';
    }
    return html + discs([[168,150],[230,210],[292,150],[354,210],[416,150],[478,210]], '#f59e0b');
  }

  function connectGrid() {
    let html = '';
    const colors = ['#ef4444', '#fff', '#ef4444', '#fff', '#ef4444', '#fff'];
    for (let row = 0; row < 4; row++) {
      for (let col = 0; col < 6; col++) {
        html += '<circle cx="' + (190 + col * 52) + '" cy="' + (114 + row * 50) + '" r="19" fill="' + colors[(row + col) % colors.length] + '" fill-opacity=".88"/>';
      }
    }
    return html;
  }

  function dotsAndBoxes() {
    let html = '<g stroke="#fff" stroke-opacity=".42" stroke-width="5" stroke-linecap="round">';
    for (let i = 0; i < 4; i++) {
      html += '<path d="M' + (220 + i * 64) + ' 120h44"/><path d="M' + (220 + i * 64) + ' 184h44"/><path d="M' + (220 + i * 64) + ' 248h44"/>';
      html += '<path d="M' + (220 + i * 64) + ' 120v44"/><path d="M' + (284 + i * 64) + ' 184v44"/>';
    }
    html += '</g>';
    for (let y = 120; y <= 248; y += 64) for (let x = 220; x <= 476; x += 64) html += '<circle cx="' + x + '" cy="' + y + '" r="7" fill="#fff"/>';
    return html + '<rect x="284" y="184" width="64" height="64" fill="#a78bfa" fill-opacity=".42"/>';
  }

  function hexField() {
    let html = '<g stroke="#fff" stroke-opacity=".18" stroke-width="3">';
    for (let row = 0; row < 5; row++) {
      for (let col = 0; col < 6; col++) {
        const x = 206 + col * 40 + row * 20;
        const y = 86 + row * 42;
        html += '<path d="M' + x + ' ' + y + 'l20 12v24l-20 12-20-12v-24z" fill="' + ((row + col) % 3 === 0 ? 'var(--cover-accent)' : 'rgba(255,255,255,.08)') + '" fill-opacity=".55"/>';
      }
    }
    return html + '</g>';
  }

  function urBoard() {
    return '<g stroke="#fff" stroke-opacity=".22" stroke-width="3">' +
      boardSquares(170, 96, 46, 3, true) + boardSquares(354, 96, 46, 2, false) + boardSquares(216, 234, 46, 4, true) +
      '</g>' + discs([[193,119],[285,257],[377,119],[423,257]], '#d97706') + discs([[239,119],[331,257]], '#fff');
  }

  function renderLeaderboardTabs() {
    if (!els.leaderboardTabs || els.leaderboardTabs.dataset.ready === 'true') return;
    els.leaderboardTabs.dataset.ready = 'true';
    els.leaderboardTabs.innerHTML = CATALOG.map(game => (
      '<button class="brain-leaderboard-tab" type="button" role="tab" aria-selected="' + (game.id === state.leaderboardGame) + '" data-game="' + escapeHtml(game.id) + '">' +
        escapeHtml(tr(game.title)) +
      '</button>'
    )).join('');
    els.leaderboardTabs.addEventListener('click', function (event) {
      const button = event.target.closest('[data-game]');
      if (!button) return;
      loadLeaderboard(button.dataset.game);
    });
  }

  function setLeaderboardTab(gameId) {
    els.leaderboardTabs?.querySelectorAll('[data-game]').forEach(button => {
      button.setAttribute('aria-selected', button.dataset.game === gameId ? 'true' : 'false');
    });
  }

  function loadLeaderboard(gameId) {
    const game = CATALOG.find(item => item.id === gameId) || CATALOG[0];
    if (!game) return;
    state.leaderboardGame = game.id;
    setLeaderboardTab(game.id);
    if (els.leaderboardTitle) els.leaderboardTitle.textContent = t('topScores', { game: tr(game.title) });
    if (!els.leaderboardTable) return;
    if (state.leaderboardAbort) state.leaderboardAbort.abort();
    state.leaderboardAbort = new AbortController();
    els.leaderboardTable.innerHTML = '<p>' + escapeHtml(t('leaderboardLoading')) + '</p>';

    fetch('/api/boardgame/leaderboard?game=' + encodeURIComponent(game.id) + '&limit=10', {
      credentials: 'include',
      signal: state.leaderboardAbort.signal,
    })
      .then(response => {
        if (!response.ok) throw new Error('Leaderboard unavailable');
        return response.json();
      })
      .then(data => renderLeaderboard(data.leaderboard || []))
      .catch(error => {
        if (error.name === 'AbortError') return;
        els.leaderboardTable.innerHTML = '<p>' + escapeHtml(t('leaderboardError')) + '</p>';
      });
  }

  function renderLeaderboard(rows) {
    if (!rows.length) {
      els.leaderboardTable.innerHTML = '<p>' + escapeHtml(t('leaderboardEmpty')) + '</p>';
      return;
    }
    els.leaderboardTable.innerHTML = '<table><thead><tr><th>' + escapeHtml(t('rank')) + '</th><th>' + escapeHtml(t('player')) + '</th><th>' + escapeHtml(t('score')) + '</th></tr></thead><tbody>' +
      rows.map((row, index) => '<tr><td>' + escapeHtml(row.rank || index + 1) + '</td><td>' + escapeHtml(row.username || 'Anonymous') + '</td><td>' + escapeHtml(row.score || 0) + '</td></tr>').join('') +
      '</tbody></table>';
  }

  async function refreshProfile() {
    try {
      const response = await fetch('/api/user/profile', { credentials: 'include' });
      if (!response.ok) throw new Error('Guest');
      state.user = await response.json();
      if (state.user?.username) localStorage.setItem('jakh-game-username', state.user.username);
    } catch (_) {
      state.user = null;
    }
    render();
  }

  function openAccountModal() {
    const root = document.getElementById('brainModalRoot');
    if (!root) return;
    document.body.classList.add('modal-open');
    const closeBrainModal = () => {
      root.innerHTML = '';
      document.body.classList.remove('modal-open');
    };
    root.innerHTML = '<div class="brain-modal" role="dialog" aria-modal="true">' +
      '<button class="brain-modal-backdrop" type="button" data-close-modal aria-label="Close"></button>' +
      '<section class="brain-modal-card" style="background:#0b0e15;border:1px solid rgba(252,252,252,.24);box-shadow:0 28px 90px rgba(0,0,0,.72);opacity:1">' +
        '<button class="brain-modal-close" type="button" data-close-modal>Close</button>' +
        '<h2>' + escapeHtml(state.user ? state.user.username : t('signIn')) + '</h2>' +
        (state.user ? signedInMarkup() : authMarkup()) +
      '</section>' +
    '</div>';
    root.querySelectorAll('[data-close-modal]').forEach(button => button.addEventListener('click', closeBrainModal));
    if (!state.user) bindAuth(root);
    else root.querySelector('#logoutButton')?.addEventListener('click', async () => {
      await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' }).catch(() => {});
      state.user = null;
      closeBrainModal();
      render();
    });
  }

  function signedInMarkup() {
    return '<p class="brain-muted">' + escapeHtml(t('accountSignedCopy')) + '</p><button class="primary-btn" type="button" id="logoutButton">Sign out</button>';
  }

  function authMarkup() {
    return '<form class="brain-auth-form" id="brainAuthForm">' +
      '<label><span>Username</span><input id="authUsername" required minlength="3" maxlength="20" autocomplete="username" autocapitalize="none" spellcheck="false"></label>' +
      '<label><span>Password</span><input id="authPassword" type="password" required minlength="1" maxlength="128" autocomplete="current-password"></label>' +
      '<button class="primary-btn" type="submit">' + escapeHtml(t('signIn')) + '</button>' +
      '<p class="brain-muted">Use the same JAKH account used for Mind Lab progress.</p>' +
      '<p class="brain-muted"><a href="/?signup=1">' + escapeHtml(t('accountTitle')) + '</a></p>' +
      '<p class="brain-auth-error" id="authError" role="alert"></p>' +
    '</form>';
  }

  function bindAuth(root) {
    root.querySelector('#brainAuthForm')?.addEventListener('submit', async event => {
      event.preventDefault();
      const error = root.querySelector('#authError');
      error.textContent = '';
      try {
        const username = root.querySelector('#authUsername').value.trim();
        const password = root.querySelector('#authPassword').value;
        const response = await fetch('/api/auth/login', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username, password }),
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error || 'Could not sign in');
        await refreshProfile();
        root.innerHTML = '';
        document.body.classList.remove('modal-open');
      } catch (err) {
        error.textContent = err.message || 'Could not sign in';
      }
    });
  }

  function escapeHtml(value) {
    return String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  document.addEventListener('DOMContentLoaded', init);
})();
