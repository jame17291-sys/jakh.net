import { CASES } from './akshifha-cases.js';
import { AKSHIFHA_UI } from './akshifha-copy.js';
import { createAkshifhaStudy } from './akshifha-study.js';
import {
  resolveCase, evaluateAnswer, resultRank, buildChallengeUrl, buildShareText,
  sanitizeProgress, recordCompletion, selectNextCase, selectContinuationCase, utcDay,
} from './akshifha-engine.js';

export const PROGRESS_KEY = 'riddlearabia-akshifha-v1';

/** Standalone guest game: no account, API calls, timers, or competitive scores. */
export function mountAkshifha(document, window) {
  const byId = id => document.getElementById(id);
  if (!byId('ak-game')) return null;
  const language = document.documentElement.lang === 'ar' ? 'ar' : 'en';
  const copy = AKSHIFHA_UI[language];
  const number = value => new Intl.NumberFormat(language).format(value);
  const text = (key, values = {}) => Object.entries(values).reduce(
    (value, [name, replacement]) => value.replaceAll(`{${name}}`, String(replacement)), copy[key] || key,
  );
  const localized = value => value?.[language] || value?.en || '';
  const element = (tag, className, content) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (content !== undefined) node.textContent = content;
    return node;
  };
  for (const node of document.querySelectorAll('[data-i18n]')) {
    if (copy[node.dataset.i18n]) node.textContent = copy[node.dataset.i18n];
  }
  for (const node of document.querySelectorAll('[data-i18n-aria-label]')) {
    if (copy[node.dataset.i18nAriaLabel]) node.setAttribute('aria-label', copy[node.dataset.i18nAriaLabel]);
  }
  byId('akLanguage').value = language;
  const paths = language === 'ar'
    ? { game: '/ar/games/akshifha/', home: '/ar/', play: '/ar/play/', privacy: '/ar/privacy/' }
    : { game: '/akshifha', home: '/', play: '/play', privacy: '/privacy' };
  const initial = resolveCase(CASES, window.location.search);
  const initialFragment = window.location.hash;
  let caseItem = initial.caseItem;
  let mode = initial.mode;
  let day = initial.day;
  let selected = new Set();
  let choice = '';
  let attempts = 0;
  let hintsUsed = 0;
  let finished = false;
  let revealed = false;
  let generation = 0;
  let evidenceInputs = [];
  let optionInputs = [];
  let progress = sanitizeProgress(null, CASES);
  let progressAvailable = true;
  const showStorageFailure = () => {
    progressAvailable = false;
    byId('ak-storage-notice').hidden = false;
    byId('ak-storage-notice').textContent = text('akStorageUnavailable');
  };
  try { progress = sanitizeProgress(window.localStorage.getItem(PROGRESS_KEY), CASES); }
  catch { showStorageFailure(); }

  const study = createAkshifhaStudy({
    allowed: () => window.JakhPrivacy?.analyticsAllowed?.() === true,
    send: (name, parameters) => window.gtag?.('event', name, parameters),
  });
  if (typeof document.addEventListener === 'function') {
    document.addEventListener('jakh:consentchange', () => study.reset());
  }
  const track = (event, extra = {}) => study.track(event, extra);
  function updateUrl(preserveFragment = false) {
    const url = new URL(paths.game, window.location.origin);
    if (preserveFragment) url.hash = window.location.hash;
    if (mode === 'daily') url.searchParams.set('day', day);
    else {
      url.searchParams.set('case', caseItem.id);
      if (mode === 'practice') url.searchParams.set('mode', 'practice');
      else url.searchParams.set('day', day);
    }
    try { window.history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`); }
    catch { /* A blocked History API does not block local play. */ }
  }
  function setFeedback(key, wrong = false) {
    byId('ak-feedback').textContent = text(key);
    byId('ak-feedback').dataset.wrong = String(wrong);
  }
  function updateSelection() {
    for (const { input, card } of evidenceInputs) {
      input.checked = selected.has(input.value);
      input.disabled = finished || (selected.size === 2 && !input.checked);
      card.dataset.selected = String(input.checked);
    }
    for (const input of optionInputs) input.disabled = finished;
    byId('ak-selection').textContent = text('akSelection', { count: number(selected.size) });
    byId('ak-check').disabled = finished || selected.size !== 2 || !choice;
  }
  function renderCasebook() {
    const list = byId('ak-case-list');
    list.replaceChildren();
    for (const item of CASES) {
      const button = element('button', 'ak-case-entry');
      button.type = 'button';
      button.dataset.caseId = item.id;
      if (item.id === caseItem.id) button.setAttribute('aria-current', 'true');
      const title = `${text('akCaseNumber', { number: number(item.number) })} · ${localized(item.title)}`;
      button.append(element('span', 'ak-case-entry-title', title));
      const record = progress.cases[item.id];
      const rank = record ? resultRank(record) : 'in-progress';
      const labels = { solved: 'akStatusSolved', assisted: 'akStatusAssisted', revealed: 'akStatusRevealed', 'in-progress': 'akUnplayed' };
      button.append(element('span', 'ak-case-entry-status', text(labels[rank])));
      button.addEventListener('click', () => {
        track('case_open', { destination_case_id: item.id });
        openCase(item, 'practice', utcDay(), true, 'casebook');
      });
      list.append(button);
    }
    byId('ak-progress-count').textContent = text('akCompleted', { count: number(Object.keys(progress.cases).length), total: number(CASES.length) });
    byId('ak-next').textContent = text(CASES.every(item => progress.cases[item.id]) ? 'akRevisit' : 'akNext');
    const continuation = progressAvailable ? selectContinuationCase(CASES, caseItem.id, progress) : null;
    byId('ak-continue').hidden = !continuation;
    if (continuation) {
      const title = text('akContinueTitle', { title: localized(continuation.title) });
      byId('ak-continue').title = title;
      byId('ak-continue').setAttribute('aria-label', title);
    }
  }
  function openCase(item, nextMode, nextDay, focus = false, entry = 'initial') {
    if (!item) return;
    generation += 1;
    caseItem = item; mode = nextMode; day = nextDay;
    selected = new Set(); choice = ''; attempts = 0; hintsUsed = 0; finished = false; revealed = false;
    evidenceInputs = []; optionInputs = [];
    byId('ak-case-number').textContent = text('akCaseNumber', { number: number(item.number) });
    byId('ak-case-difficulty').textContent = localized(item.difficulty);
    byId('ak-case-title').textContent = localized(item.title);
    byId('ak-case-intro').textContent = localized(item.intro);
    byId('ak-case-rule').textContent = localized(item.rule);
    byId('ak-mode-label').textContent = mode === 'daily' ? text('akDailyDate', { day }) : text(mode === 'practice' ? 'akPracticeMode' : 'akChallengeMode');
    if (mode === 'daily') byId('ak-daily').setAttribute('aria-current', 'true');
    else byId('ak-daily').removeAttribute('aria-current');
    for (const id of ['ak-result', 'ak-hints-box', 'ak-reveal-confirm', 'ak-share-manual', 'ak-reset-confirm', 'ak-link-notice']) byId(id).hidden = true;
    byId('ak-share-status').textContent = '';
    byId('ak-share-text').value = '';
    byId('ak-share').disabled = false;
    byId('ak-hints').replaceChildren();
    byId('ak-hint').disabled = false;
    byId('ak-reveal').hidden = false;
    byId('ak-evidence').replaceChildren();
    for (const evidence of item.evidence) {
      const card = element('label', 'ak-evidence-card');
      const input = element('input');
      input.type = 'checkbox'; input.name = 'evidence'; input.value = evidence.id;
      const title = element('span', 'ak-evidence-title', localized(evidence.label));
      const body = element('span', 'ak-evidence-text', localized(evidence.text));
      card.append(input, title, body);
      input.addEventListener('change', () => {
        if (finished) return;
        if (input.checked && selected.size < 2) selected.add(evidence.id);
        else selected.delete(evidence.id);
        setFeedback('akReady');
        updateSelection();
      });
      evidenceInputs.push({ input, card, evidence });
      byId('ak-evidence').append(card);
    }
    byId('ak-options').replaceChildren();
    for (const option of item.options) {
      const label = element('label', 'ak-option');
      const input = element('input');
      input.type = 'radio'; input.name = 'conclusion'; input.value = option.id;
      input.addEventListener('change', () => {
        if (finished || !input.checked) return;
        choice = option.id;
        setFeedback('akReady');
        updateSelection();
      });
      label.append(input, element('span', '', localized(option.text)));
      optionInputs.push(input);
      byId('ak-options').append(label);
    }
    setFeedback('akReady');
    updateSelection(); renderCasebook(); updateUrl(!focus);
    if (focus) byId('ak-case-title').focus();
    study.open({
      caseId: item.id, gameMode: mode, language, entry,
      completedBefore: Boolean(progress.cases[item.id]),
      priorCompletions: Object.keys(progress.cases).length, progressAvailable,
    });
  }
  function finish(showAnswer = false) {
    if (finished) return;
    finished = true; revealed = showAnswer;
    const result = { attempts, hintsUsed, revealed };
    progress = recordCompletion(progress, caseItem.id, result, CASES);
    try { window.localStorage.setItem(PROGRESS_KEY, JSON.stringify(progress)); }
    catch { showStorageFailure(); }
    updateSelection();
    byId('ak-hint').disabled = true;
    byId('ak-reveal').hidden = true;
    byId('ak-reveal-confirm').hidden = true;
    byId('ak-feedback').textContent = '';
    const rank = resultRank(result);
    byId('ak-result-title').textContent = text(rank === 'revealed' ? 'akRevealed' : rank === 'assisted' ? 'akAssisted' : 'akSolved');
    byId('ak-result-stats').textContent = text('akStats', { attempts: number(attempts), hints: number(hintsUsed) });
    byId('ak-proof').replaceChildren();
    for (const { evidence, card } of evidenceInputs) {
      if (!caseItem.solution.evidenceIds.includes(evidence.id)) continue;
      card.dataset.proof = 'true';
      card.append(element('span', 'ak-proof-label', text('akKeyClue')));
      byId('ak-proof').append(element('li', '', `${localized(evidence.label)}: ${localized(evidence.text)}`));
    }
    byId('ak-explanation').textContent = localized(caseItem.explanation);
    byId('ak-result').hidden = false;
    renderCasebook();
    byId('ak-result-title').focus();
    track('complete', { attempts, hints_used: hintsUsed, outcome: rank });
  }
  byId('ak-answer-form').addEventListener('submit', event => {
    event.preventDefault();
    if (finished) return;
    const result = evaluateAnswer(caseItem, [...selected], choice);
    if (!result.valid) { setFeedback('akReady'); return; }
    attempts = Math.min(999, attempts + 1);
    track('check', { attempts, correct: result.correct });
    if (result.correct) finish();
    else setFeedback('akWrong', true);
  });
  byId('ak-hint').addEventListener('click', () => {
    if (finished || hintsUsed >= caseItem.hints.length) return;
    byId('ak-hints-box').hidden = false;
    byId('ak-hints').append(element('li', '', localized(caseItem.hints[hintsUsed])));
    hintsUsed += 1;
    byId('ak-hint').disabled = hintsUsed >= caseItem.hints.length;
    track('hint', { hints_used: hintsUsed });
  });
  byId('ak-reveal').addEventListener('click', () => {
    if (finished) return;
    byId('ak-reveal-confirm').hidden = false; byId('ak-reveal-yes').focus();
  });
  byId('ak-reveal-no').addEventListener('click', () => {
    byId('ak-reveal-confirm').hidden = true; byId('ak-reveal').focus();
  });
  byId('ak-reveal-yes').addEventListener('click', () => finish(true));
  byId('ak-next').addEventListener('click', () => {
    if (!finished) return;
    const next = selectNextCase(CASES, caseItem.id, progress);
    track('next_case', { destination_case_id: next?.id });
    openCase(next, 'practice', utcDay(), true, 'next');
  });
  byId('ak-replay').addEventListener('click', () => openCase(caseItem, 'practice', utcDay(), true, 'replay'));
  byId('ak-continue').addEventListener('click', () => {
    const next = progressAvailable ? selectContinuationCase(CASES, caseItem.id, progress) : null;
    if (!next) return;
    track('case_open', { destination_case_id: next.id });
    openCase(next, 'practice', utcDay(), true, 'continue');
  });
  byId('ak-daily').addEventListener('click', () => {
    const daily = resolveCase(CASES);
    openCase(daily.caseItem, 'daily', daily.day, true, 'daily');
  });
  byId('akLanguage').addEventListener('change', event => {
    const targetLanguage = event.target.value === 'ar' ? 'ar' : 'en';
    if (targetLanguage === language) return;
    const url = new URL(targetLanguage === 'ar' ? '/ar/games/akshifha/' : '/akshifha', window.location.origin);
    url.searchParams.set('case', caseItem.id);
    if (mode === 'practice') url.searchParams.set('mode', 'practice');
    else url.searchParams.set('day', day);
    window.location.assign(`${url.pathname}${url.search}`);
  });
  byId('ak-share').addEventListener('click', async () => {
    if (!finished || byId('ak-share').disabled) return;
    const shareGeneration = generation;
    const url = buildChallengeUrl({ language, caseId: caseItem.id, day: mode === 'practice' ? undefined : day });
    const message = buildShareText({ language, attempts, hintsUsed, revealed });
    const fullText = `${message}\n${url}`;
    byId('ak-share').disabled = true;
    const current = () => generation === shareGeneration;
    const manual = () => {
      byId('ak-share-text').value = fullText; byId('ak-share-manual').hidden = false;
      byId('ak-share-status').textContent = text('akShareUnavailable');
      byId('ak-share-text').focus(); byId('ak-share-text').select();
    };
    try {
      if (typeof window.navigator.share === 'function') {
        await window.navigator.share({ title: text('akTitle'), text: message, url });
        if (current()) { byId('ak-share-status').textContent = text('akShared'); track('share', { method: 'native' }); }
      } else if (typeof window.navigator.clipboard?.writeText === 'function') {
        await window.navigator.clipboard.writeText(fullText);
        if (current()) { byId('ak-share-status').textContent = text('akCopied'); track('share', { method: 'copy' }); }
      } else manual();
    } catch (error) {
      if (current()) {
        if (error?.name === 'AbortError') byId('ak-share-status').textContent = text('akShareCancelled');
        else manual();
      }
    } finally { if (current()) byId('ak-share').disabled = false; }
  });
  byId('ak-reset').addEventListener('click', () => {
    byId('ak-reset-confirm').hidden = false; byId('ak-reset-yes').focus();
  });
  byId('ak-reset-no').addEventListener('click', () => {
    byId('ak-reset-confirm').hidden = true; byId('ak-reset').focus();
  });
  byId('ak-reset-yes').addEventListener('click', () => {
    progress = sanitizeProgress(null, CASES);
    study.reset();
    byId('ak-reset-confirm').hidden = true;
    try {
      window.localStorage.removeItem(PROGRESS_KEY);
      byId('ak-storage-notice').hidden = false;
      byId('ak-storage-notice').textContent = text('akResetDone');
    } catch { showStorageFailure(); }
    renderCasebook(); byId('ak-reset').focus();
  });
  openCase(caseItem, mode, day);
  if (initial.invalidLink) {
    byId('ak-link-notice').hidden = false;
    byId('ak-link-notice').textContent = text('akInvalidLink');
  }
  byId('ak-loading').hidden = true;
  byId('ak-game').hidden = false;
  if (initialFragment === '#ak-casebook') {
    // The destination was hidden while modules loaded, so restore the entry
    // point after layout. Opening a case later clears this fragment normally.
    window.requestAnimationFrame(() => {
      byId('ak-casebook-title').focus({ preventScroll: true });
      byId('ak-casebook').scrollIntoView({ block: 'start' });
    });
  }
  return { getState: () => ({ caseId: caseItem.id, mode, day, attempts, hintsUsed, finished, revealed, selected: [...selected], choice }) };
}

if (typeof document !== 'undefined' && typeof window !== 'undefined') {
  mountAkshifha(document, window);
  if (window.isSecureContext && 'serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => {});
  }
}
