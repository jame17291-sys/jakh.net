import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'styles.css'), 'utf8');

test('every question-card branch exposes an honest bilingual review status', () => {
  assert.match(app, /reviewStatusReviewed: 'Editorially reviewed'/u);
  assert.match(app, /reviewStatusPending: 'Editorial review pending'/u);
  assert.match(app, /reviewSafetyPending: 'Editorial review pending · Safety-sensitive educational content'/u);
  assert.match(app, /reviewStatusReviewed: 'تمت مراجعته تحريريًا'/u);
  assert.match(app, /reviewStatusPending: 'بانتظار المراجعة التحريرية'/u);
  assert.match(app, /reviewSafetyPending: 'بانتظار المراجعة التحريرية · محتوى تعليمي حساس للسلامة'/u);
  assert.match(app, /const reviewed = review\.status === 'reviewed'/u);
  assert.match(app, /review\.safetySensitive === true \|\| review\.priority === 'high'/u);
  assert.match(app, /const cardReviewMarkup = createReviewMarkup\(card\)/u);
  assert.match(app, /const frontReviewMarkup = createReviewMarkup\(card, frontFocus\)/u);
  assert.match(app, /const backReviewMarkup = createReviewMarkup\(card, backFocus\)/u);
  assert.match(css, /\.card-review--reviewed\s*\{/u);
  assert.match(css, /\.card-review--safety\s*\{/u);
});

test('reviewed cards expose date, reviewer, and HTTPS sources using safe external links', () => {
  assert.match(app, /parsed\.protocol === 'https:' && parsed\.hostname/u);
  assert.match(app, /<time datetime="\$\{escapeHtml\(reviewedAt\)\}">/u);
  assert.match(app, /fmt\('reviewReviewer', \{ reviewer \}\)/u);
  assert.match(app, /class="card-review-sources"/u);
  assert.match(app, /target="_blank" rel="noopener noreferrer"/u);
  assert.match(app, /aria-label="\$\{escapeHtml\(ariaLabel\)\}"/u);
  assert.match(app, /\.filter\(source => source\.safeUrl\)/u);
  assert.match(app, /if \(event\.target\.closest\('\.card-review-sources a'\)\) return;/u);
});

test('server scoring uses the scorable count and never masquerades as fact review', () => {
  assert.match(app, /Number\(category\.scorableQuestionCount\) >= 10/u);
  assert.doesNotMatch(app, /verifiedQuestionCount/u);
  assert.match(app, /leaderboardTitle: 'Server-checked leaderboard'/u);
  assert.match(app, /Server checking applies to submitted answers and scoring, not editorial fact review\./u);
  assert.match(app, /وهذا منفصل عن المراجعة التحريرية للمعلومات/u);
  assert.match(app, /'Server checked'/u);
  assert.doesNotMatch(app, /'Server verified'/u);
});
