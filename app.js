
if (location.protocol === 'http:' && !/^(localhost|127\.0\.0\.1)$/i.test(location.hostname)) {
  location.replace(`https://${location.host}${location.pathname}${location.search}${location.hash}`);
}


// ── Micro-animations ──────────────────────────────────────────────────────────
function spawnConfetti(originEl) {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const rect = originEl.getBoundingClientRect();
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;
  const colors = ['#E8613C','#C9A227','#48d597','#9f7cff','#E2C566','#ff7a8a','#5ac8ff','#F6EFE0'];
  for (let i = 0; i < 18; i++) {
    const dot = document.createElement('div');
    dot.className = 'confetti-dot';
    const angle = (i / 18) * Math.PI * 2 + (Math.random() - 0.5) * 0.6;
    const dist  = 55 + Math.random() * 90;
    const size  = 4 + Math.random() * 7;
    dot.style.cssText = [
      `left:${cx}px`, `top:${cy}px`,
      `width:${size}px`, `height:${size}px`,
      `background:${colors[i % colors.length]}`,
      `border-radius:${Math.random() > 0.45 ? '50%' : '2px'}`,
      `--dx:${(Math.cos(angle) * dist).toFixed(1)}px`,
      `--dy:${(Math.sin(angle) * dist).toFixed(1)}px`,
      `--rot:${(Math.random() > 0.5 ? 1 : -1) * (360 + Math.random() * 360)}deg`,
      `animation-delay:${(Math.random() * 90).toFixed(0)}ms`,
    ].join(';');
    document.body.appendChild(dot);
    dot.addEventListener('animationend', () => dot.remove(), { once: true });
  }
}

function flashCard(id) {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const el = document.querySelector(`.riddle-card[data-id="${CSS.escape(id)}"]`);
  if (!el) return;
  el.classList.remove('flash-success');
  void el.offsetWidth; // reflow to restart animation
  el.classList.add('flash-success');
  el.addEventListener('animationend', () => el.classList.remove('flash-success'), { once: true });
}

const STORAGE_KEYS = {
  settings: 'jakh-riddles-settings',
  audio: 'jakh-audio-enabled',
  trial: 'jakh-trial-used',
};

const DIFFICULTY_POINTS = {
  easy: 1,
  medium: 2,
  hard: 3,
  'very-advanced': 5,
};

const PAGE_SIZE = 20;

const DIRECTORY_PARENT_META = {
  mind: {
    mark: '01',
    label: { en: 'Mind & Logic', ar: 'العقل والمنطق' },
    gradient: 'linear-gradient(135deg,#25124d,#7c3aed 58%,#38bdf8)',
  },
  science: {
    mark: '02',
    label: { en: 'Science & Nature', ar: 'العلوم والطبيعة' },
    gradient: 'linear-gradient(135deg,#063f46,#0f766e 52%,#a3e635)',
  },
  tech: {
    mark: '03',
    label: { en: 'Tech & Engineering', ar: 'التقنية والهندسة' },
    gradient: 'linear-gradient(135deg,#111827,#2563eb 55%,#22d3ee)',
  },
  world: {
    mark: '04',
    label: { en: 'World & Society', ar: 'العالم والمجتمع' },
    gradient: 'linear-gradient(135deg,#3d1f0f,#b45309 54%,#facc15)',
  },
  culture: {
    mark: '05',
    label: { en: 'Arts & Pop Culture', ar: 'الفنون والثقافة' },
    gradient: 'linear-gradient(135deg,#3b0764,#be185d 52%,#f97316)',
  },
};

const CATEGORY_COLLECTIONS = [
  {
    key: 'riddle-forge',
    parent: 'mind',
    title: { en: 'Riddle Forge', ar: 'ورشة الألغاز' },
    description: { en: 'Classic, logic, and family-friendly puzzles grouped into one clear starting point.', ar: 'ألغاز كلاسيكية ومنطقية وعائلية في نقطة بداية واحدة واضحة.' },
    gradient: 'linear-gradient(135deg,#1f1147,#7c3aed 48%,#f59e0b)',
    accent: '#A78BFA',
    members: ['classic-riddles', 'logic-puzzles', 'kids-riddles'],
  },
  {
    key: 'human-signals',
    parent: 'mind',
    title: { en: 'Human Signals', ar: 'إشارات الإنسان' },
    description: { en: 'Psychology, philosophy, and relationships for questions about how people think and connect.', ar: 'علم النفس والفلسفة والعلاقات لأسئلة عن التفكير والتواصل الإنساني.' },
    gradient: 'linear-gradient(135deg,#2e1065,#9333ea 50%,#f472b6)',
    accent: '#C084FC',
    members: ['psychology', 'philosophy', 'relationship-questions'],
  },
  {
    key: 'mystery-desk',
    parent: 'mind',
    title: { en: 'Mystery Desk', ar: 'مكتب الغموض' },
    description: { en: 'Story riddles and true-crime style puzzles kept together for suspense seekers.', ar: 'ألغاز القصص والغموض والجريمة في مجموعة واحدة لمحبي التشويق.' },
    gradient: 'linear-gradient(135deg,#111827,#4c0519 52%,#ef4444)',
    accent: '#FB7185',
    members: ['story-mysteries', 'true-crime'],
  },
  {
    key: 'living-planet',
    parent: 'science',
    title: { en: 'Living Planet', ar: 'الكوكب الحي' },
    description: { en: 'Biology, animals, ecology, and wilderness questions in one natural collection.', ar: 'الأحياء والحيوانات والبيئة والبقاء في مجموعة طبيعية واحدة.' },
    gradient: 'linear-gradient(135deg,#052e16,#16a34a 48%,#22d3ee)',
    accent: '#2DD4BF',
    members: ['biology', 'animal-kingdom', 'environment-and-ecology', 'survival'],
  },
  {
    key: 'core-science-lab',
    parent: 'science',
    title: { en: 'Core Science Lab', ar: 'مختبر العلوم الأساسية' },
    description: { en: 'Math, chemistry, earth science, and broad science pages consolidated for STEM learners.', ar: 'الرياضيات والكيمياء وعلوم الأرض والعلوم العامة للمتعلمين في مسار واحد.' },
    gradient: 'linear-gradient(135deg,#0f172a,#2563eb 48%,#22d3ee)',
    accent: '#38BDF8',
    members: ['math', 'science', 'chemistry', 'physical-and-life-sciences', 'geology'],
  },
  {
    key: 'medicine-cabinet',
    parent: 'science',
    title: { en: 'Medicine Cabinet', ar: 'خزانة الطب' },
    description: { en: 'Medical science and pharmacy grouped for health-focused study sessions.', ar: 'العلوم الطبية والصيدلة في مجموعة مخصصة للمعرفة الصحية.' },
    gradient: 'linear-gradient(135deg,#4a044e,#be185d 50%,#86efac)',
    accent: '#F472B6',
    members: ['medical-questions', 'pharmacy'],
  },
  {
    key: 'orbit-and-energy',
    parent: 'science',
    title: { en: 'Orbit & Energy', ar: 'المدار والطاقة' },
    description: { en: 'Space, astronomy, future technology, and energy systems bundled as frontier topics.', ar: 'الفضاء والفلك والتقنيات المستقبلية والطاقة في مجموعة للحدود الجديدة.' },
    gradient: 'linear-gradient(135deg,#020617,#1d4ed8 45%,#67e8f9)',
    accent: '#67E8F9',
    members: ['space-and-astrology', 'future-tech-and-energy'],
  },
  {
    key: 'digital-workshop',
    parent: 'tech',
    title: { en: 'Digital Workshop', ar: 'ورشة التقنية' },
    description: { en: 'Software, coding, design, and retro tech brought together for digital curiosity.', ar: 'البرمجة والتصميم والحوسبة والتقنية القديمة في مساحة رقمية واحدة.' },
    gradient: 'linear-gradient(135deg,#0f172a,#4f46e5 48%,#84cc16)',
    accent: '#60A5FA',
    members: ['software-and-computing', 'coding-and-design', 'tech-retro'],
  },
  {
    key: 'built-systems',
    parent: 'tech',
    title: { en: 'Built Systems', ar: 'الأنظمة المبنية' },
    description: { en: 'Engineering disciplines, infrastructure, architecture, and invention questions under one roof.', ar: 'الهندسة والبنية التحتية والعمارة والاختراعات تحت سقف واحد.' },
    gradient: 'linear-gradient(135deg,#111827,#475569 48%,#f97316)',
    accent: '#94A3B8',
    members: ['civil-engineering', 'electrical-engineering', 'mechanical-engineering', 'infrastructure-systems', 'architecture-and-landmarks', 'inventions-and-minds'],
  },
  {
    key: 'speed-and-stadiums',
    parent: 'tech',
    title: { en: 'Speed & Stadiums', ar: 'السرعة والملاعب' },
    description: { en: 'Football and automotive questions grouped around performance, machines, and competition.', ar: 'أسئلة كرة القدم والسيارات حول الأداء والآلات والمنافسة.' },
    gradient: 'linear-gradient(135deg,#052e16,#16a34a 45%,#f97316)',
    accent: '#4ADE80',
    members: ['football', 'automotive'],
  },
  {
    key: 'atlas-room',
    parent: 'world',
    title: { en: 'Atlas Room', ar: 'غرفة الأطلس' },
    description: { en: 'Geography, flags, currencies, food, and daily customs for exploring the world quickly.', ar: 'الجغرافيا والأعلام والعملات والطعام والعادات لاستكشاف العالم بسهولة.' },
    gradient: 'linear-gradient(135deg,#0c4a6e,#0284c7 48%,#facc15)',
    accent: '#38BDF8',
    members: ['geography', 'flag-questions', 'currencies', 'world-habits-and-etiquette', 'food-and-cuisines'],
  },
  {
    key: 'time-archive',
    parent: 'world',
    title: { en: 'Time Archive', ar: 'أرشيف الزمن' },
    description: { en: 'History, ancient civilizations, Middle East history, and regional law arranged as one timeline.', ar: 'التاريخ والحضارات القديمة وتاريخ الشرق الأوسط والقانون في خط زمني واحد.' },
    gradient: 'linear-gradient(135deg,#431407,#92400e 50%,#fbbf24)',
    accent: '#F9A825',
    members: ['history', 'ancient-civilizations', 'middle-east-history', 'law-middle-east'],
  },
  {
    key: 'society-engine',
    parent: 'world',
    title: { en: 'Society Engine', ar: 'محرك المجتمع' },
    description: { en: 'Business, economics, social science, and language grouped around how societies work.', ar: 'الأعمال والاقتصاد والعلوم الاجتماعية واللغة لفهم طريقة عمل المجتمعات.' },
    gradient: 'linear-gradient(135deg,#042f2e,#0f766e 48%,#f59e0b)',
    accent: '#2DD4BF',
    members: ['business-and-management', 'economics-and-finance', 'social-sciences', 'linguistics'],
  },
  {
    key: 'gallery-and-myths',
    parent: 'culture',
    title: { en: 'Gallery & Myths', ar: 'المعرض والأساطير' },
    description: { en: 'Art, books, music, and mythology combined for a richer creative-culture lane.', ar: 'الفن والكتب والموسيقى والأساطير في مسار ثقافي إبداعي واحد.' },
    gradient: 'linear-gradient(135deg,#3b0764,#a21caf 48%,#f59e0b)',
    accent: '#F0ABFC',
    members: ['art-and-painters', 'books-and-quotes', 'music-and-performing-arts', 'mythology-legends'],
  },
  {
    key: 'screen-worlds',
    parent: 'culture',
    title: { en: 'Screen Worlds', ar: 'عوالم الشاشة' },
    description: { en: 'TV, cinema, anime, Spacetoon, superheroes, pop culture, and fictional universes in one fandom hub.', ar: 'التلفزيون والسينما والأنمي وسبيستون والأبطال والثقافة الشعبية والعوالم الخيالية في مركز واحد.' },
    gradient: 'linear-gradient(135deg,#1e1b4b,#be185d 48%,#f97316)',
    accent: '#FB7185',
    members: ['tv-shows-trivia', 'cinema-and-film-history', 'anime', 'ayam-tayebeen', 'pop-culture', 'superheroes', 'fictional-worlds'],
  },
];

const CATEGORY_GRADIENTS = {
  'art-and-painters':           'linear-gradient(135deg, #FF6B6B 0%, #FFA500 100%)',
  'biology':                    'linear-gradient(135deg, #00C9A7 0%, #005CE6 100%)',
  'books-and-quotes':           'linear-gradient(135deg, #6B3A2A 0%, #D4A017 100%)',
  'business-and-management':    'linear-gradient(135deg, #1E3A5F 0%, #4A90D9 100%)',
  'chemistry':                  'linear-gradient(135deg, #7B2FBE 0%, #00C9A7 100%)',
  'civil-engineering':          'linear-gradient(135deg, #607D8B 0%, #B0BEC5 100%)',
  'classic-riddles':            'linear-gradient(135deg, #4A0E8F 0%, #C77DFF 100%)',
  'coding-and-design':          'linear-gradient(135deg, #0D47A1 0%, #26C6DA 100%)',
  'electrical-engineering':     'linear-gradient(135deg, #FF8F00 0%, #EF5350 100%)',
  'flag-questions':             'linear-gradient(135deg, #C62828 0%, #1565C0 100%)',
  'football':                   'linear-gradient(135deg, #2E7D32 0%, #66BB6A 100%)',
  'geography':                  'linear-gradient(135deg, #0277BD 0%, #26C6DA 100%)',
  'geology':                    'linear-gradient(135deg, #5D4037 0%, #D7CCC8 100%)',
  'history':                    'linear-gradient(135deg, #B71C1C 0%, #4A148C 100%)',
  'infrastructure-systems':     'linear-gradient(135deg, #37474F 0%, #78909C 100%)',
  'kids-riddles':               'linear-gradient(135deg, #FF6B6B 0%, #FFD93D 100%)',
  'law-middle-east':            'linear-gradient(135deg, #1A237E 0%, #C0A060 100%)',
  'math':                       'linear-gradient(135deg, #0D47A1 0%, #7B1FA2 100%)',
  'mechanical-engineering':     'linear-gradient(135deg, #263238 0%, #78909C 100%)',
  'medical-questions':          'linear-gradient(135deg, #AD1457 0%, #F48FB1 100%)',
  'middle-east-history':        'linear-gradient(135deg, #4E342E 0%, #F9A825 100%)',
  'philosophy':                 'linear-gradient(135deg, #4A148C 0%, #9C4DCC 100%)',
  'physical-and-life-sciences': 'linear-gradient(135deg, #0D47A1 0%, #00BCD4 100%)',
  'pharmacy':                   'linear-gradient(135deg, #1B5E20 0%, #66BB6A 100%)',
  'psychology':                 'linear-gradient(135deg, #4527A0 0%, #9C4DCC 100%)',
  'relationship-questions':     'linear-gradient(135deg, #880E4F 0%, #F06292 100%)',
  'science':                    'linear-gradient(135deg, #01579B 0%, #26C6DA 100%)',
  'social-sciences':            'linear-gradient(135deg, #006064 0%, #26C6DA 100%)',
  'software-and-computing':     'linear-gradient(135deg, #1A1A2E 0%, #5C6BC0 100%)',
  'space-and-astrology':        'linear-gradient(135deg, #0D0D2B 0%, #1A237E 100%)',
  'story-mysteries':            'linear-gradient(135deg, #1A1A2E 0%, #4A4A8A 100%)',
  'tv-shows-trivia':            'linear-gradient(135deg, #311B92 0%, #AD1457 100%)',
  'world-habits-and-etiquette': 'linear-gradient(135deg, #BF360C 0%, #5C6BC0 100%)',
  'environment-and-ecology':    'linear-gradient(135deg, #1B5E20 0%, #76FF03 100%)',
  'ancient-civilizations':      'linear-gradient(135deg, #4E342E 0%, #FFD54F 100%)',
  'inventions-and-minds':       'linear-gradient(135deg, #1A237E 0%, #FF6F00 100%)',
  'animal-kingdom':             'linear-gradient(135deg, #33691E 0%, #FF8F00 100%)',
  'economics-and-finance':      'linear-gradient(135deg, #004D40 0%, #FFD600 100%)',
  'architecture-and-landmarks': 'linear-gradient(135deg, #37474F 0%, #FF8A65 100%)',
  'music-and-performing-arts':  'linear-gradient(135deg, #4A148C 0%, #F50057 100%)',
  'food-and-cuisines':          'linear-gradient(135deg, #E65100 0%, #FDD835 100%)',
  'cinema-and-film-history':    'linear-gradient(135deg, #212121 0%, #B71C1C 100%)',
  'future-tech-and-energy':     'linear-gradient(135deg, #006064 0%, #00E5FF 100%)',
  'anime':                      'linear-gradient(135deg, #FF416C 0%, #FF4B2B 100%)',
  'ayam-tayebeen':              'linear-gradient(135deg, #6C3483 0%, #1A5276 100%)',
  'mythology-legends':          'linear-gradient(135deg, #D4AF37 0%, #8A2BE2 100%)',
  'true-crime':                 'linear-gradient(135deg, #8B0000 0%, #1A1A1A 100%)',
  'pop-culture':                'linear-gradient(135deg, #FF69B4 0%, #00FFFF 100%)',
  'superheroes':                'linear-gradient(135deg, #EF4444 0%, #3B82F6 100%)',
  'fictional-worlds':           'linear-gradient(135deg, #10B981 0%, #065F46 100%)',
  'survival':                   'linear-gradient(135deg, #228B22 0%, #8B4513 100%)',
  'automotive':                 'linear-gradient(135deg, #9CA3AF 0%, #F97316 100%)',
  'linguistics':                'linear-gradient(135deg, #8B5CF6 0%, #C084FC 100%)',
  'currencies':                 'linear-gradient(135deg, #059669 0%, #F59E0B 100%)',
  'tech-retro':                 'linear-gradient(135deg, #84CC16 0%, #111827 100%)',
};

const CATEGORY_COLORS = {
  'art-and-painters':           '#FF6B6B',
  'biology':                    '#2DD4BF',
  'books-and-quotes':           '#D4A455',
  'business-and-management':    '#60A5FA',
  'chemistry':                  '#C084FC',
  'civil-engineering':          '#94A3B8',
  'classic-riddles':            '#A78BFA',
  'coding-and-design':          '#38BDF8',
  'electrical-engineering':     '#FBBF24',
  'flag-questions':             '#F87171',
  'football':                   '#4ADE80',
  'geography':                  '#38BDF8',
  'geology':                    '#B8956A',
  'history':                    '#FB7185',
  'infrastructure-systems':     '#94A3B8',
  'kids-riddles':                '#FBBF24',
  'law-middle-east':            '#C9A227',
  'math':                       '#818CF8',
  'mechanical-engineering':     '#94A3B8',
  'medical-questions':          '#F472B6',
  'middle-east-history':        '#F9A825',
  'philosophy':                 '#C084FC',
  'physical-and-life-sciences': '#22D3EE',
  'pharmacy':                   '#4ADE80',
  'psychology':                 '#A78BFA',
  'relationship-questions':     '#FB7185',
  'science':                    '#22D3EE',
  'social-sciences':            '#34D399',
  'software-and-computing':     '#818CF8',
  'space-and-astrology':        '#6366F1',
  'story-mysteries':            '#818CF8',
  'tv-shows-trivia':            '#E879F9',
  'world-habits-and-etiquette': '#FB923C',
  'environment-and-ecology':    '#4ADE80',
  'ancient-civilizations':      '#FCD34D',
  'inventions-and-minds':       '#FB923C',
  'animal-kingdom':             '#86EFAC',
  'economics-and-finance':      '#FCD34D',
  'architecture-and-landmarks': '#FDA4AF',
  'music-and-performing-arts':  '#F472B6',
  'food-and-cuisines':          '#FDBA74',
  'cinema-and-film-history':    '#F87171',
  'future-tech-and-energy':     '#67E8F9',
  'anime':                      '#FB7185',
  'ayam-tayebeen':              '#C084FC',
  'mythology-legends':          '#D4AF37',
  'true-crime':                 '#8B0000',
  'pop-culture':                '#FF69B4',
  'superheroes':                '#EF4444',
  'fictional-worlds':           '#10B981',
  'survival':                   '#228B22',
  'automotive':                 '#F97316',
  'linguistics':                '#8B5CF6',
  'currencies':                 '#059669',
  'tech-retro':                 '#84CC16',
};

