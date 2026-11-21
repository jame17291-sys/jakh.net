// Social media question cards: the shared, testable part.
//
// A "plan" is a list of days; each day names one published card from one of the
// public SEO collections (`scripts/riddlearabia-seo.mjs`), so every card on social
// media is one that already passed the featured-collection checks (no held
// categories, no card that two collections share). The renderer turns a day into
// two 1080x1080 images (question, answer) and `captions()` writes the bilingual
// post text for each network. Nothing here is personal data: the plan holds card
// ids and dates only.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { RIDDLE_ARABIA_SEO_PAGES } from "./riddlearabia-seo.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(__dirname, "..");
export const SITE_ORIGIN = "https://riddlearabia.com";
export const CARD_SIZE = 1080;
export const CARDS_DIR = "assets/social";

// Collections that rotate on social media, in rotation order. Spacetoon has only
// eight cards and brain-games has none, so they stay out.
export const ROTATION = Object.freeze([
  "riddles", "math-riddles", "animal-quiz", "arabic-riddles", "football-quiz", "science-trivia",
  "logic-puzzles", "flags-quiz", "history-quiz", "kids-riddles", "space-quiz", "general-knowledge",
  "hard-riddles", "geography-quiz", "arabia-quiz", "anime-quiz",
]);

// Short questions read on a phone; long logic puzzles do not.
export const MAX_QUESTION_CHARS = 170;

const bankCache = new Map();
export function loadBank(topic) {
  if (!bankCache.has(topic)) {
    bankCache.set(topic, JSON.parse(fs.readFileSync(path.join(ROOT, "data", `${topic}.json`), "utf8")));
  }
  return bankCache.get(topic);
}

export function collection(key) {
  const page = RIDDLE_ARABIA_SEO_PAGES.find((entry) => entry.key === key);
  if (!page) throw new Error(`Unknown collection ${key}`);
  return page;
}

export function card(topic, id) {
  const entry = loadBank(topic).find((item) => item.id === id);
  if (!entry) throw new Error(`Unknown card ${topic}/${id}`);
  return entry;
}

const text = (value) => (typeof value === "string" ? value : "");

// Owner decision (10 Nov 2026): no religion topics, questions or content on social media.
// Matched on the English question, answer and explanation (the Arabic mirrors them), as
// whole words so "crossed" or "Christopher" do not trip it. Over-matching is acceptable:
// it only means a card is skipped.
export const RELIGION_TERMS = /\b(gods?|allah|prophets?|islam\w*|muslims?|mosques?|quran|koran|mecca|makkah|medina|madinah|hijra|hijri|caliph\w*|church(?:es)?|chapel|cathedral|basilica|christ|christian\w*|christmas|jesus|bible|biblical|religio\w*|prayers?|ramadan|eid|hajj|umrah|kaaba|saints?|pope|papal|vatican|holy|sacred|temples?|angels?|heaven|jewish|judaism|torah|hindu\w*|buddh\w*|monks?|monaster\w*|spiritual|worship\w*|imam|scripture|crusade\w*|crusaders|sharia|sunni|shia|ashura|karbala|jerusalem|bethlehem|pilgrim\w*|cross|crucif\w*|deity|deities)\b/iu;

export function isReligious(entry) {
  return RELIGION_TERMS.test([text(entry.question?.en), text(entry.answer?.en), text(entry.explanation?.en)].join(" | "));
}

export function cardFits(entry) {
  return !isReligious(entry)
    && ["easy", "medium"].includes(entry.difficulty)
    && text(entry.question?.en).length > 0 && text(entry.question?.en).length <= MAX_QUESTION_CHARS
    && text(entry.question?.ar).length > 0 && text(entry.question?.ar).length <= MAX_QUESTION_CHARS
    && text(entry.answer?.en).length > 0 && text(entry.answer?.ar).length > 0;
}

