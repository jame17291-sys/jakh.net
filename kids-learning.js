import { KIDS_STORAGE_KEY, KIDS_DAYS, emptyToolkit, normalizeToolkit, toggleActivity, planActivity, mergeWeeklyPlan, movePlannedActivity, matchesActivity, localizedKidsURL } from '/kids-state.js';

const ar = document.documentElement.lang === 'ar';
const lang = ar ? 'ar' : 'en';
const t = (en, arabic) => ar ? arabic : en;
const durationText = minutes => `${minutes} ${t('min', minutes <= 10 ? 'دقائق' : 'دقيقة')}`;
const DAY_LABELS = ar ? ['الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت', 'الأحد'] : ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const FILTER_NAMES = ['search', 'age', 'area', 'minutes', 'materialGroup', 'format', 'reading', 'adult', 'screenFree', 'noPrinter'];
const PAGE_SIZE = 12;
const hubPath = ar ? '/ar/topics/kids-riddles/' : '/kids-riddles';
const activityPath = id => `${hubPath.replace(/\/$/u, '')}/activities/${encodeURIComponent(id)}/`;
const titleOf = activity => activity?.title?.[lang] || activity?.title?.en || '';
const $ = (selector, scope = document) => scope.querySelector(selector);
const $$ = (selector, scope = document) => [...scope.querySelectorAll(selector)];
let catalog = { activities: [], plans: [] };
let activityById = new Map();
let allowedIds = new Set();
let toolkit = emptyToolkit();
let storageAvailable = true;
let storageReported = false;
let shownLimit = PAGE_SIZE;
let resetDialog;
let resetOpener;
let playOpener;
let speechButton = null;
let speechGeneration = 0;

function element(tag, options = {}, children = []) {
  const result = document.createElement(tag);
  for (const [key, value] of Object.entries(options)) {
    if (key === 'text') result.textContent = value;
    else if (key === 'class') result.className = value;
    else if (key === 'dataset') Object.assign(result.dataset, value);
    else if (value !== null && value !== undefined) result.setAttribute(key, String(value));
  }
  for (const child of children) result.append(child);
  return result;
}

function announce(message) {
  let status = $('[data-kids-status]');
  if (!status) {
    status = element('p', { class: 'kids-status kids-visually-hidden', role: 'status', 'aria-live': 'polite', 'aria-atomic': 'true', dataset: { kidsStatus: '' } });
    document.body.append(status);
  }
  status.textContent = message;
}

function storageNote() {
  const note = t('Saving on this device is unavailable. You can keep using the toolkit in this tab; changes will be lost when you leave.', 'الحفظ على هذا الجهاز غير متاح. يمكنك استخدام الأدوات في هذه الصفحة، لكن تغييراتك لن تبقى بعد مغادرتها.');
  for (const mount of $$('[data-kids-storage-note]')) mount.textContent = storageAvailable
    ? t('Saved in this browser on this device. No child names or personal details are needed. Clearing browser data removes your toolkit.', 'يُحفظ في هذا المتصفح على هذا الجهاز، دون أسماء الأطفال أو بياناتهم الشخصية. يؤدي مسح بيانات المتصفح إلى إزالة أدواتك المحفوظة.') : note;
  if (!storageAvailable && !storageReported) {
    storageReported = true;
    const region = $('[data-kids-planner]')?.closest('.kids-toolkit') || $('.kids-toolkit') || $('.kids-activity-sidebar');
    if (region && !$('[data-kids-storage-note]', region)) region.prepend(element('p', { class: 'kids-note', role: 'status', text: note, dataset: { kidsStorageNote: '' } }));
    announce(note);
  }
}

function loadToolkit() {
  try {
    const raw = localStorage.getItem(KIDS_STORAGE_KEY);
    if (raw) {
      try { toolkit = normalizeToolkit(JSON.parse(raw), allowedIds); }
      catch { toolkit = emptyToolkit(); }
    }
  } catch { storageAvailable = false; }
  storageNote();
}