const UI = {
  en: {
    brandSubtitle: 'bilingual categories, teams, and saved progress',
    navHome: 'Home',
    navCategories: 'Categories',
    authOpen: 'Sign in',
    language: 'Language',
    homeEyebrow: '3,500+ bilingual riddles — English & Arabic',
    homeTitle: 'Pick a topic. Flip cards. See how much you know.',
    homeText: 'Choose a category, tap a card to reveal the answer, then mark it right or wrong. Free forever, no app needed.',
    browseCategories: 'Explore collections',
    heroGameHub: 'Game Hub',
    statCategories: 'Collections',
    statQuestions: 'Questions',
    statLanguages: 'Languages',
    portalMindTag: 'Mind Lab',
    portalMindTitle: 'The Mind Lab',
    portalMindDesc: '3,500+ bilingual questions organized into 15 curated collections across 5 clear tracks. Pick a collection, open a topic, flip cards, track your score.',
    portalMindStat: '15 collections',
    portalMindCta: 'Explore Riddles →',
    portalGamesTag: 'Game Hub',
    portalGamesTitle: 'The Game Hub',
    portalGamesDesc: 'Chess, Mastermind, Go, Reversi, Codenames, Catan, Backgammon, Set, Hanabi, Diplomacy — 10 fully playable browser games. No download, no sign-up.',
    portalGamesStat1: '10 games live',
    portalGamesStat2: 'All in browser',
    portalGamesCta: 'Play Now →',
    createAccount: 'Save my progress',
    todayMomentum: 'Your snapshot',
    localBrowserOnly: 'Saved to your account',
    categoryEyebrow: 'Choose a section',
    categoryTitle: 'What would you like to explore?',
    categoryText: 'Start with a curated collection, or search for a specific topic if you already know what you want.',
    searchCategoriesLabel: 'Search category pages',
    tracksLabel: 'Tracks',
    resetDirectoryFilters: 'Reset filters',
    authEyebrow: 'Profile',
    authTitle: 'Create account or sign in',
    footerNote: 'All rights reserved to JAKH 2026',

    pageProgress: 'Page progress',
    insidePageEyebrow: 'Inside this page',
    insidePageTitle: 'Flip the full category set',
    insidePageText: 'Use search, difficulty, favorites, solved state, and show filters where available.',
    searchThisPageLabel: 'Search this page',
    difficultyLabel: 'Difficulty',
    showLabel: 'Show',
    sortLabel: 'Sort',
    subcategoriesLabel: 'Subcategories',
    resetFilters: 'Reset filters',
    emptyTitle: 'No cards match that combination.',
    emptyText: 'Try clearing a filter or broadening the search.',
    relatedEyebrow: 'Keep exploring',
    relatedTitle: 'Related category pages',
    relatedText: 'Jump to nearby topics without going back to the home page.',
    easy: 'Piece of Cake',
    medium: 'Brain Tickler',
    hard: 'Head Scratcher',
    veryAdvanced: 'Brick Wall',
    allLevels: 'All levels',
    everything: 'Everything',
    onlyUnsolved: 'Only unsolved',
    onlySolved: 'Only solved',
    onlyFavorites: 'Only favorites',
    featuredOrder: 'Featured order',
    byDifficulty: 'By difficulty',
    aToZ: 'A → Z',
    shuffleNow: 'Shuffle now',
    pageQuestions: '{count} questions',
    categoryCountLabel: '{count} categories',
    totalQuestionLabel: '{count} questions',
    showingAllPages: 'Showing all {count} category pages.',
    showingFilteredPages: 'Showing {count} category pages with the current filters.',
    showingAllCards: 'Showing all {count} cards on this page.',
    showingFilteredCards: 'Showing {count} cards with your current filters.',
    openPage: 'Open page',
    savedProgress: 'Saved progress',
    guestTitle: 'Create an account',
    guestText: 'Create a free account to save your progress, favorites, and score across all your devices.',
    createLocalProfile: 'Create account',
    signedInAs: 'Signed in as',
    score: 'Score',
    solved: 'Solved',
    favorites: 'Favorites',
    authSignInTab: 'Sign in',
    authRegisterTab: 'Create account',
    username: 'Username',
    password: 'Password',
    passwordHint: 'Securely stored in your cloud account.',
    signIn: 'Sign in',
    register: 'Create account',
    logout: 'Log out',
    accountReady: 'Your progress is saved to your cloud account.',
    flipForAnswer: 'Flip for answer',
    backToQuestion: 'Back to question',
    addFavorite: 'Add favorite',
    removeFavorite: 'Remove favorite',
    markSolved: 'Correct',
    markWrong: 'Wrong',
    markUnsolved: 'Remove',
    answerReveal: 'Answer',
    loginNeeded: 'Please sign in first to save favorites and scores.',
    accountCreated: 'Account created and signed in.',
    signedIn: 'Signed in successfully.',
    signedOut: 'Signed out.',
    badLogin: 'Username or password is incorrect.',
    userExists: 'That username is already taken.',
    languageSet: 'Language updated.',
    directoryResetDone: 'Category filters reset.',
    pageResetDone: 'Page filters reset.',
    favoriteAdded: 'Added to favorites.',
    favoriteRemoved: 'Removed from favorites.',
    solvedAdded: 'Correct! Score updated.',
    markedWrong: 'Marked as wrong.',
    solvedRemoved: 'Answer removed.',
    memberName: 'Member name',
    resetScore: 'Reset score',
    noRelated: 'No related categories available.',
    audioPlay: 'Read aloud',
    audioStop: 'Stop',
    audioOn: 'Audio on',
    audioOff: 'Audio off',
    suggestTitle: 'Got a topic idea?',
    suggestSub: 'Suggest a new riddle category or topic and we\'ll consider adding it.',
    suggestPlaceholder: 'Your idea…',
    suggestEmailPlaceholder: 'Email (optional)',
    suggestSubmit: 'Submit Idea',
    suggestThanks: 'Thank you! We\'ll take a look.',
    suggestError: 'Please write at least 5 characters.',
    lockHard: 'Answer any 10 questions correctly to unlock Head Scratcher.',
    lockDifficult: 'Answer 10 Head Scratcher questions correctly to unlock Brick Wall.',
    lockSignIn: 'Sign in to unlock this level.',
    badgesTitle: 'Badges',
    badgeBronze: 'Bronze — 10 Piece of Cake answered correctly',
    badgeSilver: 'Silver — 10 Brain Tickler answered correctly',
    badgeGold: 'Gold — 10 Head Scratcher answered correctly',
    badgeDiamond: 'Diamond — 10 Brick Wall answered correctly',
    reportTitle: 'Score Report',
    reportCategory: 'Category',
    reportCorrect: 'Correct',
    reportWrong: 'Wrong',
    // Achievements
    achievementsTitle: 'Achievements',
    achNoAchievements: 'No achievements yet — start answering!',
    // Report
    reportBtn: 'Report',
    reportThanks: 'Reported — thanks for the feedback!',
    reportError: 'Could not submit report.',
    // Share
    shareCopied: 'Result copied to clipboard!',
    // Streak freeze
    streakFreezeLabel: '🧊 Freeze',
  },
  ar: {
    brandSubtitle: 'فئات ثنائية اللغة مع فرق وتقدّم محفوظ',
    navHome: 'الرئيسية',
    navCategories: 'الفئات',
    authOpen: 'تسجيل الدخول',
    language: 'اللغة',
    homeEyebrow: '+3500 لغز ثنائي اللغة — عربي وإنجليزي',
    homeTitle: 'اختر موضوعًا، اقلب البطاقات، واكتشف قدراتك.',
    homeText: 'اختر فئة، اضغط على البطاقة لتظهر الإجابة، ثم حدّد إجابتك صحيحة أم خاطئة. مجاني تمامًا وبدون تطبيق.',
    browseCategories: 'استكشف المجموعات',
    heroGameHub: 'مركز الألعاب',
    statCategories: 'المجموعات',
    statQuestions: 'الأسئلة',
    statLanguages: 'اللغات',
    portalMindTag: 'مختبر العقول',
    portalMindTitle: 'مختبر العقول',
    portalMindDesc: '+3500 سؤال ثنائي اللغة منظمة في 15 مجموعة مختارة ضمن 5 مسارات واضحة. اختر مجموعة، افتح موضوعًا، واقلب البطاقات وتابع نقاطك.',
    portalMindStat: '15 مجموعة',
    portalMindCta: 'استكشف الألغاز →',
    portalGamesTag: 'مركز الألعاب',
    portalGamesTitle: 'مركز الألعاب',
    portalGamesDesc: 'شطرنج، ماستر مايند، غو، ريفرسي، كودنيمز، كاتان، طاولة، ست، هانابي، دبلوماسي — 10 ألعاب كاملة في المتصفح. بدون تنزيل أو تسجيل.',
    portalGamesStat1: '10 ألعاب',
    portalGamesStat2: 'كلها في المتصفح',
    portalGamesCta: 'العب الآن →',
    createAccount: 'احفظ تقدمي',
    todayMomentum: 'ملخصك',
    localBrowserOnly: 'محفوظ في حسابك',
    categoryEyebrow: 'اختر قسمًا',
    categoryTitle: 'ماذا تريد أن تستكشف؟',
    categoryText: 'ابدأ بمجموعة مختارة، أو ابحث عن موضوع محدد إذا كنت تعرف ما تريد.',
    searchCategoriesLabel: 'ابحث في صفحات الفئات',
    tracksLabel: 'المسارات',
    resetDirectoryFilters: 'إعادة الضبط',
    authEyebrow: 'الملف الشخصي',
    authTitle: 'أنشئ حسابًا أو سجّل الدخول',
    footerNote: 'جميع الحقوق محفوظة لـ JAKH 2026',

    pageProgress: 'تقدم الصفحة',
    insidePageEyebrow: 'داخل هذه الصفحة',
    insidePageTitle: 'اقلب المجموعة الكاملة',
    insidePageText: 'استخدم البحث والصعوبة والمفضلة والحالة وفلاتر المسلسلات عند توفرها.',
    searchThisPageLabel: 'ابحث داخل الصفحة',
    difficultyLabel: 'الصعوبة',
    showLabel: 'العرض',
    sortLabel: 'الترتيب',
    subcategoriesLabel: 'الفئات الفرعية',
    resetFilters: 'إعادة ضبط الفلاتر',
    emptyTitle: 'لا توجد بطاقات تطابق هذا الجمع.',
    emptyText: 'جرّب إزالة أحد الفلاتر أو توسيع البحث.',
    relatedEyebrow: 'واصل الاستكشاف',
    relatedTitle: 'صفحات فئات قريبة',
    relatedText: 'انتقل إلى مواضيع قريبة من دون الرجوع إلى الصفحة الرئيسية.',
    easy: 'سهل',
    medium: 'متوسط',
    hard: 'صعب',
    veryAdvanced: 'صعب جداً',
    allLevels: 'كل المستويات',
    everything: 'الكل',
    onlyUnsolved: 'غير المحلول فقط',
    onlySolved: 'المحلول فقط',
    onlyFavorites: 'المفضلة فقط',
    featuredOrder: 'الترتيب الأساسي',
    byDifficulty: 'حسب الصعوبة',
    aToZ: 'أ → ي',
    shuffleNow: 'خلط',
    pageQuestions: '{count} سؤال',
    categoryCountLabel: '{count} فئة',
    totalQuestionLabel: '{count} سؤال',
    showingAllPages: 'يتم عرض كل صفحات الفئات وعددها {count}.',
    showingFilteredPages: 'يتم عرض {count} صفحة فئة وفق الفلاتر الحالية.',
    showingAllCards: 'يتم عرض كل بطاقات الصفحة وعددها {count}.',
    showingFilteredCards: 'يتم عرض {count} بطاقة وفق الفلاتر الحالية.',
    openPage: 'افتح الصفحة',
    savedProgress: 'تقدم محفوظ',
    guestTitle: 'أنشئ حسابًا',
    guestText: 'أنشئ حسابًا مجانيًا لحفظ تقدمك ومفضلتك ونقاطك على جميع أجهزتك.',
    createLocalProfile: 'أنشئ حسابًا',
    signedInAs: 'مسجل باسم',
    score: 'النقاط',
    solved: 'المحلول',
    favorites: 'المفضلة',
    authSignInTab: 'تسجيل الدخول',
    authRegisterTab: 'إنشاء حساب',
    username: 'اسم المستخدم',
    password: 'كلمة المرور',
    passwordHint: 'تُخزن بأمان في حسابك السحابي.',
    signIn: 'دخول',
    register: 'إنشاء حساب',
    logout: 'تسجيل الخروج',
    accountReady: 'تقدمك محفوظ في حسابك السحابي.',
    flipForAnswer: 'اقلب للإجابة',
    backToQuestion: 'العودة للسؤال',
    addFavorite: 'أضف للمفضلة',
    removeFavorite: 'أزل من المفضلة',
    markSolved: 'صحيح',
    markWrong: 'خاطئ',
    markUnsolved: 'إزالة',
    answerReveal: 'الإجابة',
    loginNeeded: 'الرجاء تسجيل الدخول أولًا لحفظ المفضلة والنقاط.',
    accountCreated: 'تم إنشاء الحساب وتسجيل الدخول.',
    signedIn: 'تم تسجيل الدخول بنجاح.',
    signedOut: 'تم تسجيل الخروج.',
    badLogin: 'اسم المستخدم أو كلمة المرور غير صحيحين.',
    userExists: 'اسم المستخدم هذا مأخوذ بالفعل.',
    languageSet: 'تم تحديث اللغة.',
    directoryResetDone: 'تمت إعادة ضبط فلاتر الفئات.',
    pageResetDone: 'تمت إعادة ضبط فلاتر الصفحة.',
    favoriteAdded: 'تمت الإضافة إلى المفضلة.',
    favoriteRemoved: 'تمت الإزالة من المفضلة.',
    solvedAdded: 'صحيح! تم تحديث النقاط.',
    markedWrong: 'تم وضعه كخاطئ.',
    solvedRemoved: 'تمت إزالة الإجابة.',
    memberName: 'اسم العضو',
    resetScore: 'تصفير النقاط',
    noRelated: 'لا توجد صفحات قريبة متاحة.',
    audioPlay: 'اقرأ بصوت عالٍ',
    audioStop: 'إيقاف',
    audioOn: 'الصوت مفعّل',
    audioOff: 'الصوت معطّل',
    suggestTitle: 'هل لديك فكرة لموضوع جديد؟',
    suggestSub: 'اقترح فئة أو موضوعًا جديدًا وسنأخذه بعين الاعتبار.',
    suggestPlaceholder: 'فكرتك…',
    suggestEmailPlaceholder: 'البريد الإلكتروني (اختياري)',
    suggestSubmit: 'أرسل الفكرة',
    suggestThanks: 'شكرًا لك! سنراجع اقتراحك.',
    suggestError: 'الرجاء كتابة 5 أحرف على الأقل.',
    lockHard: 'أجب على أي 10 أسئلة بشكل صحيح لفتح مستوى الصعب.',
    lockDifficult: 'أجب على 10 أسئلة صعبة بشكل صحيح لفتح مستوى صعب جداً.',
    lockSignIn: 'سجّل الدخول لفتح هذا المستوى.',
    badgesTitle: 'الشارات',
    badgeBronze: 'برونزية — 10 أسئلة سهلة صحيحة',
    badgeSilver: 'فضية — 10 أسئلة متوسطة صحيحة',
    badgeGold: 'ذهبية — 10 أسئلة صعبة صحيحة',
    badgeDiamond: 'ماسية — 10 أسئلة صعب جداً صحيحة',
    reportTitle: 'تقرير النتائج',
    reportCategory: 'الفئة',
    reportCorrect: 'صحيح',
    reportWrong: 'خاطئ',
    achievementsTitle: 'الإنجازات',
    achNoAchievements: 'لا إنجازات بعد — ابدأ بالإجابة!',
    reportBtn: 'إبلاغ',
    reportThanks: 'تم الإبلاغ — شكرًا على ملاحظتك!',
    reportError: 'تعذّر إرسال البلاغ.',
    shareCopied: 'تم نسخ النتيجة!',
    streakFreezeLabel: '🧊 تجميد',
  }
};

const state = {
  lang: 'en',
  theme: 'dark',
  catalog: null,
  page: document.body.dataset.page || 'home',
  categorySlug: document.body.dataset.category || '',
  categoryData: null,
  directorySearch: '',
  cluster: 'all',
  collection: 'all',
  search: '',
  difficulty: 'all',
  view: 'all',
  sort: 'featured',
  subcategory: 'all',
  apiAvailable: false,
  dbUser: null,
  flipped: new Set(),
  cardPage: 1,
  streak: 0,
  freezeCount: 0,
  dailyCard: null,
};

const timedQuizState = {
  cards: [], index: 0, score: 0, timer: null, timeLeft: 20,
};

const GUEST_KEYS = {
  solved: 'jakh-guest-solved',
  favorites: 'jakh-guest-favorites',
};

function getGuestSolvedMap() {
  return loadJson(GUEST_KEYS.solved, {});
}

function getGuestFavorites() {
  return loadJson(GUEST_KEYS.favorites, []);
}

function _guestStatus(v) {
  return typeof v === 'object' && v !== null ? v.status : v;
}

const ACHIEVEMENTS = [
  { id: 'first-solve',      icon: '⭐', en: 'First Steps',      ar: 'الخطوة الأولى',
    descEn: 'Answer your first question correctly', descAr: 'أجب على سؤالك الأول بشكل صحيح',
    check: () => getTotalCorrectCount() >= 1 },
  { id: 'scholar',          icon: '🎓', en: 'Scholar',           ar: 'العالم',
    descEn: 'Answer 100 questions correctly',       descAr: 'أجب على 100 سؤال بشكل صحيح',
    check: () => getTotalCorrectCount() >= 100 },
  { id: 'streak-7',         icon: '🔥', en: '7-Day Streak',      ar: '٧ أيام متتالية',
    descEn: '7 consecutive active days',            descAr: '٧ أيام نشاط متتالية',
    check: () => state.streak >= 7 },
  { id: 'category-master',  icon: '👑', en: 'Category Master',   ar: 'سيد الفئة',
    descEn: 'Complete any category 100%',           descAr: 'أكمل أي فئة بنسبة 100%',
    check: () => getCategoryMasterCount() >= 1 },
  { id: 'completionist',    icon: '💎', en: 'Completionist',     ar: 'المكتمل',
    descEn: 'Complete 5 categories 100%',           descAr: 'أكمل 5 فئات بنسبة 100%',
    check: () => getCategoryMasterCount() >= 5 },
  { id: 'speed-demon',      icon: '⚡', en: 'Speed Demon',       ar: 'الرعد',
    descEn: 'Score 8/10+ in Quick Fire',            descAr: 'احصل على 8/10 أو أعلى في الاختبار السريع',
    check: () => loadJson('jakh-speed-demon', 0) >= 1 },
  { id: 'bookworm',         icon: '📚', en: 'Bookworm',          ar: 'نهم القراءة',
    descEn: 'Add 20 questions to favorites',        descAr: 'أضف 20 سؤالاً إلى المفضلة',
    check: () => getFavoriteSet().size >= 20 },
  { id: 'bilingual',        icon: '🌐', en: 'Bilingual',         ar: 'ثنائي اللغة',
    descEn: 'Use both Arabic and English modes',    descAr: 'استخدم العربية والإنجليزية',
    check: () => !!loadJson('jakh-used-ar', 0) && !!loadJson('jakh-used-en', 0) },
  { id: 'night-owl',        icon: '🦉', en: 'Night Owl',         ar: 'بومة الليل',
    descEn: 'Answer a question after midnight',     descAr: 'أجب على سؤال بعد منتصف الليل',
    check: () => !!loadJson('jakh-night-owl', 0) },
  { id: 'streak-30',        icon: '🏆', en: '30-Day Streak',     ar: '٣٠ يوماً متتالياً',
    descEn: '30 consecutive active days',           descAr: '٣٠ يوم نشاط متتالي',
    check: () => state.streak >= 30 },
  { id: 'hard-solver',      icon: '💪', en: 'Hard Hitter',       ar: 'مواجه الصعاب',
    descEn: 'Answer 25 hard or difficult questions correctly', descAr: 'أجب بشكل صحيح على 25 سؤالاً صعباً',
    check: () => getCorrectCountByDifficulty('hard') + getCorrectCountByDifficulty('very-advanced') >= 25 },
  { id: 'sharer',           icon: '🔗', en: 'Sharer',            ar: 'المشارك',
    descEn: 'Share your first question',            descAr: 'شارك سؤالك الأول',
    check: () => !!loadJson('jakh-shared', 0) },
];

const completedCategoriesShown = new Set();

const els = {};

function t(key) {
  return (UI[state.lang] && UI[state.lang][key]) || (UI.en && UI.en[key]) || key;
}

function fmt(key, vars = {}) {
  return t(key).replace(/\{(\w+)\}/g, (_, token) => String(vars[token] ?? ''));
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}




// ================= API WRAPPER =================
const IS_LOCAL_PREVIEW = location.hostname === 'localhost' || location.hostname === '127.0.0.1';
const API_ORIGIN = IS_LOCAL_PREVIEW
  ? `${location.protocol}//${location.hostname}:8787`
  : 'https://api.jakh.net';
const API_URL = `${API_ORIGIN}/api`;

async function apiFetch(endpoint, options = {}) {
  options.credentials = 'include';
  const headers = new Headers(options.headers || {});
  headers.set('Accept', 'application/json');
  if (options.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  options.headers = headers;
  const res = await fetch(`${API_URL}${endpoint}`, options);
  const contentType = res.headers.get('content-type') || '';
  const data = contentType.includes('application/json') ? await res.json() : {};
  if (!res.ok) throw new Error(data.error || `API request failed (${res.status})`);
  return data;
}

async function checkCloudSession() {
  try {
    const data = await apiFetch('/user/profile');
    state.dbUser = data;
  } catch (err) {
    state.dbUser = null;
  }
}

function getActiveUser() {
  if (!state.dbUser) return null;
  const solvedMap = {};
  (state.dbUser.progress || []).forEach(p => { solvedMap[p.cardId] = p.status; });
  return {
    id: state.dbUser.id,
    username: state.dbUser.username,
    avatar: state.dbUser.avatar || '👤',
    favorites: (state.dbUser.favorites || []).map(f => f.cardId),
    solved: solvedMap,
  };
}


function shuffleArray(list) {
  const arr = [...list];
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function debounce(fn, delay) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}

async function detectApiAvailability() {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 2500);
  try {
    const response = await fetch(`${API_URL}/health`, {
      cache: 'no-store',
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    });
    if (!response.ok || !response.headers.get('content-type')?.includes('application/json')) return false;
    const payload = await response.json();
    return payload?.ok === true;
  } catch (_) {
    return false;
  } finally {
    clearTimeout(timeout);
  }
}

function applyCapabilityVisibility() {
  document.body.classList.toggle('api-unavailable', !state.apiAvailable);
  [els.openAuthBtn, els.heroAuthBtn, document.getElementById('leaderboardBtn'), document.getElementById('battleNavBtn'), document.getElementById('bnProfileBtn')]
    .filter(Boolean)
    .forEach(element => { element.hidden = !state.apiAvailable; });
  const suggestionBox = document.getElementById('suggestionBox');
  if (suggestionBox) suggestionBox.hidden = !state.apiAvailable;
}

function saveJson(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function loadJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch (_error) {
    return fallback;
  }
}




function saveSettings() {
  saveJson(STORAGE_KEYS.settings, { lang: state.lang });
  saveJson(`jakh-used-${state.lang}`, 1);
}

let cardIndexPromise;

async function loadCardIndex() {
  if (!cardIndexPromise) {
    cardIndexPromise = fetch('/data/card-index.json', {
      cache: 'force-cache',
      headers: { Accept: 'application/json' },
    }).then(async response => {
      if (!response.ok) throw new Error('Card index is unavailable');
      const index = await response.json();
      if (!index || typeof index !== 'object' || Array.isArray(index)) {
        throw new Error('Card index is invalid');
      }
      return index;
    }).catch(error => {
      cardIndexPromise = null;
      throw error;
    });
  }
  return cardIndexPromise;
}

async function syncGuestProgress() {
  if (!state.dbUser) return;
  const guestSolved = getGuestSolvedMap();
  const guestFavs = getGuestFavorites();
  if (!Object.keys(guestSolved).length && !guestFavs.length) return;

  const cardIndex = await loadCardIndex();
  const items = [];
  const remainingSolved = { ...guestSolved };
  const remainingFavs = new Set(guestFavs);
  for (const [cardId, val] of Object.entries(guestSolved)) {
    const card = cardIndex[cardId];
    const status = _guestStatus(val);
    if (!card || !status) {
      delete remainingSolved[cardId];
      continue;
    }
    const categoryId = card[0];
    items.push({ type: 'progress', value: { cardId, categoryId, status } });
  }
  for (const cardId of guestFavs) {
    const card = cardIndex[cardId];
    if (!card) {
      remainingFavs.delete(cardId);
      continue;
    }
    items.push({
      type: 'favorite',
      value: { cardId, categoryId: card[0] },
    });
  }

  const chunkSize = 100;
  for (let offset = 0; offset < items.length; offset += chunkSize) {
    const chunk = items.slice(offset, offset + chunkSize);
    await apiFetch('/user/sync', {
      method: 'POST',
      body: JSON.stringify({
        progress: chunk.filter(item => item.type === 'progress').map(item => item.value),
        favorites: chunk.filter(item => item.type === 'favorite').map(item => item.value),
      }),
    });
    for (const item of chunk) {
      if (item.type === 'progress') delete remainingSolved[item.value.cardId];
      else remainingFavs.delete(item.value.cardId);
    }
    if (Object.keys(remainingSolved).length) saveJson(GUEST_KEYS.solved, remainingSolved);
    else localStorage.removeItem(GUEST_KEYS.solved);
    if (remainingFavs.size) saveJson(GUEST_KEYS.favorites, [...remainingFavs]);
    else localStorage.removeItem(GUEST_KEYS.favorites);
  }
  localStorage.removeItem(GUEST_KEYS.solved);
  localStorage.removeItem(GUEST_KEYS.favorites);
  return true;
}

async function mergeGuestProgress() {
  try {
    return await syncGuestProgress();
  } catch {
    return false;
  }
}

const CLOUD_QUEUE_KEY = 'jakh-cloud-queue-v1';

function loadCloudQueue() {
  const queue = loadJson(CLOUD_QUEUE_KEY, []);
  return Array.isArray(queue) ? queue : [];
}

function saveCloudQueue(items) {
  if (items.length) saveJson(CLOUD_QUEUE_KEY, items);
  else localStorage.removeItem(CLOUD_QUEUE_KEY);
}

function queueCloudMutation(key, endpoint, method, body) {
  const userId = state.dbUser?.id;
  if (!userId) return;
  const queue = loadCloudQueue().filter(item => item.key !== key || item.userId !== userId);
  queue.push({ key, userId, endpoint, method, body });
  saveCloudQueue(queue.slice(-500));
}

function clearCloudMutation(key) {
  const userId = state.dbUser?.id;
  saveCloudQueue(loadCloudQueue().filter(item => item.key !== key || item.userId !== userId));
}

async function sendCloudMutation(key, endpoint, method, body) {
  try {
    await apiFetch(endpoint, { method, body: JSON.stringify(body) });
    clearCloudMutation(key);
    return true;
  } catch {
    queueCloudMutation(key, endpoint, method, body);
    return false;
  }
}

async function flushCloudQueue() {
  if (!state.dbUser || !navigator.onLine) return;
  const pending = loadCloudQueue();
  if (!pending.length) return;
  const remaining = [];
  for (const item of pending) {
    if (item.userId !== state.dbUser.id) {
      remaining.push(item);
      continue;
    }
    try {
      await apiFetch(item.endpoint, { method: item.method, body: JSON.stringify(item.body) });
    } catch {
      remaining.push(item);
    }
  }
  saveCloudQueue(remaining);
}

function getFavoriteSet() {
  if (state.dbUser) {
    const account = getActiveUser();
    return new Set(account ? account.favorites : []);
  }
  return new Set(getGuestFavorites());
}

function getSolvedMap() {
  if (state.dbUser) {
    const account = getActiveUser();
    return account ? account.solved : {};
  }
  const raw = getGuestSolvedMap();
  const result = {};
  for (const [id, val] of Object.entries(raw)) result[id] = _guestStatus(val);
  return result;
}

function isFavorite(id) {
  return getFavoriteSet().has(id);
}

function getScore() {
  const solved = getSolvedMap();
  return Object.values(solved).reduce((sum, difficulty) => sum + (DIFFICULTY_POINTS[difficulty] || 0), 0);
}

function getProgressResult(id) {
  const status = getSolvedMap()[id];
  if (!status) return null;
  return status.startsWith('wrong-') ? 'wrong' : 'correct';
}

function getCategoryProgress(slug) {
  const meta = state.catalog?.categories.find(c => c.slug === slug);
  const total = meta?.count || 1;
  if (state.dbUser) {
    const solved = (state.dbUser.progress || []).filter(p => p.categoryId === slug && !p.status.startsWith('wrong-')).length;
    return { solved, pct: Math.min(100, Math.round((solved / total) * 100)) };
  }
  const raw = getGuestSolvedMap();
  const solved = Object.values(raw).filter(v => {
    const entry = typeof v === 'object' && v !== null ? v : { status: v };
    return entry.categoryId === slug && !entry.status.startsWith('wrong-');
  }).length;
  return { solved, pct: Math.min(100, Math.round((solved / total) * 100)) };
}

function getCorrectCountByDifficulty(diff) {
  if (state.dbUser) return (state.dbUser.progress || []).filter(p => p.status === diff).length;
  return Object.values(getGuestSolvedMap()).filter(v => _guestStatus(v) === diff).length;
}

function getTotalCorrectCount() {
  if (state.dbUser) return (state.dbUser.progress || []).filter(p => !p.status.startsWith('wrong-')).length;
  return Object.values(getGuestSolvedMap()).filter(v => !_guestStatus(v).startsWith('wrong-')).length;
}

function isLevelUnlocked(difficulty) {
  if (difficulty === 'easy' || difficulty === 'medium') return true;
  if (!state.dbUser) return false;
  if (difficulty === 'hard') {
    return getTotalCorrectCount() >= 10;
  }
  if (difficulty === 'very-advanced') {
    return getCorrectCountByDifficulty('hard') >= 10;
  }
  return true;
}

function isPremiumDifficulty(difficulty) {
  return difficulty === 'hard' || difficulty === 'very-advanced';
}
function getTrialUsedSet() {
  try { return new Set(JSON.parse(localStorage.getItem(STORAGE_KEYS.trial)) || []); } catch { return new Set(); }
}
function saveTrialUsedSet(s) {
  localStorage.setItem(STORAGE_KEYS.trial, JSON.stringify([...s]));
}
function isTrialUnlocked(cardId, difficulty) {
  if (state.dbUser || !isPremiumDifficulty(difficulty)) return false;
  const s = getTrialUsedSet();
  return s.has(cardId) || s.size < 10;
}

function handleFlip(id, cardEl) {
  hapticTap();
  if (cardEl && cardEl.dataset.trial === '1') {
    const s = getTrialUsedSet();
    if (!s.has(id)) {
      if (s.size >= 10) { openPaywallModal(); return; }
      s.add(id);
      saveTrialUsedSet(s);
      const wasFlipped = state.flipped.has(id);
      if (wasFlipped) state.flipped.delete(id); else state.flipped.add(id);
      if (!wasFlipped) trackEvent('card_flip', { category: state.categorySlug, card_id: id });
      if (s.size >= 10) renderCards(); else updateCardEl(id);
      return;
    }
  }
  const wasFlipped = state.flipped.has(id);
  if (wasFlipped) state.flipped.delete(id); else state.flipped.add(id);
  if (!wasFlipped) trackEvent('card_flip', { category: state.categorySlug, card_id: id });
  updateCardEl(id);
}


function showToast(message, isError) {
  if (!els.toast) return;
  els.toast.textContent = message;
  els.toast.classList.toggle('is-error', !!isError);
  els.toast.classList.add('is-visible');
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => {
    els.toast.classList.remove('is-visible');
  }, isError ? 3200 : 2200);
}

function applyTheme() {
  document.documentElement.dataset.theme = 'dark';
  document.documentElement.dataset.accent = 'aurora';
  document.documentElement.lang = state.lang === 'ar' ? 'ar' : 'en';
  document.documentElement.dir = state.lang === 'ar' ? 'rtl' : 'ltr';
  if (els.langSelect) els.langSelect.value = state.lang;
}

function applyStaticCopy() {
  document.querySelectorAll('[data-i18n]').forEach((node) => {
    const key = node.dataset.i18n;
    node.textContent = t(key);
  });
  if (els.categorySearchInput) {
    els.categorySearchInput.placeholder = state.lang === 'ar' ? 'ابحث حسب الفئة أو الموضوع أو القطاع...' : 'Search by category, topic, or sector...';
    els.categorySearchInput.setAttribute('aria-label', state.lang === 'ar' ? 'ابحث في صفحات الفئات' : 'Search category pages');
  }
  if (els.cardSearchInput) {
    els.cardSearchInput.placeholder = state.lang === 'ar' ? 'ابحث بكلمة أو جواب أو مفهوم...' : 'Search by keyword, answer, or concept...';
  }
  if (els.openAuthBtn) {
    const account = getActiveUser();
    els.openAuthBtn.textContent = account ? account.username : t('authOpen');
  }
  updateSelectLabels();
  updateDocumentTitle();
  updateBottomNavActive();
}

