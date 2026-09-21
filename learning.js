import { LEARNING_PROGRAM_VERSION, eligibleLearningUnits, eligibleSocialCollections, learningUnitById, socialCollectionById } from './learning-data.js';

const root = document.getElementById('learningApp');
const isAr = document.documentElement.lang === 'ar' || document.body.dataset.routeLang === 'ar';
const lang = isAr ? 'ar' : 'en';
const storageKey = `riddlearabia-learning-progress:${LEARNING_PROGRAM_VERSION}`;
const DAY = 24 * 60 * 60 * 1000;
const copy = isAr ? {
  eyebrow: 'مسارات التعلّم', title: 'فكّر، جرّب، ثم عد إلى الفكرة', intro: 'وحدات قصيرة ثنائية اللغة للتفكير الكمي وفحص الأدلة واتخاذ قرارات رقمية وتعلّم مناسب للعمر. لا تحتاج إلى حساب.',
  notice: 'هذه أنشطة مؤلّفة ومكتفية بذاتها. مراجعة بشرية وتربوية مستقلة ما زالت معلّقة؛ لا نقيس إتقاناً أو نتائج تعلّم هنا.',
  choose: 'اختر نقطة بداية', friends: 'تحدّي الأصدقاء', friendsText: 'جلسات قصيرة للتفكير والمقارنة الهادئة، لا لسرعة القراءة.', university: 'أساسيات الجامعة', universityText: 'طبّق فكرة، ثم عد إليها في وقت لاحق.', explorers: 'المستكشفون الصغار', explorersText: 'مسارات منفصلة للأعمار 6–8 و9–11 و12–14، بلا دردشة عامة أو مطابقة غرباء.', units: 'الوحدات المتاحة', collections: 'مجموعات التحدّي', back: '← كل المسارات', objective: 'هدف التعلّم', prerequisites: 'قبل البدء', worked: 'مثال', practice: 'تدرّب', application: 'تطبيق جديد', retrieval: 'استرجاع لاحق', explanation: 'التفسير', correct: 'إجابة صحيحة', tryAgain: 'ليست هذه الإجابة', due: 'يصبح الاسترجاع متاحاً في', complete: 'أكملت الوحدة', progress: 'خطوات مكتملة', provenance: 'المنشأ والتحقق', noUnits: 'لا توجد وحدات منشورة لهذه البداية بعد.', review: 'جلسات المراجعة المستحقة', return: 'ارجع لاحقاً لإتاحة الاسترجاع. لا يستبدل الضغط على «التالي» وقتاً منقضياً.', format: 'طريقة اللعب', replay: 'الإعادة', socialOutcome: 'نتيجة الجولة', openCollection: 'افتح المجموعة',
} : {
  eyebrow: 'Learning paths', title: 'Think, try it, then return to the idea', intro: 'Short bilingual units for quantitative thinking, evidence, digital decisions, and age-appropriate exploration. No account is needed.',
  notice: 'These are self-contained authored activities. Independent human editorial and educator validation is still pending; this page does not measure mastery or learning outcomes.',
  choose: 'Choose a starting point', friends: 'Challenge Friends', friendsText: 'Short sessions for thoughtful comparison, not fast reading.', university: 'University Essentials', universityText: 'Apply an idea, then return to it later.', explorers: 'Young Explorers', explorersText: 'Separate 6–8, 9–11, and 12–14 paths, with no open chat or stranger matching.', units: 'Available units', collections: 'Challenge collections', back: '← All paths', objective: 'Learning objective', prerequisites: 'Before you begin', worked: 'Worked example', practice: 'Practice', application: 'New application', retrieval: 'Later retrieval', explanation: 'Explanation', correct: 'Correct', tryAgain: 'Not this answer', due: 'Retrieval becomes available on', complete: 'Unit complete', progress: 'completed steps', provenance: 'Provenance and review', noUnits: 'No published units are available for this starting point yet.', review: 'Due review sessions', return: 'Return later to unlock retrieval. Moving to the next screen does not substitute for elapsed time.', format: 'Play format', replay: 'Replay rule', socialOutcome: 'Round outcome', openCollection: 'Open collection',
};

