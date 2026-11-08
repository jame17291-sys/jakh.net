// Achievement definitions and pure helpers. app.js builds a small context from
// its own state and storage and asks this module which trophies it earns, so
// the catalogue, its bilingual copy and the unlock logic stay out of the
// app.js budget and are testable without a browser.
//
// Everything here is browser-local. Nothing is sent anywhere, and guests earn
// trophies exactly like account holders.

export const ACHIEVEMENTS = Object.freeze([
  // Solving
  { id: 'first-solve', icon: '⭐', group: 'solve', en: 'First Steps', ar: 'الخطوة الأولى', descEn: 'Answer your first question correctly', descAr: 'أجب إجابة صحيحة عن سؤالك الأول', check: c => c.correct >= 1 },
  { id: 'scholar', icon: '🎓', group: 'solve', en: 'Scholar', ar: 'المثقف', descEn: 'Answer 100 questions correctly', descAr: 'أجب إجابة صحيحة عن 100 سؤال', check: c => c.correct >= 100 },
  { id: 'hard-solver', icon: '💪', group: 'solve', en: 'Hard Hitter', ar: 'مواجه الصعاب', descEn: 'Answer 25 hard or difficult questions correctly', descAr: 'أجب إجابة صحيحة عن 25 سؤالًا صعبًا', check: c => c.hardCorrect >= 25 },
  { id: 'category-master', icon: '👑', group: 'solve', en: 'Category Master', ar: 'خبير الموضوع', descEn: 'Complete any category 100%', descAr: 'أكمل أي موضوع بنسبة 100%', check: c => c.masteredCategories >= 1 },
  { id: 'completionist', icon: '💎', group: 'solve', en: 'Completionist', ar: 'المُنجز', descEn: 'Complete 5 categories 100%', descAr: 'أكمل 5 موضوعات بنسبة 100%', check: c => c.masteredCategories >= 5 },
  { id: 'speed-demon', icon: '⚡', group: 'solve', en: 'Speed Demon', ar: 'الرعد', descEn: 'Score 8/10+ in Quick Fire', descAr: 'احصل على 8/10 أو أعلى في الاختبار السريع', check: c => c.flags.speedDemon },
  // Shuffle Challenge
  { id: 'shuffle-first', icon: '🔀', group: 'shuffle', en: 'First Shuffle', ar: 'أول خلطة', descEn: 'Finish a Shuffle Challenge round', descAr: 'أنهِ جولة من خلطة التحدي', check: c => c.shuffle.rounds >= 1 },
  { id: 'shuffle-perfect', icon: '🎯', group: 'shuffle', en: 'Perfect Ten', ar: 'عشرة من عشرة', descEn: 'Know all 10 cards in one Shuffle round', descAr: 'اعرف البطاقات العشر كلها في جولة واحدة', check: c => c.shuffle.perfect >= 1 },
  { id: 'shuffle-expert', icon: '🧠', group: 'shuffle', en: 'Expert Deck', ar: 'مستوى الخبراء', descEn: 'Know 7 or more in an Expert-level Shuffle round', descAr: 'اعرف 7 بطاقات أو أكثر في جولة بمستوى صعب جدًا', check: c => c.shuffle.expert >= 1 },
  { id: 'shuffle-explorer', icon: '🧭', group: 'shuffle', en: 'Explorer', ar: 'المستكشف', descEn: 'Meet 30 different topics in Shuffle rounds', descAr: 'قابل 30 موضوعًا مختلفًا في جولات الخلطة', check: c => c.shuffle.topics >= 30 },
  { id: 'shuffle-regular', icon: '🗓️', group: 'shuffle', en: 'Regular', ar: 'من الروّاد', descEn: 'Finish 10 Shuffle rounds', descAr: 'أنهِ 10 جولات من الخلطة', check: c => c.shuffle.rounds >= 10 },
  // Coming back
  { id: 'streak-3', icon: '🔥', group: 'streak', en: '3-Day Streak', ar: '3 أيام متتالية', descEn: 'Play on 3 days in a row', descAr: 'العب 3 أيام على التوالي', check: c => c.streak >= 3 },
  { id: 'streak-7', icon: '🔥', group: 'streak', en: '7-Day Streak', ar: '7 أيام متتالية', descEn: 'Play on 7 days in a row', descAr: 'العب 7 أيام على التوالي', check: c => c.streak >= 7 },
  { id: 'streak-30', icon: '🏆', group: 'streak', en: '30-Day Streak', ar: '30 يومًا متتاليًا', descEn: 'Play on 30 days in a row', descAr: 'العب 30 يومًا على التوالي', check: c => c.streak >= 30 },
  // Around the site
  { id: 'bookworm', icon: '📚', group: 'site', en: 'Bookworm', ar: 'نهم القراءة', descEn: 'Add 20 questions to favorites', descAr: 'أضف 20 سؤالًا إلى المفضلة', check: c => c.favorites >= 20 },
  { id: 'bilingual', icon: '🌐', group: 'site', en: 'Bilingual', ar: 'ثنائي اللغة', descEn: 'Use both Arabic and English', descAr: 'استخدم العربية والإنجليزية', check: c => c.flags.usedArabic },
  { id: 'night-owl', icon: '🦉', group: 'site', en: 'Night Owl', ar: 'بومة الليل', descEn: 'Answer a question after midnight', descAr: 'أجب عن سؤال بعد منتصف الليل', check: c => c.flags.nightOwl },
  { id: 'sharer', icon: '🔗', group: 'site', en: 'Sharer', ar: 'المشارك', descEn: 'Share a question or a result', descAr: 'شارك سؤالًا أو نتيجة', check: c => c.flags.shared || c.shuffle.shares >= 1 },
]);