function updateDocumentTitle() {
  if (state.page === 'home') {
    document.title = state.lang === 'ar' ? 'ألغاز جاخ' : 'JAKH Riddles';
    return;
  }
  if (state.categoryData) {
    document.title = state.lang === 'ar'
      ? `${state.categoryData.title.ar} | ألغاز جاخ`
      : `${state.categoryData.title.en} | JAKH Riddles`;
  }
}

function updateSelectLabels() {
  if (els.difficultySelect) {
    els.difficultySelect.options[0].text = t('allLevels');
    els.difficultySelect.options[1].text = t('easy');
    els.difficultySelect.options[2].text = t('medium');
    els.difficultySelect.options[3].text = t('hard');
    els.difficultySelect.options[4].text = t('veryAdvanced');
  }
  if (els.viewSelect) {
    els.viewSelect.options[0].text = t('everything');
    els.viewSelect.options[1].text = t('onlyUnsolved');
    els.viewSelect.options[2].text = t('onlySolved');
    els.viewSelect.options[3].text = t('onlyFavorites');
  }
  if (els.sortSelect) {
    els.sortSelect.options[0].text = t('featuredOrder');
    els.sortSelect.options[1].text = t('byDifficulty');
    els.sortSelect.options[2].text = t('aToZ');
    els.sortSelect.options[3].text = t('shuffleNow');
  }
}

async function fetchJson(path, retries = 2) {
  try {
    const response = await fetch(path);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.json();
  } catch (err) {
    if (retries > 0) {
      await new Promise(r => setTimeout(r, 1000));
      return fetchJson(path, retries - 1);
    }
    throw err;
  }
}

async function handleOfflineStatus(event) {
  const isOff = !navigator.onLine;
  document.body.classList.toggle('is-offline', isOff);
  if (isOff) {
    showToast(state.lang === 'ar' ? 'أنت تعمل حالياً بدون اتصال — قد لا تتوفر بعض الميزات' : 'You are currently offline — some features may be limited', 'warning');
  } else if (sessionInitialized && event?.type === 'online') {
    state.apiAvailable = await detectApiAvailability();
    if (state.apiAvailable) {
      await checkCloudSession();
      if (state.dbUser) {
        await flushCloudQueue();
        await mergeGuestProgress();
        await checkCloudSession();
      }
    }
    applyCapabilityVisibility();
  }
}

function cacheEls() {
  [
    'toast', 'langSelect', 'openAuthBtn',
    'heroAuthBtn', 'categorySearchInput', 'resetDirectoryBtn', 'directoryResultsLabel',
    'categoryDirectoryGrid', 'badgeCategories', 'badgeQuestions', 'accountSummaryMount',
    'authModal', 'authModalBody',
    'categoryKicker', 'categoryTitle', 'categoryDescription', 'categoryCountPill', 'categoryImage',
    'categorySummaryMount', 'cardSearchInput', 'difficultySelect', 'viewSelect', 'sortSelect',
    'subcategoryWrap', 'subcategoryFilters', 'resultsLabel', 'resetPageBtn', 'cardGrid', 'emptyState',
    'relatedCategories', 'categoryDiffBadge',
    'suggestionText', 'suggestionEmail', 'suggestionSubmit', 'suggestionThanks', 'suggestionForm',
  ].forEach((id) => { els[id] = document.getElementById(id); });
}

const APP_VERSION = '2.6';
function flushStaleStorage() {
  const stored = localStorage.getItem('jakh-app-version');
  if (stored !== null && stored !== APP_VERSION) {
    sessionStorage.removeItem('jakh-home-scroll');
    const staleKeys = ['jakh-catalog-cache', 'jakh-cluster-cache', 'jakh-home-state'];
    staleKeys.forEach(k => { localStorage.removeItem(k); sessionStorage.removeItem(k); });
    localStorage.setItem('jakh-app-version', APP_VERSION);
    // Clear all SW caches then reload so new CSS/JS takes effect immediately
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.ready.then(reg => {
        reg.active?.postMessage({ type: 'CLEAR_CACHE' });
        setTimeout(() => location.reload(), 800);
      }).catch(() => { location.reload(); });
    } else {
      location.reload();
    }
    return;
  }
  if (stored === null) localStorage.setItem('jakh-app-version', APP_VERSION);
}

function initializeFromStorage() {
  flushStaleStorage();
  const settings = loadJson(STORAGE_KEYS.settings, {});
  state.lang = settings.lang || 'en';
  state.theme = 'dark';
  // Purge any stale theme preference — site is dark-only now
  if (settings.theme && settings.theme !== 'dark') {
    saveJson(STORAGE_KEYS.settings, { lang: state.lang });
  }
  state.audioEnabled = localStorage.getItem(STORAGE_KEYS.audio) !== 'false';
}

function applyDir() {
  document.documentElement.dir = state.lang === 'ar' ? 'rtl' : 'ltr';
  document.documentElement.lang = state.lang;
}

let _installPrompt = null;
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  _installPrompt = e;
  if (!localStorage.getItem('jakh-install-dismissed')) {
    showInstallBanner();
  }
});

function showInstallBanner() {
  if (document.getElementById('installBanner')) return;
  const banner = document.createElement('div');
  banner.id = 'installBanner';
  banner.className = 'install-banner';
  const isAr = state.lang === 'ar';
  banner.innerHTML = `
    <span>${isAr ? '📲 أضف JAKH إلى شاشتك الرئيسية للوصول السريع' : '📲 Add JAKH to your home screen for quick access'}</span>
    <div class="install-banner-actions">
      <button class="primary-btn install-banner-btn" id="installAcceptBtn">${isAr ? 'تثبيت' : 'Install'}</button>
      <button class="ghost-btn install-banner-close" id="installDismissBtn">✕</button>
    </div>
  `;
  document.body.appendChild(banner);
  document.getElementById('installAcceptBtn')?.addEventListener('click', async () => {
    if (!_installPrompt) return;
    _installPrompt.prompt();
    const { outcome } = await _installPrompt.userChoice;
    _installPrompt = null;
    banner.remove();
    if (outcome === 'accepted') localStorage.setItem('jakh-install-dismissed', '1');
  });
  document.getElementById('installDismissBtn')?.addEventListener('click', () => {
    localStorage.setItem('jakh-install-dismissed', '1');
    banner.remove();
  });
}

let globalEventsBound = false;

async function spaNavigate(url, isPopState = false) {
  if (state.page === 'home') {
    sessionStorage.setItem('jakh-home-scroll', String(Math.round(window.scrollY)));
  }
  try {
    const res = await fetch(url);
    const html = await res.text();
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');

    document.title = doc.title;
    document.body.innerHTML = doc.body.innerHTML;
    document.body.className = doc.body.className;
    
    // Safely copy data attributes since DOMParser dataset can be unreliable
    document.body.setAttribute('data-page', doc.body.getAttribute('data-page') || '');
    document.body.setAttribute('data-category', doc.body.getAttribute('data-category') || '');

    // Reset local state for the new page
    state.page = doc.body.getAttribute('data-page') || 'home';
    state.categorySlug = doc.body.getAttribute('data-category') || '';
    state.categoryData = null;
    state.directorySearch = '';
    state.cluster = 'all';
    state.search = '';
    state.difficulty = 'all';
    state.view = 'all';
    state.sort = 'featured';
    state.subcategory = 'all';
    state.cardPage = 1;

    if (!isPopState) {
      history.pushState(null, '', url);
    }
    if (state.page !== 'home') window.scrollTo(0, 0);

    // Re-initialize for new DOM
    init();
  } catch (err) {
    console.error('SPA Navigation failed:', err);
    location.href = url;
  }
}

function bindCommonEvents() {
  if (els.langSelect) {
    els.langSelect.addEventListener('change', () => {
      state.lang = els.langSelect.value;
      saveSettings();
      applyTheme();
      applyDir();
      applyStaticCopy();
      rerender();
      document.getElementById('timedQuizOverlay')?.remove();
      createTimedQuizModal();
      renderCategoryPlayModes();
      showToast(t('languageSet'));
    });
  }
  if (els.openAuthBtn) els.openAuthBtn.addEventListener('click', openAuthModal);
  if (els.heroAuthBtn) els.heroAuthBtn.addEventListener('click', openAuthModal);

  // Inject leaderboard button into nav if missing
  if (!document.getElementById('leaderboardBtn')) {
    const nav = document.querySelector('.header-actions');
    if (nav) {
      const btn = document.createElement('button');
      btn.id = 'leaderboardBtn';
      btn.className = 'ghost-btn';
      btn.textContent = '🏆';
      btn.setAttribute('aria-label', 'Leaderboard');
      nav.insertBefore(btn, nav.children[2]);
    }
  }
  const lbBtn = document.getElementById('leaderboardBtn');
  if (lbBtn) lbBtn.addEventListener('click', openLeaderboard);

  // Inject battle button into nav
  if (!document.getElementById('battleNavBtn')) {
    const nav = document.querySelector('.header-actions');
    if (nav) {
      const btn = document.createElement('button');
      btn.id = 'battleNavBtn';
      btn.className = 'ghost-btn';
      btn.textContent = '⚡';
      btn.setAttribute('aria-label', state.lang === 'ar' ? 'معركة الفريق' : 'Team Battle');
      nav.insertBefore(btn, nav.children[2]);
    }
  }
  document.getElementById('battleNavBtn')?.addEventListener('click', () => openBattleModal(state.categorySlug));


  // Handle #battle/CODE deep-link
  const hashMatch = location.hash.match(/^#battle\/([A-Z0-9-]+)$/i);
  if (hashMatch) {
    setTimeout(() => {
      battleState.tab = 'join';
      openBattleModal('');
      setTimeout(() => {
        const codeInput = document.getElementById('battleCodeInput');
        if (codeInput) codeInput.value = hashMatch[1].toUpperCase();
      }, 80);
    }, 600);
  }

  // Inject global search button into nav
  if (!document.getElementById('globalSearchBtn')) {
    const nav = document.querySelector('.header-actions');
    if (nav) {
      const btn = document.createElement('button');
      btn.id = 'globalSearchBtn';
      btn.className = 'ghost-btn';
      btn.setAttribute('aria-label', state.lang === 'ar' ? 'بحث' : 'Search');
      btn.textContent = '🔍';
      nav.insertBefore(btn, nav.firstElementChild);
    }
  }
  document.getElementById('globalSearchBtn')?.addEventListener('click', openGlobalSearch);

  // Inject hamburger button for mobile nav
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
      const _toggleNav = (e) => {
        if (e.type === 'touchstart') e.preventDefault();
        const open = nav.classList.toggle('nav-open');
        hbtn.setAttribute('aria-expanded', String(open));
      };
      hbtn.addEventListener('click', _toggleNav);
      hbtn.addEventListener('touchstart', _toggleNav, { passive: false });

      document.addEventListener('click', (e) => {
        if (!nav || !nav.classList.contains('nav-open')) return;
        if (!nav.contains(e.target) && !hbtn.contains(e.target)) {
          nav.classList.remove('nav-open');
          hbtn.setAttribute('aria-expanded', 'false');
        }
      });
      document.addEventListener('touchstart', (e) => {
        if (!nav || !nav.classList.contains('nav-open')) return;
        if (!nav.contains(e.target) && !hbtn.contains(e.target)) {
          nav.classList.remove('nav-open');
          hbtn.setAttribute('aria-expanded', 'false');
        }
      }, { passive: true });
    }
  }

  const randomBtn = document.getElementById('randomCategoryBtn');
  if (randomBtn) randomBtn.addEventListener('click', randomCategory);

  if (!globalEventsBound) {
    document.addEventListener('click', (event) => {
      const closeTarget = event.target.closest('[data-close-modal]');
      if (closeTarget) {
        const name = closeTarget.dataset.closeModal;
        closeModal(name);
      }
    });

    document.addEventListener('click', (e) => {
      const link = e.target.closest('a');
      if (link && link.origin === location.origin) {
        const path = link.pathname;
        // Skip hash-only anchor links (e.g. #questionSection) — let native scroll handle them
        if (link.hash && link.pathname === location.pathname) return;
        const isHome = path === '/' || path === '' || path.endsWith('index.html');
        if ((path.endsWith('.html') || isHome) && !path.includes('admin')) {
          e.preventDefault();
          spaNavigate(link.href);
          if (isHome) window.scrollTo({ top: 0, behavior: 'smooth' });
        }
      }
    });

    window.addEventListener('popstate', () => {
      spaNavigate(location.href, true);
    });

    window.addEventListener('online', handleOfflineStatus);
    window.addEventListener('offline', handleOfflineStatus);
    handleOfflineStatus();

    globalEventsBound = true;
  }

  if (els.resetDirectoryBtn) {
    els.resetDirectoryBtn.addEventListener('click', () => {
      state.directorySearch = '';
      state.cluster = 'all';
      state.collection = 'all';
      if (els.categorySearchInput) els.categorySearchInput.value = '';
      renderClusterTabBar();
      fadeAndRenderDirectory();
      showToast(t('directoryResetDone'));
    });
  }
  if (els.categorySearchInput) {
    els.categorySearchInput.addEventListener('input', debounce(() => {
      state.directorySearch = els.categorySearchInput.value.trim().toLowerCase();
      if (state.directorySearch) state.collection = 'all';
      renderClusterTabBar();
      renderCategoryDirectory();
    }, 200));
  }

  if (els.resetPageBtn) {
    els.resetPageBtn.addEventListener('click', () => {
      state.search = '';
      state.difficulty = 'all';
      state.view = 'all';
      state.sort = 'featured';
      state.subcategory = 'all';
      state.cardPage = 1;
      document.getElementById('loadMoreBtn')?.remove();
      if (els.cardSearchInput) els.cardSearchInput.value = '';
      if (els.difficultySelect) els.difficultySelect.value = 'all';
      if (els.viewSelect) els.viewSelect.value = 'all';
      if (els.sortSelect) els.sortSelect.value = 'featured';
      renderSubcategoryFilters();
      renderCards();
      showToast(t('pageResetDone'));
    });
  }
  if (els.cardSearchInput) {
    els.cardSearchInput.addEventListener('input', debounce(() => {
      state.search = els.cardSearchInput.value.trim().toLowerCase();
      state.cardPage = 1;
      syncFilterParams();
      renderCards();
    }, 250));
  }
  if (els.difficultySelect) {
    els.difficultySelect.addEventListener('change', () => {
      state.difficulty = els.difficultySelect.value;
      state.cardPage = 1;
      syncFilterParams();
      renderCards();
    });
  }
  if (els.viewSelect) {
    els.viewSelect.addEventListener('change', () => {
      state.view = els.viewSelect.value;
      state.cardPage = 1;
      syncFilterParams();
      renderCards();
    });
  }
  if (els.sortSelect) {
    els.sortSelect.addEventListener('change', () => {
      state.sort = els.sortSelect.value;
      state.cardPage = 1;
      syncFilterParams();
      renderCards();
    });
  }
  if (els.cardGrid) {
    els.cardGrid.addEventListener('click', (event) => {
      const btn = event.target.closest('[data-action]');
      if (btn) {
        const action = btn.dataset.action;
        const id = btn.dataset.id;
        if (!id) return;
        event.preventDefault();
        event.stopPropagation();
        if (action === 'flip') {
          handleFlip(id, event.target.closest('.riddle-card'));
        } else if (action === 'paywall') {
          openPaywallModal();
        } else if (action === 'audio') {
          handleAudioBtn(btn);
        } else if (action === 'favorite') {
          toggleFavorite(id);
        } else if (action === 'markCorrect') {
          markCard(id, 'correct');
        } else if (action === 'markWrong') {
          markCard(id, 'wrong');
        } else if (action === 'unmark') {
          unmarkCard(id);
        } else if (action === 'share') {
          shareCard(id);
        } else if (action === 'report') {
          const card = state.categoryData?.cards.find(c => c.id === id);
          if (card) reportCard(id, state.categoryData?.slug || 'unknown', card.question[state.lang]);
        }
        return;
      }
      const card = event.target.closest('.riddle-card[data-id]:not(.is-locked):not(.is-paywall)');
      if (!card) return;
      const id = card.dataset.id;
      if (!id) return;
      handleFlip(id, card);
    });
    // ── Enhanced swipe: visual tilt + swipe-to-mark on flipped cards ──
    let _sw = null;

    function _resetSwipeCard() {
      if (!_sw?.cardEl) { _sw = null; return; }
      const c = _sw.cardEl;
      c.style.transform = '';
      c.style.willChange = '';
      c.classList.remove('is-swiping');
      const ov = c.querySelector('.swipe-overlay');
      if (ov) ov.style.opacity = '0';
      _sw = null;
    }

    function _getSwipeOverlay(cardEl) {
      let ov = cardEl.querySelector('.swipe-overlay');
      if (!ov) {
        ov = document.createElement('div');
        ov.className = 'swipe-overlay';
        cardEl.appendChild(ov);
      }
      return ov;
    }

    els.cardGrid.addEventListener('touchstart', (e) => {
      const card = e.target.closest('.riddle-card[data-id]:not(.is-locked):not(.is-paywall)');
      if (!card) return;
      const t = e.touches[0];
      card.style.willChange = 'transform';
      _sw = { x: t.clientX, y: t.clientY, id: card.dataset.id, cardEl: card };
    }, { passive: true });

    els.cardGrid.addEventListener('touchmove', (e) => {
      if (!_sw) return;
      const t = e.touches[0];
      const dx = t.clientX - _sw.x;
      const dy = t.clientY - _sw.y;
      if (Math.abs(dx) < 8 || Math.abs(dy) > Math.abs(dx) * 0.85) return;
      const card = _sw.cardEl;
      card.classList.add('is-swiping');
      card.style.transform = `translateX(${dx * 0.22}px) rotate(${dx * 0.035}deg)`;
      const isFlipped = card.classList.contains('is-flipped');
      if (!isFlipped) return;
      const isRtl = document.documentElement.dir === 'rtl';
      const isCorrect = isRtl ? dx < 0 : dx > 0;
      const ov = _getSwipeOverlay(card);
      ov.style.background = isCorrect
        ? 'color-mix(in srgb, var(--easy) 22%, transparent)'
        : 'color-mix(in srgb, var(--danger) 20%, transparent)';
      ov.style.color   = isCorrect ? 'var(--easy)' : 'var(--danger)';
      ov.style.border  = isCorrect
        ? '2px solid color-mix(in srgb, var(--easy) 55%, transparent)'
        : '2px solid color-mix(in srgb, var(--danger) 50%, transparent)';
      ov.textContent   = isCorrect ? '✓' : '✗';
      ov.style.opacity = String(Math.min(Math.abs(dx) / 70, 1) * 0.95);
    }, { passive: true });

    els.cardGrid.addEventListener('touchend', (e) => {
      if (!_sw) return;
      const t = e.changedTouches[0];
      const dx = t.clientX - _sw.x;
      const dy = t.clientY - _sw.y;
      const { id } = _sw;
      const cardEl = _sw.cardEl;
      const isFlipped = cardEl.classList.contains('is-flipped');
      _resetSwipeCard();
      if (Math.abs(dx) < 42 || Math.abs(dy) > Math.abs(dx) * 0.9) return;
      const isRtl = document.documentElement.dir === 'rtl';
      const isRightSwipe = isRtl ? dx < 0 : dx > 0;
      if (!isFlipped) {
        handleFlip(id, cardEl);
      } else {
        if (isRightSwipe) markCard(id, 'correct');
        else              markCard(id, 'wrong');
      }
    }, { passive: true });

    els.cardGrid.addEventListener('touchcancel', () => { _resetSwipeCard(); }, { passive: true });
  }
}

function rerender() {
  if (state.page === 'home') {
    renderHome();
  } else {
    renderCategoryPage();
  }
  updateBottomNavActive();
}

function renderHome() {
  if (!state.catalog) return;
  if (els.badgeCategories) els.badgeCategories.textContent = getDirectoryCollections().length || state.catalog.categories.length;
  if (els.badgeQuestions) els.badgeQuestions.textContent = state.catalog.site.totalQuestions.toLocaleString();
  renderAccountSummary(els.accountSummaryMount);
  renderDailyChallenge();
  renderClusterTabBar();
  renderCategoryDirectory();
  markCachedCategories();
  const savedScroll = sessionStorage.getItem('jakh-home-scroll');
  if (savedScroll) {
    sessionStorage.removeItem('jakh-home-scroll');
    requestAnimationFrame(() => window.scrollTo({ top: parseInt(savedScroll), behavior: 'instant' }));
  }
}

function getCategoryMap() {
  return new Map((state.catalog?.categories || []).map(category => [category.slug, category]));
}

function getDirectoryCollections() {
  const categoryMap = getCategoryMap();
  return CATEGORY_COLLECTIONS.map(collection => {
    const categories = collection.members.map(slug => categoryMap.get(slug)).filter(Boolean);
    return {
      ...collection,
      categories,
      pageCount: categories.length,
      count: categories.reduce((total, category) => total + Number(category.count || 0), 0),
      parentMeta: DIRECTORY_PARENT_META[collection.parent],
    };
  }).filter(collection => collection.pageCount > 0);
}

function getCollectionByKey(key) {
  return getDirectoryCollections().find(collection => collection.key === key) || null;
}

function createCollectionCardMarkup(collection) {
  const isAr = state.lang === 'ar';
  const titleRaw = collection.title[state.lang] || collection.title.en;
  const descriptionRaw = collection.description[state.lang] || collection.description.en;
  const title = escapeHtml(titleRaw);
  const description = escapeHtml(descriptionRaw);
  const parentLabel = escapeHtml(collection.parentMeta?.label?.[state.lang] || collection.parentMeta?.label?.en || '');
  const viewLabel = isAr ? 'عرض المواضيع' : 'View topics';
  const pageLabel = isAr ? `${collection.pageCount} صفحات` : `${collection.pageCount} pages`;
  const questionLabel = isAr ? `${collection.count} سؤال` : `${collection.count} questions`;
  const ariaLabel = isAr ? `افتح مجموعة ${titleRaw}` : `Open ${titleRaw} collection`;
  return `
    <button class="category-card collection-card" type="button" data-collection="${escapeHtml(collection.key)}" aria-label="${escapeHtml(ariaLabel)}" style="--collection-gradient:${collection.gradient};--collection-accent:${collection.accent};">
      <span class="category-card-stripe" style="background:${collection.gradient}" aria-hidden="true"></span>
      <div class="category-card-bg collection-card-bg" aria-hidden="true">
        <span class="category-card-count-badge">${pageLabel}</span>
        <span class="collection-card-orbit collection-card-orbit-a"></span>
        <span class="collection-card-orbit collection-card-orbit-b"></span>
        <span class="category-card-corner-mark"></span>
      </div>
      <div class="category-card-overlay">
        <span class="category-card-cluster cluster-chip" style="color:${collection.accent}">${parentLabel}</span>
        <h3 class="category-title">${title}</h3>
        <p class="collection-card-description">${description}</p>
      </div>
      <div class="category-card-footer">
        <span class="category-card-label">${questionLabel}</span>
        <span class="category-card-enter">${viewLabel}</span>
      </div>
    </button>
  `;
}

function createCollectionHeaderMarkup(collection) {
  const isAr = state.lang === 'ar';
  const title = escapeHtml(collection.title[state.lang] || collection.title.en);
  const description = escapeHtml(collection.description[state.lang] || collection.description.en);
  const backLabel = isAr ? 'العودة للمجموعات' : 'Back to collections';
  const eyebrow = isAr ? 'مجموعة مختارة' : 'Selected collection';
  return `
    <div class="collection-directory-header" style="--collection-gradient:${collection.gradient};--collection-accent:${collection.accent};">
      <span class="collection-directory-glow" aria-hidden="true"></span>
      <div>
        <span class="collection-directory-eyebrow">${eyebrow}</span>
        <h3>${title}</h3>
        <p>${description}</p>
      </div>
      <button class="text-btn collection-back-btn" type="button" data-collection-reset>${backLabel}</button>
    </div>
  `;
}

function setDirectoryResultsLabel(text) {
  if (els.directoryResultsLabel) els.directoryResultsLabel.textContent = text;
}

function createCategoryCardMarkup(meta) {
  const color = CATEGORY_COLORS[meta.slug] || '#E8613C';
  const gradient = CATEGORY_GRADIENTS[meta.slug] || `linear-gradient(135deg, ${color} 0%, rgba(255,255,255,0.12) 100%)`;
  const isAr = state.lang === 'ar';
  const title = escapeHtml(meta.title[state.lang]);
  const cluster = escapeHtml(meta.cluster[state.lang]);
  const prog = getCategoryProgress(meta.slug);
  const progressLine = prog.pct > 0
    ? `<div class="card-progress-bar" style="width:${prog.pct}%;background:${color}" aria-hidden="true"></div>`
    : '';
  const doneLabel = prog.pct > 0 ? ` · ${prog.pct}% ${isAr ? 'مكتمل' : 'done'}` : '';
  const enterLabel = isAr ? 'افتح' : 'Enter';
  const cardCountLabel = isAr ? `${meta.count} سؤال` : `${meta.count} Q`;
  return `
    <a class="category-card" href="${escapeHtml(meta.href)}" aria-label="${title}">
      <span class="category-card-stripe" style="background:${gradient}" aria-hidden="true"></span>
      <div class="category-card-bg" aria-hidden="true">
        <span class="category-card-count-badge">${cardCountLabel}</span>
        <span class="category-card-corner-mark"></span>
      </div>
      <div class="category-card-overlay">
        <span class="category-card-cluster cluster-chip" style="color:${color}">${cluster}</span>
        <h3 class="category-title">${title}</h3>
      </div>
      <div class="category-card-footer">
        <span class="category-card-label">${meta.count} ${isAr ? 'سؤال' : 'questions'}${doneLabel}</span>
        <span class="category-card-enter">${enterLabel}</span>
      </div>
      ${prog.pct > 0 ? `<div class="card-progress-track" aria-hidden="true">${progressLine}</div>` : ''}
    </a>
  `;
}

async function markCachedCategories() {
  if (!('caches' in window)) return;
  try {
    const cacheNames = await caches.keys();
    const assetCacheName = cacheNames
      .filter(name => /^jakh-assets-v\d+$/.test(name))
      .sort((a, b) => Number(a.split('-v').pop()) - Number(b.split('-v').pop()))
      .pop();
    if (!assetCacheName) return;
    const cache = await caches.open(assetCacheName);
    const keys = await cache.keys();
    const cachedPaths = new Set(keys.map(r => new URL(r.url).pathname));
    document.querySelectorAll('.category-card[href]').forEach(el => {
      const href = el.getAttribute('href');
      const slug = href.replace(/\.html$/, '').replace(/.*\//, '');
      if (cachedPaths.has(`/data/${slug}.json`)) {
        if (!el.querySelector('.offline-badge')) {
          const badge = document.createElement('span');
          badge.className = 'offline-badge';
          badge.title = state.lang === 'ar' ? 'متاح بدون إنترنت' : 'Available offline';
          badge.textContent = '⊙';
          el.appendChild(badge);
        }
      }
    });
  } catch (_) {}
}

const lazyBgObserver = typeof IntersectionObserver !== 'undefined' ? new IntersectionObserver((entries, obs) => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      entry.target.classList.add('is-loaded');
      obs.unobserve(entry.target);
    }
  });
}, { rootMargin: '300px' }) : null;