function persist(message) {
  if (storageAvailable) {
    try { localStorage.setItem(KIDS_STORAGE_KEY, JSON.stringify(toolkit)); }
    catch { storageAvailable = false; }
  }
  renderToolkit();
  if (storageAvailable) announce(message);
  else {
    storageNote();
    announce(`${message} ${t('This change is only kept in the current tab.', 'يبقى هذا التغيير في الصفحة المفتوحة فقط.')}`);
  }
}

function button(text, dataset, extra = {}) {
  return element('button', { type: 'button', class: 'kids-button secondary', text, dataset, ...extra });
}

function daySelect(id, value = KIDS_DAYS[(new Date().getDay() + 6) % 7]) {
  const select = element('select', { dataset: { kidsDay: id, kidsFocus: `day-${id}` }, 'aria-label': t(`Choose a day for ${titleOf(activityById.get(id))}`, `اختر يومًا لنشاط ${titleOf(activityById.get(id))}`) });
  KIDS_DAYS.forEach((day, index) => select.append(element('option', { value: day, text: DAY_LABELS[index] })));
  select.value = value;
  return select;
}

function keepFocus(fn) {
  const active = document.activeElement;
  const key = active?.dataset?.kidsFocus;
  const day = active?.closest('[data-kids-planner-day]')?.dataset.kidsPlannerDay;
  const inSaved = Boolean(active?.closest('[data-kids-saved-list]'));
  fn();
  if (key && !active.isConnected) {
    const replacement = $$('[data-kids-focus]').find(node => node.dataset.kidsFocus === key)
      || (day && $$('[data-kids-planner-day]').find(node => node.dataset.kidsPlannerDay === day)?.querySelector('h3'))
      || (inSaved && $('[data-kids-saved-list]'));
    if (replacement) {
      if (!replacement.matches('button, select, input, a')) replacement.setAttribute('tabindex', '-1');
      replacement.focus({ preventScroll: true });
    }
  }
}

function renderSaved() {
  for (const mount of $$('[data-kids-saved-list]')) {
    const selectedDays = new Map($$('select[data-kids-day]', mount).map(select => [select.dataset.kidsDay, select.value]));
    mount.replaceChildren();
    if (!toolkit.saved.length) {
      mount.append(element('p', { class: 'kids-note', text: t('Save activities you would like to try. They will appear here.', 'احفظ الأنشطة التي ترغب في تجربتها لتجدها هنا.') }));
      continue;
    }
    const list = element('ul', { class: 'kids-saved-items' });
    for (const id of toolkit.saved) {
      const activity = activityById.get(id);
      if (!activity) continue;
      const controls = element('div', { class: 'kids-card-actions' }, [
        daySelect(id, selectedDays.get(id)),
        button(t('Add to day', 'أضف إلى اليوم'), { kidsAdd: id, kidsFocus: `add-${id}` }),
        button(t('Remove saved', 'أزل من المحفوظات'), { kidsSave: id, kidsFocus: `saved-${id}`, kidsSaveCompact: 'true' }, { 'aria-label': t(`Remove ${titleOf(activity)} from saved activities`, `أزل ${titleOf(activity)} من الأنشطة المحفوظة`) }),
      ]);
      list.append(element('li', { class: 'kids-saved-item' }, [element('a', { href: activityPath(id), text: titleOf(activity) }), controls]));
    }
    mount.append(list);
  }
}