function t(value) { return typeof value === 'string' ? value : (value?.[lang] || value?.en || ''); }
function escapeHtml(value) { return String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;'); }
function state() { try { return JSON.parse(localStorage.getItem(storageKey) || '{}'); } catch { return {}; } }
function save(next) { localStorage.setItem(storageKey, JSON.stringify(next)); }
function recordFor(unitId) { return state()[unitId] || { completed: {}, attempts: {}, dueAt: null }; }
function update(unitId, updater) { const all = state(); const current = all[unitId] || { completed: {}, attempts: {}, dueAt: null }; all[unitId] = updater(current); save(all); return all[unitId]; }
function pathFor(unitId) { return `${location.pathname}?unit=${encodeURIComponent(unitId)}`; }
function humanDue(value) { return new Intl.DateTimeFormat(isAr ? 'ar-AE' : 'en-GB', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)); }

function syncLanguageLink() {
  const link = document.getElementById('learningLanguageLink');
  if (!link) return;
  const params = new URLSearchParams(location.search);
  const unit = params.get('unit');
  const collection = params.get('collection');
  const audience = params.get('audience');
  const nextPath = isAr ? '/learning' : '/ar/learn/';
  const nextParams = new URLSearchParams();
  if (unit) nextParams.set('unit', unit);
  else if (collection) nextParams.set('collection', collection);
  else if (audience) nextParams.set('audience', audience);
  link.href = `${nextPath}${nextParams.toString() ? `?${nextParams.toString()}` : ''}`;
  link.textContent = isAr ? 'English' : 'العربية'; link.lang = isAr ? 'en' : 'ar'; link.dir = isAr ? 'ltr' : 'rtl';
}

function stageLabel(stage) { return copy[stage] || stage; }
function isUnlocked(unit, item, progress) {
  const index = unit.activities.findIndex((candidate) => candidate.id === item.id);
  if (index > 0 && unit.activities.slice(0, index).some((candidate) => !progress.completed?.[candidate.id])) return false;
  if (item.stage !== 'retrieval') return true;
  return Number.isFinite(progress.dueAt) && Date.now() >= progress.dueAt;
}
function completedCount(progress) { return Object.keys(progress.completed || {}).length; }
function unitVisibleForAudience(unit, audience) {
  if (audience === 'explorers') return unit.audience.startsWith('children-');
  return unit.audience === audience;
}