function renderCategoryDirectory() {
  if (!els.categoryDirectoryGrid || !state.catalog) return;
  const collections = getDirectoryCollections();
  const selectedCollection = state.collection !== 'all' ? getCollectionByKey(state.collection) : null;
  const searchTerm = state.directorySearch;
  const isAr = state.lang === 'ar';
  let markup = '';

  if (searchTerm) {
    const collectionBySlug = new Map();
    collections.forEach(collection => collection.categories.forEach(category => collectionBySlug.set(category.slug, collection)));
    const filtered = state.catalog.categories.filter((meta) => {
      const collection = collectionBySlug.get(meta.slug);
      if (state.cluster !== 'all' && collection?.parent !== state.cluster) return false;
      const parentMeta = collection?.parentMeta;
      const haystack = [
        meta.title.en, meta.title.ar, meta.description.en, meta.description.ar, meta.cluster.en, meta.cluster.ar,
        collection?.title.en, collection?.title.ar, collection?.description.en, collection?.description.ar,
        parentMeta?.label.en, parentMeta?.label.ar
      ].filter(Boolean).join(' ').toLowerCase();
      return haystack.includes(searchTerm);
    });
    markup = filtered.map(createCategoryCardMarkup).join('');
    setDirectoryResultsLabel(isAr
      ? `يتم عرض ${filtered.length} صفحة فئة مطابقة.`
      : `Showing ${filtered.length} matching category pages.`);
  } else if (selectedCollection) {
    const categories = selectedCollection.categories;
    markup = createCollectionHeaderMarkup(selectedCollection) + categories.map(createCategoryCardMarkup).join('');
    setDirectoryResultsLabel(isAr
      ? `يتم عرض ${categories.length} صفحات داخل مجموعة ${selectedCollection.title.ar}.`
      : `Showing ${categories.length} category pages inside ${selectedCollection.title.en}.`);
  } else {
    const visibleCollections = state.cluster === 'all'
      ? collections
      : collections.filter(collection => collection.parent === state.cluster);
    markup = visibleCollections.map(createCollectionCardMarkup).join('');
    const totalPages = visibleCollections.reduce((sum, collection) => sum + collection.pageCount, 0);
    setDirectoryResultsLabel(state.cluster === 'all'
      ? (isAr
          ? `يتم عرض ${visibleCollections.length} مجموعات مختارة تضم ${totalPages} صفحة فئة.`
          : `Showing ${visibleCollections.length} curated collections covering ${totalPages} category pages.`)
      : (isAr
          ? `يتم عرض ${visibleCollections.length} مجموعات في هذا المسار.`
          : `Showing ${visibleCollections.length} collections in this track.`));
  }

  els.categoryDirectoryGrid.innerHTML = markup || `
    <div class="empty-state collection-empty-state">
      <h3>${isAr ? 'لا توجد نتائج مطابقة.' : 'No matching topics.'}</h3>
      <p>${isAr ? 'جرّب مسارًا آخر أو أزل البحث الحالي.' : 'Try another track or clear the current search.'}</p>
    </div>
  `;
  const cards = [...els.categoryDirectoryGrid.querySelectorAll('.category-card')];
  requestAnimationFrame(() => {
    cards.forEach((el) => el.classList.add('is-visible'));
  });
  if (lazyBgObserver) {
    cards.forEach(el => lazyBgObserver.observe(el));
  }
  els.categoryDirectoryGrid.querySelectorAll('[data-collection]').forEach(btn => {
    btn.addEventListener('click', () => {
      state.collection = btn.dataset.collection;
      state.directorySearch = '';
      if (els.categorySearchInput) els.categorySearchInput.value = '';
      renderClusterTabBar();
      fadeAndRenderDirectory();
    });
  });
  els.categoryDirectoryGrid.querySelectorAll('[data-collection-reset]').forEach(btn => {
    btn.addEventListener('click', () => {
      state.collection = 'all';
      fadeAndRenderDirectory();
    });
  });
}

function renderClusterTabBar() {
  const tabBar = document.getElementById('clusterTabBar');
  if (!tabBar || !state.catalog) return;
  const isAr = state.lang === 'ar';
  const collections = getDirectoryCollections();
  const countWord = isAr ? 'مجموعات' : 'collections';

  const allTab = {
    key: 'all',
    label: { en: 'All Collections', ar: 'كل المجموعات' },
    count: collections.length,
    mark: 'ALL',
    gradient: 'linear-gradient(135deg,#0f0c1a,#2a1f3d)',
  };

  const parentTabs = Object.entries(DIRECTORY_PARENT_META).map(([key, meta]) => ({
    key,
    label: meta.label,
    count: collections.filter(collection => collection.parent === key).length,
    mark: meta.mark,
    gradient: meta.gradient,
  })).filter(tab => tab.count > 0);

  const tabs = [allTab, ...parentTabs];

  tabBar.innerHTML = tabs.map(c => {
    const name = c.key === 'all' ? (isAr ? c.label.ar : c.label.en) : (c.label[state.lang] || c.label.en);
    const isActive = state.cluster === c.key;
    return `
      <button class="ml-cluster-tab${isActive ? ' is-active' : ''}" data-cluster="${escapeHtml(c.key)}" role="tab" aria-selected="${isActive}" aria-label="${escapeHtml(name)}">
        <div class="ml-cluster-tab-bg" style="background:${c.gradient};" aria-hidden="true"></div>
        <div class="ml-cluster-tab-content">
          <span class="ml-cluster-tab-emoji directory-parent-mark" aria-hidden="true">${c.mark}</span>
          <div class="ml-cluster-tab-text">
            <span class="ml-cluster-tab-name">${escapeHtml(name)}</span>
            <span class="ml-cluster-tab-count">${c.count} ${countWord}</span>
          </div>
        </div>
      </button>`;
  }).join('');

  tabBar.querySelectorAll('.ml-cluster-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      const newCluster = btn.dataset.cluster;
      if (state.cluster === newCluster) return;
      state.cluster = newCluster;
      state.collection = 'all';
      renderClusterTabBar();
      fadeAndRenderDirectory();
    });
  });
}

function fadeAndRenderDirectory() {
  const grid = els.categoryDirectoryGrid;
  if (!grid) { renderCategoryDirectory(); return; }
  grid.style.transition = 'none';
  grid.style.opacity = '0';
  grid.style.transform = 'translateY(10px)';
  requestAnimationFrame(() => {
    renderCategoryDirectory();
    requestAnimationFrame(() => {
      grid.style.transition = 'opacity 0.22s ease, transform 0.22s ease';
      grid.style.opacity = '1';
      grid.style.transform = 'translateY(0)';
    });
  });
}

function getGreeting(name, lang) {
  const h = new Date().getHours();
  const isAr = lang === 'ar';
  const greet = isAr
    ? (h < 12 ? 'صباح الخير' : 'مساء الخير')
    : (h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening');
  return isAr ? `${greet}، ${name}` : `${greet}, ${name}`;
}

function getDashInsight(totalSolved, totalQ, catProgress, lang) {
  const isAr = lang === 'ar';
  if (state.streak >= 7) return isAr ? `🔥 ${state.streak} أيام متتالية — لا يُوقفك شيء!` : `🔥 ${state.streak}-day streak — unstoppable!`;
  if (state.streak >= 3) return isAr ? `🔥 ${state.streak} أيام رائعة — واصل!` : `🔥 ${state.streak}-day streak — keep the momentum!`;
  if (!isLevelUnlocked('hard') && totalSolved >= 7) {
    const left = 10 - totalSolved;
    return isAr ? `💪 ${left} إجابة صحيحة تفتح لك مستوى الصعب!` : `💪 ${left} more correct answer${left === 1 ? '' : 's'} to unlock Head Scratcher!`;
  }
  if (isLevelUnlocked('hard') && !isLevelUnlocked('very-advanced')) {
    const hardSolved = getCorrectCountByDifficulty('hard');
    if (hardSolved >= 7) {
      const left = 10 - hardSolved;
      return isAr ? `💎 ${left} إجابة صعبة تفتح لك مستوى الجدار!` : `💎 ${left} more hard answer${left === 1 ? '' : 's'} to unlock Brick Wall!`;
    }
  }
  const almostDone = catProgress.find(c => c.pct >= 80 && c.pct < 100);
  if (almostDone) {
    const left = almostDone.count - almostDone.solved;
    return isAr ? `🏁 ${left} سؤال لإكمال ${almostDone.title.ar || almostDone.title.en}!` : `🏁 ${left} question${left === 1 ? '' : 's'} left to complete ${almostDone.title.en}!`;
  }
  if (catProgress.length > 0 && catProgress[0].pct > 0) {
    const best = catProgress[0];
    return isAr ? `✨ أقوى مجال لديك: ${best.title.ar || best.title.en} بنسبة ${best.pct}%` : `✨ Top category: ${best.title.en} at ${best.pct}% complete`;
  }
  if (!isLevelUnlocked('hard') && totalSolved > 0) {
    const left = 10 - totalSolved;
    return isAr ? `💪 ${left} إجابة صحيحة تفتح لك مستوى الصعب!` : `💪 ${left} more correct answer${left === 1 ? '' : 's'} to unlock Head Scratcher!`;
  }
  const pct = totalQ > 0 ? ((totalSolved / totalQ) * 100).toFixed(1) : '0.0';
  return isAr ? `🧠 أجبت على ${pct}% من جميع ألغاز JAKH` : `🧠 You've tackled ${pct}% of all JAKH riddles`;
}

function renderAccountSummary(mount) {
  if (!mount) return;
  const account = getActiveUser();
  if (!account) {
    const guestSolvedCount = getTotalCorrectCount();
    const guestFavCount = getGuestFavorites().length;
    const hasProgress = guestSolvedCount > 0 || guestFavCount > 0;
    mount.innerHTML = `
      <section class="account-card">
        <strong>${escapeHtml(state.apiAvailable ? t('guestTitle') : (state.lang === 'ar' ? 'التقدم على الجهاز' : 'Progress on this device'))}</strong>
        ${hasProgress ? `
          <div class="stats-grid">
            <div class="stat-box"><span>${escapeHtml(t('solved'))}</span><strong>${guestSolvedCount}</strong></div>
            <div class="stat-box"><span>${escapeHtml(t('favorites'))}</span><strong>${guestFavCount}</strong></div>
          </div>
          <p class="muted" style="font-size:0.82rem">${escapeHtml(state.apiAvailable
            ? (state.lang === 'ar' ? 'تقدمك محفوظ في هذا المتصفح. أنشئ حسابًا لمزامنته عبر أجهزتك.' : 'Progress saved in this browser. Sign up to sync across devices.')
            : (state.lang === 'ar' ? 'تقدمك محفوظ بأمان على هذا الجهاز.' : 'Your progress is saved safely on this device.'))}</p>
        ` : `<p>${escapeHtml(state.apiAvailable ? t('guestText') : (state.lang === 'ar' ? 'ابدأ بحل الأسئلة وسيُحفظ تقدمك على هذا الجهاز.' : 'Start solving questions and your progress will be saved on this device.'))}</p>`}
        ${state.apiAvailable ? `<div class="hero-actions">
          <button class="primary-btn" id="inlineCreateProfileBtn">${escapeHtml(t('createLocalProfile'))}</button>
        </div>` : ''}
      </section>
    `;
    const button = document.getElementById('inlineCreateProfileBtn');
    if (button) button.addEventListener('click', openAuthModal);
    return;
  }
  // ── Category page sidebar (unchanged) ──────────────────
  if (state.page === 'category') {
    const earned = computeAchievements();
    const achHtml = earned.length
      ? earned.map(a => `<span class="achievement-badge" title="${escapeHtml(state.lang === 'ar' ? a.descAr : a.descEn)}">${a.icon} ${escapeHtml(state.lang === 'ar' ? a.ar : a.en)}</span>`).join('')
      : `<span class="muted" style="font-size:0.82rem">${escapeHtml(t('achNoAchievements'))}</span>`;
    const dc = state.categoryData?.difficultyCounts || {};
    const diffs = [
      { key: 'easy',          labelEn: 'Easy',      labelAr: 'سهل',      color: '#22c55e' },
      { key: 'medium',        labelEn: 'Medium',    labelAr: 'متوسط',    color: '#f59e0b' },
      { key: 'hard',          labelEn: 'Hard',      labelAr: 'صعب',      color: '#ef4444' },
      { key: 'very-advanced', labelEn: 'Difficult', labelAr: 'صعب جداً', color: '#a855f7' },
    ].filter(d => dc[d.key] > 0);
    const bars = diffs.map(d => {
      const total = dc[d.key];
      const done = getCorrectCountByDifficulty(d.key);
      const pct = total ? Math.min(100, Math.round((done / total) * 100)) : 0;
      return `<div class="diff-row">
        <span class="diff-label">${escapeHtml(state.lang === 'ar' ? d.labelAr : d.labelEn)}</span>
        <div class="diff-track"><div class="diff-fill" style="width:${pct}%;background:${d.color}"></div></div>
        <span class="diff-count">${done}/${total}</span>
      </div>`;
    }).join('');
    mount.innerHTML = `
      <section class="account-card">
        <div class="row-between">
          <strong>${escapeHtml(account.username)}</strong>
          <span class="badge">${escapeHtml(t('savedProgress'))}</span>
        </div>
        <div class="stats-grid">
          <div class="stat-box"><span>${escapeHtml(t('score'))}</span><strong>${getScore()}</strong></div>
          <div class="stat-box"><span>${escapeHtml(t('solved'))}</span><strong>${getTotalCorrectCount()}</strong></div>
          ${state.streak > 0 ? `<div class="stat-box"><span>${state.lang === 'ar' ? 'متتالية' : 'Streak'}</span><strong>🔥 ${state.streak}</strong></div>` : ''}
        </div>
        ${bars ? `<div class="diff-breakdown">${bars}</div>` : ''}
        <div class="achievements-section">
          <p class="achievements-title">${escapeHtml(t('achievementsTitle'))}</p>
          <div class="achievements-list">${achHtml}</div>
        </div>
      </section>
    `;
    return;
  }

  // ── Home page: dynamic dashboard ───────────────────────
  const isAr = state.lang === 'ar';
  const totalSolved = getTotalCorrectCount();
  const totalQ = state.catalog?.site?.totalQuestions || 1;
  const overallPct = Math.min(100, Math.round((totalSolved / totalQ) * 100));

  const catProgress = (state.catalog?.categories || [])
    .map(cat => ({ ...cat, ...getCategoryProgress(cat.slug) }))
    .filter(c => c.solved > 0)
    .sort((a, b) => b.pct - a.pct)
    .slice(0, 3);

  const topCatHtml = catProgress.length > 0 ? `
    <div class="dash-section">
      <p class="dash-section-label">${isAr ? 'تقدّمك بالفئات' : 'Leading in'}</p>
      ${catProgress.map(c => `
        <div class="dash-cat-row">
          <span class="dash-cat-emoji">${escapeHtml(c.emoji || '📚')}</span>
          <span class="dash-cat-name">${escapeHtml(c.title[state.lang] || c.title.en)}</span>
          <div class="dash-cat-bar"><div class="dash-cat-fill" style="width:${c.pct}%"></div></div>
          <span class="dash-cat-pct">${c.pct}%</span>
        </div>`).join('')}
    </div>` : '';

  const insight = getDashInsight(totalSolved, totalQ, catProgress, state.lang);
  const earned = computeAchievements();
  const achHtml = earned.length
    ? `<div class="dash-achievements">${earned.map(a => `<span class="achievement-badge" title="${escapeHtml(state.lang === 'ar' ? a.descAr : a.descEn)}">${a.icon} ${escapeHtml(state.lang === 'ar' ? a.ar : a.en)}</span>`).join('')}</div>`
    : '';

  mount.innerHTML = `
    <div class="dash-card">
      <div class="dash-head">
        <span class="dash-greeting">${escapeHtml(getGreeting(account.username, state.lang))}</span>
        <div class="dash-score-display">
          <span class="dash-score-num">${getScore()}</span>
          <span class="dash-score-unit">${isAr ? 'نقطة' : 'pts'}</span>
        </div>
      </div>

      <div class="dash-stats">
        <div class="dash-stat">
          <strong>${totalSolved}</strong>
          <span>${isAr ? 'محلول' : 'solved'}</span>
        </div>
        <div class="dash-stat">
          <strong>${account.favorites.length}</strong>
          <span>${isAr ? 'مفضلة' : 'saved'}</span>
        </div>
        <div class="dash-stat${state.streak > 0 ? ' dash-stat-streak' : ''}">
          <strong>${state.streak > 0 ? `🔥 ${state.streak}` : '—'}</strong>
          <span>${isAr ? 'متتالية' : 'streak'}</span>
        </div>
      </div>

      <div class="dash-section">
        <div class="dash-progress-bar">
          <div class="dash-progress-fill" style="width:${overallPct}%"></div>
        </div>
        <p class="dash-progress-text">${isAr ? `${totalSolved} من ${totalQ.toLocaleString()} سؤال` : `${totalSolved} of ${totalQ.toLocaleString()} questions`}</p>
      </div>

      ${topCatHtml}

      <div class="dash-insight">
        <p>${escapeHtml(insight)}</p>
      </div>

      ${achHtml}
    </div>
  `;
}

function injectBackToTop() {
  if (document.getElementById('backToTopBtn')) return;
  const btn = document.createElement('button');
  btn.id = 'backToTopBtn';
  btn.className = 'back-to-top-btn';
  btn.setAttribute('aria-label', state.lang === 'ar' ? 'العودة للأعلى' : 'Back to top');
  btn.textContent = '↑';
  btn.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));
  document.body.appendChild(btn);
  window.addEventListener('scroll', () => {
    btn.classList.toggle('is-visible', window.scrollY > 500);
  }, { passive: true });
}

function renderCategoryPage() {
  if (!state.categoryData || !state.catalog) return;
  injectBackToTop();

  const category = state.categoryData;
  if (els.categoryKicker) els.categoryKicker.textContent = category.cluster[state.lang];
  if (els.categoryTitle) els.categoryTitle.textContent = `${category.emoji} ${category.title[state.lang]}`;
  const breadcrumbEl = document.getElementById('breadcrumbCategoryName');
  if (breadcrumbEl) breadcrumbEl.textContent = category.title[state.lang];
  if (els.categoryDescription) els.categoryDescription.textContent = category.description[state.lang];
  if (els.categoryCountPill) els.categoryCountPill.textContent = fmt('pageQuestions', { count: category.count });
  if (els.categoryImage) {
    const gradient = CATEGORY_GRADIENTS[category.slug] || 'linear-gradient(135deg, #1E3A5F 0%, #4A90D9 100%)';
    const heroDiv = document.createElement('div');
    heroDiv.className = 'category-hero-bg';
    heroDiv.style.background = gradient;
    heroDiv.innerHTML = `<span class="category-hero-emoji" aria-hidden="true">${category.emoji}</span>`;
    els.categoryImage.replaceWith(heroDiv);
    els.categoryImage = null;
  }
  if (els.categoryDiffBadge) els.categoryDiffBadge.textContent = buildDiffBadge(category);
  restoreFilterParams();
  renderAccountSummary(els.categorySummaryMount);
  renderSubcategoryFilters();
  renderCards();
  renderRelatedCategories();
  markCachedCategories();
  injectFaqSchema();
}

function injectFaqSchema() {
  document.getElementById('faqSchema')?.remove();
  if (!state.categoryData?.cards?.length) return;
  const easy = state.categoryData.cards.filter(c => c.difficulty === 'easy' || c.difficulty === 'medium').slice(0, 8);
  if (!easy.length) return;
  const script = document.createElement('script');
  script.id = 'faqSchema';
  script.type = 'application/ld+json';
  script.textContent = JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: easy.map(c => ({
      '@type': 'Question',
      name: c.question.en,
      acceptedAnswer: { '@type': 'Answer', text: c.answer.en },
    })),
  });
  document.head.appendChild(script);
}

function buildDiffBadge(category) {
  const dc = category.difficultyCounts || {};
  const total = category.count || (category.cards || []).length;
  const order = ['easy', 'medium', 'hard', 'very-advanced'];
  const labels = state.lang === 'ar'
    ? { easy: 'سهل', medium: 'متوسط', hard: 'صعب', 'very-advanced': 'صعب جداً' }
    : { easy: 'Piece of Cake', medium: 'Brain Tickler', hard: 'Head Scratcher', 'very-advanced': 'Brick Wall' };
  const parts = order.filter(d => dc[d] > 0).map(d => `${dc[d]} ${labels[d]}`);
  const totalLabel = state.lang === 'ar' ? `${total} سؤال` : `${total} questions`;
  return parts.length ? `${totalLabel} — ${parts.join(' · ')}` : totalLabel;
}

function renderSubcategoryFilters() {
  if (!els.subcategoryWrap || !els.subcategoryFilters || !state.categoryData) return;
  let subcats = state.categoryData.subcategories || [];
  if (!subcats.length) {
    const counts = {};
    for (const card of state.categoryData.cards || []) {
      const sc = card.subcategory;
      if (sc && sc.en) {
        if (!counts[sc.en]) counts[sc.en] = { en: sc.en, ar: sc.ar || sc.en, count: 0 };
        counts[sc.en].count++;
      }
    }
    subcats = Object.values(counts).sort((a, b) => b.count - a.count).slice(0, 12);
  }
  if (!subcats.length) {
    els.subcategoryWrap.classList.add('hidden');
    return;
  }
  els.subcategoryWrap.classList.remove('hidden');
  const allLabel = state.lang === 'ar' ? 'الكل' : 'All';
  const chips = [{ key: 'all', label: allLabel }, ...subcats.map((item) => ({ key: item.en, label: item[state.lang] || item.en || '' }))];
  els.subcategoryFilters.innerHTML = chips.map((chip) => `
    <button class="category-chip ${state.subcategory === chip.key ? 'is-active' : ''}" data-subcategory="${escapeHtml(chip.key)}">${escapeHtml(chip.label)}</button>
  `).join('');
  els.subcategoryFilters.querySelectorAll('[data-subcategory]').forEach((button) => {
    button.addEventListener('click', () => {
      state.subcategory = button.dataset.subcategory;
      state.cardPage = 1;
      renderSubcategoryFilters();
      renderCards();
    });
  });
}

function syncFilterParams() {
  if (state.page !== 'category') return;
  const params = new URLSearchParams(location.search);
  if (state.difficulty && state.difficulty !== 'all') params.set('difficulty', state.difficulty); else params.delete('difficulty');
  if (state.view && state.view !== 'all') params.set('view', state.view); else params.delete('view');
  if (state.sort && state.sort !== 'featured') params.set('sort', state.sort); else params.delete('sort');
  if (state.subcategory && state.subcategory !== 'all') params.set('sub', state.subcategory); else params.delete('sub');
  if (state.search) params.set('q', state.search); else params.delete('q');
  const newSearch = params.toString() ? `?${params.toString()}` : location.pathname;
  history.replaceState(null, '', params.toString() ? `${location.pathname}?${params.toString()}` : location.pathname);
}

function restoreFilterParams() {
  const params = new URLSearchParams(location.search);
  if (params.has('difficulty')) state.difficulty = params.get('difficulty');
  if (params.has('view')) state.view = params.get('view');
  if (params.has('sort')) state.sort = params.get('sort');
  if (params.has('sub')) state.subcategory = params.get('sub');
  if (params.has('q')) state.search = params.get('q').toLowerCase();
  // Sync select UI elements
  if (els.difficultySelect && state.difficulty) els.difficultySelect.value = state.difficulty;
  if (els.viewSelect && state.view) els.viewSelect.value = state.view;
  if (els.sortSelect && state.sort) els.sortSelect.value = state.sort;
  if (els.cardSearchInput && state.search) els.cardSearchInput.value = state.search;
}

function getFilteredCards() {
  if (!state.categoryData) return [];
  let cards = [...state.categoryData.cards];
  if (state.difficulty !== 'all') cards = cards.filter((card) => card.difficulty === state.difficulty);
  if (state.view === 'solved') cards = cards.filter((card) => getProgressResult(card.id) === 'correct');
  if (state.view === 'unsolved') cards = cards.filter((card) => getProgressResult(card.id) !== 'correct');
  if (state.view === 'favorites') cards = cards.filter((card) => isFavorite(card.id));
  if (state.subcategory !== 'all') cards = cards.filter((card) => card.subcategory && card.subcategory.en === state.subcategory);
  if (state.search) {
    cards = cards.filter((card) => {
      const haystack = [
        card.question.en, card.question.ar, card.answer.en, card.answer.ar,
        card.subcategory ? card.subcategory.en : '', card.subcategory ? card.subcategory.ar : ''
      ].join(' ').toLowerCase();
      return haystack.includes(state.search);
    });
  }
  if (state.sort === 'difficulty') {
    const order = { easy: 0, medium: 1, hard: 2, 'very-advanced': 3 };
    cards.sort((a, b) => order[a.difficulty] - order[b.difficulty] || a.id.localeCompare(b.id));
  } else if (state.sort === 'az') {
    cards.sort((a, b) => a.question[state.lang].localeCompare(b.question[state.lang], state.lang));
  } else if (state.sort === 'random') {
    cards = shuffleArray(cards);
  }
  return cards;
}

