// Selection controls load only with Battle Room, outside the startup bundle.
export function createBattleSelection(dependencies) {
  const {
    battleState,
    state,
    document,
    loadBattleCategoryCards,
    preparedQuickFire,
    escapeHtml,
    localizedErrorMessage,
    normalizeBattleCode,
    showBattleError,
    renderBattleUI,
    handleBattleCreate,
    handleBattleJoin,
    t,
  } = dependencies;

function captureBattleSetup() {
  if (battleState.phase !== 'setup') return;
  const fields = {
    name: 'battleNameInput', category: 'battleCatSelect', difficulty: 'battleDiffSelect', code: 'battleCodeInput',
  };
  for (const [key, id] of Object.entries(fields)) {
    const input = document.getElementById(id);
    if (input) battleState.setup[key] = input.value;
  }
  const count = Number(document.getElementById('battleCountSelect')?.value);
  if (Number.isInteger(count) && count >= 5 && count <= 30) battleState.setup.questionCount = count;
}

function battleAvailableCategories() {
  return (state.catalog?.categories || []).filter(category => Number(category.quickFireQuestionCount) >= 5);
}

function renderBattleSetup(body) {
  const lang = state.lang;
  const isAr = lang === 'ar';
  const slug = battleState.setup.category;
  const availableCategories = battleAvailableCategories();
  const selectedIsAvailable = availableCategories.some(category => category.slug === slug);
  const joinPending = battleState.tab === 'join' && battleState.joinPending;
  const catOptions = `<option value="" disabled${selectedIsAvailable ? '' : ' selected'}>${isAr ? 'اختر موضوعًا متاحًا' : 'Choose an available topic'}</option>` + availableCategories
    .map(category => `<option value="${escapeHtml(category.slug)}"${category.slug === slug ? ' selected' : ''}>${escapeHtml(category.title[lang])}</option>`)
    .join('');

  body.innerHTML = `
    <div class="battle-setup">
      <div class="battle-setup-tabs">
        <button class="battle-tab${battleState.tab === 'create' ? ' active' : ''}" id="battleTabCreate">
          + ${isAr ? 'أنشئ غرفة' : 'Create Room'}
        </button>
        <button class="battle-tab${battleState.tab === 'join' ? ' active' : ''}" id="battleTabJoin">
          ← ${isAr ? 'انضم إلى غرفة' : 'Join Room'}
        </button>
      </div>
      <div class="battle-form">
        <label>
          ${isAr ? 'اسمك' : 'Your name'}
          <input type="text" id="battleNameInput" maxlength="20"
            placeholder="${isAr ? 'أدخل اسمك' : 'Enter your name'}"
            value="${escapeHtml(battleState.setup.name)}" autocomplete="nickname" />
        </label>
        ${battleState.tab === 'create' ? `
          <label>
            ${isAr ? 'الموضوع' : 'Category'}
            <select id="battleCatSelect" aria-describedby="battleChoiceHint">${catOptions}</select>
          </label>
          <p id="battleChoiceHint" role="status" aria-live="polite"></p>
          <button class="ghost-btn hidden" id="battleRetryQuestionsBtn">${isAr ? 'أعد فحص الأسئلة' : 'Check questions again'}</button>
          <label>
            ${isAr ? 'المستوى' : 'Difficulty'}
            <select id="battleDiffSelect" disabled aria-describedby="battleChoiceHint"></select>
          </label>
          <label>
            ${isAr ? 'عدد الأسئلة' : 'Questions'}
            <select id="battleCountSelect" disabled aria-describedby="battleChoiceHint"></select>
          </label>
          <button class="primary-btn" id="battleCreateBtn" disabled>⚡ ${isAr ? 'أنشئ الغرفة' : 'Create Battle Room'}</button>
        ` : `
          <label>
            ${isAr ? 'رمز الغرفة' : 'Room code'}
            <input type="text" id="battleCodeInput" maxlength="16"
              placeholder="${isAr ? 'مثال: SCI7X2KQ' : 'e.g. SCI7X2KQ'}"
              value="${escapeHtml(battleState.setup.code)}" dir="ltr"
              style="text-transform:uppercase;font-family:var(--font-mono);letter-spacing:0.08em;"
              autocomplete="off" />
          </label>
          <button class="primary-btn" id="battleJoinBtn"${joinPending ? ' disabled aria-busy="true"' : ''}>
            ⚡ ${joinPending ? t('battleJoining') : (isAr ? 'انضم إلى الغرفة' : 'Join Room')}
          </button>
        `}
        <p class="battle-error hidden" id="battleSetupError"></p>
      </div>
    </div>`;

  document.getElementById('battleTabCreate')?.addEventListener('click', () => { captureBattleSetup(); battleState.tab = 'create'; renderBattleUI(); });
  document.getElementById('battleTabJoin')?.addEventListener('click', () => { captureBattleSetup(); battleState.tab = 'join'; renderBattleUI(); });
  document.getElementById('battleCreateBtn')?.addEventListener('click', handleBattleCreate);
  document.getElementById('battleJoinBtn')?.addEventListener('click', handleBattleJoin);
  document.getElementById('battleNameInput')?.addEventListener('input', captureBattleSetup);
  document.getElementById('battleCatSelect')?.addEventListener('change', () => {
    captureBattleSetup();
    battleState.setup.difficulty = 'all';
    battleState.setup.questionCount = 10;
    clearBattleError();
    void loadBattleSelection();
  });
  document.getElementById('battleDiffSelect')?.addEventListener('change', () => {
    captureBattleSetup();
    clearBattleError();
    refreshBattleSelection();
  });
  document.getElementById('battleCountSelect')?.addEventListener('change', captureBattleSetup);
  document.getElementById('battleRetryQuestionsBtn')?.addEventListener('click', () => {
    clearBattleError();
    void loadBattleSelection();
  });
  const codeInput = document.getElementById('battleCodeInput');
  codeInput?.addEventListener('input', () => {
    codeInput.value = normalizeBattleCode(codeInput.value);
    captureBattleSetup();
  });
  refreshBattleSelection();
  if (battleState.tab === 'create' && battleState.selectionError) {
    showBattleError(localizedErrorMessage(battleState.selectionError, 'errorBattleCreate'));
  } else if (battleState.setupError && battleState.setupErrorTab === battleState.tab) showBattleError(battleState.setupError);
  if (battleState.tab === 'create' && selectedIsAvailable && battleState.selectionSlug !== slug) void loadBattleSelection();
}

function clearBattleError() {
  battleState.setupError = '';
  const error = document.getElementById('battleSetupError');
  if (error) { error.textContent = ''; error.classList.add('hidden'); }
}

function refreshBattleSelection() {
  if (battleState.phase !== 'setup' || battleState.tab !== 'create') return;
  const isAr = state.lang === 'ar';
  const { category } = battleState.setup;
  const selectedIsAvailable = battleAvailableCategories().some(item => item.slug === category);
  const counts = battleState.selectionSlug === category ? battleState.selectionCounts : null;
  const ready = selectedIsAvailable && !battleState.selectionLoading && counts !== null;
  const difficulties = [
    ['all', isAr ? 'جميع المستويات' : 'All levels'],
    ['easy', isAr ? 'سهل' : 'Easy'],
    ['medium', isAr ? 'متوسط' : 'Medium'],
    ['hard', isAr ? 'صعب' : 'Hard'],
    ['very-advanced', isAr ? 'صعب جداً' : 'Very difficult'],
  ];
  if (!difficulties.some(([value]) => value === battleState.setup.difficulty)
    || (ready && Number(counts[battleState.setup.difficulty]) < 5)) battleState.setup.difficulty = 'all';
  const difficulty = document.getElementById('battleDiffSelect');
  if (difficulty) {
    difficulty.innerHTML = difficulties.map(([value, label]) => `<option value="${value}"${value === battleState.setup.difficulty ? ' selected' : ''}${!ready || counts[value] < 5 ? ' disabled' : ''}>${label}${ready ? ` (${counts[value]})` : ''}</option>`).join('');
    difficulty.disabled = !ready || counts.all < 5 || battleState.createPending;
  }
  const available = ready ? counts[battleState.setup.difficulty] : 0;
  const cap = Math.min(30, available);
  const countOptions = [...new Set([10, 20, 30, cap])].filter(value => value >= 5 && value <= cap).sort((a, b) => a - b);
  if (!countOptions.includes(battleState.setup.questionCount)) {
    battleState.setup.questionCount = countOptions.filter(value => value <= battleState.setup.questionCount).at(-1) || countOptions[0] || 10;
  }
  const count = document.getElementById('battleCountSelect');
  if (count) {
    count.innerHTML = countOptions.map(value => `<option value="${value}"${value === battleState.setup.questionCount ? ' selected' : ''}>${value}</option>`).join('');
    count.disabled = !ready || available < 5 || battleState.createPending;
  }
  const hint = document.getElementById('battleChoiceHint');
  if (hint) {
    hint.textContent = !selectedIsAvailable
      ? (isAr ? 'اختر موضوعًا متاحًا لإنشاء غرفة. بقية الموضوعات متاحة في التدريب المجاني.' : 'Choose an available topic to create a room. Other topics remain available in free practice.')
      : battleState.selectionLoading
        ? (isAr ? 'جارٍ فحص الأسئلة ذات الخيارات المُعدّة…' : 'Checking prepared questions…')
        : battleState.selectionError
          ? (isAr ? 'تعذّر فحص الأسئلة. تحقق من الاتصال ثم أعد المحاولة.' : 'Could not check questions. Check your connection and try again.')
          : ready && available >= 5
            ? (isAr ? `${available} سؤالًا بخيارات مُعدّة متاحًا لهذا المستوى. المستويات التي تحتوي على أقل من 5 أسئلة غير متاحة للمعركة.` : `${available} prepared questions available for this level. Levels with fewer than 5 questions are unavailable for Battle Room.`)
            : (isAr ? 'يحتاج هذا الموضوع إلى 5 أسئلة بخيارات مُعدّة لإنشاء غرفة. اختر موضوعًا آخر أو استخدم التدريب المجاني.' : 'This topic needs 5 prepared questions to create a room. Choose another topic or use free practice.');
  }
  document.getElementById('battleRetryQuestionsBtn')?.classList.toggle('hidden', !battleState.selectionError);
  const create = document.getElementById('battleCreateBtn');
  if (create) {
    create.disabled = !ready || available < 5 || battleState.createPending;
    create.textContent = battleState.createPending
      ? (isAr ? 'جارٍ الإنشاء…' : 'Creating…')
      : `⚡ ${isAr ? 'أنشئ الغرفة' : 'Create Battle Room'}`;
    if (battleState.createPending || battleState.selectionLoading) create.setAttribute('aria-busy', 'true');
    else create.removeAttribute('aria-busy');
  }
  const categorySelect = document.getElementById('battleCatSelect');
  if (categorySelect) categorySelect.disabled = battleState.createPending;
  for (const id of ['battleTabCreate', 'battleTabJoin']) {
    const tab = document.getElementById(id);
    if (tab) tab.disabled = battleState.createPending;
  }
}

async function loadBattleSelection() {
  const category = battleState.setup.category;
  const generation = ++battleState.selectionGeneration;
  battleState.selectionSlug = category;
  battleState.selectionCounts = null;
  battleState.selectionLoading = true;
  battleState.selectionError = null;
  refreshBattleSelection();
  try {
    if (!battleAvailableCategories().some(item => item.slug === category)) return;
    if (typeof loadBattleCategoryCards !== 'function' || typeof preparedQuickFire !== 'function') throw new Error('Question availability is unavailable');
    const cards = await loadBattleCategoryCards(category);
    if (!Array.isArray(cards)) throw new Error('Invalid question source');
    const counts = { all: 0, easy: 0, medium: 0, hard: 0, 'very-advanced': 0 };
    const seen = new Set();
    for (const card of cards) {
      if (typeof card?.id !== 'string' || !card.id.trim() || typeof card.difficulty !== 'string'
        || seen.has(card.id) || !preparedQuickFire(card)) continue;
      seen.add(card.id);
      counts.all += 1;
      if (Object.hasOwn(counts, card.difficulty) && card.difficulty !== 'all') counts[card.difficulty] += 1;
    }
    if (generation !== battleState.selectionGeneration || battleState.phase !== 'setup' || battleState.setup.category !== category) return;
    battleState.selectionCounts = counts;
  } catch (error) {
    if (generation !== battleState.selectionGeneration || battleState.phase !== 'setup' || battleState.setup.category !== category) return;
    battleState.selectionError = error;
    if (battleState.tab === 'create') showBattleError(localizedErrorMessage(error, 'errorBattleCreate'));
  } finally {
    if (generation === battleState.selectionGeneration && battleState.phase === 'setup' && battleState.setup.category === category) {
      battleState.selectionLoading = false;
      refreshBattleSelection();
    }
  }
}

  return Object.freeze({
    captureBattleSetup,
    renderBattleSetup,
    clearBattleError,
    refreshBattleSelection,
    loadBattleSelection,
  });
}
