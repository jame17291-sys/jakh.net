/**
 * The public search surface for Riddle Arabia is intentionally small and
 * editorially designed.  It is not a renamed version of the former mass
 * topic/pagination program: every page below has a distinct purpose, reader
 * journey, source selection, and bilingual copy.
 */

import { PUZZLES } from "../puzzle-catalog.js";
import { PUZZLE_ROUTES } from "../puzzle-routes.js";

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
    lastModified: "2026-09-29",
    paths: { en: "/riddles", ar: "/ar/alghaz/" },
    titles: {
      en: "Riddles With Answers | Riddle Arabia",
      ar: "ألغاز مع الحل | ريدل أرابيا",
    },
    descriptions: {
      en: "Solve free riddles with answers in English and Arabic. Try classic clues about everyday objects, nature, and logic, then reveal each answer when you are ready.",
      ar: "حلّ ألغازاً مع الحل بالعربية والإنجليزية مجاناً. جرّب أسئلة عن الأشياء اليومية والطبيعة والمنطق، ثم اكشف إجابة كل لغز بعد أن تخمّن.",
    },
    eyebrow: { en: "A calm start", ar: "بداية هادئة" },
    headings: { en: "Riddles with answers", ar: "ألغاز مع الحل" },
    introductions: {
      en: "Start with a short collection of classic riddles about everyday objects, nature, and family relationships. Read each clue in English or Arabic, make your guess, and open the answer to see how you did. Every riddle is free to try on your own or with friends.",
      ar: "ابدأ بمجموعة قصيرة من الألغاز عن الأشياء اليومية والطبيعة والعلاقات العائلية. اقرأ كل لغز بالعربية أو الإنجليزية، وخمّن الحل، ثم اكشف الإجابة لتتحقّق منها. يمكنك تجربة جميع الألغاز مجاناً بمفردك أو مع الأصدقاء.",
    },
    guidance: {
      en: "Read each clue without rushing. Say your answer out loud, then reveal the solution and check which details led you there. Use the full topic link above for more riddles.",
      ar: "اقرأ كل لغز من دون استعجال. قل إجابتك بصوتٍ عالٍ، ثم اكشف الحل وراجع التفاصيل التي أوصلتك إليه. للمزيد من الألغاز، افتح رابط الموضوع الكامل أعلاه.",
    },
    subjects: { en: ["Riddles", "Wordplay"], ar: ["ألغاز", "تفكير لغوي"] },
    cards: [
      ["classic-riddles", "classic-riddles-001"],
      ["classic-riddles", "classic-riddles-003"],
      ["classic-riddles", "classic-riddles-004"],
      ["classic-riddles", "classic-riddles-008"],
      ["classic-riddles", "classic-riddles-009"],
      ["classic-riddles", "classic-riddles-011"],
      ["classic-riddles", "classic-riddles-012"],
      ["classic-riddles", "classic-riddles-014"],
    ],
  },
  {
    key: "arabic-riddles",
    lastModified: "2026-09-29",
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
      ["classic-riddles", "classic-riddles-005"],
      ["classic-riddles", "classic-riddles-006"],
      ["classic-riddles", "classic-riddles-007"],
      ["classic-riddles", "classic-riddles-010"],
      ["classic-riddles", "classic-riddles-015"],
      ["classic-riddles", "classic-riddles-016"],
      ["classic-riddles", "classic-riddles-021"],
      ["classic-riddles", "classic-riddles-022"],
    ],
  },
  {
    key: "logic-puzzles",
    paths: { en: "/logic-challenges", ar: "/ar/alghaz-mantiq/" },
    titles: {
      en: "Logic Puzzles With Answers | Riddle Arabia",
      ar: "ألغاز منطقية مع الحل | ريدل أرابيا",
    },
    descriptions: {
      en: "Work through bilingual logic puzzles that reward careful reading, simple deduction, and a second thought before you reveal the answer.",
      ar: "تدرّب على ألغاز منطقية ثنائية اللغة تكافئ القراءة الدقيقة والاستنتاج البسيط والتفكير مرة أخرى قبل كشف الحل.",
    },
    eyebrow: { en: "Slow down and solve", ar: "تمهّل ثم حل" },
    headings: { en: "Logic puzzles", ar: "ألغاز منطقية" },
    introductions: {
      en: "Logic puzzles are less about fast facts and more about noticing what a clue actually says. These short challenges are built for a pencil-and-paper pause, a conversation, or a quick mental reset.",
      ar: "الألغاز المنطقية لا تعتمد على سرعة المعلومة بقدر اعتمادها على ملاحظة ما يقوله التلميح فعلاً. هذه التحديات القصيرة مناسبة لوقفة مع ورقة وقلم، أو نقاش، أو استراحة ذهنية سريعة.",
    },
    guidance: {
      en: "Underline the fixed facts, ignore assumptions, and test the simplest interpretation before looking at the answer.",
      ar: "حدّد الحقائق الثابتة، وتجنّب الافتراضات، واختبر أبسط تفسير قبل النظر إلى الإجابة.",
    },
    subjects: { en: ["Logic", "Deduction"], ar: ["منطق", "استنتاج"] },
    cards: [
      ["logic-puzzles", "logic-puzzles-001"],
      ["logic-puzzles", "logic-puzzles-002"],
      ["logic-puzzles", "logic-puzzles-003"],
      ["logic-puzzles", "logic-puzzles-004"],
      ["logic-puzzles", "logic-puzzles-005"],
      ["logic-puzzles", "logic-puzzles-006"],
      ["logic-puzzles", "logic-puzzles-017"],
      ["logic-puzzles", "logic-puzzles-019"],
    ],
  },
  {
    key: "kids-riddles",
    paths: { en: "/family-riddles", ar: "/ar/alghaz-atfal/" },
    titles: {
      en: "Kids’ Riddles for Families | Riddle Arabia",
      ar: "ألغاز للأطفال والعائلة | ريدل أرابيا",
    },
    descriptions: {
      en: "Enjoy a gentle set of bilingual kids’ riddles about familiar objects, everyday observation, and simple reasoning—ideal for families and classrooms.",
      ar: "استمتع بمجموعة لطيفة من ألغاز الأطفال بالعربية والإنجليزية عن أشياء مألوفة وملاحظات يومية واستدلال بسيط، مناسبة للعائلة والصف.",
    },
    eyebrow: { en: "Share the guess", ar: "شارك التخمين" },
    headings: { en: "Family riddles", ar: "ألغاز للعائلة" },
    introductions: {
      en: "These clues invite children to look closely at the world they already know: a crayon, a lamp, a calendar, or a pair of socks. Adults can read the clue while everyone races to a guess.",
      ar: "تدعو هذه التلميحات الأطفال إلى النظر جيداً في عالمهم المألوف: قلم شمع أو مصباح أو تقويم أو زوج من الجوارب. يمكن للكبار قراءة التلميح بينما يتسابق الجميع إلى التخمين.",
    },
    guidance: {
      en: "Give everyone time to answer, celebrate unusual guesses, and reveal the answer together rather than treating it like a test.",
      ar: "امنح الجميع وقتاً للإجابة، واحتفِ بالتخمينات غير المعتادة، ثم اكشفوا الحل معاً بدل التعامل معها كاختبار.",
    },
    subjects: { en: ["Kids’ riddles", "Everyday reasoning"], ar: ["ألغاز للأطفال", "استدلال يومي"] },
    cards: [
      ["kids-riddles", "kids-riddles-001"],
      ["kids-riddles", "kids-riddles-003"],
      ["kids-riddles", "kids-riddles-004"],
      ["kids-riddles", "kids-riddles-005"],
      ["kids-riddles", "kids-riddles-006"],
      ["kids-riddles", "kids-riddles-008"],
      ["kids-riddles", "kids-riddles-009"],
      ["kids-riddles", "kids-riddles-010"],
    ],
  },
  {
    key: "general-knowledge",
    lastModified: "2026-09-29",
    paths: { en: "/general-knowledge", ar: "/ar/malumat-amma/" },
    titles: {
      en: "Arabic Trivia & General Knowledge Quiz | Riddle Arabia",
      ar: "أسئلة معلومات عامة مع الإجابات | ريدل أرابيا",
    },
    descriptions: {
      en: "Test your general knowledge with free trivia questions and answers in Arabic and English. Explore geography, history, science, nature, food, and music.",
      ar: "اختبر ثقافتك بأسئلة معلومات عامة مع الإجابات بالعربية والإنجليزية مجاناً، في الجغرافيا والتاريخ والعلوم والطبيعة والطعام والموسيقى.",
    },
    eyebrow: { en: "A little of everything", ar: "قليل من كل شيء" },
    headings: { en: "Arabic trivia & general knowledge", ar: "أسئلة معلومات عامة مع الإجابات" },
    introductions: {
      en: "This Arabic trivia quiz is also available in English, so friends can enjoy the same questions in either language. Test what you remember about places, history, science, animals, food, and music, then reveal each answer when you are ready.",
      ar: "تجمع هذه المسابقة الثقافية أسئلة معلومات عامة بالعربية مع نسخة إنجليزية، ليتمكّن الأصدقاء من تجربة الأسئلة نفسها باللغة التي يفضّلونها. اختبر ما تتذكره عن الجغرافيا والتاريخ والعلوم والحيوانات والطعام والموسيقى، ثم اكشف كل إجابة عندما تكون مستعداً.",
    },
    guidance: {
      en: "Take turns reading the questions for a casual trivia game, or work through them at your own pace. If a question surprises you, follow its topic link to keep exploring.",
      ar: "تناوبوا على قراءة الأسئلة في مسابقة خفيفة، أو أجب عنها على مهل بمفردك. إذا أثار سؤال فضولك، فاتبع رابط موضوعه لمواصلة الاستكشاف.",
    },
    subjects: { en: ["Trivia", "General knowledge", "Geography", "History", "Science"], ar: ["مسابقات ثقافية", "معلومات عامة", "جغرافيا", "تاريخ", "علوم"] },
    cards: [
      ["geography", "geography-001"],
      ["geography", "geography-007"],
      ["history", "history-001"],
      ["history", "history-006"],
      ["science", "science-001"],
      ["animal-kingdom", "ani-2"],
      ["food-and-cuisines", "foo-13"],
      ["music-and-performing-arts", "mus-3"],
    ],
  },
  {
    key: "arabia-quiz",
    lastModified: "2026-09-29",
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
    lastModified: "2026-09-30",
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
      en: "Daily puzzle selections rotate through finite collections or use generated boards; they are not newly published puzzles every day. Solo puzzle progress stays on this device. Word Duel uses an online room for two players. Akshifha rotates through eleven existing cases, separately from the Daily Challenge question.",
      ar: "تتناوب ألغاز اليوم ضمن مجموعات محدودة أو تستخدم لوحات مولّدة؛ ولا تعني نشر ألغاز جديدة كل يوم. يبقى تقدّم الألغاز الفردية محفوظاً على هذا الجهاز. وتستخدم مبارزة الكلمات غرفة عبر الإنترنت للاعبين. أما اكشفها فتتناوب بين إحدى عشرة قضية موجودة، بصورة منفصلة عن سؤال التحدي اليومي.",
    },
  },
]);

