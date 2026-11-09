/**
 * The public search surface for Riddle Arabia is intentionally small and
 * editorially designed.  It is not a renamed version of the former mass
 * topic/pagination program: every page below has a distinct purpose, reader
 * journey, source selection, and bilingual copy.
 */

import { PUZZLES } from "../puzzle-catalog.js";
import { PUZZLE_ROUTES } from "../puzzle-routes.js";
import { PARTY_COPY } from "../party-games-copy.js";
import { FRIENDSHIP_COPY } from "../friendship-games-copy.js";
import { AR_COUNT, arabicCount } from "../arabic-count.js";

// Arabic counted nouns change form with the number: 3-10 take the plural,
// 11-99 the singular accusative, and 1, 2 and round hundreds their own forms.
// Shared by every generated count label so "30 أسئلة" can never be published.
const AR_SELECTED_QUESTIONS = Object.freeze({
  one: "سؤال واحد مختار", two: "سؤالان مختاران", few: "أسئلة مختارة", many: "سؤالًا مختارًا", other: "سؤال مختار",
});

export function questionCountLabel(count, lang, { selected = false } = {}) {
  if (!Number.isInteger(count) || count < 0) throw new Error(`Invalid question count: ${count}`);
  if (lang !== "ar") return `${count} ${selected ? "selected " : ""}${count === 1 ? "question" : "questions"}`;
  return arabicCount(count, selected ? AR_SELECTED_QUESTIONS : AR_COUNT.question);
}

// Use the playable catalog's identities, copy and routes so the search-facing
// directory cannot silently fall behind the actual puzzle library.
export const RIDDLE_ARABIA_PUZZLE_CATALOG = Object.freeze(PUZZLES.map((puzzle) => {
  const route = PUZZLE_ROUTES.find((candidate) => candidate.id === puzzle.id);
  if (!route) throw new Error(`Missing public puzzle route: ${puzzle.id}`);
  return Object.freeze({
    id: puzzle.id,
    slug: route.slug,
    paths: route.paths,
    kind: puzzle.category === "collection" ? "collection" : "puzzle",
    names: Object.freeze({ en: puzzle.title[0], ar: puzzle.title[1] }),
    descriptions: Object.freeze({ en: puzzle.desc[0], ar: puzzle.desc[1] }),
  });
}));

