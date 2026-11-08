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
