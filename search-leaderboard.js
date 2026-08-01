// Loaded only when global search or the server-checked leaderboard is opened.
// The factory keeps application/session state in app.js while moving the
// feature implementation and its search-index work off the initial route.

const FEATURE_COPY = Object.freeze({
  en: Object.freeze({
    leaderboardTop: 'Accuracy-only submitted-answer rankings',
    leaderboardDisclaimer: 'Only one-time challenges issued and scored by JAKH enter this board. Server checking applies to submitted answers and scoring, not editorial fact review. Your practice points stay private.',
    leaderboardEmpty: 'No server-checked scores yet. Start a challenge and submit the first accuracy-only score.',
    verifiedStartTitle: 'Take a server-checked challenge',
    verifiedStartText: 'Choose a topic and answer 10 questions in one sitting. You have 15 minutes; submitted answers are checked automatically by the server. This is separate from editorial fact review.',
    verifiedCategory: 'Challenge topic',
    verifiedStart: 'Start server-checked challenge',
    verifiedSignIn: 'Sign in to enter the server-checked leaderboard.',
    verifiedSubmit: 'Submit answers for server checking',
    verifiedCancel: 'Cancel challenge',
    verifiedActiveWarning: 'Discarding it can invalidate a challenge still open in another tab. Continue only if you want to replace that attempt.',
    verifiedDiscardActive: 'Discard active attempt and retry',
    verifiedKeepActive: 'Keep active attempt',
    verifiedDiscarding: 'Discarding…',
    verifiedQuestion: 'Question {number} of {total}',
    verifiedAnswerPlaceholder: 'Type your answer',
    verifiedResultTitle: 'Server-checked result',
    verifiedResult: '{correct}/{total} correct · {score} points',
    verifiedResultNote: 'The server checked this score, so it is eligible for the public leaderboard. This does not indicate human editorial review of the card content.',
    serverCheckedAutomationDisclaimer: 'This is accuracy-only server checking, not proctoring. JAKH does not verify who answered or prevent lookups or automated tools.',
    verifiedReviewUnavailable: 'Editorial review status was not supplied for these server-checked questions. Do not treat server scoring as factual or safety review.',
    verifiedTryAgain: 'Try another challenge',
    verifiedStarting: 'Starting…',
    verifiedSubmitting: 'Checking answers…',
    pointsShort: 'pts',
    globalSearchLabel: 'Global search',
    globalSearchPlaceholder: 'Search all 3,500+ questions…',
    globalSearchInputLabel: 'Search all questions',
    globalSearchStart: 'Start typing to search across all categories…',
    globalSearchMin: 'Type at least 2 characters…',
    globalSearchEmpty: 'No results.',
  }),
  ar: Object.freeze({
    leaderboardTop: 'ترتيب الإجابات المرسلة بحسب الدقة فقط',
    leaderboardDisclaimer: 'لا تظهر هنا إلا تحديات JAKH المؤقتة التي يصدرها الخادم ويصححها. يشير تحقق الخادم إلى الإجابات المرسلة وحساب النتيجة، وليس إلى مراجعة تحريرية بشرية للمعلومات. تبقى نقاط التدريب خاصة بك.',
    leaderboardEmpty: 'لا توجد نتائج تحقّق منها الخادم بعد. ابدأ تحديًا وأرسل أول نتيجة محسوبة بحسب الدقة فقط.',
    verifiedStartTitle: 'ابدأ تحديًا يتحقق منه الخادم',
    verifiedStartText: 'اختر موضوعًا وأجب عن 10 أسئلة في جلسة واحدة. لديك 15 دقيقة، ويتحقق الخادم آليًا من الإجابات المرسلة. وهذا منفصل عن المراجعة التحريرية للمعلومات.',
    verifiedCategory: 'موضوع التحدي',
    verifiedStart: 'ابدأ تحديًا يتحقق منه الخادم',
    verifiedSignIn: 'سجّل الدخول للمشاركة في لوحة النتائج التي يتحقق منها الخادم.',
    verifiedSubmit: 'أرسل الإجابات ليتحقق منها الخادم',
    verifiedCancel: 'إلغاء التحدي',
    verifiedActiveWarning: 'قد يؤدي حذفه إلى إبطال تحدٍ ما زال مفتوحًا في علامة تبويب أخرى. تابع فقط إذا أردت استبدال تلك المحاولة.',
    verifiedDiscardActive: 'احذف المحاولة النشطة وأعد المحاولة',
    verifiedKeepActive: 'احتفظ بالمحاولة النشطة',
    verifiedDiscarding: 'جارٍ الحذف…',
    verifiedQuestion: 'السؤال {number} من {total}',
    verifiedAnswerPlaceholder: 'اكتب إجابتك',
    verifiedResultTitle: 'نتيجة تحقّق منها الخادم',
    verifiedResult: '{correct}/{total} صحيحة · {score} نقطة',
    verifiedResultNote: 'تحقّق الخادم من هذه النتيجة، لذا فهي مؤهلة للظهور في لوحة المتصدرين. ولا يعني ذلك أن محتوى البطاقات خضع لمراجعة تحريرية بشرية.',
    serverCheckedAutomationDisclaimer: 'هذا تحقق خادمي من الدقة فقط وليس مراقبة للاختبار. لا يتحقق JAKH من هوية المجيب ولا يمنع البحث أو الأدوات الآلية.',
    verifiedReviewUnavailable: 'لم يرسل الخادم حالة المراجعة التحريرية لهذه الأسئلة. لا تعتبر حساب النتيجة مراجعة للمعلومة أو السلامة.',
    verifiedTryAgain: 'جرّب تحديًا آخر',
    verifiedStarting: 'جارٍ البدء…',
    verifiedSubmitting: 'جارٍ التحقق…',
    pointsShort: 'نقطة',
    globalSearchLabel: 'البحث الشامل',
    globalSearchPlaceholder: 'ابحث في أكثر من 3,500 سؤال…',
    globalSearchInputLabel: 'ابحث في جميع الأسئلة',
    globalSearchStart: 'اكتب للبحث في جميع الفئات…',
    globalSearchMin: 'اكتب حرفين على الأقل…',
    globalSearchEmpty: 'لا توجد نتائج.',
  }),
});

