
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

function categoryGradient(slug) {
  const color = CATEGORY_COLORS[slug] || '#256aa9';
  return `linear-gradient(135deg, color-mix(in srgb, ${color} 22%, white), color-mix(in srgb, ${color} 42%, #eef5fb))`;
}

function categoryRouteForLanguage(slug, lang) {
  const safeSlug = encodeURIComponent(String(slug || '').trim());
  return lang === 'ar' ? `/ar/topics/${safeSlug}/` : `/${safeSlug}`;
}

const SHARED_LANGUAGE_ROUTES = Object.freeze([
  { en: '/', ar: '/ar/' },
  { en: '/mind-lab', ar: '/ar/mind-lab/' },
  { en: '/collections', ar: '/ar/collections/' },
  { en: '/play', ar: '/ar/play/' },
  { en: '/about', ar: '/ar/about/' },
  { en: '/privacy', ar: '/ar/privacy/' },
  ...['chess', 'mastermind', 'go', 'reversi', 'codenames', 'catan', 'backgammon', 'set', 'hanabi', 'diplomacy']
    .map(slug => ({ en: `/${slug}`, ar: `/ar/games/${slug}/` })),
]);

function normalizeSharedRoutePath(pathname) {
  let normalized = String(pathname || '/').replace(/\/{2,}/g, '/');
  normalized = normalized.replace(/\/index(?:\.html)?$/i, '/').replace(/\.html$/i, '');
  if (normalized !== '/') normalized = normalized.replace(/\/+$/, '');
  return normalized || '/';
}

function sharedLanguageRoute(pathname = location.pathname) {
  const normalized = normalizeSharedRoutePath(pathname);
  for (const route of SHARED_LANGUAGE_ROUTES) {
    if (normalizeSharedRoutePath(route.en) === normalized) return { ...route, lang: 'en' };
    if (normalizeSharedRoutePath(route.ar) === normalized) return { ...route, lang: 'ar' };
  }
  return null;
}

function sharedRouteForLanguage(pathname, lang) {
  const route = sharedLanguageRoute(pathname);
  return route ? route[lang === 'ar' ? 'ar' : 'en'] : '';
}

function localizedSharedHref(href, lang = state.lang) {
  try {
    const url = new URL(href, location.origin);
    if (url.origin !== location.origin) return href;
    const target = sharedRouteForLanguage(url.pathname, lang);
    if (!target) return href;
    url.searchParams.delete('lang');
    return `${target}${url.search}${url.hash}`;
  } catch {
    return href;
  }
}

function localizeSharedRuntimeLinks(root = document) {
  root.querySelectorAll('a[href]').forEach((link) => {
    const href = link.getAttribute('href');
    if (!href || href.startsWith('#')) return;
    const localized = localizedSharedHref(href, state.lang);
    if (localized !== href) link.setAttribute('href', localized);
  });
}

const LEGACY_CATEGORY_ART = Object.freeze({
  currencies: 'assets/backgrounds/currencies.svg',
  linguistics: 'assets/backgrounds/linguistics.webp',
  'tech-retro': 'assets/backgrounds/tech-retro.webp',
  automotive: 'assets/backgrounds/automotive.svg',
  survival: 'assets/backgrounds/survival.webp',
  'fictional-worlds': 'assets/backgrounds/fictional-worlds.webp',
  superheroes: 'assets/backgrounds/superheroes.webp',
  'pop-culture': 'assets/backgrounds/pop-culture.svg',
  'true-crime': 'assets/backgrounds/true-crime.webp',
  'mythology-legends': 'assets/backgrounds/mythology-legends.webp',
  'logic-puzzles': 'assets/backgrounds/logic-puzzles.svg',
});

function categoryArtUrl(meta) {
  const image = String(meta?.image || '').trim();
  if (image) return `/${image.replace(/^\/+/, '')}`;
  const slug = String(meta?.slug || '').trim();
  return `/${LEGACY_CATEGORY_ART[slug] || `assets/${slug}.svg`}`;
}

const UI = {
  en: {
    brandSubtitle: 'bilingual topics, saved progress, and live Battle Rooms',
    navHome: 'Home',
    navCategories: 'Categories',
    authOpen: 'Sign in',
    language: 'Language',
    homeEyebrow: 'A bilingual playground for curious minds',
    homeTitle: 'Pick what sparks your curiosity. Learn, play, and surprise yourself.',
    homeText: 'Choose a category, tap a card to reveal the answer, then mark it right or wrong. Free forever, no app needed.',
    browseCategories: 'Explore topics',
    heroGameHub: 'Game Hub',
    statCategories: 'Topics',
    statQuestions: 'Questions',
    statLanguages: 'Languages',
    mindHeroEyebrow: '3,553 questions · 56 clear topics',
    mindHeroTitle: 'The Mind Lab',
    mindHeroSubtitle: 'Follow your curiosity. Every topic opens into a quick, satisfying challenge.',
    playHeroTitle: 'The Game Room',
    playHeroSubtitle: 'Ten browser adaptations and simplified games, ready with no download or sign-up.',
    playHeroGames: 'Games',
    playAvailable: 'Ready to play',
    playPick: 'Pick a game and start playing',
    playBrowserOnly: 'Every title is a browser adaptation; rules and AI depth vary by game, with nothing to install.',
    playChessAria: 'Play Chess',
    playChessTitle: 'Chess',
    playChessDesc: 'A browser chess adaptation with legal-move highlighting, en passant, castling, and promotion. Play the built-in AI or take turns locally.',
    playChessCta: 'Play Chess →',
    playMastermindAria: 'Play Mastermind',
    playMastermindTitle: 'Mastermind',
    playMastermindDesc: 'Crack the secret 4-colour code in 10 attempts. Use the Hint button for the optimal Knuth move.',
    playMastermindCta: 'Play Mastermind →',
    playGoAria: 'Play Go',
    playGoTitle: 'Go (9×9)',
    playGoDesc: 'Ancient strategy: capture stones, claim territory on a 9×9 board. Two consecutive passes end the game — territory + captures decides the winner.',
    playGoCta: 'Play Go →',
    playReversiAria: 'Play Reversi',
    playReversiTitle: 'Reversi',
    playReversiDesc: 'Flip your opponent’s discs by trapping them. Corners are king. Minimax AI at depth 4 — control the board or get outflanked.',
    playReversiCta: 'Play Reversi →',
    playCodenamesAria: 'Play Codenames',
    playCodenamesTitle: 'Codenames',
    playCodenamesDesc: 'The AI Spymaster gives you one-word clues. Find all 9 red agents on the 5×5 grid — but avoid the assassin or it’s game over.',
    playCodenamesCta: 'Play Codenames →',
    playCatanAria: 'Play Catan Lite',
    playCatanTitle: 'Catan Lite',
    playCatanDesc: 'Roll dice, collect resources, build settlements and cities. First to 10 victory points wins. Simplified for quick browser play.',
    playCatanCta: 'Play Catan →',
    playBackgammonAria: 'Play Backgammon',
    playBackgammonTitle: 'Backgammon',
    playBackgammonDesc: 'A simplified browser adaptation: race 15 checkers around 24 points, with virtual dice, enforced moves, and a greedy AI.',
    playBackgammonCta: 'Play Backgammon →',
    playSetAria: 'Play Set',
    playSetTitle: 'Set',
    playSetDesc: 'Find sets of 3 cards where each attribute is either all-same or all-different. 81-card deck with inline SVG shapes — use Hint when stuck.',
    playSetCta: 'Play Set →',
    playHanabiAria: 'Play Hanabi',
    playHanabiTitle: 'Hanabi',
    playHanabiDesc: 'You can’t see your own cards. Give and receive clues with your AI partner to play fireworks in the right order — score 25 for a perfect show.',
    playHanabiCta: 'Play Hanabi →',
    playDiplomacyAria: 'Play Diplomacy',
    playDiplomacyTitle: 'Diplomacy',
    playDiplomacyDesc: 'Control 12 territories through simultaneous order resolution. No dice — pure strategy. Outwit the AI to dominate the map.',
    playDiplomacyCta: 'Play Diplomacy →',
    gameTagTwoPlayers: '2 players',
    gameTagComputer: 'vs Computer',
    gameTagStrategy: 'Strategy',
    gameTagSolo: 'Solo',
    gameTagTenAttempts: '10 attempts',
    gameTagLogic: 'Logic',
    gameTagClassic: 'Classic',
    gameTagAiSpymaster: 'AI Spymaster',
    gameTagDeduction: 'Deduction',
    gameTagResources: 'Resources',
    gameTagDice: 'Dice',
    gameTagPattern: 'Pattern',
    gameTagCooperative: 'Cooperative',
    gameTagAiPartner: 'AI Partner',
    gameTagMemory: 'Memory',
    gameTagAreaControl: 'Area Control',
    portalMindTag: 'Mind Lab',
    portalMindTitle: 'The Mind Lab',
    portalMindDesc: 'Explore 3,553 English and Arabic questions, organized into 56 clear topics. Flip each card, reveal the answer, and keep score as you go.',
    portalMindStat: '56 topics',
    portalBilingualStat: 'English & Arabic',
    portalMindCta: 'Explore Riddles →',
    portalGamesTag: 'Game Hub',
    portalGamesTitle: 'The Game Hub',
    portalGamesDesc: 'Play 10 browser adaptations and simplified games, from Chess and Go to Codenames and Catan. Nothing to install, and no sign-up needed.',
    portalGamesStat1: '10 browser games',
    portalGamesStat2: 'All in browser',
    portalGamesCta: 'Play Now →',
    homeCollectionsEyebrow: 'Quick ways to begin',
    homeCollectionsTitle: 'Start with a collection that fits your mood',
    homeCollectionsText: 'Try a short set of riddles, family-friendly clues, logic puzzles, or football questions. Every answer is one tap away.',
    homeCollectionsCta: 'See all collections',
    homeCollectionArabicTitle: 'Arabic riddles with answers',
    homeCollectionArabicMeta: '16 bilingual riddles',
    homeCollectionKidsTitle: 'Kids’ riddles with answers',
    homeCollectionKidsMeta: 'Friendly, family-safe clues',
    homeCollectionLogicTitle: 'Logic puzzles with explanations',
    homeCollectionLogicMeta: 'Deduction, numbers, and careful reading',
    homeCollectionFootballTitle: 'Football rules & tactics',
    homeCollectionFootballMeta: '16 practical bilingual questions',
    homeSocialEyebrow: 'Stay curious',
    homeSocialTitle: 'Get fresh challenges from JAKH',
    homeSocialText: 'Follow along for new riddles, quick quizzes, and game updates.',
    homeSocialLabel: 'JAKH social pages',
    footerCollections: 'Collections',
    footerAbout: 'About & content standards',
    footerPrivacy: 'Privacy Centre',
    footerInfoLabel: 'JAKH information',
    socialInstagramLabel: 'JAKH Riddles on Instagram',
    socialFacebookLabel: 'JAKH Riddles on Facebook',
    skipMain: 'Skip to main content',
    brandHomeLabel: 'JAKH Riddles home',
    quickActionsLabel: 'Quick actions',
    languageControlsLabel: 'Language controls',
    breadcrumbLabel: 'Breadcrumb',
    breadcrumbHome: 'Home',
    breadcrumbMindLab: 'Mind Lab',
    questionFiltersLabel: 'Question filters',
    categoryFiltersLabel: 'Category filters',
    categorySectionsLabel: 'Category sections',
    close: 'Close',
    exit: 'Exit',
    locked: 'Locked',
    host: 'Host',
    search: 'Search',
    menu: 'Menu',
    teamBattle: 'Battle Room',
    backToTop: 'Back to top',
    searchPlaceholder: 'Search topics and subtopics...',
    cardSearchPlaceholder: 'Search by keyword, answer, or concept...',
    homeSrTitle: 'Riddles and quizzes in English and Arabic',
    standardsDefaultText: 'Questions are curated for learning and entertainment.',
    standardsDefaultLink: 'See how JAKH reviews and improves content.',
    standardsEducationLabel: 'Educational use:',
    standardsEducationText: 'This quiz is for learning and entertainment, not medical, legal, financial, or mental-health advice.',
    standardsEducationLink: 'Read our content standards.',
    reviewStatusReviewed: 'Editorially reviewed',
    reviewStatusPending: 'Editorial review pending',
    reviewSafetyPending: 'Editorial review pending · Safety-sensitive educational content',
    reviewDate: 'Reviewed {date}',
    reviewReviewer: 'Reviewer: {reviewer}',
    reviewSources: 'Sources',
    reviewSourceLabel: 'Source {number}: {title}, {publisher}',
    mindCalloutEyebrow: 'Prefer a shorter challenge?',
    mindCalloutTitle: 'Try a focused bilingual collection',
    mindCalloutText: 'Start with 16 curated riddles, kids’ questions, logic puzzles, general knowledge, football, or nostalgia questions.',
    mindCalloutCta: 'Browse collections',
    createAccount: 'Save my progress',
    todayMomentum: 'Your snapshot',
    localBrowserOnly: 'Saved to your account',
    categoryEyebrow: 'Choose a section',
    categoryTitle: 'What are you curious about today?',
    categoryText: 'Choose a clear section, search by interest, or let JAKH surprise you.',
    searchCategoriesLabel: 'Search topics and subtopics',
    tracksLabel: 'Sections',
    randomCategory: 'Surprise me',
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
    guestText: 'Create a free account to save your progress, favorites, and practice score across all your devices.',
    createLocalProfile: 'Create account',
    signedInAs: 'Signed in as',
    score: 'Practice points',
    solved: 'Solved',
    favorites: 'Favorites',
    authSignInTab: 'Sign in',
    authRegisterTab: 'Create account',
    authRecoveryAction: 'Use a recovery code',
    username: 'Username',
    usernameOrEmail: 'Username or email',
    adminConsole: 'Admin console',
    adminConsoleAria: 'Open the JAKH administration console',
    password: 'Password',
    newPassword: 'New password',
    passwordHint: 'Securely stored in your cloud account.',
    confirmPassword: 'Confirm password',
    passwordsDoNotMatch: 'The password confirmation does not match.',
    signIn: 'Sign in',
    register: 'Create account',
    recoveryCode: 'Recovery code',
    recoveryFormTitle: 'Recover your account',
    recoveryFormLead: 'Enter the one-time recovery code you saved and choose a new password. A successful reset signs you in, ends every older session, and replaces the recovery code.',
    registrationRecoveryNotice: 'After account creation, JAKH shows a recovery code once. Save it securely; it is the only self-service way to recover an account without your password.',
    recoveryReset: 'Reset password and sign in',
    recoveryResetting: 'Resetting password…',
    recoveryFailed: 'The account could not be recovered. Check the username, code, and new password, then try again.',
    recoveryReceiptTitle: 'Save your new recovery code now',
    recoveryReceiptLead: 'This code is shown only once. Store it in a password manager or another secure place. Anyone with this code can reset your password.',
    recoveryReceiptReplacement: 'Generating another recovery code immediately invalidates this one. JAKH does not store a readable copy and cannot show it again.',
    recoveryCopy: 'Copy recovery code',
    recoveryCopied: 'Recovery code copied. Save it somewhere secure.',
    recoveryCopyFailed: 'Automatic copy is unavailable. Select the code and copy it manually.',
    recoverySaved: 'I saved this code',
    recoveryCloseBlocked: 'Save the recovery code, then confirm that you saved it before closing.',
    recoveryRotateTitle: 'Replace recovery code',
    recoveryRotateLead: 'Enter your current password to create a replacement. Your old recovery code stops working immediately.',
    recoveryRotate: 'Create replacement code',
    recoveryRotating: 'Creating replacement…',
    recoveryCodeUnavailable: 'The server did not provide a recovery code. Use “Replace recovery code” before leaving this account.',
    recoverySyncWarning: 'Your new recovery code was issued, but some account data did not finish loading. Save the code below, then retry after checking your connection.',
    logout: 'Log out',
    logoutFailed: 'Could not log out. Your account is still shown as signed in; check your connection and try again.',
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
    suggestPrivacy: 'If you tick the account option while signed in, the suggestion is included in export and deletion. Otherwise it stays unlinked. Retained up to 12 months.',
    suggestLinkAccount: 'Link this suggestion to my signed-in account',
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
    badgeBronzeName: 'Bronze',
    badgeSilverName: 'Silver',
    badgeGoldName: 'Gold',
    badgeDiamondName: 'Diamond',
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
    shareChallengeTitle: 'JAKH Challenge',
    shareRiddleTitle: 'JAKH Riddles',
    shareBattleTitle: 'JAKH Battle',
    avatarUpdated: 'Avatar updated!',
    avatarSaveError: 'Could not save the avatar.',
    chooseAvatarAria: 'Choose {avatar} as your avatar',
    passwordFieldsRequired: 'Fill both password fields.',
    passwordUpdated: 'Password updated!',
    suggestionSubmitError: 'Could not submit. Please try again.',
    initializationError: 'JAKH could not finish loading. Please refresh and try again.',
    genericError: 'Something went wrong. Please try again.',
    errorInvalidCredentials: 'Username or password is incorrect.',
    errorUserExists: 'That username or email is already in use.',
    errorAccountSuspended: 'This account has been suspended.',
    errorUsernameRequired: 'Enter a username.',
    errorUsernameInvalid: 'Use 3–20 letters, numbers, or underscores for the username.',
    errorPasswordRequired: 'Enter a password.',
    errorPasswordInvalid: 'Use a password between 8 and 128 characters.',
    errorEmailInvalid: 'Enter a valid email address.',
    errorRateLimited: 'Too many attempts. Please try again later.',
    errorUnauthorized: 'Please sign in again.',
    errorCurrentPassword: 'The current password is incorrect.',
    errorNewPasswordDifferent: 'Choose a new password that is different.',
    errorInvalidAvatar: 'That avatar is not available.',
    errorRoomNotFound: 'That battle room could not be found.',
    errorInvalidMessage: 'The battle room received an invalid message.',
    errorJoinFirst: 'Join the battle room first.',
    errorBattleStarted: 'This battle has already started.',
    errorRoomFull: 'This battle room is full.',
    errorPlayerNameRequired: 'Enter your name.',
    errorBattleCreate: 'Could not create the battle room.',
    errorInvalidCategory: 'Choose a valid category.',
    errorInvalidDifficulty: 'Choose a valid difficulty.',
    errorCategoryUnavailable: 'That category is unavailable.',
    errorNoQuestions: 'No questions are available for this selection.',
    errorInvalidRoomCode: 'Enter a valid room code.',
    leaderboardTitle: 'Server-checked leaderboard',
    leaderboardLoadError: 'Could not load the leaderboard.',
    verifiedAnswerAll: 'Answer all 10 questions before submitting.',
    verifiedActive: 'A server-checked challenge for this topic is already active. Return to the original tab or wait up to 15 minutes for it to expire.',
    verifiedCancelError: 'Could not cancel the challenge. Your answers and token are still kept in this tab; retry before closing.',
    verifiedDiscardError: 'Could not discard the active attempt. It was not replaced.',
    verifiedChallengeError: 'Could not start the server-checked challenge.',
    verifiedSubmitError: 'The server could not check these answers.',
    verifiedTooFast: 'Take a little more time before submitting.',
    verifiedExpired: 'This challenge expired. Start a new one.',
    verifiedReplayed: 'This challenge has already been submitted.',
    verifiedTampered: 'The challenge changed and cannot be checked by the server. Start again.',
    verifiedUnavailable: 'This topic is not available for server scoring yet.',
    globalSearchUnavailable: 'Search is unavailable right now.',
    installPrompt: '📲 Add JAKH to your home screen for quick access',
    install: 'Install',
    secondsShort: 's',
    // Streak freeze
    streakFreezeLabel: '🧊 Freeze',
  },
  ar: {
    brandSubtitle: 'مواضيع ثنائية اللغة وتقدّم محفوظ وغرف معركة مباشرة',
    navHome: 'الرئيسية',
    navCategories: 'الفئات',
    authOpen: 'تسجيل الدخول',
    language: 'اللغة',
    homeEyebrow: 'مساحة ثنائية اللغة للعقول الفضولية',
    homeTitle: 'اختر ما يثير فضولك، وتعلّم والعب واكتشف شيئًا جديدًا.',
    homeText: 'اختر فئة، اضغط على البطاقة لتظهر الإجابة، ثم حدّد إجابتك صحيحة أم خاطئة. مجاني تمامًا وبدون تطبيق.',
    browseCategories: 'استكشف المواضيع',
    heroGameHub: 'مركز الألعاب',
    statCategories: 'المواضيع',
    statQuestions: 'الأسئلة',
    statLanguages: 'اللغات',
    mindHeroEyebrow: '3,553 سؤالًا · 56 موضوعًا واضحًا',
    mindHeroTitle: 'مختبر العقول',
    mindHeroSubtitle: 'اتبع فضولك؛ كل موضوع يفتح لك تحديًا سريعًا وممتعًا.',
    playHeroTitle: 'غرفة الألعاب',
    playHeroSubtitle: 'عشر نسخ متصفح وألعاب مبسطة جاهزة بلا تنزيل وبلا حاجة إلى التسجيل.',
    playHeroGames: 'ألعاب',
    playAvailable: 'جاهز للعب؟',
    playPick: 'اختر لعبة وابدأ',
    playBrowserOnly: 'كل عنوان نسخة متصفح، وتختلف القواعد وعمق الخصم الآلي بين الألعاب، من دون تثبيت.',
    playChessAria: 'العب الشطرنج',
    playChessTitle: 'الشطرنج',
    playChessDesc: 'نسخة متصفح من الشطرنج مع إظهار النقلات القانونية والأخذ بالتجاوز والتبييت والترقية. العب ضد الخصم المدمج أو تناوب محليًا مع صديق.',
    playChessCta: 'العب الشطرنج ←',
    playMastermindAria: 'العب ماستر مايند',
    playMastermindTitle: 'ماستر مايند',
    playMastermindDesc: 'اكتشف الرمز السري المكوّن من أربعة ألوان خلال 10 محاولات. استخدم زر التلميح للحصول على أفضل نقلة وفق خوارزمية كنوث.',
    playMastermindCta: 'العب ماستر مايند ←',
    playGoAria: 'العب غو',
    playGoTitle: 'غو (9×9)',
    playGoDesc: 'لعبة استراتيجية عريقة: حاصر الأحجار وسيطر على المساحات في لوحة 9×9. ينتهي اللعب بعد تمريرتين متتاليتين، ويُحسم الفوز بالمساحات والأسر.',
    playGoCta: 'العب غو ←',
    playReversiAria: 'العب ريفيرسي',
    playReversiTitle: 'ريفيرسي',
    playReversiDesc: 'اقلب أقراص خصمك عبر محاصرتها. الزوايا حاسمة، والخصم الآلي يستخدم خوارزمية Minimax بعمق 4.',
    playReversiCta: 'العب ريفيرسي ←',
    playCodenamesAria: 'العب كودنيمز',
    playCodenamesTitle: 'كودنيمز',
    playCodenamesDesc: 'يمنحك رئيس الجواسيس الآلي تلميحات من كلمة واحدة. اعثر على العملاء التسعة في شبكة 5×5 وتجنب القاتل حتى لا تنتهي اللعبة.',
    playCodenamesCta: 'العب كودنيمز ←',
    playCatanAria: 'العب كاتان لايت',
    playCatanTitle: 'كاتان لايت',
    playCatanDesc: 'ارمِ النرد واجمع الموارد وابنِ المستوطنات والمدن. أول من يصل إلى 10 نقاط انتصار يفوز. نسخة مبسطة للعب السريع في المتصفح.',
    playCatanCta: 'العب كاتان ←',
    playBackgammonAria: 'العب طاولة الزهر',
    playBackgammonTitle: 'طاولة الزهر',
    playBackgammonDesc: 'نسخة متصفح مبسطة: حرّك 15 حجرًا حول 24 خانة، مع نرد افتراضي ونقلات مفروضة وخصم آلي بسيط.',
    playBackgammonCta: 'العب طاولة الزهر ←',
    playSetAria: 'العب سِت',
    playSetTitle: 'سِت',
    playSetDesc: 'اعثر على مجموعات من ثلاث بطاقات تكون فيها كل سمة متطابقة تمامًا أو مختلفة تمامًا. تتضمن المجموعة 81 بطاقة وزر تلميح عند الحاجة.',
    playSetCta: 'العب سِت ←',
    playHanabiAria: 'العب هانابي',
    playHanabiTitle: 'هانابي',
    playHanabiDesc: 'لا يمكنك رؤية بطاقاتك. تبادل التلميحات مع شريكك الآلي لتشغيل الألعاب النارية بالترتيب الصحيح، وحقق 25 نقطة للعرض المثالي.',
    playHanabiCta: 'العب هانابي ←',
    playDiplomacyAria: 'العب دبلوماسي',
    playDiplomacyTitle: 'دبلوماسي',
    playDiplomacyDesc: 'سيطر على 12 إقليمًا عبر تنفيذ الأوامر المتزامنة. لا نرد هنا، بل استراتيجية خالصة للتفوق على الخصم الآلي والسيطرة على الخريطة.',
    playDiplomacyCta: 'العب دبلوماسي ←',
    gameTagTwoPlayers: 'لاعبان',
    gameTagComputer: 'ضد الحاسوب',
    gameTagStrategy: 'استراتيجية',
    gameTagSolo: 'فردي',
    gameTagTenAttempts: '10 محاولات',
    gameTagLogic: 'منطق',
    gameTagClassic: 'كلاسيكية',
    gameTagAiSpymaster: 'رئيس جواسيس آلي',
    gameTagDeduction: 'استنتاج',
    gameTagResources: 'موارد',
    gameTagDice: 'نرد',
    gameTagPattern: 'أنماط',
    gameTagCooperative: 'تعاونية',
    gameTagAiPartner: 'شريك آلي',
    gameTagMemory: 'ذاكرة',
    gameTagAreaControl: 'سيطرة على المناطق',
    portalMindTag: 'مختبر العقول',
    portalMindTitle: 'مختبر العقول',
    portalMindDesc: 'استكشف 3,553 سؤالًا بالعربية والإنجليزية، مرتبة في 56 موضوعًا واضحًا. اقلب البطاقة، واكشف الإجابة، وتابع نتيجتك بسهولة.',
    portalMindStat: '56 موضوعًا',
    portalBilingualStat: 'العربية والإنجليزية',
    portalMindCta: 'استكشف الألغاز ←',
    portalGamesTag: 'مركز الألعاب',
    portalGamesTitle: 'مركز الألعاب',
    portalGamesDesc: 'العب 10 نسخ متصفح وألعاب مبسطة، من الشطرنج وغو إلى كودنيمز وكاتان. بلا تنزيل وبلا حاجة إلى التسجيل.',
    portalGamesStat1: '10 ألعاب متصفح',
    portalGamesStat2: 'كلها في المتصفح',
    portalGamesCta: 'العب الآن ←',
    homeCollectionsEyebrow: 'بداية سريعة',
    homeCollectionsTitle: 'ابدأ بمجموعة تناسب مزاجك',
    homeCollectionsText: 'جرّب مجموعة قصيرة من الألغاز، أو الأسئلة العائلية، أو تحديات المنطق، أو أسئلة كرة القدم. كل إجابة على بُعد لمسة.',
    homeCollectionsCta: 'شاهد كل المجموعات',
    homeCollectionArabicTitle: 'ألغاز مع الحل',
    homeCollectionArabicMeta: '16 لغزاً ثنائي اللغة',
    homeCollectionKidsTitle: 'ألغاز للأطفال مع الحل',
    homeCollectionKidsMeta: 'ألغاز ودية وآمنة للعائلة',
    homeCollectionLogicTitle: 'ألغاز منطق مع الشرح',
    homeCollectionLogicMeta: 'استنتاج وأرقام وقراءة متأنية',
    homeCollectionFootballTitle: 'قوانين وتكتيكات كرة القدم',
    homeCollectionFootballMeta: '16 سؤالاً عملياً ثنائي اللغة',
    homeSocialEyebrow: 'ابقَ فضوليًا',
    homeSocialTitle: 'تحديات جديدة من JAKH',
    homeSocialText: 'تابعنا لألغاز جديدة، واختبارات سريعة، وتحديثات الألعاب.',
    homeSocialLabel: 'صفحات JAKH الاجتماعية',
    footerCollections: 'المجموعات',
    footerAbout: 'عن JAKH ومعايير المحتوى',
    footerPrivacy: 'مركز الخصوصية',
    footerInfoLabel: 'معلومات JAKH',
    socialInstagramLabel: 'ألغاز JAKH على إنستغرام',
    socialFacebookLabel: 'ألغاز JAKH على فيسبوك',
    skipMain: 'انتقل إلى المحتوى الرئيسي',
    brandHomeLabel: 'الصفحة الرئيسية لألغاز JAKH',
    quickActionsLabel: 'إجراءات سريعة',
    languageControlsLabel: 'خيارات اللغة',
    breadcrumbLabel: 'مسار التنقل',
    breadcrumbHome: 'الرئيسية',
    breadcrumbMindLab: 'مختبر العقول',
    questionFiltersLabel: 'فلاتر الأسئلة',
    categoryFiltersLabel: 'فلاتر الفئات',
    categorySectionsLabel: 'أقسام الفئات',
    close: 'إغلاق',
    exit: 'خروج',
    locked: 'مغلق',
    host: 'المضيف',
    search: 'بحث',
    menu: 'القائمة',
    teamBattle: 'غرفة المعركة',
    backToTop: 'العودة للأعلى',
    searchPlaceholder: 'ابحث في المواضيع والمواضيع الفرعية...',
    cardSearchPlaceholder: 'ابحث بكلمة أو إجابة أو مفهوم...',
    homeSrTitle: 'ألغاز واختبارات بالعربية والإنجليزية',
    standardsDefaultText: 'تُراجع الأسئلة لأغراض التعلم والترفيه.',
    standardsDefaultLink: 'تعرّف على طريقة مراجعة JAKH للمحتوى وتحسينه.',
    standardsEducationLabel: 'للاستخدام التعليمي:',
    standardsEducationText: 'هذا الاختبار للتعلم والترفيه، وليس نصيحة طبية أو قانونية أو مالية أو متعلقة بالصحة النفسية.',
    standardsEducationLink: 'اقرأ معايير المحتوى لدينا.',
    reviewStatusReviewed: 'تمت مراجعته تحريريًا',
    reviewStatusPending: 'بانتظار المراجعة التحريرية',
    reviewSafetyPending: 'بانتظار المراجعة التحريرية · محتوى تعليمي حساس للسلامة',
    reviewDate: 'تاريخ المراجعة: {date}',
    reviewReviewer: 'المراجع: {reviewer}',
    reviewSources: 'المصادر',
    reviewSourceLabel: 'المصدر {number}: {title}، {publisher}',
    mindCalloutEyebrow: 'هل تفضّل تحديًا أقصر؟',
    mindCalloutTitle: 'جرّب مجموعة ثنائية اللغة ومركزة',
    mindCalloutText: 'ابدأ بـ16 لغزًا مختارًا أو أسئلة للأطفال أو ألغاز منطق أو معلومات عامة أو كرة قدم أو أسئلة من زمن الطيبين.',
    mindCalloutCta: 'تصفح المجموعات',
    createAccount: 'احفظ تقدمي',
    todayMomentum: 'ملخصك',
    localBrowserOnly: 'محفوظ في حسابك',
    categoryEyebrow: 'اختر قسمًا',
    categoryTitle: 'ما الذي يثير فضولك اليوم؟',
    categoryText: 'اختر قسمًا واضحًا، أو ابحث حسب اهتمامك، أو دع JAKH يفاجئك.',
    searchCategoriesLabel: 'ابحث في المواضيع والمواضيع الفرعية',
    tracksLabel: 'الأقسام',
    randomCategory: 'اختيار عشوائي',
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
    aToZ: 'أ–ي',
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
    guestText: 'أنشئ حسابًا مجانيًا لحفظ تقدمك ومفضلتك ونقاط التدريب على جميع أجهزتك.',
    createLocalProfile: 'أنشئ حسابًا',
    signedInAs: 'مسجل باسم',
    score: 'نقاط التدريب',
    solved: 'المحلول',
    favorites: 'المفضلة',
    authSignInTab: 'تسجيل الدخول',
    authRegisterTab: 'إنشاء حساب',
    authRecoveryAction: 'استخدام رمز الاسترداد',
    username: 'اسم المستخدم',
    usernameOrEmail: 'اسم المستخدم أو البريد الإلكتروني',
    adminConsole: 'لوحة الإدارة',
    adminConsoleAria: 'فتح لوحة إدارة JAKH',
    password: 'كلمة المرور',
    newPassword: 'كلمة المرور الجديدة',
    passwordHint: 'تُخزن بأمان في حسابك السحابي.',
    confirmPassword: 'تأكيد كلمة المرور',
    passwordsDoNotMatch: 'تأكيد كلمة المرور غير مطابق.',
    signIn: 'دخول',
    register: 'إنشاء حساب',
    recoveryCode: 'رمز الاسترداد',
    recoveryFormTitle: 'استرداد حسابك',
    recoveryFormLead: 'أدخل رمز الاسترداد الذي حفظته واختر كلمة مرور جديدة. عند النجاح تُسجّل دخولك وتنتهي كل الجلسات القديمة ويُستبدل رمز الاسترداد.',
    registrationRecoveryNotice: 'بعد إنشاء الحساب، يعرض JAKH رمز استرداد مرة واحدة. احفظه بأمان؛ فهو الطريقة الذاتية الوحيدة لاسترداد الحساب من دون كلمة المرور.',
    recoveryReset: 'إعادة التعيين وتسجيل الدخول',
    recoveryResetting: 'جارٍ إعادة تعيين كلمة المرور…',
    recoveryFailed: 'تعذر استرداد الحساب. تحقق من اسم المستخدم والرمز وكلمة المرور الجديدة ثم حاول مرة أخرى.',
    recoveryReceiptTitle: 'احفظ رمز الاسترداد الجديد الآن',
    recoveryReceiptLead: 'يظهر هذا الرمز مرة واحدة فقط. احفظه في مدير كلمات مرور أو مكان آمن آخر. يستطيع أي شخص يملكه إعادة تعيين كلمة مرورك.',
    recoveryReceiptReplacement: 'يؤدي إنشاء رمز استرداد آخر إلى إبطال هذا الرمز فوراً. لا يحتفظ JAKH بنسخة قابلة للقراءة ولا يستطيع عرضه مجدداً.',
    recoveryCopy: 'نسخ رمز الاسترداد',
    recoveryCopied: 'تم نسخ رمز الاسترداد. احفظه في مكان آمن.',
    recoveryCopyFailed: 'النسخ التلقائي غير متاح. حدّد الرمز وانسخه يدوياً.',
    recoverySaved: 'حفظت هذا الرمز',
    recoveryCloseBlocked: 'احفظ رمز الاسترداد، ثم أكد أنك حفظته قبل الإغلاق.',
    recoveryRotateTitle: 'استبدال رمز الاسترداد',
    recoveryRotateLead: 'أدخل كلمة مرورك الحالية لإنشاء بديل. يتوقف رمز الاسترداد القديم عن العمل فوراً.',
    recoveryRotate: 'إنشاء رمز بديل',
    recoveryRotating: 'جارٍ إنشاء البديل…',
    recoveryCodeUnavailable: 'لم يرسل الخادم رمز استرداد. استخدم «استبدال رمز الاسترداد» قبل مغادرة الحساب.',
    recoverySyncWarning: 'صدر رمز الاسترداد الجديد، لكن بعض بيانات الحساب لم يكتمل تحميلها. احفظ الرمز أدناه ثم حاول مجدداً بعد التحقق من الاتصال.',
    logout: 'تسجيل الخروج',
    logoutFailed: 'تعذر تسجيل الخروج. ما زال الحساب ظاهراً كمسجّل؛ تحقق من الاتصال وحاول مرة أخرى.',
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
    suggestPrivacy: 'إذا اخترت ربطه أثناء تسجيل الدخول فسيظهر ضمن التصدير والحذف. وإلا يبقى غير مرتبط، ويستمر الاحتفاظ حتى 12 شهرًا.',
    suggestLinkAccount: 'اربط هذا الاقتراح بحسابي المسجّل',
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
    badgeBronzeName: 'برونزية',
    badgeSilverName: 'فضية',
    badgeGoldName: 'ذهبية',
    badgeDiamondName: 'ماسية',
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
    shareChallengeTitle: 'تحدي JAKH',
    shareRiddleTitle: 'ألغاز JAKH',
    shareBattleTitle: 'معركة JAKH',
    avatarUpdated: 'تم تحديث الصورة الرمزية!',
    avatarSaveError: 'تعذّر حفظ الصورة الرمزية.',
    chooseAvatarAria: 'اختر {avatar} صورة رمزية',
    passwordFieldsRequired: 'املأ حقلي كلمة المرور.',
    passwordUpdated: 'تم تحديث كلمة المرور!',
    suggestionSubmitError: 'تعذّر إرسال الاقتراح. حاول مرة أخرى.',
    initializationError: 'تعذّر إكمال تحميل JAKH. حدّث الصفحة وحاول مرة أخرى.',
    genericError: 'حدث خطأ ما. حاول مرة أخرى.',
    errorInvalidCredentials: 'اسم المستخدم أو كلمة المرور غير صحيحين.',
    errorUserExists: 'اسم المستخدم أو البريد الإلكتروني مستخدم بالفعل.',
    errorAccountSuspended: 'تم إيقاف هذا الحساب.',
    errorUsernameRequired: 'أدخل اسم المستخدم.',
    errorUsernameInvalid: 'استخدم من 3 إلى 20 حرفًا أو رقمًا أو شرطة سفلية لاسم المستخدم.',
    errorPasswordRequired: 'أدخل كلمة المرور.',
    errorPasswordInvalid: 'استخدم كلمة مرور يتراوح طولها بين 8 و128 حرفًا.',
    errorEmailInvalid: 'أدخل بريدًا إلكترونيًا صالحًا.',
    errorRateLimited: 'محاولات كثيرة جدًا. حاول مرة أخرى لاحقًا.',
    errorUnauthorized: 'سجّل الدخول مرة أخرى.',
    errorCurrentPassword: 'كلمة المرور الحالية غير صحيحة.',
    errorNewPasswordDifferent: 'اختر كلمة مرور جديدة مختلفة.',
    errorInvalidAvatar: 'هذه الصورة الرمزية غير متاحة.',
    errorRoomNotFound: 'تعذّر العثور على غرفة المعركة.',
    errorInvalidMessage: 'استقبلت غرفة المعركة رسالة غير صالحة.',
    errorJoinFirst: 'انضم إلى غرفة المعركة أولًا.',
    errorBattleStarted: 'بدأت هذه المعركة بالفعل.',
    errorRoomFull: 'غرفة المعركة ممتلئة.',
    errorPlayerNameRequired: 'أدخل اسمك.',
    errorBattleCreate: 'تعذّر إنشاء غرفة المعركة.',
    errorInvalidCategory: 'اختر فئة صالحة.',
    errorInvalidDifficulty: 'اختر مستوى صعوبة صالحًا.',
    errorCategoryUnavailable: 'هذه الفئة غير متاحة.',
    errorNoQuestions: 'لا توجد أسئلة متاحة لهذا الاختيار.',
    errorInvalidRoomCode: 'أدخل رمز غرفة صالحًا.',
    leaderboardTitle: 'لوحة نتائج يتحقق منها الخادم',
    leaderboardLoadError: 'تعذّر تحميل لوحة المتصدرين.',
    verifiedAnswerAll: 'أجب عن الأسئلة العشرة قبل الإرسال.',
    verifiedActive: 'يوجد تحدٍ نشط يتحقق منه الخادم لهذا الموضوع. عد إلى علامة التبويب الأصلية أو انتظر حتى 15 دقيقة لانتهاء صلاحيته.',
    verifiedCancelError: 'تعذر إلغاء التحدي. ما زالت إجاباتك والرمز محفوظين في علامة التبويب هذه؛ أعد المحاولة قبل الإغلاق.',
    verifiedDiscardError: 'تعذر حذف المحاولة النشطة، ولم تُستبدل.',
    verifiedChallengeError: 'تعذّر بدء التحدي الذي يتحقق منه الخادم.',
    verifiedSubmitError: 'تعذّر على الخادم التحقق من هذه الإجابات.',
    verifiedTooFast: 'خذ وقتًا أطول قليلًا قبل الإرسال.',
    verifiedExpired: 'انتهت صلاحية هذا التحدي. ابدأ تحديًا جديدًا.',
    verifiedReplayed: 'تم إرسال هذا التحدي من قبل.',
    verifiedTampered: 'تغيّر التحدي ولا يمكن للخادم التحقق منه. ابدأ من جديد.',
    verifiedUnavailable: 'هذا الموضوع غير متاح حاليًا لحساب النتائج على الخادم.',
    globalSearchUnavailable: 'البحث غير متاح حاليًا.',
    installPrompt: '📲 أضف JAKH إلى شاشتك الرئيسية للوصول السريع',
    install: 'تثبيت',
    secondsShort: 'ث',
    streakFreezeLabel: '🧊 تجميد',
  }
};

