import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { levelFor, renderAccountPanel } from '../auth-enhancements.js';
import { ACHIEVEMENTS, computeAchievements, title, description } from '../achievements.js';

const escapeHtml = (value) => String(value).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const t = (key) => key;
const fmt = (key, vars) => `${key}:${vars.avatar}`;

function panel(overrides = {}) {
  const earned = computeAchievements(overrides.context || { correct: 12, shuffle: { rounds: 1 } });
  return renderAccountPanel({
    account: { username: 'Noor <3', avatar: '🦉', favorites: [1, 2] }, language: overrides.language || 'en', role: overrides.role || 'USER',
    score: 300, correctCount: overrides.correctCount ?? 12, totalQuestions: 3638, streak: overrides.streak ?? 0, bestStreak: overrides.bestStreak ?? 0,
    progress: overrides.progress || [], categories: overrides.categories || [], getCorrectCountByDifficulty: (d) => ({ easy: 12, medium: 0, hard: 0, 'very-advanced': 0 })[d],
    avatarSaving: false, securityLoading: false, privacyPath: '/privacy', t, fmt, escapeHtml,
    trophies: overrides.trophies === null ? null : { all: ACHIEVEMENTS, earnedIds: new Set(earned.map((a) => a.id)), title: (a) => title(a, overrides.language || 'en'), description: (a) => description(a, overrides.language || 'en') },
  });
}

test('level titles rise with solved count and name the next threshold', () => {
  assert.deepEqual(levelFor(0, 'en'), { title: 'Newcomer', next: { at: 10, title: 'Explorer' } });
  assert.deepEqual(levelFor(87, 'en'), { title: 'Solver', next: { at: 150, title: 'Scholar' } });
  assert.deepEqual(levelFor(87, 'ar').title, 'حلّال ألغاز');
  assert.equal(levelFor(5000, 'en').next, null);
});

test('the profile keeps every element id app.js binds to, in both languages', () => {
  const ids = ['signedInAccountPanel', 'profileAvatar', 'avatarSelector', 'avatarStatus', 'currentPassword', 'newPassword', 'changePasswordRules',
    'changePasswordStatus', 'changePasswordBtn', 'recoveryRotatePassword', 'recoveryRotateStatus', 'rotateRecoveryCodeBtn', 'logoutBtn', 'logoutStatus'];
  for (const language of ['en', 'ar']) {
    const html = panel({ language });
    for (const id of ids) assert.match(html, new RegExp(`id="${id}"`, 'u'), `${language}: ${id}`);
    assert.equal((html.match(/class="avatar-btn/gu) || []).length, 16, 'sixteen avatar buttons');
    assert.match(html, /data-emoji="🦉"[^>]*>🦉|aria-pressed="true"[^>]*data-emoji="🦉"/u);
    assert.doesNotMatch(html, /id="adminSecurityBtn"/u, 'no admin controls for a plain user');
  }
  const admin = panel({ role: 'ADMIN' });
  assert.match(admin, /id="adminSecurityBtn"/u);
  assert.match(admin, /id="adminSecurityStatus"/u);
  assert.match(admin, /href="\/admin"/u);
  // app.js binds these ids by reading the source; keep the contract visible in one place.
  const appSource = readFileSync(new URL('../app.js', import.meta.url), 'utf8');
  for (const id of ['logoutBtn', 'changePasswordBtn', 'rotateRecoveryCodeBtn', 'avatarSelector', 'adminSecurityBtn']) assert.ok(appSource.includes(`'${id}'`) || appSource.includes(`#${id}`), `app.js still binds ${id}`);
});

test('user-supplied text is escaped and settings sit behind an expander', () => {
  const html = panel();
  assert.match(html, /Noor &lt;3/u);
  assert.doesNotMatch(html, /Noor <3/u);
  assert.match(html, /<details class="profile-settings" id="profileSettings">/u);
  assert.ok(html.indexOf('id="profileSettings"') > html.indexOf('profile-trophies'), 'trophies come before settings');
  assert.equal((html.match(/style="/gu) || []).length, (html.match(/style="width:/gu) || []).length, 'only progress widths are inline');
});

test('stats, trophies and topics reflect the data they are given', () => {
  const categories = [
    { slug: 'math', count: 120, emoji: '🔢', title: { en: 'Math', ar: 'الرياضيات' } },
    { slug: 'science', count: 80, emoji: '🔬', title: { en: 'Science', ar: 'العلوم' } },
  ];
  const progress = [
    ...Array.from({ length: 6 }, () => ({ categoryId: 'math', status: 'easy' })),
    { categoryId: 'math', status: 'wrong-1' },
    ...Array.from({ length: 2 }, () => ({ categoryId: 'science', status: 'easy' })),
    ...Array.from({ length: 5 }, () => ({ categoryId: 'science', status: 'wrong-2' })),
    { categoryId: 'unknown', status: 'easy' },
  ];
  const html = panel({ progress, categories, streak: 4, bestStreak: 9, correctCount: 87 });
  assert.match(html, /🔥 4/u);
  assert.match(html, /best 9/u);
  assert.match(html, /87 of 3,638 questions/u);
  assert.match(html, /Solver/u);
  assert.match(html, /Trophy case <span class="profile-section-count">\d+\/22<\/span>/u, 'eighteen trophies plus four medals');
  assert.match(html, /is-earned[\s\S]*First Steps/u);
  assert.match(html, /🥉/u, 'the bronze medal is earned with 12 easy answers');
  assert.match(html, /profile-topic-name">Math<\/span>[\s\S]*width:5%/u, '6 of 120 is 5%');
  assert.match(html, /You missed 5 of 7 in <strong>Science<\/strong>/u);
  assert.match(html, /href="\/science"/u);
  const arabic = panel({ progress, categories, language: 'ar' });
  assert.match(arabic, /href="\/ar\/topics\/science\/"/u);
  assert.match(arabic, /أخطأت في 5 من 7/u);
  assert.doesNotMatch(arabic, /[٠-٩]/u, 'Western digits, as elsewhere on the site');
});

test('without the trophy catalogue only the four medals are shown, and an empty profile invites play', () => {
  const html = panel({ trophies: null, correctCount: 0 });
  assert.match(html, /profile-section-count">1\/4</u);
  assert.match(html, /Answer a few questions in any topic/u);
  assert.match(html, /Newcomer/u);
});