export function normalizeGlobalSearchText(value, lang) {
  let normalized = String(value || '')
    .normalize('NFKC')
    .toLocaleLowerCase(lang === 'ar' ? 'ar' : 'en-US');
  if (lang === 'ar') {
    normalized = normalized
      .replace(/[\u0610-\u061a\u0640\u064b-\u065f\u0670\u06d6-\u06ed]/gu, '')
      .replace(/[أإآٱ]/gu, 'ا')
      .replace(/ى/gu, 'ي');
  }
  return normalized.replace(/\p{P}+/gu, ' ').replace(/\s+/gu, ' ').trim();
}

export function rankGlobalSearch(searchIndex, categories, query, lang) {
  const language = lang === 'ar' ? 'ar' : 'en';
  const q = normalizeGlobalSearchText(query, language);
  if (!q) return [];
  const categoriesBySlug = new Map((categories || []).map(category => [category.slug, category]));
  const relevance = (value, exact, prefix, includes) => {
    const normalized = normalizeGlobalSearchText(value, language);
    if (!normalized) return 0;
    if (normalized === q) return exact;
    if (normalized.startsWith(q)) return prefix;
    return normalized.includes(q) ? includes : 0;
  };
  const hits = [];
  searchIndex.cards.forEach((row, sourceIndex) => {
    const cat = categoriesBySlug.get(searchIndex.categories[row[0]]);
    if (!cat) return;
    const categoryText = language === 'ar'
      ? cat.title?.ar
      : [cat.slug, cat.title?.en].join(' ');
    const score = relevance(row[2], 2_000, 1_200, 800)
      + relevance(row[3], 1_500, 1_000, 600)
      + relevance(categoryText, 200, 150, 100);
    if (score > 0) {
      hits.push({
        cat,
        id: row[1],
        question: row[2],
        answer: row[3],
        score,
        sourceIndex,
      });
    }
  });
  return hits.sort((a, b) => b.score - a.score
    || a.cat.slug.localeCompare(b.cat.slug, 'en')
    || a.question.localeCompare(b.question, language)
    || a.answer.localeCompare(b.answer, language)
    || a.sourceIndex - b.sourceIndex);
}