const state = {
  lang: 'en',
  catalog: null,
  page: document.body.dataset.page || 'home',
  categorySlug: document.body.dataset.category || '',
  categoryData: null,
  directorySearch: '',
  cluster: 'all',
  search: '',
  difficulty: 'all',
  view: 'all',
  sort: 'featured',
  subcategory: 'all',
  apiAvailable: false,
  apiChecked: false,
  dbUser: null,
  accountAnalyticsAllowed: false,
  flipped: new Set(),
  cardPage: 1,
  streak: 0,
  freezeCount: 0,
  dailyCard: null,
  sharedCardHandled: false,
  storageDurable: true,
  capabilityMessage: '',
};

const timedQuizState = {
  cards: [], index: 0, score: 0, completed: 0, answered: false,
  timer: null, advanceTimeout: null, session: 0, timeLeft: 20,
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

const API_ERROR_UI_KEYS = Object.freeze({
  INVALID_CONTENT_TYPE: 'genericError',
  REQUEST_BODY_TOO_LARGE: 'genericError',
  INVALID_JSON: 'genericError',
  ORIGIN_NOT_ALLOWED: 'genericError',
  INVALID_CREDENTIALS: 'errorInvalidCredentials',
  RECOVERY_CREDENTIALS_INVALID: 'recoveryFailed',
  USERNAME_OR_EMAIL_EXISTS: 'errorUserExists',
  ACCOUNT_SUSPENDED: 'errorAccountSuspended',
  USERNAME_REQUIRED: 'errorUsernameRequired',
  USERNAME_INVALID: 'errorUsernameInvalid',
  PASSWORD_REQUIRED: 'errorPasswordRequired',
  CURRENT_PASSWORD_REQUIRED: 'errorPasswordRequired',
  NEW_PASSWORD_REQUIRED: 'errorPasswordRequired',
  PASSWORD_INVALID: 'errorPasswordInvalid',
  CURRENT_PASSWORD_INVALID: 'errorPasswordInvalid',
  NEW_PASSWORD_INVALID: 'errorPasswordInvalid',
  INVALID_EMAIL: 'errorEmailInvalid',
  RATE_LIMITED: 'errorRateLimited',
  UNAUTHORIZED: 'errorUnauthorized',
  CURRENT_PASSWORD_INCORRECT: 'errorCurrentPassword',
  NEW_PASSWORD_MUST_BE_DIFFERENT: 'errorNewPasswordDifferent',
  INVALID_AVATAR: 'errorInvalidAvatar',
  CARD_CATEGORY_MISMATCH: 'genericError',
  CARD_STATUS_MISMATCH: 'genericError',
  API_CONFIGURATION_INCOMPLETE: 'genericError',
  INVALID_CARD_ID: 'genericError',
  INVALID_CATEGORY_ID: 'genericError',
  INVALID_FAVORITE_ACTION: 'genericError',
  INVALID_SYNC_PAYLOAD: 'genericError',
  SYNC_LIMIT_EXCEEDED: 'genericError',
  INVALID_PROGRESS_ITEM: 'genericError',
  INVALID_FAVORITE_ITEM: 'genericError',
  INVALID_TIME_SPENT: 'genericError',
  SUGGESTION_REQUIRED: 'suggestError',
  SUGGESTION_INVALID: 'suggestError',
  ROOM_NOT_FOUND: 'errorRoomNotFound',
  INVALID_MESSAGE: 'errorInvalidMessage',
  JOIN_ROOM_FIRST: 'errorJoinFirst',
  BATTLE_ALREADY_STARTED: 'errorBattleStarted',
  ROOM_FULL: 'errorRoomFull',
  PLAYER_NAME_REQUIRED: 'errorPlayerNameRequired',
  BATTLE_ERROR: 'genericError',
  BATTLE_CREATE_FAILED: 'errorBattleCreate',
  BATTLE_ROOM_ALLOCATION_FAILED: 'errorBattleCreate',
  INVALID_CATEGORY: 'errorInvalidCategory',
  INVALID_VERIFIED_CHALLENGE: 'verifiedSubmitError',
  INVALID_SERVER_CHECKED_CHALLENGE: 'verifiedSubmitError',
  INVALID_VERIFIED_ANSWER: 'verifiedSubmitError',
  INVALID_SERVER_CHECKED_ANSWER: 'verifiedSubmitError',
  INVALID_VERIFIED_ANSWER_SET: 'verifiedAnswerAll',
  INVALID_SERVER_CHECKED_ANSWER_SET: 'verifiedAnswerAll',
  VERIFIED_CATEGORY_UNAVAILABLE: 'verifiedUnavailable',
  SERVER_CHECKED_CATEGORY_UNAVAILABLE: 'verifiedUnavailable',
  SERVER_CHECKED_CHALLENGE_ACTIVE: 'verifiedActive',
  QUESTION_SOURCE_UNAVAILABLE: 'verifiedChallengeError',
  QUESTION_SOURCE_INVALID: 'verifiedChallengeError',
  VERIFIED_CHALLENGE_NOT_FOUND: 'verifiedExpired',
  SERVER_CHECKED_CHALLENGE_NOT_FOUND: 'verifiedExpired',
  VERIFIED_CHALLENGE_REPLAYED: 'verifiedReplayed',
  SERVER_CHECKED_CHALLENGE_REPLAYED: 'verifiedReplayed',
  VERIFIED_CHALLENGE_EXPIRED: 'verifiedExpired',
  SERVER_CHECKED_CHALLENGE_EXPIRED: 'verifiedExpired',
  VERIFIED_CHALLENGE_TOO_FAST: 'verifiedTooFast',
  SERVER_CHECKED_CHALLENGE_TOO_FAST: 'verifiedTooFast',
  VERIFIED_CHALLENGE_TAMPERED: 'verifiedTampered',
  SERVER_CHECKED_CHALLENGE_TAMPERED: 'verifiedTampered',
  STORED_CHALLENGE_INVALID: 'verifiedSubmitError',
  INVALID_DIFFICULTY: 'errorInvalidDifficulty',
  CATEGORY_UNAVAILABLE: 'errorCategoryUnavailable',
  NO_QUESTIONS_AVAILABLE: 'errorNoQuestions',
  INVALID_ROOM_CODE: 'errorInvalidRoomCode',
  WEBSOCKET_UPGRADE_REQUIRED: 'errorBattleCreate',
  NOT_FOUND: 'genericError',
  INTERNAL_SERVER_ERROR: 'genericError',
});

function localizedErrorMessage(error, fallbackKey = 'genericError') {
  const key = API_ERROR_UI_KEYS[error?.code];
  if (key) return t(key);
  if (state.lang === 'en' && error?.message) return error.message;
  return t(fallbackKey);
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
  const requestOptions = { ...options, credentials: 'include' };
  const headers = new Headers(requestOptions.headers || {});
  headers.set('Accept', 'application/json');
  if (requestOptions.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  requestOptions.headers = headers;
  const method = String(requestOptions.method || 'GET').toUpperCase();
  const attempts = method === 'GET' ? 2 : 1;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const res = await fetch(`${API_URL}${endpoint}`, requestOptions);
      const contentType = res.headers.get('content-type') || '';
      const data = contentType.includes('application/json') ? await res.json() : {};
      if (!res.ok) {
        const error = new Error(data.error || `API request failed (${res.status})`);
        error.code = typeof data.code === 'string' ? data.code : `HTTP_${res.status}`;
        error.status = res.status;
        throw error;
      }
      const capabilityRecovered = state.apiChecked && !state.apiAvailable;
      state.apiAvailable = true;
      if (capabilityRecovered) applyCapabilityVisibility();
      return data;
    } catch (error) {
      if (attempt >= attempts || !isRetryableCloudError(error)) {
        if (isRetryableCloudError(error)) {
          state.apiAvailable = false;
          state.apiChecked = true;
          applyCapabilityVisibility();
        }
        throw error;
      }
      await new Promise(resolve => setTimeout(resolve, 250 * attempt));
    }
  }
  return {};
}