const toCount = value => Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;

// Normalises whatever app.js hands over so a missing field never throws
// inside a check and a malformed stored value cannot grant a trophy.
export function normalizeContext(input = {}) {
  const flags = input.flags && typeof input.flags === 'object' ? input.flags : {};
  const shuffle = input.shuffle && typeof input.shuffle === 'object' ? input.shuffle : {};
  return {
    correct: toCount(input.correct), hardCorrect: toCount(input.hardCorrect), masteredCategories: toCount(input.masteredCategories),
    favorites: toCount(input.favorites), streak: toCount(input.streak),
    flags: { speedDemon: !!flags.speedDemon, usedArabic: !!flags.usedArabic, nightOwl: !!flags.nightOwl, shared: !!flags.shared },
    shuffle: { rounds: toCount(shuffle.rounds), perfect: toCount(shuffle.perfect), expert: toCount(shuffle.expert), topics: toCount(shuffle.topics), shares: toCount(shuffle.shares) },
  };
}

export function computeAchievements(context) {
  const clean = normalizeContext(context);
  return ACHIEVEMENTS.filter(a => { try { return a.check(clean) === true; } catch { return false; } });
}

// Which of the earned trophies are new since the stored list, and the list to
// store next. Ids that are no longer earned stay stored so a trophy is never
// announced twice.
export function unlockDiff(storedIds, earned) {
  const stored = new Set(Array.isArray(storedIds) ? storedIds.filter(id => typeof id === 'string') : []);
  const fresh = earned.filter(a => !stored.has(a.id));
  return { fresh, next: [...stored, ...fresh.map(a => a.id)] };
}

export function title(achievement, lang) { return lang === 'ar' ? achievement.ar : achievement.en; }
export function description(achievement, lang) { return lang === 'ar' ? achievement.descAr : achievement.descEn; }

// The browser-only Shuffle streak (see shuffle-challenge-engine.js) counts for
// the streak trophies too, so guests can earn them. Re-implemented here in a
// few lines rather than importing the engine into the app shell.
export function currentLocalStreak(record, today = new Date()) {
  if (!record || record.v !== 1 || typeof record.last !== 'string' || !/^\d{4}-\d{2}-\d{2}$/u.test(record.last)) return 0;
  const day = value => Math.round(Date.UTC(+value.slice(0, 4), +value.slice(5, 7) - 1, +value.slice(8, 10)) / 86_400_000);
  const pad = n => String(n).padStart(2, '0');
  const now = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`;
  const gap = day(now) - day(record.last);
  return (gap === 0 || gap === 1) && Number.isInteger(record.count) && record.count > 0 ? record.count : 0;
}

// --- Shuffle statistics ----------------------------------------------------
// Kept by the Shuffle page in this browser only; the achievement context reads
// them back. Topics are stored as a bounded slug list so the record cannot
// grow without limit.
export const SHUFFLE_STATS_KEY = 'ra-shuffle-stats-v1';
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;
const MAX_TOPICS = 200;

export function restoreShuffleStats(value) {
  const clean = value && typeof value === 'object' && value.v === 1 ? value : {};
  const topics = Array.isArray(clean.topics) ? [...new Set(clean.topics.filter(slug => typeof slug === 'string' && SLUG.test(slug)))].slice(0, MAX_TOPICS) : [];
  return { v: 1, rounds: toCount(clean.rounds), perfect: toCount(clean.perfect), expert: toCount(clean.expert), shares: toCount(clean.shares), topics };
}

export function recordShuffleRound(stats, round, { expertThreshold = 7 } = {}) {
  const clean = restoreShuffleStats(stats);
  const items = Array.isArray(round?.items) ? round.items : [];
  if (!items.length) return clean;
  const knew = items.filter(item => item.result === 'knew').length;
  const topics = [...new Set([...clean.topics, ...items.map(item => item.slug).filter(slug => typeof slug === 'string' && SLUG.test(slug))])].slice(0, MAX_TOPICS);
  return {
    v: 1, rounds: clean.rounds + 1, perfect: clean.perfect + (knew === items.length ? 1 : 0),
    expert: clean.expert + (round.level === 'very-advanced' && knew >= expertThreshold ? 1 : 0), shares: clean.shares, topics,
  };
}

export function recordShuffleShare(stats) {
  const clean = restoreShuffleStats(stats);
  return { ...clean, shares: clean.shares + 1 };
}

export function shuffleContext(stats) {
  const clean = restoreShuffleStats(stats);
  return { rounds: clean.rounds, perfect: clean.perfect, expert: clean.expert, topics: clean.topics.length, shares: clean.shares };
}