function renderHome() {
  const all = eligibleLearningUnits();
  const params = new URLSearchParams(location.search); const audience = params.get('audience');
  const rows = audience ? all.filter((unit) => unitVisibleForAudience(unit, audience)) : [];
  if (audience === 'friends') return renderSocialHome();
  root.innerHTML = `
    <section class="learning-hero"><p class="learning-eyebrow">${copy.eyebrow}</p><h1>${copy.title}</h1><p>${copy.intro}</p><p class="learning-notice">${copy.notice}</p></section>
    ${audience ? `<a class="ghost-btn learning-back" href="${location.pathname}">${copy.back}</a><section aria-labelledby="learningUnits"><h2 id="learningUnits">${copy.units}</h2>${rows.length ? `<div class="learning-unit-grid">${rows.map(unitCard).join('')}</div>` : `<p>${copy.noUnits}</p>`}</section>` : audienceCards()}
    ${dueUnits(all)}
    <p class="learning-provenance"><strong>${copy.provenance}:</strong> ${isAr ? 'الإصدار ' : 'release '}${LEARNING_PROGRAM_VERSION}. ${isAr ? 'تُحفظ المحاولات ومواعيد المراجعة على هذا الجهاز فقط في هذه النسخة.' : 'Attempts and review due dates are stored on this device only in this release.'}</p>`;
}
function renderSocialHome() {
  const collections = eligibleSocialCollections();
  root.innerHTML = `
    <section class="learning-hero"><p class="learning-eyebrow">${copy.friends}</p><h1>${copy.title}</h1><p>${copy.friendsText}</p><p class="learning-notice">${copy.notice}</p></section>
    <a class="ghost-btn learning-back" href="${location.pathname}">${copy.back}</a>
    <section aria-labelledby="learningCollections"><h2 id="learningCollections">${copy.collections}</h2><div class="learning-unit-grid">${collections.map(collectionCard).join('')}</div></section>
    <p class="learning-provenance"><strong>${copy.provenance}:</strong> ${isAr ? 'الإصدار ' : 'release '}${LEARNING_PROGRAM_VERSION}. ${isAr ? 'هذه مجموعات تحدٍّ مؤلّفة؛ لا تسجل قياس احتفاظ أو موافقة مشاركين.' : 'These are authored challenge collections; no retention measurement or participant approval is recorded.'}</p>`;
}
function audienceCards() {
  return `<section aria-labelledby="learningStart"><h2 id="learningStart">${copy.choose}</h2><div class="learning-audience-grid">
    <a class="learning-card" href="${location.pathname}?audience=friends"><h3>${copy.friends}</h3><p>${copy.friendsText}</p></a>
    <a class="learning-card" href="${location.pathname}?audience=university"><h3>${copy.university}</h3><p>${copy.universityText}</p></a>
    <a class="learning-card" href="${location.pathname}?audience=explorers"><h3>${copy.explorers}</h3><p>${copy.explorersText}</p></a>
  </div></section>`;
}
function collectionCard(collection) { return `<a class="learning-unit-card" href="${location.pathname}?collection=${encodeURIComponent(collection.id)}"><small>${escapeHtml(t(collection.format))}</small><h3>${escapeHtml(t(collection.title))}</h3><p>${escapeHtml(t(collection.objective))}</p><p class="learning-progress">${copy.openCollection}</p></a>`; }
function unitCard(unit) { const progress = recordFor(unit.id); return `<a class="learning-unit-card" href="${pathFor(unit.id)}"><small>${escapeHtml(t(unit.pathway))}</small><h3>${escapeHtml(t(unit.title))}</h3><p>${escapeHtml(t(unit.objective))}</p><p class="learning-progress">${completedCount(progress)}/${unit.activities.length} ${copy.progress}</p></a>`; }
function dueUnits(all) { const due = all.filter((unit) => { const p = recordFor(unit.id); return p.dueAt && Date.now() >= p.dueAt && !p.completed?.[unit.activities.find((x) => x.stage === 'retrieval')?.id]; }); return due.length ? `<section aria-labelledby="learningReview"><h2 id="learningReview">${copy.review}</h2><div class="learning-unit-grid">${due.map(unitCard).join('')}</div></section>` : ''; }