async function checkCloudSession() {
  const previousUser = state.dbUser;
  const previousUserId = previousUser?.id || null;
  const previousAnalyticsAllowed = state.accountAnalyticsAllowed;
  try {
    const session = await apiFetch('/auth/session');
    if (session?.authenticated !== true) {
      state.dbUser = null;
      state.accountAnalyticsAllowed = false;
      clearAllCloudMutations();
      return;
    }
    const data = await apiFetch('/user/profile');
    state.dbUser = data;
    if (previousUserId && previousUserId !== data?.id) clearAllCloudMutations();
    retainCloudMutationsForUser(data?.id);
    try {
      const preference = await apiFetch('/user/privacy');
      state.accountAnalyticsAllowed = preference?.privacy?.usageAnalyticsEnabled === true;
    } catch (error) {
      state.accountAnalyticsAllowed = isRetryableCloudError(error)
        ? previousAnalyticsAllowed
        : false;
    }
  } catch (error) {
    if (error?.status === 401 || error?.status === 403) {
      state.dbUser = null;
      state.accountAnalyticsAllowed = false;
      clearAllCloudMutations();
      return;
    }
    // A transient profile/session failure must not visually sign out an
    // identity that was already established. The next bounded recheck can
    // refresh it without destroying the current account view.
    state.dbUser = previousUser;
    state.accountAnalyticsAllowed = previousAnalyticsAllowed;
  }
}

function postAuthDestination() {
  const next = new URL(location.href).searchParams.get('next');
  if (!next) return '';
  try {
    const target = new URL(next, location.origin);
    if (target.origin !== location.origin) return '';
    if (target.pathname !== '/admin' && target.pathname !== '/admin.html') return '';
    return `${target.pathname}${target.search}${target.hash}`;
  } catch (_) {
    return '';
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

async function detectApiAvailability(attempts = 2) {
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2500);
    try {
      const response = await fetch(`${API_URL}/health`, {
        cache: 'no-store',
        headers: { Accept: 'application/json' },
        signal: controller.signal,
      });
      if (response.ok && response.headers.get('content-type')?.includes('application/json')) {
        const payload = await response.json();
        if (payload?.ok === true) return true;
      }
    } catch (_) {
      // A health probe is advisory. Individual controls still make their own request.
    } finally {
      clearTimeout(timeout);
    }
    if (attempt < attempts) await new Promise(resolve => setTimeout(resolve, 350 * attempt));
  }
  return false;
}

function applyCapabilityVisibility() {
  const apiUnavailable = state.apiChecked && !state.apiAvailable;
  document.body.classList.toggle('api-unavailable', apiUnavailable);
  const capabilityControls = [els.openAuthBtn, els.heroAuthBtn, document.getElementById('leaderboardBtn'), document.getElementById('battleNavBtn'), document.getElementById('bnProfileBtn')]
    .filter(Boolean)
  capabilityControls.forEach(element => {
    element.hidden = false;
    if (apiUnavailable) element.setAttribute('aria-describedby', 'cloudCapabilityStatus');
    else element.removeAttribute('aria-describedby');
  });
  let status = document.getElementById('cloudCapabilityStatus');
  if (apiUnavailable && !status) {
    status = document.createElement('p');
    status.id = 'cloudCapabilityStatus';
    status.className = 'cloud-capability-status shell';
    status.setAttribute('role', 'status');
    document.querySelector('.site-header')?.insertAdjacentElement('afterend', status);
  }
  if (status) {
    status.textContent = apiUnavailable
      ? (state.lang === 'ar'
          ? 'تعذر الوصول مؤقتًا إلى خدمات الحساب واللوحة والغرفة المباشرة. تبقى الأدوات متاحة لإعادة المحاولة، ويستمر المحتوى المحلي بالعمل.'
          : 'Account, leaderboard, and live Battle Room services are temporarily unreachable. Controls remain available to retry, and local content still works.')
      : '';
    status.hidden = !apiUnavailable;
  }
}

const storageMemory = Object.freeze({ local: new Map(), session: new Map() });

function safeStorageGet(area, key) {
  const memory = storageMemory[area];
  try {
    const value = window[`${area}Storage`].getItem(key);
    if (value !== null) memory.set(key, value);
    return value !== null ? value : (memory.has(key) ? memory.get(key) : null);
  } catch (_) {
    state.storageDurable = false;
    return memory.has(key) ? memory.get(key) : null;
  }
}

function safeStorageSet(area, key, value) {
  const serialized = String(value);
  storageMemory[area].set(key, serialized);
  try {
    window[`${area}Storage`].setItem(key, serialized);
    return true;
  } catch (_) {
    state.storageDurable = false;
    return false;
  }
}

function safeStorageRemove(area, key) {
  storageMemory[area].delete(key);
  try {
    window[`${area}Storage`].removeItem(key);
    return true;
  } catch (_) {
    state.storageDurable = false;
    return false;
  }
}

function saveJson(key, value) {
  return safeStorageSet('local', key, JSON.stringify(value));
}

function loadJson(key, fallback) {
  try {
    const raw = safeStorageGet('local', key);
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
    else safeStorageRemove('local', GUEST_KEYS.solved);
    if (remainingFavs.size) saveJson(GUEST_KEYS.favorites, [...remainingFavs]);
    else safeStorageRemove('local', GUEST_KEYS.favorites);
  }
  safeStorageRemove('local', GUEST_KEYS.solved);
  safeStorageRemove('local', GUEST_KEYS.favorites);
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
const CLOUD_QUEUE_MAX = 100;
const CLOUD_QUEUE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const CLOUD_QUEUE_MAX_ATTEMPTS = 5;

function isRetryableCloudError(error) {
  const status = Number(error?.status);
  return !Number.isFinite(status) || status === 408 || status === 425 || status === 429 || status >= 500;
}

function cloudQueueBackoffMs(attempts) {
  return Math.min(60 * 60 * 1000, 5_000 * (2 ** Math.max(0, attempts - 1)));
}

function loadCloudQueue() {
  const queue = loadJson(CLOUD_QUEUE_KEY, []);
  return Array.isArray(queue) ? queue : [];
}

function saveCloudQueue(items) {
  if (items.length) saveJson(CLOUD_QUEUE_KEY, items);
  else safeStorageRemove('local', CLOUD_QUEUE_KEY);
}

function queueCloudMutation(userId, key, endpoint, method, body, previous = null) {
  if (!userId) return false;
  const now = Date.now();
  const queue = loadCloudQueue().filter(item => item.userId === userId && item.key !== key);
  const attempts = Math.min(CLOUD_QUEUE_MAX_ATTEMPTS, Number(previous?.attempts || 0) + 1);
  queue.push({
    key, userId, endpoint, method, body,
    createdAt: Number(previous?.createdAt || now),
    attempts,
    nextAttemptAt: now + cloudQueueBackoffMs(attempts),
  });
  saveCloudQueue(queue.slice(-CLOUD_QUEUE_MAX));
  return true;
}

function clearCloudMutation(userId, key) {
  if (!userId) return;
  saveCloudQueue(loadCloudQueue().filter(item => item.key !== key || item.userId !== userId));
}

const cloudMutationChains = new Map();

async function dispatchCloudMutation(userId, key, endpoint, method, body) {
  if (!userId || state.dbUser?.id !== userId) {
    return { synced: false, retryQueued: false, staleUser: true };
  }
  try {
    await apiFetch(endpoint, { method, body: JSON.stringify(body) });
    clearCloudMutation(userId, key);
    return { synced: true, retryQueued: false };
  } catch (error) {
    const retryQueued = isRetryableCloudError(error) && state.dbUser?.id === userId
      ? queueCloudMutation(userId, key, endpoint, method, body)
      : false;
    return { synced: false, retryQueued, error };
  }
}

function sendCloudMutation(key, endpoint, method, body) {
  const userId = state.dbUser?.id;
  if (!userId) return Promise.resolve({ synced: false, retryQueued: false, staleUser: true });
  const chainKey = `${userId}:${key}`;
  const previous = cloudMutationChains.get(chainKey) || Promise.resolve();
  const task = previous
    .catch(() => undefined)
    .then(() => dispatchCloudMutation(userId, key, endpoint, method, body));
  cloudMutationChains.set(chainKey, task);
  void task.finally(() => {
    if (cloudMutationChains.get(chainKey) === task) cloudMutationChains.delete(chainKey);
  });
  return task;
}

async function flushCloudQueue() {
  if (!state.dbUser || !navigator.onLine) return;
  const pending = loadCloudQueue();
  if (!pending.length) return;
  const now = Date.now();
  const remaining = [];
  for (const item of pending) {
    if (item.userId !== state.dbUser.id) continue;
    if (!Number.isFinite(item.createdAt) || now - item.createdAt > CLOUD_QUEUE_MAX_AGE_MS) continue;
    if (Number(item.attempts || 0) >= CLOUD_QUEUE_MAX_ATTEMPTS) continue;
    if (Number(item.nextAttemptAt || 0) > now) { remaining.push(item); continue; }
    try {
      await apiFetch(item.endpoint, { method: item.method, body: JSON.stringify(item.body) });
    } catch (error) {
      if (isRetryableCloudError(error)) {
        const attempts = Number(item.attempts || 0) + 1;
        if (attempts < CLOUD_QUEUE_MAX_ATTEMPTS) {
          remaining.push({ ...item, attempts, nextAttemptAt: now + cloudQueueBackoffMs(attempts) });
        }
      }
    }
  }
  saveCloudQueue(remaining.slice(-CLOUD_QUEUE_MAX));
}

function clearAllCloudMutations() {
  saveCloudQueue([]);
}

function retainCloudMutationsForUser(userId) {
  if (!userId) { clearAllCloudMutations(); return; }
  saveCloudQueue(loadCloudQueue().filter(item => item.userId === userId).slice(-CLOUD_QUEUE_MAX));
}

function cloudMutationStatusMessage(result) {
  if (result.retryQueued) {
    if (!state.storageDurable) {
      return state.lang === 'ar'
        ? 'التغيير ظاهر الآن، لكن إعادة المحاولة محفوظة لهذا العرض فقط لأن التخزين الدائم محظور'
        : 'Change is visible now; retry is held for this view only because durable storage is blocked';
    }
    return state.lang === 'ar'
      ? 'التغيير ظاهر الآن وستُعاد محاولة المزامنة السحابية'
      : 'Change is visible now — cloud sync will retry';
  }
  return state.lang === 'ar'
    ? 'التغيير ظاهر الآن، لكن الخادم رفضه ولن يُعاد تلقائيًا'
    : 'Change is visible now, but the server rejected it so it will not retry automatically';
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

function getCorrectCountByDifficulty(diff, categoryId = null) {
  if (state.dbUser) {
    return (state.dbUser.progress || []).filter(p =>
      p.status === diff && (!categoryId || p.categoryId === categoryId)
    ).length;
  }
  const raw = getGuestSolvedMap();
  const activeCardIds = categoryId && state.categoryData?.slug === categoryId
    ? new Set((state.categoryData.cards || []).map(card => card.id))
    : null;
  return Object.entries(raw).filter(([cardId, value]) => {
    if (_guestStatus(value) !== diff) return false;
    if (!categoryId) return true;
    if (activeCardIds) return activeCardIds.has(cardId);
    return typeof value === 'object' && value !== null && value.categoryId === categoryId;
  }).length;
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
  try { return new Set(JSON.parse(safeStorageGet('local', STORAGE_KEYS.trial)) || []); } catch { return new Set(); }
}
function saveTrialUsedSet(s) {
  return safeStorageSet('local', STORAGE_KEYS.trial, JSON.stringify([...s]));
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
      if (s.size >= 10) {
        const focusRequest = captureCardFocus(id, ['flip']);
        renderCards(focusRequest);
      } else {
        updateCardEl(id, ['flip']);
      }
      return;
    }
  }
  const wasFlipped = state.flipped.has(id);
  if (wasFlipped) state.flipped.delete(id); else state.flipped.add(id);
  if (!wasFlipped) trackEvent('card_flip', { category: state.categorySlug, card_id: id });
  updateCardEl(id, ['flip']);
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

function clearToast() {
  if (!els.toast) return;
  clearTimeout(showToast.timer);
  els.toast.textContent = '';
  els.toast.classList.remove('is-visible', 'is-error');
}

function applyDocumentLanguage() {
  const nextLang = state.lang === 'ar' ? 'ar' : 'en';
  const languageChanged = document.documentElement.lang !== nextLang;
  document.documentElement.lang = nextLang;
  document.documentElement.dir = nextLang === 'ar' ? 'rtl' : 'ltr';
  if (els.langSelect) els.langSelect.value = state.lang;
  if (languageChanged) {
    document.dispatchEvent(new CustomEvent('jakh:languagechange', {
      detail: { language: nextLang },
    }));
  }
}

function applyCategoryShellCopy() {
  if (state.page !== 'category') return;
  const breadcrumb = document.querySelector('.page-breadcrumb');
  if (breadcrumb) {
    breadcrumb.setAttribute('aria-label', t('breadcrumbLabel'));
    const links = breadcrumb.querySelectorAll('a');
    if (links[0]) links[0].textContent = t('breadcrumbHome');
    if (links[1]) links[1].textContent = t('breadcrumbMindLab');
    if (links[2] && state.categoryData?.cluster) {
      links[2].textContent = state.categoryData.cluster[state.lang] || state.categoryData.cluster.en;
    }
    breadcrumb.querySelectorAll('[aria-hidden="true"]').forEach((separator) => {
      separator.textContent = state.lang === 'ar' ? '‹' : '›';
    });
  }

  const standards = document.querySelector('.content-standards-note');
  if (standards) {
    if (!standards.dataset.standardsVariant) {
      standards.dataset.standardsVariant = standards.querySelector('strong') ? 'education' : 'default';
    }
    const href = standards.querySelector('a')?.getAttribute('href') || '/about#standards';
    standards.innerHTML = standards.dataset.standardsVariant === 'education'
      ? `<strong>${escapeHtml(t('standardsEducationLabel'))}</strong> ${escapeHtml(t('standardsEducationText'))} <a href="${escapeHtml(href)}">${escapeHtml(t('standardsEducationLink'))}</a>`
      : `${escapeHtml(t('standardsDefaultText'))} <a href="${escapeHtml(href)}">${escapeHtml(t('standardsDefaultLink'))}</a>`;
  }
}

function applyRuntimeAccessibilityCopy() {
  document.querySelector('.skip-link')?.replaceChildren(document.createTextNode(t('skipMain')));
  document.querySelector('.brand')?.setAttribute('aria-label', t('brandHomeLabel'));
  document.querySelector('.header-actions')?.setAttribute('aria-label', t('quickActionsLabel'));
  document.querySelector('.header-selects')?.setAttribute('aria-label', t('languageControlsLabel'));
  document.getElementById('clusterTabBar')?.setAttribute('aria-label', t('categorySectionsLabel'));
  const controlPanel = document.querySelector('.control-panel');
  if (controlPanel) {
    controlPanel.setAttribute(
      'aria-label',
      state.page === 'category' ? t('questionFiltersLabel') : t('categoryFiltersLabel'),
    );
  }
  document.querySelectorAll('button[data-close-modal="auth"]').forEach((button) => {
    button.setAttribute('aria-label', t('close'));
  });
  document.querySelector('.kv-hero-title .sr-only')?.replaceChildren(document.createTextNode(` ${t('homeSrTitle')}`));
  document.getElementById('leaderboardBtn')?.setAttribute('aria-label', t('leaderboardTitle'));
  document.getElementById('battleNavBtn')?.setAttribute('aria-label', t('teamBattle'));
  document.getElementById('globalSearchBtn')?.setAttribute('aria-label', t('search'));
  document.getElementById('hamburgerBtn')?.setAttribute('aria-label', t('menu'));
  document.querySelectorAll('a[href*="instagram.com"]').forEach((link) => {
    link.setAttribute('aria-label', t('socialInstagramLabel'));
  });
  document.querySelectorAll('a[href*="facebook.com"]').forEach((link) => {
    link.setAttribute('aria-label', t('socialFacebookLabel'));
  });
}

function applyStaticCopy() {
  document.querySelectorAll('[data-i18n]').forEach((node) => {
    const key = node.dataset.i18n;
    node.textContent = t(key);
  });
  document.querySelectorAll('[data-i18n-aria-label]').forEach((node) => {
    node.setAttribute('aria-label', t(node.dataset.i18nAriaLabel));
  });
  document.querySelectorAll('[data-i18n-placeholder]').forEach((node) => {
    node.setAttribute('placeholder', t(node.dataset.i18nPlaceholder));
  });
  document.querySelectorAll('[data-i18n-title]').forEach((node) => {
    node.setAttribute('title', t(node.dataset.i18nTitle));
  });
  document.querySelectorAll('[data-href-en][data-href-ar]').forEach((node) => {
    node.setAttribute('href', state.lang === 'ar' ? node.dataset.hrefAr : node.dataset.hrefEn);
  });
  localizeSharedRuntimeLinks();
  if (els.categorySearchInput) {
    els.categorySearchInput.placeholder = t('searchPlaceholder');
    els.categorySearchInput.setAttribute('aria-label', t('searchCategoriesLabel'));
  }
  if (els.cardSearchInput) {
    els.cardSearchInput.placeholder = t('cardSearchPlaceholder');
  }
  if (els.openAuthBtn) {
    const account = getActiveUser();
    els.openAuthBtn.textContent = account ? account.username : t('authOpen');
  }
  syncAdminEntry();
  applyCategoryShellCopy();
  applyRuntimeAccessibilityCopy();
  updateSelectLabels();
  updateDocumentTitle();
  updateBottomNavActive();
}

function syncAdminEntry() {
  const nav = document.querySelector('.header-actions');
  if (!nav) return;
  const isAdmin = state.dbUser?.role === 'ADMIN' || state.dbUser?.role === 'OWNER';
  const existing = document.getElementById('adminNavBtn');
  if (!isAdmin) {
    existing?.remove();
    return;
  }
  const link = existing || document.createElement('a');
  link.id = 'adminNavBtn';
  link.className = 'ghost-btn admin-nav-btn';
  link.href = `/admin${state.lang === 'ar' ? '?lang=ar' : ''}`;
  link.textContent = `🛡 ${t('adminConsole')}`;
  link.setAttribute('aria-label', t('adminConsoleAria'));
  link.title = t('adminConsole');
  if (!existing) nav.insertBefore(link, els.openAuthBtn || null);
}

function updateDocumentTitle() {
  let title = '';
  let description = '';

  if (state.page === 'play') {
    title = state.lang === 'ar'
      ? '10 ألعاب مجانية على المتصفح | JAKH'
      : '10 Free Browser Games | JAKH';
    description = state.lang === 'ar'
      ? 'العب 10 ألعاب متصفح مجانية على JAKH: الشطرنج وغو وريفيرسي وماسترمايند وكاتان لايت وطاولة الزهر وسِت وهانابي وكودنيمز ودبلوماسي.'
      : 'Play 10 free browser games on JAKH: Chess, Go, Reversi, Mastermind, Catan Lite, Backgammon, SET, Hanabi, Codenames, and Diplomacy.';
  } else if (state.page === 'home') {
    const route = sharedLanguageRoute();
    if (route?.en === '/mind-lab') {
      title = state.lang === 'ar'
        ? 'مختبر العقل: 56 موضوع ألغاز وأسئلة | JAKH'
        : 'Mind Lab: 56 Riddle & Quiz Topics | JAKH';
      description = state.lang === 'ar'
        ? 'استكشف 3,553 لغزاً واختباراً ثنائي اللغة موزعة مباشرة على 56 موضوعاً ضمن 5 أقسام واضحة. اختر موضوعاً واقلب البطاقات وتابع نتيجتك.'
        : 'Explore 3,553 bilingual riddles and quizzes mapped directly to 56 topics in 5 clear sections. Pick a topic, flip cards, and track your score.';
    } else {
      title = state.lang === 'ar'
        ? 'JAKH: ألغاز واختبارات مجانية بالعربية والإنجليزية'
        : 'JAKH Riddles: Free Arabic & English Quizzes';
      description = state.lang === 'ar'
        ? 'العب 3,553 لغزاً واختباراً مجانياً بالعربية والإنجليزية ضمن 56 موضوعاً، إضافة إلى 10 ألعاب متصفح. اكشف الإجابات وتابع نتيجتك.'
        : 'Play 3,553 free bilingual riddles and quizzes in English and Arabic across 56 topics, plus 10 browser games. Reveal answers and track your score.';
    }
  } else if (state.categoryData) {
    const category = state.categoryData;
    title = state.lang === 'ar'
      ? `${state.categoryData.title.ar}: اختبار وأسئلة | JAKH`
      : `${state.categoryData.title.en} Quiz & Questions | JAKH`;
    const localizedCount = Number(category.count || 0).toLocaleString(state.lang === 'ar' ? 'ar' : 'en-US');
    description = state.lang === 'ar'
      ? `جرّب ${localizedCount} سؤالاً واختباراً في ${category.title.ar} مع الإجابات بالعربية والإنجليزية. ${category.description.ar} العب مجاناً وتابع نتيجتك.`
      : `Try ${localizedCount} ${category.title.en} quiz questions with answers in English and Arabic. ${category.description.en} Play free and track your score.`;
  }

  if (!title) return;
  document.title = title;

  const socialImageAlt = state.lang === 'ar'
    ? 'JAKH — 3,553 لغزاً ثنائي اللغة ضمن 56 موضوعاً و10 ألعاب'
    : 'JAKH — 3,553 bilingual riddles across 56 topics and 10 games';
  [
    ['meta[name="description"]', description],
    ['meta[property="og:title"]', title],
    ['meta[property="og:description"]', description],
    ['meta[name="twitter:title"]', title],
    ['meta[name="twitter:description"]', description],
    ['meta[property="og:image:alt"]', socialImageAlt],
    ['meta[name="twitter:image:alt"]', socialImageAlt],
    ['meta[property="og:locale"]', state.lang === 'ar' ? 'ar_AE' : 'en_US'],
  ].forEach(([selector, content]) => {
    document.querySelector(selector)?.setAttribute('content', content);
  });
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
    stopAnalyticsHeartbeat();
    showToast(state.lang === 'ar' ? 'أنت تعمل حالياً بدون اتصال — قد لا تتوفر بعض الميزات' : 'You are currently offline — some features may be limited', 'warning');
  } else if (sessionInitialized && event?.type === 'online') {
    state.apiAvailable = await detectApiAvailability(2);
    state.apiChecked = true;
    if (state.apiAvailable) {
      await checkCloudSession();
      if (state.dbUser) {
        await flushCloudQueue();
        await mergeGuestProgress();
        await checkCloudSession();
        await loadStreak();
      }
    }
    hydrateCloudFeatureUi();
  }
}

let capabilityRecheckInFlight = null;
async function recheckCloudCapabilities() {
  if (!navigator.onLine || capabilityRecheckInFlight) return capabilityRecheckInFlight;
  capabilityRecheckInFlight = (async () => {
    state.apiAvailable = await detectApiAvailability(2);
    state.apiChecked = true;
    if (state.apiAvailable) await checkCloudSession();
    hydrateCloudFeatureUi();
  })().finally(() => { capabilityRecheckInFlight = null; });
  return capabilityRecheckInFlight;
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
    'suggestionText', 'suggestionEmail', 'suggestionLinkAccount', 'suggestionSubmit', 'suggestionThanks', 'suggestionForm',
  ].forEach((id) => { els[id] = document.getElementById(id); });
}