// This is the promoted portfolio, not a registry of every preserved game URL.
export const RIDDLE_ARABIA_GAME_CATALOG = Object.freeze([
  {
    slug: "most-likely-to",
    kind: "party",
    names: { en: "Most Likely To", ar: "مَن الأكثر احتمالًا؟" },
    descriptions: {
      en: "Vote for the friend most likely to pull off each outrageous scenario. Original questions, dramatic reveals and group play on one phone, free in Arabic and English.",
      ar: "صوّتوا للصديق الذي تتوقّعون منه كل موقف طريف ومفاجئ. أسئلة أصلية وكشف للتصويت ولعب جماعي على هاتف واحد، مجاناً بالعربية والإنجليزية.",
    },
    lastModified: "2026-10-06",
  },
  {
    slug: "how-well-do-you-know-me",
    kind: "party",
    names: { en: "How Well Do You Know Me?", ar: "كم تعرفني؟" },
    descriptions: {
      en: "Make a ten-question friendship quiz, choose your answers and challenge friends with a link. Reveal scores and see who knows you best, free in Arabic and English.",
      ar: "اصنع اختبار صداقة من عشرة أسئلة واختر إجاباتك وتحدَّ أصدقاءك برابط. اكشفوا النتائج واعرفوا من يعرفك أكثر، مجاناً بالعربية والإنجليزية.",
    },
    lastModified: "2026-10-06",
  },
  {
    slug: "secret-word-impostor",
    kind: "party",
    names: { en: "Secret Word Impostor", ar: "المحتال صاحب الكلمة السرية" },
    descriptions: {
      en: "One player does not know the secret word. Give clever clues, spot the bluff, and vote before the impostor figures it out.",
      ar: "لا يعرف لاعب واحد الكلمة السرية. قدّموا تلميحات ذكية، واكتشفوا الخدعة، وصوّتوا قبل أن يعرفها المحتال.",
    },
    lastModified: "2026-10-06",
  },
  {
    slug: "panic-mode",
    kind: "party",
    names: { en: "Panic Mode: 5 Seconds", ar: "وضع الذعر: خمس ثوانٍ" },
    descriptions: {
      en: "A fast friendship game: name three things before five seconds disappear, then let your friends decide if you made it.",
      ar: "لعبة أصدقاء سريعة: اذكر ثلاثة أشياء قبل انتهاء خمس ثوانٍ، ثم يقرر أصدقاؤك إن نجحت.",
    },
    lastModified: "2026-10-06",
  },
  {
    slug: "friendship-court",
    kind: "party",
    names: { en: "Friendship Court", ar: "محكمة الأصدقاء" },
    descriptions: {
      en: "Put playful fictional crimes on trial, hear the defence, and reveal the jury’s secret verdict on one phone.",
      ar: "حاكموا تهمًا خيالية مرحة، واسمعوا الدفاع، ثم اكشفوا الحكم السري لهيئة المحلفين على هاتف واحد.",
    },
    lastModified: "2026-10-06",
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
