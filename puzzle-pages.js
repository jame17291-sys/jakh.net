// Page copy describes the actual house rules, rather than promising an
// unlimited dictionary, a newly authored puzzle every day, or account sync.
export const PUZZLE_EDITORIAL = {
  bonus: {
    title: ['Bonus Puzzles: Three Extra Challenges', 'تحديات إضافية: ثلاث تنويعات للألغاز'],
    description: ['Try three free bonus puzzles: Mini Connections, a five-letter word with a helpful letter, and a mini crossword with starting letters. Play in Arabic or English.', 'جرّب ثلاثة تحديات مجانية: روابط مصغّرة، وكلمة من خمسة حروف مع حرف مساعد، ومتقاطعة مصغّرة بحروف بداية مكشوفة. بالعربية والإنجليزية.'],
    intro: ['These three variations offer a gentler way into familiar word games. Each changes one rule of a standard puzzle, so you can practise the underlying idea with a smaller group or a helpful starting letter.', 'تقدّم هذه التنويعات الثلاثة مدخلاً أسهل إلى ألعاب الكلمات. يغيّر كل تحدٍّ قاعدة واحدة في اللعبة الأساسية، لتتدرّب على فكرتها مع مجموعة أصغر أو حرف يساعدك على البداية.'],
    rules: [
      ['Mini Connections asks you to sort nine words into three groups of three. Look for one precise connection shared by every word in a group.', 'في الروابط المصغّرة رتّب تسع كلمات في ثلاث مجموعات، كل منها ثلاث كلمات. ابحث عن رابط محدد تشترك فيه كلمات المجموعة كلها.'],
      ['A Helpful Letter reveals the first letter of the hidden five-letter word. You have five guesses to finish it, using the usual letter feedback.', 'يكشف تحدي «حرف مساعد» أول حرف من الكلمة ذات الحروف الخمسة. لديك خمس محاولات لإكمالها بالاستعانة بملاحظات الحروف.'],
      ['A Head Start fills the first letter of each answer in a 5 × 5 mini crossword. Use the clues and intersections to complete the remaining letters.', 'يملأ تحدي «بداية مساعدة» الحرف الأول من كل إجابة في متقاطعة ٥ × ٥. استخدم التعريفات والتقاطعات لإكمال بقية الحروف.'],
    ],
    note: ['Bonus progress is saved separately from the standard games. These variations do not count toward the daily completion total or streak. The collection is finite and can be revisited.', 'يُحفظ تقدّم التحديات الإضافية منفصلاً عن الألعاب الأساسية. لا تُحتسب هذه التنويعات ضمن إجمالي ألغاز اليوم أو سلسلة الأيام المتتالية. المجموعة محدودة ويمكن العودة إليها.'],
  },
  duel: {
    title: ['Word Duel: Play a Friend Online', 'مبارزة الكلمات: العب مع صديق عبر الإنترنت'],
    description: ['Play a free two-player word board game on separate devices. Create a room, share its code, build connected words and score points in Arabic or English.', 'العب لعبة كلمات مجانية لشخصين من جهازين مختلفين. أنشئ غرفة وشارك رمزها وكوّن كلمات متصلة لجمع النقاط بالعربية أو الإنجليزية.'],
    intro: ['Word Duel is a turn-based game for two friends on separate devices. Choose the room’s word language, create a room and send its invitation to your opponent. Both players use the same limited house vocabulary, which you can browse during the match.', 'مبارزة الكلمات لعبة يتناوب فيها صديقان من جهازين مختلفين. اختر لغة كلمات الغرفة وأنشئها ثم أرسل دعوتها إلى صديقك. يستخدم اللاعبان قائمة الكلمات المحدودة نفسها، ويمكن تصفّحها أثناء المباراة.'],
    rules: [
      ['Build your opening word across the centre star. Later moves must connect to existing letters. Place new letters in one row or column without gaps; every crossing word must be accepted too.', 'اجعل كلمة البداية تمر بالنجمة الوسطى. يجب أن تتصل الحركات التالية بالحروف الموجودة. ضع الحروف الجديدة في صف أو عمود دون فراغات، ويجب قبول الكلمات المتقاطعة أيضاً.'],
      ['Your rack stays private. Bonus squares count only when a letter is newly placed, and playing all seven letters earns 15 extra points. Passing or exchanging letters uses your turn.', 'تبقى أحرفك خاصة بك. تُحسب مكافأة الخانة للحرف الجديد فقط، ويمنح استخدام الأحرف السبعة ١٥ نقطة إضافية. تمرير الدور أو تبديل الأحرف يستهلك دورك.'],
      ['Six turns without scoring, 80 turns, or an empty rack with an empty bag ends the match. Remaining letters affect the final scores. A rematch starts only when both players agree.', 'تنتهي المباراة بعد ستة أدوار دون نقاط، أو ٨٠ دوراً، أو نفاد أحرف لاعب مع فراغ الكيس. تؤثر الأحرف المتبقية في النتيجة النهائية، ولا تبدأ الإعادة إلا بموافقة اللاعبين.'],
    ],
    note: ['No account is required. Your seat and recent match history are saved in this browser. An unjoined room waits 30 minutes; active rooms expire after 24 hours without a move. Turn reminders are optional and require a supported browser and permission.', 'لا يلزم حساب. يُحفظ مقعدك وسجل مبارياتك الأخيرة في هذا المتصفح. تنتظر الغرفة صديقك ٣٠ دقيقة، وتنتهي الغرف النشطة بعد ٢٤ ساعة دون حركة. تذكيرات الدور اختيارية وتتطلب متصفحاً يدعمها وإذناً منك.'],
  },
  crossword: {
    title: ['Crossword: A 13 × 13 Word Puzzle', 'كلمات متقاطعة: لغز بحجم ١٣ × ١٣'],
    description: ['Solve a free 13 × 13 crossword in Arabic or English. Read the clues, connect answers across and down, and check letters or reveal an answer when you need help.', 'حلّ كلمات متقاطعة مجانية بحجم ١٣ × ١٣ بالعربية أو الإنجليزية. اقرأ التعريفات واربط الإجابات أفقياً ورأسياً وتحقق من الحروف أو اكشف إجابة عند الحاجة.'],
    intro: ['The largest Riddle Arabia crossword uses a 13 × 13 grid. Answers share letters at their intersections, so a short clue can unlock a longer answer elsewhere. The board is generated from a finite collection of original clue-and-answer pairs.', 'تستخدم أكبر متقاطعة في ريدل أرابيا شبكة ١٣ × ١٣. تشترك الإجابات في الحروف عند تقاطعها، وقد يساعد تعريف قصير في اكتشاف إجابة أطول. تُولّد اللوحة من مجموعة محدودة من التعريفات والإجابات الأصلية.'],
    rules: [
      ['Choose an across or down clue, then enter its answer in the highlighted cells. Each open square holds one letter; dark squares separate answers.', 'اختر تعريفاً أفقياً أو رأسياً، ثم أدخل إجابته في الخانات المحددة. تحمل كل خانة مفتوحة حرفاً واحداً، وتفصل الخانات الداكنة بين الإجابات.'],
      ['Use shared letters to narrow down uncertain answers. Arabic entries read right to left across the displayed grid; down entries run from top to bottom.', 'استخدم الحروف المشتركة لتقليل احتمالات الإجابات غير المؤكدة. تُقرأ الكلمات العربية أفقياً من اليمين لليسار، ورأسياً من الأعلى للأسفل.'],
      ['Check your entries or reveal the selected answer when you are stuck. Complete every answer to finish. Checking filled entries or revealing an answer marks this puzzle as assisted.', 'تحقّق من إدخالاتك أو اكشف الإجابة المحددة عندما تتعثر. أكمل كل الإجابات لإنهاء اللغز. يُسجَّل استخدام المساعدة عند فحص الحروف المدخلة أو كشف إجابة.'],
    ],
    note: ['There is no countdown to beat. Work through the larger grid at your own pace, or try the 5 × 5 Mini and 9 × 9 Midi for a smaller board.', 'لا يوجد عدّ تنازلي يجب التغلب عليه. أكمل الشبكة الكبيرة على مهلك، أو جرّب المتقاطعة المصغّرة ٥ × ٥ والمتوسطة ٩ × ٩ إذا رغبت في لوحة أصغر.'],
  },
  midi: {
    title: ['Midi Crossword: A 9 × 9 Word Puzzle', 'كلمات متقاطعة متوسطة: شبكة ٩ × ٩'],
    description: ['Play a free 9 × 9 Midi crossword in Arabic or English. A medium-sized grid with linked clues, saved progress and optional answer reveals.', 'العب متقاطعة متوسطة مجانية بحجم ٩ × ٩ بالعربية أو الإنجليزية. شبكة بتعريفات مترابطة وحفظ للتقدّم وكشف اختياري للإجابات.'],
    intro: ['The Midi uses a 9 × 9 grid, between the Mini and the full Crossword. It leaves room for more crossing answers while keeping the board compact. Its layout is generated from the same finite bilingual clue collection used by the other crossword sizes.', 'تستخدم المتقاطعة المتوسطة شبكة ٩ × ٩، بين المصغّرة والكبيرة. تتيح مساحة لمزيد من الإجابات المتقاطعة مع إبقاء اللوحة صغيرة نسبياً. يُولّد ترتيبها من مجموعة التعريفات الثنائية اللغة المحدودة المستخدمة في الأحجام الأخرى.'],
    rules: [
      ['Select a numbered clue and fill its answer across or down. The selected entry highlights the cells that belong to it.', 'اختر تعريفاً مرقماً واملأ إجابته أفقياً أو رأسياً. تُحدّد الخانات التابعة للإجابة المختارة على اللوحة.'],
      ['A letter at an intersection belongs to two answers. Use a solved word to help with a clue that is harder to recognise.', 'ينتمي حرف التقاطع إلى إجابتين. استخدم الكلمة التي حللتها للمساعدة في تعريف يصعب عليك اكتشافه.'],
      ['You can check entries or reveal the selected answer. Finish all open cells correctly to complete the puzzle. Checking filled entries or revealing an answer marks this puzzle as assisted.', 'يمكنك التحقق من الإدخالات أو كشف الإجابة المحددة. أكمل كل الخانات المفتوحة بشكل صحيح لإنهاء اللغز. يُسجَّل استخدام المساعدة عند فحص الحروف المدخلة أو كشف إجابة.'],
    ],
    note: ['Choose this size when you want more to untangle than the Mini. The clue language follows the page language, and Arabic across answers use right-to-left order.', 'اختر هذا الحجم عندما ترغب في تحدٍّ أوسع من المصغّرة. تتبع لغة التعريفات لغة الصفحة، وتُرتّب الإجابات العربية الأفقية من اليمين لليسار.'],
  },
  mini: {
    title: ['Mini Crossword: A 5 × 5 Word Puzzle', 'كلمات متقاطعة مصغّرة: شبكة ٥ × ٥'],
    description: ['Try a free 5 × 5 Mini crossword in Arabic or English. Solve a compact set of connected clues, with optional letter checks and answer reveals.', 'جرّب متقاطعة مصغّرة مجانية بحجم ٥ × ٥ بالعربية أو الإنجليزية. حلّ تعريفات مترابطة في شبكة صغيرة مع تحقق من الحروف وكشف اختياري للإجابات.'],
    intro: ['The Mini is the smallest Riddle Arabia crossword. Its 5 × 5 grid focuses on short answers and their shared letters. Each board is generated from a finite clue collection, making it a compact introduction to the same across-and-down idea used by the larger games.', 'المتقاطعة المصغّرة هي أصغر متقاطعة في ريدل أرابيا. تركّز شبكة ٥ × ٥ على الإجابات القصيرة والحروف المشتركة بينها. تُولّد كل لوحة من مجموعة تعريفات محدودة، لتكون مدخلاً صغيراً لفكرة الكلمات الأفقية والرأسية المستخدمة في الألعاب الأكبر.'],
    rules: [
      ['Choose a clue to highlight its answer, then type or tap the letters into the open cells. Dark squares are not part of an answer.', 'اختر تعريفاً لتحديد إجابته، ثم أدخل الحروف في الخانات المفتوحة. الخانات الداكنة ليست جزءاً من الإجابة.'],
      ['Read both crossing clues when a letter is uncertain. Every shared square must work for its across and down answer.', 'اقرأ التعريفين المتقاطعين عندما لا تتأكد من حرف. يجب أن يناسب كل حرف مشترك الإجابتين الأفقية والرأسية.'],
      ['Check letters or reveal the selected answer if needed. Filling every answer correctly completes the board. Checking filled entries or revealing an answer marks this puzzle as assisted.', 'تحقّق من الحروف أو اكشف الإجابة المحددة عند الحاجة. يكتمل اللغز بملء كل الإجابات بشكل صحيح. يُسجَّل استخدام المساعدة عند فحص الحروف المدخلة أو كشف إجابة.'],
    ],
    note: ['For a gentler start, the Bonus collection has a version with the first letter of every answer already filled. For a larger grid, move to the Midi.', 'لبداية أسهل، تتضمن التحديات الإضافية نسخة يُكشف فيها أول حرف من كل إجابة. ولشبكة أكبر، انتقل إلى المتقاطعة المتوسطة.'],
  },
  hive: {
    title: ['Word Hive: Make Words from Seven Letters', 'خلية الحروف: كوّن كلمات من سبعة حروف'],
    description: ['Find words from seven letters in Word Hive. Include the centre letter each time and explore a finite puzzle vocabulary in Arabic or English.', 'اكتشف كلمات من سبعة حروف في خلية الحروف. استخدم حرف الوسط في كل كلمة واستكشف قائمة كلمات محدودة للغز بالعربية أو الإنجليزية.'],
    intro: ['Six letters surround one required centre letter. Your task is to find the words accepted by this hive, not every word in a full dictionary. The Arabic and English collections have their own puzzles and vocabulary, with a practice list available on the page.', 'تدور اللعبة حول سبعة حروف يتوسطها حرف إلزامي. مهمتك اكتشاف الكلمات المقبولة في هذه الخلية، وليس كل كلمات معجم شامل. للمجموعتين العربية والإنجليزية ألغاز وقوائم كلمات خاصة، ويتوفر قاموس تدريب في الصفحة.'],
    rules: [
      ['Every word must include the centre letter and use only the seven displayed letters. You may use a letter more than once.', 'يجب أن تتضمن كل كلمة حرف الوسط وأن تستخدم الحروف السبعة المعروضة فقط. يمكنك استخدام الحرف أكثر من مرة.'],
      ['English words need at least four letters; Arabic words need at least three. Submit a word to see whether it belongs to this puzzle’s curated list.', 'تحتاج الكلمات الإنجليزية إلى أربعة حروف على الأقل، والعربية إلى ثلاثة. أرسل الكلمة للتحقق من وجودها في قائمة هذا اللغز المختارة.'],
      ['Accepted words add to your score and discoveries. Shuffle the outer letters for another view; the required centre letter stays the same. Find the whole list to complete the hive.', 'تزيد الكلمات المقبولة نقاطك وقائمة اكتشافاتك. اخلط الحروف الخارجية لرؤيتها بترتيب آخر؛ يبقى حرف الوسط الإلزامي كما هو. اكتشف القائمة كاملة لإتمام الخلية.'],
    ],
    note: ['A rejected word may simply be outside this edition’s list. The practice dictionary shows the vocabulary used by the puzzle, so the game does not claim to cover every valid Arabic or English word.', 'قد تُرفض كلمة لأنها خارج قائمة هذه النسخة. يعرض قاموس التدريب الكلمات المستخدمة في اللغز، ولا تدّعي اللعبة تغطية كل الكلمات العربية أو الإنجليزية الصحيحة.'],
  },
  word: {
    title: ['Five Letters: Guess the Hidden Word', 'خمسة حروف: اكتشف الكلمة المخفية'],
    description: ['Guess a hidden five-letter word in six attempts. Use letter and position feedback to solve this free word game in Arabic or English.', 'خمّن كلمة مخفية من خمسة حروف في ست محاولات. استفد من ملاحظات الحروف ومواضعها لحل لعبة الكلمات المجانية بالعربية أو الإنجليزية.'],
    intro: ['Five Letters gives you six guesses at one hidden five-letter word. Each accepted guess provides information about which letters are present and where they belong. The answer and accepted guesses come from curated vocabulary, with separate Arabic and English editions.', 'تمنحك لعبة خمسة حروف ست محاولات لاكتشاف كلمة واحدة مخفية. تعطيك كل محاولة مقبولة معلومات عن الحروف الموجودة ومواضعها. تُختار الإجابة والتخمينات المقبولة من قوائم كلمات محددة، بنسختين عربية وإنجليزية منفصلتين.'],
    rules: [
      ['Enter a five-letter word and submit it. An accepted guess uses one attempt; an entry outside the game’s vocabulary must be changed.', 'أدخل كلمة من خمسة حروف وأرسلها. يستهلك التخمين المقبول محاولة واحدة؛ ويجب تغيير الكلمة غير الموجودة في قائمة اللعبة.'],
      ['Use the feedback to distinguish a letter in the correct position, a letter elsewhere in the answer, and a letter that does not fit. Repeated letters are checked against their available occurrences.', 'استخدم الملاحظات لتمييز الحرف في موضعه الصحيح، والحرف الموجود في موضع آخر، والحرف غير المناسب. تُفحص الحروف المكررة وفق عدد مرات وجودها في الإجابة.'],
      ['Find the answer within six guesses to solve the puzzle. Once the attempt ends, you can share a result without revealing the answer.', 'اكتشف الإجابة خلال ست محاولات لحل اللغز. بعد انتهاء المحاولة، يمكنك مشاركة النتيجة دون كشف الإجابة.'],
    ],
    note: ['The Bonus version reveals the opening letter and allows five guesses. It has separate progress and does not contribute to the standard daily completion count.', 'تكشف النسخة الإضافية الحرف الأول وتمنح خمس محاولات. لها تقدّم منفصل، ولا تُحتسب ضمن عدد ألغاز اليوم الأساسية المكتملة.'],
  },
  domino: {
    title: ['Logic Dominoes: Fit Every Region’s Rule', 'دومينو المنطق: حقّق شرط كل منطقة'],
    description: ['Place dominoes on a free 4 × 4 logic board. Match each region’s sum, equal-number or different-number rule using rotation, flipping and deduction.', 'ضع قطع الدومينو على لوحة منطق مجانية ٤ × ٤. حقق شروط المجموع أو تساوي الأرقام أو اختلافها باستخدام التدوير وعكس القطع والاستنتاج.'],
    intro: ['Logic Dominoes turns a small 4 × 4 board into a placement puzzle. The outlined regions each impose a number rule, and every domino must fit while satisfying all of them. This is a solo logic challenge rather than a traditional competitive domino game.', 'تحوّل دومينو المنطق لوحة صغيرة ٤ × ٤ إلى لغز ترتيب. تفرض كل منطقة محددة قاعدة للأرقام، ويجب وضع كل القطع مع تحقيق جميع الشروط. هذا تحدٍّ فردي للمنطق، وليس لعبة دومينو تنافسية تقليدية.'],
    rules: [
      ['Select a domino from the tray, then choose its first cell. It occupies two adjacent empty cells, extending right or down.', 'اختر قطعة من الحامل ثم حدّد خانتها الأولى. تشغل القطعة خانتين فارغتين متجاورتين، وتمتد يميناً أو إلى الأسفل.'],
      ['Rotate to change direction or flip to reverse the two values. A placed domino can be selected again to return it to the tray.', 'دوّر القطعة لتغيير اتجاهها أو اعكس طرفيها لتبديل القيمتين. يمكنك اختيار قطعة موضوعة لإعادتها إلى الحامل.'],
      ['Read each region’s label: reach a given sum, make all its values equal, or make them all different. Zero is a valid value. Fill the entire board and satisfy every region to finish.', 'اقرأ شرط كل منطقة: تحقيق مجموع محدد، أو جعل القيم متساوية، أو جعلها مختلفة. الصفر قيمة صالحة. املأ اللوحة كلها وحقّق شروط المناطق لإتمام اللغز.'],
    ],
    note: ['Checking regions helps locate an arrangement that needs another look. Think about the two ends together: one domino can contribute to different regions at the same time.', 'يساعد التحقق من المناطق على تحديد ترتيب يحتاج إلى مراجعة. فكّر في طرفي القطعة معاً؛ فقد تؤثر قطعة واحدة في منطقتين في الوقت نفسه.'],
  },
  trails: {
    title: ['Word Trails: Follow the Theme through Letters', 'خيوط الكلمات: اتبع الموضوع عبر الحروف'],
    description: ['Trace themed words through a letter grid in Word Trails. Use adjacent letters, uncover the spanning phrase and fill every square in Arabic or English.', 'تتبّع كلمات موضوع عبر شبكة الحروف في خيوط الكلمات. صِل الحروف المتجاورة واكتشف العبارة الممتدة واستخدم كل خانة بالعربية أو الإنجليزية.'],
    intro: ['Word Trails hides a set of related words in a letter grid. The theme is your starting clue, and one theme phrase stretches between opposite edges. Every square belongs to an answer, so discoveries gradually narrow down the paths that remain.', 'تخفي خيوط الكلمات مجموعة كلمات مترابطة داخل شبكة حروف. الموضوع هو دليلك الأول، وتمتد إحدى عباراته بين حافتين متقابلتين. تنتمي كل خانة إلى إجابة، ولذلك تقل المسارات المتبقية تدريجياً مع اكتشاف الكلمات.'],
    rules: [
      ['Tap adjacent letters or drag through them to form a word. Diagonal neighbours are allowed, but you cannot use the same square twice in one path.', 'اضغط حروفاً متجاورة أو اسحب بينها لتكوين كلمة. يمكن الانتقال قطرياً، لكن لا يجوز استخدام الخانة نفسها مرتين في المسار الواحد.'],
      ['Submit the path to check it against the themed answers. Find the phrase that joins opposite edges as well as the shorter theme words.', 'أرسل المسار للتحقق منه ضمن إجابات الموضوع. اكتشف العبارة التي تصل بين حافتين متقابلتين، إلى جانب الكلمات الأقصر.'],
      ['Three accepted extra dictionary words earn one hint. A hint outlines letters from an unfound answer; trace them in order. Find every themed answer to complete the board.', 'تمنحك ثلاث كلمات إضافية مقبولة في القاموس تلميحاً واحداً. يحدد التلميح حروف إجابة لم تجدها؛ فتتبّعها بالترتيب. اكتشف كل إجابات الموضوع لإتمام اللوحة.'],
    ],
    note: ['Themed answers and accepted extra words are authored for each board. A plausible word can fall outside that board’s limited vocabulary.', 'تُعدّ إجابات الموضوع والكلمات الإضافية المقبولة لكل لوحة. وقد تكون كلمة تبدو مناسبة خارج قائمة تلك اللوحة المحدودة.'],
  },
  links: {
    title: ['Connections: Find Four Groups of Words', 'روابط: اكتشف أربع مجموعات من الكلمات'],
    description: ['Sort sixteen words into four connected groups. Test your reasoning with four mistakes available in this free Arabic and English word puzzle.', 'رتّب ست عشرة كلمة في أربع مجموعات مترابطة. اختبر استنتاجك مع أربع فرص للخطأ في لغز الكلمات المجاني بالعربية والإنجليزية.'],
    intro: ['Connections presents sixteen words that belong to four hidden groups. A word may suggest more than one relationship, so the challenge is finding the intended set of four without leaving an awkward group behind. Each board has its own authored categories.', 'تقدّم روابط ست عشرة كلمة تنتمي إلى أربع مجموعات مخفية. قد توحي الكلمة بأكثر من علاقة، والتحدي هو اكتشاف المجموعة المقصودة دون ترك كلمات لا يجمعها رابط. لكل لوحة فئات أُعدّت خصيصاً لها.'],
    rules: [
      ['Select four words you think share a connection, then check the group. A correct group stays together and reveals its category.', 'حدّد أربع كلمات تعتقد أنها تشترك في رابط، ثم تحقّق من المجموعة. تبقى المجموعة الصحيحة مجمّعة وتظهر فئتها.'],
      ['An incorrect group uses one of your four mistakes. A “one away” message means three selected words belong together; review the fourth.', 'تستهلك المجموعة غير الصحيحة واحدة من فرص الخطأ الأربع. تعني رسالة «كلمة واحدة تفصلك» أن ثلاث كلمات مختارة تنتمي معاً؛ فراجع الرابعة.'],
      ['Shuffle or clear your selection to reconsider the board. Solve all four groups before the fourth mistake to complete the puzzle.', 'اخلط ترتيب الكلمات أو امسح اختيارك لإعادة النظر في اللوحة. حلّ المجموعات الأربع قبل الخطأ الرابع لإكمال اللغز.'],
    ],
    note: ['Mini Connections in the Bonus collection uses nine words in three groups of three. Its separate progress does not count toward the standard daily total.', 'تستخدم الروابط المصغّرة في التحديات الإضافية تسع كلمات في ثلاث مجموعات من ثلاث. لها تقدّم منفصل لا يُحتسب ضمن إجمالي ألغاز اليوم الأساسية.'],
  },
  mosaic: {
    title: ['Mosaic: Match Layers and Clear the Board', 'زخارف: طابق الطبقات وأفرغ اللوحة'],
    description: ['Match colours, outlines and centre symbols in Mosaic. Clear shared layers, build a matching chain and finish this free visual pattern puzzle.', 'طابق الألوان والإطارات والرموز الوسطى في زخارف. أزل الطبقات المشتركة وابنِ سلسلة مطابقة وأكمل لغز الأنماط البصري المجاني.'],
    intro: ['Mosaic is a visual matching puzzle made of layered tiles. Two tiles can match in one feature even when their other features differ. Each successful pair removes the shared layers and changes what is available for your next choice.', 'زخارف لغز مطابقة بصري من بلاطات متعددة الطبقات. قد تتطابق بلاطتان في صفة واحدة رغم اختلاف صفاتهما الأخرى. يزيل كل زوج صحيح الطبقات المشتركة ويغيّر الخيارات المتاحة في الخطوة التالية.'],
    rules: [
      ['Choose two tiles that share a colour, an outline or a centre symbol. Every layer they share disappears from both tiles.', 'اختر بلاطتين تشتركان في لون أو إطار أو رمز أوسط. تختفي كل طبقة مشتركة منهما.'],
      ['Keep matching the selected tile to continue a chain. When that tile becomes empty, choose any remaining tile to continue.', 'تابع مطابقة البلاطة المحددة لمواصلة السلسلة. عندما تصبح فارغة، اختر أي بلاطة متبقية للمتابعة.'],
      ['A pair with no shared layer breaks the chain. Clear every layer on the board to finish. Layers are dealt in pairs, so a matching pair remains while layers remain.', 'يقطع الزوج الذي لا يشترك في أي طبقة سلسلة المطابقة. أزل جميع طبقات اللوحة لإتمام اللغز. تُوزّع الطبقات في أزواج، ولذلك يبقى زوج قابل للمطابقة ما دامت هناك طبقات.'],
    ],
    note: ['Look at the outline and centre symbol as well as the colour. A useful match may remove several layers at once, opening a different route through the board.', 'لاحظ الإطار والرمز الأوسط إلى جانب اللون. قد تزيل مطابقة واحدة عدة طبقات معاً وتفتح مساراً مختلفاً عبر اللوحة.'],
  },
  'letter-square': {
    title: ['Letter Square: Link Words around Twelve Letters', 'مربّع الحروف: اربط كلمات من اثني عشر حرفاً'],
    description: ['Use twelve letters around a square to build a word chain. Switch sides between letters and connect each new word to the last in Arabic or English.', 'استخدم اثني عشر حرفاً حول مربع لبناء سلسلة كلمات. انتقل بين الجوانب واربط بداية كل كلمة بنهاية سابقتها بالعربية أو الإنجليزية.'],
    intro: ['Letter Square puts three letters on each side of a square. Your goal is to use all twelve displayed letters in a connected sequence of words. The route between sides matters just as much as the words you choose.', 'يضع مربّع الحروف ثلاثة حروف على كل جانب من مربع. هدفك استخدام الحروف الاثني عشر كلها في تسلسل مترابط من الكلمات. ويهم الانتقال بين الجوانب بقدر أهمية الكلمات التي تختارها.'],
    rules: [
      ['Make a word of at least three letters using only the displayed letters. Two consecutive letters cannot come from the same side.', 'كوّن كلمة من ثلاثة حروف على الأقل باستخدام الحروف المعروضة فقط. لا يجوز أن يأتي حرفان متتاليان من الجانب نفسه.'],
      ['The next word must begin with the final letter of the previous word. Letters can be reused, including letters already covered by another word.', 'يجب أن تبدأ الكلمة التالية بآخر حرف من الكلمة السابقة. يمكن إعادة استخدام الحروف، بما فيها الحروف التي استخدمتها كلمة أخرى.'],
      ['Keep adding accepted words until every displayed letter has been used. Try to finish in fewer words, or undo a word to explore a different chain.', 'تابع إضافة كلمات مقبولة حتى تستخدم كل الحروف المعروضة. حاول الإنهاء بكلمات أقل، أو تراجع عن كلمة لتجربة سلسلة مختلفة.'],
    ],
    note: ['Each board includes a limited practice dictionary and an authored solution you can reveal. A different accepted chain is also valid when it follows the side rules and covers all letters.', 'تتضمن كل لوحة قاموس تدريب محدوداً وحلاً معدّاً مسبقاً يمكنك عرضه. تُقبل سلسلة أخرى أيضاً إذا التزمت بقواعد الجوانب واستخدمت جميع الحروف.'],
  },
  sudoku: {
    title: ['Sudoku: Free Puzzles in Three Difficulties', 'سودوكو: ألغاز مجانية بثلاثة مستويات'],
    description: ['Play free Sudoku with easy, medium and hard boards. Use notes, undo, checks and optional hints to complete a 9 × 9 grid with one solution.', 'العب سودوكو مجانية بمستويات سهل ومتوسط وصعب. استخدم الملاحظات والتراجع والتحقق والتلميحات الاختيارية لإكمال شبكة ٩ × ٩ ذات حل واحد.'],
    intro: ['Sudoku is a number-placement puzzle on a 9 × 9 grid. This edition offers easy, medium and hard generated boards, each checked for a unique solution. You can switch difficulty without discarding the progress saved for another level.', 'سودوكو لغز لوضع الأرقام في شبكة ٩ × ٩. توفر هذه النسخة لوحات مولّدة سهلة ومتوسطة وصعبة، ويُتحقق من وجود حل وحيد لكل منها. يمكنك تبديل المستوى دون فقدان التقدّم المحفوظ في مستوى آخر.'],
    rules: [
      ['Fill each row, column and 3 × 3 box with the numbers 1–9 exactly once. The starting numbers are fixed; use them to rule out possibilities.', 'املأ كل صف وعمود ومربع ٣ × ٣ بالأرقام من ١ إلى ٩ مرة واحدة لكل رقم. أرقام البداية ثابتة؛ استخدمها لاستبعاد الاحتمالات.'],
      ['Select a cell, then enter a number or turn on notes to record candidates. Arrow keys move through the grid, Backspace erases, and N switches notes on or off.', 'اختر خانة ثم أدخل رقماً، أو فعّل الملاحظات لتدوين الاحتمالات. تنقّل بالأسهم وامسح بمفتاح Backspace، واستخدم N لتبديل وضع الملاحظات.'],
      ['Undo a move, check your entries or reveal a correct number when needed. Finish the complete grid correctly to solve the puzzle; hint use is recorded.', 'تراجع عن حركة، أو تحقّق من إدخالاتك، أو اكشف رقماً صحيحاً عند الحاجة. أكمل الشبكة كلها بشكل صحيح لحل اللغز؛ ويُسجّل استخدام التلميحات.'],
    ],
    note: ['A shared Sudoku challenge includes its date and difficulty. Solving any level counts once for that language’s daily Sudoku completion, rather than three separate daily games.', 'يتضمن تحدي سودوكو المشارَك تاريخه ومستواه. يُحتسب حل أي مستوى مرة واحدة لإكمال سودوكو اليوم في تلك اللغة، وليس ثلاث ألعاب يومية منفصلة.'],
  },
};