function createCardMarkup(card) {
  const flipped = state.flipped.has(card.id);
  const favorite = isFavorite(card.id);
  const result = getProgressResult(card.id);
  const frontFocus = flipped ? 'tabindex="-1"' : '';
  const backFocus = flipped ? '' : 'tabindex="-1"';
  const difficultyLabel = card.difficulty === 'very-advanced' ? t('veryAdvanced') : t(card.difficulty);
  const subcatText = card.subcategory ? (card.subcategory[state.lang] || card.subcategory.en || '') : '';
  const subcat = subcatText ? `<span class="badge badge-subcategory">${escapeHtml(subcatText)}</span>` : '';
  const categoryBadge = `<span class="badge badge-category">${escapeHtml(card.mode === 'story' ? '🕯️' : state.categoryData.emoji || '❔')} ${escapeHtml(state.categoryData.title[state.lang])}</span>`;
  const difficultyBadge = `<span class="badge badge-difficulty" data-difficulty="${escapeHtml(card.difficulty)}">${escapeHtml(difficultyLabel)}</span>`;

  let trialCard = false;
  if (!isLevelUnlocked(card.difficulty)) {
    if (!state.dbUser) {
      if (isTrialUnlocked(card.id, card.difficulty)) {
        trialCard = true; // fall through to normal render with data-trial marker
      } else {
        const unlockLabel = state.lang === 'ar' ? '🔓 فتح الإجابة' : '🔓 Unlock answer';
        return `
          <article class="riddle-card is-paywall" data-id="${escapeHtml(card.id)}" data-mode="${escapeHtml(card.mode || 'quiz')}" aria-label="${escapeHtml(card.question[state.lang])}">
            <div class="card-inner">
              <section class="card-face card-front">
                <div class="card-badges">${categoryBadge}${difficultyBadge}${subcat}</div>
                <p class="card-question">${escapeHtml(card.question[state.lang])}</p>
                <div class="card-actions">
                  <button class="primary-btn mini-btn" data-action="paywall" data-id="${escapeHtml(card.id)}">${escapeHtml(unlockLabel)}</button>
                </div>
              </section>
            </div>
          </article>
        `;
      }
    } else {
      const lockMsg = card.difficulty === 'hard' ? t('lockHard') : t('lockDifficult');
      return `
        <article class="riddle-card is-locked" data-id="${escapeHtml(card.id)}" data-mode="${escapeHtml(card.mode || 'quiz')}" tabindex="0" aria-label="Locked">
          <div class="card-inner">
            <section class="card-face card-front">
              <div class="card-badges">${categoryBadge}${difficultyBadge}${subcat}</div>
              <p class="card-question">${escapeHtml(card.question[state.lang])}</p>
              <p class="lock-msg">🔒 ${escapeHtml(lockMsg)}</p>
            </section>
          </div>
        </article>
      `;
    }
  }

  const flipLabel = flipped ? t('backToQuestion') : t('flipForAnswer');
  const audioBtn = state.audioEnabled
    ? `<button class="mini-btn card-audio-btn" data-action="audio" data-id="${escapeHtml(card.id)}" aria-label="${escapeHtml(t('audioPlay'))}" title="${escapeHtml(t('audioPlay'))}" ${frontFocus}>🔊</button>`
    : '';
  let markBtns;
  if (result === 'correct') {
    markBtns = `<button class="card-mark-btn is-correct" data-action="unmark" data-id="${escapeHtml(card.id)}" aria-label="${escapeHtml(t('markUnsolved'))}" title="${escapeHtml(t('markUnsolved'))}" ${backFocus}>✓</button>`;
  } else if (result === 'wrong') {
    markBtns = `<button class="card-mark-btn is-wrong" data-action="unmark" data-id="${escapeHtml(card.id)}" aria-label="${escapeHtml(t('markUnsolved'))}" title="${escapeHtml(t('markUnsolved'))}" ${backFocus}>✗</button>`;
  } else {
    markBtns = `
      <button class="card-mark-btn action-correct" data-action="markCorrect" data-id="${escapeHtml(card.id)}" aria-label="${escapeHtml(t('markSolved'))}" title="${escapeHtml(t('markSolved'))}" ${backFocus}>✓</button>
      <button class="card-mark-btn action-wrong" data-action="markWrong" data-id="${escapeHtml(card.id)}" aria-label="${escapeHtml(t('markWrong'))}" title="${escapeHtml(t('markWrong'))}" ${backFocus}>✗</button>
    `;
  }

  return `
    <article class="riddle-card ${flipped ? 'is-flipped' : ''} ${result === 'correct' ? 'is-solved' : ''} ${result === 'wrong' ? 'is-wrong-card' : ''}" data-id="${escapeHtml(card.id)}" data-mode="${escapeHtml(card.mode || 'quiz')}" ${trialCard ? 'data-trial="1"' : ''} aria-label="${escapeHtml(card.question[state.lang])}">
      <div class="card-inner">
        <section class="card-face card-front" aria-hidden="${flipped ? 'true' : 'false'}" ${flipped ? 'inert' : ''}>
          <div class="card-badges">
            ${categoryBadge}
            ${difficultyBadge}
            ${subcat}
          </div>
          <p class="card-question">${escapeHtml(card.question[state.lang])}</p>
          <div class="card-actions">
            <button class="primary-btn mini-btn action-flip" data-action="flip" data-id="${escapeHtml(card.id)}" ${frontFocus}>${escapeHtml(flipLabel)}</button>
            <button class="mini-btn action-fav${favorite ? ' is-fav' : ''}" data-action="favorite" data-id="${escapeHtml(card.id)}" aria-label="${escapeHtml(favorite ? t('removeFavorite') : t('addFavorite'))}" title="${escapeHtml(favorite ? t('removeFavorite') : t('addFavorite'))}" ${frontFocus}>${favorite ? '♥' : '♡'}</button>
            ${audioBtn}
          </div>
        </section>
        <section class="card-face card-back" aria-hidden="${flipped ? 'false' : 'true'}" ${flipped ? '' : 'inert'}>
          <p class="card-answer"><strong>${escapeHtml(card.answer[state.lang])}</strong></p>
          <div class="card-actions">
            <button class="primary-btn mini-btn action-flip" data-action="flip" data-id="${escapeHtml(card.id)}" ${backFocus}>${escapeHtml(t('backToQuestion'))}</button>
            <div class="card-icon-row">
              <button class="card-fav-btn${favorite ? ' is-fav' : ''}" data-action="favorite" data-id="${escapeHtml(card.id)}" aria-label="${escapeHtml(favorite ? t('removeFavorite') : t('addFavorite'))}" title="${escapeHtml(favorite ? t('removeFavorite') : t('addFavorite'))}" ${backFocus}>${favorite ? '♥' : '♡'}</button>
              ${markBtns}
              <button class="mini-btn card-share-btn" data-action="share" data-id="${escapeHtml(card.id)}" aria-label="${state.lang === 'ar' ? 'مشاركة السؤال' : 'Share question'}" title="${state.lang === 'ar' ? 'مشاركة السؤال' : 'Share question'}" ${backFocus}>↗</button>
              ${state.apiAvailable ? `<button class="mini-btn report-btn" data-action="report" data-id="${escapeHtml(card.id)}" aria-label="${escapeHtml(t('reportBtn'))}" title="${escapeHtml(t('reportBtn'))}" ${backFocus}>⚑</button>` : ''}
            </div>
          </div>
        </section>
      </div>
    </article>
  `;
}

function updateCardEl(id) {
  const el = els.cardGrid?.querySelector(`[data-id="${CSS.escape(id)}"]`);
  if (!el) return;
  const card = state.categoryData?.cards.find(c => c.id === id);
  if (!card) return;
  const cardI = el.style.getPropertyValue('--card-i');
  const tmp = document.createElement('div');
  tmp.innerHTML = createCardMarkup(card);
  const newEl = tmp.firstElementChild;
  newEl.style.setProperty('--card-i', cardI || '0');
  newEl.style.animation = 'none';
  el.replaceWith(newEl);
}

// When marking or favoriting, visibility may change if a filter is active
function updateCardElOrRefresh(id) {
  if (state.view !== 'all') {
    renderCards();
  } else {
    updateCardEl(id);
  }
}

function renderCards() {
  if (!els.cardGrid || !state.categoryData) return;

  // Remove any previous load-more button
  document.getElementById('loadMoreBtn')?.remove();

  const filtered = getFilteredCards();
  const pageEnd = state.cardPage * PAGE_SIZE;
  const visible = filtered.slice(0, pageEnd);

  els.cardGrid.innerHTML = visible.map(createCardMarkup).join('');
  els.cardGrid.querySelectorAll('.riddle-card').forEach((el, i) => {
    el.style.setProperty('--card-i', Math.min(i, 10));
  });

  // Append Load More button when more cards remain
  if (filtered.length > pageEnd) {
    const remaining = filtered.length - pageEnd;
    const btn = document.createElement('button');
    btn.id = 'loadMoreBtn';
    btn.className = 'secondary-btn';
    btn.style.cssText = 'width:100%;margin-top:1rem;display:block;';
    btn.textContent = state.lang === 'ar'
      ? `عرض ${Math.min(PAGE_SIZE, remaining)} إضافي (${remaining} متبقية)`
      : `Show ${Math.min(PAGE_SIZE, remaining)} more (${remaining} remaining)`;
    btn.addEventListener('click', () => {
      state.cardPage += 1;
      renderCards();
    });
    els.cardGrid.insertAdjacentElement('afterend', btn);
  }

  if (els.emptyState) els.emptyState.classList.toggle('hidden', filtered.length > 0);
  if (els.resultsLabel) {
    els.resultsLabel.textContent = filtered.length === state.categoryData.cards.length
      ? fmt('showingAllCards', { count: filtered.length })
      : fmt('showingFilteredCards', { count: filtered.length });
  }
  renderAccountSummary(els.categorySummaryMount);
}