export const RIDDLE_ARABIA_SEO_PAGES = Object.freeze([
  {
    key: "riddles",
    // Expanded from 8 to 30 riddles, ordered from easy to hard, on 2026-10-23.
    // Arabic card wording returned to Modern Standard Arabic on 2026-10-25.
    // Cards removed in the 2026-10-25 phase-2 content pass replaced with current cards of the same topic.
    // Search titles and descriptions rewritten for click-through on 2026-11-08
    // (counts, difficulty range and a challenge hook; no new claims).
    lastModified: "2026-11-08",
    paths: { en: "/riddles", ar: "/ar/alghaz/" },
    titles: {
      en: "30 Riddles With Answers, Easy to Hard | Riddle Arabia",
      ar: "30 لغزاً مع الحل من السهل إلى الصعب | ريدل أرابيا",
    },
    descriptions: {
      en: "Can you solve all 30? Free riddles with answers in English and Arabic, from easy everyday clues to hard number and logic riddles. Guess first, then reveal.",
      ar: "هل تستطيع حل الألغاز الثلاثين كلها؟ ألغاز مجانية مع الحل بالعربية والإنجليزية، من ألغاز سهلة عن الأشياء اليومية إلى ألغاز صعبة في الأرقام والمنطق. خمّن أولاً، ثم اكشف الحل.",
    },
    eyebrow: { en: "From easy to hard", ar: "من السهل إلى الصعب" },
    headings: { en: "Riddles with answers", ar: "ألغاز مع الحل" },
    introductions: {
      en: "Start with classic riddles about everyday objects, nature, and time, then work up to harder number and logic riddles near the end of the list. Read each clue in English or Arabic, make your guess, and open the answer to see how you did. Every riddle is free to try on your own or with friends.",
      ar: "ابدأ بألغاز معروفة عن الأشياء اليومية والطبيعة والوقت، ثم انتقل تدريجياً إلى ألغاز أصعب في الأرقام والمنطق في آخر القائمة. اقرأ كل لغز بالعربية أو الإنجليزية، وخمّن الحل، ثم اكشف الإجابة لتتحقّق منها. يمكنك تجربة جميع الألغاز مجاناً بمفردك أو مع الأصدقاء.",
    },
    guidance: {
      en: "Read each clue without rushing. Say your answer out loud, then reveal the solution and check which details led you there. Keep a pencil nearby for the number riddles, and use the full topic link above for more riddles.",
      ar: "اقرأ كل لغز من دون استعجال. قل إجابتك بصوتٍ عالٍ، ثم اكشف الحل وراجع التفاصيل التي أوصلتك إليه. أبقِ قلماً قريباً لألغاز الأرقام، وللمزيد من الألغاز افتح رابط الموضوع الكامل أعلاه.",
    },
    subjects: { en: ["Riddles", "Wordplay", "Logic"], ar: ["ألغاز", "تفكير لغوي", "منطق"] },
    cards: [
      ["classic-riddles", "classic-riddles-001"],
      ["classic-riddles", "classic-riddles-003"],
      ["classic-riddles", "classic-riddles-004"],
      ["classic-riddles", "classic-riddles-008"],
      ["classic-riddles", "classic-riddles-009"],
      ["classic-riddles", "classic-riddles-047"],
      ["classic-riddles", "classic-riddles-024"],
      ["classic-riddles", "classic-riddles-033"],
      ["classic-riddles", "classic-riddles-023"],
      ["classic-riddles", "classic-riddles-062"],
      ["classic-riddles", "classic-riddles-100"],
      ["classic-riddles", "classic-riddles-013"],
      ["classic-riddles", "classic-riddles-014"],
      ["classic-riddles", "classic-riddles-055"],
      ["classic-riddles", "classic-riddles-052"],
      ["classic-riddles", "classic-riddles-011"],
      ["classic-riddles", "classic-riddles-018"],
      ["classic-riddles", "classic-riddles-046"],
      ["classic-riddles", "classic-riddles-067"],
      ["classic-riddles", "classic-riddles-095"],
      ["classic-riddles", "classic-riddles-066"],
      ["classic-riddles", "classic-riddles-072"],
      ["classic-riddles", "classic-riddles-088"],
      ["classic-riddles", "classic-riddles-071"],
      ["classic-riddles", "classic-riddles-075"],
      ["classic-riddles", "classic-riddles-078"],
      ["classic-riddles", "classic-riddles-097"],
      ["classic-riddles", "classic-riddles-086"],
      ["classic-riddles", "classic-riddles-083"],
      ["classic-riddles", "classic-riddles-091"],
    ],
  },
  {
    key: "arabic-riddles",
    // Expanded from 8 to 30 riddles whose wording works naturally in Arabic on 2026-10-23.
    // Arabic card wording returned to Modern Standard Arabic on 2026-10-25.
    // Cards removed in the 2026-10-25 phase-2 content pass replaced with current cards of the same topic.
    // Search titles and descriptions rewritten for click-through on 2026-11-08.
    lastModified: "2026-11-08",
    paths: { en: "/arabic-riddles", ar: "/ar/alghaz-arabiya/" },
    titles: {
      en: "30 Arabic Riddles With Answers (English Too) | Riddle Arabia",
      ar: "30 لغزاً عربياً مع الحل | ريدل أرابيا",
    },
    descriptions: {
      en: "30 free Arabic riddles with answers, each with an English version. Guess the familiar object, word or idea, then reveal the answer and share it on WhatsApp.",
      ar: "30 لغزاً عربياً مجاناً مع الحل، ولكل لغز نسخة إنجليزية. خمّن الشيء المألوف أو الكلمة أو الفكرة، ثم اكشف الحل وشارك اللغز على واتساب.",
    },
    eyebrow: { en: "Think across languages", ar: "فكّر بلغتين" },
    headings: { en: "Arabic riddles with answers", ar: "ألغاز عربية مع الحل" },
    introductions: {
      en: "These Arabic riddles turn familiar objects, words, and ideas into short guessing challenges. Each clue and answer has an English version too, so you can compare the wording or share the same riddle with friends who prefer another language.",
      ar: "تحوّل هذه الألغاز العربية الأشياء المألوفة والكلمات والأفكار إلى تحديات قصيرة للتخمين. لكل لغز وحل نسخة إنجليزية أيضاً، لتقارن بين الصياغتين أو تشارك اللغز نفسه مع أصدقاء يفضّلون لغة أخرى.",
    },
    guidance: {
      en: "Choose the language that feels most natural, make a prediction, and then switch languages before opening the answer for a fresh angle.",
      ar: "اختر اللغة الأقرب إليك، وخمّن الحل، ثم بدّل اللغة قبل كشف الإجابة لتأخذ زاوية جديدة.",
    },
    subjects: { en: ["Arabic riddles", "Everyday reasoning"], ar: ["ألغاز عربية", "استدلال يومي"] },
    cards: [
      ["classic-riddles", "classic-riddles-037"],
      ["classic-riddles", "classic-riddles-038"],
      ["classic-riddles", "classic-riddles-044"],
      ["classic-riddles", "classic-riddles-040"],
      ["classic-riddles", "classic-riddles-063"],
      ["classic-riddles", "classic-riddles-041"],
      ["classic-riddles", "classic-riddles-030"],
      ["classic-riddles", "classic-riddles-002"],
      ["classic-riddles", "classic-riddles-059"],
      ["classic-riddles", "classic-riddles-050"],
      ["classic-riddles", "classic-riddles-032"],
      ["classic-riddles", "classic-riddles-028"],
      ["classic-riddles", "classic-riddles-031"],
      ["classic-riddles", "classic-riddles-045"],
      ["classic-riddles", "classic-riddles-020"],
      ["classic-riddles", "classic-riddles-035"],
      ["classic-riddles", "classic-riddles-043"],
      ["classic-riddles", "classic-riddles-005"],
      ["classic-riddles", "classic-riddles-065"],
      ["classic-riddles", "classic-riddles-027"],
      ["classic-riddles", "classic-riddles-057"],
      ["classic-riddles", "classic-riddles-007"],
      ["classic-riddles", "classic-riddles-049"],
      ["classic-riddles", "classic-riddles-098"],
      ["classic-riddles", "classic-riddles-092"],
      ["classic-riddles", "classic-riddles-054"],
      ["classic-riddles", "classic-riddles-101"],
      ["classic-riddles", "classic-riddles-019"],
      ["classic-riddles", "classic-riddles-103"],
      ["classic-riddles", "classic-riddles-021"],
    ],
  },
  {
    key: "logic-puzzles",
    // Expanded from 8 to 30 puzzles, easy to hard, on 2026-10-23.
    // Arabic card wording returned to Modern Standard Arabic on 2026-10-25.
    // Cards removed in the 2026-10-25 phase-2 content pass replaced with current cards of the same topic.
    // Search titles and descriptions rewritten for click-through on 2026-11-08.
    lastModified: "2026-11-08",
    paths: { en: "/logic-challenges", ar: "/ar/alghaz-mantiq/" },
    titles: {
      en: "30 Logic Puzzles & Brain Teasers With Answers | Riddle Arabia",
      ar: "30 لغزاً منطقياً ولغز ذكاء مع الحل | ريدل أرابيا",
    },
    descriptions: {
      en: "30 logic puzzles and brain teasers with answers in English and Arabic, from easy to hard: deduction, numbers and lateral thinking, up to the three doors puzzle.",
      ar: "30 لغزاً منطقياً مع الحل بالعربية والإنجليزية، من السهل إلى الصعب: استنتاج وأرقام وتفكير جانبي، وصولاً إلى لغز الأبواب الثلاثة.",
    },
    eyebrow: { en: "Slow down and solve", ar: "تمهّل ثم حل" },
    headings: { en: "Logic puzzles & brain teasers", ar: "ألغاز منطقية وألغاز ذكاء" },
    introductions: {
      en: "Logic puzzles are less about fast facts and more about noticing what a clue actually says. They run from easy to hard, ending with famous brain teasers such as the three doors and the burning ropes. Keep a pencil nearby, or solve them together in conversation.",
      ar: "الألغاز المنطقية لا تعتمد على سرعة المعلومة بقدر اعتمادها على ملاحظة ما يقوله التلميح فعلاً. تتدرّج من السهل إلى الصعب، وتنتهي بألغاز ذكاء مشهورة مثل الأبواب الثلاثة والحبلين المشتعلين. أبقِ قلماً قريباً، أو حلّوها معاً في نقاش.",
    },
    guidance: {
      en: "Underline the fixed facts, ignore assumptions, and test the simplest interpretation before looking at the answer.",
      ar: "حدّد الحقائق الثابتة، وتجنّب الافتراضات، واختبر أبسط تفسير قبل النظر إلى الإجابة.",
    },
    subjects: { en: ["Logic", "Deduction", "Brain teasers"], ar: ["منطق", "استنتاج", "ألغاز ذكاء"] },
    cards: [
      ["logic-puzzles", "logic-puzzles-001"],
      ["logic-puzzles", "logic-puzzles-003"],
      ["logic-puzzles", "logic-puzzles-004"],
      ["logic-puzzles", "logic-puzzles-005"],
      ["logic-puzzles", "logic-puzzles-006"],
      ["logic-puzzles", "logic-puzzles-009"],
      ["logic-puzzles", "logic-puzzles-013"],
      ["logic-puzzles", "logic-puzzles-014"],
      ["logic-puzzles", "logic-puzzles-015"],
      ["logic-puzzles", "logic-puzzles-012"],
      ["logic-puzzles", "logic-puzzles-042"],
      ["logic-puzzles", "logic-puzzles-002"],
      ["logic-puzzles", "logic-puzzles-017"],
      ["logic-puzzles", "logic-puzzles-019"],
      ["logic-puzzles", "logic-puzzles-018"],
      ["logic-puzzles", "logic-puzzles-021"],
      ["logic-puzzles", "logic-puzzles-023"],
      ["logic-puzzles", "logic-puzzles-024"],
      ["logic-puzzles", "logic-puzzles-029"],
      ["logic-puzzles", "logic-puzzles-032"],
      ["logic-puzzles", "logic-puzzles-033"],
      ["logic-puzzles", "logic-puzzles-036"],
      ["logic-puzzles", "logic-puzzles-037"],
      ["logic-puzzles", "logic-puzzles-041"],
      ["logic-puzzles", "logic-puzzles-044"],
      ["logic-puzzles", "logic-puzzles-049"],
      ["logic-puzzles", "logic-puzzles-051"],
      ["logic-puzzles", "logic-puzzles-053"],
      ["logic-puzzles", "logic-puzzles-055"],
      ["logic-puzzles", "logic-puzzles-057"],
    ],
  },
  {
    key: "kids-riddles",
    // Expanded from 8 to 24 riddles, easy to hard, with kids search wording on 2026-10-23.
    // Arabic card wording returned to Modern Standard Arabic on 2026-10-25, and the same day
    // kids-riddles-019 and -021 got new puzzles in both languages.
    // Search titles and descriptions rewritten for click-through on 2026-11-08.
    lastModified: "2026-11-08",
    paths: { en: "/family-riddles", ar: "/ar/alghaz-atfal/" },
    titles: {
      en: "24 Easy Riddles for Kids With Answers | Riddle Arabia",
      ar: "24 لغزاً سهلاً للأطفال مع الحل | ريدل أرابيا",
    },
    descriptions: {
      en: "24 easy riddles for kids with answers in Arabic and English: a crayon, a lamp, a pair of socks, then simple counting puzzles. Free for families and classrooms.",
      ar: "24 لغزاً سهلاً للأطفال مع الحل بالعربية والإنجليزية: قلم شمع ومصباح وزوج من الجوارب، ثم ألغاز عدّ بسيطة. مجاناً للعائلة والصف.",
    },
    eyebrow: { en: "Share the guess", ar: "شارك التخمين" },
    headings: { en: "Riddles for kids", ar: "ألغاز للأطفال مع الحل" },
    introductions: {
      en: "These clues invite children to look closely at the world they already know: a crayon, a lamp, a calendar, or a pair of socks. Later clues add simple counting and number puzzles for older children. Adults can read the clue while everyone races to a guess.",
      ar: "تدعو هذه التلميحات الأطفال إلى النظر جيداً في عالمهم المألوف: قلم شمع أو مصباح أو تقويم أو زوج من الجوارب، ثم تأتي ألغاز عدّ وأرقام بسيطة للأطفال الأكبر سناً. يمكن للكبار قراءة التلميح بينما يتسابق الجميع إلى التخمين.",
    },
    guidance: {
      en: "Give everyone time to answer, celebrate unusual guesses, and reveal the answer together rather than treating it like a test.",
      ar: "امنح الجميع وقتاً للإجابة، واحتفِ بالتخمينات غير المعتادة، ثم اكشفوا الحل معاً بدل التعامل معها كاختبار.",
    },
    subjects: { en: ["Kids’ riddles", "Everyday reasoning"], ar: ["ألغاز للأطفال", "استدلال يومي"] },
    cards: [
      ["kids-riddles", "kids-riddles-001"],
      ["kids-riddles", "kids-riddles-002"],
      ["kids-riddles", "kids-riddles-003"],
      ["kids-riddles", "kids-riddles-004"],
      ["kids-riddles", "kids-riddles-005"],
      ["kids-riddles", "kids-riddles-006"],
      ["kids-riddles", "kids-riddles-008"],
      ["kids-riddles", "kids-riddles-009"],
      ["kids-riddles", "kids-riddles-010"],
      ["kids-riddles", "kids-riddles-012"],
      ["kids-riddles", "kids-riddles-013"],
      ["kids-riddles", "kids-riddles-014"],
      ["kids-riddles", "kids-riddles-015"],
      ["kids-riddles", "kids-riddles-017"],
      ["kids-riddles", "kids-riddles-019"],
      ["kids-riddles", "kids-riddles-021"],
      ["kids-riddles", "kids-riddles-022"],
      ["kids-riddles", "kids-riddles-023"],
      ["kids-riddles", "kids-riddles-024"],
      ["kids-riddles", "kids-riddles-025"],
      ["kids-riddles", "kids-riddles-026"],
      ["kids-riddles", "kids-riddles-027"],
      ["kids-riddles", "kids-riddles-028"],
      ["kids-riddles", "kids-riddles-029"],
    ],
  },
  {
    key: "general-knowledge",
    // Expanded from 8 to 30 evergreen questions across 15 topics on 2026-10-23.
    // Arabic cards briefly used everyday Arabic (2026-10-21, #144) and returned
    // to Modern Standard Arabic on 2026-10-25.
    // Cards removed in the 2026-10-25 phase-2 content pass replaced with current cards of the same topic.
    // Search titles and descriptions rewritten for click-through on 2026-11-08.
    lastModified: "2026-11-08",
    paths: { en: "/general-knowledge", ar: "/ar/malumat-amma/" },
    titles: {
      en: "30 Arabic Trivia Questions & Answers | Riddle Arabia",
      ar: "30 سؤالاً ثقافياً ومعلومات عامة مع الأجوبة | ريدل أرابيا",
    },
    descriptions: {
      en: "How many of these 30 can you get right? Free trivia questions and answers in Arabic and English: geography, history, science, art and ancient civilizations.",
      ar: "كم سؤالاً من الثلاثين ستجيب عنه صحيحاً؟ أسئلة ثقافية مجانية مع الأجوبة بالعربية والإنجليزية في الجغرافيا والتاريخ والعلوم والفن والحضارات القديمة.",
    },
    eyebrow: { en: "A little of everything", ar: "قليل من كل شيء" },
    headings: { en: "Arabic trivia & general knowledge", ar: "أسئلة ثقافية ومعلومات عامة مع الأجوبة" },
    introductions: {
      en: "This Arabic trivia quiz is also available in English, so friends can enjoy the same questions in either language. Test what you remember about places, history, science, space, the human body, animals, art, and ancient civilizations, then reveal each answer when you are ready.",
      ar: "تجمع هذه المسابقة الثقافية أسئلة معلومات عامة بالعربية مع نسخة إنجليزية، ليتمكّن الأصدقاء من تجربة الأسئلة نفسها باللغة التي يفضّلونها. اختبر ما تتذكره عن الجغرافيا والتاريخ والعلوم والفضاء وجسم الإنسان والحيوانات والفن والحضارات القديمة، ثم اكشف كل إجابة عندما تكون مستعداً.",
    },
    guidance: {
      en: "Take turns reading the questions for a casual trivia game, or work through them at your own pace. If a question surprises you, follow its topic link to keep exploring.",
      ar: "تناوبوا على قراءة الأسئلة في مسابقة خفيفة، أو أجب عنها على مهل بمفردك. إذا أثار سؤال فضولك، فاتبع رابط موضوعه لمواصلة الاستكشاف.",
    },
    subjects: { en: ["Trivia", "General knowledge", "Geography", "History", "Science"], ar: ["مسابقات ثقافية", "معلومات عامة", "جغرافيا", "تاريخ", "علوم"] },
    cards: [
      ["geography", "geography-001"],
      ["space-and-astrology", "space-031"],
      ["art-and-painters", "art-and-painters-001"],
      ["biology", "biology-002"],
      ["ancient-civilizations", "anc-1"],
      ["chemistry", "chemistry-001"],
      ["geography", "geography-007"],
      ["science", "science-009"],
      ["animal-kingdom", "ani-5"],
      ["history", "history-001"],
      ["space-and-astrology", "space-032"],
      ["architecture-and-landmarks", "arc-6"],
      ["ancient-civilizations", "anc-6"],
      ["science", "science-001"],
      ["biology", "biology-001"],
      ["geography", "geography-002"],
      ["chemistry", "chemistry-007"],
      ["history", "history-006"],
      ["animal-kingdom", "ani-3"],
      ["inventions-and-minds", "inv-3"],
      ["space-and-astrology", "space-and-astrology-004"],
      ["art-and-painters", "art-and-painters-003"],
      ["animal-kingdom", "ani-2"],
      ["ancient-civilizations", "anc-5"],
      ["geology", "geology-008"],
      ["food-and-cuisines", "foo-13"],
      ["geography", "geography-021"],
      ["science", "science-006"],
      ["linguistics", "linguistics-2"],
      ["music-and-performing-arts", "mus-3"],
    ],
  },
  {
    key: "arabia-quiz",
    // Arabic cards briefly used everyday Arabic (2026-10-21, #144) and returned
    // to Modern Standard Arabic on 2026-10-25.
    // Card wording updated in the 2026-10-25 phase-2 content pass.
    // Expanded from 8 to 30 questions on 2026-11-08, ordered easy to very advanced, keeping the
    // existing focus on ancient civilizations, Islamic and Ottoman history, cities and scholarship.
    // Search titles and descriptions rewritten for click-through the same day.
    lastModified: "2026-11-08",
    paths: { en: "/arabia-quiz", ar: "/ar/tarikh-al-arab/" },
    titles: {
      en: "30 Arab & Middle East History Quiz Questions | Riddle Arabia",
      ar: "30 سؤالاً عن تاريخ العرب والشرق الأوسط مع الأجوبة | ريدل أرابيا",
    },
    descriptions: {
      en: "30 Arab and Middle East history questions with answers in Arabic and English, easy to expert: Mesopotamia, Islamic and Ottoman history, cities and scholarship.",
      ar: "30 سؤالاً عن تاريخ العرب والشرق الأوسط مع الأجوبة بالعربية والإنجليزية، من السهل إلى المتقدّم: بلاد الرافدين، والتاريخ الإسلامي والعثماني، والمدن والعلم.",
    },
    eyebrow: { en: "History with context", ar: "تاريخ في سياقه" },
    headings: { en: "Arab & Middle East history trivia", ar: "أسئلة عن تاريخ العرب والشرق الأوسط" },
    introductions: {
      en: "Explore the history of the Arab world and the wider Middle East through 30 trivia questions, ordered from easy to very advanced. They move from ancient Mesopotamia, Persia and Palmyra to Islamic history, the great cities of Baghdad, Cairo and Fez, Ottoman reforms, and the founding of modern Gulf states. Read in Arabic or English and reveal the answers as you go.",
      ar: "استكشف تاريخ العالم العربي والشرق الأوسط عبر 30 سؤالاً مرتّبة من السهل إلى المتقدّم. تنتقل الأسئلة من بلاد الرافدين وفارس وتدمر القديمة إلى التاريخ الإسلامي، ومدن بغداد والقاهرة وفاس، والإصلاحات العثمانية، وقيام دول الخليج الحديثة. اقرأ بالعربية أو الإنجليزية، واكشف الإجابات أثناء تقدّمك.",
    },
    guidance: {
      en: "Use this page for learning and conversation, not as a substitute for a full historical source. Open the answer only after forming your own response.",
      ar: "استخدم هذه الصفحة للتعلّم والنقاش، لا بديلاً عن مصدر تاريخي متكامل. اكشف الحل بعد أن تصوغ إجابتك الخاصة.",
    },
    subjects: { en: ["History trivia", "Arab history", "Middle East history", "Ancient civilizations"], ar: ["أسئلة تاريخية", "تاريخ العرب", "تاريخ الشرق الأوسط", "حضارات قديمة"] },
    cards: [
      // Easy
      ["middle-east-history", "me-hist-001"],
      ["middle-east-history", "me-hist-002"],
      ["middle-east-history", "me-hist-004"],
      ["middle-east-history", "me-hist-005"],
      ["middle-east-history", "me-hist-006"],
      ["middle-east-history", "me-hist-007"],
      ["middle-east-history", "me-hist-008"],
      ["middle-east-history", "me-hist-009"],
      ["middle-east-history", "me-hist-010"],
      // Medium
      ["middle-east-history", "me-hist-003"],
      ["middle-east-history", "me-hist-012"],
      ["middle-east-history", "me-hist-018"],
      ["middle-east-history", "me-hist-021"],
      ["middle-east-history", "me-hist-022"],
      ["middle-east-history", "me-hist-023"],
      ["middle-east-history", "me-hist-029"],
      ["middle-east-history", "me-hist-050"],
      // Hard
      ["middle-east-history", "me-hist-030"],
      ["middle-east-history", "me-hist-032"],
      ["middle-east-history", "me-hist-040"],
      ["middle-east-history", "me-hist-043"],
      ["middle-east-history", "me-hist-045"],
      ["middle-east-history", "me-hist-049"],
      ["middle-east-history", "me-hist-051"],
      // Very advanced
      ["middle-east-history", "me-hist-052"],
      ["middle-east-history", "me-hist-053"],
      ["middle-east-history", "me-hist-055"],
      ["middle-east-history", "me-hist-056"],
      ["middle-east-history", "me-hist-058"],
      ["middle-east-history", "me-hist-060"],
    ],
  },
  {
    key: "spacetoon-nostalgia",
    // Arabic cards briefly used everyday Arabic (2026-10-21, #144) and returned
    // to Modern Standard Arabic on 2026-10-25.
    // Cards removed in the 2026-10-25 phase-2 content pass replaced with current cards of the same topic.
    // Search titles and descriptions rewritten for click-through on 2026-11-08.
    lastModified: "2026-11-08",
    paths: { en: "/spacetoon-nostalgia", ar: "/ar/hanin-spacetoon/" },
    titles: {
      en: "Spacetoon Nostalgia Quiz: 8 Questions | Riddle Arabia",
      ar: "اختبار حنين سبيستون: 8 أسئلة | ريدل أرابيا",
    },
    descriptions: {
      en: "How much do you remember? 8 questions for fans of classic Arabic-dubbed animation, in Arabic and English. Guess, reveal the answers and share with friends.",
      ar: "كم تتذكر منها؟ 8 أسئلة لمحبي الرسوم المدبلجة الكلاسيكية بالعربية والإنجليزية. خمّن ثم اكشف الإجابات وشارك الاختبار مع أصدقائك.",
    },
    eyebrow: { en: "A shared memory", ar: "ذكرى مشتركة" },
    headings: { en: "Spacetoon nostalgia", ar: "حنين سبيستون" },
    introductions: {
      en: "Some shows become part of a generation’s shared language. This lighthearted quiz is a place to trade memories and test the details you still remember from Arabic-dubbed animation.",
      ar: "بعض البرامج تصبح جزءاً من اللغة المشتركة لجيل كامل. هذا الاختبار الخفيف مساحة لتبادل الذكريات واختبار التفاصيل التي ما زلت تتذكرها من الرسوم المدبلجة.",
    },
    guidance: {
      en: "Play for fun, compare memories with friends, and keep in mind that this is an independent fan-made quiz, not an official or affiliated publication.",
      ar: "العب من أجل المتعة وقارن ذكرياتك مع الأصدقاء، وتذكّر أن هذا اختبار مستقل من إعداد المعجبين وليس منشوراً رسمياً أو تابعاً لجهة ما.",
    },
    subjects: { en: ["Animation nostalgia", "Arabic-dubbed cartoons"], ar: ["حنين الرسوم المتحركة", "رسوم مدبلجة بالعربية"] },
    disclaimer: {
      en: "Independent fan-made quiz. Names and programmes mentioned belong to their respective owners; no affiliation or endorsement is implied.",
      ar: "اختبار مستقل من إعداد المعجبين. الأسماء والبرامج المذكورة ملك لأصحابها؛ ولا يُفهم منه أي ارتباط أو اعتماد رسمي.",
    },
    cards: [
      ["ayam-tayebeen", "ayt-001"],
      ["ayam-tayebeen", "ayt-002"],
      ["ayam-tayebeen", "ayt-003"],
      ["ayam-tayebeen", "ayt-004"],
      ["ayam-tayebeen", "ayt-005"],
      ["ayam-tayebeen", "ayt-010"],
      ["ayam-tayebeen", "ayt-008"],
      ["ayam-tayebeen", "ayt-009"],
    ],
  },
  {
    key: "math-riddles",
    // New collection on 2026-11-08: 30 math riddles and number puzzles from the Math topic,
    // ordered easy to hard. None of these cards is featured elsewhere.
    sitemapGeneration: "collections-2026-11",
    lastModified: "2026-11-08",
    paths: { en: "/math-riddles", ar: "/ar/alghaz-riyadiyat/" },
    titles: {
      en: "30 Math Riddles With Answers, Easy to Hard | Riddle Arabia",
      ar: "30 لغزاً رياضياً مع الحل من السهل إلى الصعب | ريدل أرابيا",
    },
    descriptions: {
      en: "30 math riddles and number puzzles with answers in English and Arabic: the bat and ball, the missing dollar, the clock hands and more. Work it out, then reveal.",
      ar: "30 لغزاً رياضياً ولغز أرقام مع الحل بالعربية والإنجليزية: المضرب والكرة، والدولار المفقود، وعقارب الساعة وغيرها. احسبها بنفسك، ثم اكشف الحل.",
    },
    eyebrow: { en: "Numbers that trick you", ar: "أرقام تخدعك" },
    headings: { en: "Math riddles with answers", ar: "ألغاز رياضية مع الحل" },
    introductions: {
      en: "These math riddles need no formulas, only careful thinking about numbers. The list starts with quick arithmetic traps and counting puzzles, moves through classic word problems about trains, ropes and handshakes, and ends with harder problems about clock hands, magic squares and probability. Read each one in English or Arabic, work it out on paper, then reveal the answer with its explanation.",
      ar: "لا تحتاج هذه الألغاز الرياضية إلى معادلات، بل إلى تفكير دقيق في الأرقام. تبدأ القائمة بفخاخ حسابية سريعة وألغاز عدّ، ثم تنتقل إلى مسائل كلامية كلاسيكية عن القطارات والحبال والمصافحات، وتنتهي بمسائل أصعب عن عقارب الساعة والمربعات السحرية والاحتمالات. اقرأ كل لغز بالعربية أو الإنجليزية، واحسبه على الورق، ثم اكشف الحل مع شرحه.",
    },
    guidance: {
      en: "Write the numbers down before you answer; most of these riddles are designed so the first answer that comes to mind is wrong. Each answer includes a short explanation, and the full Math topic has 120 more questions.",
      ar: "اكتب الأرقام قبل أن تجيب؛ فمعظم هذه الألغاز مصمّمة بحيث تكون الإجابة الأولى التي تخطر في البال خاطئة. يتضمّن كل حل شرحاً قصيراً، ويضم موضوع الرياضيات الكامل 120 سؤالاً آخر.",
    },
    subjects: { en: ["Math riddles", "Number puzzles", "Arithmetic", "Logic"], ar: ["ألغاز رياضية", "ألغاز أرقام", "حساب", "منطق"] },
    cards: [
      // Easy
      ["math", "math-001"],
      ["math", "math-002"],
      ["math", "math-101"],
      ["math", "math-103"],
      ["math", "math-104"],
      ["math", "math-020"],
      ["math", "math-031"],
      ["math", "math-012"],
      ["math", "math-025"],
      ["math", "math-047"],
      ["math", "math-030"],
      // Medium
      ["math", "math-016"],
      ["math", "math-054"],
      ["math", "math-052"],
      ["math", "math-035"],
      ["math", "math-036"],
      ["math", "math-037"],
      ["math", "math-110"],
      ["math", "math-112"],
      ["math", "math-113"],
      ["math", "math-117"],
      ["math", "math-123"],
      ["math", "math-127"],
      // Hard
      ["math", "math-039"],
      ["math", "math-153"],
      ["math", "math-157"],
      ["math", "math-155"],
      ["math", "math-156"],
      ["math", "math-159"],
      ["math", "math-152"],
    ],
  },
  {
    key: "hard-riddles",
    // New collection on 2026-11-08: 30 hard riddles and brain teasers drawn from the Classic
    // Riddles and Logic Puzzles topics, none of which is featured on another collection.
    sitemapGeneration: "collections-2026-11",
    lastModified: "2026-11-08",
    paths: { en: "/hard-riddles", ar: "/ar/alghaz-saaba/" },
    titles: {
      en: "30 Hard Riddles With Answers (Brain Teasers) | Riddle Arabia",
      ar: "30 لغزاً صعباً مع الحل: ألغاز ذكاء للكبار | ريدل أرابيا",
    },
    descriptions: {
      en: "30 hard riddles with answers in English and Arabic for adults who find easy riddles boring: three boxes, twelve balls, the bridge at night and more.",
      ar: "30 لغزاً صعباً مع الحل بالعربية والإنجليزية، لمن يملّ من الألغاز السهلة: الصناديق الثلاثة، والكرات الاثنتا عشرة، والجسر ليلاً وغيرها من ألغاز الذكاء الكلاسيكية.",
    },
    eyebrow: { en: "For stubborn solvers", ar: "لمن لا يستسلم" },
    headings: { en: "Hard riddles with answers", ar: "ألغاز صعبة مع الحل" },
    introductions: {
      en: "These are the riddles people argue about. They start with tricky number and deduction puzzles, then move to famous brain teasers: the three mislabelled boxes, the knights and knaves, the two hourglasses, the twelve balls and the bridge crossing at night. Each one is written in English and Arabic, and every answer explains the reasoning, so you can check your logic rather than just the result.",
      ar: "هذه هي الألغاز التي يتجادل الناس حولها. تبدأ بألغاز أرقام واستنتاج ماكرة، ثم تنتقل إلى ألغاز ذكاء مشهورة: الصناديق الثلاثة الخاطئة التسمية، والفرسان والكذّابون، والساعتان الرمليتان، والكرات الاثنتا عشرة، وعبور الجسر ليلاً. كل لغز مكتوب بالعربية والإنجليزية، ويشرح كل حل طريقة التفكير، لتتحقّق من منطقك لا من النتيجة فقط.",
    },
    guidance: {
      en: "Do not rush. Write down what the riddle actually states, separate it from what you assume, and only then open the answer. If you solve the last five without help, you are in rare company.",
      ar: "لا تستعجل. اكتب ما يقوله اللغز فعلاً، وافصله عمّا تفترضه، ثم افتح الحل. وإن حللت الخمسة الأخيرة من دون مساعدة، فأنت من القلّة.",
    },
    subjects: { en: ["Hard riddles", "Brain teasers", "Logic", "Deduction"], ar: ["ألغاز صعبة", "ألغاز ذكاء", "منطق", "استنتاج"] },
    cards: [
      // Warm-up: medium
      ["classic-riddles", "classic-riddles-051"],
      ["logic-puzzles", "logic-puzzles-016"],
      ["logic-puzzles", "logic-puzzles-027"],
      ["logic-puzzles", "logic-puzzles-026"],
      ["logic-puzzles", "logic-puzzles-031"],
      ["logic-puzzles", "logic-puzzles-035"],
      ["logic-puzzles", "logic-puzzles-025"],
      ["logic-puzzles", "logic-puzzles-020"],
      // Hard
      ["classic-riddles", "classic-riddles-070"],
      ["logic-puzzles", "logic-puzzles-056"],
      ["logic-puzzles", "logic-puzzles-038"],
      ["logic-puzzles", "logic-puzzles-040"],
      ["logic-puzzles", "logic-puzzles-062"],
      ["logic-puzzles", "logic-puzzles-061"],
      ["classic-riddles", "classic-riddles-102"],
      ["classic-riddles", "classic-riddles-096"],
      ["classic-riddles", "classic-riddles-082"],
      // Very advanced
      ["classic-riddles", "classic-riddles-079"],
      ["logic-puzzles", "logic-puzzles-060"],
      ["classic-riddles", "classic-riddles-085"],
      ["classic-riddles", "classic-riddles-077"],
      ["classic-riddles", "classic-riddles-099"],
      ["logic-puzzles", "logic-puzzles-064"],
      ["logic-puzzles", "logic-puzzles-063"],
      ["logic-puzzles", "logic-puzzles-065"],
      ["logic-puzzles", "logic-puzzles-066"],
      ["logic-puzzles", "logic-puzzles-067"],
      ["logic-puzzles", "logic-puzzles-054"],
      ["logic-puzzles", "logic-puzzles-068"],
      ["logic-puzzles", "logic-puzzles-052"],
    ],
  },
  {
    key: "science-trivia",
    // New collection on 2026-11-09: 30 science questions from the Science topic, easy to expert.
    sitemapGeneration: "collections-2026-11b",
    lastModified: "2026-11-09",
    paths: { en: "/science-trivia", ar: "/ar/asila-ilmiya/" },
    titles: {
      en: "30 Science Trivia Questions & Answers | Riddle Arabia",
      ar: "30 سؤالاً علمياً مع الأجوبة | ريدل أرابيا",
    },
    descriptions: {
      en: "30 science trivia questions with answers in English and Arabic: why the sky is blue, what a mirage really is, why pasta cooks slowly up a mountain. Easy to expert.",
      ar: "30 سؤالاً علمياً مع الأجوبة بالعربية والإنجليزية: لماذا السماء زرقاء، وما حقيقة السراب، ولماذا يتأخر نضج المعكرونة في الجبال. من السهل إلى المتقدّم.",
    },
    eyebrow: { en: "Everyday things, explained", ar: "أشياء يومية مشروحة" },
    headings: { en: "Science trivia questions with answers", ar: "أسئلة علمية مع الأجوبة" },
    introductions: {
      en: "These science questions start with the basics of states of matter, forces and the body, move through the physics behind everyday sights such as rainbows, sirens and a blue sky, and end with harder ideas from relativity and quantum physics and two scholars, Ibn Sahl and Ole Rømer, whose measurements changed what we know about light. Each answer explains the idea, not just the word.",
      ar: "تبدأ هذه الأسئلة العلمية بأساسيات حالات المادة والقوى وجسم الإنسان، ثم تنتقل إلى الفيزياء وراء مشاهد يومية مثل قوس قزح وصفّارة الإسعاف وزرقة السماء، وتنتهي بأفكار أصعب من النسبية وفيزياء الكم، وبعالمين، ابن سهل وأولي رومر، غيّرت قياساتهما ما نعرفه عن الضوء. يشرح كل جواب الفكرة لا الكلمة فقط.",
    },
    guidance: {
      en: "Guess the explanation before you reveal it; the point is the why, not the term. The full Science topic has 80 questions, and Chemistry, Biology and Space have their own.",
      ar: "خمّن التفسير قبل أن تكشفه؛ فالمقصود هو السبب لا المصطلح. يضم موضوع العلوم الكامل 80 سؤالاً، ولكلٍّ من الكيمياء والأحياء والفضاء موضوعه الخاص.",
    },
    subjects: { en: ["Science trivia", "Physics", "Chemistry", "Biology"], ar: ["أسئلة علمية", "فيزياء", "كيمياء", "أحياء"] },
    cards: [
      // Easy
      ["science", "science-007"],
      ["science", "science-008"],
      ["science", "science-003"],
      ["science", "science-033"],
      ["science", "science-039"],
      ["science", "science-038"],
      ["science", "science-045"],
      ["science", "science-040"],
      ["science", "physical-and-life-sciences-001"],
      // Medium
      ["science", "science-011"],
      ["science", "science-012"],
      ["science", "science-013"],
      ["science", "science-014"],
      ["science", "science-016"],
      ["science", "science-017"],
      ["science", "science-058"],
      ["science", "science-060"],
      ["science", "science-056"],
      ["science", "science-029"],
      // Hard
      ["science", "science-021"],
      ["science", "science-022"],
      ["science", "science-101"],
      ["science", "science-103"],
      ["science", "science-104"],
      ["science", "science-105"],
      ["science", "science-106"],
      // Very advanced
      ["science", "science-110"],
      ["science", "science-111"],
      ["science", "science-113"],
      ["science", "science-114"],
    ],
  },
  {
    key: "geography-quiz",
    // New collection on 2026-11-09: 30 geography questions from the Geography topic, easy to expert.
    sitemapGeneration: "collections-2026-11b",
    lastModified: "2026-11-09",
    paths: { en: "/geography-quiz", ar: "/ar/asila-jughrafiya/" },
    titles: {
      en: "30 Geography Quiz Questions & Answers | Riddle Arabia",
      ar: "30 سؤالاً في الجغرافيا مع الأجوبة | ريدل أرابيا",
    },
    descriptions: {
      en: "30 geography quiz questions with answers in English and Arabic: capitals, oceans, deserts and straits, from the Sahara to the river that crosses the equator twice.",
      ar: "30 سؤالاً في الجغرافيا مع الأجوبة بالعربية والإنجليزية: عواصم ومحيطات وصحارى ومضائق، من الصحراء الكبرى إلى النهر الذي يعبر خط الاستواء مرتين.",
    },
    eyebrow: { en: "Around the world in 30", ar: "حول العالم في 30 سؤالاً" },
    headings: { en: "Geography quiz questions with answers", ar: "أسئلة في الجغرافيا مع الأجوبة" },
    introductions: {
      en: "This geography quiz starts with the capitals, oceans and deserts most people know, then works through the Arab world's straits and sand seas, the largest landlocked country and the deepest lake, and ends with questions that catch even keen travellers: the only country entirely above 1,000 metres, the river that crosses the equator twice, and the largest country with no permanent river. Answers are explained in English and Arabic.",
      ar: "يبدأ اختبار الجغرافيا هذا بالعواصم والمحيطات والصحارى التي يعرفها معظم الناس، ثم يمرّ بمضائق العالم العربي وبحار رماله، وأكبر دولة حبيسة وأعمق بحيرة، وينتهي بأسئلة تُحيّر حتى المسافرين المتمرّسين: الدولة الوحيدة التي تقع أراضيها كلها فوق 1000 متر، والنهر الذي يعبر خط الاستواء مرتين، وأكبر دولة من دون نهر دائم. الأجوبة مشروحة بالعربية والإنجليزية.",
    },
    guidance: {
      en: "Picture the map before you answer. The full Geography topic has 100 questions, and Flags has its own collection.",
      ar: "تخيّل الخريطة قبل أن تجيب. يضم موضوع الجغرافيا الكامل 100 سؤال، وللأعلام مجموعتها الخاصة.",
    },
    subjects: { en: ["Geography quiz", "Capitals", "Oceans and seas", "Deserts and mountains"], ar: ["أسئلة جغرافيا", "عواصم", "محيطات وبحار", "صحارى وجبال"] },
    cards: [
      // Easy
      ["geography", "geography-013"],
      ["geography", "geography-037"],
      ["geography", "geography-042"],
      ["geography", "geography-029"],
      ["geography", "geography-032"],
      ["geography", "geography-044"],
      ["geography", "geography-033"],
      ["geography", "geography-055"],
      ["geography", "geography-043"],
      // Medium
      ["geography", "geography-004"],
      ["geography", "geography-012"],
      ["geography", "geography-046"],
      ["geography", "geography-048"],
      ["geography", "geography-049"],
      ["geography", "geography-056"],
      ["geography", "geography-059"],
      ["geography", "geography-062"],
      ["geography", "geography-036"],
      ["geography", "geography-019"],
      // Hard
      ["geography", "geography-011"],
      ["geography", "geography-023"],
      ["geography", "geography-026"],
      ["geography", "geography-064"],
      ["geography", "geography-072"],
      ["geography", "geography-065"],
      ["geography", "geography-091"],
      // Very advanced
      ["geography", "geography-006"],
      ["geography", "geography-040"],
      ["geography", "geography-031"],
      ["geography", "geography-057"],
    ],
  },
  {
    key: "football-quiz",
    // New collection on 2026-11-09: 30 football questions from the Football topic, easy to expert. Cards tied to 2025-26 results are left out so the page stays true without upkeep.
    sitemapGeneration: "collections-2026-11b",
    lastModified: "2026-11-09",
    paths: { en: "/football-quiz", ar: "/ar/asila-kurat-alqadam/" },
    titles: {
      en: "30 Football Quiz Questions & Answers | Riddle Arabia",
      ar: "30 سؤالاً في كرة القدم مع الأجوبة | ريدل أرابيا",
    },
    descriptions: {
      en: "30 football quiz questions with answers in English and Arabic: World Cup history, famous finals, Arab football moments and the rules, easy to expert.",
      ar: "30 سؤالاً في كرة القدم مع الأجوبة بالعربية والإنجليزية: تاريخ كأس العالم ونهائيات شهيرة ولحظات عربية وقواعد اللعبة، من السهل إلى المتقدّم.",
    },
    eyebrow: { en: "From the terraces", ar: "من المدرجات" },
    headings: { en: "Football quiz questions with answers", ar: "أسئلة في كرة القدم مع الأجوبة" },
    introductions: {
      en: "This football quiz opens with the basics every fan knows, then moves through the great finals, the managers and the derbies, with a strong thread of Arab football: Al-Dawsari's winner against Argentina, Al-Owairan's solo goal, Algeria beating West Germany in 1982, and Madjer's backheel in a European Cup final. It ends with questions for the historians: the only player to win the Champions League with three clubs, Pelé's real name and the first Arab team at a World Cup. Answers are explained in English and Arabic.",
      ar: "يفتتح اختبار كرة القدم هذا بالأساسيات التي يعرفها كل مشجع، ثم يمرّ بالنهائيات الكبرى والمدرّبين والديربيات، مع خيط عربي قوي: هدف الدوسري في مرمى الأرجنتين، وهدف العويران الفردي، وفوز الجزائر على ألمانيا الغربية عام 1982، وكعب ماجر في نهائي كأس أوروبا. وينتهي بأسئلة لعشّاق التاريخ: اللاعب الوحيد الذي فاز بدوري الأبطال مع ثلاثة أندية، واسم بيليه الحقيقي، وأول منتخب عربي في كأس العالم. الأجوبة مشروحة بالعربية والإنجليزية.",
    },
    guidance: {
      en: "Settle the argument before you reveal the answer. The full Football topic has 160 questions, and Battle rooms let you play a friend live.",
      ar: "احسم الجدل قبل أن تكشف الجواب. يضم موضوع كرة القدم الكامل 160 سؤالاً، وتتيح لك غرف المواجهة اللعب مع صديق مباشرة.",
    },
    subjects: { en: ["Football quiz", "World Cup", "Champions League", "Arab football"], ar: ["أسئلة كرة القدم", "كأس العالم", "دوري الأبطال", "الكرة العربية"] },
    cards: [
      // Easy
      ["football", "football-001"],
      ["football", "football-004"],
      ["football", "football-019"],
      ["football", "football-051"],
      ["football", "football-052"],
      ["football", "football-057"],
      ["football", "football-071"],
      ["football", "football-117"],
      ["football", "football-bw-025"],
      // Medium
      ["football", "football-021"],
      ["football", "football-012"],
      ["football", "football-014"],
      ["football", "football-017"],
      ["football", "football-039"],
      ["football", "football-040"],
      ["football", "football-070"],
      ["football", "football-105"],
      ["football", "football-045"],
      ["football", "football-111"],
      // Hard
      ["football", "football-016"],
      ["football", "football-026"],
      ["football", "football-032"],
      ["football", "football-112"],
      ["football", "football-132"],
      ["football", "football-141"],
      ["football", "football-150"],
      // Very advanced
      ["football", "football-102"],
      ["football", "football-122"],
      ["football", "football-152"],
      ["football", "football-155"],
    ],
  },
  {
    key: "flags-quiz",
    // New collection on 2026-11-09: 30 flag questions from the Flags topic, easy to expert.
    sitemapGeneration: "collections-2026-11b",
    lastModified: "2026-11-09",
    paths: { en: "/flags-quiz", ar: "/ar/alam-alduwal/" },
    titles: {
      en: "30 Flag Quiz Questions & Answers (World Flags) | Riddle Arabia",
      ar: "30 سؤالاً عن أعلام الدول مع الأجوبة | ريدل أرابيا",
    },
    descriptions: {
      en: "30 flag quiz questions with answers in English and Arabic: the Nordic cross, the Pan-Arab colours, the dagger on Oman's flag and the only flag that is not a rectangle.",
      ar: "30 سؤالاً عن أعلام الدول مع الأجوبة بالعربية والإنجليزية: الصليب الإسكندنافي، والألوان العربية، والخنجر على علم عُمان، والعلم الوحيد الذي ليس مستطيلاً.",
    },
    eyebrow: { en: "Know your colours", ar: "اعرف الألوان" },
    headings: { en: "Flag quiz questions with answers", ar: "أسئلة عن أعلام الدول مع الأجوبة" },
    introductions: {
      en: "This flag quiz starts with the flags everyone recognises, then the stories behind them: why the Gulf flags share a palette, which country's flag is square and which is two pennants, what the Pan-Arab colours mean, and what the five points on Bahrain's flag stand for. It ends with the details only flag enthusiasts know. Every answer is explained in English and Arabic.",
      ar: "يبدأ اختبار الأعلام هذا بالأعلام التي يعرفها الجميع، ثم بالقصص التي خلفها: لماذا تتشارك أعلام الخليج ألوانها، وأي دولة علمها مربع وأيها علمها رايتان مثلثتان، وما معنى الألوان العربية، وما الذي ترمز إليه النقاط الخمس في علم البحرين. وينتهي بتفاصيل لا يعرفها إلا هواة الأعلام. كل جواب مشروح بالعربية والإنجليزية.",
    },
    guidance: {
      en: "Picture the flag before you answer. The full Flags topic has 40 questions, and Geography has its own collection.",
      ar: "تخيّل العلم قبل أن تجيب. يضم موضوع الأعلام الكامل 40 سؤالاً، وللجغرافيا مجموعتها الخاصة.",
    },
    subjects: { en: ["Flag quiz", "World flags", "Arab flags", "Vexillology"], ar: ["أسئلة أعلام", "أعلام العالم", "أعلام عربية", "علم الأعلام"] },
    cards: [
      // Easy
      ["flag-questions", "flag-questions-001"],
      ["flag-questions", "flag-questions-002"],
      ["flag-questions", "flag-questions-003"],
      ["flag-questions", "flag-questions-005"],
      ["flag-questions", "flag-questions-008"],
      ["flag-questions", "flag-questions-010"],
      ["flag-questions", "flag-questions-017"],
      ["flag-questions", "flag-questions-030"],
      ["flag-questions", "flag-questions-031"],
      // Medium
      ["flag-questions", "flag-questions-006"],
      ["flag-questions", "flag-questions-009"],
      ["flag-questions", "flag-questions-011"],
      ["flag-questions", "flag-questions-013"],
      ["flag-questions", "flag-questions-014"],
      ["flag-questions", "flag-questions-016"],
      ["flag-questions", "flag-questions-018"],
      ["flag-questions", "flag-questions-019"],
      ["flag-questions", "flag-questions-029"],
      // Hard
      ["flag-questions", "flag-questions-012"],
      ["flag-questions", "flag-questions-021"],
      ["flag-questions", "flag-questions-022"],
      ["flag-questions", "flag-questions-024"],
      ["flag-questions", "flag-questions-032"],
      ["flag-questions", "flag-questions-033"],
      ["flag-questions", "flag-questions-034"],
      // Very advanced
      ["flag-questions", "flag-questions-028"],
      ["flag-questions", "flag-questions-035"],
      ["flag-questions", "flag-questions-036"],
      ["flag-questions", "flag-questions-037"],
      ["flag-questions", "flag-questions-040"],
    ],
  },
  {
    key: "brain-games",
    // Game names changed on 2026-10-25 (see site-worker/src/seo-route-migrations.js).
    // Search title and description rewritten for click-through on 2026-11-08.
    lastModified: "2026-11-08",
    paths: { en: "/brain-games", ar: "/ar/alab-al-dimagh/" },
    kind: "games",
    titles: {
      en: "Play Free Brain Games: Crosswords, Sudoku & More | Riddle Arabia",
      ar: "ألعاب ذكاء مجانية: كلمات متقاطعة وسودوكو والمزيد | ريدل أرابيا",
    },
    descriptions: {
      en: "Free brain games in Arabic and English, no download or sign-up: crosswords, Sudoku, word games and logic puzzles. Try a daily pick or challenge a friend to Word Duel.",
      ar: "ألعاب ذكاء مجانية بالعربية والإنجليزية من دون تنزيل أو تسجيل: كلمات متقاطعة وسودوكو وألعاب كلمات وألغاز منطق. جرّب اختيار اليوم أو تحدَّ صديقاً في مبارزة الكلمات.",
    },
    eyebrow: { en: "Games", ar: "الألعاب" },
    headings: { en: "Brain games in Arabic and English", ar: "ألعاب ذكاء بالعربية والإنجليزية" },
    introductions: {
      en: "Choose a free game for a short break or a longer challenge, in Arabic or English. Start with a Quick Crossword, solve Sudoku, connect words by theme, or invite a friend to Word Duel. You can also connect clues in Akshifha or settle in with chess and backgammon.",
      ar: "اختر لعبة مجانية لاستراحة قصيرة أو تحدٍّ أطول، بالعربية أو الإنجليزية. ابدأ بكلمات متقاطعة سريعة، أو حلّ سودوكو، أو اربط الكلمات حسب موضوعها، أو ادعُ صديقاً إلى مبارزة الكلمات. ويمكنك أيضاً ربط الأدلة في اكشفها أو الاستمتاع بالشطرنج وطاولة الزهر.",
    },
    guidance: {
      en: "Daily puzzle selections rotate through finite collections or use generated boards; they are not newly published puzzles every day. Solo puzzle progress stays on this device. Word Duel uses an online room for two players. Akshifha rotates through eleven existing cases, separately from Shuffle Challenge.",
      ar: "تتناوب ألغاز اليوم ضمن مجموعات محدودة أو تستخدم لوحات مولّدة؛ ولا تعني نشر ألغاز جديدة كل يوم. يبقى تقدّم الألغاز الفردية محفوظاً على هذا الجهاز. وتستخدم مبارزة الكلمات غرفة عبر الإنترنت للاعبين. أما اكشفها فتتناوب بين إحدى عشرة قضية موجودة، بصورة منفصلة عن تحدي الخلطة.",
    },
  },
]);