function renderPlanner() {
  for (const mount of $$('[data-kids-planner]')) {
    mount.replaceChildren();
    for (const [index, day] of KIDS_DAYS.entries()) {
      const heading = element('h3', { text: DAY_LABELS[index], tabindex: '-1' });
      const section = element('section', { class: 'kids-planner-day', 'aria-label': DAY_LABELS[index], dataset: { kidsPlannerDay: day } }, [heading]);
      const list = element('ul', { class: 'kids-planner-items' });
      for (const id of toolkit.planner[day]) {
        const activity = activityById.get(id);
        if (!activity) continue;
        const done = toolkit.completed.includes(id);
        const moveSelect = element('select', { 'aria-label': t(`Move ${titleOf(activity)} from ${DAY_LABELS[index]} to`, `انقل ${titleOf(activity)} من يوم ${DAY_LABELS[index]} إلى`), dataset: { kidsMoveSelect: `${day}:${id}`, kidsFocus: `move-day-${day}-${id}` } });
        KIDS_DAYS.forEach((targetDay, targetIndex) => moveSelect.append(element('option', { value: targetDay, text: DAY_LABELS[targetIndex] })));
        moveSelect.value = day;
        list.append(element('li', { class: `kids-planner-item${done ? ' is-complete' : ''}` }, [
          element('a', { href: activityPath(id), text: titleOf(activity) }),
          element('span', { class: 'kids-planner-duration', text: durationText(activity.minutes) }),
          element('div', { class: 'kids-planner-controls' }, [
            moveSelect,
            button(t('Move', 'نقل'), { kidsMove: id, kidsMoveFrom: day, kidsFocus: `move-${day}-${id}` }),
            button(done ? t('Completed', 'مكتمل') : t('Mark complete', 'حدّد كمكتمل'), { kidsComplete: id, kidsFocus: `complete-${day}-${id}` }, { 'aria-pressed': done, 'aria-label': `${done ? t('Undo completion:', 'ألغِ الاكتمال:') : t('Complete:', 'أكمل:')} ${titleOf(activity)}` }),
            button(t('Remove', 'إزالة'), { kidsRemove: id, kidsRemoveDay: day, kidsFocus: `remove-${day}-${id}` }, { 'aria-label': t(`Remove ${titleOf(activity)} from ${DAY_LABELS[index]}`, `أزل ${titleOf(activity)} من يوم ${DAY_LABELS[index]}`) }),
          ]),
        ]));
      }
      if (list.children.length) section.append(list);
      else section.append(element('p', { class: 'kids-planner-empty', text: t('A little room to explore.', 'مساحة صغيرة للاكتشاف.') }));
      mount.append(section);
    }
  }
}

function renderToolkit() {
  keepFocus(() => { renderSaved(); renderPlanner(); });
  for (const control of $$('[data-kids-save]')) {
    const saved = toolkit.saved.includes(control.dataset.kidsSave);
    control.setAttribute('aria-pressed', String(saved));
    if (!control.dataset.kidsSaveCompact) control.textContent = saved ? t('Saved', 'محفوظ') : t('Save activity', 'احفظ النشاط');
  }
  for (const control of $$('[data-kids-complete]')) {
    const completed = toolkit.completed.includes(control.dataset.kidsComplete);
    control.setAttribute('aria-pressed', String(completed));
    control.textContent = completed ? t('Completed', 'مكتمل') : t('Mark complete', 'حدّد كمكتمل');
  }
  for (const mount of $$('[data-kids-completed-count]')) mount.textContent = String(toolkit.completed.length);
  for (const mount of $$('[data-kids-saved-count]')) mount.textContent = String(toolkit.saved.length);
  for (const mount of $$('[data-kids-planned-count]')) mount.textContent = String(Object.values(toolkit.planner).reduce((sum, activities) => sum + activities.length, 0));
}

function filterFields() { return $$('[data-kids-filters] [name]').filter(field => FILTER_NAMES.includes(field.name)); }

function defaultFilterValue(field) {
  if (field.type === 'checkbox') return field.defaultChecked;
  if (field.tagName === 'SELECT') return [...field.options].find(option => option.defaultSelected)?.value || (field.options[0]?.value ?? '');
  return field.defaultValue || '';
}

function filtersFromForm() {
  return Object.fromEntries(filterFields().map(field => [field.name, field.type === 'checkbox' ? field.checked : field.value]));
}

function syncLanguageLinks() {
  for (const link of $$('a[data-kids-language]')) {
    link.href = localizedKidsURL(link.href, location.href);
  }
}