function renderRelatedCategories() {
  if (!els.relatedCategories || !state.catalog || !state.categoryData) return;
  const currentSlug = state.categoryData.slug;

  // Deterministic per-page shuffle: each source page picks a stable but unique set
  // of related pages, ensuring all categories receive inbound links (no orphans).
  function slugHash(str) {
    let h = 0;
    for (let i = 0; i < str.length; i++) h = (Math.imul(31, h) + str.charCodeAt(i)) | 0;
    return h >>> 0;
  }
  function seededShuffle(arr, seed) {
    const out = [...arr];
    for (let i = out.length - 1; i > 0; i--) {
      const j = slugHash(seed + String(i)) % (i + 1);
      [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
  }

  const sameCluster = state.catalog.categories.filter(
    m => m.slug !== currentSlug && m.cluster_key === state.categoryData.cluster_key
  );
  const otherCluster = state.catalog.categories.filter(
    m => m.slug !== currentSlug && m.cluster_key !== state.categoryData.cluster_key
  );

  const related = [
    ...seededShuffle(sameCluster, currentSlug),
    ...seededShuffle(otherCluster, currentSlug),
  ].slice(0, 6);

  els.relatedCategories.innerHTML = related.length
    ? related.map(createCategoryCardMarkup).join('')
    : `<p class="muted">${escapeHtml(t('noRelated'))}</p>`;
}


async function toggleFavorite(id) {
  const isFav = isFavorite(id);

  if (!state.dbUser) {
    const favs = getGuestFavorites();
    if (isFav) {
      saveJson(GUEST_KEYS.favorites, favs.filter(f => f !== id));
      showToast(t('favoriteRemoved'));
    } else {
      favs.push(id);
      saveJson(GUEST_KEYS.favorites, favs);
      showToast(t('favoriteAdded'));
    }
    updateCardElOrRefresh(id);
    renderAccountSummary(els.categorySummaryMount);
    return;
  }

  const dbUser = state.dbUser;
  const action = isFav ? 'remove' : 'add';
  if (action === 'add') {
    dbUser.favorites.push({ cardId: id, categoryId: state.categoryData?.slug || 'unknown' });
    showToast(t('favoriteAdded'));
  } else {
    dbUser.favorites = dbUser.favorites.filter(f => f.cardId !== id);
    showToast(t('favoriteRemoved'));
  }
  updateCardElOrRefresh(id);
  renderAccountSummary(els.categorySummaryMount);

  const synced = await sendCloudMutation(`favorite:${id}`, '/user/favorite', 'POST', {
    cardId: id,
    categoryId: state.categoryData?.slug || 'unknown',
    action,
  });
  if (!synced) {
    const guestFavs = getGuestFavorites().filter(cardId => cardId !== id);
    if (action === 'add') guestFavs.push(id);
    saveJson(GUEST_KEYS.favorites, guestFavs);
    showToast(state.lang === 'ar' ? 'سيتم الحفظ عند عودة الاتصال' : 'Saved on this device — cloud sync will retry');
  }
}

async function markCard(id, result) {
  const card = state.categoryData?.cards.find(item => item.id === id);
  if (!card) return;
  if (result === 'correct') hapticSuccess(); else hapticError();
  const status = result === 'correct' ? card.difficulty : `wrong-${card.difficulty}`;
  showToast(result === 'correct' ? t('solvedAdded') : t('markedWrong'));
  trackEvent(result === 'correct' ? 'card_correct' : 'card_wrong', { category: state.categorySlug, difficulty: card.difficulty });
  if (result === 'correct') {
    const cardEl = els.cardGrid?.querySelector(`[data-id="${CSS.escape(id)}"]`);
    if (cardEl) spawnConfetti(cardEl);
    const h = new Date().getHours();
    if (h >= 0 && h < 5) saveJson('jakh-night-owl', 1);
    checkNewAchievements();
  }

  if (!state.dbUser) {
    const guestSolved = getGuestSolvedMap();
    guestSolved[id] = { status, categoryId: state.categoryData?.slug || 'unknown' };
    saveJson(GUEST_KEYS.solved, guestSolved);
    updateCardElOrRefresh(id);
    if (result === 'correct') flashCard(id);
    renderAccountSummary(els.categorySummaryMount);
    if (result === 'correct') setTimeout(() => checkCategoryComplete(state.categoryData?.slug || ''), 400);
    return;
  }

  const dbUser = state.dbUser;
  dbUser.progress = dbUser.progress.filter(p => p.cardId !== id);
  dbUser.progress.push({ cardId: id, categoryId: state.categoryData?.slug || 'unknown', status });
  updateCardElOrRefresh(id);
  if (result === 'correct') flashCard(id);
  renderAccountSummary(els.categorySummaryMount);
  if (result === 'correct') setTimeout(() => checkCategoryComplete(state.categoryData?.slug || ''), 400);

  const categoryId = state.categoryData?.slug || 'unknown';
  const synced = await sendCloudMutation(`progress:${id}`, '/user/progress', 'POST', { cardId: id, categoryId, status });
  if (!synced) {
    const guestSolved = getGuestSolvedMap();
    guestSolved[id] = { status, categoryId };
    saveJson(GUEST_KEYS.solved, guestSolved);
  }
}

async function unmarkCard(id) {
  if (!state.dbUser) {
    const guestSolved = getGuestSolvedMap();
    delete guestSolved[id];
    saveJson(GUEST_KEYS.solved, guestSolved);
    showToast(t('solvedRemoved'));
    updateCardElOrRefresh(id);
    renderAccountSummary(els.categorySummaryMount);
    return;
  }

  const dbUser = state.dbUser;
  dbUser.progress = dbUser.progress.filter(p => p.cardId !== id);
  showToast(t('solvedRemoved'));
  updateCardElOrRefresh(id);
  renderAccountSummary(els.categorySummaryMount);

  const categoryId = state.categoryData?.slug || 'unknown';
  const synced = await sendCloudMutation(`progress:${id}`, '/user/progress', 'DELETE', { cardId: id, categoryId });
  if (!synced) {
    const guestSolved = getGuestSolvedMap();
    delete guestSolved[id];
    saveJson(GUEST_KEYS.solved, guestSolved);
  }
}

const FOCUSABLE = 'a[href],button:not([disabled]),input,select,textarea,[tabindex]:not([tabindex="-1"])';

function trapFocus(el) {
  const nodes = () => [...el.querySelectorAll(FOCUSABLE)].filter(n => !n.closest('[aria-hidden="true"]'));
  el._trapHandler = (e) => {
    if (e.key !== 'Tab') return;
    const items = nodes();
    if (!items.length) return;
    const first = items[0], last = items[items.length - 1];
    if (e.shiftKey) { if (document.activeElement === first) { e.preventDefault(); last.focus(); } }
    else { if (document.activeElement === last) { e.preventDefault(); first.focus(); } }
  };
  el.addEventListener('keydown', el._trapHandler);
  const firstFocusable = nodes()[0];
  if (firstFocusable) requestAnimationFrame(() => firstFocusable.focus());
}

function releaseFocus(el) {
  if (el._trapHandler) el.removeEventListener('keydown', el._trapHandler);
}

function openModal(name) {
  const modal = els.authModal;
  if (!modal) return;
  modal.classList.remove('hidden');
  modal.setAttribute('aria-hidden', 'false');
  trapFocus(modal);
}

function closeModal(name) {
  if (name === 'leaderboard') {
    const lb = document.getElementById('leaderboardModal');
    if (lb) { lb.classList.add('hidden'); lb.setAttribute('aria-hidden', 'true'); releaseFocus(lb); }
    return;
  }
  const modal = els.authModal;
  if (!modal) return;
  modal.classList.add('hidden');
  modal.setAttribute('aria-hidden', 'true');
  releaseFocus(modal);
}

function openAuthModal() {
  renderAuthModal('signin');
  openModal('auth');
}

function openPaywallModal() {
  const isAr = state.lang === 'ar';
  const trialUsed = getTrialUsedSet().size;
  let modal = document.getElementById('paywallModal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'paywallModal';
    modal.className = 'modal hidden';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.setAttribute('aria-labelledby', 'paywallTitle');
    document.body.appendChild(modal);
  }
  modal.innerHTML = `
    <div class="modal-backdrop" id="paywallBackdrop"></div>
    <div class="modal-card paywall-card">
      <button class="paywall-close" aria-label="${isAr ? 'إغلاق' : 'Close'}">✕</button>
      <div class="paywall-icon">🔓</div>
      <h2 class="paywall-title" id="paywallTitle">${isAr
        ? `جربت ${trialUsed} ألغاز مجانية!`
        : `You've previewed ${trialUsed} premium riddles free!`}</h2>
      <p class="paywall-body">${isAr
        ? 'أنشئ حسابًا مجانيًا لفتح جميع تحديات الصعب والصعب جدًا — مع مزامنة التقدم ولوحة المتصدرين والفرق.'
        : 'Create a free account to unlock all Head Scratcher &amp; Brick Wall challenges — plus progress sync, leaderboards, and teams.'}</p>
      <div class="paywall-actions">
        <button class="primary-btn paywall-signup-btn">${isAr ? 'إنشاء حساب مجاني' : 'Create free account'}</button>
        <button class="ghost-btn paywall-signin-btn">${isAr ? 'تسجيل الدخول' : 'Sign in'}</button>
      </div>
      <p class="paywall-note">${isAr
        ? 'لديك حساب؟ تُفتح المستويات تلقائيًا بعد 10 إجابات صحيحة.'
        : 'Already have an account? Levels unlock automatically after 10 correct answers.'}</p>
    </div>
  `;
  modal.querySelector('#paywallBackdrop').addEventListener('click', closePaywallModal);
  modal.querySelector('.paywall-close').addEventListener('click', closePaywallModal);
  modal.querySelector('.paywall-signup-btn').addEventListener('click', () => {
    closePaywallModal();
    renderAuthModal('register');
    openModal('auth');
  });
  modal.querySelector('.paywall-signin-btn').addEventListener('click', () => {
    closePaywallModal();
    openAuthModal();
  });
  modal.classList.remove('hidden');
  trapFocus(modal);
}

function closePaywallModal() {
  const modal = document.getElementById('paywallModal');
  if (modal) { modal.classList.add('hidden'); releaseFocus(modal); }
}

function renderAuthModal(mode = 'signin') {
  if (!els.authModalBody) return;
  const account = getActiveUser();
  if (account) {
    const easyCount = getCorrectCountByDifficulty('easy');
    const medCount = getCorrectCountByDifficulty('medium');
    const hardCount = getCorrectCountByDifficulty('hard');
    const advCount = getCorrectCountByDifficulty('very-advanced');
    const earnedBadges = [
      easyCount >= 10 ? `<span class="badge" title="${escapeHtml(t('badgeBronze'))}">🥉 Bronze</span>` : '',
      medCount >= 10 ? `<span class="badge" title="${escapeHtml(t('badgeSilver'))}">🥈 Silver</span>` : '',
      hardCount >= 10 ? `<span class="badge" title="${escapeHtml(t('badgeGold'))}">🥇 Gold</span>` : '',
      advCount >= 10 ? `<span class="badge" title="${escapeHtml(t('badgeDiamond'))}">💎 Diamond</span>` : '',
    ].filter(Boolean).join(' ') || '<span class="muted">—</span>';

    const byCategory = {};
    (state.dbUser.progress || []).forEach(p => {
      const cat = p.categoryId && p.categoryId !== 'unknown' ? p.categoryId : null;
      if (!cat) return;
      if (!byCategory[cat]) byCategory[cat] = { correct: 0, wrong: 0 };
      if (p.status.startsWith('wrong-')) byCategory[cat].wrong++;
      else byCategory[cat].correct++;
    });
    const reportRows = Object.entries(byCategory).map(([cat, counts]) => `
      <tr>
        <td style="padding:0.3rem 0.5rem">${escapeHtml(cat)}</td>
        <td style="padding:0.3rem 0.5rem;color:var(--c-green,#4caf50)">${counts.correct}</td>
        <td style="padding:0.3rem 0.5rem;color:var(--c-red,#f44336)">${counts.wrong}</td>
      </tr>
    `).join('');
    const reportHtml = reportRows ? `
      <hr style="margin:1.5rem 0;opacity:0.2;" />
      <strong style="display:block;margin-bottom:0.75rem;">${escapeHtml(t('reportTitle'))}</strong>
      <div style="overflow-x:auto">
        <table style="width:100%;border-collapse:collapse;font-size:0.85rem;">
          <thead><tr>
            <th style="text-align:left;padding:0.3rem 0.5rem;opacity:0.6">${escapeHtml(t('reportCategory'))}</th>
            <th style="padding:0.3rem 0.5rem;opacity:0.6">✓ ${escapeHtml(t('reportCorrect'))}</th>
            <th style="padding:0.3rem 0.5rem;opacity:0.6">✗ ${escapeHtml(t('reportWrong'))}</th>
          </tr></thead>
          <tbody>${reportRows}</tbody>
        </table>
      </div>
    ` : '';

    els.authModalBody.innerHTML = `
      <section class="auth-panel">
        <div style="display:flex;align-items:center;gap:1rem;margin-bottom:1rem;">
          <div style="font-size:3rem;line-height:1;background:var(--panel);padding:0.5rem;border-radius:50%;box-shadow:0 4px 12px rgba(0,0,0,0.1);">${escapeHtml(account.avatar)}</div>
          <div>
            <strong style="font-size:1.2rem;">${escapeHtml(account.username)}</strong>
            <p style="margin:0;opacity:0.7;font-size:0.9rem;">${escapeHtml(t('accountReady'))}</p>
          </div>
        </div>
        <div class="stats-grid">
          <div class="stat-box"><span>${escapeHtml(t('score'))}</span><strong>${getScore()}</strong></div>
          <div class="stat-box"><span>${escapeHtml(t('solved'))}</span><strong>${(state.dbUser?.progress || []).filter(p => !p.status.startsWith('wrong-')).length}</strong></div>
          <div class="stat-box"><span>${escapeHtml(t('favorites'))}</span><strong>${account.favorites.length}</strong></div>
        </div>

        <hr style="margin:1.5rem 0;opacity:0.2;" />
        <strong style="display:block;margin-bottom:0.5rem;">${escapeHtml(t('badgesTitle'))}</strong>
        <div style="display:flex;flex-wrap:wrap;gap:0.5rem;margin-bottom:1rem;">${earnedBadges}</div>

        ${reportHtml}

        <hr style="margin:1.5rem 0;opacity:0.2;" />
        <strong style="display:block;margin-bottom:0.5rem;">${escapeHtml(state.lang === 'ar' ? 'اختر صورتك الرمزية' : 'Choose Your Avatar')}</strong>
        <div id="avatarSelector" style="display:flex;gap:0.5rem;flex-wrap:wrap;font-size:1.75rem;margin-bottom:1rem;">
          ${['👤','🦊','🦉','🐉','⚡️','🔥','👻','👽','🦄','🦁','🐼', '👑', '🚀', '🧠', '🧙‍♂️', '👾'].map(emoji => `
             <button type="button" class="avatar-btn ${account.avatar === emoji ? 'is-active' : ''}" style="border:2px solid ${account.avatar === emoji ? 'var(--accent, #e8613c)' : 'transparent'};background:transparent;cursor:pointer;border-radius:50%;padding:4px;transition:all 0.2s;transform:${account.avatar === emoji ? 'scale(1.1)' : 'scale(1)'};" data-emoji="${emoji}">${emoji}</button>
          `).join('')}
        </div>

        <hr style="margin:1.5rem 0;opacity:0.2;" />
        <strong style="display:block;margin-bottom:0.5rem;">${escapeHtml(state.lang === 'ar' ? 'تغيير كلمة المرور' : 'Change Password')}</strong>
        <div class="form-row" style="margin-bottom:1rem;">
             <label>
               <span>${escapeHtml(state.lang === 'ar' ? 'كلمة المرور الحالية' : 'Current Password')}</span>
               <input type="password" id="currentPassword" />
             </label>
             <label>
               <span>${escapeHtml(state.lang === 'ar' ? 'كلمة المرور الجديدة' : 'New Password')}</span>
               <input type="password" id="newPassword" />
             </label>
        </div>
        <button class="mini-btn" id="changePasswordBtn">${escapeHtml(state.lang === 'ar' ? 'تحديث كلمة المرور' : 'Update Password')}</button>

        <div class="hero-actions" style="margin-top:2rem;">
          <button class="primary-btn" id="logoutBtn" style="background:#555;">${escapeHtml(t('logout'))}</button>
        </div>
      </section>
    `;
    
    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) logoutBtn.addEventListener('click', async () => {
      try { await apiFetch('/auth/logout', { method: 'POST' }); } catch(e){}
      state.dbUser = null;
      closeModal('auth');
      applyStaticCopy();
      rerender();
      showToast(t('signedOut'));
    });

    const avatarBtns = document.querySelectorAll('.avatar-btn');
    avatarBtns.forEach(btn => {
      btn.addEventListener('click', async () => {
        const emoji = btn.dataset.emoji;
        btn.style.opacity = '0.5';
        try {
          await apiFetch('/user/avatar', { method: 'PUT', body: JSON.stringify({ avatar: emoji }) });
          state.dbUser.avatar = emoji;
          renderAuthModal('signin');
          showToast(state.lang === 'ar' ? 'تم تحديث الصورة!' : 'Avatar updated!');
        } catch (err) {
          showToast('Failed to save avatar');
          btn.style.opacity = '1';
        }
      });
    });

    const cpBtn = document.getElementById('changePasswordBtn');
    if (cpBtn) cpBtn.addEventListener('click', async () => {
       const cur = document.getElementById('currentPassword').value;
       const neu = document.getElementById('newPassword').value;
       if (!cur || !neu) return showToast(state.lang === 'ar' ? 'الرجاء ملء حقلي كلمة المرور' : 'Fill both passwords');
       cpBtn.textContent = '...';
       try {
          await apiFetch('/user/password', { method: 'POST', body: JSON.stringify({ currentPassword: cur, newPassword: neu }) });
          showToast(state.lang === 'ar' ? 'تم تحديث كلمة المرور!' : 'Password updated!');
          document.getElementById('currentPassword').value = '';
          document.getElementById('newPassword').value = '';
       } catch (err) {
          showToast(err.message);
       } finally {
          cpBtn.textContent = state.lang === 'ar' ? 'تحديث كلمة المرور' : 'Update Password';
       }
    });
    
    return;
  }
  
  els.authModalBody.innerHTML = `
    <div class="auth-tabs">
      <button class="auth-tab ${mode === 'signin' ? 'is-active' : ''}" id="tabSignin">${escapeHtml(t('authSignInTab'))}</button>
      <button class="auth-tab ${mode === 'register' ? 'is-active' : ''}" id="tabRegister">${escapeHtml(t('authRegisterTab'))}</button>
    </div>
    <form class="auth-form" id="authForm">
      <div class="form-row">
        <label>
          <span>${escapeHtml(t('username'))}</span>
          <input id="authUsername" required minlength="3" />
        </label>
        <label>
          <span>${escapeHtml(t('password'))}</span>
          <input id="authPassword" type="password" required minlength="8" />
        </label>
      </div>
      ${mode === 'register' ? `
      <div class="form-row" style="margin-top: 1rem;">
         <label>
           <span>${escapeHtml(state.lang === 'ar' ? 'البريد الإلكتروني (اختياري)' : 'Email (optional)')}</span>
           <input id="authEmail" type="email" />
         </label>
      </div>` : ''}
      <p class="muted">${escapeHtml(t('passwordHint'))}</p>
      <div class="hero-actions">
        <button class="primary-btn" type="submit" id="authSubmitBtn">${escapeHtml(mode === 'signin' ? t('signIn') : t('register'))}</button>
      </div>
    </form>
  `;
  const tabSignin = document.getElementById('tabSignin');
  const tabRegister = document.getElementById('tabRegister');
  if (tabSignin) tabSignin.addEventListener('click', () => renderAuthModal('signin'));
  if (tabRegister) tabRegister.addEventListener('click', () => renderAuthModal('register'));
  const form = document.getElementById('authForm');
  if (form) {
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const btn = document.getElementById('authSubmitBtn');
      btn.disabled = true;
      btn.textContent = state.lang === 'ar' ? 'جاري التحميل...' : 'Loading...';
      
      const username = document.getElementById('authUsername').value.trim();
      const password = document.getElementById('authPassword').value;
      const emailEl = document.getElementById('authEmail');
      const email = emailEl ? emailEl.value.trim() : null;
      
      try {
          if (mode === 'signin') {
             await apiFetch('/auth/login', { method: 'POST', body: JSON.stringify({ username, password }) });
          } else {
             await apiFetch('/auth/register', { method: 'POST', body: JSON.stringify({ username, password, email }) });
          }
          await checkCloudSession();
          await flushCloudQueue();
          await mergeGuestProgress();
          await checkCloudSession();
          closeModal('auth');
          applyStaticCopy();
          rerender();
          trackEvent(mode === 'signin' ? 'login' : 'sign_up', { method: 'username' });
          showToast(mode === 'signin' ? t('signedIn') : t('accountCreated'));
      } catch (err) {
          showToast(err.message || t('badLogin'));
      } finally {
          btn.disabled = false;
          btn.textContent = mode === 'signin' ? t('signIn') : t('register');
      }
    });
  }
}



async function loadCatalog() {
  if (state.catalog) return;
  state.catalog = await fetchJson('data/catalog.json');
}

async function loadCategoryIfNeeded() {
  if (state.page !== 'category' || !state.categorySlug) return;
  const raw = await fetchJson(`data/${state.categorySlug}.json`);
  // Some category files are plain card arrays; normalise them using catalog metadata
  const meta = (state.catalog?.categories || []).find(c => c.slug === state.categorySlug) || {};
  if (Array.isArray(raw)) {
    state.categoryData = { ...meta, cards: raw };
  } else {
    // Catalog metadata is the taxonomy source of truth; individual data files may
    // still carry older cluster labels from previous generations.
    state.categoryData = { ...raw, ...meta };
  }
}


// ================= ANALYTICS TRACKING =================
let _analyticsInterval = null;

// ── Audio narration ───────────────────────────────────────────────────────────

let   _currentAudio = null;

function _getBestVoice(lang) {
  const voices = window.speechSynthesis.getVoices();
  if (!voices.length) return null;
  const isArabic = lang === 'ar';
  const targets = isArabic
    ? ['ar-SA', 'ar-EG', 'ar-AE', 'ar']
    : ['en-US', 'en-GB', 'en-AU', 'en'];

  function score(v) {
    const n = v.name.toLowerCase();
    let s = 0;
    if (n.includes('enhanced'))       s += 100;
    else if (n.includes('premium'))   s += 90;
    else if (n.includes('neural'))    s += 80;
    else if (n.includes('google'))    s += 70;
    else if (n.includes('natural'))   s += 60;
    else if (n.includes('samantha') || n.includes('daniel')) s += 55;
    if (v.localService) s += 10;
    return s;
  }

  for (const tl of targets) {
    const matches = voices.filter(v => v.lang === tl || v.lang.startsWith(tl + '-'));
    if (matches.length) return matches.sort((a, b) => score(b) - score(a))[0];
  }
  const prefix = isArabic ? 'ar' : 'en';
  const any = voices.filter(v => v.lang.startsWith(prefix));
  return any.length ? any.sort((a, b) => score(b) - score(a))[0] : null;
}

function speakText(text, lang) {
  stopSpeech();

  if (window.speechSynthesis) {
    const doSpeak = () => {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang  = lang === 'ar' ? 'ar-SA' : 'en-US';
      utterance.rate  = lang === 'ar' ? 0.82 : 0.92;
      utterance.pitch = 1.05;
      const voice = _getBestVoice(lang);
      if (voice) utterance.voice = voice;
      utterance.onend  = _clearAudioBtns;
      utterance.onerror = _clearAudioBtns;
      _currentAudio = { pause: () => window.speechSynthesis.cancel() };
      window.speechSynthesis.speak(utterance);
    };

    if (window.speechSynthesis.getVoices().length > 0) {
      doSpeak();
    } else {
      window.speechSynthesis.addEventListener('voiceschanged', doSpeak, { once: true });
    }
    return;
  }

  _clearAudioBtns();
}

function _clearAudioBtns() {
  _currentAudio = null;
  document.querySelectorAll('.card-audio-btn.playing').forEach(b => {
    b.classList.remove('playing');
    b.title = t('audioPlay');
  });
}

function stopSpeech() {
  if (_currentAudio) { _currentAudio.pause(); _currentAudio = null; }
}

function handleAudioBtn(btn) {
  const cardId = btn.dataset.id;
  const card = state.categoryData?.cards.find(c => c.id === cardId);
  if (!card) return;

  if (btn.classList.contains('playing')) {
    stopSpeech();
    btn.classList.remove('playing');
    btn.title = t('audioPlay');
    return;
  }

  document.querySelectorAll('.card-audio-btn.playing').forEach(b => {
    b.classList.remove('playing');
    b.title = t('audioPlay');
  });

  btn.classList.add('playing');
  btn.title = t('audioStop');
  speakText(card.question[state.lang], state.lang);
}

// ── Suggestion box ────────────────────────────────────────────────────────────

function initSuggestionBox() {
  if (!els.suggestionSubmit) return;
  els.suggestionSubmit.addEventListener('click', async () => {
    const text = els.suggestionText?.value.trim() || '';
    if (text.length < 5) { showToast(t('suggestError'), true); return; }
    els.suggestionSubmit.disabled = true;
    try {
      await apiFetch('/suggestions', {
        method: 'POST',
        body: JSON.stringify({ text, email: els.suggestionEmail?.value.trim() || undefined }),
      });
      if (els.suggestionForm) els.suggestionForm.classList.add('hidden');
      if (els.suggestionThanks) els.suggestionThanks.classList.remove('hidden');
    } catch {
      showToast('Could not submit. Please try again.', true);
    } finally {
      els.suggestionSubmit.disabled = false;
    }
  });
}

// ─────────────────────────────────────────────────────────────────────────────

function trackEvent(name, params = {}) {
  try { window.gtag?.('event', name, params); } catch (_) {}
}

function startAnalyticsHeartbeat() {
  if (_analyticsInterval) return;
  _analyticsInterval = setInterval(async () => {
    if (document.hidden || state.page !== 'category' || !state.categorySlug) return;
    try {
      await apiFetch('/analytics/time', {
        method: 'POST',
        body: JSON.stringify({ pageSlug: state.categorySlug, timeSpent: 30 })
      });
    } catch (err) {}
  }, 30000);
}
// ======================================================


// ================= DAILY CHALLENGE =================
async function loadDailyChallenge() {
  if (state.dailyCard) return;
  const today = new Date().toISOString().split('T')[0];
  const cacheKey = `jakh-daily-${today}`;
  try {
    const cached = sessionStorage.getItem(cacheKey);
    if (cached) { state.dailyCard = JSON.parse(cached); return; }
    if (!state.catalog) return;
    const hash = today.split('').reduce((h, c) => ((h * 31) + c.charCodeAt(0)) | 0, 0);
    const abs = Math.abs(hash);
    const cats = state.catalog.categories.filter(c => c.count >= 15 && c.mode !== 'story');
    const cat = cats[abs % cats.length];
    const raw = await fetchJson(`data/${cat.slug}.json`);
    const cards = (Array.isArray(raw) ? raw : (raw.cards || [])).filter(c => c.difficulty === 'easy' || c.difficulty === 'medium');
    if (!cards.length) return;
    const card = cards[(abs >> 4) % cards.length];
    state.dailyCard = { ...card, categorySlug: cat.slug, categoryTitle: cat.title, categoryEmoji: cat.emoji || '🎯' };
    sessionStorage.setItem(cacheKey, JSON.stringify(state.dailyCard));
  } catch (e) { state.dailyCard = null; }
}

function renderDailyChallenge() {
  const mount = document.getElementById('dailyChallengeMount');
  if (!mount) return;
  if (!state.dailyCard) { mount.innerHTML = ''; return; }
  const card = state.dailyCard;
  const lang = state.lang;
  const today = new Date().toISOString().split('T')[0];
  const isDone = !!localStorage.getItem(`jakh-daily-done-${today}`);
  const isFlipped = state.flipped.has('__daily__');
  mount.innerHTML = `
    <section class="shell daily-challenge-section">
      <div class="daily-challenge-card ${isDone ? 'daily-done' : ''}">
        <div>
          <p class="daily-challenge-eyebrow">🎯 ${lang === 'ar' ? 'تحدي اليوم' : "Today's Challenge"}${isDone ? ` <span class="daily-done-badge">${lang === 'ar' ? '✓ مكتمل' : '✓ Done'}</span>` : ''}</p>
          <p class="daily-challenge-meta">${escapeHtml(card.categoryEmoji)} ${escapeHtml(card.categoryTitle[lang])} &nbsp;·&nbsp; ${escapeHtml(t(card.difficulty === 'very-advanced' ? 'veryAdvanced' : card.difficulty))}</p>
          <p class="daily-challenge-q">${escapeHtml(card.question[lang])}</p>
          ${isFlipped ? `<div class="daily-challenge-answer">💡 ${escapeHtml(card.answer[lang])}</div>` : ''}
        </div>
        <div class="daily-challenge-btns">
          <button class="primary-btn mini-btn" id="flipDailyBtn">${isFlipped ? escapeHtml(t('backToQuestion')) : escapeHtml(t('flipForAnswer'))}</button>
          <a class="ghost-btn mini-btn" href="${escapeHtml(card.categorySlug)}">${lang === 'ar' ? 'المزيد ←' : 'Full category →'}</a>
        </div>
      </div>
    </section>`;
  document.getElementById('flipDailyBtn')?.addEventListener('click', () => {
    if (!state.flipped.has('__daily__')) {
      localStorage.setItem(`jakh-daily-done-${today}`, '1');
    }
    if (state.flipped.has('__daily__')) state.flipped.delete('__daily__'); else state.flipped.add('__daily__');
    renderDailyChallenge();
  });
}

// ================= STREAKS =================
async function loadStreak() {
  if (!state.dbUser) { state.streak = 0; state.freezeCount = 0; return; }
  try {
    const data = await apiFetch('/user/streak');
    state.streak = data.streak || 0;
    state.freezeCount = data.freezeCount || 0;
  } catch (e) { state.streak = 0; state.freezeCount = 0; }
}

// ================= TIMED QUIZ (Quiz Master Mode) =================
function createTimedQuizModal() {
  if (document.getElementById('timedQuizOverlay')) return;
  const lang = state.lang;
  const el = document.createElement('div');
  el.id = 'timedQuizOverlay';
  el.className = 'timed-quiz-overlay hidden';
  el.innerHTML = `
    <div class="timed-quiz-card">
      <div class="tq-header">
        <span id="tqProgressText" class="tq-progress-text">1 / 10</span>
        <div class="tq-timer-group">
          <span id="tqCountdown" class="timed-quiz-countdown">15</span>
          <span class="tq-sec">s</span>
        </div>
        <button class="tq-exit-btn" id="tqExitBtn" aria-label="Exit">✕</button>
      </div>
      <div class="timed-quiz-track"><div id="tqTrackFill" class="timed-quiz-track-fill" style="width:100%"></div></div>
      <div class="tq-qna-block">
        <div class="tq-q-wrap">
          <span class="tq-block-label">${lang === 'ar' ? 'السؤال' : 'Question'}</span>
          <p id="tqQuestion" class="timed-quiz-question"></p>
        </div>
        <div class="tq-qna-divider"></div>
        <div class="tq-a-wrap">
          <span class="tq-block-label tq-answer-label">${lang === 'ar' ? 'الإجابة' : 'Answer'}</span>
          <p id="tqAnswer" class="tq-answer-text"></p>
        </div>
      </div>
      <div id="tqActions" class="timed-quiz-actions">
        <button class="tq-wrong" id="tqWrongBtn">✗ ${lang === 'ar' ? 'خاطئ' : 'Wrong'}</button>
        <button class="tq-correct" id="tqCorrectBtn">✓ ${lang === 'ar' ? 'صحيح' : 'Correct'}</button>
      </div>
      <div id="tqResult" class="timed-quiz-result hidden">
        <h3>${lang === 'ar' ? 'انتهى الاختبار!' : 'Quiz Complete!'}</h3>
        <div class="timed-quiz-score-big" id="tqScoreBig"></div>
        <p class="timed-quiz-score-sub" id="tqScoreSub"></p>
        <div class="hero-actions" style="margin-top:1.5rem;justify-content:center;flex-wrap:wrap;gap:0.75rem;">
          <button class="primary-btn" id="tqPlayAgain">${lang === 'ar' ? 'العب مجدداً' : 'Play Again'}</button>
          <button class="secondary-btn" id="tqClose">${lang === 'ar' ? 'إغلاق' : 'Close'}</button>
        </div>
      </div>
    </div>`;
  document.body.appendChild(el);
  const exitQuiz = () => { clearInterval(timedQuizState.timer); document.getElementById('timedQuizOverlay')?.classList.add('hidden'); };
  document.getElementById('tqCorrectBtn')?.addEventListener('click', () => answerTimedCard(true));
  document.getElementById('tqWrongBtn')?.addEventListener('click', () => answerTimedCard(false));
  document.getElementById('tqPlayAgain')?.addEventListener('click', startTimedQuiz);
  document.getElementById('tqExitBtn')?.addEventListener('click', exitQuiz);
  document.getElementById('tqClose')?.addEventListener('click', exitQuiz);
}

function startTimedQuiz() {
  if (!state.categoryData?.cards?.length) return;
  const pool = shuffleArray(state.categoryData.cards.filter(c => isLevelUnlocked(c.difficulty))).slice(0, 10);
  if (!pool.length) return;
  timedQuizState.cards = pool;
  timedQuizState.index = 0;
  timedQuizState.score = 0;
  trackEvent('timed_quiz_start', { category: state.categorySlug, total: pool.length });
  const overlay = document.getElementById('timedQuizOverlay');
  if (!overlay) return;
  overlay.classList.remove('hidden');
  document.getElementById('tqResult')?.classList.add('hidden');
  document.getElementById('tqActions')?.classList.remove('hidden');
  document.getElementById('tqQuestion')?.classList.remove('hidden');
  showTimedCard();
}

function showTimedCard() {
  const card = timedQuizState.cards[timedQuizState.index];
  if (!card) { endTimedQuiz(); return; }
  const lang = state.lang;
  const tqQ = document.getElementById('tqQuestion');
  const tqA = document.getElementById('tqAnswer');
  const tqPT = document.getElementById('tqProgressText');
  const tqCountdown = document.getElementById('tqCountdown');
  const tqFill = document.getElementById('tqTrackFill');
  const tqCorrect = document.getElementById('tqCorrectBtn');
  const tqWrong = document.getElementById('tqWrongBtn');
  if (tqQ) tqQ.textContent = card.question[lang];
  if (tqA) tqA.textContent = card.answer[lang];
  if (tqPT) tqPT.textContent = `${timedQuizState.index + 1} / ${timedQuizState.cards.length}`;
  if (tqCorrect) tqCorrect.disabled = false;
  if (tqWrong) tqWrong.disabled = false;
  clearInterval(timedQuizState.timer);
  timedQuizState.timeLeft = 15;
  if (tqCountdown) { tqCountdown.textContent = '15'; tqCountdown.classList.remove('urgent'); }
  if (tqFill) { tqFill.style.transition = 'none'; tqFill.style.width = '100%'; setTimeout(() => { if (tqFill) tqFill.style.transition = 'width 1s linear'; }, 50); }
  timedQuizState.timer = setInterval(() => {
    timedQuizState.timeLeft -= 1;
    if (tqCountdown) { tqCountdown.textContent = String(timedQuizState.timeLeft); if (timedQuizState.timeLeft <= 5) tqCountdown.classList.add('urgent'); }
    if (tqFill) tqFill.style.width = `${(timedQuizState.timeLeft / 15) * 100}%`;
    if (timedQuizState.timeLeft <= 0) { clearInterval(timedQuizState.timer); answerTimedCard(false); }
  }, 1000);
}

function revealAndAdvance() {
  const tqCorrect = document.getElementById('tqCorrectBtn');
  const tqWrong = document.getElementById('tqWrongBtn');
  if (tqCorrect) tqCorrect.disabled = true;
  if (tqWrong) tqWrong.disabled = true;
  setTimeout(() => {
    timedQuizState.index++;
    timedQuizState.index >= timedQuizState.cards.length ? endTimedQuiz() : showTimedCard();
  }, 600);
}

function answerTimedCard(correct) {
  clearInterval(timedQuizState.timer);
  const card = timedQuizState.cards[timedQuizState.index];
  if (!card) return;
  if (correct) { timedQuizState.score++; markCard(card.id, 'correct'); }
  else { markCard(card.id, 'wrong'); }
  revealAndAdvance();
}

function endTimedQuiz() {
  clearInterval(timedQuizState.timer);
  const score = timedQuizState.score;
  const total = timedQuizState.cards.length;
  const pct = Math.round((score / total) * 100);
  document.getElementById('tqActions')?.classList.add('hidden');
  document.getElementById('tqQuestion')?.classList.add('hidden');
  document.getElementById('tqAnswer')?.classList.add('hidden');
  document.getElementById('tqResult')?.classList.remove('hidden');
  const scoreBig = document.getElementById('tqScoreBig');
  const scoreSub = document.getElementById('tqScoreSub');
  if (scoreBig) scoreBig.textContent = `${score} / ${total}`;
  const lang = state.lang;
  if (scoreSub) scoreSub.textContent = pct >= 80 ? (lang === 'ar' ? '🏆 ممتاز!' : '🏆 Excellent!') : pct >= 60 ? (lang === 'ar' ? '👍 عمل جيد!' : '👍 Good job!') : (lang === 'ar' ? '💪 استمر في التدريب!' : '💪 Keep practicing!');
  trackEvent('timed_quiz_end', { category: state.categorySlug, score, total, pct });
  if (pct >= 80) saveJson('jakh-speed-demon', 1);
  const resultEl = document.getElementById('tqResult');
  const actionsEl = resultEl?.querySelector('.hero-actions');
  if (actionsEl && !actionsEl.querySelector('.tq-share-btn')) {
    const shareBtn = document.createElement('button');
    shareBtn.className = 'secondary-btn tq-share-btn';
    shareBtn.textContent = lang === 'ar' ? '🔗 شارك النتيجة' : '🔗 Share result';
    shareBtn.addEventListener('click', () => shareResult(score, total, state.categoryData?.title?.[lang] || 'JAKH Quick Fire'));
    actionsEl.insertBefore(shareBtn, actionsEl.lastElementChild);
  }
  // Solo → Team conversion CTA
  if (resultEl && !resultEl.querySelector('.tq-challenge-cta')) {
    const catTitle = state.categoryData?.title?.[lang] || 'JAKH';
    const challengeUrl = `${location.origin}/${state.categorySlug || ''}`;
    const ctaEl = document.createElement('div');
    ctaEl.className = 'tq-challenge-cta';
    ctaEl.innerHTML = `
      <p>💡 ${lang === 'ar' ? 'هل تريد تحدي شخص ما؟' : 'Want to challenge someone?'}</p>
      <div class="tq-challenge-cta-btns">
        <button class="mini-btn" id="tqChallengeFriendBtn">🏆 ${lang === 'ar' ? 'تحدٍ صديق' : 'Challenge a Friend'}</button>
        <button class="mini-btn" id="tqBattleBtn">⚡ ${lang === 'ar' ? 'معركة مباشرة' : 'Team Battle'}</button>
      </div>`;
    resultEl.appendChild(ctaEl);
    document.getElementById('tqChallengeFriendBtn')?.addEventListener('click', () => {
      const isAr = lang === 'ar';
      const text = isAr
        ? `🏆 حصلت على ${score}/${total} في "${catTitle}" على JAKH!\nهل تستطيع التفوق عليّ؟ ← ${challengeUrl}`
        : `🏆 I scored ${score}/${total} in "${catTitle}" on JAKH!\nCan you beat me? → ${challengeUrl}`;
      navigator.share?.({ title: 'JAKH Challenge', text, url: challengeUrl })
        .catch(() => navigator.clipboard?.writeText(text).then(() => showToast(isAr ? 'تم نسخ التحدي!' : 'Challenge copied!')));
    });
    document.getElementById('tqBattleBtn')?.addEventListener('click', () => {
      document.getElementById('timedQuizOverlay')?.classList.add('hidden');
      openBattleModal(state.categorySlug);
    });
  }
  checkNewAchievements();
}

// ================= LEADERBOARD =================
function createLeaderboardModal() {
  if (document.getElementById('leaderboardModal')) return;
  const el = document.createElement('div');
  el.id = 'leaderboardModal';
  el.className = 'modal hidden';
  el.setAttribute('aria-hidden', 'true');
  el.innerHTML = `
    <div class="modal-backdrop" data-close-modal="leaderboard"></div>
    <div class="modal-card" role="dialog" aria-modal="true">
      <div class="modal-head">
        <div>
          <p class="eyebrow">🏆 ${state.lang === 'ar' ? 'لوحة المتصدرين' : 'Leaderboard'}</p>
          <h2>${state.lang === 'ar' ? 'أفضل 20 لاعباً' : 'Top 20 Players'}</h2>
        </div>
        <button class="icon-btn" data-close-modal="leaderboard" aria-label="Close">×</button>
      </div>
      <div id="leaderboardBody" style="padding:0.25rem 0;min-height:120px;"></div>
    </div>`;
  document.body.appendChild(el);
}

// ================= GLOBAL SEARCH =================
const _gsCache = {};

function openGlobalSearch() {
  if (document.getElementById('globalSearchOverlay')) {
    document.getElementById('globalSearchOverlay').classList.remove('hidden');
    document.getElementById('globalSearchInput')?.focus();
    return;
  }
  const overlay = document.createElement('div');
  overlay.id = 'globalSearchOverlay';
  overlay.className = 'global-search-overlay';
  overlay.innerHTML = `
    <div class="global-search-backdrop"></div>
    <div class="global-search-panel" role="dialog" aria-modal="true" aria-label="${state.lang === 'ar' ? 'البحث الشامل' : 'Global search'}">
      <div class="global-search-head">
        <input id="globalSearchInput" class="global-search-input" type="search" autocomplete="off"
          placeholder="${state.lang === 'ar' ? 'ابحث في جميع الأسئلة...' : 'Search all 3,500+ questions…'}"
          aria-label="${state.lang === 'ar' ? 'ابحث في جميع الأسئلة' : 'Search all questions'}" />
        <button class="global-search-close icon-btn" id="globalSearchClose" aria-label="Close">×</button>
      </div>
      <div id="globalSearchResults" class="global-search-results">
        <p class="global-search-hint">${state.lang === 'ar' ? 'اكتب للبدء في البحث...' : 'Start typing to search across all categories…'}</p>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
  trapFocus(overlay);

  overlay.querySelector('.global-search-backdrop').addEventListener('click', closeGlobalSearch);
  document.getElementById('globalSearchClose').addEventListener('click', closeGlobalSearch);
  overlay.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeGlobalSearch(); });

  const input = document.getElementById('globalSearchInput');
  input?.focus();
  input?.addEventListener('input', debounce(runGlobalSearch, 280));
}

function closeGlobalSearch() {
  document.getElementById('globalSearchOverlay')?.classList.add('hidden');
}

async function runGlobalSearch() {
  const q = document.getElementById('globalSearchInput')?.value.trim().toLowerCase();
  const resultsEl = document.getElementById('globalSearchResults');
  if (!resultsEl) return;
  if (!q || q.length < 2) {
    resultsEl.innerHTML = `<p class="global-search-hint">${state.lang === 'ar' ? 'اكتب حرفين على الأقل...' : 'Type at least 2 characters…'}</p>`;
    return;
  }
  resultsEl.innerHTML = `<p class="global-search-hint">${state.lang === 'ar' ? 'جارٍ البحث...' : 'Searching…'}</p>`;

  const hits = [];
  const cats = state.catalog?.categories || [];
  for (const cat of cats) {
    if (hits.length >= 30) break;
    if (!_gsCache[cat.slug]) {
      try { _gsCache[cat.slug] = await fetchJson(`data/${cat.slug}.json`); } catch { continue; }
    }
    const raw = _gsCache[cat.slug];
    const cards = Array.isArray(raw) ? raw : (raw.cards || []);
    for (const card of cards) {
      if (hits.length >= 30) break;
      const hay = [card.question.en, card.question.ar, card.answer.en, card.answer.ar].join(' ').toLowerCase();
      if (hay.includes(q)) hits.push({ card, cat });
    }
  }

  if (!hits.length) {
    resultsEl.innerHTML = `<p class="global-search-hint">${state.lang === 'ar' ? 'لا نتائج.' : 'No results.'}</p>`;
    return;
  }
  resultsEl.innerHTML = hits.map(({ card, cat }) => `
    <a class="gs-result" href="${escapeHtml(cat.href)}?q=${encodeURIComponent(q)}">
      <span class="gs-result-cat">${cat.emoji} ${escapeHtml(cat.title[state.lang])}</span>
      <span class="gs-result-q">${escapeHtml(card.question[state.lang])}</span>
      <span class="gs-result-a">${escapeHtml(card.answer[state.lang])}</span>
    </a>
  `).join('');
  resultsEl.querySelectorAll('.gs-result').forEach(el => {
    el.addEventListener('click', (e) => { e.preventDefault(); closeGlobalSearch(); spaNavigate(el.href); });
  });
}