function renderUnit(unit) {
  const progress = recordFor(unit.id); const count = completedCount(progress);
  const stages = unit.activities.map((item) => renderActivity(unit, item, progress)).join('');
  const done = count === unit.activities.length;
  root.innerHTML = `<a class="ghost-btn learning-back" href="${location.pathname}">${copy.back}</a>
    <section class="learning-unit-head"><p class="learning-eyebrow">${escapeHtml(t(unit.pathway))}</p><h1>${escapeHtml(t(unit.title))}</h1><p>${escapeHtml(t(unit.objective))}</p><p class="learning-progress">${count}/${unit.activities.length} ${copy.progress}</p></section>
    <section class="learning-facts"><div><strong>${copy.objective}</strong>${escapeHtml(t(unit.objective))}</div><div><strong>${copy.prerequisites}</strong>${escapeHtml(t(unit.prerequisites))}</div><div><strong>${copy.worked}</strong>${escapeHtml(t(unit.instruction))}<br /><small>${escapeHtml(t(unit.example))}</small></div></section>
    ${stages}${done ? `<section class="learning-summary" role="status"><h2>${copy.complete}</h2><p>${escapeHtml(t(unit.summary))}</p></section>` : ''}
    <p class="learning-provenance"><strong>${copy.provenance}:</strong> ${escapeHtml(unit.provenance.review)}</p>`;
  bindAnswers(unit);
}
function renderCollection(collection) {
  const options = collection.choices.map((option, index) => `<button class="learning-option" type="button" data-social-option="${index}">${escapeHtml(t(option))}</button>`).join('');
  root.innerHTML = `<a class="ghost-btn learning-back" href="${location.pathname}?audience=friends">${copy.back}</a>
    <section class="learning-unit-head"><p class="learning-eyebrow">${copy.friends}</p><h1>${escapeHtml(t(collection.title))}</h1><p>${escapeHtml(t(collection.objective))}</p></section>
    <section class="learning-facts"><div><strong>${copy.format}</strong>${escapeHtml(t(collection.format))}</div><div><strong>${copy.replay}</strong>${escapeHtml(t(collection.replay))}</div><div><strong>${copy.provenance}</strong>${escapeHtml(collection.provenance.review)}</div></section>
    <section class="learning-stage" data-stage="social"><p class="learning-eyebrow">${copy.socialOutcome}</p><h2>${escapeHtml(t(collection.prompt))}</h2><div class="learning-options">${options}</div><div class="learning-feedback" role="status" hidden></div></section>`;
  root.querySelectorAll('[data-social-option]').forEach((button) => button.addEventListener('click', () => {
    const selected = Number(button.dataset.socialOption);
    root.querySelectorAll('[data-social-option]').forEach((candidate) => {
      candidate.disabled = true;
      candidate.classList.toggle('is-correct', Number(candidate.dataset.socialOption) === collection.correct);
      candidate.classList.toggle('is-wrong', Number(candidate.dataset.socialOption) === selected && selected !== collection.correct);
    });
    const feedback = root.querySelector('.learning-feedback');
    feedback.hidden = false;
    feedback.innerHTML = `<strong>${selected === collection.correct ? copy.correct : copy.tryAgain}</strong>${escapeHtml(t(collection.explanation))}`;
  }));
}
function renderActivity(unit, item, progress) {
  const completed = progress.completed?.[item.id]; const unlocked = isUnlocked(unit, item, progress);
  if (!unlocked) {
    const previousComplete = unit.activities.slice(0, unit.activities.findIndex((candidate) => candidate.id === item.id)).every((candidate) => progress.completed?.[candidate.id]);
    return `<section class="learning-stage"><h2>${stageLabel(item.stage)}</h2><div class="learning-due"><strong>${previousComplete ? copy.due : stageLabel('practice')}</strong><br />${previousComplete ? humanDue(progress.dueAt) : copy.return}<p>${copy.return}</p></div></section>`;
  }
  const answer = progress.attempts?.[item.id]?.selected;
  const options = item.choices.map((option, index) => { const classes = answer === undefined ? '' : (index === item.correct ? ' is-correct' : index === answer ? ' is-wrong' : ''); return `<button class="learning-option${classes}" type="button" data-unit="${escapeHtml(unit.id)}" data-activity="${escapeHtml(item.id)}" data-option="${index}" ${answer === undefined ? '' : 'disabled'}>${escapeHtml(t(option))}</button>`; }).join('');
  const feedback = answer === undefined ? '' : `<div class="learning-feedback" role="status"><strong>${answer === item.correct ? copy.correct : copy.tryAgain}</strong>${escapeHtml(t(item.explanation))}</div>`;
  return `<section class="learning-stage" data-stage="${item.stage}"><p class="learning-eyebrow">${stageLabel(item.stage)}</p><h2>${escapeHtml(t(item.prompt))}</h2><div class="learning-options">${options}</div>${feedback}${completed ? '' : ''}</section>`;
}
function bindAnswers(unit) {
  root.querySelectorAll('[data-option]').forEach((button) => button.addEventListener('click', () => {
    const activity = unit.activities.find((item) => item.id === button.dataset.activity); if (!activity) return;
    const selected = Number(button.dataset.option); const now = Date.now();
    update(unit.id, (current) => { const next = structuredClone(current); next.attempts[activity.id] = { selected, answeredAt: now, correct: selected === activity.correct }; next.completed[activity.id] = { completedAt: now, outcome: selected === activity.correct ? 'correct' : 'assisted' }; if (activity.stage === 'application' && !next.dueAt) next.dueAt = now + DAY; return next; });
    renderUnit(unit);
  }));
}
function render() {
  syncLanguageLink();
  const params = new URLSearchParams(location.search);
  const collection = socialCollectionById(params.get('collection'));
  const unit = learningUnitById(params.get('unit'));
  if (collection) renderCollection(collection);
  else if (unit) renderUnit(unit);
  else renderHome();
}
render();