function filtersFromURL() {
  const params = new URLSearchParams(location.search);
  for (const field of filterFields()) {
    if (field.type === 'checkbox') field.checked = params.has(field.name) ? ['1', 'true'].includes(params.get(field.name)) : defaultFilterValue(field);
    else if (field.tagName === 'SELECT') {
      const value = params.has(field.name) ? params.get(field.name) : defaultFilterValue(field);
      field.value = [...field.options].some(option => option.value === value) ? value : defaultFilterValue(field);
    } else field.value = params.get(field.name) || defaultFilterValue(field);
  }
}

function applyFilters(updateURL = true) {
  const fields = filterFields();
  if (!fields.length) return;
  const filters = filtersFromForm();
  const routeScope = location.pathname.match(/\/(ages|areas)\/([^/]+)\/?$/u);
  if (routeScope && filters[routeScope[1] === 'ages' ? 'age' : 'area'] !== routeScope[2]) {
    const target = new URL(`${hubPath.replace(/\/$/u, '')}/activities/`, location.origin);
    for (const [name, value] of Object.entries(filters)) if (value && value !== 'all') target.searchParams.set(name, value === true ? '1' : value);
    target.hash = 'activities';
    location.assign(target.href);
    return;
  }
  const matches = [];
  for (const card of $$('[data-activity-card]')) {
    const id = card.dataset.activityId || card.dataset.activityCard;
    const activity = activityById.get(id);
    const match = Boolean(activity && matchesActivity(activity, filters, lang));
    if (match) matches.push(card);
    card.hidden = !match || matches.length > shownLimit;
  }
  const visible = Math.min(matches.length, shownLimit);
  const description = t(`Showing ${visible} of ${matches.length} activities`, `عرض ${visible} من ${matches.length} نشاطًا`);
  for (const mount of $$('[data-kids-count]')) {
    mount.setAttribute('role', 'status');
    mount.setAttribute('aria-live', 'polite');
    mount.setAttribute('aria-atomic', 'true');
    mount.textContent = description;
  }
  for (const mount of $$('[data-kids-empty]')) mount.hidden = matches.length !== 0;
  for (const more of $$('[data-kids-more]')) {
    more.hidden = matches.length <= shownLimit;
    more.textContent = t(`Show ${Math.max(0, Math.min(PAGE_SIZE, matches.length - visible))} more activities`, `اعرض ${Math.max(0, Math.min(PAGE_SIZE, matches.length - visible))} أنشطة أخرى`);
  }
  if (updateURL) {
    const url = new URL(location.href);
    for (const name of FILTER_NAMES) {
      const value = filters[name];
      if (!value || value === 'all') url.searchParams.delete(name);
      else url.searchParams.set(name, value === true ? '1' : value);
    }
    try { history.replaceState(null, '', url); } catch { /* Filters still work when history is restricted. */ }
  }
  syncLanguageLinks();
}

function makeResetDialog() {
  const title = element('h2', { id: 'kids-reset-title', text: t('Clear this kids toolkit?', 'هل تريد مسح أدوات الأطفال؟') });
  const description = element('p', { id: 'kids-reset-description', text: t('This removes saved activities, completed activities and the weekly plan from this browser. Your other Riddle Arabia progress stays as it is.', 'سيؤدي هذا إلى إزالة الأنشطة المحفوظة والمكتملة والخطة الأسبوعية من هذا المتصفح. سيبقى تقدّمك الآخر في ريدل أرابيا كما هو.') });
  const cancel = button(t('Keep my toolkit', 'احتفظ بأدواتي'), { kidsCancelReset: '' });
  const confirm = button(t('Clear toolkit', 'امسح الأدوات'), { kidsConfirmReset: '' }, { class: 'kids-button kids-button-danger' });
  resetDialog = element('dialog', { class: 'kids-dialog', 'aria-labelledby': title.id, 'aria-describedby': description.id }, [title, description, element('div', { class: 'kids-actions' }, [cancel, confirm])]);
  document.body.append(resetDialog);
  resetDialog.addEventListener('close', () => resetOpener?.focus({ preventScroll: true }));
  cancel.addEventListener('click', () => resetDialog.close());
  confirm.addEventListener('click', () => {
    toolkit = emptyToolkit();
    try { localStorage.removeItem(KIDS_STORAGE_KEY); }
    catch { storageAvailable = false; }
    renderToolkit();
    resetDialog.close();
    announce(t('Your kids toolkit has been cleared on this device.', 'تم مسح أدوات الأطفال على هذا الجهاز.'));
    storageNote();
  });
}

