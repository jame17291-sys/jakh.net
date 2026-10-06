import { PARTY_COPY } from './party-games-copy.js';
import { escapeParty as e, cleanPartyName, createMostLikely, startPartyVoting, readyPartyVoter, castPartyVote, finishPartyQuestion, nextPartyQuestion, createKnowMeDraft, replaceKnowMeQuestion, quizCreationPayload, validatePartyData, validQuizCode, validQuizToken, newQuizToken, partyPath } from './party-games-engine.js';

const PARTY_DATA_URL = '/data/party-games.json';
const root = document.getElementById('party-app');
const game = document.body.dataset.partyGame;
const lang = document.documentElement.lang === 'ar' ? 'ar' : 'en';
const t = PARTY_COPY[lang], most = game === 'mostLikely';
const ACCESS_KEY = 'jakh-party-quiz-access-v1';
const local = ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname);
const API = local ? `${location.protocol}//${location.hostname}:8787` : 'https://api.riddlearabia.com';
let data, view = 'home', round, draft, quiz, createToken, createSignature, accessToken, ownerName = '', playerName = '', answerIndex = 0, guesses = [], busy = false, confirm = '', requestController, pendingDataView = 'home';
let durable = true, records = {};
try {
  const probe = `${ACCESS_KEY}-probe`; localStorage.setItem(probe, '1'); localStorage.removeItem(probe);
  const value = JSON.parse(localStorage.getItem(ACCESS_KEY) || '{}');
  if (value && typeof value === 'object' && !Array.isArray(value)) records = Object.fromEntries(Object.entries(value).filter(([code, item]) => validQuizCode(code) && validQuizToken(item?.token) && Number.isFinite(item.savedAt)).slice(-20));
} catch { durable = false; }