const APP_VERSION = '3.0';
function flushStaleStorage() {
  const stored = safeStorageGet('local', 'jakh-app-version');
  if (stored !== null && stored !== APP_VERSION) {
    const staleKeys = ['jakh-catalog-cache', 'jakh-cluster-cache', 'jakh-home-state'];
    staleKeys.forEach(k => { safeStorageRemove('local', k); safeStorageRemove('session', k); });
    safeStorageSet('local', 'jakh-app-version', APP_VERSION);
    return;
  }
  if (stored === null) safeStorageSet('local', 'jakh-app-version', APP_VERSION);
}

function initializeFromStorage() {
  flushStaleStorage();
  const settings = loadJson(STORAGE_KEYS.settings, {});
  const entryUrl = new URL(window.location.href);
  const requestedLang = entryUrl.searchParams.get('lang');
  const explicitLang = requestedLang === 'en' || requestedLang === 'ar' ? requestedLang : '';
  const sharedRouteLang = sharedLanguageRoute(entryUrl.pathname)?.lang || '';
  const routeLang = document.body.dataset.routeLang === 'ar' || document.body.dataset.routeLang === 'en'
    ? document.body.dataset.routeLang
    : sharedRouteLang;
  const storedLang = settings.lang === 'ar' || settings.lang === 'en' ? settings.lang : 'en';

  if (explicitLang && routeLang && explicitLang !== routeLang) {
    entryUrl.searchParams.delete('lang');
    const languagePath = state.page === 'category' && state.categorySlug
      ? categoryRouteForLanguage(state.categorySlug, explicitLang)
      : sharedRouteForLanguage(entryUrl.pathname, explicitLang);
    if (!languagePath) return true;
    const target = `${languagePath}${entryUrl.search}${entryUrl.hash}`;
    saveJson(STORAGE_KEYS.settings, { lang: explicitLang });
    location.replace(target);
    return false;
  }

  state.lang = routeLang || explicitLang || storedLang;

  if (explicitLang) {
    entryUrl.searchParams.delete('lang');
    history.replaceState(
      history.state,
      '',
      `${entryUrl.pathname}${entryUrl.search}${entryUrl.hash}`,
    );
  }

  // Persist explicit entry-language links and purge the retired theme preference.
  if (explicitLang) {
    saveSettings();
  } else if (settings.theme || settings.lang !== state.lang) {
    saveJson(STORAGE_KEYS.settings, { lang: state.lang });
  }
  state.audioEnabled = safeStorageGet('local', STORAGE_KEYS.audio) !== 'false';
  return true;
}

const INSTALL_PROMPT_DISMISSAL_KEY = 'jakh-install-dismissed';
const INSTALL_PROMPT_DISMISSAL_TTL_MS = 30 * 24 * 60 * 60 * 1000;

function installPromptIsSuppressed(now = Date.now()) {
  const raw = safeStorageGet('local', INSTALL_PROMPT_DISMISSAL_KEY);
  if (!raw) return false;
  try {
    const record = JSON.parse(raw);
    const dismissedAt = Number(record?.dismissedAt);
    if (Number.isFinite(dismissedAt) && dismissedAt > 0 && now - dismissedAt < INSTALL_PROMPT_DISMISSAL_TTL_MS) {
      return true;
    }
  } catch {
    // Retired boolean values had no reset date, so they must not suppress the
    // prompt forever after this policy ships.
  }
  safeStorageRemove('local', INSTALL_PROMPT_DISMISSAL_KEY);
  return false;
}

function suppressInstallPrompt(reason = 'dismissed') {
  safeStorageSet('local', INSTALL_PROMPT_DISMISSAL_KEY, JSON.stringify({
    dismissedAt: Date.now(),
    reason,
  }));
}

let _installPrompt = null;
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  _installPrompt = e;
  if (!installPromptIsSuppressed()) {
    showInstallBanner();
  }
});

function refreshFixedUiLayout() {
  window.JakhFixedUi?.refresh();
}

function removeInstallBanner() {
  document.getElementById('installBanner')?.remove();
  document.body.classList.remove('install-banner-visible');
  refreshFixedUiLayout();
}

function showInstallBanner() {
  if (
    !_installPrompt
    || document.getElementById('installBanner')
    || document.getElementById('privacyConsentBanner')
  ) return;
  const banner = document.createElement('div');
  banner.id = 'installBanner';
  banner.className = 'install-banner';
  banner.setAttribute('role', 'region');
  banner.setAttribute('aria-labelledby', 'installBannerText');
  banner.innerHTML = `
    <span id="installBannerText">${escapeHtml(t('installPrompt'))}</span>
    <div class="install-banner-actions">
      <button type="button" class="primary-btn install-banner-btn" id="installAcceptBtn">${escapeHtml(t('install'))}</button>
      <button type="button" class="ghost-btn install-banner-close" id="installDismissBtn" aria-label="${escapeHtml(t('close'))}">✕</button>
    </div>
  `;
  document.body.appendChild(banner);
  document.body.classList.add('install-banner-visible');
  refreshFixedUiLayout();
  document.getElementById('installAcceptBtn')?.addEventListener('click', async () => {
    if (!_installPrompt) return;
    _installPrompt.prompt();
    const { outcome } = await _installPrompt.userChoice;
    _installPrompt = null;
    removeInstallBanner();
    if (outcome === 'accepted') suppressInstallPrompt('accepted');
  });
  document.getElementById('installDismissBtn')?.addEventListener('click', () => {
    suppressInstallPrompt('dismissed');
    removeInstallBanner();
  });
}

document.addEventListener('jakh:consentchange', () => {
  refreshFixedUiLayout();
  if (_installPrompt && !installPromptIsSuppressed()) showInstallBanner();
});

window.addEventListener('appinstalled', () => {
  _installPrompt = null;
  removeInstallBanner();
});

let authModalMode = 'signin';

function refreshLocalizedTransientUi() {
  const installBanner = document.getElementById('installBanner');
  if (installBanner) {
    removeInstallBanner();
    showInstallBanner();
  }

  const leaderboardModal = document.getElementById('leaderboardModal');
  const leaderboardWasOpen = Boolean(leaderboardModal && !leaderboardModal.classList.contains('hidden'));
  if (leaderboardModal) {
    releaseFocus(leaderboardModal);
    leaderboardModal.remove();
  }
  if (leaderboardWasOpen) void openLeaderboard();

  const searchOverlay = document.getElementById('globalSearchOverlay');
  if (searchOverlay) {
    const searchWasOpen = !searchOverlay.classList.contains('hidden');
    const searchValue = document.getElementById('globalSearchInput')?.value || '';
    releaseFocus(searchOverlay);
    searchOverlay.remove();
    _searchLeaderboard?.resetTransientUi();
    if (searchWasOpen) {
      void openGlobalSearch(searchValue);
    }
  }

  if (
    els.authModal
    && !els.authModal.classList.contains('hidden')
    && authModalMode !== 'recovery-receipt'
  ) {
    renderAuthModal(authModalMode);
  }
  const paywall = document.getElementById('paywallModal');
  if (paywall && !paywall.classList.contains('hidden')) openPaywallModal();
  const categoryComplete = document.getElementById('categoryCompleteModal');
  if (categoryComplete && !categoryComplete.classList.contains('hidden') && categoryComplete.dataset.categorySlug) {
    showCategoryCompleteModal(categoryComplete.dataset.categorySlug);
  }
  const battle = document.getElementById('battleOverlay');
  if (battle && !battle.classList.contains('hidden')) renderBattleUI();
}

let globalEventsBound = false;