function togglePlayTogether(force) {
  const enabled = typeof force === 'boolean' ? force : !document.body.classList.contains('kids-play-together');
  document.body.classList.toggle('kids-play-together', enabled);
  let bar = $('.kids-focus-bar');
  if (!bar) {
    bar = element('div', { class: 'kids-focus-bar', hidden: '' }, [
      element('span', { text: t('A little time to play together', 'وقت صغير للّعب معًا') }),
      button(t('Back to parent view', 'العودة إلى عرض الوالدين'), { kidsExitTogether: '' }),
    ]);
    document.body.prepend(bar);
  }
  bar.hidden = !enabled;
  $$('[data-kids-play-together]').forEach(control => control.setAttribute('aria-pressed', String(enabled)));
  if (enabled) {
    playOpener = document.activeElement;
    $('button', bar).focus({ preventScroll: true });
  } else if (playOpener?.isConnected) playOpener.focus({ preventScroll: true });
  announce(enabled ? t('Play together view. Press Escape to return to the parent view.', 'عرض اللعب معًا. اضغط Escape للعودة إلى عرض الوالدين.') : t('Parent view restored.', 'عدت إلى عرض الوالدين.'));
}

function stopSpeech() {
  speechGeneration += 1;
  try { window.speechSynthesis?.cancel(); } catch { /* Speech support varies by browser. */ }
  if (speechButton) {
    speechButton.setAttribute('aria-pressed', 'false');
    speechButton.textContent = speechButton.dataset.kidsSpeakLabel || t('Read aloud', 'اقرأ بصوت عالٍ');
    speechButton = null;
  }
}

async function readAloud(control) {
  if (control === speechButton) { stopSpeech(); return; }
  stopSpeech();
  if (!('speechSynthesis' in window) || !('SpeechSynthesisUtterance' in window)) {
    announce(t('Read aloud is unavailable in this browser. The activity is ready for an adult to read together.', 'القراءة الصوتية غير متاحة في هذا المتصفح. يمكن لأحد الكبار قراءة النشاط مع الطفل.'));
    return;
  }
  const region = (control.dataset.kidsReadTarget && document.getElementById(control.dataset.kidsReadTarget)) || control.closest('[data-kids-read]') || $('[data-kids-read]');
  if (!region) return;
  const copy = region.cloneNode(true);
  $$('button, nav, select, [hidden], details:not([open]), [aria-hidden="true"]', copy).forEach(node => node.remove());
  const content = copy.textContent.replace(/\s+/gu, ' ').trim();
  if (!content) return;
  const generation = speechGeneration;
  let voices = window.speechSynthesis.getVoices();
  if (!voices.length) {
    await new Promise(resolve => {
      const timeout = setTimeout(done, 700);
      function done() { clearTimeout(timeout); window.speechSynthesis.removeEventListener('voiceschanged', done); resolve(); }
      window.speechSynthesis.addEventListener('voiceschanged', done, { once: true });
    });
    if (generation !== speechGeneration) return;
    voices = window.speechSynthesis.getVoices();
  }
  const voice = voices.find(candidate => candidate.lang.toLowerCase().startsWith(lang) && candidate.localService)
    || voices.find(candidate => candidate.lang.toLowerCase().startsWith(lang));
  if (ar && voices.length && !voice) {
    announce('لا يتوفر صوت عربي على هذا الجهاز. أضف صوتًا عربيًا من إعدادات الجهاز، أو اقرأوا النص معًا.');
    return;
  }
  const utterance = new SpeechSynthesisUtterance(content);
  utterance.lang = ar ? 'ar-SA' : 'en-US';
  if (voice) utterance.voice = voice;
  utterance.rate = ar ? 0.85 : 0.9;
  control.dataset.kidsSpeakLabel ||= control.textContent;
  speechButton = control;
  control.setAttribute('aria-pressed', 'true');
  control.textContent = t('Stop reading', 'أوقف القراءة');
  utterance.onend = () => { if (generation === speechGeneration) stopSpeech(); };
  utterance.onerror = event => {
    if (generation !== speechGeneration) return;
    stopSpeech();
    if (!['interrupted', 'canceled'].includes(event.error)) announce(t('The voice could not play. You can read the activity together, or try another browser voice.', 'تعذّر تشغيل الصوت. يمكنكم قراءة النشاط معًا أو تجربة صوت آخر على الجهاز.'));
  };
  try { window.speechSynthesis.speak(utterance); }
  catch { stopSpeech(); announce(t('Read aloud is unavailable right now.', 'القراءة الصوتية غير متاحة الآن.')); }
}

