export const KIDS_STORAGE_KEY = 'riddlearabia-kids-toolkit-v1';
export const KIDS_STATE_VERSION = 1;
export const KIDS_DAYS = Object.freeze(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']);

export function emptyToolkit() {
  return { version: KIDS_STATE_VERSION, saved: [], completed: [], planner: Object.fromEntries(KIDS_DAYS.map(day => [day, []])) };
}

function validIds(values, allowedIds) {
  if (!Array.isArray(values)) return [];
  return [...new Set(values.filter(id => typeof id === 'string' && /^[a-z0-9][a-z0-9-]{0,95}$/u.test(id)
    && (!allowedIds || allowedIds.has(id))))].slice(0, 2000);
}

export function normalizeToolkit(value, allowedIds) {
  const result = emptyToolkit();
  if (!value || typeof value !== 'object' || value.version !== KIDS_STATE_VERSION) return result;
  result.saved = validIds(value.saved, allowedIds);
  result.completed = validIds(value.completed, allowedIds);
  for (const day of KIDS_DAYS) result.planner[day] = validIds(value.planner?.[day], allowedIds);
  return result;
}

export function toggleActivity(state, collection, id, allowedIds) {
  const next = normalizeToolkit(state, allowedIds);
  if (!['saved', 'completed'].includes(collection) || !validIds([id], allowedIds).length) return next;
  next[collection] = next[collection].includes(id) ? next[collection].filter(item => item !== id) : [...next[collection], id];
  return next;
}

export function planActivity(state, day, id, action = 'add', allowedIds) {
  const next = normalizeToolkit(state, allowedIds);
  if (!KIDS_DAYS.includes(day) || !validIds([id], allowedIds).length) return next;
  if (action === 'remove') next.planner[day] = next.planner[day].filter(item => item !== id);
  else if (action === 'add' && !next.planner[day].includes(id)) next.planner[day].push(id);
  return next;
}

export function mergeWeeklyPlan(state, activityIds, allowedIds) {
  return (Array.isArray(activityIds) ? activityIds.slice(0, 5) : []).reduce(
    (next, id, index) => planActivity(next, KIDS_DAYS[index], id, 'add', allowedIds), normalizeToolkit(state, allowedIds),
  );
}

export function movePlannedActivity(state, fromDay, toDay, id, allowedIds) {
  const next = normalizeToolkit(state, allowedIds);
  if (!KIDS_DAYS.includes(fromDay) || !KIDS_DAYS.includes(toDay) || fromDay === toDay || !next.planner[fromDay].includes(id)) return next;
  return planActivity(planActivity(next, fromDay, id, 'remove', allowedIds), toDay, id, 'add', allowedIds);
}

export function normalizedSearch(value) {
  return String(value || '').normalize('NFKD').replace(/[\u0640\u064b-\u065f\u0670\u0300-\u036f]/gu, '')
    .replace(/[أإآٱ]/gu, 'ا').toLocaleLowerCase().trim();
}

export function localizedKidsURL(targetHref, currentHref) {
  const current = new URL(currentHref);
  const target = new URL(targetHref, current);
  target.search = current.search;
  target.searchParams.delete('lang');
  target.hash = current.hash;
  return target.href;
}

function matchesChoice(value, filter) {
  return !filter || filter === 'all' || (Array.isArray(value) ? value.map(String).includes(filter) : String(value) === filter);
}

export function matchesActivity(activity, filters = {}, lang = 'en') {
  if (!activity) return false;
  for (const key of ['age', 'area', 'materialGroup', 'format', 'reading', 'adult']) {
    if (!matchesChoice(activity[key], filters[key])) return false;
  }
  const maxMinutes = Number(filters.minutes);
  if (filters.minutes && filters.minutes !== 'all' && Number.isFinite(maxMinutes) && Number(activity.minutes) > maxMinutes) return false;
  if (filters.screenFree && activity.screenFree !== true) return false;
  const needsPrinter = activity.requiresPrinter === true || /^(?:print|printer|printable|worksheet)s?$/iu.test(activity.materialGroup || '')
    || /^(?:printable|worksheet)s?$/iu.test(activity.format || '');
  if (filters.noPrinter && needsPrinter) return false;
  const query = normalizedSearch(filters.search);
  if (!query) return true;
  const text = normalizedSearch(`${activity.title?.[lang] || ''} ${activity.summary?.[lang] || ''}`);
  return query.split(/\s+/u).every(word => text.includes(word));
}
