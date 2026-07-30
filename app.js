
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
    homeEyebrow: '3,553 bilingual riddles — English & Arabic',
    homeTitle: 'Pick a topic. Flip cards. See how much you know.',
    homeText: 'Choose a category, tap a card to reveal the answer, then mark it right or wrong. Free forever, no app needed.',
    browseCategories: 'Explore topics',
    heroGameHub: 'Game Hub',
    statCategories: 'Topics',
    statQuestions: 'Questions',
    statLanguages: 'Languages',
    mindHeroEyebrow: '3,500+ bilingual riddles — English & Arabic',
    mindHeroTitle: 'The Mind Lab',
    mindHeroSubtitle: 'Pick a topic. Flip cards. See how much you know.',
    playHeroTitle: 'Game Arena',
    playHeroSubtitle: 'No download. No sign-up. Just play — straight from your browser on any device.',
    playHeroGames: 'Games',
    playAvailable: '10 games available now',
    playPick: 'Pick a game',
    playBrowserOnly: 'All games run entirely in your browser — nothing installed.',
    playChessAria: 'Play Chess',
    playChessTitle: 'Chess',
    playChessDesc: 'Full chess with legal move highlighting, en passant, castling, and promotion. Play against the AI or take turns with a friend.',
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
    playBackgammonDesc: 'Race all 15 checkers around the 24-point board and bear them off before your opponent. Real dice, legal moves enforced, greedy AI.',
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
    portalMindDesc: '3,553 bilingual questions mapped directly into 56 topics across 5 clear sections. Pick a topic, flip cards, and track your score.',
    portalMindStat: '56 topics',
    portalMindCta: 'Explore Riddles →',
    portalGamesTag: 'Game Hub',
    portalGamesTitle: 'The Game Hub',
    portalGamesDesc: 'Chess, Mastermind, Go, Reversi, Codenames, Catan, Backgammon, Set, Hanabi, Diplomacy — 10 fully playable browser games. No download, no sign-up.',
    portalGamesStat1: '10 games live',
    portalGamesStat2: 'All in browser',
    portalGamesCta: 'Play Now →',
    homeCollectionsEyebrow: 'Popular ways to start',
    homeCollectionsTitle: 'Focused riddles and quiz collections',
    homeCollectionsText: 'Open a compact collection with every question visible and every answer one tap away, then continue into the full Mind Lab.',
    homeCollectionsCta: 'Browse all collections',
    homeCollectionArabicTitle: 'Arabic riddles with answers',
    homeCollectionArabicMeta: '16 bilingual riddles',
    homeCollectionKidsTitle: 'Kids’ riddles with answers',
    homeCollectionKidsMeta: 'Friendly, family-safe clues',
    homeCollectionLogicTitle: 'Logic puzzles with explanations',
    homeCollectionLogicMeta: 'Deduction, numbers, and careful reading',
    homeCollectionFootballTitle: 'Football rules & tactics',
    homeCollectionFootballMeta: '16 practical bilingual questions',
    homeSocialEyebrow: 'New riddles and updates',
    homeSocialTitle: 'Follow JAKH Riddles',
    homeSocialText: 'Keep up with new questions, collections, and game updates on JAKH’s social pages.',
    homeSocialLabel: 'JAKH social pages',
    footerCollections: 'Collections',
    footerAbout: 'About & content standards',
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
    teamBattle: 'Team Battle',
    backToTop: 'Back to top',
    searchPlaceholder: 'Search topics and subtopics...',
    cardSearchPlaceholder: 'Search by keyword, answer, or concept...',
    homeSrTitle: 'Riddles and quizzes in English and Arabic',
    standardsDefaultText: 'Questions are curated for learning and entertainment.',
    standardsDefaultLink: 'See how JAKH reviews and improves content.',
    standardsEducationLabel: 'Educational use:',
    standardsEducationText: 'This quiz is for learning and entertainment, not medical, legal, financial, or mental-health advice.',
    standardsEducationLink: 'Read our content standards.',
    mindCalloutEyebrow: 'Prefer a shorter challenge?',
    mindCalloutTitle: 'Try a focused bilingual collection',
    mindCalloutText: 'Start with 16 curated riddles, kids’ questions, logic puzzles, general knowledge, football, or nostalgia questions.',
    mindCalloutCta: 'Browse collections',
    createAccount: 'Save my progress',
    todayMomentum: 'Your snapshot',
    localBrowserOnly: 'Saved to your account',
    categoryEyebrow: 'Choose a section',
    categoryTitle: 'What would you like to explore?',
    categoryText: 'Choose one of 5 clear sections, then open a topic directly—no extra layer.',
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
    leaderboardTitle: 'Leaderboard',
    leaderboardTop: 'Verified rankings are coming',
    leaderboardDisclaimer: 'Public rankings are paused while we build server-verified scoring.',
    leaderboardEmpty: 'Your personal progress still works. Fair community rankings will return after verification is ready.',
    leaderboardLoadError: 'Could not load the leaderboard.',
    pointsShort: 'pts',
    globalSearchLabel: 'Global search',
    globalSearchPlaceholder: 'Search all 3,500+ questions…',
    globalSearchInputLabel: 'Search all questions',
    globalSearchStart: 'Start typing to search across all categories…',
    globalSearchMin: 'Type at least 2 characters…',
    globalSearchUnavailable: 'Search is unavailable right now.',
    globalSearchEmpty: 'No results.',
    installPrompt: '📲 Add JAKH to your home screen for quick access',
    install: 'Install',
    secondsShort: 's',
    // Streak freeze
    streakFreezeLabel: '🧊 Freeze',
  },
  ar: {
    brandSubtitle: 'فئات ثنائية اللغة مع فرق وتقدّم محفوظ',
    navHome: 'الرئيسية',
    navCategories: 'الفئات',
    authOpen: 'تسجيل الدخول',
    language: 'اللغة',
    homeEyebrow: '3,553 لغزاً ثنائي اللغة — عربي وإنجليزي',
    homeTitle: 'اختر موضوعًا، اقلب البطاقات، واكتشف قدراتك.',
    homeText: 'اختر فئة، اضغط على البطاقة لتظهر الإجابة، ثم حدّد إجابتك صحيحة أم خاطئة. مجاني تمامًا وبدون تطبيق.',
    browseCategories: 'استكشف المواضيع',
    heroGameHub: 'مركز الألعاب',
    statCategories: 'المواضيع',
    statQuestions: 'الأسئلة',
    statLanguages: 'اللغات',
    mindHeroEyebrow: '+3500 لغز ثنائي اللغة — عربي وإنجليزي',
    mindHeroTitle: 'مختبر العقول',
    mindHeroSubtitle: 'اختر موضوعًا، اقلب البطاقات، واكتشف قدراتك.',
    playHeroTitle: 'ساحة الألعاب',
    playHeroSubtitle: 'بدون تنزيل أو تسجيل. ابدأ اللعب مباشرة من متصفحك وعلى أي جهاز.',
    playHeroGames: 'ألعاب',
    playAvailable: '10 ألعاب متاحة الآن',
    playPick: 'اختر لعبة',
    playBrowserOnly: 'جميع الألعاب تعمل بالكامل في متصفحك — لا حاجة إلى تثبيت أي شيء.',
    playChessAria: 'العب الشطرنج',
    playChessTitle: 'الشطرنج',
    playChessDesc: 'شطرنج كامل مع إظهار النقلات القانونية والأخذ بالتجاوز والتبييت والترقية. العب ضد الحاسوب أو تناوب مع صديق.',
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
    playBackgammonDesc: 'حرّك أحجارك الخمسة عشر حول اللوحة ذات 24 خانة وأخرجها قبل خصمك. نرد حقيقي ونقلات قانونية وخصم آلي.',
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
    portalMindDesc: '3,553 سؤالاً ثنائي اللغة موزعة مباشرة على 56 موضوعًا ضمن 5 أقسام واضحة. اختر موضوعًا واقلب البطاقات وتابع نقاطك.',
    portalMindStat: '56 موضوعًا',
    portalMindCta: 'استكشف الألغاز ←',
    portalGamesTag: 'مركز الألعاب',
    portalGamesTitle: 'مركز الألعاب',
    portalGamesDesc: 'شطرنج، ماستر مايند، غو، ريفرسي، كودنيمز، كاتان، طاولة، ست، هانابي، دبلوماسي — 10 ألعاب كاملة في المتصفح. بدون تنزيل أو تسجيل.',
    portalGamesStat1: '10 ألعاب',
    portalGamesStat2: 'كلها في المتصفح',
    portalGamesCta: 'العب الآن ←',
    homeCollectionsEyebrow: 'طرق شائعة للبدء',
    homeCollectionsTitle: 'مجموعات مختارة من الألغاز والاختبارات',
    homeCollectionsText: 'افتح مجموعة مركزة تظهر فيها كل الأسئلة، واكشف كل إجابة بلمسة واحدة، ثم تابع إلى مختبر العقول الكامل.',
    homeCollectionsCta: 'تصفح كل المجموعات',
    homeCollectionArabicTitle: 'ألغاز مع الحل',
    homeCollectionArabicMeta: '16 لغزاً ثنائي اللغة',
    homeCollectionKidsTitle: 'ألغاز للأطفال مع الحل',
    homeCollectionKidsMeta: 'ألغاز ودية وآمنة للعائلة',
    homeCollectionLogicTitle: 'ألغاز منطق مع الشرح',
    homeCollectionLogicMeta: 'استنتاج وأرقام وقراءة متأنية',
    homeCollectionFootballTitle: 'قوانين وتكتيكات كرة القدم',
    homeCollectionFootballMeta: '16 سؤالاً عملياً ثنائي اللغة',
    homeSocialEyebrow: 'ألغاز وتحديثات جديدة',
    homeSocialTitle: 'تابع JAKH Riddles',
    homeSocialText: 'تابع أحدث الأسئلة والمجموعات وتحديثات الألعاب على صفحات JAKH الاجتماعية.',
    homeSocialLabel: 'صفحات JAKH الاجتماعية',
    footerCollections: 'المجموعات',
    footerAbout: 'عن JAKH ومعايير المحتوى',
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
    teamBattle: 'معركة الفريق',
    backToTop: 'العودة للأعلى',
    searchPlaceholder: 'ابحث في المواضيع والمواضيع الفرعية...',
    cardSearchPlaceholder: 'ابحث بكلمة أو إجابة أو مفهوم...',
    homeSrTitle: 'ألغاز واختبارات بالعربية والإنجليزية',
    standardsDefaultText: 'تُراجع الأسئلة لأغراض التعلم والترفيه.',
    standardsDefaultLink: 'تعرّف على طريقة مراجعة JAKH للمحتوى وتحسينه.',
    standardsEducationLabel: 'للاستخدام التعليمي:',
    standardsEducationText: 'هذا الاختبار للتعلم والترفيه، وليس نصيحة طبية أو قانونية أو مالية أو متعلقة بالصحة النفسية.',
    standardsEducationLink: 'اقرأ معايير المحتوى لدينا.',
    mindCalloutEyebrow: 'هل تفضّل تحديًا أقصر؟',
    mindCalloutTitle: 'جرّب مجموعة ثنائية اللغة ومركزة',
    mindCalloutText: 'ابدأ بـ16 لغزًا مختارًا أو أسئلة للأطفال أو ألغاز منطق أو معلومات عامة أو كرة قدم أو أسئلة من زمن الطيبين.',
    mindCalloutCta: 'تصفح المجموعات',
    createAccount: 'احفظ تقدمي',
    todayMomentum: 'ملخصك',
    localBrowserOnly: 'محفوظ في حسابك',
    categoryEyebrow: 'اختر قسمًا',
    categoryTitle: 'ماذا تريد أن تستكشف؟',
    categoryText: 'اختر أحد الأقسام الخمسة، ثم افتح الموضوع مباشرة من دون طبقة إضافية.',
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
    leaderboardTitle: 'لوحة المتصدرين',
    leaderboardTop: 'الترتيب الموثّق قادم',
    leaderboardDisclaimer: 'أوقفنا الترتيب العام مؤقتًا حتى ننجز نظام نتائج موثّقًا من الخادم.',
    leaderboardEmpty: 'يستمر تقدمك الشخصي بالعمل. سيعود ترتيب المجتمع العادل بعد اكتمال التحقق.',
    leaderboardLoadError: 'تعذّر تحميل لوحة المتصدرين.',
    pointsShort: 'نقطة',
    globalSearchLabel: 'البحث الشامل',
    globalSearchPlaceholder: 'ابحث في أكثر من 3,500 سؤال…',
    globalSearchInputLabel: 'ابحث في جميع الأسئلة',
    globalSearchStart: 'اكتب للبحث في جميع الفئات…',
    globalSearchMin: 'اكتب حرفين على الأقل…',
    globalSearchUnavailable: 'البحث غير متاح حاليًا.',
    globalSearchEmpty: 'لا توجد نتائج.',
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
  dbUser: null,
  flipped: new Set(),
  cardPage: 1,
  streak: 0,
  freezeCount: 0,
  dailyCard: null,
  sharedCardHandled: false,
};

