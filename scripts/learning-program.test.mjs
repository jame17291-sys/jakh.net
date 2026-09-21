import assert from 'node:assert/strict';
import test from 'node:test';
import { LEARNING_PROGRAM_VERSION, LEARNING_UNITS, eligibleLearningUnits } from '../learning-data.js';

test('learning release has stable authored eligibility and bilingual activity closure', () => {
  assert.match(LEARNING_PROGRAM_VERSION, /^\d{4}-\d{2}-\d{2}\.\d+$/u);
  assert.deepEqual(eligibleLearningUnits(), LEARNING_UNITS);
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

test('learning runtime keeps the four-stage ordering and stores a real due date', async () => {
  const runtime = await import('node:fs/promises').then(({ readFile }) => readFile(new URL('../learning.js', import.meta.url), 'utf8'));
  assert.match(runtime, /slice\(0, index\).*progress\.completed/u);
  assert.match(runtime, /next\.dueAt = now \+ DAY/u);
  assert.match(runtime, /Date\.now\(\) >= progress\.dueAt/u);
  assert.match(runtime, /riddlearabia-learning-progress:/u);
});