function bindCommonEvents() {
  if (els.langSelect) {
    els.langSelect.addEventListener('change', () => {
      state.lang = els.langSelect.value;
      trackEvent('language_switch', { language: state.lang, page_type: state.page });
      saveSettings();
      if (state.page === 'category' && state.categorySlug) {
        const nextUrl = new URL(categoryRouteForLanguage(state.categorySlug, state.lang), location.origin);
        const currentUrl = new URL(location.href);
        currentUrl.searchParams.delete('lang');
        nextUrl.search = currentUrl.search;
        nextUrl.hash = currentUrl.hash;
        location.assign(`${nextUrl.pathname}${nextUrl.search}${nextUrl.hash}`);
        return;
      }
      const sharedPath = sharedRouteForLanguage(location.pathname, state.lang);
      if (sharedPath) {
        const currentUrl = new URL(location.href);
        currentUrl.searchParams.delete('lang');
        location.assign(`${sharedPath}${currentUrl.search}${currentUrl.hash}`);
        return;
      }
      applyDocumentLanguage();
      applyStaticCopy();
      rerender();
      clearTimedQuizTimers();
      const timedOverlay = document.getElementById('timedQuizOverlay');
      if (timedOverlay) { releaseFocus(timedOverlay, { discard: true }); timedOverlay.remove(); }
      createTimedQuizModal();
      renderCategoryPlayModes();
      injectBackToTop();
      refreshLocalizedTransientUi();
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
      btn.setAttribute('aria-label', t('leaderboardTitle'));
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
      btn.setAttribute('aria-label', t('teamBattle'));
      nav.insertBefore(btn, nav.children[2]);
    }
  }
  document.getElementById('battleNavBtn')?.addEventListener('click', () => openBattleModal(state.categorySlug, 'create'));


  // Handle #battle/CODE deep-link
  const hashMatch = location.hash.match(/^#battle\/([A-Z0-9-]+)$/i);
  if (hashMatch) {
    const code = normalizeBattleCode(hashMatch[1]);
    if (BATTLE_CODE_PATTERN.test(code)) {
      openBattleModal('', 'join', code);
    }
  }

  // Inject global search button into nav
  if (!document.getElementById('globalSearchBtn')) {
    const nav = document.querySelector('.header-actions');
    if (nav) {
      const btn = document.createElement('button');
      btn.id = 'globalSearchBtn';
      btn.className = 'ghost-btn';
      btn.setAttribute('aria-label', t('search'));
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
      hbtn.setAttribute('aria-label', t('menu'));
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
    }
  }

  const randomBtn = document.getElementById('randomCategoryBtn');
  if (randomBtn) randomBtn.addEventListener('click', randomCategory);

  if (!globalEventsBound) {
    const closeOpenMobileNav = (event) => {
      const nav = document.querySelector('.header-actions');
      const button = document.getElementById('hamburgerBtn');
      if (!nav?.classList.contains('nav-open') || !button) return;
      if (!nav.contains(event.target) && !button.contains(event.target)) {
        nav.classList.remove('nav-open');
        button.setAttribute('aria-expanded', 'false');
      }
    };
    document.addEventListener('click', closeOpenMobileNav);
    document.addEventListener('touchstart', closeOpenMobileNav, { passive: true });

    document.addEventListener('click', (event) => {
      const closeTarget = event.target.closest('[data-close-modal]');
      if (closeTarget) {
        const name = closeTarget.dataset.closeModal;
        closeModal(name);
      }
      const socialLink = event.target.closest('a.social-link');
      if (socialLink) {
        trackEvent('social_outbound', {
          platform: socialLink.href.includes('instagram.com') ? 'instagram' : 'facebook',
          link_url: socialLink.href,
        });
      }
    });

    window.addEventListener('online', handleOfflineStatus);
    window.addEventListener('offline', handleOfflineStatus);
    window.addEventListener('focus', () => { void recheckCloudCapabilities(); });
    handleOfflineStatus();

    globalEventsBound = true;
  }

  if (els.resetDirectoryBtn) {
    els.resetDirectoryBtn.addEventListener('click', () => {
      state.directorySearch = '';
      state.cluster = 'all';
      if (els.categorySearchInput) els.categorySearchInput.value = '';
      renderClusterTabBar();
      renderCategoryDirectory();
      showToast(t('directoryResetDone'));
    });
  }
  if (els.categorySearchInput) {
    els.categorySearchInput.addEventListener('input', debounce(() => {
      state.directorySearch = els.categorySearchInput.value.trim().toLowerCase();
      renderClusterTabBar();
      renderCategoryDirectory();
      if (state.directorySearch) {
        trackEvent('search', { search_term: state.directorySearch, search_scope: 'directory' });
      }
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
      clearCategoryFilterParams();
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
      if (state.search) {
        trackEvent('search', {
          search_term: state.search,
          search_scope: 'category',
          category: state.categorySlug,
        });
      }
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
      if (event.target.closest('.card-review-sources a')) return;
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
  if (els.badgeCategories) els.badgeCategories.textContent = state.catalog.categories.length;
  if (els.badgeQuestions) els.badgeQuestions.textContent = state.catalog.site.totalQuestions.toLocaleString();
  renderAccountSummary(els.accountSummaryMount);
  renderDailyChallenge();
  renderClusterTabBar();
  renderCategoryDirectory();
  markCachedCategories();
}

function getCategoryMap() {
  return new Map((state.catalog?.categories || []).map(category => [category.slug, category]));
}

function getDirectorySections() {
  const categoryMap = getCategoryMap();
  return (state.catalog?.sections || []).map(section => {
    const categories = section.members.map(slug => categoryMap.get(slug)).filter(Boolean);
    return {
      ...section,
      categories,
      categoryCount: categories.length,
      count: categories.reduce((total, category) => total + Number(category.count || 0), 0),
    };
  }).filter(section => section.categoryCount > 0);
}

function createDirectorySectionMarkup(section) {
  const isAr = state.lang === 'ar';
  const title = escapeHtml(section.title[state.lang] || section.title.en);
  const description = escapeHtml(section.description[state.lang] || section.description.en);
  const categoryLabel = isAr ? `${section.categoryCount} موضوعًا` : `${section.categoryCount} topics`;
  const questionLabel = isAr ? `${section.count} سؤال` : `${section.count} questions`;
  return `
    <section class="directory-section-header" style="--section-gradient:${escapeHtml(section.gradient)};--section-accent:${escapeHtml(section.accent)};">
      <span class="directory-section-mark" aria-hidden="true">${escapeHtml(section.mark)}</span>
      <div>
        <h3>${title}</h3>
        <p>${description}</p>
      </div>
      <p class="directory-section-count">${categoryLabel} · ${questionLabel}</p>
    </section>
  `;
}

function setDirectoryResultsLabel(text) {
  if (els.directoryResultsLabel) els.directoryResultsLabel.textContent = text;
}

function createCategoryCardMarkup(meta) {
  const color = CATEGORY_COLORS[meta.slug] || '#E8613C';
  const isAr = state.lang === 'ar';
  const title = escapeHtml(meta.title[state.lang]);
  const image = categoryArtUrl(meta);
  const topicLabels = (meta.topics || [])
    .slice(0, 3)
    .map(topic => escapeHtml(topic[state.lang] || topic.en))
    .filter(Boolean);
  const topicMarkup = topicLabels.length
    ? `<p class="category-card-topics">${topicLabels.join(' · ')}</p>`
    : '';
  const prog = getCategoryProgress(meta.slug);
  const progressLine = prog.pct > 0
    ? `<div class="card-progress-bar" style="width:${prog.pct}%;background:${color}" aria-hidden="true"></div>`
    : '';
  const doneLabel = prog.pct > 0 ? ` · ${prog.pct}% ${isAr ? 'مكتمل' : 'done'}` : '';
  const enterLabel = isAr ? 'افتح' : 'Enter';
  const cardCountLabel = isAr ? `${meta.count} سؤال` : `${meta.count} Q`;
  return `
    <a class="category-card has-art" href="${escapeHtml(categoryRouteForLanguage(meta.slug, state.lang))}" aria-label="${title}">
      <div class="category-card-bg" aria-hidden="true">
        <img class="category-card-image" src="${escapeHtml(image)}" alt="" width="640" height="420" loading="lazy" decoding="async" />
        <span class="category-card-count-badge">${cardCountLabel}</span>
      </div>
      <div class="category-card-overlay">
        <h3 class="category-title">${title}</h3>
        ${topicMarkup}
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
    const dataCacheName = cacheNames
      .filter(name => /^jakh-data-v\d+$/.test(name))
      .sort((a, b) => Number(a.split('-v').pop()) - Number(b.split('-v').pop()))
      .pop();
    const navigationCacheName = cacheNames
      .filter(name => /^jakh-navigation-v\d+$/.test(name))
      .sort((a, b) => Number(a.split('-v').pop()) - Number(b.split('-v').pop()))
      .pop();
    if (!dataCacheName || !navigationCacheName) return;
    const [dataCache, navigationCache] = await Promise.all([
      caches.open(dataCacheName),
      caches.open(navigationCacheName),
    ]);
    const [dataKeys, navigationKeys] = await Promise.all([dataCache.keys(), navigationCache.keys()]);
    const cachedDataPaths = new Set(dataKeys.map(request => new URL(request.url).pathname));
    const cachedNavigationPaths = new Set(navigationKeys.map(request => new URL(request.url).pathname.replace(/\/+$/, '') || '/'));
    document.querySelectorAll('.category-card[href]').forEach(el => {
      const href = el.getAttribute('href');
      const pathname = new URL(href, location.origin).pathname.replace(/\.html$/i, '').replace(/\/+$/, '') || '/';
      const slug = pathname.replace(/.*\//, '');
      if (cachedDataPaths.has(`/data/${slug}.json`) && cachedNavigationPaths.has(pathname)) {
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

function renderCategoryDirectory() {
  if (!els.categoryDirectoryGrid || !state.catalog) return;
  const sections = getDirectorySections();
  const searchTerm = state.directorySearch;
  const isAr = state.lang === 'ar';
  const visibleSections = state.cluster === 'all'
    ? sections
    : sections.filter(section => section.key === state.cluster);
  let visibleCategoryCount = 0;

  const markup = visibleSections.map((section) => {
    const categories = section.categories.filter((meta) => {
      if (!searchTerm) return true;
      const topicText = (meta.topics || [])
        .flatMap(topic => [topic.en, topic.ar])
        .filter(Boolean);
      const haystack = [
        meta.title.en, meta.title.ar, meta.description.en, meta.description.ar,
        ...topicText,
      ].filter(Boolean).join(' ').toLowerCase();
      return haystack.includes(searchTerm);
    });
    if (!categories.length) return '';
    visibleCategoryCount += categories.length;
    return createDirectorySectionMarkup({
      ...section,
      categoryCount: categories.length,
      count: categories.reduce((total, category) => total + Number(category.count || 0), 0),
    }) + categories.map(createCategoryCardMarkup).join('');
  }).join('');

  setDirectoryResultsLabel(searchTerm
    ? (isAr
        ? `تم العثور على ${visibleCategoryCount} موضوع مطابق.`
        : `${visibleCategoryCount} matching topics found.`)
    : (isAr
        ? `اختر مباشرة من ${visibleCategoryCount} موضوع ضمن ${visibleSections.length} أقسام واضحة.`
        : `Choose directly from ${visibleCategoryCount} topics in ${visibleSections.length} clear sections.`));

  els.categoryDirectoryGrid.innerHTML = markup || `
    <div class="empty-state directory-empty-state">
      <h3>${isAr ? 'لا توجد نتائج مطابقة.' : 'No matching topics.'}</h3>
      <p>${isAr ? 'جرّب قسمًا آخر أو امسح البحث الحالي.' : 'Try another section or clear the current search.'}</p>
    </div>
  `;
}

function renderClusterTabBar() {
  const focusCluster = typeof arguments[0] === 'string' ? arguments[0] : '';
  const tabBar = document.getElementById('clusterTabBar');
  if (!tabBar || !state.catalog) return;
  const activeCluster = tabBar.contains(document.activeElement)
    ? document.activeElement.closest('[data-cluster]')?.dataset.cluster || ''
    : '';
  const focusKey = focusCluster || activeCluster;
  const isAr = state.lang === 'ar';
  const sections = getDirectorySections();
  const countWord = isAr ? 'موضوعًا' : 'topics';

  const allTab = {
    key: 'all',
    title: { en: 'All topics', ar: 'كل المواضيع' },
    categoryCount: state.catalog.categories.length,
    mark: 'ALL',
    gradient: 'linear-gradient(135deg,#fff8eb,#edf5ff)',
  };

  const tabs = [allTab, ...sections];

  tabBar.innerHTML = tabs.map(c => {
    const name = c.title[state.lang] || c.title.en;
    const isActive = state.cluster === c.key;
    return `
      <button type="button" class="ml-cluster-tab${isActive ? ' is-active' : ''}" data-cluster="${escapeHtml(c.key)}" role="tab" aria-selected="${isActive}" aria-controls="categoryDirectoryGrid" tabindex="${isActive ? '0' : '-1'}" aria-label="${escapeHtml(name)}">
        <div class="ml-cluster-tab-bg" style="background:${escapeHtml(c.gradient)};" aria-hidden="true"></div>
        <div class="ml-cluster-tab-content">
          <span class="ml-cluster-tab-emoji directory-parent-mark" aria-hidden="true">${escapeHtml(c.mark)}</span>
          <div class="ml-cluster-tab-text">
            <span class="ml-cluster-tab-name">${escapeHtml(name)}</span>
            <span class="ml-cluster-tab-count">${c.categoryCount} ${countWord}</span>
          </div>
        </div>
      </button>`;
  }).join('');

  tabBar.querySelectorAll('.ml-cluster-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      const newCluster = btn.dataset.cluster;
      if (state.cluster === newCluster) return;
      state.cluster = newCluster;
      renderClusterTabBar(newCluster);
      renderCategoryDirectory();
    });
  });
  const renderedTabs = [...tabBar.querySelectorAll('[role="tab"][data-cluster]')];
  if (tabBar._clusterKeyHandler) tabBar.removeEventListener('keydown', tabBar._clusterKeyHandler);
  tabBar._clusterKeyHandler = (event) => {
    const currentIndex = renderedTabs.indexOf(event.target.closest('[role="tab"]'));
    if (currentIndex < 0) return;
    const forwardKey = state.lang === 'ar' ? 'ArrowLeft' : 'ArrowRight';
    const backwardKey = state.lang === 'ar' ? 'ArrowRight' : 'ArrowLeft';
    let nextIndex = currentIndex;
    if (event.key === forwardKey) nextIndex = (currentIndex + 1) % renderedTabs.length;
    else if (event.key === backwardKey) nextIndex = (currentIndex - 1 + renderedTabs.length) % renderedTabs.length;
    else if (event.key === 'Home') nextIndex = 0;
    else if (event.key === 'End') nextIndex = renderedTabs.length - 1;
    else return;
    event.preventDefault();
    renderedTabs[nextIndex].click();
  };
  tabBar.addEventListener('keydown', tabBar._clusterKeyHandler);
  if (focusKey) {
    requestAnimationFrame(() => {
      const correspondingTab = [...tabBar.querySelectorAll('[data-cluster]')]
        .find(tab => tab.dataset.cluster === focusKey)
        || tabBar.querySelector('[aria-selected="true"]');
      correspondingTab?.focus();
    });
  }
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
          <p class="muted" style="font-size:0.82rem">${escapeHtml(state.storageDurable
            ? (state.lang === 'ar' ? 'تقدمك محفوظ في هذا المتصفح. أنشئ حسابًا لمزامنته عبر أجهزتك.' : 'Progress is stored in this browser. Sign up to sync across devices.')
            : (state.lang === 'ar' ? 'يظهر تقدمك في هذه الصفحة الآن، لكن المتصفح منع التخزين الدائم وقد يُفقد بعد الإغلاق.' : 'Progress is available in this view, but the browser blocked durable storage and it may be lost after closing.'))}</p>
        ` : `<p>${escapeHtml(state.storageDurable
          ? t('guestText')
          : (state.lang === 'ar' ? 'ابدأ بالحل؛ سيبقى التقدم في العرض الحالي فقط لأن التخزين الدائم محظور.' : 'Start solving; progress will remain in this view only because durable storage is blocked.'))}</p>`}
        <div class="hero-actions">
          <button class="primary-btn" id="inlineCreateProfileBtn">${escapeHtml(t('createLocalProfile'))}</button>
        </div>
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
      const done = getCorrectCountByDifficulty(d.key, state.categoryData?.slug || state.categorySlug);
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
          <span class="dash-score-unit">${isAr ? 'نقطة تدريب' : 'practice pts'}</span>
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

let backToTopScrollBound = false;

function updateBackToTopVisibility() {
  document.getElementById('backToTopBtn')?.classList.toggle('is-visible', window.scrollY > 500);
}

function injectBackToTop() {
  let btn = document.getElementById('backToTopBtn');
  if (!btn) {
    btn = document.createElement('button');
    btn.id = 'backToTopBtn';
    btn.innerHTML = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="18 15 12 9 6 15"></polyline></svg>';
    btn.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));
    document.body.appendChild(btn);
  }
  const label = t('backToTop');
  btn.setAttribute('aria-label', label);
  btn.title = label;
  if (!backToTopScrollBound) {
    window.addEventListener('scroll', updateBackToTopVisibility, { passive: true });
    backToTopScrollBound = true;
  }
  updateBackToTopVisibility();
}

function renderCategoryPage() {
  if (!state.categoryData || !state.catalog) return;

  const category = state.categoryData;
  if (els.categoryKicker) els.categoryKicker.textContent = category.cluster[state.lang];
  if (els.categoryTitle) els.categoryTitle.textContent = `${category.emoji} ${category.title[state.lang]}`;
  const breadcrumbEl = document.getElementById('breadcrumbCategoryName');
  if (breadcrumbEl) breadcrumbEl.textContent = category.title[state.lang];
  if (els.categoryDescription) els.categoryDescription.textContent = category.description[state.lang];
  if (els.categoryCountPill) els.categoryCountPill.textContent = fmt('pageQuestions', { count: category.count });
  if (els.categoryImage) {
    // Generated category pages already contain the first valid local asset
    // selected at build time. Preserve it instead of fetching, rendering, and
    // then discarding it for a runtime fallback.
    if (!els.categoryImage.getAttribute('src')) els.categoryImage.src = categoryArtUrl(category);
  }
  if (els.categoryDiffBadge) els.categoryDiffBadge.textContent = buildDiffBadge(category);
  restoreFilterParams();
  prepareSharedCard();
  renderAccountSummary(els.categorySummaryMount);
  renderSubcategoryFilters();
  renderCards();
  renderRelatedCategories();
  markCachedCategories();
  scrollToSharedCard();
}

function prepareSharedCard() {
  if (state.sharedCardHandled || !state.categoryData?.cards?.length) return;
  const cardId = new URLSearchParams(location.search).get('card');
  if (!cardId) return;
  const cardIndex = state.categoryData.cards.findIndex(card => card.id === cardId);
  state.sharedCardHandled = true;
  if (cardIndex < 0) {
    trackEvent('shared_card_open', {
      category: state.categorySlug,
      card_id: cardId,
      status: 'not_found',
    });
    return;
  }
  state.cardPage = Math.max(state.cardPage, Math.ceil((cardIndex + 1) / PAGE_SIZE));
  state.flipped.add(cardId);
  trackEvent('shared_card_open', {
    category: state.categorySlug,
    card_id: cardId,
    status: 'found',
  });
}

function scrollToSharedCard() {
  if (!state.sharedCardHandled) return;
  const cardId = new URLSearchParams(location.search).get('card');
  if (!cardId) return;
  requestAnimationFrame(() => {
    const card = els.cardGrid?.querySelector(`[data-id="${CSS.escape(cardId)}"]`);
    if (!card) return;
    card.classList.add('shared-card-target');
    card.scrollIntoView({
      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
      block: 'center',
    });
  });
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

function renderSubcategoryFilters(focusSubcategory = '') {
  if (!els.subcategoryWrap || !els.subcategoryFilters || !state.categoryData) return;
  const activeFilter = els.subcategoryFilters.contains(document.activeElement)
    ? document.activeElement.closest('[data-subcategory]')?.dataset.subcategory || ''
    : '';
  const focusKey = focusSubcategory || activeFilter;
  const counts = {};
  for (const card of state.categoryData.cards || []) {
    const sc = card.subcategory;
    if (sc?.en) {
      if (!counts[sc.en]) counts[sc.en] = { en: sc.en, ar: sc.ar || sc.en, count: 0 };
      counts[sc.en].count++;
    }
  }
  const subcats = Object.values(counts).sort((a, b) => (
    b.count - a.count
    || a.en.localeCompare(b.en)
  ));
  if (!subcats.length) {
    els.subcategoryWrap.classList.add('hidden');
    return;
  }
  if (state.subcategory !== 'all' && !counts[state.subcategory]) state.subcategory = 'all';
  els.subcategoryWrap.classList.remove('hidden');
  const allLabel = state.lang === 'ar' ? 'الكل' : 'All';
  const chips = [
    { key: 'all', label: `${allLabel} · ${state.categoryData.cards.length}` },
    ...subcats.map((item) => ({
      key: item.en,
      label: `${item[state.lang] || item.en || ''} · ${item.count}`,
    })),
  ];
  els.subcategoryFilters.innerHTML = chips.map((chip) => `
    <button type="button" class="category-chip ${state.subcategory === chip.key ? 'is-active' : ''}" data-subcategory="${escapeHtml(chip.key)}" aria-pressed="${state.subcategory === chip.key ? 'true' : 'false'}" aria-controls="cardGrid">${escapeHtml(chip.label)}</button>
  `).join('');
  els.subcategoryFilters.querySelectorAll('[data-subcategory]').forEach((button) => {
    button.addEventListener('click', () => {
      state.subcategory = button.dataset.subcategory;
      state.cardPage = 1;
      syncFilterParams();
      renderSubcategoryFilters(state.subcategory);
      renderCards();
    });
  });
  if (focusKey) {
    requestAnimationFrame(() => {
      const correspondingFilter = [...els.subcategoryFilters.querySelectorAll('[data-subcategory]')]
        .find(button => button.dataset.subcategory === focusKey)
        || els.subcategoryFilters.querySelector('[aria-pressed="true"]');
      correspondingFilter?.focus();
    });
  }
}

function syncFilterParams() {
  if (state.page !== 'category') return;
  const params = new URLSearchParams(location.search);
  if (state.difficulty && state.difficulty !== 'all') params.set('difficulty', state.difficulty); else params.delete('difficulty');
  if (state.view && state.view !== 'all') params.set('view', state.view); else params.delete('view');
  if (state.sort && state.sort !== 'featured') params.set('sort', state.sort); else params.delete('sort');
  if (state.subcategory && state.subcategory !== 'all') params.set('sub', state.subcategory); else params.delete('sub');
  if (state.search) params.set('q', state.search); else params.delete('q');
  history.replaceState(null, '', params.toString() ? `${location.pathname}?${params.toString()}` : location.pathname);
}

function clearCategoryFilterParams() {
  if (state.page !== 'category') return;
  const url = new URL(location.href);
  ['difficulty', 'view', 'sort', 'sub', 'q', 'card'].forEach(key => url.searchParams.delete(key));
  history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`);
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

function safeHttpsSourceUrl(value) {
  try {
    const parsed = new URL(String(value));
    return parsed.protocol === 'https:' && parsed.hostname ? parsed.href : '';
  } catch (_) {
    return '';
  }
}

function formatReviewDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return String(value || '');
  const date = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(state.lang === 'ar' ? 'ar-AE' : 'en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(date);
}

function createReviewMarkup(card, sourceLinkFocus = '') {
  const review = card?.review || { status: 'pending' };
  const reviewed = review.status === 'reviewed';
  if (!reviewed) {
    const safetySensitive = review.safetySensitive === true || review.priority === 'high';
    const label = t(safetySensitive ? 'reviewSafetyPending' : 'reviewStatusPending');
    return `
      <div class="card-review card-review--pending${safetySensitive ? ' card-review--safety' : ''}" role="note" aria-label="${escapeHtml(label)}">
        <p class="card-review-label"><span aria-hidden="true">${safetySensitive ? '⚠' : '◷'}</span> ${escapeHtml(label)}</p>
      </div>`;
  }

  const reviewedAt = String(review.reviewedAt || '');
  const reviewer = String(review.reviewer || '');
  const sources = (Array.isArray(review.sources) ? review.sources : [])
    .map(source => ({ ...source, safeUrl: safeHttpsSourceUrl(source?.url) }))
    .filter(source => source.safeUrl);
  const statusLabel = t('reviewStatusReviewed');
  const sourceLinks = sources.map((source, index) => {
    const title = String(source.title || source.publisher || source.safeUrl);
    const publisher = String(source.publisher || title);
    const ariaLabel = fmt('reviewSourceLabel', {
      number: index + 1,
      title,
      publisher,
    });
    return `
      <li>
        <a href="${escapeHtml(source.safeUrl)}" target="_blank" rel="noopener noreferrer" aria-label="${escapeHtml(ariaLabel)}" ${sourceLinkFocus}>
          <span>${escapeHtml(title)} — ${escapeHtml(publisher)}</span>
          <span class="card-review-external" aria-hidden="true">↗</span>
        </a>
      </li>`;
  }).join('');

  return `
    <div class="card-review card-review--reviewed" role="note" aria-label="${escapeHtml(statusLabel)}">
      <p class="card-review-label"><span aria-hidden="true">✓</span> ${escapeHtml(statusLabel)}</p>
      <p class="card-review-meta">
        <time datetime="${escapeHtml(reviewedAt)}">${escapeHtml(fmt('reviewDate', { date: formatReviewDate(reviewedAt) }))}</time>
        <span>${escapeHtml(fmt('reviewReviewer', { reviewer }))}</span>
      </p>
      ${sourceLinks ? `
        <div class="card-review-sources">
          <span class="card-review-sources-title">${escapeHtml(t('reviewSources'))}</span>
          <ul>${sourceLinks}</ul>
        </div>` : ''}
    </div>`;
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
  const cardReviewMarkup = createReviewMarkup(card);

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
                ${cardReviewMarkup}
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
        <article class="riddle-card is-locked" data-id="${escapeHtml(card.id)}" data-mode="${escapeHtml(card.mode || 'quiz')}" tabindex="0" aria-label="${escapeHtml(t('locked'))}">
          <div class="card-inner">
            <section class="card-face card-front">
              <div class="card-badges">${categoryBadge}${difficultyBadge}${subcat}</div>
              <p class="card-question">${escapeHtml(card.question[state.lang])}</p>
              ${cardReviewMarkup}
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
  const frontReviewMarkup = createReviewMarkup(card, frontFocus);
  const backReviewMarkup = createReviewMarkup(card, backFocus);
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
          ${frontReviewMarkup}
          <div class="card-actions">
            <button class="primary-btn mini-btn action-flip" data-action="flip" data-id="${escapeHtml(card.id)}" ${frontFocus}>${escapeHtml(flipLabel)}</button>
            <button class="mini-btn action-fav${favorite ? ' is-fav' : ''}" data-action="favorite" data-id="${escapeHtml(card.id)}" aria-label="${escapeHtml(favorite ? t('removeFavorite') : t('addFavorite'))}" title="${escapeHtml(favorite ? t('removeFavorite') : t('addFavorite'))}" ${frontFocus}>${favorite ? '♥' : '♡'}</button>
            ${audioBtn}
          </div>
        </section>
        <section class="card-face card-back" aria-hidden="${flipped ? 'false' : 'true'}" ${flipped ? '' : 'inert'}>
          <p class="card-answer"><strong>${escapeHtml(card.answer[state.lang])}</strong></p>
          ${backReviewMarkup}
          <div class="card-actions">
            <button class="primary-btn mini-btn action-flip" data-action="flip" data-id="${escapeHtml(card.id)}" ${backFocus}>${escapeHtml(t('backToQuestion'))}</button>
            <div class="card-icon-row">
              <button class="card-fav-btn${favorite ? ' is-fav' : ''}" data-action="favorite" data-id="${escapeHtml(card.id)}" aria-label="${escapeHtml(favorite ? t('removeFavorite') : t('addFavorite'))}" title="${escapeHtml(favorite ? t('removeFavorite') : t('addFavorite'))}" ${backFocus}>${favorite ? '♥' : '♡'}</button>
              ${markBtns}
              <button class="mini-btn card-share-btn" data-action="share" data-id="${escapeHtml(card.id)}" aria-label="${state.lang === 'ar' ? 'مشاركة السؤال' : 'Share question'}" title="${state.lang === 'ar' ? 'مشاركة السؤال' : 'Share question'}" ${backFocus}>↗</button>
              <button class="mini-btn report-btn" data-action="report" data-id="${escapeHtml(card.id)}" aria-label="${escapeHtml(t('reportBtn'))}" title="${escapeHtml(t('reportBtn'))}" ${backFocus}>⚑</button>
            </div>
          </div>
        </section>
      </div>
    </article>
  `;
}

function captureCardFocus(id, preferredActions = []) {
  const card = els.cardGrid?.querySelector(`[data-id="${CSS.escape(id)}"]`);
  if (!card || !card.contains(document.activeElement)) return null;
  const cards = [...els.cardGrid.querySelectorAll('.riddle-card[data-id]')];
  return {
    cardId: id,
    cardIndex: Math.max(0, cards.indexOf(card)),
    target: describeFocusTarget(document.activeElement),
    preferredActions,
  };
}

function restoreCardFocus(request) {
  if (!request) return;
  requestAnimationFrame(() => {
    const escapedId = CSS.escape(request.cardId);
    const card = els.cardGrid?.querySelector(`[data-id="${escapedId}"]`);
    let target = resolveFocusTarget(request.target, card || document);
    if (!target && card) {
      for (const action of request.preferredActions || []) {
        target = card.querySelector(`[data-action="${CSS.escape(action)}"]:not([tabindex="-1"])`);
        if (target) break;
      }
    }
    if (!target && card) {
      target = card.querySelector('[data-action="flip"]:not([tabindex="-1"]), button:not([disabled]):not([tabindex="-1"])');
    }
    if (!target) {
      const visibleCards = [...(els.cardGrid?.querySelectorAll('.riddle-card[data-id]') || [])];
      const nearbyCard = visibleCards[Math.min(request.cardIndex, Math.max(0, visibleCards.length - 1))];
      target = nearbyCard?.querySelector('[data-action="flip"]:not([tabindex="-1"]), button:not([disabled]):not([tabindex="-1"])')
        || els.subcategoryFilters?.querySelector('[aria-pressed="true"]')
        || els.viewSelect
        || els.cardSearchInput;
    }
    focusElement(target);
  });
}

function updateCardEl(id, preferredActions = []) {
  const el = els.cardGrid?.querySelector(`[data-id="${CSS.escape(id)}"]`);
  if (!el) return;
  const focusRequest = captureCardFocus(id, preferredActions);
  const card = state.categoryData?.cards.find(c => c.id === id);
  if (!card) return;
  const tmp = document.createElement('div');
  tmp.innerHTML = createCardMarkup(card);
  const newEl = tmp.firstElementChild;
  newEl.style.animation = 'none';
  el.replaceWith(newEl);
  restoreCardFocus(focusRequest);
}

// When marking or favoriting, visibility may change if a filter is active
function updateCardElOrRefresh(id, preferredActions = []) {
  const focusRequest = captureCardFocus(id, preferredActions);
  if (state.view !== 'all') {
    renderCards(focusRequest);
  } else {
    updateCardEl(id, preferredActions);
  }
}

function renderCards(focusRequest = null) {
  if (!els.cardGrid || !state.categoryData) return;

  // Remove any previous load-more button
  document.getElementById('loadMoreBtn')?.remove();

  const filtered = getFilteredCards();
  const pageEnd = state.cardPage * PAGE_SIZE;
  const visible = filtered.slice(0, pageEnd);

  els.cardGrid.innerHTML = visible.map(createCardMarkup).join('');

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
    const rendered = visible.length;
    const matched = filtered.length;
    const categoryTotal = state.categoryData.cards.length;
    const remaining = Math.max(0, matched - rendered);
    els.resultsLabel.textContent = state.lang === 'ar'
      ? `المعروض الآن ${rendered} من ${matched} سؤالًا مطابقًا (إجمالي الموضوع ${categoryTotal}).${remaining ? ` يتوفر ${remaining} سؤالًا إضافيًا عبر زر «عرض المزيد».` : ' كل النتائج المطابقة معروضة.'}`
      : `Showing ${rendered} of ${matched} matching questions (${categoryTotal} total in this topic).${remaining ? ` ${remaining} more available via “Show more.”` : ' All matching results are rendered.'}`;
  }
  renderAccountSummary(els.categorySummaryMount);
  restoreCardFocus(focusRequest);
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
    updateCardElOrRefresh(id, ['favorite']);
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
  updateCardElOrRefresh(id, ['favorite']);
  renderAccountSummary(els.categorySummaryMount);

  const syncResult = await sendCloudMutation(`favorite:${id}`, '/user/favorite', 'POST', {
    cardId: id,
    categoryId: state.categoryData?.slug || 'unknown',
    action,
  });
  if (!syncResult.synced) {
    showToast(cloudMutationStatusMessage(syncResult));
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
  }

  if (!state.dbUser) {
    const guestSolved = getGuestSolvedMap();
    guestSolved[id] = { status, categoryId: state.categoryData?.slug || 'unknown' };
    saveJson(GUEST_KEYS.solved, guestSolved);
    if (result === 'correct') checkNewAchievements();
    updateCardElOrRefresh(id, ['unmark']);
    if (result === 'correct') flashCard(id);
    renderAccountSummary(els.categorySummaryMount);
    if (result === 'correct') setTimeout(() => checkCategoryComplete(state.categoryData?.slug || ''), 400);
    return;
  }

  const dbUser = state.dbUser;
  dbUser.progress = dbUser.progress.filter(p => p.cardId !== id);
  dbUser.progress.push({ cardId: id, categoryId: state.categoryData?.slug || 'unknown', status });
  if (result === 'correct') checkNewAchievements();
  updateCardElOrRefresh(id, ['unmark']);
  if (result === 'correct') flashCard(id);
  renderAccountSummary(els.categorySummaryMount);
  if (result === 'correct') setTimeout(() => checkCategoryComplete(state.categoryData?.slug || ''), 400);

  const categoryId = state.categoryData?.slug || 'unknown';
  const syncResult = await sendCloudMutation(`progress:${id}`, '/user/progress', 'POST', { cardId: id, categoryId, status });
  if (!syncResult.synced) {
    showToast(cloudMutationStatusMessage(syncResult));
  }
}

async function unmarkCard(id) {
  if (!state.dbUser) {
    const guestSolved = getGuestSolvedMap();
    delete guestSolved[id];
    saveJson(GUEST_KEYS.solved, guestSolved);
    showToast(t('solvedRemoved'));
    updateCardElOrRefresh(id, ['markCorrect', 'markWrong']);
    renderAccountSummary(els.categorySummaryMount);
    return;
  }

  const dbUser = state.dbUser;
  dbUser.progress = dbUser.progress.filter(p => p.cardId !== id);
  showToast(t('solvedRemoved'));
  updateCardElOrRefresh(id, ['markCorrect', 'markWrong']);
  renderAccountSummary(els.categorySummaryMount);

  const categoryId = state.categoryData?.slug || 'unknown';
  const syncResult = await sendCloudMutation(`progress:${id}`, '/user/progress', 'DELETE', { cardId: id, categoryId });
  if (!syncResult.synced) {
    showToast(cloudMutationStatusMessage(syncResult));
  }
}

const FOCUSABLE = 'a[href],button:not([disabled]),input,select,textarea,[tabindex]:not([tabindex="-1"])';
const overlayFocusReturns = new Map();

function describeFocusTarget(node) {
  if (!(node instanceof Element) || node === document.body || node === document.documentElement) return null;
  const selectors = [];
  if (node.id) selectors.push(`#${CSS.escape(node.id)}`);
  const dataKeys = ['action', 'id', 'subcategory', 'cluster', 'emoji', 'tab', 'authMode'];
  const dataSelector = dataKeys
    .filter(key => node.dataset?.[key])
    .map(key => `[data-${key.replace(/[A-Z]/g, letter => `-${letter.toLowerCase()}`)}="${CSS.escape(node.dataset[key])}"]`)
    .join('');
  if (dataSelector) selectors.push(dataSelector);
  if (node.getAttribute('name')) selectors.push(`[name="${CSS.escape(node.getAttribute('name'))}"]`);
  return { node, selectors };
}

function canReceiveFocus(node) {
  return Boolean(
    node
    && node.isConnected
    && !node.matches?.(':disabled')
    && !node.closest?.('[hidden],.hidden,[aria-hidden="true"],[inert]'),
  );
}

function resolveFocusTarget(descriptor, root = document) {
  if (!descriptor) return null;
  if (
    canReceiveFocus(descriptor.node)
    && (root === document || root === descriptor.node || root.contains?.(descriptor.node))
  ) {
    return descriptor.node;
  }
  for (const selector of descriptor.selectors || []) {
    const candidate = root.querySelector?.(selector);
    if (canReceiveFocus(candidate)) return candidate;
  }
  return null;
}

function focusElement(node) {
  if (!canReceiveFocus(node)) return false;
  try {
    node.focus({ preventScroll: true });
    return document.activeElement === node;
  } catch (_) {
    return false;
  }
}

function restoreFocusTarget(descriptor, fallbackSelector = '') {
  requestAnimationFrame(() => {
    const target = resolveFocusTarget(descriptor)
      || (fallbackSelector ? document.querySelector(fallbackSelector) : null);
    focusElement(target);
  });
}

function trapFocus(el, options = {}) {
  const {
    key = el.id || '',
    initialFocus = '',
    onEscape = null,
    returnFallback = '',
    returnTarget = document.activeElement,
  } = options;
  releaseFocus(el);
  if (key && !overlayFocusReturns.has(key)) {
    overlayFocusReturns.set(key, {
      target: describeFocusTarget(returnTarget),
      fallback: returnFallback,
    });
  }
  el._focusKey = key;
  const nodes = () => [...el.querySelectorAll(FOCUSABLE)].filter(canReceiveFocus);
  el._trapHandler = (e) => {
    if (e.key === 'Escape' && typeof onEscape === 'function') {
      e.preventDefault();
      e.stopPropagation();
      onEscape();
      return;
    }
    if (e.key !== 'Tab') return;
    const items = nodes();
    if (!items.length) {
      e.preventDefault();
      focusElement(el.querySelector('[role="dialog"]') || el);
      return;
    }
    const first = items[0], last = items[items.length - 1];
    if (e.shiftKey) { if (document.activeElement === first) { e.preventDefault(); last.focus(); } }
    else { if (document.activeElement === last) { e.preventDefault(); first.focus(); } }
  };
  el.addEventListener('keydown', el._trapHandler);
  const initialTarget = typeof initialFocus === 'string'
    ? el.querySelector(initialFocus)
    : initialFocus;
  const firstFocusable = canReceiveFocus(initialTarget) ? initialTarget : nodes()[0];
  if (firstFocusable) requestAnimationFrame(() => focusElement(firstFocusable));
}

function releaseFocus(el, { restore = false, discard = false } = {}) {
  if (el._trapHandler) el.removeEventListener('keydown', el._trapHandler);
  delete el._trapHandler;
  const key = el._focusKey || el.id || '';
  delete el._focusKey;
  if (!key) return;
  if (restore) {
    const returnState = overlayFocusReturns.get(key);
    overlayFocusReturns.delete(key);
    restoreFocusTarget(returnState?.target, returnState?.fallback || '');
  } else if (discard) {
    overlayFocusReturns.delete(key);
  }
}

function openModal(name) {
  const modal = els.authModal;
  if (!modal) return;
  modal.classList.remove('hidden');
  modal.setAttribute('aria-hidden', 'false');
  const initialFocus = state.dbUser
    ? '#signedInAccountPanel'
    : `#tab${authModalMode === 'register' ? 'Register' : authModalMode === 'recover' ? 'Recover' : 'Signin'}`;
  trapFocus(modal, {
    key: 'auth',
    initialFocus,
    onEscape: () => closeModal('auth'),
    returnFallback: '#openAuthBtn, #heroAuthBtn, #bnProfileBtn',
  });
}

function closeModal(name) {
  if (name === 'leaderboard') {
    const lb = document.getElementById('leaderboardModal');
    if (lb) {
      lb.classList.add('hidden');
      lb.setAttribute('aria-hidden', 'true');
      releaseFocus(lb, { restore: true });
    }
    return;
  }
  const modal = els.authModal;
  if (!modal) return;
  if (authModalMode === 'recovery-receipt') {
    setAuthInlineStatus(
      document.getElementById('recoveryCopyStatus'),
      t('recoveryCloseBlocked'),
      'error',
    );
    focusAuthControl('acknowledgeRecoveryCodeBtn');
    return;
  }
  modal.classList.add('hidden');
  modal.setAttribute('aria-hidden', 'true');
  releaseFocus(modal, { restore: true });
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
      <button class="paywall-close" aria-label="${escapeHtml(t('close'))}">✕</button>
      <div class="paywall-icon">🔓</div>
      <h2 class="paywall-title" id="paywallTitle">${isAr
        ? `جربت ${trialUsed} ألغاز مجانية!`
        : `You've previewed ${trialUsed} premium riddles free!`}</h2>
      <p class="paywall-body">${isAr
        ? 'الحساب المجاني يتيح مسار الفتح ومزامنة التقدم ولوحة النتائج. يُفتح مستوى الصعب بعد 10 إجابات صحيحة، ثم الصعب جدًا بعد 10 إجابات صحيحة في مستوى الصعب.'
        : 'A free account enables the unlock path, progress sync, and leaderboard. Head Scratcher unlocks after 10 correct answers; Brick Wall then requires 10 correct Head Scratcher answers.'}</p>
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
    const returnState = overlayFocusReturns.get('paywall');
    closePaywallModal({ restoreFocus: false });
    if (returnState) overlayFocusReturns.set('auth', returnState);
    renderAuthModal('register');
    openModal('auth');
  });
  modal.querySelector('.paywall-signin-btn').addEventListener('click', () => {
    const returnState = overlayFocusReturns.get('paywall');
    closePaywallModal({ restoreFocus: false });
    if (returnState) overlayFocusReturns.set('auth', returnState);
    renderAuthModal('signin');
    openModal('auth');
  });
  modal.classList.remove('hidden');
  modal.setAttribute('aria-hidden', 'false');
  trapFocus(modal, {
    key: 'paywall',
    initialFocus: '.paywall-close',
    onEscape: closePaywallModal,
    returnFallback: '#cardGrid [data-action="paywall"], #openAuthBtn',
  });
}

function closePaywallModal(options = {}) {
  const modal = document.getElementById('paywallModal');
  if (!modal) return;
  const restore = options.restoreFocus !== false;
  modal.classList.add('hidden');
  modal.setAttribute('aria-hidden', 'true');
  releaseFocus(modal, { restore, discard: !restore });
}

function focusAuthControl(id) {
  requestAnimationFrame(() => document.getElementById(id)?.focus());
}

function setAuthInlineStatus(node, message, tone = '') {
  if (!node) return;
  node.textContent = message || '';
  if (tone) node.dataset.tone = tone;
  else delete node.dataset.tone;
}

function recoveryCodeFromResponse(response) {
  return typeof response?.recoveryCode === 'string' && response.recoveryCode.trim()
    ? response.recoveryCode.trim()
    : '';
}

async function hydrateAuthenticatedExperience() {
  await checkCloudSession();
  if (!state.dbUser) throw new Error(t('genericError'));
  await flushCloudQueue();
  await mergeGuestProgress();
  await checkCloudSession();
  if (!state.dbUser) throw new Error(t('genericError'));
  refreshAnalyticsHeartbeat();
  const suggestionAccountLabel = els.suggestionLinkAccount?.closest('.suggestion-account-link');
  if (suggestionAccountLabel) suggestionAccountLabel.hidden = false;
  applyStaticCopy();
  rerender();
}

function renderRecoveryCodeReceipt(recoveryCode) {
  if (!els.authModalBody || !recoveryCode) return false;
  authModalMode = 'recovery-receipt';
  els.authModalBody.innerHTML = `
    <section class="auth-panel recovery-receipt" aria-labelledby="recoveryReceiptTitle" aria-describedby="recoveryReceiptLead recoveryReceiptReplacement">
      <h3 id="recoveryReceiptTitle" tabindex="-1">${escapeHtml(t('recoveryReceiptTitle'))}</h3>
      <p id="recoveryReceiptLead">${escapeHtml(t('recoveryReceiptLead'))}</p>
      <code id="oneTimeRecoveryCode" class="recovery-code" dir="ltr" tabindex="0" aria-label="${escapeHtml(t('recoveryCode'))}"></code>
      <p id="recoveryReceiptReplacement" class="muted">${escapeHtml(t('recoveryReceiptReplacement'))}</p>
      <p id="recoveryCopyStatus" class="auth-inline-status" role="status" aria-live="polite"></p>
      <div class="hero-actions">
        <button class="secondary-btn" type="button" id="copyRecoveryCodeBtn">${escapeHtml(t('recoveryCopy'))}</button>
        <button class="primary-btn" type="button" id="acknowledgeRecoveryCodeBtn">${escapeHtml(t('recoverySaved'))}</button>
      </div>
    </section>`;

  const codeNode = document.getElementById('oneTimeRecoveryCode');
  const copyStatus = document.getElementById('recoveryCopyStatus');
  codeNode.textContent = recoveryCode;

  document.getElementById('copyRecoveryCodeBtn')?.addEventListener('click', async () => {
    try {
      if (!navigator.clipboard?.writeText) throw new Error('Clipboard unavailable');
      await navigator.clipboard.writeText(codeNode.textContent || '');
      setAuthInlineStatus(copyStatus, t('recoveryCopied'), 'success');
    } catch {
      const range = document.createRange();
      range.selectNodeContents(codeNode);
      window.getSelection()?.removeAllRanges();
      window.getSelection()?.addRange(range);
      codeNode.focus();
      setAuthInlineStatus(copyStatus, t('recoveryCopyFailed'), 'error');
    }
  });

  document.getElementById('acknowledgeRecoveryCodeBtn')?.addEventListener('click', () => {
    codeNode.textContent = '';
    renderAuthModal('signin');
    focusAuthControl('signedInAccountPanel');
  });
  focusAuthControl('recoveryReceiptTitle');
  return true;
}

function renderAuthModal(mode = 'signin') {
  if (!els.authModalBody) return;
  const previousFocus = els.authModalBody.contains(document.activeElement)
    ? describeFocusTarget(document.activeElement)
    : null;
  authModalMode = mode;
  const account = getActiveUser();
  if (account) {
    const easyCount = getCorrectCountByDifficulty('easy');
    const medCount = getCorrectCountByDifficulty('medium');
    const hardCount = getCorrectCountByDifficulty('hard');
    const advCount = getCorrectCountByDifficulty('very-advanced');
    const earnedBadges = [
      easyCount >= 10 ? `<span class="badge" title="${escapeHtml(t('badgeBronze'))}">🥉 ${escapeHtml(t('badgeBronzeName'))}</span>` : '',
      medCount >= 10 ? `<span class="badge" title="${escapeHtml(t('badgeSilver'))}">🥈 ${escapeHtml(t('badgeSilverName'))}</span>` : '',
      hardCount >= 10 ? `<span class="badge" title="${escapeHtml(t('badgeGold'))}">🥇 ${escapeHtml(t('badgeGoldName'))}</span>` : '',
      advCount >= 10 ? `<span class="badge" title="${escapeHtml(t('badgeDiamond'))}">💎 ${escapeHtml(t('badgeDiamondName'))}</span>` : '',
    ].filter(Boolean).join(' ') || '<span class="muted">—</span>';

    const byCategory = {};
    (state.dbUser.progress || []).forEach(p => {
      const cat = p.categoryId && p.categoryId !== 'unknown' ? p.categoryId : null;
      if (!cat) return;
      if (!byCategory[cat]) byCategory[cat] = { correct: 0, wrong: 0 };
      if (p.status.startsWith('wrong-')) byCategory[cat].wrong++;
      else byCategory[cat].correct++;
    });
    const reportRows = Object.entries(byCategory).map(([cat, counts]) => {
      const category = state.catalog?.categories.find(item => item.slug === cat);
      const categoryName = category?.title?.[state.lang] || category?.title?.en || cat;
      return `
      <tr>
        <td style="padding:0.3rem 0.5rem">${escapeHtml(categoryName)}</td>
        <td style="padding:0.3rem 0.5rem;color:var(--c-green,#4caf50)">${counts.correct}</td>
        <td style="padding:0.3rem 0.5rem;color:var(--c-red,#f44336)">${counts.wrong}</td>
      </tr>
    `;
    }).join('');
    const reportHtml = reportRows ? `
      <hr style="margin:1.5rem 0;opacity:0.2;" />
      <strong style="display:block;margin-bottom:0.75rem;">${escapeHtml(t('reportTitle'))}</strong>
      <div style="overflow-x:auto">
        <table style="width:100%;border-collapse:collapse;font-size:0.85rem;">
          <thead><tr>
            <th style="text-align:start;padding:0.3rem 0.5rem;opacity:0.6">${escapeHtml(t('reportCategory'))}</th>
            <th style="padding:0.3rem 0.5rem;opacity:0.6">✓ ${escapeHtml(t('reportCorrect'))}</th>
            <th style="padding:0.3rem 0.5rem;opacity:0.6">✗ ${escapeHtml(t('reportWrong'))}</th>
          </tr></thead>
          <tbody>${reportRows}</tbody>
        </table>
      </div>
    ` : '';

    els.authModalBody.innerHTML = `
      <section class="auth-panel" id="signedInAccountPanel" tabindex="-1">
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
             <button type="button" class="avatar-btn ${account.avatar === emoji ? 'is-active' : ''}" aria-label="${escapeHtml(fmt('chooseAvatarAria', { avatar: emoji }))}" aria-pressed="${account.avatar === emoji ? 'true' : 'false'}" style="border:2px solid ${account.avatar === emoji ? 'var(--accent, #e8613c)' : 'transparent'};background:transparent;cursor:pointer;border-radius:50%;padding:4px;transition:all 0.2s;transform:${account.avatar === emoji ? 'scale(1.1)' : 'scale(1)'};" data-emoji="${emoji}">${emoji}</button>
          `).join('')}
        </div>

        <hr style="margin:1.5rem 0;opacity:0.2;" />
        <strong style="display:block;margin-bottom:0.5rem;">${escapeHtml(state.lang === 'ar' ? 'تغيير كلمة المرور' : 'Change Password')}</strong>
        <div class="form-row" style="margin-bottom:1rem;">
             <label>
               <span>${escapeHtml(state.lang === 'ar' ? 'كلمة المرور الحالية' : 'Current Password')}</span>
               <input type="password" id="currentPassword" autocomplete="current-password" />
             </label>
             <label>
               <span>${escapeHtml(state.lang === 'ar' ? 'كلمة المرور الجديدة' : 'New Password')}</span>
               <input type="password" id="newPassword" autocomplete="new-password" minlength="8" maxlength="128" />
             </label>
        </div>
        <button class="mini-btn" id="changePasswordBtn">${escapeHtml(state.lang === 'ar' ? 'تحديث كلمة المرور' : 'Update Password')}</button>

        <hr style="margin:1.5rem 0;opacity:0.2;" />
        <strong style="display:block;margin-bottom:0.5rem;">${escapeHtml(t('recoveryRotateTitle'))}</strong>
        <p class="muted">${escapeHtml(t('recoveryRotateLead'))}</p>
        <div class="form-row">
          <label>
            <span>${escapeHtml(state.lang === 'ar' ? 'كلمة المرور الحالية' : 'Current Password')}</span>
            <input type="password" id="recoveryRotatePassword" autocomplete="current-password" required minlength="8" maxlength="128" />
          </label>
        </div>
        <p id="recoveryRotateStatus" class="auth-inline-status" role="status" aria-live="polite"></p>
        <button class="mini-btn" type="button" id="rotateRecoveryCodeBtn">${escapeHtml(t('recoveryRotate'))}</button>

        <div class="hero-actions" style="margin-top:2rem;">
          ${(state.dbUser?.role === 'ADMIN' || state.dbUser?.role === 'OWNER') ? `<a class="secondary-btn" href="/admin${state.lang === 'ar' ? '?lang=ar' : ''}">🛡 ${escapeHtml(t('adminConsole'))}</a>` : ''}
          <a class="secondary-btn" href="${sharedRouteForLanguage('/privacy', state.lang)}">${escapeHtml(state.lang === 'ar' ? 'الخصوصية وبيانات الحساب' : 'Privacy & account data')}</a>
          <button class="primary-btn" id="logoutBtn" style="background:#555;">${escapeHtml(t('logout'))}</button>
        </div>
        <p id="logoutStatus" class="auth-inline-status" role="status" aria-live="polite"></p>
      </section>
    `;
    
    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) logoutBtn.addEventListener('click', async () => {
      const logoutStatus = document.getElementById('logoutStatus');
      logoutBtn.disabled = true;
      logoutBtn.setAttribute('aria-busy', 'true');
      setAuthInlineStatus(logoutStatus, '');
      try {
        await apiFetch('/auth/logout', { method: 'POST' });
      } catch {
        setAuthInlineStatus(logoutStatus, t('logoutFailed'), 'error');
        showToast(t('logoutFailed'), true);
        return;
      } finally {
        logoutBtn.disabled = false;
        logoutBtn.removeAttribute('aria-busy');
      }
      clearAllCloudMutations();
      state.dbUser = null;
      state.accountAnalyticsAllowed = false;
      stopAnalyticsHeartbeat();
      const suggestionAccountLabel = els.suggestionLinkAccount?.closest('.suggestion-account-link');
      if (suggestionAccountLabel) suggestionAccountLabel.hidden = true;
      if (els.suggestionLinkAccount) els.suggestionLinkAccount.checked = false;
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
          showToast(t('avatarUpdated'));
        } catch (err) {
          showToast(localizedErrorMessage(err, 'avatarSaveError'), true);
          btn.style.opacity = '1';
        }
      });
    });

    const cpBtn = document.getElementById('changePasswordBtn');
    if (cpBtn) cpBtn.addEventListener('click', async () => {
       const cur = document.getElementById('currentPassword').value;
       const neu = document.getElementById('newPassword').value;
       if (!cur || !neu) return showToast(t('passwordFieldsRequired'), true);
       cpBtn.textContent = '...';
       try {
          await apiFetch('/user/password', { method: 'POST', body: JSON.stringify({ currentPassword: cur, newPassword: neu }) });
          showToast(t('passwordUpdated'));
          document.getElementById('currentPassword').value = '';
          document.getElementById('newPassword').value = '';
       } catch (err) {
          showToast(localizedErrorMessage(err), true);
       } finally {
          cpBtn.textContent = state.lang === 'ar' ? 'تحديث كلمة المرور' : 'Update Password';
       }
    });

    const rotateRecoveryCodeBtn = document.getElementById('rotateRecoveryCodeBtn');
    if (rotateRecoveryCodeBtn) rotateRecoveryCodeBtn.addEventListener('click', async () => {
      const passwordInput = document.getElementById('recoveryRotatePassword');
      const status = document.getElementById('recoveryRotateStatus');
      const password = passwordInput.value;
      if (!password) {
        setAuthInlineStatus(status, t('errorPasswordRequired'), 'error');
        passwordInput.focus();
        return;
      }
      if (password.length < 8 || password.length > 128) {
        setAuthInlineStatus(status, t('errorPasswordInvalid'), 'error');
        passwordInput.focus();
        return;
      }
      rotateRecoveryCodeBtn.disabled = true;
      rotateRecoveryCodeBtn.setAttribute('aria-busy', 'true');
      rotateRecoveryCodeBtn.textContent = t('recoveryRotating');
      setAuthInlineStatus(status, '');
      try {
        const response = await apiFetch('/auth/recovery/rotate', {
          method: 'POST',
          body: JSON.stringify({ password }),
        });
        passwordInput.value = '';
        const recoveryCode = recoveryCodeFromResponse(response);
        if (!renderRecoveryCodeReceipt(recoveryCode)) {
          setAuthInlineStatus(status, t('recoveryCodeUnavailable'), 'error');
        }
      } catch (err) {
        setAuthInlineStatus(status, localizedErrorMessage(err, 'recoveryFailed'), 'error');
        passwordInput.focus();
      } finally {
        if (document.body.contains(rotateRecoveryCodeBtn)) {
          rotateRecoveryCodeBtn.disabled = false;
          rotateRecoveryCodeBtn.removeAttribute('aria-busy');
          rotateRecoveryCodeBtn.textContent = t('recoveryRotate');
        }
      }
    });
    
    if (previousFocus) restoreFocusTarget(previousFocus, '#signedInAccountPanel');
    return;
  }
  
  const isRecovery = mode === 'recover';
  const isRegister = mode === 'register';
  const activeTabId = isRecovery ? 'tabRecover' : isRegister ? 'tabRegister' : 'tabSignin';
  const submitLabel = isRecovery ? t('recoveryReset') : isRegister ? t('register') : t('signIn');
  els.authModalBody.innerHTML = `
    <div class="auth-tabs" role="tablist" aria-label="${escapeHtml(t('authTitle'))}">
      <button type="button" role="tab" class="auth-tab ${mode === 'signin' ? 'is-active' : ''}" id="tabSignin" data-auth-mode="signin" aria-selected="${mode === 'signin'}" aria-controls="authForm" tabindex="${mode === 'signin' ? '0' : '-1'}">${escapeHtml(t('authSignInTab'))}</button>
      <button type="button" role="tab" class="auth-tab ${isRegister ? 'is-active' : ''}" id="tabRegister" data-auth-mode="register" aria-selected="${isRegister}" aria-controls="authForm" tabindex="${isRegister ? '0' : '-1'}">${escapeHtml(t('authRegisterTab'))}</button>
      <button type="button" role="tab" class="auth-tab ${isRecovery ? 'is-active' : ''}" id="tabRecover" data-auth-mode="recover" aria-selected="${isRecovery}" aria-controls="authForm" tabindex="${isRecovery ? '0' : '-1'}">${escapeHtml(t('authRecoveryAction'))}</button>
    </div>
    <form class="auth-form" id="authForm" role="tabpanel" aria-labelledby="${activeTabId}">
      ${isRecovery ? `
        <div>
          <h3 id="recoveryFormTitle">${escapeHtml(t('recoveryFormTitle'))}</h3>
          <p class="muted" id="recoveryFormLead">${escapeHtml(t('recoveryFormLead'))}</p>
        </div>` : ''}
      <div class="form-row">
        <label>
          <span>${escapeHtml(mode === 'signin' ? t('usernameOrEmail') : t('username'))}</span>
          <input id="authUsername" autocomplete="username" required minlength="3" maxlength="${mode === 'signin' ? '254' : '20'}" inputmode="${mode === 'signin' ? 'email' : 'text'}" />
        </label>
        ${isRecovery ? `
        <label>
          <span>${escapeHtml(t('recoveryCode'))}</span>
          <input id="authRecoveryCode" class="recovery-code-input" dir="ltr" autocomplete="off" autocapitalize="none" spellcheck="false" required minlength="8" maxlength="128" />
        </label>` : `
        <label>
          <span>${escapeHtml(t('password'))}</span>
          <input id="authPassword" type="password" autocomplete="${mode === 'signin' ? 'current-password' : 'new-password'}" required minlength="8" maxlength="128" />
        </label>`}
      </div>
      ${isRegister ? `
      <div class="form-row">
        <label>
          <span>${escapeHtml(state.lang === 'ar' ? 'البريد الإلكتروني (اختياري)' : 'Email (optional)')}</span>
          <input id="authEmail" type="email" inputmode="email" autocomplete="email" maxlength="254" />
        </label>
        <label>
          <span>${escapeHtml(t('confirmPassword'))}</span>
          <input id="authConfirmPassword" type="password" autocomplete="new-password" required minlength="8" maxlength="128" />
        </label>
      </div>
      <p class="muted">${escapeHtml(t('registrationRecoveryNotice'))} <a href="${sharedRouteForLanguage('/privacy', state.lang)}" target="_blank" rel="noopener">${state.lang === 'ar' ? 'اقرأ إشعار الخصوصية وبيانات الحساب.' : 'Read the privacy and account-data notice.'}</a></p>` : ''}
      ${isRecovery ? `
      <div class="form-row">
        <label>
          <span>${escapeHtml(t('newPassword'))}</span>
          <input id="authNewPassword" type="password" autocomplete="new-password" required minlength="8" maxlength="128" />
        </label>
        <label>
          <span>${escapeHtml(t('confirmPassword'))}</span>
          <input id="authConfirmPassword" type="password" autocomplete="new-password" required minlength="8" maxlength="128" />
        </label>
      </div>` : ''}
      <p class="muted">${escapeHtml(t('passwordHint'))}</p>
      <p id="authFormStatus" class="auth-inline-status" role="status" aria-live="polite"></p>
      <div class="hero-actions">
        <button class="primary-btn" type="submit" id="authSubmitBtn">${escapeHtml(submitLabel)}</button>
      </div>
    </form>
  `;
  const authTabs = [...els.authModalBody.querySelectorAll('[role="tab"][data-auth-mode]')];
  const activateAuthTab = (tab) => {
    if (!tab || tab.getAttribute('aria-selected') === 'true') return;
    renderAuthModal(tab.dataset.authMode);
    focusAuthControl(tab.id);
  };
  authTabs.forEach((tab) => tab.addEventListener('click', () => activateAuthTab(tab)));
  els.authModalBody.querySelector('[role="tablist"]')?.addEventListener('keydown', (event) => {
    const currentIndex = authTabs.indexOf(event.target.closest('[role="tab"]'));
    if (currentIndex < 0) return;
    const forwardKey = state.lang === 'ar' ? 'ArrowLeft' : 'ArrowRight';
    const backwardKey = state.lang === 'ar' ? 'ArrowRight' : 'ArrowLeft';
    let nextIndex = currentIndex;
    if (event.key === forwardKey) nextIndex = (currentIndex + 1) % authTabs.length;
    else if (event.key === backwardKey) nextIndex = (currentIndex - 1 + authTabs.length) % authTabs.length;
    else if (event.key === 'Home') nextIndex = 0;
    else if (event.key === 'End') nextIndex = authTabs.length - 1;
    else return;
    event.preventDefault();
    activateAuthTab(authTabs[nextIndex]);
  });
  const form = document.getElementById('authForm');
  if (form) {
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const btn = document.getElementById('authSubmitBtn');
      const status = document.getElementById('authFormStatus');
      const password = isRecovery
        ? document.getElementById('authNewPassword').value
        : document.getElementById('authPassword').value;
      const passwordConfirmation = document.getElementById('authConfirmPassword')?.value || '';
      if ((isRegister || isRecovery) && password !== passwordConfirmation) {
        setAuthInlineStatus(status, t('passwordsDoNotMatch'), 'error');
        document.getElementById('authConfirmPassword')?.focus();
        return;
      }
      btn.disabled = true;
      btn.setAttribute('aria-busy', 'true');
      setAuthInlineStatus(status, '');
      btn.textContent = isRecovery
        ? t('recoveryResetting')
        : mode === 'signin'
        ? (state.lang === 'ar' ? 'جارٍ تسجيل الدخول…' : 'Signing in…')
        : (state.lang === 'ar' ? 'جارٍ إنشاء الحساب…' : 'Creating account…');
      
      const username = document.getElementById('authUsername').value.trim();
      const emailEl = document.getElementById('authEmail');
      const email = emailEl ? emailEl.value.trim() : null;
      let recoveryCode = '';
      
      try {
        if (mode === 'signin') {
          await apiFetch('/auth/login', { method: 'POST', body: JSON.stringify({ username, password }) });
        } else if (isRegister) {
          const response = await apiFetch('/auth/register', {
            method: 'POST',
            body: JSON.stringify({ username, password, email }),
          });
          recoveryCode = recoveryCodeFromResponse(response);
        } else {
          const response = await apiFetch('/auth/recovery/reset', {
            method: 'POST',
            body: JSON.stringify({
              username,
              recoveryCode: document.getElementById('authRecoveryCode').value.trim(),
              newPassword: password,
            }),
          });
          recoveryCode = recoveryCodeFromResponse(response);
        }

        await hydrateAuthenticatedExperience();
        if (!isRecovery) {
          trackEvent(mode === 'signin' ? 'login' : 'sign_up', { method: 'username' });
        }

        if (mode === 'signin') {
          closeModal('auth');
          showToast(t('signedIn'));
          const destination = postAuthDestination();
          if (destination) location.assign(destination);
        } else if (!renderRecoveryCodeReceipt(recoveryCode)) {
          renderAuthModal('signin');
          showToast(t('recoveryCodeUnavailable'), true);
        }
      } catch (err) {
        if (recoveryCode && (isRegister || isRecovery)) {
          renderRecoveryCodeReceipt(recoveryCode);
          showToast(t('recoverySyncWarning'), true);
        } else {
          const fallbackKey = isRecovery ? 'recoveryFailed' : 'badLogin';
          const message = localizedErrorMessage(err, fallbackKey);
          setAuthInlineStatus(status, message, 'error');
          showToast(message, true);
        }
      } finally {
        if (document.body.contains(btn)) {
          btn.disabled = false;
          btn.removeAttribute('aria-busy');
          btn.textContent = submitLabel;
        }
      }
    });
  }
  if (previousFocus) restoreFocusTarget(previousFocus, `#${activeTabId}`);
}



let catalogPromise = null;
async function loadCatalog() {
  if (state.catalog) return state.catalog;
  if (!catalogPromise) {
    catalogPromise = fetchJson('/data/catalog.json')
      .then(catalog => {
        state.catalog = catalog;
        return catalog;
      })
      .catch(error => {
        catalogPromise = null;
        throw error;
      });
  }
  return catalogPromise;
}

async function loadCategoryIfNeeded() {
  if (state.page !== 'category' || !state.categorySlug) return;
  const [raw] = await Promise.all([
    fetchJson(`/data/${state.categorySlug}.json`),
    loadCatalog(),
  ]);
  if (!Array.isArray(raw)) throw new Error(`Invalid category data: ${state.categorySlug}`);
  const meta = (state.catalog?.categories || []).find(c => c.slug === state.categorySlug) || {};
  state.categoryData = { ...meta, cards: raw };
}


// ================= ANALYTICS TRACKING =================
let _analyticsInterval = null;

// ── Audio narration ───────────────────────────────────────────────────────────

let _currentAudio = null;
let _pendingVoicesHandler = null;

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
      const onVoicesChanged = () => {
        if (_pendingVoicesHandler !== onVoicesChanged) return;
        _pendingVoicesHandler = null;
        doSpeak();
      };
      _pendingVoicesHandler = onVoicesChanged;
      window.speechSynthesis.addEventListener('voiceschanged', onVoicesChanged, { once: true });
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
  if (_pendingVoicesHandler && window.speechSynthesis) {
    window.speechSynthesis.removeEventListener('voiceschanged', _pendingVoicesHandler);
    _pendingVoicesHandler = null;
  }
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
  if (!els.suggestionSubmit || els.suggestionSubmit.dataset.suggestionBound === 'true') return;
  els.suggestionSubmit.dataset.suggestionBound = 'true';
  els.suggestionSubmit.addEventListener('click', async () => {
    const text = els.suggestionText?.value.trim() || '';
    if (text.length < 5) { showToast(t('suggestError'), true); return; }
    els.suggestionSubmit.disabled = true;
    try {
      await apiFetch('/suggestions', {
        method: 'POST',
        body: JSON.stringify({
          text,
          email: els.suggestionEmail?.value.trim() || undefined,
          saveWithAccount: els.suggestionLinkAccount?.checked === true,
        }),
      });
      clearToast();
      if (els.suggestionForm) els.suggestionForm.classList.add('hidden');
      if (els.suggestionThanks) els.suggestionThanks.classList.remove('hidden');
    } catch (error) {
      showToast(localizedErrorMessage(error, 'suggestionSubmitError'), true);
    } finally {
      els.suggestionSubmit.disabled = false;
    }
  });
}

