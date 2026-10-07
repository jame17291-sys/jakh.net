import { FRIENDSHIP_COPY } from './friendship-games-copy.js';
import { createFriendshipGame, finishFriendshipRound, finishPanic, revealSecret, nextSecret, readyFriendshipVoter, startFriendshipVote, castFriendshipVote } from './friendship-games-engine.js';
import { escapeParty as e } from './party-games-engine.js';

const root = document.getElementById('party-app');
const game = document.body.dataset.friendshipGame;
const lang = document.documentElement.lang === 'ar' ? 'ar' : 'en';
const t = FRIENDSHIP_COPY[lang], c = t[game];
let view = 'home', state, timerId, panicDeadline = 0;
const button = (label, action, primary = false, extra = '') => `<button type="button" class="party-button${primary ? ' primary' : ''}" data-party-action="${action}" ${extra}>${e(label)}</button>`;
const heading = (title, detail = '') => `<h2 tabindex="-1">${e(title)}</h2>${detail ? `<p class="party-small">${e(detail)}</p>` : ''}`;
const avatar = name => `<span class="party-avatar" aria-hidden="true">${e([...name][0])}</span>`;
const progress = () => `<p class="party-small">${t.question} ${state.index + 1} ${t.of} ${state.cards.length}</p><progress class="party-progress" max="${state.cards.length}" value="${state.index}" aria-label="${t.question} ${state.index + 1} ${t.of} ${state.cards.length}"></progress>`;
function stopTimer() { if (timerId) clearInterval(timerId); timerId = null; }
function focusHeading() { root.querySelector('h2')?.focus({ preventScroll: true }); }
function renderStep() { render(); focusHeading(); }
function setView(next) { stopTimer(); panicDeadline = 0; view = next; document.getElementById('party-feedback').textContent = ''; document.body.classList.toggle('party-playing', next !== 'home'); renderStep(); }
function scoreboard() { return `<ol class="party-leaderboard">${state.players.map((name, i) => ({ name, score: state.scores[i] })).sort((a,b) => b.score - a.score).map(row => `<li>${avatar(row.name)}<bdi>${e(row.name)}</bdi><strong>${row.score}</strong></li>`).join('')}</ol>`; }
function renderHome() { root.innerHTML = heading(c.title, c.intro) + button(t.start, 'setup', true); }
function renderSetup() { root.innerHTML = heading(t.start) + `<form id="friendship-setup"><label class="party-field">${t.names}<textarea name="names" required rows="3" placeholder="${e(t.namesPlaceholder)}" aria-describedby="names-hint"></textarea><small id="names-hint">${c.namesHint || t.namesHint}</small></label><label class="party-field">${t.rounds}<select name="rounds"><option value="5">5</option><option value="8" selected>8</option><option value="10">10</option></select></label><p class="party-small">${e(c.how)}</p><div class="party-actions"><button class="party-button primary" type="submit">${t.start}</button>${button(t.back, 'home')}</div></form>`; }
function renderFinished() { root.innerHTML = heading(t.finish) + scoreboard() + `<div class="party-actions">${button(t.again, 'setup', true)}${button(t.games, 'games')}</div>`; }
function renderImpostor() {
  const card = state.cards[state.index];
  if (state.phase === 'secret-handoff') { root.innerHTML = progress() + heading(`${t.pass} ${state.players[state.viewer]}`, t.rolePrivacy) + button(t.roleReady, 'reveal-secret', true); return; }
  if (state.phase === 'secret') { const imposter = state.viewer === state.imposter; root.innerHTML = progress() + heading(state.players[state.viewer], t.rolePrivacy) + `<div class="friendship-secret ${imposter ? 'is-impostor' : ''}">${imposter ? '🕵️' : '🔐'}<strong>${e(imposter ? c.impostor : card.word[lang])}</strong></div><p class="party-small">${e(imposter ? c.impostorHint : c.clue)}</p>${button(state.viewer === state.players.length - 1 ? t.beginClues : t.hideRole, 'next-secret', true)}`; return; }
  if (state.phase === 'clue') root.innerHTML = progress() + heading(c.clue, c.voteHint) + button(t.startVote, 'start-vote', true);
  if (state.phase === 'handoff') root.innerHTML = progress() + heading(`${t.pass} ${state.players[state.viewer]}`, c.voteHint) + button(t.ready, 'ready', true);
  if (state.phase === 'voting') root.innerHTML = progress() + heading(c.voteHint) + `<div class="party-options names">${state.players.map((name, i) => button(`${name}`, 'vote', false, `data-index="${i}"`)).join('')}</div>`;
  if (state.phase === 'reveal') { const guesses = state.votes.filter(v => v.pick === state.imposter).length; const caught = guesses > state.players.length / 2; root.innerHTML = progress() + heading(c.result, caught ? c.caught : c.escaped) + `<div class="party-reveal">${avatar(state.players[state.imposter])}<strong>${e(state.players[state.imposter])}</strong><p>${guesses} / ${state.players.length} ${e(lang === 'ar' ? 'اختاروه' : 'guessed correctly')}</p></div>${button(state.index === state.cards.length - 1 ? t.finish : t.next, 'next-round', true)}`; }
}
function renderPanic() {
  const card = state.cards[state.index], player = state.players[state.index % state.players.length];
  if (state.phase === 'card') root.innerHTML = progress() + heading(`${c.turn}: ${player}`, t.preparePanic) + `<div class="friendship-timer">5</div>${button(c.timer, 'start-timer', true)}`;
  if (state.phase === 'timing') root.innerHTML = progress() + heading(`${c.turn}: ${player}`, card.text[lang]) + `<div class="friendship-timer is-running" aria-live="polite">${state.timer}</div><p class="party-small">${c.timerRunning}</p>`;
  if (state.phase === 'judge') root.innerHTML = progress() + heading(t.judge, card.text[lang]) + `<div class="party-actions">${button(c.nailed, 'panic-success', true)}${button(c.panic, 'panic-fail')}</div>`;
  if (state.phase === 'reveal') root.innerHTML = progress() + heading(c.result, state.lastSuccess ? c.nailed : c.panic) + button(state.index === state.cards.length - 1 ? t.finish : t.next, 'next-round', true);
}
function renderCourt() { const card = state.cards[state.index], accused = state.players[state.accused]; if (state.phase === 'card') root.innerHTML = progress() + heading(`${c.accused}: ${accused}`, `${c.charge}: ${card.charge[lang]}`) + `<div class="friendship-court">⚖️ <bdi>${e(accused)}</bdi></div><p class="party-small">${c.how}</p>${button(t.startVote, 'start-vote', true)}`; if (state.phase === 'handoff') root.innerHTML = progress() + heading(`${t.pass} ${state.players[state.viewer]}`, c.jury) + button(t.ready, 'ready', true); if (state.phase === 'voting') root.innerHTML = progress() + heading(c.jury, `${c.charge}: ${card.charge[lang]}`) + `<div class="party-actions">${button(c.guilty, 'vote', false, 'data-index="0"')}${button(c.innocent, 'vote', true, 'data-index="1"')}</div>`; if (state.phase === 'reveal') { const guilty = state.votes.filter(v => v.pick === 0).length, innocent = state.votes.length - guilty, cleared = innocent >= guilty; root.innerHTML = progress() + heading(c.verdict, cleared ? c.acquitted : c.convicted) + `<div class="party-reveal"><strong>${cleared ? c.innocent : c.guilty}</strong><p>${c.guilty}: ${guilty} · ${c.innocent}: ${innocent}</p></div>${button(state.index === state.cards.length - 1 ? t.finish : t.next, 'next-round', true)}`; } }
function render() {
  if (view === 'home') renderHome(); else if (view === 'setup') renderSetup(); else if (state?.phase === 'finished') renderFinished(); else if (game === 'impostor') renderImpostor(); else if (game === 'panic') renderPanic(); else renderCourt();
  if (view === 'game' && !['finished', 'reveal'].includes(state.phase)) root.innerHTML += `<div class="party-actions">${button(t.skip, 'skip')}${button(t.games, 'games')}</div>`;
}
function refreshPanicTimer() {
  if (state?.phase !== 'timing') return;
  const remaining = Math.max(0, Math.ceil((panicDeadline - Date.now()) / 1_000));
  if (!remaining) { stopTimer(); state.timer = 0; state.phase = 'judge'; renderStep(); }
  else if (remaining !== state.timer) { state.timer = remaining; root.querySelector('.friendship-timer').textContent = String(remaining); }
}
function resumePanicTimer() { if (state?.phase !== 'timing') return; stopTimer(); refreshPanicTimer(); if (state.phase === 'timing') timerId = setInterval(refreshPanicTimer, 100); }
root.addEventListener('submit', event => { if (event.target.id !== 'friendship-setup') return; event.preventDefault(); try { const form = new FormData(event.target); state = createFriendshipGame(game, form.get('names'), Number(form.get('rounds'))); setView('game'); } catch { document.getElementById('party-feedback').textContent = c.namesError || t.namesError; } });
root.addEventListener('click', event => {
  const control = event.target.closest('[data-party-action]'); if (!control) return;
  const action = control.dataset.partyAction, index = Number(control.dataset.index);
  if (action === 'home' || action === 'setup') { setView(action); return; }
  if (action === 'games') { location.href = lang === 'ar' ? '/ar/play/' : '/play'; return; }
  if (!state) return;
  if (action === 'reveal-secret') revealSecret(state);
  else if (action === 'next-secret') nextSecret(state);
  else if (action === 'start-vote') startFriendshipVote(state);
  else if (action === 'ready') readyFriendshipVoter(state);
  else if (action === 'vote') castFriendshipVote(state, index);
  else if (action === 'panic-success' || action === 'panic-fail') finishPanic(state, action === 'panic-success');
  else if (action === 'next-round' || action === 'skip') { stopTimer(); if (action === 'skip' && state.phase !== 'reveal') { state.skipped = true; state.phase = 'reveal'; } finishFriendshipRound(state); }
  else if (action === 'start-timer' && state.game === 'panic' && state.phase === 'card') { state.phase = 'timing'; panicDeadline = Date.now() + 5_000; renderStep(); resumePanicTimer(); return; }
  else return;
  renderStep();
});
window.addEventListener('pagehide', stopTimer);
window.addEventListener('pageshow', resumePanicTimer);
document.addEventListener('visibilitychange', () => { if (!document.hidden) resumePanicTimer(); });
render();
