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
    lastModified: "2026-10-23",
    paths: { en: "/riddles", ar: "/ar/alghaz/" },
    titles: {
      en: "Riddles With Answers | Riddle Arabia",
      ar: "ألغاز مع الحل | ريدل أرابيا",
    },
    descriptions: {
      en: "Solve free riddles with answers in English and Arabic, from easy everyday clues to hard number and logic riddles. Make your guess, then reveal each answer when you are ready.",
      ar: "حلّ ألغازاً مع الحل بالعربية والإنجليزية مجاناً، من ألغاز سهلة عن الأشياء اليومية إلى ألغاز صعبة في الأرقام والمنطق. خمّن أولاً، ثم اكشف إجابة كل لغز.",
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
      ["classic-riddles", "classic-riddles-012"],
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
      ["classic-riddles", "classic-riddles-060"],
      ["classic-riddles", "classic-riddles-095"],
      ["classic-riddles", "classic-riddles-066"],
      ["classic-riddles", "classic-riddles-072"],
      ["classic-riddles", "classic-riddles-029"],
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
    lastModified: "2026-10-23",
    paths: { en: "/arabic-riddles", ar: "/ar/alghaz-arabiya/" },
    titles: {
      en: "Arabic Riddles With Answers | Riddle Arabia",
      ar: "ألغاز عربية مع الحل | ريدل أرابيا",
    },
    descriptions: {
      en: "Try free Arabic riddles with answers and English translations. Solve clues about familiar objects, words, and ideas on your own or with friends.",
      ar: "جرّب ألغازاً عربية مع الحل وترجمة إنجليزية مجاناً. خمّن إجابات ألغاز عن الأشياء المألوفة والكلمات والأفكار، بمفردك أو مع الأصدقاء.",
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
      ["classic-riddles", "classic-riddles-010"],
      ["classic-riddles", "classic-riddles-094"],
      ["classic-riddles", "classic-riddles-032"],
      ["classic-riddles", "classic-riddles-028"],
      ["classic-riddles", "classic-riddles-031"],
      ["classic-riddles", "classic-riddles-039"],
      ["classic-riddles", "classic-riddles-074"],
      ["classic-riddles", "classic-riddles-035"],
      ["classic-riddles", "classic-riddles-043"],
      ["classic-riddles", "classic-riddles-005"],
      ["classic-riddles", "classic-riddles-006"],
      ["classic-riddles", "classic-riddles-016"],
      ["classic-riddles", "classic-riddles-022"],
      ["classic-riddles", "classic-riddles-007"],
      ["classic-riddles", "classic-riddles-049"],
      ["classic-riddles", "classic-riddles-064"],
      ["classic-riddles", "classic-riddles-093"],
      ["classic-riddles", "classic-riddles-076"],
      ["classic-riddles", "classic-riddles-089"],
      ["classic-riddles", "classic-riddles-019"],
      ["classic-riddles", "classic-riddles-015"],
      ["classic-riddles", "classic-riddles-021"],
    ],
  },
  {
    key: "logic-puzzles",
    // Expanded from 8 to 30 puzzles, easy to hard, on 2026-10-23.
    lastModified: "2026-10-23",
    paths: { en: "/logic-challenges", ar: "/ar/alghaz-mantiq/" },
    titles: {
      en: "Logic Puzzles and Brain Teasers With Answers | Riddle Arabia",
      ar: "ألغاز منطقية وألغاز ذكاء مع الحل | ريدل أرابيا",
    },
    descriptions: {
      en: "Logic puzzles and brain teasers with answers in English and Arabic, from easy to hard: deduction, numbers, and lateral thinking that reward careful reading before you reveal the answer.",
      ar: "ألغاز منطقية وألغاز ذكاء مع الحل بالعربية والإنجليزية، من السهل إلى الصعب: استنتاج وأرقام وتفكير جانبي يكافئ القراءة الدقيقة قبل كشف الحل.",
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
      ["logic-puzzles", "logic-puzzles-028"],
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
    lastModified: "2026-10-23",
    paths: { en: "/family-riddles", ar: "/ar/alghaz-atfal/" },
    titles: {
      en: "Riddles for Kids With Answers | Riddle Arabia",
      ar: "ألغاز للأطفال مع الحل | ريدل أرابيا",
    },
    descriptions: {
      en: "Enjoy bilingual riddles for kids with answers: familiar objects, everyday observation, and simple counting and logic puzzles—ideal for families and classrooms.",
      ar: "ألغاز للأطفال مع الحل بالعربية والإنجليزية: أشياء مألوفة وملاحظات يومية وألغاز عدّ ومنطق بسيطة، مناسبة للعائلة والصف.",
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
    // Arabic cards rewritten in light everyday Arabic on 2026-10-21 (#144).
    // Expanded from 8 to 30 evergreen questions across 15 topics on 2026-10-23.
    lastModified: "2026-10-23",
    paths: { en: "/general-knowledge", ar: "/ar/malumat-amma/" },
    titles: {
      en: "Arabic Trivia & General Knowledge Quiz | Riddle Arabia",
      ar: "أسئلة ثقافية ومعلومات عامة مع الأجوبة | ريدل أرابيا",
    },
    descriptions: {
      en: "Test your general knowledge with free trivia questions and answers in Arabic and English: geography, history, science, space, the human body, art, and ancient civilizations. Great for family quiz nights.",
      ar: "اختبر ثقافتك بأسئلة ثقافية ومعلومات عامة مع الأجوبة بالعربية والإنجليزية مجاناً: الجغرافيا والتاريخ والعلوم والفضاء وجسم الإنسان والفن والحضارات القديمة. مناسبة للمسابقات العائلية.",
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
      ["biology", "biology-005"],
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
    // Arabic cards rewritten in light everyday Arabic on 2026-10-21 (#144).
    lastModified: { en: "2026-09-29", ar: "2026-10-21" },
    paths: { en: "/arabia-quiz", ar: "/ar/tarikh-al-arab/" },
    titles: {
      en: "Arab & Middle East History Trivia | Riddle Arabia",
      ar: "أسئلة عن تاريخ العرب والشرق الأوسط | ريدل أرابيا",
    },
    descriptions: {
      en: "Try Arab and Middle East history trivia with answers in Arabic and English. Explore ancient civilizations, Islamic history, cities, and scholarship.",
      ar: "جرّب أسئلة عن تاريخ العرب والشرق الأوسط مع الإجابات بالعربية والإنجليزية. اختبر معرفتك بالحضارات القديمة والتاريخ الإسلامي والمدن والعلم.",
    },
    eyebrow: { en: "History with context", ar: "تاريخ في سياقه" },
    headings: { en: "Arab & Middle East history trivia", ar: "أسئلة عن تاريخ العرب والشرق الأوسط" },
    introductions: {
      en: "Explore the history of the Arab world and the wider Middle East through a short trivia quiz. The questions move from ancient Egypt, Mesopotamia, and Persia to Islamic history and the translation of scientific works into Arabic. Read in Arabic or English and reveal the answers as you go.",
      ar: "استكشف تاريخ العالم العربي والشرق الأوسط في مسابقة قصيرة. تنتقل الأسئلة من مصر القديمة وبلاد الرافدين وفارس إلى التاريخ الإسلامي وترجمة الأعمال العلمية إلى العربية. اقرأ بالعربية أو الإنجليزية، واكشف الإجابات أثناء تقدّمك.",
    },
    guidance: {
      en: "Use this page for learning and conversation, not as a substitute for a full historical source. Open the answer only after forming your own response.",
      ar: "استخدم هذه الصفحة للتعلّم والنقاش، لا بديلاً عن مصدر تاريخي متكامل. اكشف الحل بعد أن تصوغ إجابتك الخاصة.",
    },
    subjects: { en: ["History trivia", "Arab history", "Middle East history", "Ancient civilizations"], ar: ["أسئلة تاريخية", "تاريخ العرب", "تاريخ الشرق الأوسط", "حضارات قديمة"] },
    cards: [
      ["middle-east-history", "me-hist-001"],
      ["middle-east-history", "me-hist-002"],
      ["middle-east-history", "me-hist-003"],
      ["middle-east-history", "me-hist-004"],
      ["middle-east-history", "me-hist-005"],
      ["middle-east-history", "me-hist-007"],
      ["middle-east-history", "me-hist-009"],
      ["middle-east-history", "me-hist-010"],
    ],
  },
  {
    key: "spacetoon-nostalgia",
    // Arabic cards rewritten in light everyday Arabic on 2026-10-21 (#144).
    lastModified: { en: "2026-09-30", ar: "2026-10-21" },
    paths: { en: "/spacetoon-nostalgia", ar: "/ar/hanin-spacetoon/" },
    titles: {
      en: "Spacetoon Nostalgia Quiz | Riddle Arabia",
      ar: "اختبار حنين سبيستون | ريدل أرابيا",
    },
    descriptions: {
      en: "Try eight questions for fans of classic Arabic-dubbed animation. Make a guess, reveal the answers, and share memories in this independent bilingual quiz.",
      ar: "جرّب ثمانية أسئلة لمحبي الرسوم المدبلجة الكلاسيكية. خمّن ثم اكشف الإجابات وشارك ذكرياتك في هذا الاختبار المستقل بالعربية والإنجليزية.",
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
      ["ayam-tayebeen", "ayt-006"],
      ["ayam-tayebeen", "ayt-008"],
      ["ayam-tayebeen", "ayt-009"],
    ],
  },
  {
    key: "brain-games",
    lastModified: "2026-10-06",
    paths: { en: "/brain-games", ar: "/ar/alab-al-dimagh/" },
    kind: "games",
    titles: {
      en: "Free Brain Games in Arabic & English | Riddle Arabia",
      ar: "ألعاب ذكاء مجانية بالعربية والإنجليزية | ريدل أرابيا",
    },
    descriptions: {
      en: "Find free word games, crosswords, Sudoku and logic puzzles in Arabic and English. Compare how to play, try a daily selection, or invite a friend to Word Duel.",
      ar: "اكتشف ألعاب كلمات وكلمات متقاطعة وسودوكو وألغاز منطق مجانية بالعربية والإنجليزية. تعرّف إلى طرق اللعب أو ادعُ صديقاً إلى مبارزة الكلمات.",
    },
    eyebrow: { en: "Games", ar: "الألعاب" },
    headings: { en: "Brain games in Arabic and English", ar: "ألعاب ذكاء بالعربية والإنجليزية" },
    introductions: {
      en: "Choose a free game for a short break or a longer challenge, in Arabic or English. Start with a Mini Crossword, solve Sudoku, connect words by theme, or invite a friend to Word Duel. You can also connect clues in Akshifha or settle in with chess and backgammon.",
      ar: "اختر لعبة مجانية لاستراحة قصيرة أو تحدٍّ أطول، بالعربية أو الإنجليزية. ابدأ بمتقاطعة مصغّرة، أو حلّ سودوكو، أو اربط الكلمات حسب موضوعها، أو ادعُ صديقاً إلى مبارزة الكلمات. ويمكنك أيضاً ربط الأدلة في اكشفها أو الاستمتاع بالشطرنج وطاولة الزهر.",
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
  "mastermind", "go", "reversi", "codenames", "catan", "set", "hanabi", "diplomacy",
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