// Deterministic: the same start date and length always give the same plan, and a
// card is never planned twice within one plan. `seed` moves the starting offset
// inside each collection so a second plan does not repeat the first.
export function buildPlan({ startDate, days, seed = 0, used = new Set() }) {
  const taken = new Set(used);
  const cursors = new Map(ROTATION.map((key) => [key, seed]));
  const plan = [];
  const start = new Date(`${startDate}T00:00:00Z`);
  for (let day = 0; day < days; day++) {
    const date = new Date(start.getTime() + day * 86_400_000).toISOString().slice(0, 10);
    let chosen = null;
    for (let attempt = 0; attempt < ROTATION.length && !chosen; attempt++) {
      const key = ROTATION[(day + attempt) % ROTATION.length];
      const cards = collection(key).cards || [];
      for (let step = 0; step < cards.length; step++) {
        const index = (cursors.get(key) + step) % cards.length;
        const [topic, id] = cards[index];
        if (taken.has(id)) continue;
        const entry = card(topic, id);
        if (!cardFits(entry)) continue;
        cursors.set(key, index + 1);
        taken.add(id);
        // Every day carries a vertical card reel (see social-reels.mjs); the images stay
        // for Facebook's first-comment fallback and for the plan's audit trail.
        chosen = { day: day + 1, date, collection: key, topic, id, reel: true };
        break;
      }
    }
    if (!chosen) throw new Error(`No unused short card left for day ${day + 1}`);
    plan.push(chosen);
  }
  return plan;
}

export function slug(entry) { return `${entry.date}-${entry.id}`; }

export function imagePaths(entry) {
  const base = slug(entry);
  return {
    question: `${CARDS_DIR}/${base}-q.png`,
    answer: `${CARDS_DIR}/${base}-a.png`,
  };
}

export function imageUrls(entry) {
  const paths = imagePaths(entry);
  return { question: `${SITE_ORIGIN}/${paths.question}`, answer: `${SITE_ORIGIN}/${paths.answer}` };
}