function saveAccess(code, token, owner = false, name = '') {
  records[code] = { token, owner, name: cleanPartyName(name) || '', savedAt: Date.now() };
  records = Object.fromEntries(Object.entries(records).sort((a, b) => a[1].savedAt - b[1].savedAt).slice(-20));
  try { localStorage.setItem(ACCESS_KEY, JSON.stringify(records)); } catch { durable = false; }
}
function accessFor(code) {
  if (records[code]) return records[code].token;
  const token = newQuizToken(); saveAccess(code, token); return token;
}
function message(text = '') { document.getElementById('party-feedback').textContent = text; }
function button(label, action, { primary = false, disabled = false, extra = '' } = {}) { return `<button type="button" class="party-button${primary ? ' primary' : ''}" data-party-action="${action}" ${extra}${disabled ? ' disabled' : ''}>${e(label)}</button>`; }
function packSelect(group) { return `<label class="party-field">${t.pack}<select name="pack"><option value="all">${t.mixed}</option>${group.packs.map(p => `<option value="${e(p.id)}">${e(p.title[lang])}</option>`).join('')}</select></label>`; }
function avatar(name) { return `<span class="party-avatar" aria-hidden="true">${e([...name][0])}</span>`; }
function heading(title, detail = '') { return `<h2 tabindex="-1">${e(title)}</h2>${detail ? `<p class="party-small">${e(detail)}</p>` : ''}`; }
function storageNote() { return durable ? '' : `<p class="party-warning">${t.storage}</p>`; }
function progress(index, total = 10) { return `<p class="party-small">${t.question} ${index + 1} ${t.of} ${total}</p><progress class="party-progress" max="${total}" value="${index}" aria-label="${t.question} ${index + 1} ${t.of} ${total}"></progress>`; }
function updateLanguageLink() {
  const link = document.querySelector('.language-route-link');
  if (link) link.href = `${partyPath(game, lang === 'ar' ? 'en' : 'ar')}${!most && validQuizCode(quiz?.code || currentCode()) ? `?quiz=${quiz?.code || currentCode()}` : ''}`;
}
function currentCode() { return new URL(location.href).searchParams.get('quiz'); }
function updateQuizUrl(code = null) {
  const url = new URL(partyPath(game, lang), location.origin); if (code) url.searchParams.set('quiz', code);
  history.replaceState({}, '', url); updateLanguageLink();
}
function setView(next, focus = true) {
  view = next; confirm = ''; document.body.classList.toggle('party-playing', next !== 'home');
  message(); render();
  if (focus) { root.querySelector('h2')?.focus({ preventScroll: true }); root.scrollIntoView({ block: 'start', behavior: 'auto' }); }
}
function setBusy(value) {
  busy = value; root.setAttribute('aria-busy', String(value));
  root.querySelectorAll('button').forEach(b => { if (value) { b.dataset.wasDisabled = String(b.disabled); b.disabled = true; } else { b.disabled = b.dataset.wasDisabled === 'true'; delete b.dataset.wasDisabled; } });
}
async function apiRequest(path, body) {
  const controller = new AbortController(); requestController = controller;
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(`${API}/api/know-me/${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify(body), credentials: 'omit', cache: 'no-store', referrerPolicy: 'no-referrer', signal: controller.signal });
    const result = await response.json();
    if (!response.ok) throw Object.assign(Error('api'), { code: result.code || 'NETWORK' });
    return result;
  } finally { clearTimeout(timer); if (requestController === controller) requestController = null; }
}
function errorMessage(error) {
  if (['QUIZ_NOT_FOUND', 'QUIZ_EXPIRED', 'INVALID_QUIZ_CODE'].includes(error.code)) return t.unavailable;
  if (error.code === 'QUIZ_FULL') return t.full;
  if (error.code === 'RATE_LIMITED') return t.rate;
  if (['INVALID_PLAYER_NAME', 'INVALID_QUIZ'].includes(error.code)) return t.nameError;
  if (error.code === 'QUIZ_OWNER_CANNOT_SUBMIT') return t.ownerOnly;
  return t.network;
}
function assertPublicQuiz(value) {
  if (!validQuizCode(value?.code) || !cleanPartyName(value.ownerName) || !Number.isFinite(value.expiresAt) || !['owner', 'player', 'guest'].includes(value.role) || value.questions?.length !== 10 || !Array.isArray(value.leaderboard)) throw Error('quiz');
  const ids = new Set();
  for (const q of value.questions) {
    if (typeof q.id !== 'string' || ids.has(q.id) || !q.question?.[lang] || q.options?.[lang]?.length !== 4 || q.options[lang].some(o => typeof o !== 'string' || !o) || 'answerIndex' in q) throw Error('quiz');
    ids.add(q.id);
  }
  if (value.result && (!Number.isInteger(value.result.score) || value.result.score < 0 || value.result.score > 10 || value.result.total !== 10)) throw Error('quiz');
  if (value.leaderboard.length > 50 || value.leaderboard.some(p => !cleanPartyName(p.name) || !Number.isInteger(p.score) || p.score < 0 || p.score > 10 || !Number.isInteger(p.rank))) throw Error('quiz');
  return value;
}
async function openQuiz(code) {
  if (!validQuizCode(code)) { setView('unavailable'); message(t.invalidLink); return; }
  setBusy(true); message(t.loading);
  try {
    accessToken = accessFor(code); quiz = assertPublicQuiz(await apiRequest(`${code}/state`, { token: accessToken }));
    playerName = records[code]?.name || ''; updateQuizUrl(code);
    setView(quiz.role === 'owner' ? 'dashboard' : quiz.result ? 'results' : 'challenge');
  } catch (error) { setView('unavailable'); message(errorMessage(error)); }
  finally { setBusy(false); }
}
function leaderboard() {
  return `<section aria-labelledby="partyBoard"><h2 id="partyBoard" class="party-scoreboard-title">${t.leaderboard}</h2>${quiz.leaderboard.length ? `<ol class="party-leaderboard">${quiz.leaderboard.map(p => `<li><span aria-label="${t.rank}">${p.rank}</span>${avatar(p.name)}<bdi>${e(p.name)}</bdi><strong>${p.score} / 10</strong></li>`).join('')}</ol>` : `<p class="party-small">${t.noScores}</p>`}</section>`;
}
function shareUrl() { return new URL(`${partyPath('knowMe', lang)}?quiz=${quiz.code}`, location.origin).href; }
function renderHome() {
  root.innerHTML = heading(most ? t.mostStart : t.knowStart, most ? t.mostHow : t.knowHow) + button(most ? t.mostStart : t.knowStart, 'start', { primary: true }) + (!most ? storageNote() + Object.entries(records).filter(([, r]) => r.owner && r.savedAt > Date.now() - 7 * 86400000).slice(-3).reverse().map(([code, r]) => `<p>${button(`${t.shareTitle}: ${r.name}`, 'open-quiz', { extra: `data-code="${code}"` })}</p>`).join('') : '');
}
function renderSetup() {
  root.innerHTML = heading(most ? t.mostStart : t.knowStart) + `<form id="party-setup">${most ? `<label class="party-field">${t.names}<textarea name="names" required rows="3" placeholder="${e(t.namesPlaceholder)}" aria-describedby="partyNamesHint"></textarea><small id="partyNamesHint">${t.namesHint}</small></label>` : `<label class="party-field">${t.yourName}<input name="name" maxlength="24" required autocomplete="off" placeholder="${e(t.namePlaceholder)}" value="${e(ownerName)}"></label>`}${packSelect(most ? data.mostLikely : data.knowMe)}${most ? `<label class="party-field">${t.rounds}<select name="rounds"><option value="10">10</option><option value="15">15</option><option value="20">20</option></select></label><fieldset class="party-modes"><legend>${t.mode}</legend><label class="party-option"><input type="radio" name="mode" value="point" checked><span>${t.point}<small class="party-small" style="display:block">${t.pointHint}</small></span></label><label class="party-option"><input type="radio" name="mode" value="vote"><span>${t.private}<small class="party-small" style="display:block">${t.privateHint}</small></span></label></fieldset><p class="party-small">${t.skipHint}</p>` : storageNote() + `<p class="party-consent">${t.consent}</p>`}<div class="party-actions"><button type="submit" class="party-button primary">${most ? t.start : t.knowStart}</button>${button(t.back, 'home')}</div></form>`;
}
function renderMost() {
  const q = round.questions[round.index];
  if (round.phase === 'finished') {
    const scores = round.players.map((name, i) => ({ name, score: round.scores[i] })).sort((a, b) => b.score - a.score);
    root.innerHTML = heading(t.highlights, t.scoreHint) + `<ol class="party-leaderboard">${scores.map(p => `<li>${avatar(p.name)}<bdi>${e(p.name)}</bdi><strong>${p.score} ${t.picks}</strong></li>`).join('')}</ol><div class="party-actions">${button(t.again, 'setup', { primary: true })}${button(t.games, 'games')}</div>`; return;
  }
  const top = `<div class="party-round-top"><span>${t.question} ${round.index + 1} ${t.of} ${round.questions.length}</span>${button(t.exit, 'ask-exit')}</div>`;
  if (round.phase === 'handoff') {
    root.innerHTML = top + heading(`${t.pass} ${round.players[round.voter]}`) + `<p class="party-small">${t.privateHint}</p>${button(t.ready, 'ready', { primary: true })}`; return;
  }
  root.innerHTML = top + progress(round.index, round.questions.length) + heading(q.text[lang]);
  if (round.phase === 'question') root.insertAdjacentHTML('beforeend', `<p class="party-small">${round.mode === 'point' ? t.pointHint : t.privateHint}</p><div class="party-actions">${button(round.mode === 'point' ? t.pointNow : t.ready, 'begin-votes', { primary: true })}${button(t.skip, 'skip')}</div>`);
  if (round.phase === 'point') root.insertAdjacentHTML('beforeend', `<p>${t.pointNow}</p><h3>${t.choosePick}</h3><p class="party-small">${t.pickHint}</p><div class="party-options names">${round.players.map((name, i) => `<label class="party-option">${avatar(name)}<bdi>${e(name)}</bdi><input type="checkbox" data-party-pick="${i}" aria-label="${e(name)}"${round.selected.includes(i) ? ' checked' : ''}></label>`).join('')}</div><div class="party-actions">${button(t.reveal, 'reveal-point', { primary: true, disabled: !round.selected.length })}${button(t.skip, 'skip')}</div>`);
  if (round.phase === 'voting') root.insertAdjacentHTML('beforeend', `<p class="party-small">${t.voting}</p><div class="party-options names">${round.players.map((name, i) => `<button type="button" class="party-option" data-party-action="vote" data-index="${i}">${avatar(name)}<bdi>${e(name)}</bdi></button>`).join('')}</div>${button(t.skip, 'skip')}`);
  if (round.phase === 'reveal') {
    const item = round.history.at(-1);
    root.insertAdjacentHTML('beforeend', `<div class="party-reveal"><h3>${item.skipped ? t.skipped : round.selected.length > 1 ? t.tie : t.picked}</h3><ul>${round.selected.map(i => `<li>${avatar(round.players[i])} <bdi>${e(round.players[i])}</bdi>${item.counts ? ` <strong>${item.counts[i]} ${t.votes}</strong>` : ''}</li>`).join('')}</ul></div>${button(round.index === round.questions.length - 1 ? t.finish : t.next, 'next-round', { primary: true })}`);
  }
}
function renderDraft() {
  const q = draft.questions[draft.index], choice = draft.answers[draft.index];
  root.innerHTML = progress(draft.index) + heading(q.text[lang], t.ownAnswers) + `<div class="party-options">${q.options.map((option, i) => `<button type="button" class="party-option" aria-pressed="${choice === i}" data-party-action="answer-own" data-index="${i}">${e(option[lang])}</button>`).join('')}</div><div class="party-actions">${button(draft.index === 9 ? t.review : t.continue, 'next-own', { primary: true, disabled: choice === null })}${draft.index ? button(t.previous, 'previous-own') : button(t.back, 'setup')}${button(t.change, 'swap')}</div>`;
}
function renderReview() {
  root.innerHTML = heading(t.review) + `<ol class="party-review">${draft.questions.map((q, i) => `<li><strong>${i + 1}. ${e(q.text[lang])}</strong><p>${t.chosen}: ${e(q.options[draft.answers[i]][lang])}</p>${button(t.edit, 'edit-own', { extra: `data-index="${i}"` })}</li>`).join('')}</ol>` + storageNote() + `<p class="party-consent">${t.consent}</p><div class="party-actions">${button(t.publish, 'publish', { primary: true })}${button(t.previous, 'last-own')}</div>`;
}
function renderDashboard() {
  root.innerHTML = heading(t.shareTitle) + storageNote() + `<label class="party-field">${t.link}<input class="party-share-link" readonly value="${e(shareUrl())}" id="party-share-link"></label><div class="party-actions">${button(t.share, 'share', { primary: true })}${button(t.copy, 'copy')}</div><p class="party-small">${t.expires}: ${e(new Intl.DateTimeFormat(lang, { dateStyle: 'medium', timeStyle: 'short' }).format(quiz.expiresAt))}</p><p class="party-consent">${t.consent}</p>` + leaderboard() + `<div class="party-actions">${button(t.refresh, 'refresh')}${button(t.close, 'ask-close')}${button(t.makeOwn, 'new-quiz')}</div>`;
}
function renderChallenge() {
  root.innerHTML = heading(`${t.challenge} ${quiz.ownerName}؟`.replace(/؟$/u, lang === 'ar' ? '؟' : '?'), t.challengeHint) + `<form id="party-challenge"><label class="party-field">${t.yourName}<input name="name" maxlength="24" required autocomplete="off" value="${e(playerName)}" placeholder="${e(t.namePlaceholder)}"></label><p class="party-consent">${t.consent}</p><div class="party-actions"><button type="submit" class="party-button primary">${t.play}</button>${button(t.makeOwn, 'new-quiz')}</div></form>` + leaderboard();
}
function renderGuess() {
  const q = quiz.questions[answerIndex], choice = guesses[answerIndex];
  root.innerHTML = progress(answerIndex) + heading(q.question[lang], t.guess) + `<div class="party-options">${q.options[lang].map((option, i) => `<button type="button" class="party-option" aria-pressed="${choice === i}" data-party-action="answer-guess" data-index="${i}">${e(option)}</button>`).join('')}</div><div class="party-actions">${button(answerIndex === 9 ? t.submit : t.continue, answerIndex === 9 ? 'submit' : 'next-guess', { primary: true, disabled: choice === null })}${answerIndex ? button(t.previous, 'previous-guess') : button(t.back, 'challenge')}</div>`;
}
function renderResults() {
  const score = quiz.result.score;
  root.innerHTML = heading(t.results, score === 10 ? t.perfect : score >= 7 ? t.great : t.surprise) + `<p class="party-score" aria-label="${t.score}: ${score} ${t.of} 10">${score} / 10</p><p class="party-small">${t.challengeHint}</p>` + leaderboard() + `<div class="party-actions">${button(t.makeOwn, 'new-quiz', { primary: true })}${button(t.refresh, 'refresh')}${button(t.games, 'games')}</div>`;
}
function render() {
  root.setAttribute('aria-busy', 'false');
  if (view === 'home') renderHome();
  else if (view === 'setup') renderSetup();
  else if (view === 'most') renderMost();
  else if (view === 'draft') renderDraft();
  else if (view === 'review') renderReview();
  else if (view === 'dashboard') renderDashboard();
  else if (view === 'challenge') renderChallenge();
  else if (view === 'guess') renderGuess();
  else if (view === 'results') renderResults();
  else root.innerHTML = heading(view === 'closed' ? t.closed : t.unavailable) + `<div class="party-actions">${view === 'unavailable' && validQuizCode(currentCode()) ? button(t.retry, 'retry-quiz') : ''}${button(t.makeOwn, 'new-quiz', { primary: true })}${button(t.games, 'games')}</div>`;
}
function showConfirmation(kind) {
  confirm = kind;
  root.querySelector('.party-confirm')?.remove();
  root.insertAdjacentHTML('beforeend', `<section class="party-confirm" role="group" aria-label="${e(kind === 'close' ? t.close : t.restartTitle)}"><p>${e(kind === 'close' ? t.closeConfirm : t.restartHint)}</p><div class="party-actions">${button(kind === 'close' ? t.confirmClose : t.confirmRestart, 'confirm', { primary: true })}${button(kind === 'close' ? t.cancel : t.back, 'cancel-confirm')}</div></section>`);
  root.querySelector('[data-party-action="confirm"]').focus();
}
async function publishQuiz() {
  if (busy) return;
  // A lost response may have committed the earlier quiz. Only identical
  // payloads may retry with that identity; edited answers need a new quiz.
  const signature = JSON.stringify([ownerName, lang, draft.questions.map((q, i) => [q.id, draft.answers[i]])]);
  if (!createToken || signature !== createSignature) { createToken = newQuizToken(); createSignature = signature; }
  const payload = quizCreationPayload(draft, ownerName, lang, createToken);
  setBusy(true); message(t.creating);
  try {
    quiz = assertPublicQuiz(await apiRequest('create', payload)); accessToken = createToken;
    saveAccess(quiz.code, accessToken, true, ownerName); updateQuizUrl(quiz.code);
    draft = null; createToken = null; createSignature = null; setView('dashboard');
  } catch (error) { message(errorMessage(error)); }
  finally { setBusy(false); }
}
async function submitQuiz() {
  if (busy || guesses.some(a => !Number.isInteger(a) || a < 0 || a > 3)) return;
  setBusy(true); message(t.submitting);
  try {
    quiz = assertPublicQuiz(await apiRequest(`${quiz.code}/submit`, { token: accessToken, name: playerName, answers: guesses }));
    saveAccess(quiz.code, accessToken, false, playerName); guesses = []; setView('results');
  } catch (error) { message(errorMessage(error)); }
  finally { setBusy(false); }
}
async function refreshQuiz() {
  if (busy) return; setBusy(true);
  try { quiz = assertPublicQuiz(await apiRequest(`${quiz.code}/state`, { token: accessToken })); render(); }
  catch (error) { message(errorMessage(error)); }
  finally { setBusy(false); }
}
async function closeQuiz() {
  if (busy) return; setBusy(true);
  try {
    await apiRequest(`${quiz.code}/close`, { token: accessToken }); delete records[quiz.code];
    try { localStorage.setItem(ACCESS_KEY, JSON.stringify(records)); } catch { durable = false; }
    quiz = null; updateQuizUrl(); setView('closed');
  } catch (error) { message(errorMessage(error)); }
  finally { setBusy(false); }
}
async function copyQuiz() {
  try { await navigator.clipboard.writeText(shareUrl()); message(t.copied); }
  catch { const input = root.querySelector('#party-share-link'); input.focus(); input.select(); message(t.copyFailed); }
}
root.addEventListener('submit', event => {
  event.preventDefault(); if (busy) return;
  const form = new FormData(event.target);
  if (event.target.id === 'party-setup') {
    try {
      if (most) { round = createMostLikely(data, { names: form.get('names'), pack: form.get('pack'), rounds: Number(form.get('rounds')), mode: form.get('mode') }); setView('most'); }
      else { ownerName = cleanPartyName(form.get('name')); if (!ownerName) throw Error('name'); draft = createKnowMeDraft(data, form.get('pack')); createToken = null; createSignature = null; setView('draft'); }
    } catch { message(most ? t.namesError : t.nameError); }
  } else if (event.target.id === 'party-challenge') {
    playerName = cleanPartyName(form.get('name'));
    if (!playerName) { message(t.nameError); return; }
    guesses = Array(10).fill(null); answerIndex = 0; setView('guess');
  }
});
root.addEventListener('change', event => {
  if (event.target.hasAttribute('data-party-pick')) {
    round.selected = [...root.querySelectorAll('[data-party-pick]:checked')].map(input => Number(input.dataset.partyPick));
    root.querySelector('[data-party-action="reveal-point"]').disabled = !round.selected.length;
  }
});
root.addEventListener('click', async event => {
  const control = event.target.closest('[data-party-action]'); if (!control || control.disabled || busy) return;
  const action = control.dataset.partyAction, index = Number(control.dataset.index);
  try {
    if (['start', 'setup'].includes(action)) { setView('setup'); return; }
    if (action === 'home') { setView('home'); return; }
    if (action === 'games') { location.href = lang === 'ar' ? '/ar/play/' : '/play'; return; }
    if (action === 'ask-exit') { showConfirmation('exit'); return; }
    if (action === 'ask-close') { showConfirmation('close'); return; }
    if (action === 'cancel-confirm') {
      const previous = confirm === 'close' ? 'ask-close' : 'ask-exit'; confirm = '';
      root.querySelector('.party-confirm')?.remove(); root.querySelector(`[data-party-action="${previous}"]`)?.focus(); return;
    }
    if (action === 'confirm') { if (confirm === 'close') await closeQuiz(); else { round = null; setView('setup'); } return; }
    if (action === 'begin-votes') { startPartyVoting(round); setView('most'); return; }
    if (action === 'ready') { readyPartyVoter(round); setView('most'); return; }
    if (action === 'vote') { castPartyVote(round, index); setView('most'); return; }
    if (action === 'skip') { finishPartyQuestion(round); setView('most'); return; }
    if (action === 'reveal-point') { finishPartyQuestion(round, [...root.querySelectorAll('[data-party-pick]:checked')].map(input => Number(input.dataset.partyPick))); setView('most'); return; }
    if (action === 'next-round') { nextPartyQuestion(round); setView('most'); return; }
    if (action === 'answer-own') { draft.answers[draft.index] = index; render(); root.querySelector(`[data-party-action="answer-own"][data-index="${index}"]`)?.focus(); return; }
    if (action === 'next-own') { if (draft.answers[draft.index] === null) return; if (draft.index === 9) setView('review'); else { draft.index++; setView('draft'); } return; }
    if (action === 'previous-own') { draft.index = Math.max(0, draft.index - 1); setView('draft'); return; }
    if (action === 'last-own') { draft.index = 9; setView('draft'); return; }
    if (action === 'edit-own') { draft.index = index; setView('draft'); return; }
    if (action === 'swap') { replaceKnowMeQuestion(draft, data); setView('draft'); return; }
    if (action === 'publish') { await publishQuiz(); return; }
    if (action === 'open-quiz') { await openQuiz(control.dataset.code); return; }
    if (action === 'retry-quiz') { await openQuiz(currentCode()); return; }
    if (action === 'share') { if (navigator.share) { try { await navigator.share({ title: t.knowTitle, url: shareUrl() }); } catch (error) { if (error.name !== 'AbortError') await copyQuiz(); } } else await copyQuiz(); return; }
    if (action === 'copy') { await copyQuiz(); return; }
    if (action === 'refresh') { await refreshQuiz(); return; }
    if (action === 'new-quiz') { quiz = null; updateQuizUrl(); if (!data) await loadQuestions('setup'); else setView('setup'); return; }
    if (action === 'challenge') { setView('challenge'); return; }
    if (action === 'answer-guess') { guesses[answerIndex] = index; render(); root.querySelector(`[data-party-action="answer-guess"][data-index="${index}"]`)?.focus(); return; }
    if (action === 'next-guess') { if (guesses[answerIndex] !== null && answerIndex < 9) { answerIndex++; setView('guess'); } return; }
    if (action === 'previous-guess') { answerIndex = Math.max(0, answerIndex - 1); setView('guess'); return; }
    if (action === 'submit') await submitQuiz();
  } catch (error) { message(errorMessage(error)); }
});
window.addEventListener('pagehide', () => requestController?.abort());
window.addEventListener('popstate', () => {
  // Our quiz links replace the current entry. Back from the skip-link hash
  // must not reset an in-progress round or duplicate an in-flight request.
  if (busy || most || !currentCode() || currentCode() === quiz?.code) return;
  openQuiz(currentCode());
});
async function loadQuestions(next = pendingDataView) {
  pendingDataView = next;
  root.setAttribute('aria-busy', 'true');
  const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 12000);
  try {
    const response = await fetch(PARTY_DATA_URL, { signal: controller.signal }); if (!response.ok) throw Error('data');
    data = validatePartyData(await response.json());
    setView(next, next !== 'home'); updateLanguageLink();
  } catch {
    root.innerHTML = heading(t.failed) + button(t.retry, 'reload-data', { primary: true }); root.setAttribute('aria-busy', 'false');
  } finally { clearTimeout(timer); }
}
root.addEventListener('click', event => { if (event.target.closest('[data-party-action="reload-data"]')) { root.innerHTML = `<p>${t.loading}</p>`; loadQuestions(); } });
if (!most && currentCode()) await openQuiz(currentCode()); else await loadQuestions();