async function openLeaderboard() {
  const modal = document.getElementById('leaderboardModal');
  if (!modal) return;
  modal.classList.remove('hidden');
  modal.setAttribute('aria-hidden', 'false');
  const body = document.getElementById('leaderboardBody');
  if (body) body.innerHTML = '<p style="padding:2rem;text-align:center;color:var(--muted)">Loading…</p>';
  try {
    const { leaderboard } = await apiFetch('/leaderboard');
    const currentUser = state.dbUser?.username;
    const medals = ['🥇', '🥈', '🥉'];
    if (!leaderboard?.length) {
      if (body) body.innerHTML = '<p style="padding:2rem;text-align:center;color:var(--muted)">No scores yet — be the first!</p>';
      return;
    }
    if (body) body.innerHTML = leaderboard.map(row => `
      <div class="leaderboard-row">
        <span class="leaderboard-rank ${row.rank <= 3 ? 'top-3' : ''}">${medals[row.rank - 1] || row.rank}</span>
        <span class="leaderboard-username ${row.username === currentUser ? 'leaderboard-you' : ''}">
          <span style="margin-right:6px;font-size:1.1rem;">${row.avatar || '👤'}</span>${escapeHtml(row.username)}${row.username === currentUser ? ' ✦' : ''}
        </span>
        <span class="leaderboard-score">${row.score} pts</span>
      </div>`).join('');
  } catch (e) {
    if (body) body.innerHTML = '<p style="padding:2rem;text-align:center;color:var(--danger)">Failed to load.</p>';
  }
}

// ================= RANDOM CATEGORY =================
function randomCategory() {
  if (!state.catalog) return;
  const cats = state.catalog.categories;
  spaNavigate(cats[Math.floor(Math.random() * cats.length)].href);
}

// ================= ACHIEVEMENTS =================
function getCategoryMasterCount() {
  if (!state.catalog || !state.dbUser) return 0;
  return (state.catalog.categories || []).filter(cat => {
    const meta = state.catalog.categories.find(c => c.slug === cat.slug);
    const solved = (state.dbUser.progress || []).filter(p => p.categoryId === cat.slug && !p.status.startsWith('wrong-')).length;
    return solved >= (meta?.count || 1);
  }).length;
}

function computeAchievements() {
  return ACHIEVEMENTS.filter(a => { try { return a.check(); } catch { return false; } });
}

function checkNewAchievements() {
  if (!state.dbUser) return;
  const key = `jakh-ach-${state.dbUser.id}`;
  const stored = new Set(loadJson(key, []));
  const earned = computeAchievements();
  const newOnes = earned.filter(a => !stored.has(a.id));
  if (!newOnes.length) return;
  newOnes.forEach(a => stored.add(a.id));
  saveJson(key, [...stored]);
  newOnes.forEach((a, i) => setTimeout(() => {
    hapticSuccess();
    showToast(`${a.icon} ${state.lang === 'ar' ? 'إنجاز جديد: ' : 'Achievement unlocked: '}${state.lang === 'ar' ? a.ar : a.en}!`);
  }, i * 2400));
}

// ================= CATEGORY COMPLETION =================
function isCategoryComplete(slug) {
  if (!state.dbUser || !state.catalog) return false;
  const meta = state.catalog.categories.find(c => c.slug === slug);
  if (!meta) return false;
  const solved = (state.dbUser.progress || []).filter(p => p.categoryId === slug && !p.status.startsWith('wrong-')).length;
  return solved >= meta.count;
}

function checkCategoryComplete(slug) {
  if (!slug || completedCategoriesShown.has(slug)) return;
  if (!isCategoryComplete(slug)) return;
  completedCategoriesShown.add(slug);
  trackEvent('category_complete', { slug });
  setTimeout(() => showCategoryCompleteModal(slug), 500);
}

function showCategoryCompleteModal(slug) {
  const meta = state.catalog?.categories.find(c => c.slug === slug);
  if (!meta) return;
  const lang = state.lang;
  const solved = (state.dbUser?.progress || []).filter(p => p.categoryId === slug && !p.status.startsWith('wrong-')).length;
  const wrong = (state.dbUser?.progress || []).filter(p => p.categoryId === slug && p.status.startsWith('wrong-')).length;
  const points = (state.dbUser?.progress || []).filter(p => p.categoryId === slug && !p.status.startsWith('wrong-')).reduce((sum, p) => sum + (DIFFICULTY_POINTS[p.status] || 0), 0);
  const related = state.catalog.categories.find(c => c.slug !== slug && c.cluster_key === meta.cluster_key) || state.catalog.categories.find(c => c.slug !== slug);
  let el = document.getElementById('categoryCompleteModal');
  if (!el) {
    el = document.createElement('div');
    el.id = 'categoryCompleteModal';
    el.className = 'modal hidden';
    el.setAttribute('aria-hidden', 'true');
    document.body.appendChild(el);
  }
  el.innerHTML = `
    <div class="modal-backdrop" id="catCompleteBackdrop"></div>
    <div class="modal-card category-complete-card" role="dialog" aria-modal="true">
      <div class="category-complete-top" style="background:${CATEGORY_GRADIENTS[slug] || 'linear-gradient(135deg,#1E3A5F,#4A90D9)'}">
        <span class="category-complete-emoji">${meta.emoji}</span>
      </div>
      <div class="category-complete-body">
        <h2 style="margin:0 0 0.25rem;">${lang === 'ar' ? '🎉 أكملت الفئة!' : '🎉 Category Complete!'}</h2>
        <p style="margin:0 0 1rem;color:var(--muted);font-size:0.9rem;">${escapeHtml(meta.title[lang])}</p>
        <div class="stats-grid" style="margin-bottom:1.2rem;">
          <div class="stat-box"><span>${lang === 'ar' ? 'صحيح' : 'Correct'}</span><strong style="color:var(--easy)">${solved}</strong></div>
          <div class="stat-box"><span>${lang === 'ar' ? 'خاطئ' : 'Wrong'}</span><strong style="color:var(--danger)">${wrong}</strong></div>
          <div class="stat-box"><span>${lang === 'ar' ? 'النقاط' : 'Points'}</span><strong>${points}</strong></div>
        </div>
        <div class="hero-actions" style="justify-content:center;flex-wrap:wrap;gap:0.75rem;">
          <button class="secondary-btn" id="catCompleteShare">🔗 ${lang === 'ar' ? 'شارك النتيجة' : 'Share result'}</button>
          <button class="ghost-btn" id="catCompleteBattle">⚡ ${lang === 'ar' ? 'تحدٍ مباشر' : 'Team Battle'}</button>
          ${related ? `<a class="primary-btn" href="${escapeHtml(related.href)}" style="text-decoration:none;">${lang === 'ar' ? 'الفئة التالية ←' : 'Next category →'}</a>` : ''}
          <button class="ghost-btn" id="catCompleteClose">${lang === 'ar' ? 'إغلاق' : 'Close'}</button>
        </div>
        <div class="tq-challenge-cta" style="margin-top:1rem;">
          <p>💡 ${lang === 'ar' ? 'تحدّ أصدقاءك في هذه الفئة' : 'Challenge your friends in this category'}</p>
          <div class="tq-challenge-cta-btns">
            <button class="mini-btn" id="catCompleteChallengeBtn">🏆 ${lang === 'ar' ? 'تحدٍ صديق' : 'Challenge a Friend'}</button>
          </div>
        </div>
      </div>
    </div>`;
  el.classList.remove('hidden');
  el.setAttribute('aria-hidden', 'false');
  document.getElementById('catCompleteBackdrop')?.addEventListener('click', () => el.classList.add('hidden'));
  document.getElementById('catCompleteClose')?.addEventListener('click', () => el.classList.add('hidden'));
  document.getElementById('catCompleteShare')?.addEventListener('click', () => shareResult(solved, meta.count, meta.title[lang]));
  document.getElementById('catCompleteBattle')?.addEventListener('click', () => {
    el.classList.add('hidden');
    openBattleModal(slug);
  });
  document.getElementById('catCompleteChallengeBtn')?.addEventListener('click', () => {
    const isAr = lang === 'ar';
    const url = `${location.origin}/${slug}`;
    const text = isAr
      ? `🏆 أنهيت "${meta.title.ar}" على JAKH بـ ${points} نقطة!\nهل تستطيع التفوق عليّ؟ ← ${url}`
      : `🏆 I finished "${meta.title.en}" on JAKH with ${points} pts!\nCan you beat me? → ${url}`;
    navigator.share?.({ title: 'JAKH Challenge', text, url })
      .catch(() => navigator.clipboard?.writeText(text).then(() => showToast(isAr ? 'تم نسخ التحدي!' : 'Challenge copied!')));
  });
  checkNewAchievements();
}

// ================= SHARE =================
function shareCard(cardId) {
  const card = state.categoryData?.cards.find(c => c.id === cardId);
  if (!card) return;
  const question = card.question[state.lang];
  const catTitle = state.categoryData?.title?.[state.lang] || 'JAKH';
  const url = `${location.origin}${location.pathname}?card=${encodeURIComponent(cardId)}`;
  const isAr = state.lang === 'ar';
  const bar = '─────────────────';
  const text = isAr
    ? `🧠 لغز من JAKH — ${catTitle}\n${bar}\n${question}\n${bar}\nهل تستطيع الإجابة؟ ← jakh.net`
    : `🧠 JAKH Riddle — ${catTitle}\n${bar}\n${question}\n${bar}\nCan you solve this? → jakh.net`;
  saveJson('jakh-shared', 1);
  if (navigator.share) {
    navigator.share({ title: 'JAKH Riddles', text, url }).catch(() => {});
  } else {
    navigator.clipboard?.writeText(`${text}\n${url}`).then(() => {
      showToast(isAr ? 'تم نسخ السؤال!' : 'Question copied!');
    }).catch(() => {
      showToast(isAr ? 'تعذر النسخ' : 'Copy failed');
    });
  }
  checkNewAchievements();
}

// ================= REPORT =================
async function reportCard(cardId, categoryId, questionText) {
  const text = `[REPORT] ${categoryId}/${cardId}: ${questionText.substring(0, 150)}`;
  try {
    await apiFetch('/suggestions', {
      method: 'POST',
      body: JSON.stringify({ text }),
    });
    showToast(t('reportThanks'));
  } catch { showToast(t('reportError')); }
}

// ================= SHARE =================
function shareResult(score, total, categoryTitle) {
  const isAr = state.lang === 'ar';
  const bar = '─────────────────';
  const pct = total > 0 ? Math.round((score / total) * 100) : 0;
  const medal = pct >= 90 ? '🥇' : pct >= 70 ? '🥈' : pct >= 50 ? '🥉' : '🎯';
  const url = `https://jakh.net`;
  const text = isAr
    ? `${medal} أنهيت "${categoryTitle}" على JAKH!\n${bar}\n✓ ${score} صحيح من ${total}\n${bar}\nهل تستطيع التفوق عليّ؟ ← jakh.net`
    : `${medal} I finished "${categoryTitle}" on JAKH!\n${bar}\n✓ ${score} / ${total} correct (${pct}%)\n${bar}\nCan you beat my score? → jakh.net`;
  if (navigator.share) {
    navigator.share({ title: 'JAKH Riddles', text, url }).catch(() => {});
  } else {
    navigator.clipboard?.writeText(text).then(() => showToast(t('shareCopied'))).catch(() => showToast(t('shareCopied')));
  }
}

// ================= ONBOARDING =================
function checkOnboarding() {
  if (state.page === 'home') {
    if (!localStorage.getItem('jakh-onboarded')) setTimeout(showOnboarding, 1200);
  } else if (state.page === 'category') {
    if (!localStorage.getItem('jakh-card-tutorial-seen')) setTimeout(showCardTutorial, 1800);
  }
}

function showOnboarding() {
  if (document.getElementById('onboardModal')) return;
  const steps = [
    { icon: '🗂️',
      en: { title: 'Pick a Category', text: `Choose from ${state.catalog?.categories.length || 56} curated quiz categories — math, science, history, football, and more.` },
      ar: { title: 'اختر فئة', text: `اختر من ${state.catalog?.categories.length || 56} فئة منسقة — رياضيات وعلوم وتاريخ وكرة قدم والمزيد.` } },
    { icon: '💾',
      en: { title: 'Save Your Progress', text: state.apiAvailable ? 'Create a free account to track your score, build streaks, and unlock harder levels.' : 'Your score, favorites, and unlocked levels are saved automatically on this device.' },
      ar: { title: 'احفظ تقدمك', text: state.apiAvailable ? 'أنشئ حسابًا مجانيًا لتتبع نقاطك وبناء سلاسل يومية وفتح المستويات الأصعب.' : 'تُحفظ نقاطك ومفضلاتك ومستوياتك المفتوحة تلقائيًا على هذا الجهاز.' } },
    { icon: '🏆',
      en: { title: 'Challenge Yourself', text: state.apiAvailable ? 'Try the Daily Challenge, race the clock in Quick Fire, and climb the global Leaderboard.' : 'Try the Daily Challenge, race the clock in Quick Fire, and unlock harder question levels.' },
      ar: { title: 'تحدَّ نفسك', text: state.apiAvailable ? 'جرّب تحدي اليوم وتسابق مع الوقت في الاختبار السريع وتسلق لوحة المتصدرين.' : 'جرّب تحدي اليوم وتسابق مع الوقت وافتح مستويات الأسئلة الأصعب.' } },
  ];
  let step = 0;
  const lang = state.lang;
  const el = document.createElement('div');
  el.id = 'onboardModal';
  el.className = 'onboard-overlay';
  document.body.appendChild(el);
  el.addEventListener('click', (e) => { if (!e.target.closest('.onboard-card')) dismiss(); });

  function render() {
    const s = steps[step];
    const isLast = step === steps.length - 1;
    el.innerHTML = `
      <div class="onboard-card">
        <button class="onboard-skip" id="onboardSkipBtn">${lang === 'ar' ? 'تخطي' : 'Skip'}</button>
        <div class="onboard-icon">${s.icon}</div>
        <h3 class="onboard-title">${escapeHtml(s[lang]?.title || s.en.title)}</h3>
        <p class="onboard-text">${escapeHtml(s[lang]?.text || s.en.text)}</p>
        <div class="onboard-dots">${steps.map((_, i) => `<span class="onboard-dot${i === step ? ' active' : ''}"></span>`).join('')}</div>
        <button class="primary-btn onboard-next" id="onboardNextBtn">
          ${isLast ? (lang === 'ar' ? '🚀 ابدأ الاستكشاف!' : '🚀 Start exploring!') : (lang === 'ar' ? 'التالي →' : 'Next →')}
        </button>
      </div>`;
    document.getElementById('onboardNextBtn')?.addEventListener('click', () => {
      if (step < steps.length - 1) { step++; render(); } else { dismiss(); }
    });
    document.getElementById('onboardSkipBtn')?.addEventListener('click', dismiss);
  }

  function dismiss() { localStorage.setItem('jakh-onboarded', '1'); el.remove(); }
  render();
}

function showCardTutorial() {
  if (document.getElementById('cardTutorial')) return;
  const isAr = state.lang === 'ar';
  const steps = [
    {
      icon: '👆',
      title: isAr ? 'اضغط لترى الإجابة' : 'Tap to flip',
      text: isAr
        ? 'اضغط في أي مكان على البطاقة لتظهر الإجابة. اضغط مجددًا للعودة إلى السؤال.'
        : 'Tap anywhere on a card to flip it and reveal the answer. Tap again to go back.',
    },
    {
      icon: '↔️',
      title: isAr ? 'مرّر لتقييم إجابتك' : 'Swipe to score',
      text: isAr
        ? 'بعد رؤية الإجابة: مرّر يسارًا ✗ إذا كانت إجابتك خاطئة، ومرّر يمينًا ✓ إذا كانت صحيحة.'
        : 'After flipping: swipe right ✓ if you were correct, swipe left ✗ if you were wrong.',
    },
    {
      icon: '♥ ✓ ✗',
      title: isAr ? 'أزرار الإجابة' : 'Answer buttons',
      text: isAr
        ? '♥ لإضافة للمفضلة · ✓ صحيح · ✗ خاطئ · 🔊 استمع للسؤال · ↩ إزالة التقييم'
        : '♥ favorite · ✓ correct · ✗ wrong · 🔊 listen · ↩ undo — all on the card back.',
    },
  ];
  let step = 0;
  const el = document.createElement('div');
  el.id = 'cardTutorial';
  el.className = 'onboard-overlay';
  document.body.appendChild(el);
  el.addEventListener('click', e => { if (!e.target.closest('.onboard-card')) dismiss(); });

  function render() {
    const s = steps[step];
    const isLast = step === steps.length - 1;
    el.innerHTML = `
      <div class="onboard-card card-tutorial-card">
        <button class="onboard-skip" id="ctSkip">${isAr ? 'تخطي' : 'Skip'}</button>
        <div class="onboard-icon">${s.icon}</div>
        <h3 class="onboard-title">${escapeHtml(s.title)}</h3>
        <p class="onboard-text">${escapeHtml(s.text)}</p>
        <div class="onboard-dots">${steps.map((_,i) => `<span class="onboard-dot${i===step?' active':''}"></span>`).join('')}</div>
        <button class="primary-btn onboard-next" id="ctNext">
          ${isLast ? (isAr ? '✓ فهمت!' : '✓ Got it!') : (isAr ? 'التالي →' : 'Next →')}
        </button>
      </div>`;
    document.getElementById('ctNext')?.addEventListener('click', () => {
      if (step < steps.length - 1) { step++; render(); } else { dismiss(); }
    });
    document.getElementById('ctSkip')?.addEventListener('click', dismiss);
  }

  function dismiss() { localStorage.setItem('jakh-card-tutorial-seen', '1'); el.remove(); }
  render();
}

let sessionInitialized = false;

// ── Step 5: Haptic Feedback ───────────────────────────────────────────────────
// Requires @capacitor/haptics + npx cap sync for native iOS/Android haptics.
// Falls back to navigator.vibrate on Android WebView (silent on iOS without plugin).
const Haptics = window.Capacitor?.Plugins?.Haptics;
const ImpactStyle = { Light: 'LIGHT', Medium: 'MEDIUM', Heavy: 'HEAVY' };

function haptic(type = 'light') {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  try {
    if (Haptics?.impact) {
      const style = type === 'heavy' ? ImpactStyle.Heavy
                  : type === 'medium' ? ImpactStyle.Medium
                  : ImpactStyle.Light;
      Haptics.impact({ style });
    } else if (navigator.vibrate) {
      const ms = type === 'heavy' ? 40 : type === 'medium' ? 20 : 10;
      navigator.vibrate(ms);
    }
  } catch {}
}

function hapticSuccess() { haptic('medium'); }
function hapticError()   { haptic('heavy'); }
function hapticTap()     { haptic('light'); }

// ── Step 4: Page Transition Exit Animation ────────────────────────────────────
(function () {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  document.addEventListener('click', (e) => {
    const link = e.target.closest('a[href]');
    if (!link) return;
    const href = link.getAttribute('href');
    if (!href || href.startsWith('#') || href.startsWith('javascript') ||
        href.startsWith('mailto') || href.startsWith('tel') ||
        link.target === '_blank' || e.ctrlKey || e.metaKey || e.shiftKey) return;
    // Only animate same-origin .html navigation
    try {
      const url = new URL(href, location.href);
      if (url.origin !== location.origin) return;
    } catch { return; }
    e.preventDefault();
    document.body.classList.add('is-navigating');
    setTimeout(() => { location.href = href; }, 220);
  });
}());

// ── Bottom Navigation Bar ─────────────────────────────────────────────────────
function injectBottomNav() {
  if (document.getElementById('bottomNav')) { updateBottomNavActive(); return; }
  const isAr = state.lang === 'ar';
  const nav = document.createElement('nav');
  nav.id = 'bottomNav';
  nav.className = 'bottom-nav';
  nav.setAttribute('aria-label', isAr ? 'التنقل الرئيسي' : 'Main navigation');
  nav.innerHTML = `
    <div class="bottom-nav-inner">
      <a href="index.html" class="bottom-nav-tab" data-tab="home" aria-label="${isAr ? 'الرئيسية' : 'Home'}">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 9.5L12 3l9 6.5V20a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V9.5z"/><polyline points="9 21 9 12 15 12 15 21"/></svg>
        <span>${isAr ? 'الرئيسية' : 'Home'}</span>
      </a>
      <a href="mind-lab.html" class="bottom-nav-tab" data-tab="explore" aria-label="${isAr ? 'استكشف' : 'Explore'}">
        <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></svg>
        <span>${isAr ? 'استكشف' : 'Explore'}</span>
      </a>
      <button class="bottom-nav-tab" id="bnDailyBtn" data-tab="daily" aria-label="${isAr ? 'التحدي اليومي' : 'Daily'}">
        <svg viewBox="0 0 24 24" aria-hidden="true"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
        <span>${isAr ? 'يومي' : 'Daily'}</span>
      </button>
      <button class="bottom-nav-tab" id="bnProfileBtn" data-tab="profile" aria-label="${isAr ? 'حسابي' : 'Profile'}">
        <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.582-7 8-7s8 3 8 7"/></svg>
        <span>${isAr ? 'حسابي' : 'Profile'}</span>
      </button>
    </div>
    <div class="bottom-nav-safe" aria-hidden="true"></div>`;
  document.body.appendChild(nav);

  document.getElementById('bnDailyBtn')?.addEventListener('click', () => {
    if (state.page === 'home') {
      const target = document.querySelector('.daily-challenge-section') || document.getElementById('dailyChallengeMount');
      target?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } else {
      sessionStorage.setItem('jakh-scroll-to', 'daily');
      location.href = 'index.html';
    }
  });
  document.getElementById('bnProfileBtn')?.addEventListener('click', () => {
    document.getElementById('openAuthBtn')?.click();
  });

  updateBottomNavActive();
}

function updateBottomNavActive() {
  const nav = document.getElementById('bottomNav');
  if (!nav) return;
  const activeTab = state.page === 'home' ? 'home' : 'explore';
  nav.querySelectorAll('.bottom-nav-tab').forEach(tab => {
    tab.classList.toggle('is-active', tab.dataset.tab === activeTab);
  });
  const isAr = state.lang === 'ar';
  const labels = {
    home:    isAr ? 'الرئيسية' : 'Home',
    explore: isAr ? 'استكشف'  : 'Explore',
    daily:   isAr ? 'يومي'    : 'Daily',
    profile: isAr ? 'حسابي'   : 'Profile',
  };
  nav.querySelectorAll('.bottom-nav-tab').forEach(tab => {
    const span = tab.querySelector('span');
    if (span && labels[tab.dataset.tab]) span.textContent = labels[tab.dataset.tab];
  });
  const ariaLabels = {
    home:    isAr ? 'الرئيسية' : 'Home',
    explore: isAr ? 'استكشف'  : 'Explore',
    daily:   isAr ? 'التحدي اليومي' : 'Daily',
    profile: isAr ? 'حسابي'   : 'Profile',
  };
  nav.querySelectorAll('.bottom-nav-tab').forEach(tab => {
    if (ariaLabels[tab.dataset.tab]) tab.setAttribute('aria-label', ariaLabels[tab.dataset.tab]);
  });
}

