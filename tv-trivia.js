import { SHOWS, eligibleCards, createRound, answerRound, nextQuestion, restoreRound, remainingSeconds, roundScore, bestKey, shuffle } from './tv-trivia-engine.js';
import { makeScoreCard } from './tv-trivia-share.js';
import { COPY } from './tv-trivia-copy.js';
import { landingMarkup, escape as e } from './tv-trivia-markup.js';

const KEYS = { round: 'jakh-tv-round-v1', seen: 'jakh-tv-seen-v1', bests: 'jakh-tv-bests-v1' };

export function createTvTrivia(api) {
  const root = document.getElementById('tvTrivia');
  if (!root) return null;
  let lang = api.state.lang;
  let t = COPY[lang];
  const cards = () => api.state.categoryData?.cards || [];
  const params = new URLSearchParams(location.search);
  const selectedShow = SHOWS.find(s => s.key === params.get('sub') || s.id === params.get('sub'));
  let settings = { show: selectedShow?.id || 'all', season: Math.max(0, Math.min(Number(params.get('season')) || 0, selectedShow?.seasons || 0)), timed: false };
  const stored = api.loadJson(KEYS.round, null);
  let round = restoreRound(stored, cards());
  let view = location.hash === '#round' && round ? 'round' : location.hash === '#practice' ? 'practice' : 'home';
  let reviewOpen = false;
  let timer = null;
  let search = '', difficulty = 'all', progress = 'all', sort = 'featured', limit = 12;
  let revealed = new Set();
  let practiceOrder = [];
  let pendingStart = null;
  let optionDraft = null;
  let scoreCardUrl = null;
  let suspendedRender = false;
  const dialog = document.createElement('dialog');
  dialog.className = 'tv-dialog';
  dialog.id = 'tvOptions';
  dialog.setAttribute('aria-labelledby', 'tvOptionsTitle');
  document.body.append(dialog);
  root.setAttribute('aria-busy', 'false');
  const readArray = key => { const value = api.loadJson(key, []); return Array.isArray(value) ? value.filter(v => typeof v === 'string') : []; };
  const readBests = () => { const value = api.loadJson(KEYS.bests, {}); return value && typeof value === 'object' && !Array.isArray(value) ? value : {}; };
  const showName = id => SHOWS.find(s => s.id === id)?.[lang] || t.all;
  const localMode = r => `${r.timed ? t.timed : t.untimed} · ${r.season ? `${t.through} ${r.season}` : t.safeMode}`;
  function track(name, extra = {}) { api.trackEvent(`tv_quiz_${name}`, { category: 'tv-shows-trivia', variant: 'tv-redesign-v1', language: lang, device: matchMedia('(max-width: 700px)').matches ? 'phone' : 'wide', ...extra }); }
  function persist() { api.saveJson(KEYS.round, round); }
  function message(text) { const el = root.querySelector('#tvMessage'); if (el) el.textContent = text; else api.showToast(text); }
  function updateUrl(nextView = view) {
    const url = new URL(location.href);
    const s = SHOWS.find(s => s.id === settings.show);
    if (s) url.searchParams.set('sub', s.key); else url.searchParams.delete('sub');
    if (settings.season && s) url.searchParams.set('season', settings.season); else url.searchParams.delete('season');
    url.searchParams.delete('mode');
    url.hash = nextView === 'round' ? 'round' : nextView === 'practice' ? 'practice' : '';
    history.replaceState({}, '', url);
    updateLanguageLink();
  }
  function updateLanguageLink() {
    const link = document.querySelector('.language-route-link');
    if (!link) return;
    const url = new URL(lang === 'ar' ? '/tv-shows-trivia' : '/ar/topics/tv-shows-trivia/', location.origin);
    url.search = location.search;
    url.hash = location.hash;
    link.href = url.href;
  }
  function focusHeading() {
    const heading = root.querySelector('[data-tv-heading], h1');
    if (heading) { heading.tabIndex = -1; heading.focus({ preventScroll: true }); }
    root.scrollIntoView({ block: 'start', behavior: 'instant' });
  }
  function storageNote() { return api.state.storageDurable === false ? `<p class="tv-storage-warning" role="status">${t.storage}</p>` : ''; }
  function setView(next, focus = true) {
    view = next; clearInterval(timer); timer = null;
    if (view === 'round' && round) settings = { show: round.show, season: round.season, timed: round.timed };
    updateUrl(); render(); if (focus) focusHeading();
  }
  function home() {
    const counts = Object.fromEntries(SHOWS.map(s => [s.key, eligibleCards(cards(), s.id, s.seasons).length]));
    root.innerHTML = landingMarkup(lang, true, counts).replace(/^<div[^>]*>|<\/div>$/g, '');
    if (round && !round.finished) {
      const mount = root.querySelector('#tvResume'); mount.hidden = false;
      mount.innerHTML = `<div><strong>${t.resume}: ${e(showName(round.show))}</strong><p>${t.question} ${round.index + 1} ${t.of} 10 · ${t.resumeHint}</p></div><button class="tv-button tv-primary" data-tv="resume">${t.resume}</button>`;
    }
    if (api.state.storageDurable === false) root.insertAdjacentHTML('afterbegin', storageNote());
    if (stored && !round) message(t.changed);
  }
  function showOptions(show = settings.show, timed = settings.timed, isPractice = false) {
    const s = SHOWS.find(s => s.id === show);
    const previous = optionDraft || settings;
    optionDraft = { show: s?.id || 'all', season: s && previous.show === s.id ? previous.season : 0, timed };
    const draft = optionDraft;
    const storySeasons = [...new Set(cards().filter(c => c.subcategory?.en === s?.key && c.tvQuiz?.spoilerSeason > 0).map(c => c.tvQuiz.spoilerSeason))].sort((a, b) => a - b);
    const hasStory = storySeasons.length > 0;
    dialog.innerHTML = `<div class="tv-dialog-head"><h2 id="tvOptionsTitle">${e(showName(draft.show))}</h2><button class="tv-text-button" data-tv="close-options" aria-label="${t.close}">×</button></div>
      <p>${t.safeDetail}</p>
      <label class="tv-field">${t.show}<select id="tvShowSelect">${showOptionsMarkup(draft.show)}</select></label>
      ${hasStory ? `<label class="tv-check"><input id="tvStory" type="checkbox" ${draft.season ? 'checked' : ''}>${t.story}</label><label class="tv-field" id="tvSeasonField" ${draft.season ? '' : 'hidden'}>${t.season}<select id="tvSeasonSelect">${Array.from({ length: s.seasons }, (_, i) => `<option value="${i + 1}" ${draft.season === i + 1 ? 'selected' : ''}>${i + 1}</option>`).join('')}</select><small>${t.storyHint}</small></label>` : `<p class="tv-small">${s ? t.noStory : t.safeDetail}</p>`}
      ${isPractice ? '' : `<label class="tv-check"><input id="tvTimed" type="checkbox" ${timed ? 'checked' : ''}>${t.timed}</label><p class="tv-small">${t.timedHint}</p>`}
      <p id="tvEligibleCount" class="tv-small" role="status">${eligibleCards(cards(), draft.show, draft.season).length} ${t.availableCount}</p>
      <button class="tv-button tv-primary tv-full" data-tv="${isPractice ? 'apply-practice' : 'start-options'}">${isPractice ? t.practice : t.start}</button>`;
    dialog.dataset.practice = String(isPractice);
    if (!dialog.open) dialog.showModal();
    dialog.querySelector('#tvShowSelect').focus();
  }
  function showOptionsMarkup(selected = 'all') {
    return `<option value="all" ${selected === 'all' ? 'selected' : ''}>${t.all}</option>` + SHOWS.map(s => `<option value="${s.id}" ${selected === s.id ? 'selected' : ''}>${e(s[lang])}</option>`).join('');
  }
  function readOptions() {
    const show = dialog.querySelector('#tvShowSelect')?.value || 'all';
    const story = dialog.querySelector('#tvStory')?.checked;
    return { show, season: story ? Number(dialog.querySelector('#tvSeasonSelect').value) : 0, timed: dialog.querySelector('#tvTimed')?.checked === true };
  }
  function start(next, replace = false) {
    if (round && !round.finished && !replace) {
      pendingStart = next;
      dialog.innerHTML = `<div class="tv-dialog-head"><h2 id="tvOptionsTitle">${t.resume}</h2><button class="tv-text-button" data-tv="close-options" aria-label="${t.close}">×</button></div><p>${t.replaced}</p><div class="tv-actions"><button class="tv-button tv-primary" data-tv="resume-confirm">${t.resumeInstead}</button><button class="tv-button" data-tv="replace-round">${t.newRound}</button></div>`;
      if (!dialog.open) dialog.showModal();
      return;
    }
    try { round = createRound(cards(), next, readArray(KEYS.seen)); }
    catch { message(t.notReady); return; }
    reviewOpen = false; dialog.close(); settings = { ...next }; persist();
    track('start', { show: round.show, timed: round.timed, season: round.season });
    setView('round');
  }
  function optionsFor(card) { return [card.answer[lang], ...card.tvQuiz.distractors[lang]]; }
  function renderRound() {
    if (!round) { view = 'home'; home(); return; }
    if (round.finished) { renderResults(); return; }
    const q = round.questions[round.index];
    const card = cards().find(c => c.id === q.id);
    const a = round.answers[round.index];
    const s = SHOWS.find(s => s.key === card.subcategory.en);
    const label = a?.correct ? t.correct : a?.timedOut ? t.expired : a?.choice === null ? t.skipped : t.wrong;
    root.innerHTML = `<div class="tv-player"><div class="tv-player-top"><button class="tv-text-button" data-tv="exit">${t.exit}</button><span>${round.timed ? `<span id="tvTimer" role="timer" aria-label="${t.seconds}">${remainingSeconds(round) ?? 0}</span> ${t.seconds}` : t.untimed}</span></div>
      <div class="tv-progress-label"><span>${t.question} ${round.index + 1} ${t.of} 10</span><span>${t.score}: ${roundScore(round)}</span></div><progress max="10" value="${round.answers.length}" aria-label="${t.question} ${round.index + 1} ${t.of} 10"></progress>
      <section class="tv-question-card" aria-labelledby="tvQuestion"><div class="tv-question-topic"><img src="/assets/tv/${s.id}-360.webp" alt="" width="60" height="40"><span>${e(s[lang])}</span><span class="tv-safe-label">${round.season ? `${t.through} ${round.season}` : t.safeMode}</span></div>
        <h1 id="tvQuestion" data-tv-heading>${e(card.question[lang])}</h1><div class="tv-answers">${q.order.map((value, index) => `<button class="tv-answer ${a && value === 0 ? 'is-correct' : a?.choice === value ? 'is-wrong' : ''}" data-tv="answer" data-choice="${value}" ${a ? 'disabled' : ''}><span class="tv-answer-letter" aria-hidden="true">${(lang === 'ar' ? ['أ', 'ب', 'ج', 'د'] : ['A', 'B', 'C', 'D'])[index]}</span><span>${e(optionsFor(card)[value])}</span>${a && value === 0 ? `<strong class="tv-answer-state">✓ ${t.answer}</strong>` : a?.choice === value ? `<strong class="tv-answer-state">× ${t.selected}</strong>` : ''}</button>`).join('')}</div>
        ${a ? `<div id="tvFeedback" class="tv-feedback ${a.correct ? 'is-correct' : ''}" role="status" tabindex="-1"><strong>${a.correct ? '✓ ' : ''}${label}</strong><p>${e(card.tvQuiz.explanation[lang])}</p></div><button class="tv-button tv-primary tv-full" data-tv="next">${round.index === 9 ? t.results : t.next}</button>` : `<button class="tv-text-button tv-skip" data-tv="skip">${t.skip}</button>`}
      </section><p class="tv-save-note">${t.save}</p>${storageNote()}</div>`;
    if (round.timed && !a && !timer) timer = setInterval(tick, 250);
  }
  function tick() {
    if (view !== 'round' || !round || round.finished || round.answers[round.index]) { clearInterval(timer); timer = null; return; }
    const seconds = remainingSeconds(round);
    const el = root.querySelector('#tvTimer');
    if (el) { el.textContent = seconds; el.classList.toggle('tv-time-low', seconds <= 5); }
    if (seconds === 0) answer(null);
  }
  function answer(choice) {
    const changed = answerRound(round, choice);
    if (changed === round) return;
    round = changed; clearInterval(timer); timer = null; persist();
    const id = round.questions[round.index].id;
    api.saveJson(KEYS.seen, [...new Set([...readArray(KEYS.seen), id])].slice(-1000));
    const a = round.answers[round.index];
    track('answer', { show: round.show, timed: round.timed, correct: a.correct, question_number: round.index + 1 });
    // Reuse existing guest/account progress without introducing a second sync API.
    suspendedRender = true;
    Promise.resolve(api.markCard(id, a.correct ? 'correct' : 'wrong', { quiet: true })).catch(() => {}).finally(() => { suspendedRender = false; });
    renderRound(); root.querySelector('#tvFeedback')?.focus({ preventScroll: true });
  }
  function advance() {
    const next = nextQuestion(round);
    if (next === round) return;
    round = next; persist();
    if (round.finished) {
      const bests = readBests();
      bests[bestKey(round)] = Math.max(Number(bests[bestKey(round)]) || 0, roundScore(round));
      api.saveJson(KEYS.bests, bests);
      track('complete', { show: round.show, timed: round.timed, score: roundScore(round) });
    }
    renderRound(); focusHeading();
  }
  function renderResults() {
    const score = roundScore(round);
    const missed = round.questions.map((q, i) => ({ card: cards().find(c => c.id === q.id), answer: round.answers[i] })).filter(q => !q.answer.correct);
    root.innerHTML = `<section class="tv-results"><p class="tv-eyebrow">${e(showName(round.show))}</p><h1 data-tv-heading>${t.resultTitle}</h1><div class="tv-score-display" dir="ltr"><strong>${score}</strong><span>/ 10</span></div><p class="tv-result-message">${score >= 8 ? t.resultHigh : score >= 5 ? t.resultMid : t.resultLow}</p><p>${e(localMode(round))}</p><p class="tv-small">${t.best}: <bdi>${Number(readBests()[bestKey(round)]) || score}/10</bdi></p>
      <div class="tv-actions tv-center"><button class="tv-button tv-primary" data-tv="replay">${t.replay}</button><button class="tv-button" data-tv="home">${t.another}</button></div>
      <div class="tv-actions tv-center"><button class="tv-text-button" data-tv="review" aria-expanded="${reviewOpen}">${t.review} (${missed.length})</button><button class="tv-text-button" data-tv="share">${t.share}</button><button class="tv-text-button" data-tv="download-score">${t.download}</button></div><div id="tvShareStatus" role="status"></div>
      ${reviewOpen ? `<div class="tv-review-list">${missed.length ? missed.map(({ card, answer: a }) => `<article><h2>${e(card.question[lang])}</h2>${a.choice !== null ? `<p>${t.selected}: ${e(optionsFor(card)[a.choice])}</p>` : ''}<p><strong>${t.answer}: ${e(card.answer[lang])}</strong></p><p>${e(card.tvQuiz.explanation[lang])}</p></article>`).join('') : `<p>${t.perfect}</p>`}</div>` : ''}<p class="tv-save-note">${t.save}</p>${storageNote()}</section>`;
  }
  async function downloadScore() {
    try {
      const blob = await makeScoreCard({ score: roundScore(round), show: showName(round.show), mode: localMode(round), lang });
      if (scoreCardUrl) URL.revokeObjectURL(scoreCardUrl);
      scoreCardUrl = URL.createObjectURL(blob);
      root.querySelector('#tvShareStatus').innerHTML = `<p>${t.downloaded}</p><img class="tv-score-preview" src="${scoreCardUrl}" alt="${t.cardAlt}" width="1080" height="1080"><a class="tv-button" href="${scoreCardUrl}" download="riddle-arabia-${round.show}-${lang}.png">${t.downloadImage}</a>`;
      root.querySelector('#tvShareStatus a').focus({ preventScroll: true });
      track('score_card', { show: round.show });
    } catch { root.querySelector('#tvShareStatus').textContent = t.downloadError; }
  }
  async function share() {
    const url = new URL(lang === 'ar' ? '/ar/topics/tv-shows-trivia/' : '/tv-shows-trivia', location.origin);
    const s = SHOWS.find(s => s.id === round.show); if (s) url.searchParams.set('sub', s.key);
    const text = lang === 'ar' ? `حققت ${roundScore(round)}/10 في تحدّي ${showName(round.show)} على ريدل أرابيا! ${localMode(round)}. هل تتفوق عليّ؟` : `I scored ${roundScore(round)}/10 on ${showName(round.show)} at Riddle Arabia! ${localMode(round)}. Can you beat me?`;
    try {
      if (navigator.share) await navigator.share({ title: 'Riddle Arabia', text, url: url.href });
      else { await navigator.clipboard.writeText(`${text}\n${url.href}`); root.querySelector('#tvShareStatus').textContent = t.copied; }
      track('share', { show: round.show });
    } catch (error) {
      if (error.name === 'AbortError') return;
      root.querySelector('#tvShareStatus').innerHTML = `<label>${t.shareError}<textarea readonly rows="4">${e(`${text}\n${url.href}`)}</textarea></label>`;
    }
  }
  function practiceCards() {
    let pool = eligibleCards(cards(), settings.show, settings.season);
    if (search.trim()) {
      const term = search.normalize('NFKC').toLocaleLowerCase();
      pool = pool.filter(c => [c.question.en, c.question.ar, c.answer.en, c.answer.ar].join(' ').normalize('NFKC').toLocaleLowerCase().includes(term));
    }
    if (difficulty !== 'all') pool = pool.filter(c => c.difficulty === difficulty);
    if (progress === 'favourites') pool = pool.filter(c => api.isFavorite(c.id));
    if (progress === 'solved') pool = pool.filter(c => api.getProgressResult(c.id) === 'correct');
    if (progress === 'unsolved') pool = pool.filter(c => api.getProgressResult(c.id) !== 'correct');
    if (sort === 'az') pool.sort((a, b) => a.question[lang].localeCompare(b.question[lang], lang));
    if (sort === 'difficulty') { const order = ['easy', 'medium', 'hard', 'very-advanced']; pool.sort((a, b) => order.indexOf(a.difficulty) - order.indexOf(b.difficulty)); }
    if (sort === 'random') pool.sort((a, b) => practiceOrder.indexOf(a.id) - practiceOrder.indexOf(b.id));
    return pool;
  }
  function questionCount(count) {
    if (lang !== 'ar') return `${count} ${count === 1 ? 'question' : 'questions'}`;
    if (count === 1) return 'سؤال واحد';
    if (count === 2) return 'سؤالان';
    return `${count} ${count % 100 >= 3 && count % 100 <= 10 ? 'أسئلة' : count % 100 >= 11 ? 'سؤالًا' : 'سؤال'}`;
  }
  function renderPractice() {
    const pool = practiceCards();
    root.innerHTML = `<section class="tv-practice"><button class="tv-text-button" data-tv="home">${t.back}</button><h1 data-tv-heading>${t.practiceTitle}</h1><p>${e(showName(settings.show))} · ${settings.season ? `${t.through} ${settings.season}` : t.safeDetail}</p><button class="tv-text-button" data-tv="practice-options">${t.safety}</button>
      <div class="tv-practice-filters"><label class="tv-field tv-search">${t.search}<input id="tvSearch" type="search" placeholder="${t.searchHint}" value="${e(search)}"></label>
      <label class="tv-field">${t.show}<select id="tvPracticeShow">${showOptionsMarkup(settings.show)}</select></label>
      <label class="tv-field">${t.difficulty}<select id="tvDifficulty">${[['all', t.any], ['easy', t.easy], ['medium', t.medium], ['hard', t.hard], ['very-advanced', t.expert]].map(([v, n]) => `<option value="${v}" ${difficulty === v ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
      <label class="tv-field">${t.status}<select id="tvProgress">${[['all', t.everything], ['unsolved', t.unsolved], ['solved', t.solved], ['favourites', t.favourites]].map(([v, n]) => `<option value="${v}" ${progress === v ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
      <label class="tv-field">${t.sort}<select id="tvSort">${[['featured', t.featured], ['az', t.az], ['difficulty', t.difficulty], ['random', t.shuffle]].map(([v, n]) => `<option value="${v}" ${sort === v ? 'selected' : ''}>${n}</option>`).join('')}</select></label></div>
      <div class="tv-practice-toolbar"><p id="tvPracticeCount" role="status" tabindex="-1">${questionCount(pool.length)} · ${lang === 'ar' ? `المعروض: ${Math.min(limit, pool.length)}` : `${Math.min(limit, pool.length)} shown`}</p><button class="tv-text-button" data-tv="reset-practice">${t.reset}</button></div>
      <div id="tvPracticeCards">${pool.length ? pool.slice(0, limit).map(c => `<article class="tv-practice-card" id="practice-${c.id}"><p class="tv-small">${e(SHOWS.find(s => s.key === c.subcategory.en)?.[lang] || c.subcategory[lang])} · ${t[c.difficulty === 'very-advanced' ? 'expert' : c.difficulty]}</p><h2 tabindex="-1">${e(c.question[lang])}</h2>${revealed.has(c.id) ? `<div class="tv-practice-answer"><strong>${e(c.answer[lang])}</strong><p>${e(c.tvQuiz.explanation[lang])}</p></div><div class="tv-actions"><button class="tv-button" data-tv="knew" data-id="${c.id}">✓ ${t.knew}</button><button class="tv-button" data-tv="learning" data-id="${c.id}">${t.learning}</button></div>` : `<button class="tv-button" data-tv="reveal" data-id="${c.id}">${t.reveal}</button>`}<button class="tv-text-button" data-tv="favourite" data-id="${c.id}" aria-pressed="${api.isFavorite(c.id)}">${api.isFavorite(c.id) ? t.unfavourite : t.favourite}</button></article>`).join('') : `<p>${t.noMatches}</p>`}</div>
      ${pool.length > limit ? `<button class="tv-button tv-full" data-tv="more-practice">${t.loadMore}</button>` : ''}</section>`;
  }
  function focusPracticeCard({ id, action, index = 0, preventScroll = false } = {}) {
    const visible = practiceCards().slice(0, limit);
    const card = visible.find(c => c.id === id) || visible[Math.max(0, Math.min(index, visible.length - 1))];
    const article = card && root.querySelector(`#practice-${CSS.escape(card.id)}`);
    const target = (card?.id === id && action && article?.querySelector(`[data-tv="${action}"]`)) || article?.querySelector('h2') || root.querySelector('#tvPracticeCount');
    target?.focus({ preventScroll });
  }
  function render() {
    if (suspendedRender) return;
    // Account/progress refreshes can arrive after an interaction. Keep the
    // keyboard position when they replace the practice tree in the background.
    const active = view === 'practice' && root.contains(document.activeElement) ? document.activeElement : null;
    const cardId = active?.closest('.tv-practice-card')?.id.replace(/^practice-/, '');
    const focus = active && { elementId: active.id, id: cardId, action: active.dataset.tv, index: practiceCards().findIndex(c => c.id === cardId), caret: active.selectionStart };
    lang = api.state.lang; t = COPY[lang] || COPY.en;
    root.classList.toggle('tv-is-playing', view === 'round');
    document.body.dataset.tvPlaying = String(view === 'round');
    const related = document.getElementById('relatedCategories')?.closest('section'); if (related) related.hidden = view !== 'home';
    if (view === 'home') home(); else if (view === 'practice') renderPractice(); else renderRound();
    if (focus) {
      if (focus.id) focusPracticeCard({ ...focus, preventScroll: true });
      else {
        const target = focus.elementId ? root.querySelector(`#${CSS.escape(focus.elementId)}`) : focus.action ? root.querySelector(`[data-tv="${focus.action}"]`) : null;
        target?.focus({ preventScroll: true });
        if (typeof focus.caret === 'number') target?.setSelectionRange(focus.caret, focus.caret);
      }
    }
    updateLanguageLink();
  }
  root.addEventListener('click', async event => {
    const b = event.target.closest('[data-tv]'); if (!b) return;
    const action = b.dataset.tv;
    if (action === 'mixed') start({ show: 'all', season: 0, timed: false });
    if (action === 'play-show') start({ show: b.dataset.show, season: 0, timed: false });
    if (action === 'options') showOptions(b.dataset.show, false);
    if (action === 'timed') showOptions(settings.show, true);
    if (action === 'practice') setView('practice');
    if (action === 'practice-options') showOptions(settings.show, false, true);
    if (action === 'resume') setView('round');
    if (action === 'exit') { persist(); track('exit', { show: round.show, question_number: round.index + 1 }); setView('home'); }
    if (action === 'home') { setView('home'); }
    if (action === 'answer') answer(Number(b.dataset.choice));
    if (action === 'skip') answer(null);
    if (action === 'next') advance();
    if (action === 'replay') { track('replay', { show: round.show }); start({ show: round.show, season: round.season, timed: round.timed }); }
    if (action === 'review') { reviewOpen = !reviewOpen; renderResults(); root.querySelector('[data-tv="review"]')?.focus(); }
    if (action === 'share') await share();
    if (action === 'download-score') await downloadScore();
    if (action === 'sync') void api.openAuthModal();
    if (action === 'create' || action === 'join') void api.openBattleModal('tv-shows-trivia', action);
    if (action === 'reveal') { revealed.add(b.dataset.id); renderPractice(); root.querySelector(`#practice-${b.dataset.id} .tv-practice-answer`)?.setAttribute('tabindex', '-1'); root.querySelector(`#practice-${b.dataset.id} .tv-practice-answer`)?.focus({ preventScroll: true }); }
    if (['knew', 'learning', 'favourite'].includes(action)) {
      const id = b.dataset.id, index = practiceCards().findIndex(c => c.id === id);
      if (action === 'favourite') await api.toggleFavorite(id);
      else await api.markCard(id, action === 'knew' ? 'correct' : 'wrong');
      if (view !== 'practice') return;
      renderPractice(); focusPracticeCard({ id, action, index });
    }
    if (action === 'more-practice') {
      const index = Math.min(limit, practiceCards().length);
      limit += 12; renderPractice(); focusPracticeCard({ index });
    }
    if (action === 'reset-practice') { search = ''; difficulty = 'all'; progress = 'all'; sort = 'featured'; settings = { show: 'all', season: 0, timed: false }; limit = 12; updateUrl(); renderPractice(); root.querySelector('#tvSearch')?.focus(); }
  });
  root.addEventListener('input', event => {
    if (event.target.id !== 'tvSearch') return;
    if (event.isComposing) return;
    const value = event.target.value; const caret = event.target.selectionStart; search = value; limit = 12;
    renderPractice(); const input = root.querySelector('#tvSearch'); input.focus({ preventScroll: true }); input.setSelectionRange(caret, caret);
  });
  root.addEventListener('compositionend', event => { if (event.target.id === 'tvSearch') event.target.dispatchEvent(new Event('input', { bubbles: true })); });
  root.addEventListener('change', event => {
    const { id, value } = event.target;
    if (id === 'tvPracticeShow') { settings.show = value; settings.season = 0; revealed.clear(); updateUrl(); }
    if (id === 'tvDifficulty') difficulty = value;
    if (id === 'tvProgress') progress = value;
    if (id === 'tvSort') { sort = value; if (value === 'random') practiceOrder = shuffle(cards().map(c => c.id)); }
    if (['tvPracticeShow', 'tvDifficulty', 'tvProgress', 'tvSort'].includes(id)) { limit = 12; renderPractice(); root.querySelector(`#${id}`)?.focus({ preventScroll: true }); }
  });
  dialog.addEventListener('change', event => {
    if (event.target.id === 'tvShowSelect') { const next = readOptions(); optionDraft = { ...next, season: 0 }; showOptions(next.show, next.timed, dialog.dataset.practice === 'true'); }
    if (event.target.id === 'tvStory') dialog.querySelector('#tvSeasonField').hidden = !event.target.checked;
    const count = dialog.querySelector('#tvEligibleCount');
    if (count) { const next = readOptions(); count.textContent = `${eligibleCards(cards(), next.show, next.season).length} ${t.availableCount}`; }
  });
  dialog.addEventListener('click', event => {
    const action = event.target.closest('[data-tv]')?.dataset.tv;
    if (action === 'close-options') dialog.close();
    if (action === 'start-options') { const next = readOptions(); dialog.close(); start(next); }
    if (action === 'apply-practice') { settings = readOptions(); revealed.clear(); dialog.close(); setView('practice'); }
    if (action === 'resume-confirm') { dialog.close(); setView('round'); }
    if (action === 'replace-round') { dialog.close(); start(pendingStart, true); pendingStart = null; }
  });
  dialog.addEventListener('close', () => { optionDraft = null; });
  document.querySelector('.language-route-link')?.addEventListener('click', () => { persist(); updateLanguageLink(); });
  document.addEventListener('visibilitychange', () => { if (!document.hidden) tick(); });
  window.addEventListener('pagehide', persist);
  track('view');
  // Existing direct card links become spoiler-filtered practice links, never a bypass.
  if (params.has('card')) { view = 'practice'; updateUrl(); }
  render();
  if (selectedShow && view === 'home') showOptions(selectedShow.id, params.get('mode') === 'quick-fire');
  return { render, startTimed: () => showOptions(settings.show, true) };
}
