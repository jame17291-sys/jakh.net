import assert from 'node:assert/strict';
import test from 'node:test';
import { LEARNING_PROGRAM_VERSION, LEARNING_UNITS, SOCIAL_COLLECTIONS, eligibleLearningUnits, eligibleSocialCollections } from '../learning-data.js';

test('learning release has stable authored eligibility and bilingual activity closure', () => {
  assert.match(LEARNING_PROGRAM_VERSION, /^\d{4}-\d{2}-\d{2}\.\d+$/u);
  assert.deepEqual(eligibleLearningUnits(), LEARNING_UNITS);
  assert.equal(LEARNING_UNITS.length, 21, 'the bounded release contains 21 units');
  assert.equal(LEARNING_UNITS.filter((unit) => unit.audience === 'university').length, 12);
  for (const pathway of ['quantitative', 'evidence', 'digital-ai', 'study']) {
    assert.equal(LEARNING_UNITS.filter((unit) => unit.pathway === pathway).length, 3, pathway);
  }
  for (const band of ['children-6-8', 'children-9-11', 'children-12-14']) {
    assert.equal(LEARNING_UNITS.filter((unit) => unit.audience === band).length, 3, band);
  }
  for (const unit of LEARNING_UNITS) {
    assert.equal(unit.publication.status, 'eligible-authored-learning-release', unit.id);
    assert.equal(unit.provenance.humanApproval, false, unit.id);
    assert.ok(unit.title.en && unit.title.ar && unit.objective.en && unit.objective.ar, unit.id);
    assert.deepEqual(unit.activities.map(({ stage }) => stage), ['practice', 'practice', 'application', 'retrieval'], unit.id);
    for (const item of unit.activities) {
      assert.ok(item.prompt.en && item.prompt.ar && item.explanation.en && item.explanation.ar, `${unit.id}/${item.id}`);
      assert.equal(item.choices.length, 4, `${unit.id}/${item.id}`);
      assert.ok(Number.isInteger(item.correct) && item.correct >= 0 && item.correct < item.choices.length, `${unit.id}/${item.id}`);
      for (const option of item.choices) assert.ok(option.en && option.ar, `${unit.id}/${item.id}`);
    }
  }
});

test('social challenge collections are first-class bilingual authored content', () => {
  assert.equal(SOCIAL_COLLECTIONS.length, 6);
  assert.deepEqual(eligibleSocialCollections(), SOCIAL_COLLECTIONS);
  for (const collection of SOCIAL_COLLECTIONS) {
    assert.equal(collection.audience, 'friends', collection.id);
    assert.equal(collection.publication.status, 'eligible-authored-learning-release', collection.id);
    assert.equal(collection.provenance.humanApproval, false, collection.id);
    assert.ok(collection.title.en && collection.title.ar, collection.id);
    assert.ok(collection.objective.en && collection.objective.ar, collection.id);
    assert.ok(collection.format.en && collection.format.ar, collection.id);
    assert.ok(collection.replay.en && collection.replay.ar, collection.id);
    assert.equal(collection.choices.length, 4, collection.id);
    assert.ok(Number.isInteger(collection.correct) && collection.correct >= 0 && collection.correct < collection.choices.length, collection.id);
    for (const option of collection.choices) assert.ok(option.en && option.ar, collection.id);
  }
});

test('learning runtime keeps the four-stage ordering and stores a real due date', async () => {
  const runtime = await import('node:fs/promises').then(({ readFile }) => readFile(new URL('../learning.js', import.meta.url), 'utf8'));
  assert.match(runtime, /slice\(0, index\).*progress\.completed/u);
  assert.match(runtime, /next\.dueAt = now \+ DAY/u);
  assert.match(runtime, /Date\.now\(\) >= progress\.dueAt/u);
  assert.match(runtime, /riddlearabia-learning-progress:/u);
  assert.match(runtime, /renderSocialHome/u);
  assert.match(runtime, /socialCollectionById/u);
});