// This is the promoted portfolio, not a registry of every preserved game URL.
export const RIDDLE_ARABIA_GAME_CATALOG = Object.freeze([
  {
    slug: "most-likely-to",
    kind: "party",
    names: { en: PARTY_COPY.en.mostTitle, ar: PARTY_COPY.ar.mostTitle },
    descriptions: {
      en: "Vote for the friend most likely to pull off each outrageous scenario. Original questions, dramatic reveals and group play on one phone, free in Arabic and English.",
      ar: "صوّتوا للصديق الذي تتوقّعون منه كل موقف طريف ومفاجئ. أسئلة أصلية وكشف للتصويت ولعب جماعي على هاتف واحد، مجاناً بالعربية والإنجليزية.",
    },
    lastModified: "2026-10-07",
  },
  {
    slug: "how-well-do-you-know-me",
    kind: "party",
    names: { en: PARTY_COPY.en.knowTitle, ar: PARTY_COPY.ar.knowTitle },
    descriptions: {
      en: "Make a ten-question friendship quiz, choose your answers and challenge friends with a link. Reveal scores and see who knows you best, free in Arabic and English.",
      ar: "اصنع اختبار صداقة من عشرة أسئلة واختر إجاباتك وتحدَّ أصدقاءك برابط. اكشفوا النتائج واعرفوا من يعرفك أكثر، مجاناً بالعربية والإنجليزية.",
    },
    lastModified: "2026-10-07",
  },
  {
    slug: "secret-word-impostor",
    kind: "party",
    names: { en: FRIENDSHIP_COPY.en.impostor.title, ar: FRIENDSHIP_COPY.ar.impostor.title },
    descriptions: {
      en: "One player does not know the secret word. Give clever clues, spot the bluff, and vote before the impostor figures it out.",
      ar: "لا يعرف لاعب واحد الكلمة السرية. قدّموا تلميحات دون ذكرها، ثم صوّتوا لاكتشاف المندسّ.",
    },
    lastModified: "2026-10-07",
  },
  {
    slug: "panic-mode",
    kind: "party",
    names: { en: FRIENDSHIP_COPY.en.panic.title, ar: FRIENDSHIP_COPY.ar.panic.title },
    descriptions: {
      en: "A fast friendship game: name three things before five seconds disappear, then let your friends decide if you made it.",
      ar: "لعبة أصدقاء سريعة: اذكر ثلاثة أشياء قبل انتهاء خمس ثوانٍ، ثم يقرر أصدقاؤك إن نجحت.",
    },
    lastModified: "2026-10-07",
  },
  {
    slug: "friendship-court",
    kind: "party",
    names: { en: FRIENDSHIP_COPY.en.court.title, ar: FRIENDSHIP_COPY.ar.court.title },
    descriptions: {
      en: "Put playful fictional crimes on trial, hear the defence, and reveal the jury’s secret verdict on one phone.",
      ar: "اقرأوا التهمة الطريفة واستمعوا إلى دفاع المتهم، ثم مرّروا الهاتف ليصوّت بقية اللاعبين سرًا.",
    },
    lastModified: "2026-10-07",
  },
  {
    slug: "akshifha",
    kind: "featured",
    names: { en: "Akshifha — spot the contradiction", ar: "اكشفها — اكتشف التناقض" },
    descriptions: {
      en: "Inspect the evidence, connect two clues, and choose the conclusion they support. Eleven free cases in Arabic and English, with no timer or sign-up.",
      ar: "تفحّص الأدلة واربط دليلين واختر الاستنتاج الذي يدعمانه. إحدى عشرة قضية مجانية بالعربية والإنجليزية بلا مؤقّت أو تسجيل.",
    },
  },
  {
    slug: "chess",
    kind: "classic",
    names: { en: "Chess", ar: "الشطرنج" },
    descriptions: {
      en: "Plan your next move. Play the computer or take turns with a friend on one device.",
      ar: "خطّط لنقلتك التالية. العب ضد الكمبيوتر أو تناوب مع صديق على جهاز واحد.",
    },
  },
  {
    slug: "backgammon",
    kind: "classic",
    names: { en: "Backgammon", ar: "طاولة الزهر" },
    descriptions: {
      en: "A simplified browser adaptation. Roll the dice and race your checkers home against the computer.",
      ar: "نسخة متصفح مبسطة. ارمِ النرد وسابق الكمبيوتر لإخراج أحجارك من اللوحة.",
    },
  },
]);

// Preserve known, indexable URLs during the portfolio transition. Removing a
// game from discovery must not silently delete it or redirect its visitors.
export const PRESERVED_GAME_SLUGS = Object.freeze([
  "code-breaker", "go", "reversi", "spy-words", "island-traders", "triple-match", "fireworks", "alliances",
]);

export const RETIRED_LEGACY_SEO_DIRECTORIES = Object.freeze([
  "en",
  "ar/alghaz-ma-alhal",
  "ar/alghaz-lil-atfal-ma-alhal",
  "ar/alghaz-mantiqiyya-ma-alhal",
  "ar/asila-amma-wa-ajwiba",
  "ar/ikhtibar-spacetoon",
  "ar/ikhtibar-qawanin-korat-alqadam",
]);
