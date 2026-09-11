import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
const searchLeaderboard = fs.readFileSync(path.join(root, 'search-leaderboard.js'), 'utf8');
const productSource = `${app}\n${searchLeaderboard}`;
test('public question and challenge views never display editorial-status metadata', () => {
  assert.doesNotMatch(app, /reviewStatus(?:Reviewed|Pending)|reviewSafetyPending/u);
  assert.doesNotMatch(app, /createReviewMarkup|card-review/u);
  assert.doesNotMatch(searchLeaderboard, /createReviewMarkup|verifiedReviewUnavailable|allReviewMetadataSupplied/u);
  assert.doesNotMatch(productSource, /editorial(?:ly)?|مراجعة تحريرية/u);
  assert.doesNotMatch(app, /c\.review\?\.status|dailyEligible/u);
});

test('server scoring remains explicitly scoped to automatic answer checking', () => {
  assert.match(searchLeaderboard, /Number\(category\.scorableQuestionCount\) >= 10/u);
  assert.doesNotMatch(productSource, /verifiedQuestionCount/u);
  assert.match(app, /leaderboardTitle: 'Server-checked leaderboard'/u);
  assert.match(app, /leaderboardNav: 'Leaderboard'/u);
  assert.match(searchLeaderboard, /Server checking applies to submitted answers and scoring\./u);
  assert.match(searchLeaderboard, /يتحقق الخادم من الإجابات المرسلة ويحسب النتيجة/u);
  assert.match(searchLeaderboard, /This is accuracy-only server checking, not proctoring\./u);
  assert.match(searchLeaderboard, /'Server checked'/u);
  assert.doesNotMatch(productSource, /'Server verified'/u);
});