// ─────────────────────────────────────────────────────────────────────────────

function trackEvent(name, params = {}) {
  if (window.JakhPrivacy?.analyticsAllowed?.() !== true) return;
  try { window.gtag?.('event', name, params); } catch (_) {}
}

function refreshAnalyticsHeartbeat() {
  if (state.apiAvailable && state.dbUser && state.accountAnalyticsAllowed) {
    startAnalyticsHeartbeat();
  } else {
    stopAnalyticsHeartbeat();
  }
}

function startAnalyticsHeartbeat() {
  if (_analyticsInterval || !state.dbUser || !state.accountAnalyticsAllowed) return;
  _analyticsInterval = setInterval(async () => {
    if (
      document.hidden
      || !state.dbUser
      || !state.accountAnalyticsAllowed
      || state.page !== 'category'
      || !state.categorySlug
    ) return;
    try {
      await apiFetch('/analytics/time', {
        method: 'POST',
        body: JSON.stringify({ pageSlug: state.categorySlug, timeSpent: 30 })
      });
    } catch (err) {}
  }, 30000);
}

function stopAnalyticsHeartbeat() {
  if (!_analyticsInterval) return;
  clearInterval(_analyticsInterval);
  _analyticsInterval = null;
}

// ======================================================


// ================= DAILY CHALLENGE =================
async function loadDailyChallenge() {
  if (state.dailyCard) return;
  const today = new Date().toISOString().split('T')[0];
  const cacheKey = `jakh-daily-${today}`;
  try {
    const cached = safeStorageGet('session', cacheKey);
    if (cached) { state.dailyCard = JSON.parse(cached); return; }
    if (!state.catalog) return;
    const hash = today.split('').reduce((h, c) => ((h * 31) + c.charCodeAt(0)) | 0, 0);
    const abs = Math.abs(hash);
    const cats = state.catalog.categories.filter(c => c.count >= 15 && c.mode !== 'story');
    const cat = cats[abs % cats.length];
    const raw = await fetchJson(`/data/${cat.slug}.json`);
    if (!Array.isArray(raw)) return;
    const cards = raw.filter(c => c.difficulty === 'easy' || c.difficulty === 'medium');
    if (!cards.length) return;
    const card = cards[(abs >> 4) % cards.length];
    state.dailyCard = { ...card, categorySlug: cat.slug, categoryTitle: cat.title, categoryEmoji: cat.emoji || '🎯' };
    safeStorageSet('session', cacheKey, JSON.stringify(state.dailyCard));
  } catch (e) { state.dailyCard = null; }
}