function printPlanner() {
  $('#kids-print-sheet')?.remove();
  const sheet = element('section', { id: 'kids-print-sheet', class: 'kids-print-sheet', lang, dir: ar ? 'rtl' : 'ltr' }, [
    element('p', { class: 'kids-eyebrow', text: 'Riddle Arabia' }),
    element('h1', { text: t('Our week of little discoveries', 'أسبوعنا من الاكتشافات الصغيرة') }),
    element('p', { text: t('A flexible family plan. Move, repeat or skip an activity whenever you need.', 'خطة مرنة للعائلة. يمكن تغيير ترتيب الأنشطة أو تكرارها أو ترك بعضها حسب الحاجة.') }),
  ]);
  for (const [index, day] of KIDS_DAYS.entries()) {
    const section = element('section', {}, [element('h2', { text: DAY_LABELS[index] })]);
    if (!toolkit.planner[day].length) section.append(element('p', { text: t('Room for your own idea:', 'مساحة لفكرتكم:') + ' __________________________' }));
    for (const id of toolkit.planner[day]) {
      const activity = activityById.get(id);
      if (!activity) continue;
      section.append(element('h3', { text: `${toolkit.completed.includes(id) ? '✓' : '□'} ${titleOf(activity)} · ${durationText(activity.minutes)}` }));
      section.append(element('p', { text: activity.summary?.[lang] || '' }));
      section.append(element('p', { class: 'kids-print-url', text: new URL(activityPath(id), location.origin).href }));
    }
    sheet.append(section);
  }
  document.body.append(sheet);
  document.body.classList.add('kids-printing-plan');
  requestAnimationFrame(() => {
    try { window.print(); }
    catch { document.body.classList.remove('kids-printing-plan'); announce(t('Printing is unavailable in this browser.', 'الطباعة غير متاحة في هذا المتصفح.')); }
  });
}

