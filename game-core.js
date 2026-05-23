(function () {
  'use strict';

  const CATALOG = window.JakhBrainGames || [];
  const GAME_ASSET_VERSION = '1778122800';
  const params = new URLSearchParams(location.search);
  const requestedGame = params.get('game') || 'chess';
  if (requestedGame === 'backgammon') {
    location.replace('backgammon.html' + location.search + location.hash);
    return;
  }
  const requestedMode = params.get('mode') || 'computer';
  const roomParam = params.get('room');

  const copy = {
    en: {
      games: 'Back to Games',
      signIn: 'Sign in',
      createAccount: 'Create account',
      profile: 'Profile',
      language: 'Language',
      kicker: 'Educational brain game',
      computerMode: 'Computer mode',
      onlineMode: 'Online room',
      playComputer: 'Play Computer',
      inviteHuman: 'Invite a Player',
      topScores: 'Top Scores',
      newGame: 'New Game',
      playerName: 'Player name',
      createLink: 'Create Invite Link',
      copyLink: 'Copy Link',
      copied: 'Copied',
      roomReady: 'Room ready. Send the link to another player.',
      roomJoining: 'Joining room...',
      roomJoined: 'Joined room.',
      roomWaiting: 'Waiting for opponent.',
      roomError: 'Room connection failed. Check that /socket.io is proxied to the API server.',
      fileRoomError: 'Online rooms cannot run from a file preview. Open the deployed https://jakh.net game page, or serve this folder through a local web server connected to the API.',
      yourTurn: 'Your turn',
      computerTurn: 'Computer thinking',
      opponentTurn: 'Opponent turn',
      selectMove: 'Select a legal move.',
      selectDestination: 'Select a destination.',
      gameOver: 'Game over',
      youWin: 'You win',
      computerWins: 'Computer wins',
      draw: 'Draw',
      score: 'Score',
      rules: 'Rules',
      howTo: 'How to play',
      loading: 'Loading game...',
      authRequiredTitle: 'Create account to play',
      authRequiredText: 'Games are members-only so rooms, moves, and scores stay tied to your JAKH account.',
      leaderboardLoading: 'Loading scores...',
      leaderboardEmpty: 'No scores yet.',
      leaderboardError: 'Could not load scores.',
      rank: 'Rank',
      player: 'Player',
    },
    ar: {
      games: 'العودة للألعاب',
      signIn: 'تسجيل الدخول',
      createAccount: 'إنشاء حساب',
      profile: 'الحساب',
      language: 'اللغة',
      kicker: 'لعبة تعليمية للعقل',
      computerMode: 'نمط الكمبيوتر',
      onlineMode: 'غرفة أونلاين',
      playComputer: 'ضد الكمبيوتر',
      inviteHuman: 'دعوة لاعب',
      topScores: 'أفضل النتائج',
      newGame: 'لعبة جديدة',
      playerName: 'اسم اللاعب',
      createLink: 'إنشاء رابط الدعوة',
      copyLink: 'نسخ الرابط',
      copied: 'تم النسخ',
      roomReady: 'الغرفة جاهزة. أرسل الرابط للاعب آخر.',
      roomJoining: 'جاري دخول الغرفة...',
      roomJoined: 'تم دخول الغرفة.',
      roomWaiting: 'بانتظار الخصم.',
      roomError: 'فشل اتصال الغرفة. تأكد أن /socket.io موصول بخادم API.',
      fileRoomError: 'غرف الأونلاين لا تعمل من معاينة ملف مباشرة. افتح صفحة اللعبة المنشورة على https://jakh.net أو شغل الموقع عبر خادم محلي متصل بالـ API.',
      yourTurn: 'دورك',
      computerTurn: 'الكمبيوتر يفكر',
      opponentTurn: 'دور الخصم',
      selectMove: 'اختر حركة قانونية.',
      selectDestination: 'اختر الوجهة.',
      gameOver: 'انتهت اللعبة',
      youWin: 'فزت',
      computerWins: 'فاز الكمبيوتر',
      draw: 'تعادل',
      score: 'النقاط',
      rules: 'القواعد',
      howTo: 'طريقة اللعب',
      loading: 'جاري تحميل اللعبة...',
      authRequiredTitle: 'أنشئ حسابًا للعب',
      authRequiredText: 'الألعاب للأعضاء فقط حتى تبقى الغرف والحركات والنتائج مرتبطة بحسابك في JAKH.',
      leaderboardLoading: 'جاري تحميل النتائج...',
      leaderboardEmpty: 'لا توجد نتائج بعد.',
      leaderboardError: 'تعذر تحميل النتائج.',
      rank: 'الترتيب',
      player: 'اللاعب',
    },
  };

  const els = {};
  const state = {
    lang: localStorage.getItem('jakh-lang') || 'en',
    gameMeta: CATALOG.find(game => game.id === requestedGame) || CATALOG[0],
    engine: null,
    board: null,
    mode: requestedMode === 'online' || roomParam ? 'online' : 'computer',
    selected: null,
    playerSide: roomParam ? 'B' : 'A',
    version: 0,
    aiTimer: null,
    aiToken: 0,
    postedScore: false,
    user: null,
  };

  async function init() {
    bindElements();
    applyLanguage();
    forceDarkTheme();
    await refreshProfile();
    if (!state.user) {
      showGameAuthGate();
      return;
    }
    bootGame();
  }

  function bootGame() {
    loadEngine(state.gameMeta.id)
      .then(function () {
        state.engine = window.JakhGameEngines[state.gameMeta.id];
        if (!state.engine) throw new Error('Game engine unavailable');
        startNewGame();
        if (state.mode === 'online') showRoomPanel();
        if (roomParam) joinRoom();
      })
      .catch(function (err) {
        if (els.status) els.status.textContent = err.message || 'Game failed to load.';
      });
  }

  function bindElements() {
    els.langSelect = document.getElementById('langSelect');
    forceDarkTheme();
    els.backToGames = document.getElementById('backToGames');
    els.accountButton = document.getElementById('accountButton') || document.getElementById('openAuthBtn');
    els.languageLabel = document.getElementById('languageLabel');
    els.gameKicker = document.getElementById('gameKicker');
    els.title = document.getElementById('gameTitle');
    els.summary = document.getElementById('gameSummary');
    els.computerMode = document.getElementById('computerModeBtn');
    els.onlineMode = document.getElementById('onlineModeBtn');
    els.leaderboard = document.getElementById('leaderboardBtn');
    els.newGame = document.getElementById('newGameBtn');
    els.roomPanel = document.getElementById('roomPanel');
    els.playerName = document.getElementById('playerNameInput');
    els.createRoom = document.getElementById('createRoomBtn');
    els.roomLinkBlock = document.getElementById('roomLinkBlock');
    els.roomLink = document.getElementById('roomLinkInput');
    els.copyRoom = document.getElementById('copyRoomBtn');
    els.roomStatus = document.getElementById('roomStatus');
    els.modeLabel = document.getElementById('modeLabel');
    els.turn = document.getElementById('turnLabel');
    els.status = document.getElementById('statusText');
    els.scoreMeta = document.getElementById('scoreMeta');
    els.score = document.getElementById('scoreText');
    els.rules = document.getElementById('rulesText');
    els.howToMeta = document.getElementById('howToMeta');
    els.howTo = document.getElementById('howToList');
    els.board = document.getElementById('gameBoard');

    if (els.langSelect) {
      els.langSelect.value = state.lang;
      els.langSelect.addEventListener('change', function () {
        state.lang = els.langSelect.value === 'ar' ? 'ar' : 'en';
        localStorage.setItem('jakh-lang', state.lang);
        applyLanguage();
        render();
      });
    }

    els.accountButton?.addEventListener('click', openAccountModal);
    els.computerMode?.addEventListener('click', function () {
      if (!ensureSignedIn()) return;
      cancelPendingComputerMove();
      state.mode = 'computer';
      state.playerSide = 'A';
      hideRoomPanel();
      startNewGame();
    });
    els.onlineMode?.addEventListener('click', function () {
      if (!ensureSignedIn()) return;
      cancelPendingComputerMove();
      state.mode = 'online';
      state.playerSide = 'A';
      showRoomPanel();
      render();
    });
    els.leaderboard?.addEventListener('click', openLeaderboard);
    els.newGame?.addEventListener('click', function () {
      if (!ensureSignedIn()) return;
      startNewGame();
    });
    els.createRoom?.addEventListener('click', createRoom);
    els.copyRoom?.addEventListener('click', copyRoom);
  }

  function loadEngine(id) {
    return new Promise(function (resolve, reject) {
      if (window.JakhGameEngines && window.JakhGameEngines[id]) { resolve(); return; }
      const script = document.createElement('script');
      script.src = 'games/' + encodeURIComponent(id) + '.js?v=' + GAME_ASSET_VERSION;
      script.onload = resolve;
      script.onerror = function () { reject(new Error('Could not load ' + id)); };
      document.head.appendChild(script);
    });
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
    forceDarkTheme();
    if (els.backToGames) els.backToGames.textContent = t('games');
    if (els.accountButton) els.accountButton.textContent = state.user ? t('profile') : t('signIn');
    if (els.languageLabel) els.languageLabel.textContent = t('language');
    if (els.gameKicker) els.gameKicker.textContent = t('kicker');
    if (els.computerMode) els.computerMode.textContent = t('playComputer');
    if (els.onlineMode) els.onlineMode.textContent = t('inviteHuman');
    if (els.leaderboard) els.leaderboard.textContent = t('topScores');
    if (els.newGame) els.newGame.textContent = t('newGame');
    document.querySelector('label[for="playerNameInput"]')?.replaceChildren(document.createTextNode(t('playerName')));
    if (els.createRoom) els.createRoom.textContent = t('createLink');
    if (els.copyRoom) els.copyRoom.textContent = t('copyLink');
    if (els.scoreMeta) els.scoreMeta.textContent = t('score');
    if (els.howToMeta) els.howToMeta.textContent = t('howTo');
  }

  function getThemeColor() {
    return getComputedStyle(document.documentElement).getPropertyValue('--theme-color').trim() || '#17151c';
  }

  function forceDarkTheme() {
    document.documentElement.dataset.theme = 'dark';
    document.documentElement.style.colorScheme = 'dark';
    document.querySelectorAll('meta[name="theme-color"]').forEach(node => {
      node.setAttribute('content', getThemeColor());
    });
  }

  function startNewGame() {
    if (!ensureSignedIn()) return;
    if (!state.engine) return;
    cancelPendingComputerMove();
    state.board = state.engine.initialState();
    state.selected = null;
    state.version = 0;
    state.postedScore = false;
    render();
  }

  function render() {
    if (!state.user) {
      showGameAuthGate();
      return;
    }
    if (!state.engine || !state.board) return;
    const meta = state.gameMeta;
    document.title = tr(meta.title) + ' | JAKH';
    if (els.title) els.title.textContent = tr(meta.title);
    if (els.summary) els.summary.textContent = tr(meta.summary);
    if (els.rules) els.rules.textContent = state.engine.rules;
    renderHowTo(meta);
    if (els.modeLabel) els.modeLabel.textContent = state.mode === 'online' ? t('onlineMode') : t('computerMode');
    if (els.score) els.score.textContent = String(state.engine.score(state.board));
    renderStatus();
    renderBoard();
  }

  function renderHowTo(meta) {
    if (!els.howTo) return;
    const steps = meta.howTo && (meta.howTo[state.lang] || meta.howTo.en) || [];
    els.howTo.innerHTML = '';
    steps.forEach(function (step) {
      const item = document.createElement('li');
      item.textContent = step;
      els.howTo.appendChild(item);
    });
  }

  function renderStatus() {
    const terminal = state.engine.isTerminal(state.board);
    if (terminal.done) {
      const label = terminal.winner === 'draw' ? t('draw') : terminal.winner === state.playerSide ? t('youWin') : t('computerWins');
      if (els.turn) els.turn.textContent = t('gameOver');
      if (els.status) els.status.textContent = label;
      postScoreOnce(terminal);
      return;
    }
    const myTurn = state.board.turn === state.playerSide;
    if (els.turn) {
      els.turn.textContent = myTurn ? t('yourTurn') : state.mode === 'computer' ? t('computerTurn') : t('opponentTurn');
    }
    if (els.status) els.status.textContent = state.selected === null ? t('selectMove') : t('selectDestination');
  }

  function renderBoard() {
    if (!els.board) return;
    const rows = state.engine.rows || 8;
    const cols = state.engine.cols || 8;
    const total = state.engine.boardShape === 'track' ? state.engine.track : rows * cols;
    const legalMoves = canMove() ? state.engine.legalMoves(state.board, state.board.turn) : [];
    const fromCells = new Set(legalMoves.map(item => item.from).filter(value => Number.isInteger(value)));
    const targetCells = new Set(legalMoves.map(item => item.cell ?? item.to).filter(value => Number.isInteger(value)));
    const selectedTargetCells = new Set(
      legalMoves
        .filter(item => item.from === state.selected)
        .map(item => item.to ?? item.cell)
        .filter(value => Number.isInteger(value))
    );
    const selectableCells = fromCells.size ? fromCells : targetCells;
    const cellSize = cols >= 15 ? 38 : cols >= 9 ? 44 : 58;
    const cellMin = cols >= 15 ? 30 : cols >= 9 ? 34 : 38;
    els.board.className = 'brain-board is-' + (state.engine.boardShape || 'grid');
    els.board.style.setProperty('--rows', rows);
    els.board.style.setProperty('--cols', cols);
    els.board.style.setProperty('--cell-size', cellSize + 'px');
    els.board.style.setProperty('--cell-min', cellMin + 'px');
    const fragment = document.createDocumentFragment();
    for (let cell = 0; cell < total; cell += 1) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'brain-cell ' + (state.engine.cellClass(state.board, cell) || '');
      if (state.selected === cell) button.classList.add('is-selected');
      if (state.selected === null && selectableCells.has(cell)) button.classList.add('is-legal');
      if (state.selected !== null && selectedTargetCells.has(cell)) button.classList.add('is-legal');
      button.textContent = state.engine.cellContent(state.board, cell);
      const label = typeof state.engine.cellLabel === 'function'
        ? state.engine.cellLabel(state.board, cell)
        : 'Cell ' + (cell + 1);
      button.setAttribute('aria-label', label);
      button.dataset.cell = String(cell);
      button.addEventListener('click', function () { handleCell(cell); });
      fragment.appendChild(button);
    }
    els.board.replaceChildren(fragment);
  }

  function handleCell(cell) {
    if (!ensureSignedIn()) return;
    if (!canMove()) return;
    const moves = state.engine.legalMoves(state.board, state.board.turn);
    let move = moveForCell(cell, moves);
    if (!move && state.engine.boardShape === 'track') move = moves.find(item => item.from === cell);
    if (!move) {
      if (state.selected === null && moves.some(item => item.from === cell)) {
        state.selected = cell;
        render();
        return;
      }
      if (state.selected !== null) move = moves.find(item => item.from === state.selected && item.to === cell);
    }
    if (!move) return;
    applyLocalMove(move);
  }

  function moveForCell(cell, moves) {
    let move = moves.find(item => item.cell === cell);
    if (move || !state.engine.usesGravity) return move;
    const cols = state.engine.cols || 1;
    const column = cell % cols;
    return moves.find(item => Number.isInteger(item.cell) && item.cell % cols === column) || null;
  }

  function canMove() {
    if (!state.user) return false;
    if (!state.engine || !state.board) return false;
    if (state.engine.isTerminal(state.board).done) return false;
    if (state.mode === 'computer') return state.board.turn === 'A';
    return state.board.turn === state.playerSide;
  }

  function applyLocalMove(move) {
    cancelPendingComputerMove();
    state.board = state.engine.applyMove(state.board, move);
    state.selected = null;
    state.version += 1;
    render();
    broadcastState();
    if (state.mode === 'computer' && state.board.turn === 'B' && !state.engine.isTerminal(state.board).done) {
      const token = ++state.aiToken;
      state.aiTimer = setTimeout(function () {
        state.aiTimer = null;
        if (token !== state.aiToken || state.mode !== 'computer' || state.board.turn !== 'B') return;
        const ai = state.engine.aiMove(state.board, 'hard');
        if (!ai) return;
        state.board = state.engine.applyMove(state.board, ai);
        state.version += 1;
        render();
      }, 280);
    }
  }

  function cancelPendingComputerMove() {
    state.aiToken += 1;
    if (!state.aiTimer) return;
    clearTimeout(state.aiTimer);
    state.aiTimer = null;
  }

  function showRoomPanel() {
    if (els.roomPanel) els.roomPanel.hidden = false;
    if (els.roomStatus) els.roomStatus.textContent = roomParam ? t('roomJoining') : t('roomWaiting');
  }

  function hideRoomPanel() {
    if (els.roomPanel) els.roomPanel.hidden = true;
  }

  function playerName() {
    return (els.playerName?.value || '').trim() || localStorage.getItem('jakh-game-username') || 'Player';
  }

  function connectRoom() {
    if (!window.JakhRoom) return Promise.reject(new Error('Room client unavailable'));
    return window.JakhRoom.init(state.gameMeta.id);
  }

  function createRoom() {
    if (!ensureSignedIn()) return;
    state.mode = 'online';
    state.playerSide = 'A';
    showRoomPanel();
    if (location.protocol === 'file:') {
      if (els.roomStatus) els.roomStatus.textContent = t('fileRoomError');
      return;
    }
    if (els.roomStatus) els.roomStatus.textContent = 'Connecting...';
    connectRoom()
      .then(function () { return window.JakhRoom.create(playerName()); })
      .then(function (data) {
        const url = data.url || location.href;
        if (els.roomLink) els.roomLink.value = url;
        if (els.roomLinkBlock) els.roomLinkBlock.hidden = false;
        if (els.roomStatus) els.roomStatus.textContent = t('roomReady');
        bindRoomEvents();
      })
      .catch(function (err) {
        if (els.roomStatus) els.roomStatus.textContent = (err && err.message ? err.message : t('roomError')) + '. ' + t('roomError');
      });
  }

  function joinRoom() {
    if (!ensureSignedIn()) return;
    state.mode = 'online';
    state.playerSide = 'B';
    showRoomPanel();
    if (location.protocol === 'file:') {
      if (els.roomStatus) els.roomStatus.textContent = t('fileRoomError');
      return;
    }
    if (els.roomStatus) els.roomStatus.textContent = t('roomJoining');
    connectRoom()
      .then(function () {
        if (els.roomStatus) els.roomStatus.textContent = t('roomJoined');
        bindRoomEvents();
      })
      .catch(function (err) {
        if (els.roomStatus) els.roomStatus.textContent = (err && err.message ? err.message : t('roomError')) + '. ' + t('roomError');
      });
  }

  let roomEventsBound = false;
  function bindRoomEvents() {
    if (roomEventsBound || !window.JakhRoom) return;
    roomEventsBound = true;
    window.JakhRoom.onPlayerJoined(function () {
      if (els.roomStatus) els.roomStatus.textContent = t('roomJoined');
      broadcastState();
    });
    window.JakhRoom.onMove(function (payload) {
      if (!payload || payload.type !== 'state' || payload.game !== state.gameMeta.id) return;
      if (payload.version <= state.version) return;
      cancelPendingComputerMove();
      state.board = state.engine.deserialize(payload.state);
      state.version = payload.version;
      render();
    });
  }

  function broadcastState() {
    if (state.mode !== 'online' || !window.JakhRoom || !window.JakhRoom.roomId) return;
    window.JakhRoom.sendMove({
      type: 'state',
      game: state.gameMeta.id,
      version: state.version,
      state: state.engine.serialize(state.board),
    });
  }

  function copyRoom() {
    if (!els.roomLink?.value) return;
    navigator.clipboard?.writeText(els.roomLink.value).then(function () {
      if (els.copyRoom) els.copyRoom.textContent = t('copied');
      setTimeout(function () { if (els.copyRoom) els.copyRoom.textContent = t('copyLink'); }, 1400);
    }).catch(function () {
      els.roomLink.select();
      document.execCommand('copy');
    });
  }

  function postScoreOnce(terminal) {
    if (state.postedScore || !terminal.done || !state.user) return;
    state.postedScore = true;
    const username = state.user?.username || localStorage.getItem('jakh-game-username') || playerName() || 'Anonymous';
    fetch('/api/boardgame/score', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username,
        game: state.gameMeta.id,
        score: state.engine.score(state.board),
        metadata: { moves: state.board.moves || 0, result: terminal.winner },
      }),
    }).catch(function () {});
  }

  async function refreshProfile() {
    try {
      const response = await fetch('/api/user/profile', { credentials: 'include' });
      if (!response.ok) throw new Error('Guest');
      state.user = await response.json();
      if (state.user?.username) {
        localStorage.setItem('jakh-game-username', state.user.username);
        if (els.playerName) els.playerName.value = state.user.username;
      }
    } catch (_) {
      state.user = null;
    }
    applyLanguage();
  }

  function ensureSignedIn() {
    if (state.user) return true;
    showGameAuthGate();
    openAccountModal();
    return false;
  }

  function showGameAuthGate() {
    const meta = state.gameMeta;
    document.title = tr(meta.title) + ' | JAKH';
    if (els.title) els.title.textContent = tr(meta.title);
    if (els.summary) els.summary.textContent = t('authRequiredText');
    if (els.modeLabel) els.modeLabel.textContent = t('authRequiredTitle');
    if (els.turn) els.turn.textContent = t('signIn');
    if (els.status) els.status.textContent = t('authRequiredText');
    if (els.score) els.score.textContent = '0';
    if (els.rules) els.rules.textContent = t('authRequiredText');
    if (els.howTo) els.howTo.innerHTML = '';
    hideRoomPanel();
    if (els.board) {
      els.board.className = 'brain-board brain-game-gate-board';
      els.board.innerHTML = '<div class="brain-game-gate"><strong>' + escapeHtml(t('authRequiredTitle')) + '</strong><p>' + escapeHtml(t('authRequiredText')) + '</p><button class="primary-btn" type="button" id="gameAuthGateBtn">' + escapeHtml(t('createAccount')) + '</button></div>';
      document.getElementById('gameAuthGateBtn')?.addEventListener('click', openAccountModal);
    }
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
      '<section class="brain-modal-card">' +
        '<button class="brain-modal-close" type="button" data-close-modal>Close</button>' +
        '<h2>' + escapeHtml(state.user ? state.user.username : t('signIn')) + '</h2>' +
        '<form class="brain-auth-form" id="gameAuthForm">' +
          '<label><span>Username</span><input id="authUsername" required minlength="3" maxlength="20" autocomplete="username" autocapitalize="none" spellcheck="false"></label>' +
          '<label><span>Password</span><input id="authPassword" type="password" required minlength="1" maxlength="128" autocomplete="current-password"></label>' +
          '<button class="primary-btn" type="submit">' + escapeHtml(t('signIn')) + '</button>' +
          '<p class="brain-muted"><a href="/?signup=1">' + escapeHtml(t('createAccount')) + '</a></p>' +
          '<p class="brain-auth-error" id="authError" role="alert"></p>' +
        '</form>' +
      '</section>' +
    '</div>';
    root.querySelectorAll('[data-close-modal]').forEach(button => button.addEventListener('click', closeBrainModal));
    root.querySelector('#gameAuthForm')?.addEventListener('submit', async event => {
      event.preventDefault();
      const error = root.querySelector('#authError');
      try {
        const response = await fetch('/api/auth/login', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            username: root.querySelector('#authUsername').value.trim(),
            password: root.querySelector('#authPassword').value,
          }),
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error || 'Could not sign in');
        closeBrainModal();
        await refreshProfile();
        if (state.user && !state.engine) {
          bootGame();
        } else {
          render();
        }
      } catch (err) {
        error.textContent = err.message || 'Could not sign in';
      }
    });
  }

  function openLeaderboard() {
    const root = document.getElementById('brainModalRoot');
    if (!root) return;
    document.body.classList.add('modal-open');
    const closeBrainModal = () => {
      root.innerHTML = '';
      document.body.classList.remove('modal-open');
    };
    root.innerHTML = '<div class="brain-modal" role="dialog" aria-modal="true">' +
      '<button class="brain-modal-backdrop" type="button" data-close-modal aria-label="Close"></button>' +
      '<section class="brain-modal-card">' +
        '<button class="brain-modal-close" type="button" data-close-modal>Close</button>' +
        '<h2>' + escapeHtml(t('topScores')) + '</h2>' +
        '<div class="brain-leaderboard-table" id="gameLeaderboardTable">' + escapeHtml(t('leaderboardLoading')) + '</div>' +
      '</section>' +
    '</div>';
    root.querySelectorAll('[data-close-modal]').forEach(button => button.addEventListener('click', closeBrainModal));
    fetch('/api/boardgame/leaderboard?game=' + encodeURIComponent(state.gameMeta.id) + '&limit=10', { credentials: 'include' })
      .then(response => {
        if (!response.ok) throw new Error('Scores unavailable');
        return response.json();
      })
      .then(data => {
        const rows = data.leaderboard || [];
        const table = document.getElementById('gameLeaderboardTable');
        if (!table) return;
        if (!rows.length) { table.textContent = t('leaderboardEmpty'); return; }
        table.innerHTML = '<table><thead><tr><th>' + escapeHtml(t('rank')) + '</th><th>' + escapeHtml(t('player')) + '</th><th>' + escapeHtml(t('score')) + '</th></tr></thead><tbody>' +
          rows.map((row, index) => '<tr><td>' + escapeHtml(row.rank || index + 1) + '</td><td>' + escapeHtml(row.username || 'Anonymous') + '</td><td>' + escapeHtml(row.score || 0) + '</td></tr>').join('') +
          '</tbody></table>';
      })
      .catch(function () {
        const table = document.getElementById('gameLeaderboardTable');
        if (table) table.textContent = t('leaderboardError');
      });
  }

  function escapeHtml(value) {
    return String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  document.addEventListener('DOMContentLoaded', init);
})();