function renderDailyChallenge() {
  const mount = document.getElementById('dailyChallengeMount');
  if (!mount) return;
  if (!state.dailyCard) { mount.innerHTML = ''; return; }
  const card = state.dailyCard;
  const lang = state.lang;
  const today = new Date().toISOString().split('T')[0];
  const outcomeKey = `jakh-daily-outcome-${today}`;
  const outcome = loadJson(outcomeKey, null);
  const isDone = outcome?.cardId === card.id && ['correct', 'review'].includes(outcome?.result);
  const isFlipped = state.flipped.has('__daily__');
  const categoryHref = categoryRouteForLanguage(card.categorySlug, lang);
  const reviewMarkup = createReviewMarkup(card);
  mount.innerHTML = `
    <section class="shell daily-challenge-section">
      <div class="daily-challenge-card ${isDone ? 'daily-done' : ''}">
        <div>
          <p class="daily-challenge-eyebrow">🎯 ${lang === 'ar' ? 'تحدي اليوم' : "Today's Challenge"}${isDone ? ` <span class="daily-done-badge">${lang === 'ar' ? '✓ مكتمل' : '✓ Done'}</span>` : ''}</p>
          <p class="daily-challenge-meta">${escapeHtml(card.categoryEmoji)} ${escapeHtml(card.categoryTitle[lang])} &nbsp;·&nbsp; ${escapeHtml(t(card.difficulty === 'very-advanced' ? 'veryAdvanced' : card.difficulty))}</p>
          <p class="daily-challenge-q">${escapeHtml(card.question[lang])}</p>
          ${reviewMarkup}
          ${isFlipped ? `<div class="daily-challenge-answer" role="status">💡 ${escapeHtml(card.answer[lang])}</div>` : ''}
          ${isFlipped && !isDone ? `<div class="daily-outcome-actions" aria-label="${lang === 'ar' ? 'سجّل نتيجة إجابتك' : 'Record your answer outcome'}">
            <button class="primary-btn mini-btn" id="dailyKnewBtn">✓ ${lang === 'ar' ? 'كنت أعرفها' : 'I knew it'}</button>
            <button class="ghost-btn mini-btn" id="dailyReviewBtn">↻ ${lang === 'ar' ? 'راجعها مرة أخرى' : 'Review again'}</button>
          </div>` : ''}
          ${isDone ? `<p class="daily-outcome-note">${outcome.result === 'correct'
            ? (lang === 'ar' ? 'سُجلت كإجابة عرفتها.' : 'Recorded as an answer you knew.')
            : (lang === 'ar' ? 'سُجلت للمراجعة مرة أخرى.' : 'Recorded to review again.')}</p>` : ''}
        </div>
        <div class="daily-challenge-btns">
          <button class="primary-btn mini-btn" id="flipDailyBtn">${isFlipped ? escapeHtml(t('backToQuestion')) : escapeHtml(t('flipForAnswer'))}</button>
          <a class="ghost-btn mini-btn" href="${escapeHtml(categoryHref)}">${lang === 'ar' ? 'المزيد ←' : 'Full category →'}</a>
        </div>
      </div>
    </section>`;
  document.getElementById('flipDailyBtn')?.addEventListener('click', () => {
    if (state.flipped.has('__daily__')) state.flipped.delete('__daily__'); else state.flipped.add('__daily__');
    renderDailyChallenge();
  });
  const recordOutcome = (result) => {
    saveJson(outcomeKey, { cardId: card.id, categoryId: card.categorySlug, result, recordedAt: new Date().toISOString() });
    renderDailyChallenge();
  };
  document.getElementById('dailyKnewBtn')?.addEventListener('click', () => recordOutcome('correct'));
  document.getElementById('dailyReviewBtn')?.addEventListener('click', () => recordOutcome('review'));
}