function bindEvents() {
  for (const form of $$('[data-kids-filters]')) {
    form.addEventListener('submit', event => event.preventDefault());
    form.addEventListener('input', event => {
      if (!FILTER_NAMES.includes(event.target.name)) return;
      shownLimit = PAGE_SIZE;
      applyFilters();
    });
    form.addEventListener('change', event => {
      if (!FILTER_NAMES.includes(event.target.name)) return;
      shownLimit = PAGE_SIZE;
      applyFilters();
    });
  }
  document.addEventListener('click', event => {
    const control = event.target.closest('button, a');
    if (!control) return;
    const data = control.dataset;
    if ('kidsResetFilters' in data) {
      for (const field of filterFields()) {
        if (field.type === 'checkbox') field.checked = defaultFilterValue(field);
        else field.value = defaultFilterValue(field);
      }
      shownLimit = PAGE_SIZE;
      applyFilters();
      announce(t('Filters cleared.', 'تمت إزالة عوامل التصفية.'));
    } else if ('kidsMore' in data) {
      const previouslyVisible = $$('[data-activity-card]').filter(card => !card.hidden).length;
      shownLimit += PAGE_SIZE;
      applyFilters(false);
      const next = $$('[data-activity-card]').filter(card => !card.hidden)[previouslyVisible];
      const focus = next?.querySelector('a[href], button') || next;
      if (focus) { if (focus === next) focus.tabIndex = -1; focus.focus({ preventScroll: true }); }
      announce(t('More activities are ready to explore.', 'أنشطة إضافية جاهزة للاكتشاف.'));
    } else if ('kidsSave' in data && allowedIds.has(data.kidsSave)) {
      toolkit = toggleActivity(toolkit, 'saved', data.kidsSave, allowedIds);
      persist(toolkit.saved.includes(data.kidsSave) ? t('Activity saved.', 'تم حفظ النشاط.') : t('Activity removed from saved.', 'تمت إزالة النشاط من المحفوظات.'));
    } else if ('kidsComplete' in data && allowedIds.has(data.kidsComplete)) {
      toolkit = toggleActivity(toolkit, 'completed', data.kidsComplete, allowedIds);
      persist(toolkit.completed.includes(data.kidsComplete) ? t('Activity marked complete. Lovely exploring!', 'تم تحديد النشاط كمكتمل. اكتشاف جميل!') : t('Completion undone.', 'تم إلغاء تحديد الاكتمال.'));
    } else if ('kidsAdd' in data && allowedIds.has(data.kidsAdd)) {
      const nearby = control.closest('.kids-card-actions, .kids-saved-item, .kids-panel, .kids-activity-sidebar') || control.parentElement;
      const select = $$('[data-kids-day]', nearby).find(node => node.dataset.kidsDay === data.kidsAdd)
        || $$('[data-kids-day]').find(node => node.dataset.kidsDay === data.kidsAdd);
      const day = select?.value || KIDS_DAYS[(new Date().getDay() + 6) % 7];
      toolkit = planActivity(toolkit, day, data.kidsAdd, 'add', allowedIds);
      persist(t(`Added to ${DAY_LABELS[KIDS_DAYS.indexOf(day)]}.`, `تمت الإضافة إلى يوم ${DAY_LABELS[KIDS_DAYS.indexOf(day)]}.`));
    } else if ('kidsMove' in data && allowedIds.has(data.kidsMove)) {
      const select = $$('[data-kids-move-select]').find(node => node.dataset.kidsMoveSelect === `${data.kidsMoveFrom}:${data.kidsMove}`);
      const day = select?.value;
      if (!KIDS_DAYS.includes(day)) return;
      if (day === data.kidsMoveFrom) { announce(t('Choose another day to move this activity.', 'اختر يومًا آخر لنقل هذا النشاط.')); return; }
      toolkit = movePlannedActivity(toolkit, data.kidsMoveFrom, day, data.kidsMove, allowedIds);
      persist(t(`Moved to ${DAY_LABELS[KIDS_DAYS.indexOf(day)]}.`, `تم النقل إلى يوم ${DAY_LABELS[KIDS_DAYS.indexOf(day)]}.`));
    } else if ('kidsRemove' in data && allowedIds.has(data.kidsRemove)) {
      toolkit = planActivity(toolkit, data.kidsRemoveDay, data.kidsRemove, 'remove', allowedIds);
      persist(t('Removed from this day.', 'تمت الإزالة من هذا اليوم.'));
    } else if ('kidsLoadPlan' in data) {
      const plan = catalog.plans.find(item => item.id === data.kidsLoadPlan);
      if (plan) {
        toolkit = mergeWeeklyPlan(toolkit, plan.activityIds, allowedIds);
        persist(t('Five activities added to Monday–Friday. Your existing plan is still there.', 'أُضيفت خمسة أنشطة من الاثنين إلى الجمعة مع الاحتفاظ بأنشطتك السابقة.'));
      }
    } else if ('kidsPrintPlan' in data) printPlanner();
    else if ('kidsResetToolkit' in data) {
      resetOpener = control;
      if (!resetDialog) makeResetDialog();
      resetDialog.showModal();
      $('[data-kids-cancel-reset]', resetDialog).focus();
    } else if ('kidsPlayTogether' in data) togglePlayTogether();
    else if ('kidsExitTogether' in data) togglePlayTogether(false);
    else if ('kidsSpeak' in data) void readAloud(control);
    else if ('kidsStopSpeech' in data) stopSpeech();
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && !resetDialog?.open && document.body.classList.contains('kids-play-together')) togglePlayTogether(false);
  });
  window.addEventListener('popstate', () => { filtersFromURL(); shownLimit = PAGE_SIZE; applyFilters(false); syncLanguageLinks(); });
  window.addEventListener('storage', event => {
    if (event.key !== KIDS_STORAGE_KEY && event.key !== null) return;
    try { toolkit = normalizeToolkit(event.newValue ? JSON.parse(event.newValue) : emptyToolkit(), allowedIds); }
    catch { toolkit = emptyToolkit(); }
    renderToolkit();
  });
  window.addEventListener('pagehide', stopSpeech);
  window.addEventListener('afterprint', () => document.body.classList.remove('kids-printing-plan'));
}