async function init() {
  cacheEls();
  [els.openAuthBtn, els.heroAuthBtn].filter(Boolean).forEach(element => {
    element.hidden = true;
  });
  initializeFromStorage();
  applyDir();
  if (!sessionInitialized) {
    state.apiAvailable = await detectApiAvailability();
    if (state.apiAvailable) {
      await checkCloudSession();
      if (state.dbUser) {
        await flushCloudQueue();
        await mergeGuestProgress();
        await checkCloudSession();
        await loadStreak();
      }
    }
    sessionInitialized = true;
  }
  applyTheme();
  bindCommonEvents();
  applyCapabilityVisibility();
  if (state.apiAvailable) startAnalyticsHeartbeat();
  createTimedQuizModal();
  if (state.apiAvailable) {
    createLeaderboardModal();
    createBattleModal();
    initSuggestionBox();
  }
  renderCategoryPlayModes();
  await loadCatalog();
  await loadDailyChallenge();
  await loadCategoryIfNeeded();
  applyStaticCopy();
  rerender();
  injectBottomNav();
  applyCapabilityVisibility();
  checkOnboarding();
  checkNewAchievements();
  // Handle daily-tab scroll triggered from category pages
  if (state.page === 'home' && sessionStorage.getItem('jakh-scroll-to') === 'daily') {
    sessionStorage.removeItem('jakh-scroll-to');
    requestAnimationFrame(() => {
      const target = document.querySelector('.daily-challenge-section') || document.getElementById('dailyChallengeMount');
      target?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }
}

// ================= CATEGORY PLAY MODES =========

function renderCategoryPlayModes() {
  if (state.page !== 'category') return;
  document.getElementById('categoryPlayModes')?.remove();
  const isAr = state.lang === 'ar';
  const el = document.createElement('div');
  el.id = 'categoryPlayModes';
  el.className = 'shell section-block category-play-modes';
  el.innerHTML = `
    <div class="play-modes-grid">
      <div class="play-mode-card play-mode-solo">
        <div class="play-mode-head">
          <span class="play-mode-icon">⚡</span>
          <div>
            <strong class="play-mode-title">${isAr ? 'السباق السريع' : 'Quick Fire'}</strong>
            <p class="play-mode-sub">${isAr ? 'تحدٍ فردي مع توقيت — 10 أسئلة' : 'Solo timed challenge — 10 questions'}</p>
          </div>
        </div>
        <button class="primary-btn play-mode-btn" id="playModeQuickFireBtn">
          🎯 ${isAr ? 'ابدأ منفردًا' : 'Start Solo'}
        </button>
      </div>
      ${state.apiAvailable ? `<div class="play-mode-card play-mode-team">
        <div class="play-mode-head">
          <span class="play-mode-icon">🏆</span>
          <div>
            <strong class="play-mode-title">${isAr ? 'معركة الفريق' : 'Team Battle'}</strong>
            <p class="play-mode-sub">${isAr ? 'العب مع الآخرين في الوقت الفعلي' : 'Play with others live — up to 20'}</p>
          </div>
        </div>
        <div class="play-mode-battle-btns">
          <button class="primary-btn play-mode-btn" id="playModeCreateRoomBtn">
            🎮 ${isAr ? 'إنشاء غرفة' : 'Create Room'}
          </button>
          <button class="ghost-btn play-mode-btn" id="playModeJoinBtn">
            🔗 ${isAr ? 'الانضمام بكود' : 'Join with Code'}
          </button>
        </div>
      </div>` : ''}
    </div>`;

  const questionSection = document.getElementById('questionSection');
  if (questionSection) {
    questionSection.parentNode.insertBefore(el, questionSection);
  }
  document.getElementById('playModeQuickFireBtn')?.addEventListener('click', startTimedQuiz);
  document.getElementById('playModeCreateRoomBtn')?.addEventListener('click', () => {
    battleState.tab = 'create'; openBattleModal(state.categorySlug);
  });
  document.getElementById('playModeJoinBtn')?.addEventListener('click', () => {
    battleState.tab = 'join'; openBattleModal(state.categorySlug);
  });
}

// ================= BATTLE MODE =================

const battleState = {
  ws: null,
  playerId: null,
  isHost: false,
  hostId: null,
  roomCode: null,
  phase: 'closed',      // closed | setup | lobby | question | reveal | finished
  tab: 'create',        // create | join
  roomData: null,
  currentQuestion: null,
  selectedAnswer: null,
  answerStartTime: null,
  answeredCount: 0,
  totalPlayers: 0,
  revealData: null,
  timerInterval: null,
  timeLeft: 15,
  pendingSlug: '',
};

function getBattleWsUrl(code) {
  const api = new URL(API_ORIGIN);
  const proto = api.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${proto}//${api.host}/ws/battle?code=${encodeURIComponent(code)}`;
}

function createBattleModal() {
  if (document.getElementById('battleOverlay')) return;
  const el = document.createElement('div');
  el.id = 'battleOverlay';
  el.className = 'battle-overlay hidden';
  document.body.appendChild(el);
}

function openBattleModal(slug) {
  if (!document.getElementById('battleOverlay')) createBattleModal();
  battleState.pendingSlug = slug || state.categorySlug || '';
  battleState.phase = 'setup';
  battleState.tab = 'create';
  document.getElementById('battleOverlay')?.classList.remove('hidden');
  renderBattleUI();
}

function closeBattleModal() {
  clearInterval(battleState.timerInterval);
  if (battleState.ws) {
    battleState.ws.onclose = null;
    battleState.ws.close();
    battleState.ws = null;
  }
  document.getElementById('battleOverlay')?.classList.add('hidden');
  battleState.phase = 'closed';
}

function renderBattleUI() {
  const overlay = document.getElementById('battleOverlay');
  if (!overlay) return;
  const isAr = state.lang === 'ar';
  const titles = {
    setup: isAr ? '⚡ معركة الفريق' : '⚡ Team Battle',
    lobby: isAr ? '⚡ غرفة الانتظار' : '⚡ Battle Lobby',
    question: isAr ? '⚡ المعركة جارية' : '⚡ Battle in Progress',
    reveal: isAr ? '⚡ الإجابة' : '⚡ Answer Reveal',
    finished: isAr ? '🏆 انتهت المعركة' : '🏆 Battle Complete',
  };
  overlay.innerHTML = `
    <div class="battle-header">
      <span class="battle-header-title">${titles[battleState.phase] || '⚡ Team Battle'}</span>
      <button class="battle-exit-btn" id="battleExitBtn" aria-label="Close">✕</button>
    </div>
    <div id="battleBody" class="battle-body"></div>`;
  document.getElementById('battleExitBtn')?.addEventListener('click', closeBattleModal);
  const body = document.getElementById('battleBody');
  if (!body) return;
  if (battleState.phase === 'setup') renderBattleSetup(body);
  else if (battleState.phase === 'lobby') renderBattleLobby(body);
  else if (battleState.phase === 'question') renderBattleQuestion(body);
  else if (battleState.phase === 'reveal') renderBattleReveal(body);
  else if (battleState.phase === 'finished') renderBattlePodium(body);
}

function renderBattleSetup(body) {
  const lang = state.lang;
  const isAr = lang === 'ar';
  const slug = battleState.pendingSlug;
  const catOptions = (state.catalog?.categories || [])
    .map(c => `<option value="${escapeHtml(c.slug)}"${c.slug === slug ? ' selected' : ''}>${escapeHtml(c.title[lang])}</option>`)
    .join('');

  body.innerHTML = `
    <div class="battle-setup">
      <div class="battle-setup-tabs">
        <button class="battle-tab${battleState.tab === 'create' ? ' active' : ''}" id="battleTabCreate">
          + ${isAr ? 'إنشاء غرفة' : 'Create Room'}
        </button>
        <button class="battle-tab${battleState.tab === 'join' ? ' active' : ''}" id="battleTabJoin">
          ← ${isAr ? 'الانضمام' : 'Join Room'}
        </button>
      </div>
      <div class="battle-form">
        <label>
          ${isAr ? 'اسمك' : 'Your name'}
          <input type="text" id="battleNameInput" maxlength="20"
            placeholder="${isAr ? 'أدخل اسمك' : 'Enter your name'}"
            value="${escapeHtml(state.dbUser?.username || '')}" autocomplete="nickname" />
        </label>
        ${battleState.tab === 'create' ? `
          <label>
            ${isAr ? 'الفئة' : 'Category'}
            <select id="battleCatSelect">${catOptions}</select>
          </label>
          <label>
            ${isAr ? 'المستوى' : 'Difficulty'}
            <select id="battleDiffSelect">
              <option value="all">${isAr ? 'جميع المستويات' : 'All levels'}</option>
              <option value="easy">${isAr ? 'سهل' : 'Easy'}</option>
              <option value="medium">${isAr ? 'متوسط' : 'Medium'}</option>
              <option value="hard">${isAr ? 'صعب' : 'Hard'}</option>
              <option value="very-advanced">${isAr ? 'صعب جداً' : 'Very difficult'}</option>
            </select>
          </label>
          <label>
            ${isAr ? 'عدد الأسئلة' : 'Questions'}
            <select id="battleCountSelect">
              <option value="10">10</option>
              <option value="20">20</option>
              <option value="30">30</option>
            </select>
          </label>
          <button class="primary-btn" id="battleCreateBtn">⚡ ${isAr ? 'إنشاء الغرفة' : 'Create Battle Room'}</button>
        ` : `
          <label>
            ${isAr ? 'كود الغرفة' : 'Room code'}
            <input type="text" id="battleCodeInput" maxlength="10"
              placeholder="${isAr ? 'مثال: BIO-7X2K' : 'e.g. BIO-7X2K'}"
              style="text-transform:uppercase;font-family:var(--font-mono);letter-spacing:0.08em;"
              autocomplete="off" />
          </label>
          <button class="primary-btn" id="battleJoinBtn">⚡ ${isAr ? 'انضمام' : 'Join Room'}</button>
        `}
        <p class="battle-error hidden" id="battleSetupError"></p>
      </div>
    </div>`;

  document.getElementById('battleTabCreate')?.addEventListener('click', () => { battleState.tab = 'create'; renderBattleUI(); });
  document.getElementById('battleTabJoin')?.addEventListener('click', () => { battleState.tab = 'join'; renderBattleUI(); });
  document.getElementById('battleCreateBtn')?.addEventListener('click', handleBattleCreate);
  document.getElementById('battleJoinBtn')?.addEventListener('click', handleBattleJoin);
}

async function handleBattleCreate() {
  const name = document.getElementById('battleNameInput')?.value.trim() || '';
  const category = document.getElementById('battleCatSelect')?.value || '';
  const difficulty = document.getElementById('battleDiffSelect')?.value || 'all';
  const count = parseInt(document.getElementById('battleCountSelect')?.value || '10', 10);
  const isAr = state.lang === 'ar';
  if (!name) { showBattleError(isAr ? 'أدخل اسمك' : 'Enter your name'); return; }
  if (!category) { showBattleError(isAr ? 'اختر فئة' : 'Choose a category'); return; }
  const btn = document.getElementById('battleCreateBtn');
  if (btn) { btn.disabled = true; btn.textContent = isAr ? 'جارٍ الإنشاء...' : 'Creating...'; }
  try {
    const data = await apiFetch('/battle/create', {
      method: 'POST',
      body: JSON.stringify({ category, difficulty, questionCount: count }),
    });
    battleState.hostId = data.hostId;
    battleState.isHost = true;
    connectToBattle(data.code, name, data.hostId);
  } catch (err) {
    showBattleError(err.message || (isAr ? 'تعذر الإنشاء' : 'Could not create room'));
    if (btn) { btn.disabled = false; btn.textContent = `⚡ ${isAr ? 'إنشاء الغرفة' : 'Create Battle Room'}`; }
  }
}

function handleBattleJoin() {
  const name = document.getElementById('battleNameInput')?.value.trim() || '';
  const code = (document.getElementById('battleCodeInput')?.value || '').trim().toUpperCase().replace(/[^A-Z0-9-]/g, '');
  const isAr = state.lang === 'ar';
  if (!name) { showBattleError(isAr ? 'أدخل اسمك' : 'Enter your name'); return; }
  if (code.length < 4) { showBattleError(isAr ? 'أدخل كود الغرفة' : 'Enter the room code'); return; }
  connectToBattle(code, name, null);
}

function showBattleError(msg) {
  const el = document.getElementById('battleSetupError');
  if (el) { el.textContent = msg; el.classList.remove('hidden'); }
}

function connectToBattle(code, name, hostId) {
  if (battleState.ws) { battleState.ws.onclose = null; battleState.ws.close(); }
  const ws = new WebSocket(getBattleWsUrl(code));
  battleState.ws = ws;
  battleState.roomCode = code;
  ws.onopen = () => ws.send(JSON.stringify({ type: 'join-room', code, name, hostId: hostId || '' }));
  ws.onmessage = (e) => { try { handleBattleMessage(JSON.parse(e.data)); } catch (_) {} };
  ws.onerror = () => showBattleError(state.lang === 'ar' ? 'تعذر الاتصال بالغرفة' : 'Connection failed');
  ws.onclose = () => {
    if (battleState.phase !== 'closed' && battleState.phase !== 'finished') {
      showToast(state.lang === 'ar' ? 'انقطع الاتصال بالغرفة' : 'Disconnected from battle room');
    }
  };
}

function handleBattleMessage(msg) {
  if (msg.type === 'error') { showBattleError(msg.message); return; }
  if (msg.type === 'joined') {
    battleState.playerId = msg.playerId;
    battleState.isHost = msg.isHost;
    battleState.phase = 'lobby';
    renderBattleUI();
    return;
  }
  if (msg.type === 'room-update') {
    battleState.roomData = msg.roomState;
    if (battleState.phase === 'lobby') renderBattleUI();
    return;
  }
  if (msg.type === 'question') {
    clearInterval(battleState.timerInterval);
    battleState.roomData = msg.roomState;
    battleState.currentQuestion = msg.question;
    battleState.selectedAnswer = null;
    battleState.answeredCount = 0;
    battleState.totalPlayers = msg.roomState.totalPlayers;
    battleState.phase = 'question';
    battleState.timeLeft = Math.round(msg.timeMs / 1000);
    battleState.answerStartTime = Date.now();
    renderBattleUI();
    startBattleTimer(msg.timeMs);
    return;
  }
  if (msg.type === 'answer-count') {
    battleState.answeredCount = msg.answeredCount;
    battleState.totalPlayers = msg.totalPlayers;
    const el = document.getElementById('battleAnswerCount');
    if (el) el.textContent = `${msg.answeredCount}/${msg.totalPlayers} ${state.lang === 'ar' ? 'أجابوا' : 'answered'}`;
    return;
  }
  if (msg.type === 'reveal') {
    clearInterval(battleState.timerInterval);
    battleState.roomData = msg.roomState;
    battleState.revealData = { correctIndex: msg.correctIndex, correctAnswer: msg.correctAnswer };
    battleState.phase = 'reveal';
    renderBattleUI();
    return;
  }
  if (msg.type === 'game-end') {
    clearInterval(battleState.timerInterval);
    battleState.roomData = msg.roomState;
    battleState.phase = 'finished';
    renderBattleUI();
    spawnBattleConfetti();
    return;
  }
}

function startBattleTimer(timeMs) {
  const totalSec = Math.round(timeMs / 1000);
  battleState.timeLeft = totalSec;
  battleState.timerInterval = setInterval(() => {
    battleState.timeLeft = Math.max(0, battleState.timeLeft - 1);
    const countEl = document.getElementById('battleTimerCount');
    const fillEl = document.getElementById('battleTimerFill');
    if (countEl) {
      countEl.textContent = String(battleState.timeLeft);
      if (battleState.timeLeft <= 5) countEl.classList.add('urgent');
      else countEl.classList.remove('urgent');
    }
    if (fillEl) fillEl.style.width = `${(battleState.timeLeft / totalSec) * 100}%`;
    if (battleState.timeLeft <= 0) clearInterval(battleState.timerInterval);
  }, 1000);
}

function renderBattleLobby(body) {
  const isAr = state.lang === 'ar';
  const room = battleState.roomData;
  const players = room?.players || [];
  const code = battleState.roomCode || '';
  const shareUrl = `${location.origin}/#battle/${code}`;

  body.innerHTML = `
    <div class="battle-lobby">
      <div class="battle-code-display">
        <div class="battle-code-value">${escapeHtml(code)}</div>
        <p class="battle-code-hint">${isAr ? 'شارك هذا الكود لدعوة الآخرين' : 'Share this code to invite players'}</p>
        <button class="ghost-btn" id="battleShareBtn" style="margin-top:0.6rem;font-size:0.82rem;">
          🔗 ${isAr ? 'نسخ الرابط' : 'Copy invite link'}
        </button>
      </div>
      <div>
        <p class="mini-label" style="margin-bottom:0.5rem">${isAr ? 'اللاعبون' : 'Players'} (${players.length})</p>
        <div class="battle-player-list">
          ${players.map(p => `
            <div class="battle-player-row">
              ${p.id === room?.hostId ? '<span class="battle-player-crown" aria-label="Host">👑</span>' : '<span style="width:1.2rem"></span>'}
              <span style="flex:1">${escapeHtml(p.name)}</span>
              ${p.id === battleState.playerId ? `<span class="pill" style="font-size:0.7rem">${isAr ? 'أنت' : 'You'}</span>` : ''}
            </div>`).join('')}
          ${players.length === 0 ? `<p class="battle-waiting-msg">${isAr ? 'في انتظار اللاعبين...' : 'Waiting for players to join...'}</p>` : ''}
        </div>
      </div>
      ${battleState.isHost
        ? `<button class="primary-btn" id="battleStartBtn"${players.length < 1 ? ' disabled' : ''}>
             ⚡ ${isAr ? 'ابدأ المعركة' : 'Start Battle'} (${players.length} ${isAr ? 'لاعب' : players.length === 1 ? 'player' : 'players'})
           </button>
           <p class="battle-waiting-msg" style="margin-top:-0.25rem">${isAr ? 'يمكنك البدء بلاعب واحد أو أكثر' : 'You can start with 1 or more players'}</p>`
        : `<p class="battle-waiting-msg">⏳ ${isAr ? 'في انتظار المضيف لبدء المعركة...' : 'Waiting for host to start the battle...'}</p>`}
    </div>`;

  document.getElementById('battleShareBtn')?.addEventListener('click', () => {
    navigator.clipboard?.writeText(shareUrl).then(() => showToast(isAr ? 'تم نسخ الرابط!' : 'Link copied!'))
      .catch(() => showToast(shareUrl));
  });
  document.getElementById('battleStartBtn')?.addEventListener('click', () => {
    battleState.ws?.send(JSON.stringify({ type: 'start-game', hostId: battleState.hostId || '' }));
  });
}

function renderBattleQuestion(body) {
  const lang = state.lang;
  const isAr = lang === 'ar';
  const q = battleState.currentQuestion;
  const room = battleState.roomData;
  if (!q || !room) return;
  const options = (q.options?.[lang] || q.options?.en || []);
  const labels = ['A', 'B', 'C', 'D'];
  const scores = room.players.map(p => p.score);
  const maxScore = Math.max(...scores, 1);

  body.innerHTML = `
    <div class="battle-game">
      <div class="battle-hud">
        <span class="battle-hud-code">${escapeHtml(room.code)}</span>
        <span class="battle-round-label">${isAr ? 'س' : 'Q'}${q.index + 1} / ${q.total}</span>
        <span class="battle-player-count">${room.totalPlayers} ${isAr ? 'لاعبين' : 'players'}</span>
        <span class="battle-timer-badge" id="battleTimerCount">${battleState.timeLeft}</span>
      </div>
      <div class="battle-timer-bar">
        <div class="battle-timer-fill" id="battleTimerFill" style="width:${(battleState.timeLeft / 15) * 100}%"></div>
      </div>
      <div class="battle-question-area">
        <p class="battle-question-text">${escapeHtml(q.text?.[lang] || q.text?.en || '')}</p>
        <div class="battle-options" id="battleOptions">
          ${options.map((opt, i) => `
            <button class="battle-option-btn${battleState.selectedAnswer === i ? ' selected' : ''}"
              data-index="${i}" ${battleState.selectedAnswer !== null ? 'disabled' : ''}>
              <span class="battle-option-label">${labels[i]}</span>
              <span>${escapeHtml(String(opt))}</span>
            </button>`).join('')}
        </div>
        <p class="battle-answer-status" id="battleAnswerCount">
          ${battleState.answeredCount}/${room.totalPlayers} ${isAr ? 'أجابوا' : 'answered'}
        </p>
      </div>
      <div class="battle-bottom">
        <div class="battle-mini-lb">
          ${room.players.slice(0, 5).map((p, i) => {
            const barW = maxScore > 0 ? Math.round((p.score / maxScore) * 100) : 0;
            const isMe = p.id === battleState.playerId;
            return `<div class="battle-mini-lb-row${isMe ? ' is-me' : ''}">
              <span class="battle-mini-lb-pos">${i + 1}</span>
              <span class="battle-mini-lb-name">${escapeHtml(p.name)}${isMe ? (isAr ? ' (أنت)' : ' (you)') : ''}</span>
              ${p.streak >= 2 ? `<span class="battle-streak-badge">🔥${p.streak}×</span>` : ''}
              <div class="battle-mini-lb-bar"><div class="battle-mini-lb-bar-fill" style="width:${barW}%"></div></div>
              <span class="battle-mini-lb-score">${p.score}</span>
            </div>`;
          }).join('')}
        </div>
      </div>
    </div>`;

  document.querySelectorAll('.battle-option-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      if (battleState.selectedAnswer !== null || btn.disabled) return;
      submitBattleAnswer(parseInt(btn.dataset.index, 10));
    });
  });
}

function submitBattleAnswer(index) {
  if (battleState.selectedAnswer !== null) return;
  battleState.selectedAnswer = index;
  const timeMs = Date.now() - (battleState.answerStartTime || Date.now());
  battleState.ws?.send(JSON.stringify({ type: 'submit-answer', answerIndex: index, timeMs }));
  document.querySelectorAll('.battle-option-btn').forEach((btn, i) => {
    btn.disabled = true;
    if (i === index) btn.classList.add('selected');
  });
}

function renderBattleReveal(body) {
  const lang = state.lang;
  const isAr = lang === 'ar';
  const q = battleState.currentQuestion;
  const room = battleState.roomData;
  const reveal = battleState.revealData;
  if (!q || !room || !reveal) return;
  const options = (q.options?.[lang] || q.options?.en || []);
  const labels = ['A', 'B', 'C', 'D'];
  const maxScore = Math.max(...room.players.map(p => p.score), 1);
  const mySelected = battleState.selectedAnswer;
  const correctIndex = reveal.correctIndex;
  const myCorrect = mySelected !== null && mySelected === correctIndex;

  body.innerHTML = `
    <div class="battle-game">
      <div class="battle-hud">
        <span class="battle-hud-code">${escapeHtml(room.code)}</span>
        <span class="battle-round-label">
          ${isAr ? 'س' : 'Q'}${q.index + 1}/${q.total} ·
          ${mySelected === null
            ? (isAr ? '⏱️ انتهى الوقت' : '⏱️ Time\'s up')
            : myCorrect
              ? (isAr ? '✓ صحيح!' : '✓ Correct!')
              : (isAr ? '✗ خاطئ' : '✗ Wrong')}
        </span>
      </div>
      <div class="battle-timer-bar"><div class="battle-timer-fill" style="width:0%;transition:none"></div></div>
      <div class="battle-question-area">
        <p class="battle-question-text">${escapeHtml(q.text?.[lang] || q.text?.en || '')}</p>
        <div class="battle-options">
          ${options.map((opt, i) => {
            const isCorrect = i === correctIndex;
            const isWrong = i === mySelected && !isCorrect;
            let cls = isCorrect ? ' correct' : isWrong ? ' wrong' : '';
            const lbl = isCorrect ? '✓' : isWrong ? '✗' : labels[i];
            return `<button class="battle-option-btn${cls}" disabled>
              <span class="battle-option-label">${lbl}</span>
              <span>${escapeHtml(String(opt))}</span>
            </button>`;
          }).join('')}
        </div>
        <p class="battle-answer-status">${isAr ? '⏭️ القادم خلال ثوانٍ...' : '⏭️ Next question in a moment...'}</p>
      </div>
      <div class="battle-bottom">
        <div class="battle-mini-lb">
          ${room.players.slice(0, 5).map((p, i) => {
            const barW = maxScore > 0 ? Math.round((p.score / maxScore) * 100) : 0;
            const isMe = p.id === battleState.playerId;
            return `<div class="battle-mini-lb-row${isMe ? ' is-me' : ''}">
              <span class="battle-mini-lb-pos">${i + 1}</span>
              <span class="battle-mini-lb-name">${escapeHtml(p.name)}</span>
              ${p.streak >= 2 ? `<span class="battle-streak-badge">🔥${p.streak}×</span>` : ''}
              <div class="battle-mini-lb-bar"><div class="battle-mini-lb-bar-fill" style="width:${barW}%"></div></div>
              <span class="battle-mini-lb-score">${p.score}</span>
            </div>`;
          }).join('')}
        </div>
      </div>
    </div>`;
}

function renderBattlePodium(body) {
  const lang = state.lang;
  const isAr = lang === 'ar';
  const room = battleState.roomData;
  if (!room) return;
  const players = room.players;
  const medals = ['🥇', '🥈', '🥉'];
  const top3 = players.slice(0, 3);
  // Podium display order: 2nd | 1st | 3rd
  const podiumOrder = top3.length >= 2
    ? [top3[1], top3[0], top3[2]].filter(Boolean)
    : top3;
  const podiumHeights = [60, 80, 45];
  const podiumColors = [
    'linear-gradient(135deg,#94A3B8,#CBD5E1)',
    'linear-gradient(135deg,#C9A227,#E2C566)',
    'linear-gradient(135deg,#B45309,#D97706)',
  ];
  const podiumRanks = top3.length >= 2 ? [2, 1, 3] : [1, 2, 3];

  body.innerHTML = `
    <div class="battle-podium">
      <h2 class="battle-podium-title">
        ${isAr ? '🏆 انتهت المعركة!' : '🏆 Battle Complete!'}
      </h2>
      <div class="battle-podium-places">
        ${podiumOrder.map((p, di) => {
          const rank = podiumRanks[di];
          const isMe = p.id === battleState.playerId;
          return `<div class="battle-podium-place">
            <div class="battle-podium-medal">${medals[rank - 1] || ''}</div>
            <div class="battle-podium-name${isMe ? ' you' : ''}">${escapeHtml(p.name)}</div>
            <div class="battle-podium-pts">${p.score} ${isAr ? 'نقطة' : 'pts'}</div>
            <div class="battle-podium-block" style="height:${podiumHeights[di]}px;background:${podiumColors[di]}">${rank}</div>
          </div>`;
        }).join('')}
      </div>
      ${players.length > 3 ? `
        <div class="battle-full-lb">
          ${players.map((p, i) => `
            <div class="battle-full-lb-row${p.id === battleState.playerId ? ' is-me' : ''}">
              <span style="color:var(--muted);font-family:var(--font-mono);width:1.4rem">${i + 1}</span>
              <span style="flex:1;font-weight:500">${escapeHtml(p.name)}</span>
              <span style="font-family:var(--font-mono);font-weight:700;color:var(--accent-2)">${p.score}</span>
            </div>`).join('')}
        </div>` : ''}
      <div style="display:flex;gap:0.75rem;flex-wrap:wrap;justify-content:center;margin-top:0.5rem;">
        <button class="primary-btn" id="battlePlayAgainBtn">⚡ ${isAr ? 'جولة جديدة' : 'Play Again'}</button>
        <button class="secondary-btn" id="battleShareResultBtn">🔗 ${isAr ? 'شارك' : 'Share'}</button>
        <button class="ghost-btn" id="battleCloseFinBtn">${isAr ? 'إغلاق' : 'Close'}</button>
      </div>
    </div>`;

  document.getElementById('battlePlayAgainBtn')?.addEventListener('click', () => {
    battleState.phase = 'setup';
    battleState.tab = 'create';
    if (battleState.ws) { battleState.ws.onclose = null; battleState.ws.close(); battleState.ws = null; }
    renderBattleUI();
  });
  document.getElementById('battleShareResultBtn')?.addEventListener('click', () => {
    const winner = players[0];
    const myPos = players.findIndex(p => p.id === battleState.playerId) + 1;
    const text = isAr
      ? `⚡ انتهت معركة JAKH!\n🥇 ${winner?.name || ''}: ${winner?.score || 0} نقطة\n🏅 مركزي: #${myPos}\njakh.net`
      : `⚡ JAKH Battle done!\n🥇 ${winner?.name || ''}: ${winner?.score || 0} pts\n🏅 My rank: #${myPos}\njakh.net`;
    navigator.share?.({ title: 'JAKH Battle', text }).catch(() =>
      navigator.clipboard?.writeText(text).then(() => showToast(isAr ? 'تم النسخ!' : 'Copied!')));
  });
  document.getElementById('battleCloseFinBtn')?.addEventListener('click', closeBattleModal);
}

function spawnBattleConfetti() {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const colors = ['#E8613C','#C9A227','#48d597','#9f7cff','#E2C566','#ff7a8a','#5ac8ff'];
  for (let i = 0; i < 60; i++) {
    setTimeout(() => {
      const dot = document.createElement('div');
      dot.className = 'confetti-dot';
      const cx = Math.random() * window.innerWidth;
      const angle = (Math.random() - 0.5) * Math.PI * 1.8;
      const dist = 120 + Math.random() * 180;
      const size = 5 + Math.random() * 9;
      dot.style.cssText = [
        `left:${cx}px`,
        `top:${window.innerHeight * 0.25}px`,
        `width:${size}px`,
        `height:${size}px`,
        `background:${colors[Math.floor(Math.random() * colors.length)]}`,
        `border-radius:${Math.random() > 0.5 ? '50%' : '3px'}`,
        `--dx:${(Math.cos(angle) * dist).toFixed(1)}px`,
        `--dy:${(-60 - Math.random() * 160).toFixed(1)}px`,
        `--rot:${(Math.random() > 0.5 ? 1 : -1) * (360 + Math.random() * 720)}deg`,
        `animation-delay:0ms`,
      ].join(';');
      document.body.appendChild(dot);
      dot.addEventListener('animationend', () => dot.remove(), { once: true });
    }, i * 35);
  }
}

document.addEventListener('DOMContentLoaded', () => {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js')
      .then(reg => {
        // Force an immediate update check so stale SWs are replaced without
        // waiting for the browser's 24-hour throttle window.
        reg.update().catch(() => {});
      })
      .catch(() => {});

    // When a new SW takes control (after skipWaiting + claim), reload once so
    // the page gets fresh assets served by the new worker.
    let swRefreshing = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (swRefreshing) return;
      swRefreshing = true;
      window.location.reload();
    });
  }
  init().catch((error) => {
    console.error(error);
    showToast(error.message || 'Initialization error');
  });
});
