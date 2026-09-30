import assert from 'node:assert/strict';
import test from 'node:test';
import { emptyToolkit, normalizeToolkit, toggleActivity, planActivity, mergeWeeklyPlan, movePlannedActivity, matchesActivity, localizedKidsURL, KIDS_STORAGE_KEY } from '../kids-state.js';

const ids = new Set(['a-one', 'a-two', 'a-three', 'a-four', 'a-five', 'existing']);

test('toolkit retains only its versioned anonymous activity data', () => {
  assert.equal(KIDS_STORAGE_KEY, 'riddlearabia-kids-toolkit-v1');
  const value = normalizeToolkit({ version: 1, name: 'not retained', birthday: 'not retained', saved: ['a-one', 'a-one', 'unknown', null], completed: 'bad', planner: { mon: ['a-two'], bad: ['a-one'] } }, ids);
  assert.deepEqual(value.saved, ['a-one']);
  assert.deepEqual(value.completed, []);
  assert.deepEqual(value.planner.mon, ['a-two']);
  assert.equal('name' in value, false);
  assert.equal('birthday' in value, false);
  assert.equal('bad' in value.planner, false);
  for (const invalid of [null, [], 'bad', { version: 0 }, { version: 2 }]) assert.deepEqual(normalizeToolkit(invalid, ids), emptyToolkit());
});

test('save and completion toggles remain independent and do not change the input', () => {
  const original = emptyToolkit();
  const saved = toggleActivity(original, 'saved', 'a-one', ids);
  const complete = toggleActivity(saved, 'completed', 'a-one', ids);
  assert.deepEqual(original, emptyToolkit());
  assert.deepEqual(complete.saved, ['a-one']);
  assert.deepEqual(complete.completed, ['a-one']);
  assert.deepEqual(toggleActivity(complete, 'saved', 'a-one', ids).saved, []);
  assert.deepEqual(toggleActivity(complete, 'other', 'a-one', ids), complete);
  assert.deepEqual(toggleActivity(complete, 'saved', 'unknown', ids), complete);
});

test('planner supports multiple activities per day, deduplicates additions, and removes only the selected day', () => {
  let state = planActivity(emptyToolkit(), 'mon', 'a-one', 'add', ids);
  state = planActivity(state, 'mon', 'a-two', 'add', ids);
  state = planActivity(state, 'mon', 'a-one', 'add', ids);
  state = planActivity(state, 'tue', 'a-one', 'add', ids);
  assert.deepEqual(state.planner.mon, ['a-one', 'a-two']);
  state = planActivity(state, 'mon', 'a-one', 'remove', ids);
  assert.deepEqual(state.planner.mon, ['a-two']);
  assert.deepEqual(state.planner.tue, ['a-one']);
  assert.deepEqual(planActivity(state, '__proto__', 'a-one', 'add', ids), state);
});

test('loading a five-day curated plan merges Monday–Friday without discarding any planned activities', () => {
  const original = planActivity(planActivity(emptyToolkit(), 'mon', 'existing', 'add', ids), 'sun', 'a-five', 'add', ids);
  const plan = ['a-one', 'a-two', 'a-three', 'a-four', 'a-five'];
  const merged = mergeWeeklyPlan(original, plan, ids);
  assert.deepEqual(merged.planner.mon, ['existing', 'a-one']);
  assert.deepEqual(merged.planner.fri, ['a-five']);
  assert.deepEqual(merged.planner.sun, ['a-five']);
  assert.deepEqual(mergeWeeklyPlan(merged, plan, ids), merged);
  assert.deepEqual(original.planner.mon, ['existing']);
});

test('moving an activity changes only its chosen day, preserving other entries and avoiding destination duplicates', () => {
  let state = planActivity(emptyToolkit(), 'mon', 'a-one', 'add', ids);
  state = planActivity(state, 'mon', 'a-two', 'add', ids);
  state = planActivity(state, 'fri', 'existing', 'add', ids);
  const moved = movePlannedActivity(state, 'mon', 'fri', 'a-one', ids);
  assert.deepEqual(moved.planner.mon, ['a-two']);
  assert.deepEqual(moved.planner.fri, ['existing', 'a-one']);
  assert.deepEqual(state.planner.mon, ['a-one', 'a-two']);
  const repeated = planActivity(moved, 'mon', 'a-one', 'add', ids);
  assert.deepEqual(movePlannedActivity(repeated, 'mon', 'fri', 'a-one', ids), moved);
  assert.deepEqual(movePlannedActivity(moved, 'mon', 'sat', 'a-one', ids), moved);
  assert.deepEqual(movePlannedActivity(moved, 'fri', 'unknown', 'a-one', ids), moved);
});

test('age, learning area, time, materials and reading/adult filters intersect rather than replace each other', () => {
  const activity = { age: '3-5', area: 'logic', minutes: 10, materialGroup: 'household', format: 'hands-on', reading: 'adult-led', adult: 'together', screenFree: true, title: { en: 'Sort the colours', ar: 'صَنِّف الألوان' }, summary: { en: 'Find matching socks', ar: 'ابحث عن الجوارب المتشابهة' } };
  assert.equal(matchesActivity(activity, { age: '3-5', minutes: '10', noPrinter: true, screenFree: true, search: 'sort socks', reading: 'adult-led', adult: 'together' }), true);
  for (const filters of [{ age: '6-7' }, { minutes: '5' }, { area: 'math' }, { reading: 'independent' }, { adult: 'optional' }, { materialGroup: 'none' }]) assert.equal(matchesActivity(activity, filters), false);
  assert.equal(matchesActivity(activity, { search: 'صنف الالوان' }, 'ar'), true);
  assert.equal(matchesActivity({ ...activity, requiresPrinter: true }, { noPrinter: true }), false);
  assert.equal(matchesActivity({ ...activity, format: 'worksheet' }, { noPrinter: true }), false);
  assert.equal(matchesActivity({ ...activity, screenFree: false }, { screenFree: true }), false);
  assert.equal(matchesActivity(activity, { age: 'all', minutes: 'all', search: '' }), true);
});

test('switching language retains every active filter, shared card and anchor in both directions', () => {
  const original = 'https://riddlearabia.com/kids-riddles?age=5-6&area=language&minutes=15&materialGroup=craft&format=game&reading=early&adult=together&screenFree=1&noPrinter=1&search=colour+story&card=kids-riddles-001&lang=en#activities';
  const arabic = new URL(localizedKidsURL('/ar/topics/kids-riddles/', original));
  assert.equal(arabic.pathname, '/ar/topics/kids-riddles/');
  assert.equal(arabic.hash, '#activities');
  assert.equal(arabic.searchParams.has('lang'), false);
  const expected = new URL(original);
  expected.searchParams.delete('lang');
  assert.deepEqual([...arabic.searchParams], [...expected.searchParams]);
  const english = new URL(localizedKidsURL('/kids-riddles', arabic.href));
  assert.equal(english.pathname, '/kids-riddles');
  assert.equal(english.search, expected.search);
  assert.equal(english.hash, expected.hash);
});