async function initialize() {
  if (!document.body.classList.contains('kids-page')) return;
  syncLanguageLinks();
  try {
    const response = await fetch('/data/kids/catalog.json', { credentials: 'same-origin' });
    if (!response.ok) throw new Error('Kids catalog unavailable');
    const data = await response.json();
    if (!Array.isArray(data.activities) || !Array.isArray(data.plans)) throw new Error('Invalid kids catalog');
    catalog = data;
    const legacy = Array.isArray(catalog.legacy) ? catalog.legacy : [];
    const legacyId = new URLSearchParams(location.search).get('card');
    if (legacyId && legacy.some(card => card.id === legacyId)
      && ['/kids-riddles', '/kids-riddles/', '/ar/topics/kids-riddles/'].includes(location.pathname)) {
      location.replace(`${hubPath.replace(/\/$/u, '')}/riddles/#${encodeURIComponent(legacyId)}`);
      return;
    }
    activityById = new Map(catalog.activities.map(activity => [activity.id, activity]));
    allowedIds = new Set(activityById.keys());
    loadToolkit();
    renderToolkit();
    filtersFromURL();
    applyFilters(false);
    bindEvents();
    if (location.hash && location.pathname.endsWith('/riddles/')) {
      let id;
      try { id = decodeURIComponent(location.hash.slice(1)); } catch { id = ''; }
      const card = id && document.getElementById(id);
      if (card && legacy.some(item => item.id === id)) {
        for (const detail of $$('details', card)) detail.open = true;
        if (card.matches('details')) card.open = true;
        const heading = card.querySelector('h2, h3, summary') || card;
        heading.tabIndex = -1;
        heading.focus({ preventScroll: true });
        card.scrollIntoView({ block: 'start', behavior: 'instant' });
      }
    }
    document.body.classList.add('kids-ready');
  } catch {
    for (const control of $$('[data-kids-filters] input, [data-kids-filters] select, [data-kids-save], [data-kids-complete], [data-kids-add], [data-kids-load-plan], [data-kids-reset-toolkit], [data-kids-print-plan]')) control.disabled = true;
    announce(t('The activity tools could not load. All activities and instructions below are still available. Reload to try saving and filtering again.', 'تعذّر تحميل أدوات الأنشطة. لا تزال الأنشطة وتعليماتها متاحة أدناه. أعد تحميل الصفحة لتجربة الحفظ والتصفية من جديد.'));
    for (const mount of $$('[data-kids-count]')) mount.textContent = t('Browse all activities below.', 'تصفّح جميع الأنشطة أدناه.');
  }
}

void initialize();
