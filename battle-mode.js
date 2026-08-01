// Loaded on demand by app.js when a user opens a live Battle Room.
// Keeping this API/WebSocket-only feature out of the initial bundle protects
// startup cost while preserving the existing bilingual behavior.

export function createBattleMode(dependencies) {
  const {
    API_ORIGIN,
    activateFocus,
    apiFetch,
    deactivateFocus,
    escapeHtml,
    localizedErrorMessage,
    shareOrCopy,
    showToast,
    state,
    t,
  } = dependencies;

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
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-modal', 'true');
  el.setAttribute('aria-hidden', 'true');
  el.setAttribute('aria-labelledby', 'battleTitle');
  document.body.appendChild(el);
}

function openBattleModal(slug, tab = 'create', initialCode = '') {
  if (!document.getElementById('battleOverlay')) createBattleModal();
  battleState.pendingSlug = slug || state.categorySlug || '';
  battleState.phase = 'setup';
  battleState.tab = tab === 'join' ? 'join' : 'create';
  const overlay = document.getElementById('battleOverlay');
  overlay?.classList.remove('hidden');
  overlay?.setAttribute('aria-hidden', 'false');
  renderBattleUI();
  const codeInput = document.getElementById('battleCodeInput');
  if (codeInput && initialCode) codeInput.value = normalizeBattleCode(initialCode);
}

function closeBattleModal() {
  clearInterval(battleState.timerInterval);
  if (battleState.ws) {
    battleState.ws.onclose = null;
    battleState.ws.close();
    battleState.ws = null;
  }
  const overlay = document.getElementById('battleOverlay');
  overlay?.classList.add('hidden');
  overlay?.setAttribute('aria-hidden', 'true');
  battleState.phase = 'closed';
  deactivateFocus();
}

function battleInitialFocus() {
  if (battleState.phase === 'setup') {
    return battleState.tab === 'join' ? '#battleCodeInput' : '#battleNameInput';
  }
  if (battleState.phase === 'lobby') {
    return battleState.isHost ? '#battleStartBtn' : '#battleShareBtn';
  }
  if (battleState.phase === 'question') return '.battle-option-btn:not(:disabled)';
  if (battleState.phase === 'finished') return '#battlePlayAgainBtn';
  return '#battleExitBtn';
}

function renderBattleUI() {
  const overlay = document.getElementById('battleOverlay');
  if (!overlay) return;
  const isAr = state.lang === 'ar';
  const titles = {
    setup: isAr ? '⚡ غرفة المعركة' : '⚡ Battle Room',
    lobby: isAr ? '⚡ غرفة الانتظار' : '⚡ Battle Lobby',
    question: isAr ? '⚡ المعركة جارية' : '⚡ Battle in Progress',
    reveal: isAr ? '⚡ الإجابة' : '⚡ Answer Reveal',
    finished: isAr ? '🏆 انتهت المعركة' : '🏆 Battle Complete',
  };
  overlay.innerHTML = `
    <div class="battle-header">
      <span class="battle-header-title" id="battleTitle">${titles[battleState.phase] || `⚡ ${escapeHtml(t('teamBattle'))}`}</span>
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
  activateFocus(battleInitialFocus());
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
    battleState.phase = 'question';
    battleState.timeLeft = Math.round(msg.timeMs / 1000);
    battleState.answerStartTime = Date.now();
    renderBattleUI();
    startBattleTimer(msg.timeMs);
    return;
  }
  if (msg.type === 'answer-count') {
    battleState.answeredCount = msg.answeredCount;
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
              ${p.id === battleState.playerId ? `<span class="pill" style="font-size:var(--text-xs)">${isAr ? 'أنت' : 'You'}</span>` : ''}
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
    void shareOrCopy({
      title: t('shareBattleTitle'),
      text: isAr ? 'انضم إلى غرفة معركة JAKH المباشرة' : 'Join this live JAKH Battle Room',
      url: shareUrl,
      copiedMessage: isAr ? 'تم نسخ الرابط!' : 'Link copied!',
    });
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
    void shareOrCopy({
      title: t('shareBattleTitle'), text, url: location.origin,
      copiedMessage: isAr ? 'تم النسخ!' : 'Copied!',
    });
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


  return Object.freeze({
    closeBattleModal,
    createBattleModal,
    openBattleModal,
    renderBattleUI,
  });
}