export function createSearchLeaderboard(dependencies) {
  const {
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
    t: sharedT,
    trapFocus,
  } = dependencies;

  const t = key => FEATURE_COPY[state.lang]?.[key] || FEATURE_COPY.en[key] || sharedT(key);
  const fmt = (key, vars = {}) => t(key).replace(/\{(\w+)\}/g, (_, token) => String(vars[token] ?? ''));

  let verifiedChallenge = null;
  const searchIndexes = new Map();
  const searchIndexPromises = new Map();
  let searchGeneration = 0;

  function createLeaderboardModal() {
    if (document.getElementById('leaderboardModal')) return;
    const el = document.createElement('div');
    el.id = 'leaderboardModal';
    el.className = 'modal hidden';
    el.setAttribute('aria-hidden', 'true');
    el.innerHTML = `
      <div class="modal-backdrop" data-close-modal="leaderboard"></div>
      <div class="modal-card verified-leaderboard-card" role="dialog" aria-modal="true" aria-labelledby="leaderboardTitle">
        <div class="modal-head">
          <div>
            <p class="eyebrow">🏆 ${escapeHtml(t('leaderboardTitle'))}</p>
            <h2 id="leaderboardTitle">${escapeHtml(t('leaderboardTop'))}</h2>
            <p class="muted">${escapeHtml(t('leaderboardDisclaimer'))}</p>
            <p class="server-check-disclosure">${escapeHtml(t('serverCheckedAutomationDisclaimer'))}</p>
          </div>
          <button class="icon-btn" data-close-modal="leaderboard" aria-label="${escapeHtml(t('close'))}">×</button>
        </div>
        <div id="verifiedChallengeMount"></div>
        <section class="verified-ranking-section" aria-labelledby="verifiedRankingTitle">
          <div class="verified-section-head">
            <h3 id="verifiedRankingTitle">${escapeHtml(t('leaderboardTitle'))}</h3>
            <span class="verified-shield" aria-label="${escapeHtml(state.lang === 'ar' ? 'يتحقق منه الخادم' : 'Server checked')}">✓</span>
          </div>
          <div id="leaderboardBody" class="verified-ranking-list" aria-live="polite"></div>
        </section>
      </div>`;
    document.body.appendChild(el);
  }

  async function loadGlobalSearchIndex(lang = state.lang) {
    const language = lang === 'ar' ? 'ar' : 'en';
    if (searchIndexes.has(language)) return searchIndexes.get(language);
    if (!searchIndexPromises.has(language)) {
      const request = fetchJson(`/data/search-index.${language}.json`)
        .then((payload) => {
          if (
            payload?.version !== 2
            || payload.language !== language
            || payload.total !== payload.cards?.length
            || !Array.isArray(payload.categories)
            || !Array.isArray(payload.cards)
            || !payload.categories.every(slug => typeof slug === 'string' && slug)
            || !payload.cards.every(row => (
              Array.isArray(row)
              && row.length === 4
              && Number.isInteger(row[0])
              && row[0] >= 0
              && row[0] < payload.categories.length
              && row.slice(1).every(value => typeof value === 'string' && value)
            ))
          ) {
            throw new Error('Invalid global search index');
          }
          searchIndexes.set(language, payload);
          return payload;
        })
        .finally(() => {
          searchIndexPromises.delete(language);
        });
      searchIndexPromises.set(language, request);
    }
    return searchIndexPromises.get(language);
  }

  function openGlobalSearch(initialValue = '') {
    void loadGlobalSearchIndex(state.lang).catch(() => undefined);
    const existingOverlay = document.getElementById('globalSearchOverlay');
    if (existingOverlay) {
      existingOverlay.classList.remove('hidden');
      existingOverlay.setAttribute('aria-hidden', 'false');
      trapFocus(existingOverlay, {
        key: 'global-search',
        initialFocus: '#globalSearchInput',
        onEscape: closeGlobalSearch,
        returnFallback: '#globalSearchBtn',
      });
      const existingInput = document.getElementById('globalSearchInput');
      if (existingInput && initialValue) {
        existingInput.value = initialValue;
        void runGlobalSearch();
      }
      return;
    }
    const overlay = document.createElement('div');
    overlay.id = 'globalSearchOverlay';
    overlay.className = 'global-search-overlay';
    overlay.setAttribute('aria-hidden', 'false');
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
    trapFocus(overlay, {
      key: 'global-search',
      initialFocus: '#globalSearchInput',
      onEscape: closeGlobalSearch,
      returnFallback: '#globalSearchBtn',
    });

    overlay.querySelector('.global-search-backdrop').addEventListener('click', closeGlobalSearch);
    document.getElementById('globalSearchClose').addEventListener('click', closeGlobalSearch);

    const input = document.getElementById('globalSearchInput');
    input?.addEventListener('input', debounce(runGlobalSearch, 280));
    if (input && initialValue) {
      input.value = initialValue;
      void runGlobalSearch();
    }
  }

  function closeGlobalSearch() {
    searchGeneration++;
    const overlay = document.getElementById('globalSearchOverlay');
    if (!overlay || overlay.classList.contains('hidden')) return;
    overlay.classList.add('hidden');
    overlay.setAttribute('aria-hidden', 'true');
    releaseFocus(overlay, { restore: true });
  }

  async function runGlobalSearch() {
    const generation = ++searchGeneration;
    const q = document.getElementById('globalSearchInput')?.value.trim();
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
      searchIndex = await loadGlobalSearchIndex(state.lang);
    } catch {
      if (generation === searchGeneration) {
        resultsEl.removeAttribute('aria-busy');
        resultsEl.innerHTML = `<p class="global-search-hint">${escapeHtml(t('globalSearchUnavailable'))}</p>`;
      }
      return;
    }
    if (generation !== searchGeneration) return;
    resultsEl.removeAttribute('aria-busy');

    const hits = rankGlobalSearch(searchIndex, state.catalog?.categories || [], q, state.lang);

    if (generation !== searchGeneration) return;
    if (!hits.length) {
      resultsEl.innerHTML = `<p class="global-search-hint">${escapeHtml(t('globalSearchEmpty'))}</p>`;
      return;
    }
    const shownHits = hits.slice(0, 30);
    const resultSummary = state.lang === 'ar'
      ? `تم العثور على ${hits.length} نتيجة. عرض أفضل ${shownHits.length} نتيجة مرتبة حسب الصلة.`
      : `${hits.length} results found. Showing the top ${shownHits.length}, ranked by relevance.`;
    resultsEl.innerHTML = `<p class="global-search-summary" role="status">${escapeHtml(resultSummary)}</p>` + shownHits.map(({ cat, id, question, answer }) => `
      <a class="gs-result" href="${escapeHtml(categoryRouteForLanguage(cat.slug, state.lang))}?card=${encodeURIComponent(id)}">
        <span class="gs-result-cat">${escapeHtml(cat.emoji)} ${escapeHtml(cat.title[state.lang])}</span>
        <span class="gs-result-q">${escapeHtml(question)}</span>
        <span class="gs-result-a">${escapeHtml(answer)}</span>
      </a>
    `).join('');
    resultsEl.querySelectorAll('.gs-result').forEach(el => {
      el.addEventListener('click', closeGlobalSearch);
    });
  }

  function verifiedCategoryOptions() {
    return (state.catalog?.categories || [])
      .filter(category => Number(category.scorableQuestionCount) >= 10)
      .sort((a, b) => String(a.title?.[state.lang] || a.title?.en || a.slug)
        .localeCompare(String(b.title?.[state.lang] || b.title?.en || b.slug), state.lang));
  }

  function hasServerCheckedContract(payload) {
    return payload?.scoreType === 'server-checked'
      && payload?.serverChecked === true
      && payload?.proctored === false
      && payload?.scoring === 'accuracy-only'
      && typeof payload?.automationDisclaimer === 'string'
      && payload.automationDisclaimer.trim().length > 0;
  }

  function renderVerifiedStarter() {
    const mount = document.getElementById('verifiedChallengeMount');
    if (!mount) return;
    if (verifiedChallenge) {
      renderVerifiedChallenge(verifiedChallenge);
      return;
    }
    if (!state.dbUser) {
      mount.innerHTML = `
        <section class="verified-starter verified-signin-prompt">
          <div>
            <h3>${escapeHtml(t('verifiedStartTitle'))}</h3>
            <p>${escapeHtml(t('verifiedSignIn'))}</p>
          </div>
          <button type="button" class="primary-btn" id="verifiedSignInBtn">${escapeHtml(t('signIn'))}</button>
        </section>`;
      document.getElementById('verifiedSignInBtn')?.addEventListener('click', () => {
        closeModal('leaderboard');
        openAuthModal();
      });
      return;
    }

    const categories = verifiedCategoryOptions();
    const preferredSlug = categories.some(category => category.slug === state.categorySlug)
      ? state.categorySlug
      : categories[0]?.slug;
    mount.innerHTML = `
      <section class="verified-starter">
        <div>
          <h3>${escapeHtml(t('verifiedStartTitle'))}</h3>
          <p>${escapeHtml(t('verifiedStartText'))}</p>
          <p class="server-check-disclosure">${escapeHtml(t('serverCheckedAutomationDisclaimer'))}</p>
        </div>
        <form id="verifiedStartForm" class="verified-start-form">
          <label for="verifiedCategorySelect">
            <span>${escapeHtml(t('verifiedCategory'))}</span>
            <select id="verifiedCategorySelect" required>
              ${categories.map(category => `
                <option value="${escapeHtml(category.slug)}" ${category.slug === preferredSlug ? 'selected' : ''}>
                  ${escapeHtml(`${category.emoji || '🧠'} ${category.title?.[state.lang] || category.title?.en || category.slug}`)}
                </option>`).join('')}
            </select>
          </label>
          <button type="submit" class="primary-btn" id="verifiedStartBtn" ${categories.length ? '' : 'disabled'}>${escapeHtml(t('verifiedStart'))}</button>
        </form>
      </section>`;
    document.getElementById('verifiedStartForm')?.addEventListener('submit', startVerifiedChallenge);
  }

  async function startVerifiedChallenge(event) {
    event?.preventDefault();
    const categoryId = document.getElementById('verifiedCategorySelect')?.value;
    const button = document.getElementById('verifiedStartBtn');
    if (!categoryId || !button) return;
    button.disabled = true;
    button.textContent = t('verifiedStarting');
    try {
      const challenge = await apiFetch('/scores/server-checked/challenge', {
        method: 'POST',
        body: JSON.stringify({ categoryId }),
      });
      if (!hasServerCheckedContract(challenge)
        || !Array.isArray(challenge.questions)
        || challenge.questions.length !== challenge.questionCount) {
        throw new Error('Invalid server-checked challenge');
      }
      verifiedChallenge = challenge;
      renderVerifiedChallenge(challenge);
    } catch (error) {
      if (error?.code === 'SERVER_CHECKED_CHALLENGE_ACTIVE') {
        renderActiveChallengeConflict(categoryId);
        return;
      }
      showToast(localizedErrorMessage(error, 'verifiedChallengeError'), true);
      button.disabled = false;
      button.textContent = t('verifiedStart');
    }
  }

  function renderActiveChallengeConflict(categoryId) {
    const mount = document.getElementById('verifiedChallengeMount');
    if (!mount) return;
    mount.innerHTML = `
      <section class="verified-starter server-check-conflict" role="alert" aria-labelledby="verifiedActiveTitle">
        <div>
          <h3 id="verifiedActiveTitle">${escapeHtml(t('verifiedActive'))}</h3>
          <p>${escapeHtml(t('verifiedActiveWarning'))}</p>
          <p id="verifiedDiscardStatus" class="verified-form-error hidden"></p>
        </div>
        <div class="hero-actions">
          <button type="button" class="primary-btn verified-danger-btn" id="verifiedDiscardActiveBtn">${escapeHtml(t('verifiedDiscardActive'))}</button>
          <button type="button" class="ghost-btn" id="verifiedKeepActiveBtn">${escapeHtml(t('verifiedKeepActive'))}</button>
        </div>
      </section>`;
    document.getElementById('verifiedKeepActiveBtn')?.addEventListener('click', renderVerifiedStarter);
    document.getElementById('verifiedDiscardActiveBtn')?.addEventListener('click', async () => {
      const button = document.getElementById('verifiedDiscardActiveBtn');
      const status = document.getElementById('verifiedDiscardStatus');
      if (!button) return;
      button.disabled = true;
      button.textContent = t('verifiedDiscarding');
      try {
        const result = await apiFetch('/scores/server-checked/challenge', {
          method: 'DELETE',
          body: JSON.stringify({ categoryId }),
        });
        if (typeof result?.discarded !== 'boolean') throw new Error('Invalid discard response');
        renderVerifiedStarter();
        const select = document.getElementById('verifiedCategorySelect');
        if (select) select.value = categoryId;
        await startVerifiedChallenge({ preventDefault() {} });
      } catch (error) {
        if (status) {
          status.textContent = localizedErrorMessage(error, 'verifiedDiscardError');
          status.classList.remove('hidden');
        }
        button.disabled = false;
        button.textContent = t('verifiedDiscardActive');
      }
    });
  }

  function renderVerifiedChallenge(challenge) {
    const mount = document.getElementById('verifiedChallengeMount');
    if (!mount) return;
    const questions = Array.isArray(challenge?.questions) ? challenge.questions : [];
    const expiresAt = new Date(challenge.expiresAt);
    const expiryLabel = Number.isNaN(expiresAt.getTime())
      ? ''
      : new Intl.DateTimeFormat(state.lang === 'ar' ? 'ar-AE' : 'en', {
        hour: 'numeric', minute: '2-digit',
      }).format(expiresAt);
    const allReviewMetadataSupplied = questions.every(item => item?.review
      && ['pending', 'reviewed'].includes(item.review.status));
    mount.innerHTML = `
      <section class="verified-challenge" aria-labelledby="verifiedChallengeTitle">
        <div class="verified-section-head">
          <div>
            <h3 id="verifiedChallengeTitle">${escapeHtml(t('verifiedStartTitle'))}</h3>
            <p>${escapeHtml(state.lang === 'ar'
              ? `أجب مرة واحدة قبل ${expiryLabel || 'انتهاء المهلة'}. لا تغلق هذه الصفحة قبل الإرسال.`
              : `Submit once before ${expiryLabel || 'the deadline'}. Keep this page open until you finish.`)}</p>
            <p class="server-check-disclosure">${escapeHtml(t('serverCheckedAutomationDisclaimer'))}</p>
            ${allReviewMetadataSupplied ? '' : `<p class="card-review card-review--safety" role="note">⚠ ${escapeHtml(t('verifiedReviewUnavailable'))}</p>`}
          </div>
          <button type="button" class="text-btn mini-btn" id="verifiedCancelBtn">${escapeHtml(t('verifiedCancel'))}</button>
        </div>
        <form id="verifiedChallengeForm" class="verified-question-list">
          ${questions.map((item, index) => `
            <div class="verified-question">
              <label for="verifiedAnswer${index}">
                <span class="verified-question-number">${escapeHtml(fmt('verifiedQuestion', { number: index + 1, total: questions.length }))}</span>
                <strong dir="auto">${escapeHtml(item.question?.[state.lang] || item.question?.en || '')}</strong>
                <input id="verifiedAnswer${index}" name="verifiedAnswer${index}" type="text" dir="auto"
                  autocomplete="off" maxlength="256" required placeholder="${escapeHtml(t('verifiedAnswerPlaceholder'))}" />
              </label>
              ${item?.review && ['pending', 'reviewed'].includes(item.review.status) ? createReviewMarkup({ review: item.review }) : ''}
            </div>`).join('')}
          <p class="verified-form-error hidden" id="verifiedFormError" role="alert"></p>
          <button type="submit" class="primary-btn" id="verifiedSubmitBtn">${escapeHtml(t('verifiedSubmit'))}</button>
        </form>
      </section>`;
    document.getElementById('verifiedCancelBtn')?.addEventListener('click', async () => {
      const button = document.getElementById('verifiedCancelBtn');
      const formError = document.getElementById('verifiedFormError');
      if (!button) return;
      button.disabled = true;
      button.textContent = t('verifiedDiscarding');
      try {
        const result = await apiFetch('/scores/server-checked/challenge', {
          method: 'DELETE',
          body: JSON.stringify({
            categoryId: challenge.categoryId,
            challengeId: challenge.challengeId,
            submissionToken: challenge.submissionToken,
          }),
        });
        if (typeof result?.discarded !== 'boolean') throw new Error('Invalid cancel response');
        verifiedChallenge = null;
        renderVerifiedStarter();
      } catch (error) {
        if (formError) {
          formError.textContent = localizedErrorMessage(error, 'verifiedCancelError');
          formError.classList.remove('hidden');
        }
        button.disabled = false;
        button.textContent = t('verifiedCancel');
      }
    });
    document.getElementById('verifiedChallengeForm')?.addEventListener('submit', submitVerifiedChallenge);
    document.getElementById('verifiedAnswer0')?.focus();
  }

  async function submitVerifiedChallenge(event) {
    event.preventDefault();
    const challenge = verifiedChallenge;
    if (!challenge) return;
    const inputs = challenge.questions.map((_, index) => document.getElementById(`verifiedAnswer${index}`));
    const formError = document.getElementById('verifiedFormError');
    if (inputs.some(input => !input?.value.trim())) {
      if (formError) {
        formError.textContent = t('verifiedAnswerAll');
        formError.classList.remove('hidden');
      }
      inputs.find(input => !input?.value.trim())?.focus();
      return;
    }
    formError?.classList.add('hidden');
    const button = document.getElementById('verifiedSubmitBtn');
    if (!button) return;
    button.disabled = true;
    button.textContent = t('verifiedSubmitting');
    try {
      const result = await apiFetch('/scores/server-checked/submit', {
        method: 'POST',
        body: JSON.stringify({
          challengeId: challenge.challengeId,
          submissionToken: challenge.submissionToken,
          answers: challenge.questions.map((question, index) => ({
            cardId: question.cardId,
            answer: inputs[index].value.trim(),
          })),
        }),
      });
      if (!hasServerCheckedContract(result)) throw new Error('Invalid server-checked result');
      verifiedChallenge = null;
      renderVerifiedResult(result);
      await refreshVerifiedLeaderboard();
    } catch (error) {
      const message = localizedErrorMessage(error, 'verifiedSubmitError');
      if (formError) {
        formError.textContent = message;
        formError.classList.remove('hidden');
      }
      button.disabled = false;
      button.textContent = t('verifiedSubmit');
    }
  }

  function renderVerifiedResult(result) {
    const mount = document.getElementById('verifiedChallengeMount');
    if (!mount) return;
    mount.innerHTML = `
      <section class="verified-result" aria-live="polite">
        <span class="verified-result-mark" aria-hidden="true">✓</span>
        <div>
          <h3>${escapeHtml(t('verifiedResultTitle'))}</h3>
          <p class="verified-result-score">${escapeHtml(fmt('verifiedResult', {
            correct: result.correctCount,
            total: result.questionCount,
            score: result.score,
          }))}</p>
          <p>${escapeHtml(t('verifiedResultNote'))}</p>
          <p class="server-check-disclosure">${escapeHtml(t('serverCheckedAutomationDisclaimer'))}</p>
        </div>
        <button type="button" class="secondary-btn" id="verifiedTryAgainBtn">${escapeHtml(t('verifiedTryAgain'))}</button>
      </section>`;
    document.getElementById('verifiedTryAgainBtn')?.addEventListener('click', renderVerifiedStarter);
  }

  async function refreshVerifiedLeaderboard() {
    const body = document.getElementById('leaderboardBody');
    if (!body) return;
    body.replaceChildren();
    body.setAttribute('aria-busy', 'true');
    try {
      const payload = await apiFetch('/leaderboard');
      const { leaderboard, status } = payload;
      if (status !== 'active' || !hasServerCheckedContract(payload)) {
        throw new Error('Server-checked leaderboard is unavailable');
      }
      const currentUser = state.dbUser?.username;
      const medals = ['🥇', '🥈', '🥉'];
      if (!leaderboard?.length) {
        body.innerHTML = `<p class="verified-empty">${escapeHtml(t('leaderboardEmpty'))}</p>`;
        return;
      }
      body.innerHTML = leaderboard.map(row => {
        const category = state.catalog?.categories.find(item => item.slug === row.categoryId);
        const categoryTitle = category?.title?.[state.lang] || category?.title?.en || row.categoryId;
        return `
          <div class="leaderboard-row">
            <span class="leaderboard-rank ${row.rank <= 3 ? 'top-3' : ''}">${medals[row.rank - 1] || escapeHtml(row.rank)}</span>
            <span class="leaderboard-username ${row.username === currentUser ? 'leaderboard-you' : ''}">
              <span class="leaderboard-name"><span aria-hidden="true">${escapeHtml(row.avatar || '👤')}</span> ${escapeHtml(row.username)}${row.username === currentUser ? ' ✦' : ''}</span>
              <small>${escapeHtml(categoryTitle)} · ${escapeHtml(`${row.correctCount}/${row.questionCount}`)}</small>
            </span>
            <span class="leaderboard-score bidi-isolate">${escapeHtml(row.score)} ${escapeHtml(t('pointsShort'))}</span>
          </div>`;
      }).join('');
    } catch (_) {
      body.innerHTML = `<p class="verified-empty is-error">${escapeHtml(t('leaderboardLoadError'))}</p>`;
    } finally {
      body.removeAttribute('aria-busy');
    }
  }

  async function openLeaderboard() {
    createLeaderboardModal();
    const modal = document.getElementById('leaderboardModal');
    if (!modal) return;
    modal.classList.remove('hidden');
    modal.setAttribute('aria-hidden', 'false');
    renderVerifiedStarter();
    trapFocus(modal, {
      key: 'leaderboard',
      initialFocus: 'button[data-close-modal="leaderboard"]',
      onEscape: () => closeModal('leaderboard'),
      returnFallback: '#leaderboardBtn',
    });
    await refreshVerifiedLeaderboard();
  }

  function resetTransientUi() {
    searchGeneration += 1;
  }

  return Object.freeze({
    openGlobalSearch,
    openLeaderboard,
    resetTransientUi,
    runGlobalSearch,
  });
}