function scrollToDailyChallenge() {
  requestAnimationFrame(() => {
    const target = document.querySelector('.daily-challenge-section') || document.getElementById('dailyChallengeMount');
    target?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
}

// ================= STREAKS =================
async function loadStreak() {
  if (!state.dbUser) { state.streak = 0; state.freezeCount = 0; return; }
  try {
    const data = await apiFetch('/user/streak', { method: 'POST' });
    state.streak = data.streak || 0;
    state.freezeCount = data.freezeCount || 0;
  } catch (e) { state.streak = 0; state.freezeCount = 0; }
}

// ================= TIMED QUIZ (Quiz Master Mode) =================
function clearTimedQuizTimers() {
  clearInterval(timedQuizState.timer);
  clearTimeout(timedQuizState.advanceTimeout);
  timedQuizState.timer = null;
  timedQuizState.advanceTimeout = null;
}

function isTimedQuizVisible() {
  const overlay = document.getElementById('timedQuizOverlay');
  return Boolean(overlay && !overlay.classList.contains('hidden'));
}

function createTimedQuizModal() {
  if (document.getElementById('timedQuizOverlay')) return;
  const lang = state.lang;
  const el = document.createElement('div');
  el.id = 'timedQuizOverlay';
  el.className = 'timed-quiz-overlay hidden';
  el.setAttribute('aria-hidden', 'true');
  el.innerHTML = `
    <div class="timed-quiz-card" role="dialog" aria-modal="true" aria-labelledby="tqDialogTitle">
      <h2 id="tqDialogTitle" class="sr-only">${lang === 'ar' ? 'اختبار السباق السريع' : 'Quick Fire quiz'}</h2>
      <div class="tq-header">
        <span id="tqProgressText" class="tq-progress-text">1 / 10</span>
        <div class="tq-timer-group">
          <span id="tqCountdown" class="timed-quiz-countdown">15</span>
          <span class="tq-sec">${escapeHtml(t('secondsShort'))}</span>
        </div>
        <button class="tq-exit-btn" id="tqExitBtn" aria-label="${escapeHtml(t('exit'))}">✕</button>
      </div>
      <div class="timed-quiz-track"><div id="tqTrackFill" class="timed-quiz-track-fill" style="width:100%"></div></div>
      <div class="tq-qna-block">
        <div class="tq-q-wrap">
          <span class="tq-block-label">${lang === 'ar' ? 'السؤال' : 'Question'}</span>
          <p id="tqQuestion" class="timed-quiz-question"></p>
          <div id="tqReview"></div>
        </div>
        <div id="tqAnswerWrap" class="tq-a-wrap hidden">
          <span class="tq-block-label tq-answer-label">${lang === 'ar' ? 'الإجابة' : 'Answer'}</span>
          <p id="tqAnswer" class="tq-answer-text" role="status"></p>
        </div>
      </div>
      <div id="tqOptions" class="timed-quiz-options" role="group" aria-label="${lang === 'ar' ? 'خيارات الإجابة' : 'Answer choices'}"></div>
      <div id="tqFeedback" class="timed-quiz-feedback" role="status" aria-live="polite"></div>
      <div id="tqActions" class="timed-quiz-actions">
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
  const exitQuiz = () => {
    timedQuizState.session += 1;
    clearTimedQuizTimers();
    const overlay = document.getElementById('timedQuizOverlay');
    if (overlay) {
      overlay.classList.add('hidden');
      overlay.setAttribute('aria-hidden', 'true');
      releaseFocus(overlay, { restore: true });
    }
  };
  document.getElementById('tqOptions')?.addEventListener('click', (event) => {
    const option = event.target.closest('[data-tq-option]');
    if (option) answerTimedCard(Number(option.dataset.tqOption));
  });
  document.getElementById('tqPlayAgain')?.addEventListener('click', startTimedQuiz);
  document.getElementById('tqExitBtn')?.addEventListener('click', exitQuiz);
  document.getElementById('tqClose')?.addEventListener('click', exitQuiz);
}

function startTimedQuiz() {
  if (!state.categoryData?.cards?.length) return;
  const eligible = state.categoryData.cards.filter(c => isLevelUnlocked(c.difficulty));
  const distinctAnswers = new Set(eligible.map(card => String(card.answer?.[state.lang] || '').trim().toLocaleLowerCase(state.lang)));
  if (distinctAnswers.size < 4) {
    showToast(state.lang === 'ar' ? 'لا تتوفر إجابات متنوعة كافية لهذا الاختبار.' : 'This topic does not have enough distinct answers for Quick Fire.', true);
    return;
  }
  const pool = shuffleArray(eligible).slice(0, Math.min(10, eligible.length));
  if (!pool.length) return;
  const overlay = document.getElementById('timedQuizOverlay');
  if (!overlay) return;
  clearTimedQuizTimers();
  timedQuizState.session += 1;
  timedQuizState.cards = pool;
  timedQuizState.index = 0;
  timedQuizState.score = 0;
  timedQuizState.completed = 0;
  timedQuizState.answered = false;
  trackEvent('timed_quiz_start', { category: state.categorySlug, total: pool.length });
  overlay.classList.remove('hidden');
  overlay.setAttribute('aria-hidden', 'false');
  document.getElementById('tqResult')?.classList.add('hidden');
  document.getElementById('tqActions')?.classList.remove('hidden');
  document.getElementById('tqQuestion')?.classList.remove('hidden');
  document.getElementById('tqOptions')?.classList.remove('hidden');
  showTimedCard();
  trapFocus(overlay, {
    key: 'quick-fire',
    initialFocus: '#tqOptions [data-tq-option="0"]',
    onEscape: () => document.getElementById('tqExitBtn')?.click(),
    returnFallback: '#playModeQuickFireBtn',
  });
}

function showTimedCard() {
  if (!isTimedQuizVisible()) return;
  const card = timedQuizState.cards[timedQuizState.index];
  if (!card) { endTimedQuiz(); return; }
  const lang = state.lang;
  const tqQ = document.getElementById('tqQuestion');
  const tqA = document.getElementById('tqAnswer');
  const tqAnswerWrap = document.getElementById('tqAnswerWrap');
  const tqOptions = document.getElementById('tqOptions');
  const tqFeedback = document.getElementById('tqFeedback');
  const tqReview = document.getElementById('tqReview');
  const tqPT = document.getElementById('tqProgressText');
  const tqCountdown = document.getElementById('tqCountdown');
  const tqFill = document.getElementById('tqTrackFill');
  if (tqQ) tqQ.textContent = card.question[lang];
  if (tqA) { tqA.textContent = ''; tqA.classList.remove('hidden'); }
  tqAnswerWrap?.classList.add('hidden');
  if (tqFeedback) { tqFeedback.textContent = ''; tqFeedback.className = 'timed-quiz-feedback'; }
  if (tqReview) tqReview.innerHTML = createReviewMarkup(card);
  if (tqPT) tqPT.textContent = `${timedQuizState.index + 1} / ${timedQuizState.cards.length}`;
  const canonical = String(card.answer?.[lang] || '');
  const canonicalKey = canonical.trim().toLocaleLowerCase(lang);
  const distractors = shuffleArray(state.categoryData.cards)
    .map(item => String(item.answer?.[lang] || '').trim())
    .filter((answer, index, list) => answer && answer.toLocaleLowerCase(lang) !== canonicalKey
      && list.findIndex(value => value.toLocaleLowerCase(lang) === answer.toLocaleLowerCase(lang)) === index)
    .slice(0, 3);
  timedQuizState.currentOptions = shuffleArray([canonical, ...distractors]);
  timedQuizState.correctOption = timedQuizState.currentOptions.findIndex(answer => answer.trim().toLocaleLowerCase(lang) === canonicalKey);
  timedQuizState.answered = false;
  if (tqOptions) {
    tqOptions.innerHTML = timedQuizState.currentOptions.map((answer, index) => `
      <button type="button" class="tq-option" data-tq-option="${index}"><span aria-hidden="true">${String.fromCharCode(65 + index)}</span><span dir="auto">${escapeHtml(answer)}</span></button>`).join('');
    tqOptions.querySelector('[data-tq-option="0"]')?.focus();
  }
  clearInterval(timedQuizState.timer);
  timedQuizState.timer = null;
  timedQuizState.timeLeft = 15;
  if (tqCountdown) { tqCountdown.textContent = '15'; tqCountdown.classList.remove('urgent'); }
  if (tqFill) { tqFill.style.transition = 'none'; tqFill.style.width = '100%'; setTimeout(() => { if (tqFill) tqFill.style.transition = 'width 1s linear'; }, 50); }
  const session = timedQuizState.session;
  const timer = setInterval(() => {
    if (timedQuizState.session !== session || !isTimedQuizVisible()) {
      clearInterval(timer);
      if (timedQuizState.timer === timer) timedQuizState.timer = null;
      return;
    }
    timedQuizState.timeLeft -= 1;
    if (tqCountdown) { tqCountdown.textContent = String(timedQuizState.timeLeft); if (timedQuizState.timeLeft <= 5) tqCountdown.classList.add('urgent'); }
    if (tqFill) tqFill.style.width = `${(timedQuizState.timeLeft / 15) * 100}%`;
    if (timedQuizState.timeLeft <= 0) {
      clearInterval(timer);
      if (timedQuizState.timer === timer) timedQuizState.timer = null;
      answerTimedCard(null, 'timeout');
    }
  }, 1000);
  timedQuizState.timer = timer;
}

function revealAndAdvance() {
  document.querySelectorAll('#tqOptions [data-tq-option]').forEach(button => { button.disabled = true; });
  clearTimeout(timedQuizState.advanceTimeout);
  const session = timedQuizState.session;
  const advanceTimeout = setTimeout(() => {
    if (timedQuizState.advanceTimeout !== advanceTimeout) return;
    timedQuizState.advanceTimeout = null;
    if (timedQuizState.session !== session || !isTimedQuizVisible()) return;
    timedQuizState.index++;
    timedQuizState.index >= timedQuizState.cards.length ? endTimedQuiz() : showTimedCard();
  }, 1400);
  timedQuizState.advanceTimeout = advanceTimeout;
}

function answerTimedCard(optionIndex, reason = 'answer') {
  if (!isTimedQuizVisible() || timedQuizState.answered) return false;
  timedQuizState.answered = true;
  clearInterval(timedQuizState.timer);
  timedQuizState.timer = null;
  const card = timedQuizState.cards[timedQuizState.index];
  if (!card) return false;
  const correct = Number.isInteger(optionIndex) && optionIndex === timedQuizState.correctOption;
  timedQuizState.completed += 1;
  if (correct) timedQuizState.score += 1;
  document.querySelectorAll('#tqOptions [data-tq-option]').forEach((button, index) => {
    button.disabled = true;
    if (index === timedQuizState.correctOption) button.classList.add('is-correct');
    if (index === optionIndex && !correct) button.classList.add('is-wrong');
  });
  const answer = document.getElementById('tqAnswer');
  const answerWrap = document.getElementById('tqAnswerWrap');
  const feedback = document.getElementById('tqFeedback');
  if (answer) answer.textContent = card.answer[state.lang];
  answerWrap?.classList.remove('hidden');
  if (feedback) {
    feedback.textContent = reason === 'timeout'
      ? (state.lang === 'ar' ? 'انتهى الوقت — سُجلت إجابة واحدة خاطئة.' : 'Time expired — recorded once as incorrect.')
      : correct
        ? (state.lang === 'ar' ? 'إجابة صحيحة.' : 'Correct.')
        : (state.lang === 'ar' ? 'إجابة غير صحيحة.' : 'Not correct.');
    feedback.classList.add(correct ? 'is-correct' : 'is-wrong');
  }
  void markCard(card.id, correct ? 'correct' : 'wrong');
  revealAndAdvance();
  return true;
}

function endTimedQuiz() {
  timedQuizState.session += 1;
  clearTimedQuizTimers();
  const score = timedQuizState.score;
  const total = timedQuizState.completed;
  const pct = total ? Math.round((score / total) * 100) : 0;
  document.getElementById('tqActions')?.classList.add('hidden');
  document.getElementById('tqQuestion')?.classList.add('hidden');
  document.getElementById('tqAnswerWrap')?.classList.add('hidden');
  document.getElementById('tqOptions')?.classList.add('hidden');
  document.getElementById('tqResult')?.classList.remove('hidden');
  const scoreBig = document.getElementById('tqScoreBig');
  const scoreSub = document.getElementById('tqScoreSub');
  if (scoreBig) scoreBig.textContent = `${score} / ${total}`;
  const lang = state.lang;
  if (scoreSub) scoreSub.textContent = pct >= 80 ? (lang === 'ar' ? '🏆 ممتاز!' : '🏆 Excellent!') : pct >= 60 ? (lang === 'ar' ? '👍 عمل جيد!' : '👍 Good job!') : (lang === 'ar' ? '💪 استمر في التدريب!' : '💪 Keep practicing!');
  trackEvent('timed_quiz_end', { category: state.categorySlug, score, total, pct });
  if (total === timedQuizState.cards.length && total >= 10 && pct >= 80) saveJson('jakh-speed-demon', 1);
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
    const challengeUrl = `${location.origin}${categoryRouteForLanguage(state.categorySlug, lang)}`;
    const ctaEl = document.createElement('div');
    ctaEl.className = 'tq-challenge-cta';
    ctaEl.innerHTML = `
      <p>💡 ${lang === 'ar' ? 'هل تريد تحدي شخص ما؟' : 'Want to challenge someone?'}</p>
      <div class="tq-challenge-cta-btns">
        <button class="mini-btn" id="tqChallengeFriendBtn">🏆 ${lang === 'ar' ? 'تحدٍ صديق' : 'Challenge a Friend'}</button>
        <button class="mini-btn" id="tqBattleBtn">⚡ ${lang === 'ar' ? 'غرفة معركة مباشرة' : 'Live Battle Room'}</button>
      </div>`;
    resultEl.appendChild(ctaEl);
    document.getElementById('tqChallengeFriendBtn')?.addEventListener('click', () => {
      const isAr = lang === 'ar';
      const text = isAr
        ? `🏆 حصلت على ${score}/${total} في "${catTitle}" على JAKH!\nهل تستطيع التفوق عليّ؟ ← ${challengeUrl}`
        : `🏆 I scored ${score}/${total} in "${catTitle}" on JAKH!\nCan you beat me? → ${challengeUrl}`;
      void shareOrCopy({
        title: t('shareChallengeTitle'), text, url: challengeUrl,
        copiedMessage: isAr ? 'تم نسخ التحدي!' : 'Challenge copied!',
      });
    });
    document.getElementById('tqBattleBtn')?.addEventListener('click', () => {
      const overlay = document.getElementById('timedQuizOverlay');
      timedQuizState.session += 1;
      clearTimedQuizTimers();
      if (overlay) {
        overlay.classList.add('hidden');
        overlay.setAttribute('aria-hidden', 'true');
        releaseFocus(overlay, { discard: true });
      }
      openBattleModal(state.categorySlug);
    });
  }
  checkNewAchievements();
}

// ================= LAZY SEARCH + LEADERBOARD =================

const SEARCH_LEADERBOARD_MODULE_PATH = '/search-leaderboard.js';
const SEARCH_LEADERBOARD_STYLES_PATH = '/search-leaderboard.css';
let _searchLeaderboard = null;
let _searchLeaderboardPromise = null;
let _searchLeaderboardStylesPromise = null;

function loadSearchLeaderboardStyles() {
  if (_searchLeaderboardStylesPromise) return _searchLeaderboardStylesPromise;
  _searchLeaderboardStylesPromise = new Promise((resolve, reject) => {
    const existing = document.getElementById('searchLeaderboardStyles');
    if (existing?.sheet) {
      resolve();
      return;
    }
    const link = existing || document.createElement('link');
    link.id = 'searchLeaderboardStyles';
    link.rel = 'stylesheet';
    link.href = SEARCH_LEADERBOARD_STYLES_PATH;
    link.addEventListener('load', resolve, { once: true });
    link.addEventListener('error', () => reject(new Error('Search/leaderboard stylesheet failed to load')), { once: true });
    if (!existing) document.head.appendChild(link);
  }).catch((error) => {
    document.getElementById('searchLeaderboardStyles')?.remove();
    _searchLeaderboardStylesPromise = null;
    throw error;
  });
  return _searchLeaderboardStylesPromise;
}

function loadSearchLeaderboard() {
  if (_searchLeaderboard) return Promise.resolve(_searchLeaderboard);
  if (!_searchLeaderboardPromise) {
    _searchLeaderboardPromise = Promise.all([
      loadSearchLeaderboardStyles(),
      import(SEARCH_LEADERBOARD_MODULE_PATH),
    ]).then(([, module]) => {
      if (typeof module.createSearchLeaderboard !== 'function') throw new Error('Invalid search/leaderboard module');
      _searchLeaderboard = module.createSearchLeaderboard({
        apiFetch,
        categoryRouteForLanguage,
        closeModal,
        createReviewMarkup,
        debounce,
        escapeHtml,
        fetchJson,
        localizedErrorMessage,
        openAuthModal,
        releaseFocus,
        showToast,
        state,
        t,
        trapFocus,
      });
      return _searchLeaderboard;
    }).catch((error) => {
      _searchLeaderboardPromise = null;
      throw error;
    });
  }
  return _searchLeaderboardPromise;
}

async function openGlobalSearch(initialValue = '') {
  try {
    const feature = await loadSearchLeaderboard();
    feature.openGlobalSearch(initialValue);
  } catch (error) {
    console.error('Unable to load global search', error);
    showToast(t('globalSearchUnavailable'), true);
  }
}

async function openLeaderboard() {
  try {
    const feature = await loadSearchLeaderboard();
    await feature.openLeaderboard();
  } catch (error) {
    console.error('Unable to load leaderboard', error);
    showToast(t('leaderboardLoadError'), true);
  }
}

// ================= RANDOM CATEGORY =================
function randomCategory() {
  if (!state.catalog) return;
  const cats = state.catalog.categories;
  location.assign(cats[Math.floor(Math.random() * cats.length)].href);
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
  el.dataset.categorySlug = slug;
  el.innerHTML = `
    <div class="modal-backdrop" id="catCompleteBackdrop"></div>
    <div class="modal-card category-complete-card" role="dialog" aria-modal="true" aria-labelledby="categoryCompleteTitle">
      <div class="category-complete-top" style="background:${categoryGradient(slug)}">
        <span class="category-complete-emoji">${escapeHtml(meta.emoji)}</span>
      </div>
      <div class="category-complete-body">
        <h2 id="categoryCompleteTitle" style="margin:0 0 0.25rem;">${lang === 'ar' ? '🎉 أكملت الفئة!' : '🎉 Category Complete!'}</h2>
        <p style="margin:0 0 1rem;color:var(--muted);font-size:0.9rem;">${escapeHtml(meta.title[lang])}</p>
        <div class="stats-grid" style="margin-bottom:1.2rem;">
          <div class="stat-box"><span>${lang === 'ar' ? 'صحيح' : 'Correct'}</span><strong style="color:var(--easy)">${solved}</strong></div>
          <div class="stat-box"><span>${lang === 'ar' ? 'خاطئ' : 'Wrong'}</span><strong style="color:var(--danger)">${wrong}</strong></div>
          <div class="stat-box"><span>${lang === 'ar' ? 'النقاط' : 'Points'}</span><strong>${points}</strong></div>
        </div>
        <div class="hero-actions" style="justify-content:center;flex-wrap:wrap;gap:0.75rem;">
          <button class="secondary-btn" id="catCompleteShare">🔗 ${lang === 'ar' ? 'شارك النتيجة' : 'Share result'}</button>
          <button class="ghost-btn" id="catCompleteBattle">⚡ ${lang === 'ar' ? 'غرفة معركة مباشرة' : 'Live Battle Room'}</button>
          ${related ? `<a class="primary-btn" href="${escapeHtml(categoryRouteForLanguage(related.slug, lang))}" style="text-decoration:none;">${lang === 'ar' ? 'الفئة التالية ←' : 'Next category →'}</a>` : ''}
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
  const closeCategoryComplete = ({ restore = true } = {}) => {
    el.classList.add('hidden');
    el.setAttribute('aria-hidden', 'true');
    releaseFocus(el, { restore, discard: !restore });
  };
  document.getElementById('catCompleteBackdrop')?.addEventListener('click', () => closeCategoryComplete());
  document.getElementById('catCompleteClose')?.addEventListener('click', () => closeCategoryComplete());
  document.getElementById('catCompleteShare')?.addEventListener('click', () => shareResult(solved, meta.count, meta.title[lang]));
  document.getElementById('catCompleteBattle')?.addEventListener('click', () => {
    closeCategoryComplete({ restore: false });
    openBattleModal(slug);
  });
  document.getElementById('catCompleteChallengeBtn')?.addEventListener('click', () => {
    const isAr = lang === 'ar';
    const url = `${location.origin}${categoryRouteForLanguage(slug, lang)}`;
    const text = isAr
      ? `🏆 أنهيت "${meta.title.ar}" على JAKH بـ ${points} نقطة!\nهل تستطيع التفوق عليّ؟ ← ${url}`
      : `🏆 I finished "${meta.title.en}" on JAKH with ${points} pts!\nCan you beat me? → ${url}`;
    void shareOrCopy({
      title: t('shareChallengeTitle'), text, url,
      copiedMessage: isAr ? 'تم نسخ التحدي!' : 'Challenge copied!',
    });
  });
  trapFocus(el, {
    key: 'category-complete',
    initialFocus: '#catCompleteClose',
    onEscape: () => closeCategoryComplete(),
    returnFallback: '#cardGrid [data-action="unmark"], #cardGrid [data-action="flip"]',
  });
  checkNewAchievements();
}

// ================= SHARE =================
function showSelectableShareFallback(payload) {
  let modal = document.getElementById('shareFallbackModal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'shareFallbackModal';
    modal.className = 'modal hidden';
    modal.setAttribute('aria-hidden', 'true');
    document.body.appendChild(modal);
  }
  const close = () => {
    modal.classList.add('hidden');
    modal.setAttribute('aria-hidden', 'true');
    releaseFocus(modal, { restore: true });
  };
  modal.innerHTML = `
    <div class="modal-backdrop" data-share-fallback-close></div>
    <div class="modal-card share-fallback-card" role="dialog" aria-modal="true" aria-labelledby="shareFallbackTitle">
      <h2 id="shareFallbackTitle">${state.lang === 'ar' ? 'انسخ النص للمشاركة' : 'Copy this share text'}</h2>
      <p>${state.lang === 'ar' ? 'تعذر فتح المشاركة أو الحافظة. حدّد النص أدناه وانسخه يدويًا.' : 'Sharing and Clipboard are unavailable. Select the text below and copy it manually.'}</p>
      <textarea id="shareFallbackText" readonly dir="auto">${escapeHtml(payload)}</textarea>
      <button type="button" class="primary-btn" data-share-fallback-close>${state.lang === 'ar' ? 'إغلاق' : 'Close'}</button>
    </div>`;
  modal.querySelectorAll('[data-share-fallback-close]').forEach(button => button.addEventListener('click', close));
  modal.classList.remove('hidden');
  modal.setAttribute('aria-hidden', 'false');
  trapFocus(modal, {
    key: 'share-fallback',
    initialFocus: '#shareFallbackText',
    onEscape: close,
  });
  const textarea = document.getElementById('shareFallbackText');
  textarea?.focus();
  textarea?.select();
}

async function shareOrCopy({ title, text, url = '', copiedMessage = '' }) {
  const payload = [text, url && !String(text).includes(url) ? url : ''].filter(Boolean).join('\n');
  if (typeof navigator.share === 'function') {
    try {
      await navigator.share({ title, text, ...(url ? { url } : {}) });
      return 'shared';
    } catch (error) {
      if (error?.name === 'AbortError') return 'cancelled';
    }
  }
  try {
    if (typeof navigator.clipboard?.writeText !== 'function') throw new Error('Clipboard unavailable');
    await navigator.clipboard.writeText(payload);
    showToast(copiedMessage || t('shareCopied'));
    return 'copied';
  } catch (_) {
    showSelectableShareFallback(payload);
    return 'manual';
  }
}

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
  trackEvent('share_card', {
    category: state.categorySlug,
    card_id: cardId,
    language: state.lang,
  });
  void shareOrCopy({
    title: t('shareRiddleTitle'), text, url,
    copiedMessage: isAr ? 'تم نسخ السؤال!' : 'Question copied!',
  });
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
  trackEvent('share_result', {
    category: state.categorySlug,
    score,
    total,
    percent: pct,
    language: state.lang,
  });
  void shareOrCopy({ title: t('shareRiddleTitle'), text, url, copiedMessage: t('shareCopied') });
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
      <a href="/" class="bottom-nav-tab" data-tab="home" aria-label="${isAr ? 'الرئيسية' : 'Home'}">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 9.5L12 3l9 6.5V20a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V9.5z"/><polyline points="9 21 9 12 15 12 15 21"/></svg>
        <span>${isAr ? 'الرئيسية' : 'Home'}</span>
      </a>
      <a href="/mind-lab" class="bottom-nav-tab" data-tab="explore" aria-label="${isAr ? 'استكشف' : 'Explore'}">
        <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></svg>
        <span>${isAr ? 'استكشف' : 'Explore'}</span>
      </a>
      <a href="/play" class="bottom-nav-tab" data-tab="games" aria-label="${isAr ? 'الألعاب' : 'Games'}">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 8h8a5 5 0 0 1 4.8 6.4l-1 3.3a2 2 0 0 1-3.3.9L14 16h-4l-2.5 2.6a2 2 0 0 1-3.3-.9l-1-3.3A5 5 0 0 1 8 8z"/><path d="M7 12v4M5 14h4M16.5 12.5h.01M18.5 14.5h.01"/></svg>
        <span>${isAr ? 'الألعاب' : 'Games'}</span>
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
  localizeSharedRuntimeLinks(nav);

  document.getElementById('bnDailyBtn')?.addEventListener('click', () => {
    if (document.getElementById('dailyChallengeMount')) {
      scrollToDailyChallenge();
    } else {
      safeStorageSet('session', 'jakh-scroll-to', 'daily');
      location.href = sharedRouteForLanguage('/', state.lang);
    }
  });
  document.getElementById('bnProfileBtn')?.addEventListener('click', () => {
    document.getElementById('openAuthBtn')?.click();
  });

  updateBottomNavActive();
  refreshFixedUiLayout();
}

function updateBottomNavActive() {
  const nav = document.getElementById('bottomNav');
  if (!nav) return;
  const normalizedPath = normalizeSharedRoutePath(location.pathname);
  const sharedRoute = sharedLanguageRoute();
  const isMindLab = normalizedPath === '/mind-lab' || sharedRoute?.en === '/mind-lab';
  const isGameHub = state.page === 'play' || normalizedPath === '/play' || sharedRoute?.en === '/play';
  const activeTab = isGameHub
    ? 'games'
    : state.page === 'home' && !isMindLab
      ? 'home'
      : 'explore';
  nav.querySelectorAll('.bottom-nav-tab').forEach(tab => {
    const isActive = tab.dataset.tab === activeTab;
    tab.classList.toggle('is-active', isActive);
    if (isActive && tab.matches('a')) tab.setAttribute('aria-current', 'page');
    else tab.removeAttribute('aria-current');
  });
  const isAr = state.lang === 'ar';
  const labels = {
    home:    isAr ? 'الرئيسية' : 'Home',
    explore: isAr ? 'استكشف'  : 'Explore',
    games:   isAr ? 'الألعاب'  : 'Games',
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
    games:   isAr ? 'الألعاب'  : 'Games',
    daily:   isAr ? 'التحدي اليومي' : 'Daily',
    profile: isAr ? 'حسابي'   : 'Profile',
  };
  nav.querySelectorAll('.bottom-nav-tab').forEach(tab => {
    if (ariaLabels[tab.dataset.tab]) tab.setAttribute('aria-label', ariaLabels[tab.dataset.tab]);
  });
}

async function hydrateCloudCapabilities() {
  if (!sessionInitialized) {
    state.apiAvailable = await detectApiAvailability(2);
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
    state.apiChecked = true;
  }
  hydrateCloudFeatureUi();
}

function hydrateCloudFeatureUi() {
  const suggestionAccountLabel = els.suggestionLinkAccount?.closest('.suggestion-account-link');
  if (suggestionAccountLabel) suggestionAccountLabel.hidden = !state.dbUser;
  if (!state.dbUser && els.suggestionLinkAccount) els.suggestionLinkAccount.checked = false;
  if (state.apiAvailable) {
    refreshAnalyticsHeartbeat();
  } else {
    stopAnalyticsHeartbeat();
  }
  // A health probe is advisory; each feature owns its request and retry state.
  // Search and leaderboard UI stays unloaded until its first invocation.
  createBattleModal();
  initSuggestionBox();
  renderCategoryPlayModes();
  applyStaticCopy();
  rerender();
  applyCapabilityVisibility();
}

async function init() {
  cacheEls();
  if (!initializeFromStorage()) return;
  applyDocumentLanguage();
  bindCommonEvents();
  applyCapabilityVisibility();
  createTimedQuizModal();
  await Promise.all([loadCatalog(), loadCategoryIfNeeded()]);
  applyStaticCopy();
  rerender();
  injectBottomNav();
  injectBackToTop();
  applyCapabilityVisibility();
  checkNewAchievements();
  if (state.page === 'home') {
    loadDailyChallenge()
      .then(() => renderDailyChallenge())
      .catch(() => {});
  }
  // Cloud account and multiplayer checks hydrate after local content is
  // already usable, so a slow API never leaves the page blank.
  hydrateCloudCapabilities().catch(() => {
    state.apiAvailable = false;
    state.apiChecked = true;
    sessionInitialized = true;
    applyCapabilityVisibility();
  });
  const dailyParams = new URLSearchParams(location.search);
  const dailySessionRequested = safeStorageGet('session', 'jakh-scroll-to') === 'daily';
  const dailyShortcutRequested = dailyParams.get('daily') === '1';
  if (state.page === 'home' && (dailySessionRequested || dailyShortcutRequested)) {
    safeStorageRemove('session', 'jakh-scroll-to');
    if (dailyShortcutRequested) {
      const cleanUrl = new URL(location.href);
      cleanUrl.searchParams.delete('daily');
      history.replaceState(null, '', `${cleanUrl.pathname}${cleanUrl.search}${cleanUrl.hash}`);
    }
    scrollToDailyChallenge();
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
      <div class="play-mode-card play-mode-team">
        <div class="play-mode-head">
          <span class="play-mode-icon">🏆</span>
          <div>
            <strong class="play-mode-title">${isAr ? 'غرفة المعركة' : 'Battle Room'}</strong>
            <p class="play-mode-sub">${isAr ? 'منافسة مباشرة فردية للجميع عبر الخادم — حتى 20 لاعبًا' : 'Live server-hosted free-for-all — up to 20 players'}</p>
            ${state.apiChecked && !state.apiAvailable ? `<p class="play-mode-service-note" role="status">${isAr ? 'الخدمة غير متاحة مؤقتًا؛ يمكنك إعادة المحاولة.' : 'Service is temporarily unreachable; you can still retry.'}</p>` : ''}
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
      </div>
    </div>`;

  const questionSection = document.getElementById('questionSection');
  if (questionSection) {
    questionSection.parentNode.insertBefore(el, questionSection);
  }
  document.getElementById('playModeQuickFireBtn')?.addEventListener('click', startTimedQuiz);
  document.getElementById('playModeCreateRoomBtn')?.addEventListener('click', () => {
    openBattleModal(state.categorySlug, 'create');
  });
  document.getElementById('playModeJoinBtn')?.addEventListener('click', () => {
    openBattleModal(state.categorySlug, 'join');
  });
}

// ================= LAZY BATTLE MODE =================

const BATTLE_CODE_PATTERN = /^[A-Z]{3}[A-HJ-NP-Z2-9]{5}$/;
const BATTLE_MODULE_PATH = '/battle-mode.js';
const BATTLE_STYLES_PATH = '/battle-mode.css';
let _battleMode = null;
let _battleModePromise = null;
let _battleStylesPromise = null;
let _battleOpenGeneration = 0;

function normalizeBattleCode(value) {
  return String(value || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function createBattleModal() {
  if (document.getElementById('battleOverlay')) return;
  const overlay = document.createElement('div');
  overlay.id = 'battleOverlay';
  // The shared modal shell gives immediate loading/error feedback without
  // pulling either feature stylesheet into the initial route.
  overlay.className = 'modal hidden';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-hidden', 'true');
  overlay.setAttribute('aria-labelledby', 'battleLoadingTitle');
  document.body.appendChild(overlay);
}

function activateBattleFocus(initialFocus = '#battleExitBtn') {
  const overlay = document.getElementById('battleOverlay');
  if (!overlay) return;
  trapFocus(overlay, {
    key: 'battle',
    initialFocus,
    onEscape: closeBattleModal,
    returnFallback: '#battleNavBtn, #playModeCreateRoomBtn, #playModeJoinBtn, #tqBattleBtn, #catCompleteBattle',
  });
}

function deactivateBattleFocus() {
  const overlay = document.getElementById('battleOverlay');
  if (overlay) releaseFocus(overlay, { restore: true });
}

function loadBattleStylesheet() {
  if (_battleStylesPromise) return _battleStylesPromise;
  _battleStylesPromise = new Promise((resolve, reject) => {
    const existing = document.getElementById('battleModeStyles');
    if (existing?.sheet) {
      resolve();
      return;
    }
    const link = existing || document.createElement('link');
    link.id = 'battleModeStyles';
    link.rel = 'stylesheet';
    link.href = BATTLE_STYLES_PATH;
    link.addEventListener('load', resolve, { once: true });
    link.addEventListener('error', () => reject(new Error('Battle stylesheet failed to load')), { once: true });
    if (!existing) document.head.appendChild(link);
  }).catch((error) => {
    document.getElementById('battleModeStyles')?.remove();
    _battleStylesPromise = null;
    throw error;
  });
  return _battleStylesPromise;
}

function loadBattleMode() {
  if (_battleMode) return Promise.resolve(_battleMode);
  if (!_battleModePromise) {
    _battleModePromise = Promise.all([
      loadBattleStylesheet(),
      import(BATTLE_MODULE_PATH),
    ]).then(([, module]) => {
      if (typeof module.createBattleMode !== 'function') throw new Error('Invalid Battle module');
      _battleMode = module.createBattleMode({
        API_ORIGIN,
        apiFetch,
        escapeHtml,
        localizedErrorMessage,
        shareOrCopy,
        showToast,
        state,
        t,
        activateFocus: activateBattleFocus,
        deactivateFocus: deactivateBattleFocus,
      });
      return _battleMode;
    }).catch((error) => {
      _battleModePromise = null;
      throw error;
    });
  }
  return _battleModePromise;
}

async function openBattleModal(slug, tab = 'create', initialCode = '') {
  createBattleModal();
  const overlay = document.getElementById('battleOverlay');
  if (!overlay) return;
  if (_battleMode) {
    _battleMode.openBattleModal(slug, tab, initialCode);
    return;
  }
  const generation = ++_battleOpenGeneration;
  const isAr = state.lang === 'ar';
  overlay.className = 'modal';
  overlay.classList.remove('hidden');
  overlay.setAttribute('aria-hidden', 'false');
  overlay.setAttribute('aria-busy', 'true');
  overlay.innerHTML = `
    <div class="modal-backdrop"></div>
    <div class="modal-card">
      <div class="modal-head">
        <strong id="battleLoadingTitle">${isAr ? '⚡ جارٍ تحميل غرفة المعركة…' : '⚡ Loading Battle Room…'}</strong>
        <button class="icon-btn" id="battleLoadExitBtn" aria-label="${escapeHtml(t('close'))}">✕</button>
      </div>
    </div>`;
  document.getElementById('battleLoadExitBtn')?.addEventListener('click', closeBattleModal);
  activateBattleFocus('#battleLoadExitBtn');
  try {
    const mode = await loadBattleMode();
    if (generation !== _battleOpenGeneration || overlay.classList.contains('hidden')) return;
    overlay.removeAttribute('aria-busy');
    overlay.setAttribute('aria-labelledby', 'battleTitle');
    overlay.className = 'battle-overlay';
    mode.openBattleModal(slug, tab, initialCode);
  } catch (error) {
    console.error('Unable to load Battle Room', error);
    if (generation !== _battleOpenGeneration || overlay.classList.contains('hidden')) return;
    overlay.removeAttribute('aria-busy');
    const message = isAr
      ? 'تعذّر تحميل غرفة المعركة. تحقق من الاتصال وحاول مرة أخرى.'
      : 'Battle Room could not load. Check your connection and try again.';
    overlay.className = 'modal';
    overlay.innerHTML = `
      <div class="modal-backdrop"></div>
      <div class="modal-card">
        <div class="modal-head">
          <strong id="battleLoadingTitle">${escapeHtml(message)}</strong>
          <button class="icon-btn" id="battleLoadExitBtn" aria-label="${escapeHtml(t('close'))}">✕</button>
        </div>
      </div>`;
    document.getElementById('battleLoadExitBtn')?.addEventListener('click', closeBattleModal);
    activateBattleFocus('#battleLoadExitBtn');
    showToast(message, true);
  }
}

function closeBattleModal() {
  _battleOpenGeneration += 1;
  if (_battleMode) {
    _battleMode.closeBattleModal();
    return;
  }
  const overlay = document.getElementById('battleOverlay');
  overlay?.classList.add('hidden');
  overlay?.setAttribute('aria-hidden', 'true');
  overlay?.removeAttribute('aria-busy');
  deactivateBattleFocus();
}

function renderBattleUI() {
  if (_battleMode) _battleMode.renderBattleUI();
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

  }
  init().catch((error) => {
    console.error(error);
    showToast(localizedErrorMessage(error, 'initializationError'), true);
  });
});