const timedQuizState = {
  cards: [], index: 0, score: 0, timer: null, advanceTimeout: null, session: 0, timeLeft: 20,
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
  options.credentials = 'include';
  const headers = new Headers(options.headers || {});
  headers.set('Accept', 'application/json');
  if (options.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  options.headers = headers;
  const res = await fetch(`${API_URL}${endpoint}`, options);
  const contentType = res.headers.get('content-type') || '';
  const data = contentType.includes('application/json') ? await res.json() : {};
  if (!res.ok) {
    const error = new Error(data.error || `API request failed (${res.status})`);
    error.code = typeof data.code === 'string' ? data.code : `HTTP_${res.status}`;
    error.status = res.status;
    throw error;
  }
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
  document.documentElement.dataset.theme = 'light';
  document.documentElement.lang = state.lang === 'ar' ? 'ar' : 'en';
  document.documentElement.dir = state.lang === 'ar' ? 'rtl' : 'ltr';
  if (els.langSelect) els.langSelect.value = state.lang;
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
  document.querySelector('a[href*="instagram.com"]')?.setAttribute('aria-label', t('socialInstagramLabel'));
  document.querySelector('a[href*="facebook.com"]')?.setAttribute('aria-label', t('socialFacebookLabel'));
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
  applyCategoryShellCopy();
  applyRuntimeAccessibilityCopy();
  updateSelectLabels();
  updateDocumentTitle();
  updateBottomNavActive();
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
    const cleanPath = location.pathname.replace(/\.html$/i, '').replace(/\/+$/, '') || '/';
    if (cleanPath === '/mind-lab') {
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
    hydrateCloudFeatureUi();
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

const APP_VERSION = '2.9';
function flushStaleStorage() {
  const stored = localStorage.getItem('jakh-app-version');
  if (stored !== null && stored !== APP_VERSION) {
    const staleKeys = ['jakh-catalog-cache', 'jakh-cluster-cache', 'jakh-home-state'];
    staleKeys.forEach(k => { localStorage.removeItem(k); sessionStorage.removeItem(k); });
    localStorage.setItem('jakh-app-version', APP_VERSION);
    // The current document already loaded versioned assets. Clear old caches in
    // the background without showing a forced reload or loading transition.
    navigator.serviceWorker?.controller?.postMessage({ type: 'CLEAR_CACHE' });
    return;
  }
  if (stored === null) localStorage.setItem('jakh-app-version', APP_VERSION);
}

function initializeFromStorage() {
  flushStaleStorage();
  const settings = loadJson(STORAGE_KEYS.settings, {});
  const entryUrl = new URL(window.location.href);
  const requestedLang = entryUrl.searchParams.get('lang');
  const explicitLang = requestedLang === 'en' || requestedLang === 'ar' ? requestedLang : '';
  const storedLang = settings.lang === 'ar' || settings.lang === 'en' ? settings.lang : 'en';
  state.lang = explicitLang || storedLang;

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
  banner.innerHTML = `
    <span>${escapeHtml(t('installPrompt'))}</span>
    <div class="install-banner-actions">
      <button class="primary-btn install-banner-btn" id="installAcceptBtn">${escapeHtml(t('install'))}</button>
      <button class="ghost-btn install-banner-close" id="installDismissBtn" aria-label="${escapeHtml(t('close'))}">✕</button>
    </div>
  `;
  document.body.appendChild(banner);
  document.body.classList.add('install-banner-visible');
  document.getElementById('installAcceptBtn')?.addEventListener('click', async () => {
    if (!_installPrompt) return;
    _installPrompt.prompt();
    const { outcome } = await _installPrompt.userChoice;
    _installPrompt = null;
    banner.remove();
    document.body.classList.remove('install-banner-visible');
    if (outcome === 'accepted') localStorage.setItem('jakh-install-dismissed', '1');
  });
  document.getElementById('installDismissBtn')?.addEventListener('click', () => {
    localStorage.setItem('jakh-install-dismissed', '1');
    banner.remove();
    document.body.classList.remove('install-banner-visible');
  });
}

let authModalMode = 'signin';

function refreshLocalizedTransientUi() {
  const installBanner = document.getElementById('installBanner');
  if (installBanner) {
    installBanner.remove();
    showInstallBanner();
  }

  const leaderboardModal = document.getElementById('leaderboardModal');
  const leaderboardWasOpen = Boolean(leaderboardModal && !leaderboardModal.classList.contains('hidden'));
  if (leaderboardModal) {
    releaseFocus(leaderboardModal);
    leaderboardModal.remove();
  }
  if (state.apiAvailable) {
    createLeaderboardModal();
    if (leaderboardWasOpen) void openLeaderboard();
  }

  const searchOverlay = document.getElementById('globalSearchOverlay');
  if (searchOverlay) {
    const searchWasOpen = !searchOverlay.classList.contains('hidden');
    const searchValue = document.getElementById('globalSearchInput')?.value || '';
    releaseFocus(searchOverlay);
    searchOverlay.remove();
    _gsGeneration += 1;
    if (searchWasOpen) {
      openGlobalSearch();
      const input = document.getElementById('globalSearchInput');
      if (input) {
        input.value = searchValue;
        if (searchValue) void runGlobalSearch();
      }
    }
  }

  if (els.authModal && !els.authModal.classList.contains('hidden')) {
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
      applyTheme();
      applyDir();
      applyStaticCopy();
      rerender();
      clearTimedQuizTimers();
      document.getElementById('timedQuizOverlay')?.remove();
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
      openBattleModal('', 'join');
      const codeInput = document.getElementById('battleCodeInput');
      if (codeInput) codeInput.value = code;
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

let categoryArtObserver = null;

function hydrateCategoryArt(root) {
  categoryArtObserver?.disconnect();
  categoryArtObserver = null;
  const cards = [...root.querySelectorAll('.category-card.has-art:not(.is-art-ready)')];
  if (!cards.length) return;
  if (!('IntersectionObserver' in window)) {
    cards.forEach(card => card.classList.add('is-art-ready'));
    return;
  }
  categoryArtObserver = new IntersectionObserver((entries, observer) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      entry.target.classList.add('is-art-ready');
      observer.unobserve(entry.target);
    });
  }, { rootMargin: '480px 0px' });
  cards.forEach(card => categoryArtObserver.observe(card));
}

function createCategoryCardMarkup(meta) {
  const color = CATEGORY_COLORS[meta.slug] || '#E8613C';
  const gradient = CATEGORY_GRADIENTS[meta.slug] || `linear-gradient(135deg, ${color} 0%, rgba(255,255,255,0.12) 100%)`;
  const isAr = state.lang === 'ar';
  const title = escapeHtml(meta.title[state.lang]);
  const cluster = escapeHtml(meta.cluster[state.lang]);
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
    <a class="category-card has-art" href="${escapeHtml(meta.href)}" aria-label="${title}">
      <span class="category-card-stripe" style="background:${gradient}" aria-hidden="true"></span>
      <div class="category-card-bg" aria-hidden="true">
        <span class="category-card-count-badge">${cardCountLabel}</span>
        <span class="category-card-corner-mark"></span>
      </div>
      <div class="category-card-overlay">
        <span class="category-card-cluster cluster-chip" style="color:${color}">${cluster}</span>
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
        meta.title.en, meta.title.ar, meta.description.en, meta.description.ar, meta.cluster.en, meta.cluster.ar,
        section.title.en, section.title.ar, section.description.en, section.description.ar,
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
  hydrateCategoryArt(els.categoryDirectoryGrid);
}

function renderClusterTabBar() {
  const tabBar = document.getElementById('clusterTabBar');
  if (!tabBar || !state.catalog) return;
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
      <button class="ml-cluster-tab${isActive ? ' is-active' : ''}" data-cluster="${escapeHtml(c.key)}" role="tab" aria-selected="${isActive}" aria-label="${escapeHtml(name)}">
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
      renderClusterTabBar();
      renderCategoryDirectory();
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
    const gradient = CATEGORY_GRADIENTS[category.slug] || 'linear-gradient(135deg, #1E3A5F 0%, #4A90D9 100%)';
    const heroDiv = document.createElement('div');
    heroDiv.className = 'category-hero-bg';
    heroDiv.style.background = gradient;
    heroDiv.innerHTML = `<span class="category-hero-emoji" aria-hidden="true">${escapeHtml(category.emoji)}</span>`;
    els.categoryImage.replaceWith(heroDiv);
    els.categoryImage = null;
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

function renderSubcategoryFilters() {
  if (!els.subcategoryWrap || !els.subcategoryFilters || !state.categoryData) return;
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
        <article class="riddle-card is-locked" data-id="${escapeHtml(card.id)}" data-mode="${escapeHtml(card.mode || 'quiz')}" tabindex="0" aria-label="${escapeHtml(t('locked'))}">
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
      <button class="paywall-close" aria-label="${escapeHtml(t('close'))}">✕</button>
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
          <input id="authUsername" autocomplete="username" required minlength="3" maxlength="20" />
        </label>
        <label>
          <span>${escapeHtml(t('password'))}</span>
          <input id="authPassword" type="password" autocomplete="${mode === 'signin' ? 'current-password' : 'new-password'}" required minlength="8" maxlength="128" />
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
      btn.textContent = mode === 'signin'
        ? (state.lang === 'ar' ? 'جارٍ تسجيل الدخول…' : 'Signing in…')
        : (state.lang === 'ar' ? 'جارٍ إنشاء الحساب…' : 'Creating account…');
      
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
          showToast(localizedErrorMessage(err, 'badLogin'), true);
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
        body: JSON.stringify({ text, email: els.suggestionEmail?.value.trim() || undefined }),
      });
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
    const cached = sessionStorage.getItem(cacheKey);
    if (cached) { state.dailyCard = JSON.parse(cached); return; }
    if (!state.catalog) return;
    const hash = today.split('').reduce((h, c) => ((h * 31) + c.charCodeAt(0)) | 0, 0);
    const abs = Math.abs(hash);
    const cats = state.catalog.categories.filter(c => c.count >= 15 && c.mode !== 'story');
    const cat = cats[abs % cats.length];
    const raw = await fetchJson(`data/${cat.slug}.json`);
    if (!Array.isArray(raw)) return;
    const cards = raw.filter(c => c.difficulty === 'easy' || c.difficulty === 'medium');
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
  const categoryHref = state.catalog?.categories
    .find(category => category.slug === card.categorySlug)?.href || `/${card.categorySlug}`;
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
          <a class="ghost-btn mini-btn" href="${escapeHtml(categoryHref)}">${lang === 'ar' ? 'المزيد ←' : 'Full category →'}</a>
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
  el.innerHTML = `
    <div class="timed-quiz-card">
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
  const exitQuiz = () => {
    timedQuizState.session += 1;
    clearTimedQuizTimers();
    document.getElementById('timedQuizOverlay')?.classList.add('hidden');
  };
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
  const overlay = document.getElementById('timedQuizOverlay');
  if (!overlay) return;
  clearTimedQuizTimers();
  timedQuizState.session += 1;
  timedQuizState.cards = pool;
  timedQuizState.index = 0;
  timedQuizState.score = 0;
  trackEvent('timed_quiz_start', { category: state.categorySlug, total: pool.length });
  overlay.classList.remove('hidden');
  document.getElementById('tqResult')?.classList.add('hidden');
  document.getElementById('tqActions')?.classList.remove('hidden');
  document.getElementById('tqQuestion')?.classList.remove('hidden');
  showTimedCard();
}

function showTimedCard() {
  if (!isTimedQuizVisible()) return;
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
      answerTimedCard(false);
    }
  }, 1000);
  timedQuizState.timer = timer;
}

function revealAndAdvance() {
  const tqCorrect = document.getElementById('tqCorrectBtn');
  const tqWrong = document.getElementById('tqWrongBtn');
  if (tqCorrect) tqCorrect.disabled = true;
  if (tqWrong) tqWrong.disabled = true;
  clearTimeout(timedQuizState.advanceTimeout);
  const session = timedQuizState.session;
  const advanceTimeout = setTimeout(() => {
    if (timedQuizState.advanceTimeout !== advanceTimeout) return;
    timedQuizState.advanceTimeout = null;
    if (timedQuizState.session !== session || !isTimedQuizVisible()) return;
    timedQuizState.index++;
    timedQuizState.index >= timedQuizState.cards.length ? endTimedQuiz() : showTimedCard();
  }, 600);
  timedQuizState.advanceTimeout = advanceTimeout;
}

function answerTimedCard(correct) {
  if (!isTimedQuizVisible()) return;
  clearInterval(timedQuizState.timer);
  timedQuizState.timer = null;
  const card = timedQuizState.cards[timedQuizState.index];
  if (!card) return;
  if (correct) { timedQuizState.score++; markCard(card.id, 'correct'); }
  else { markCard(card.id, 'wrong'); }
  revealAndAdvance();
}

function endTimedQuiz() {
  timedQuizState.session += 1;
  clearTimedQuizTimers();
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
      navigator.share?.({ title: t('shareChallengeTitle'), text, url: challengeUrl })
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
    <div class="modal-card" role="dialog" aria-modal="true" aria-labelledby="leaderboardTitle">
      <div class="modal-head">
        <div>
          <p class="eyebrow">🏆 ${escapeHtml(t('leaderboardTitle'))}</p>
          <h2 id="leaderboardTitle">${escapeHtml(t('leaderboardTop'))}</h2>
          <p class="muted">${escapeHtml(t('leaderboardDisclaimer'))}</p>
        </div>
        <button class="icon-btn" data-close-modal="leaderboard" aria-label="${escapeHtml(t('close'))}">×</button>
      </div>
      <div id="leaderboardBody" style="padding:0.25rem 0;min-height:120px;"></div>
    </div>`;
  document.body.appendChild(el);
}

// ================= GLOBAL SEARCH =================
let _gsIndex = null;
let _gsIndexPromise = null;
let _gsGeneration = 0;

async function loadGlobalSearchIndex() {
  if (_gsIndex) return _gsIndex;
  if (!_gsIndexPromise) {
    _gsIndexPromise = fetchJson('data/search-index.json')
      .then((payload) => {
        if (
          payload?.version !== 1
          || !Array.isArray(payload.categories)
          || !Array.isArray(payload.cards)
        ) {
          throw new Error('Invalid global search index');
        }
        _gsIndex = payload;
        return payload;
      })
      .finally(() => {
        _gsIndexPromise = null;
      });
  }
  return _gsIndexPromise;
}

function openGlobalSearch() {
  void loadGlobalSearchIndex().catch(() => undefined);
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
    <div class="global-search-panel" role="dialog" aria-modal="true" aria-label="${escapeHtml(t('globalSearchLabel'))}">
      <div class="global-search-head">
        <input id="globalSearchInput" class="global-search-input" type="search" autocomplete="off"
          placeholder="${escapeHtml(t('globalSearchPlaceholder'))}"
          aria-label="${escapeHtml(t('globalSearchInputLabel'))}" />
        <button class="global-search-close icon-btn" id="globalSearchClose" aria-label="${escapeHtml(t('close'))}">×</button>
      </div>
      <div id="globalSearchResults" class="global-search-results">
        <p class="global-search-hint">${escapeHtml(t('globalSearchStart'))}</p>
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
  _gsGeneration++;
  document.getElementById('globalSearchOverlay')?.classList.add('hidden');
}

async function runGlobalSearch() {
  const generation = ++_gsGeneration;
  const q = document.getElementById('globalSearchInput')?.value.trim().toLowerCase();
  const resultsEl = document.getElementById('globalSearchResults');
  if (!resultsEl) return;
  if (!q || q.length < 2) {
    resultsEl.removeAttribute('aria-busy');
    resultsEl.innerHTML = `<p class="global-search-hint">${escapeHtml(t('globalSearchMin'))}</p>`;
    return;
  }
  resultsEl.replaceChildren();
  resultsEl.setAttribute('aria-busy', 'true');

  let searchIndex;
  try {
    searchIndex = await loadGlobalSearchIndex();
  } catch {
    if (generation === _gsGeneration) {
      resultsEl.removeAttribute('aria-busy');
      resultsEl.innerHTML = `<p class="global-search-hint">${escapeHtml(t('globalSearchUnavailable'))}</p>`;
    }
    return;
  }
  if (generation !== _gsGeneration) return;
  resultsEl.removeAttribute('aria-busy');

  const hits = [];
  const categoriesBySlug = new Map((state.catalog?.categories || []).map(cat => [cat.slug, cat]));
  for (const row of searchIndex.cards) {
    if (hits.length >= 30) break;
    const cat = categoriesBySlug.get(searchIndex.categories[row[0]]);
    if (!cat) continue;
    const hay = [row[1], row[2], row[3], row[4]].join(' ').toLowerCase();
    if (hay.includes(q)) {
      hits.push({
        cat,
        question: state.lang === 'ar' ? row[2] : row[1],
        answer: state.lang === 'ar' ? row[4] : row[3],
      });
    }
  }

  if (generation !== _gsGeneration) return;
  if (!hits.length) {
    resultsEl.innerHTML = `<p class="global-search-hint">${escapeHtml(t('globalSearchEmpty'))}</p>`;
    return;
  }
  resultsEl.innerHTML = hits.map(({ cat, question, answer }) => `
    <a class="gs-result" href="${escapeHtml(cat.href)}?q=${encodeURIComponent(q)}">
      <span class="gs-result-cat">${escapeHtml(cat.emoji)} ${escapeHtml(cat.title[state.lang])}</span>
      <span class="gs-result-q">${escapeHtml(question)}</span>
      <span class="gs-result-a">${escapeHtml(answer)}</span>
    </a>
  `).join('');
  resultsEl.querySelectorAll('.gs-result').forEach(el => {
    el.addEventListener('click', closeGlobalSearch);
  });
}

async function openLeaderboard() {
  const modal = document.getElementById('leaderboardModal');
  if (!modal) return;
  modal.classList.remove('hidden');
  modal.setAttribute('aria-hidden', 'false');
  const body = document.getElementById('leaderboardBody');
  if (body) {
    body.replaceChildren();
    body.setAttribute('aria-busy', 'true');
  }
  try {
    const { leaderboard } = await apiFetch('/leaderboard');
    const currentUser = state.dbUser?.username;
    const medals = ['🥇', '🥈', '🥉'];
    if (!leaderboard?.length) {
      if (body) body.innerHTML = `<p style="padding:2rem;text-align:center;color:var(--muted)">${escapeHtml(t('leaderboardEmpty'))}</p>`;
      return;
    }
    if (body) body.innerHTML = leaderboard.map(row => `
      <div class="leaderboard-row">
        <span class="leaderboard-rank ${row.rank <= 3 ? 'top-3' : ''}">${medals[row.rank - 1] || escapeHtml(row.rank)}</span>
        <span class="leaderboard-username ${row.username === currentUser ? 'leaderboard-you' : ''}">
          <span style="margin-inline-end:6px;font-size:1.1rem;">${escapeHtml(row.avatar || '👤')}</span>${escapeHtml(row.username)}${row.username === currentUser ? ' ✦' : ''}
        </span>
        <span class="leaderboard-score bidi-isolate">${escapeHtml(row.score)} ${escapeHtml(t('pointsShort'))}</span>
      </div>`).join('');
  } catch (e) {
    if (body) body.innerHTML = `<p style="padding:2rem;text-align:center;color:var(--danger)">${escapeHtml(t('leaderboardLoadError'))}</p>`;
  } finally {
    body?.removeAttribute('aria-busy');
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
      <div class="category-complete-top" style="background:${CATEGORY_GRADIENTS[slug] || 'linear-gradient(135deg,#1E3A5F,#4A90D9)'}">
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
    navigator.share?.({ title: t('shareChallengeTitle'), text, url })
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
  trackEvent('share_card', {
    category: state.categorySlug,
    card_id: cardId,
    language: state.lang,
  });
  if (navigator.share) {
    navigator.share({ title: t('shareRiddleTitle'), text, url }).catch(() => {});
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
  trackEvent('share_result', {
    category: state.categorySlug,
    score,
    total,
    percent: pct,
    language: state.lang,
  });
  if (navigator.share) {
    navigator.share({ title: t('shareRiddleTitle'), text, url }).catch(() => {});
  } else {
    navigator.clipboard?.writeText(text).then(() => showToast(t('shareCopied'))).catch(() => showToast(t('shareCopied')));
  }
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
    if (document.getElementById('dailyChallengeMount')) {
      scrollToDailyChallenge();
    } else {
      sessionStorage.setItem('jakh-scroll-to', 'daily');
      location.href = '/';
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
  const isMindLab = location.pathname.replace(/\.html$/i, '').replace(/\/+$/, '') === '/mind-lab';
  const activeTab = state.page === 'home' && !isMindLab ? 'home' : 'explore';
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

async function hydrateCloudCapabilities() {
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
  hydrateCloudFeatureUi();
}

function hydrateCloudFeatureUi() {
  if (state.apiAvailable) {
    startAnalyticsHeartbeat();
    createLeaderboardModal();
    createBattleModal();
    initSuggestionBox();
  } else {
    stopAnalyticsHeartbeat();
  }
  renderCategoryPlayModes();
  applyStaticCopy();
  rerender();
  applyCapabilityVisibility();
}

async function init() {
  cacheEls();
  [els.openAuthBtn, els.heroAuthBtn].filter(Boolean).forEach(element => {
    element.hidden = true;
  });
  initializeFromStorage();
  applyDir();
  applyTheme();
  bindCommonEvents();
  applyCapabilityVisibility();
  createTimedQuizModal();
  await loadCatalog();
  await Promise.all([loadDailyChallenge(), loadCategoryIfNeeded()]);
  applyStaticCopy();
  rerender();
  injectBottomNav();
  injectBackToTop();
  applyCapabilityVisibility();
  checkNewAchievements();
  // Cloud account and multiplayer checks hydrate after local content is
  // already usable, so a slow API never leaves the page blank.
  hydrateCloudCapabilities().catch(() => {
    state.apiAvailable = false;
    sessionInitialized = true;
    applyCapabilityVisibility();
  });
  const dailyParams = new URLSearchParams(location.search);
  const dailySessionRequested = sessionStorage.getItem('jakh-scroll-to') === 'daily';
  const dailyShortcutRequested = dailyParams.get('daily') === '1';
  if (state.page === 'home' && (dailySessionRequested || dailyShortcutRequested)) {
    sessionStorage.removeItem('jakh-scroll-to');
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
    openBattleModal(state.categorySlug, 'create');
  });
  document.getElementById('playModeJoinBtn')?.addEventListener('click', () => {
    openBattleModal(state.categorySlug, 'join');
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

const BATTLE_CODE_PATTERN = /^[A-Z]{3}[A-HJ-NP-Z2-9]{5}$/;

function normalizeBattleCode(value) {
  return String(value || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
}

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

function openBattleModal(slug, tab = 'create') {
  if (!document.getElementById('battleOverlay')) createBattleModal();
  battleState.pendingSlug = slug || state.categorySlug || '';
  battleState.phase = 'setup';
  battleState.tab = tab === 'join' ? 'join' : 'create';
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
      <span class="battle-header-title">${titles[battleState.phase] || `⚡ ${escapeHtml(t('teamBattle'))}`}</span>
      <button class="battle-exit-btn" id="battleExitBtn" aria-label="${escapeHtml(t('close'))}">✕</button>
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
            <input type="text" id="battleCodeInput" maxlength="16"
              placeholder="${isAr ? 'مثال: SCI7X2KQ' : 'e.g. SCI7X2KQ'}"
              dir="ltr"
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
  const codeInput = document.getElementById('battleCodeInput');
  codeInput?.addEventListener('input', () => {
    codeInput.value = normalizeBattleCode(codeInput.value);
  });
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
    showBattleError(localizedErrorMessage(err, 'errorBattleCreate'));
    if (btn) { btn.disabled = false; btn.textContent = `⚡ ${isAr ? 'إنشاء الغرفة' : 'Create Battle Room'}`; }
  }
}

function handleBattleJoin() {
  const name = document.getElementById('battleNameInput')?.value.trim() || '';
  const code = normalizeBattleCode(document.getElementById('battleCodeInput')?.value);
  const isAr = state.lang === 'ar';
  if (!name) { showBattleError(isAr ? 'أدخل اسمك' : 'Enter your name'); return; }
  if (!BATTLE_CODE_PATTERN.test(code)) {
    showBattleError(isAr ? 'أدخل كود غرفة صالحاً من 8 رموز' : 'Enter a valid 8-character room code');
    return;
  }
  connectToBattle(code, name, null);
}

function showBattleError(msg) {
  const el = document.getElementById('battleSetupError');
  if (el) { el.textContent = msg; el.classList.remove('hidden'); }
}

function connectToBattle(code, name, hostId) {
  code = normalizeBattleCode(code);
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
  if (msg.type === 'error') {
    showBattleError(localizedErrorMessage({ code: msg.code, message: msg.message }));
    return;
  }
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
        <div class="battle-code-value bidi-isolate" dir="ltr">${escapeHtml(code)}</div>
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
              ${p.id === room?.hostId ? `<span class="battle-player-crown" aria-label="${escapeHtml(t('host'))}">👑</span>` : '<span style="width:1.2rem"></span>'}
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
        <span class="battle-hud-code bidi-isolate" dir="ltr">${escapeHtml(room.code)}</span>
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
        <span class="battle-hud-code bidi-isolate" dir="ltr">${escapeHtml(room.code)}</span>
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
    navigator.share?.({ title: t('shareBattleTitle'), text }).catch(() =>
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

  }
  init().catch((error) => {
    console.error(error);
    showToast(localizedErrorMessage(error, 'initializationError'), true);
  });
});
