/**
 * The public search surface for Riddle Arabia is intentionally small and
 * editorially designed.  It is not a renamed version of the former mass
 * topic/pagination program: every page below has a distinct purpose, reader
 * journey, source selection, and bilingual copy.
 */

export const RIDDLE_ARABIA_SEO_PAGES = Object.freeze([
  {
    key: "riddles",
    paths: { en: "/riddles", ar: "/ar/alghaz/" },
    titles: {
      en: "Riddles With Answers | Riddle Arabia",
      ar: "ألغاز مع الحل | ريدل أرابيا",
    },
    descriptions: {
      en: "Try a thoughtful set of bilingual riddles. Make your guess first, open the answer when you are ready, then keep the challenge moving.",
      ar: "جرّب مجموعة منتقاة من الألغاز بالعربية والإنجليزية. خمّن أولاً، ثم افتح الحل عندما تكون مستعداً، وواصل التحدي.",
    },
    eyebrow: { en: "A calm start", ar: "بداية هادئة" },
    headings: { en: "Riddles worth a second look", ar: "ألغاز تستحق نظرة ثانية" },
    introductions: {
      en: "A good riddle gives you just enough to begin. This set moves from familiar objects to small twists in language and logic, with answers kept behind a tap so the thinking stays yours.",
      ar: "اللغز الجيد يمنحك ما يكفي لتبدأ. تنتقل هذه المجموعة من أشياء مألوفة إلى لمسات لغوية ومنطقية صغيرة، وتبقى الحلول خلف نقرة كي يبقى التفكير لك.",
    },
    guidance: {
      en: "Read each clue once without rushing. Say your first answer out loud, then reveal the explanation and compare the detail you noticed.",
      ar: "اقرأ كل تلميح مرة من دون استعجال. قل إجابتك الأولى بصوتٍ عالٍ، ثم اكشف الحل وقارن بالتفصيل الذي لاحظته.",
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
    paths: { en: "/arabic-riddles", ar: "/ar/alghaz-arabiya/" },
    titles: {
      en: "Arabic Riddles in Arabic & English | Riddle Arabia",
      ar: "ألغاز عربية بالعربية والإنجليزية | ريدل أرابيا",
    },
    descriptions: {
      en: "Solve bilingual Arabic riddles with a friend or on your own. Every clue is available in Arabic and English, with the answer one tap away.",
      ar: "حلّ ألغازاً عربية ثنائية اللغة بمفردك أو مع صديق. كل تلميح متاح بالعربية والإنجليزية، والحل على بُعد نقرة واحدة.",
    },
    eyebrow: { en: "Think across languages", ar: "فكّر بلغتين" },
    headings: { en: "One clue, two ways to read it", ar: "تلميح واحد، وقراءتان" },
    introductions: {
      en: "Riddle Arabia is made for readers who move naturally between Arabic and English. Use either version of a clue—or compare both—to find the wordplay hiding in plain sight.",
      ar: "صُمّمت ريدل أرابيا لمن ينتقلون بسلاسة بين العربية والإنجليزية. استخدم أي نسخة من التلميح، أو قارن بينهما، لتكتشف اللعب اللغوي الظاهر أمامك.",
    },
    guidance: {
      en: "Choose the language that feels most natural, make a prediction, and then switch languages before opening the answer for a fresh angle.",
      ar: "اختر اللغة الأقرب إليك، وخمّن الحل، ثم بدّل اللغة قبل كشف الإجابة لتأخذ زاوية جديدة.",
    },
    subjects: { en: ["Arabic riddles", "Bilingual wordplay"], ar: ["ألغاز عربية", "تفكير ثنائي اللغة"] },
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
    headings: { en: "Small clues, satisfying deductions", ar: "تلميحات صغيرة واستنتاجات مُرضية" },
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
    headings: { en: "Friendly riddles for curious minds", ar: "ألغاز لطيفة لعقول فضولية" },
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
    paths: { en: "/general-knowledge", ar: "/ar/malumat-amma/" },
    titles: {
      en: "General Knowledge Quiz | Riddle Arabia",
      ar: "اختبار معلومات عامة | ريدل أرابيا",
    },
    descriptions: {
      en: "A balanced bilingual general knowledge quiz spanning geography, history, nature, science, and culture. Guess first, then check each answer.",
      ar: "اختبار معلومات عامة متوازن بالعربية والإنجليزية يشمل الجغرافيا والتاريخ والطبيعة والعلوم والثقافة. خمّن أولاً ثم تحقّق من كل إجابة.",
    },
    eyebrow: { en: "A little of everything", ar: "قليل من كل شيء" },
    headings: { en: "Questions for the naturally curious", ar: "أسئلة لمحبي الفضول" },
    introductions: {
      en: "General knowledge is a map, not a score. This set crosses subjects on purpose, giving you a quick way to discover what you remember and what you want to learn next.",
      ar: "المعلومات العامة خريطة وليست مجرد نتيجة. تنتقل هذه المجموعة بين موضوعات مختلفة عمداً، لتكتشف ما تتذكره وما تريد تعلّمه لاحقاً.",
    },
    guidance: {
      en: "Treat every answer as a starting point. If a question surprises you, follow the category link to continue exploring that subject.",
      ar: "اعتبر كل إجابة نقطة بداية. إذا فاجأك سؤال، فاتبع رابط الموضوع لمواصلة استكشافه.",
    },
    subjects: { en: ["General knowledge", "Geography", "History", "Science"], ar: ["معلومات عامة", "جغرافيا", "تاريخ", "علوم"] },
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
    paths: { en: "/arabia-quiz", ar: "/ar/tarikh-al-arab/" },
    titles: {
      en: "Arabia & Middle East History Quiz | Riddle Arabia",
      ar: "اختبار تاريخ العرب والشرق الأوسط | ريدل أرابيا",
    },
    descriptions: {
      en: "Explore a bilingual Middle East history quiz with questions on civilizations, cities, scholarship, and the region’s historical connections.",
      ar: "استكشف اختباراً ثنائي اللغة عن تاريخ العرب والشرق الأوسط، بأسئلة عن الحضارات والمدن والعلم وصلات المنطقة التاريخية.",
    },
    eyebrow: { en: "History with context", ar: "تاريخ في سياقه" },
    headings: { en: "A starting point for regional history", ar: "بداية لاكتشاف تاريخ المنطقة" },
    introductions: {
      en: "The history of Arabia and the wider Middle East reaches across languages, cities, and centuries. These prompts are an invitation to recall key landmarks and continue learning with reliable historical sources.",
      ar: "يمتد تاريخ العرب والشرق الأوسط عبر اللغات والمدن والقرون. هذه الأسئلة دعوة لتذكّر محطات أساسية ومواصلة التعلّم من مصادر تاريخية موثوقة.",
    },
    guidance: {
      en: "Use this page for learning and conversation, not as a substitute for a full historical source. Open the answer only after forming your own response.",
      ar: "استخدم هذه الصفحة للتعلّم والنقاش، لا بديلاً عن مصدر تاريخي متكامل. اكشف الحل بعد أن تصوغ إجابتك الخاصة.",
    },
    subjects: { en: ["Middle East history", "Ancient civilizations"], ar: ["تاريخ الشرق الأوسط", "حضارات قديمة"] },
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
    paths: { en: "/spacetoon-nostalgia", ar: "/ar/hanin-spacetoon/" },
    titles: {
      en: "Spacetoon Nostalgia Quiz | Riddle Arabia",
      ar: "اختبار حنين سبيستون | ريدل أرابيا",
    },
    descriptions: {
      en: "Take an independent bilingual nostalgia quiz for fans of classic Arabic-dubbed animation. Share a memory, make a guess, and compare your score.",
      ar: "استمتع باختبار حنين ثنائي اللغة ومستقل لمحبي الرسوم المدبلجة الكلاسيكية. شارك ذكرى وخمّن الإجابة وقارن نتيجتك.",
    },
    eyebrow: { en: "A shared memory", ar: "ذكرى مشتركة" },
    headings: { en: "How much do you remember?", ar: "كم تتذكر؟" },
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
      ["ayam-tayebeen", "ayt-007"],
      ["ayam-tayebeen", "ayt-008"],
    ],
  },
  {
    key: "brain-games",
    paths: { en: "/brain-games", ar: "/ar/alab-al-dimagh/" },
    kind: "games",
    titles: {
      en: "Free Brain Games Online | Riddle Arabia",
      ar: "ألعاب دماغ مجانية أونلاين | ريدل أرابيا",
    },
    descriptions: {
      en: "Play Akshifha: connect two clues and spot the contradiction in five free Arabic and English mysteries. Explore Chess and Backgammon in Classics.",
      ar: "العب اكشفها: اربط دليلين واكتشف التناقض في خمس قضايا مجانية بالعربية والإنجليزية. وجرّب الشطرنج وطاولة الزهر ضمن الكلاسيكيات.",
    },
    eyebrow: { en: "Small mysteries. Satisfying discoveries.", ar: "قضايا قصيرة ولحظات اكتشاف" },
    headings: { en: "Something doesn’t add up. Can you spot it?", ar: "في القصة شيء لا يستقيم. هل تكتشفه؟" },
    introductions: {
      en: "Start with Akshifha, our new evidence game. Read a short case, inspect the details, and connect the clues that reveal the contradiction. Take your time: no countdown, account, or download.",
      ar: "ابدأ باكشفها، لعبتنا الجديدة لربط الأدلة. اقرأ قضية قصيرة وتفحّص التفاصيل واربط الدليلين اللذين يكشفان التناقض. خذ وقتك: بلا عدّ تنازلي أو حساب أو تنزيل.",
    },
    guidance: {
      en: "The free pilot includes five original cases. Today’s pick rotates through these cases; it is not a newly published case every day. Chess and Backgammon remain below for a quieter change of pace.",
      ar: "تضم النسخة التجريبية المجانية خمس قضايا مؤلّفة بعناية. يتناوب اختيار اليوم بينها؛ لا تُنشر قضية جديدة كل يوم. ولوقت أهدأ، تجد الشطرنج وطاولة الزهر أدناه.",
    },
  },
]);

// This is the promoted portfolio, not a registry of every preserved game URL.
export const RIDDLE_ARABIA_GAME_CATALOG = Object.freeze([
  {
    slug: "akshifha",
    kind: "featured",
    names: { en: "Akshifha — spot the contradiction", ar: "اكشفها — اكتشف التناقض" },
    descriptions: {
      en: "Inspect the evidence, connect two clues, and choose the conclusion they support. Five free cases in Arabic and English, with no timer or sign-up.",
      ar: "تفحّص الأدلة واربط دليلين واختر الاستنتاج الذي يدعمانه. خمس قضايا مجانية بالعربية والإنجليزية بلا مؤقّت أو تسجيل.",
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