const escape = (value) => String(value).replace(/[&<>"]/gu, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[ch]));

// Font size steps down as the question gets longer so a card never overflows.
function questionSize(length, base, min) {
  if (length <= 70) return base;
  if (length <= 110) return Math.round(base * 0.85);
  if (length <= 140) return Math.round(base * 0.72);
  return min;
}

export function cardHtml(entry, side, { logoDataUrl = "" } = {}) {
  const page = collection(entry.collection);
  const item = card(entry.topic, entry.id);
  const isAnswer = side === "answer";
  const ar = isAnswer ? item.answer.ar : item.question.ar;
  const en = isAnswer ? item.answer.en : item.question.en;
  const longest = Math.max(ar.length, Math.round(en.length * 0.8));
  const arSize = questionSize(longest, isAnswer ? 80 : 76, 52);
  const enSize = questionSize(longest, isAnswer ? 54 : 48, 36);
  const eyebrowAr = isAnswer ? "الجواب" : page.headings.ar.replace(/ مع الأجوبة$/u, "");
  const eyebrowEn = isAnswer ? "The answer" : page.headings.en.replace(/ with answers$/u, "");
  const footerAr = isAnswer ? "30 سؤالاً آخر على الموقع" : "اكتب جوابك في التعليقات";
  const footerEn = isAnswer ? `30 more at riddlearabia.com${page.paths.en}` : "Answer in the comments, then swipe";
  return `<!doctype html>
<html lang="ar"><head><meta charset="utf-8">
<style>
  @font-face { font-family: "Lora"; src: url("file:///usr/share/fonts/truetype/google-fonts/Lora-Variable.ttf"); font-weight: 400 700; }
  @font-face { font-family: "Poppins"; src: url("file:///usr/share/fonts/truetype/google-fonts/Poppins-Medium.ttf"); font-weight: 500; }
  @font-face { font-family: "Poppins"; src: url("file:///usr/share/fonts/truetype/google-fonts/Poppins-Bold.ttf"); font-weight: 700; }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body { width: ${CARD_SIZE}px; height: ${CARD_SIZE}px; overflow: hidden; }
  body { background: #fff9ed; color: #322016; font-family: "Poppins", "DejaVu Sans", sans-serif; display: flex; flex-direction: column; }
  .top { display: flex; align-items: center; justify-content: space-between; padding: 56px 72px 0; }
  .brand { display: flex; align-items: center; gap: 20px; }
  .brand img { width: 72px; height: 72px; }
  .brand b { font-family: "Lora", serif; font-size: 34px; font-weight: 700; letter-spacing: -0.02em; }
  .brand span { display: block; font-family: "DejaVu Sans", sans-serif; font-size: 22px; color: #604333; font-weight: 700; }
  .eyebrow { text-align: right; color: #94431f; font-weight: 700; font-size: 24px; line-height: 1.35; }
  .eyebrow .ar { font-family: "DejaVu Sans", sans-serif; direction: rtl; }
  .body { flex: 1; display: flex; flex-direction: column; justify-content: center; gap: 36px; padding: 0 72px; }
  .ar-text { direction: rtl; text-align: right; font-family: "DejaVu Sans", sans-serif; font-weight: 700; font-size: ${arSize}px; line-height: 1.45; }
  .rule { width: 120px; height: 6px; background: #c5832e; border-radius: 3px; align-self: flex-end; }
  .en-text { direction: ltr; text-align: left; font-family: "Lora", serif; font-weight: 500; font-size: ${enSize}px; line-height: 1.4; color: #604333; }
  .answer .ar-text, .answer .en-text { color: #733217; }
  .foot { background: #94431f; color: #fff9ed; padding: 34px 72px; display: flex; align-items: center; justify-content: space-between; gap: 24px; }
  .foot .ar { font-family: "DejaVu Sans", sans-serif; direction: rtl; font-size: 26px; font-weight: 700; }
  .foot .en { font-size: 22px; font-weight: 500; opacity: 0.95; text-align: left; }
</style></head>
<body class="${isAnswer ? "answer" : "question"}">
  <div class="top">
    <div class="brand">${logoDataUrl ? `<img src="${logoDataUrl}" alt="">` : ""}<div><b>Riddle Arabia</b><span>ريدل أرابيا</span></div></div>
    <div class="eyebrow"><div class="ar">${escape(eyebrowAr)}</div><div class="en">${escape(eyebrowEn)}</div></div>
  </div>
  <div class="body">
    <div class="ar-text">${escape(ar)}</div>
    <div class="rule"></div>
    <div class="en-text">${escape(en)}</div>
  </div>
  <div class="foot"><div class="en">${escape(footerEn)}</div><div class="ar">${escape(footerAr)}</div></div>
</body></html>`;
}

const HASHTAGS = {
  en: "#riddles #trivia #quiz #brainteaser",
  ar: "#ألغاز #أسئلة_ثقافية #تحدي",
};

// One bilingual caption per network. Instagram links are not clickable, so it
// points at the bio; Facebook carries the collection link with a ref tag.
export function captions(entry) {
  const page = collection(entry.collection);
  const item = card(entry.topic, entry.id);
  const topicAr = page.headings.ar.replace(/ مع الأجوبة$/u, "");
  const topicEn = page.headings.en.replace(/ with answers$/u, "");
  const questionBlock = `${item.question.ar}\n\n${item.question.en}`;
  return {
    // A reel reveals the answer itself after the countdown; only a carousel is swiped.
    instagram: `${questionBlock}\n\n${entry.reel
      ? "اكتب جوابك في التعليقات قبل أن يظهر الحل في الفيديو ⏳\nAnswer in the comments before the video reveals it."
      : "اكتب جوابك في التعليقات ثم اسحب لترى الحل 👉\nAnswer in the comments, then swipe for the answer."}\n\n${topicAr} · ${topicEn}: الرابط في البايو · link in bio\n\n${HASHTAGS.ar} ${HASHTAGS.en}`,
    facebook: `${questionBlock}\n\nاكتب جوابك في التعليقات 👇 Answer in the comments.\n\n${topicAr} · ${topicEn} (30 ${/riddle/iu.test(page.key) ? "riddles" : "questions"}, free, no sign-up):\n${SITE_ORIGIN}${page.paths.ar}?ref=facebook\n${SITE_ORIGIN}${page.paths.en}?ref=facebook`,
  };
}
