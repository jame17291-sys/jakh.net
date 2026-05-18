(function () {
  'use strict';

  const games = [
    game('chess', 'Chess', 'الشطرنج', 'Strategy', 'استراتيجية', 'Deep', 'عميقة', '15-30 min', '15-30 دقيقة', '#5DB7EA', ['strategy', 'deep'], true),
    game('checkers', 'Checkers', 'الداما', 'Tactics', 'تكتيك', 'Medium', 'متوسطة', '8-18 min', '8-18 دقيقة', '#F97316', ['strategy', 'quick'], true),
    game('go', 'Go 9x9', 'غو 9x9', 'Territory', 'السيطرة على المساحة', 'Deep', 'عميقة', '12-25 min', '12-25 دقيقة', '#E0B15A', ['strategy', 'deep'], true),
    game('reversi', 'Reversi', 'ريفيرسي', 'Position', 'تمركز', 'Medium', 'متوسطة', '6-14 min', '6-14 دقيقة', '#9AE66E', ['strategy', 'logic', 'quick'], true),
    game('backgammon', 'Backgammon', 'الطاولة', 'Probability', 'احتمالات', 'Medium', 'متوسطة', '8-18 min', '8-18 دقيقة', '#C084FC', ['strategy', 'quick'], false),
    game('nine-mens-morris', "Nine Men's Morris", 'طاحونة التسعة', 'Pattern traps', 'مصائد نمطية', 'Medium', 'متوسطة', '8-16 min', '8-16 دقيقة', '#38BDF8', ['strategy', 'logic'], false),
    game('oware', 'Oware', 'أواري', 'Counting', 'عد وتخطيط', 'Medium', 'متوسطة', '8-18 min', '8-18 دقيقة', '#F59E0B', ['strategy', 'ancient'], false),
    game('four-in-a-row', 'Four in a Row', 'أربعة على صف', 'Tactical lines', 'خطوط تكتيكية', 'Quick', 'سريعة', '3-8 min', '3-8 دقائق', '#EF4444', ['logic', 'quick'], true),
    game('gomoku', 'Gomoku', 'غوموكو', 'Line reading', 'قراءة الخطوط', 'Medium', 'متوسطة', '5-12 min', '5-12 دقيقة', '#22D3EE', ['logic', 'quick'], false),
    game('dots-and-boxes', 'Dots and Boxes', 'النقاط والمربعات', 'Endgame timing', 'توقيت النهاية', 'Quick', 'سريعة', '4-10 min', '4-10 دقائق', '#A78BFA', ['logic', 'quick'], false),
    game('hex', 'Hex', 'هكس', 'Connection', 'الربط', 'Deep', 'عميقة', '8-20 min', '8-20 دقيقة', '#FB7185', ['strategy', 'deep'], false),
    game('tapatan', 'Tapatan', 'تاباتان', 'Three-in-line', 'ثلاثة على خط', 'Quick', 'سريعة', '3-7 min', '3-7 دقائق', '#34D399', ['logic', 'quick', 'ancient'], false),
    game('alquerque', 'Alquerque', 'الكركة', 'Capture nets', 'شبكات الأسر', 'Medium', 'متوسطة', '8-16 min', '8-16 دقيقة', '#60A5FA', ['strategy', 'ancient'], false),
    game('fanorona', 'Fanorona', 'فانورونا', 'Approach capture', 'أسر بالاقتراب', 'Deep', 'عميقة', '10-22 min', '10-22 دقيقة', '#FBBF24', ['strategy', 'ancient', 'deep'], false),
    game('royal-game-of-ur', 'Royal Game of Ur', 'لعبة أور الملكية', 'Race planning', 'تخطيط السباق', 'Quick', 'سريعة', '5-12 min', '5-12 دقيقة', '#D97706', ['ancient', 'quick'], false),
    game('senet', 'Senet', 'سينيت', 'Route control', 'التحكم بالمسار', 'Medium', 'متوسطة', '7-14 min', '7-14 دقيقة', '#CA8A04', ['ancient', 'strategy'], false),
    game('fox-and-geese', 'Fox and Geese', 'الثعلب والإوز', 'Asymmetric play', 'لعب غير متماثل', 'Medium', 'متوسطة', '7-15 min', '7-15 دقيقة', '#84CC16', ['strategy', 'logic'], false),
    game('seega', 'Seega', 'سيجا', 'Placement traps', 'مصائد التمركز', 'Medium', 'متوسطة', '8-16 min', '8-16 دقيقة', '#14B8A6', ['strategy', 'ancient'], false),
    game('konane', 'Konane', 'كوناني', 'Jump tactics', 'تكتيك القفز', 'Medium', 'متوسطة', '6-14 min', '6-14 دقيقة', '#E879F9', ['strategy', 'logic'], false),
    game('hnefatafl', 'Hnefatafl', 'هنيفاتافل', 'King escape', 'هروب الملك', 'Deep', 'عميقة', '10-24 min', '10-24 دقيقة', '#94A3B8', ['strategy', 'ancient', 'deep'], false),
    game('crossword', 'Crossword', 'الكلمات المتقاطعة', 'Word recall', 'استرجاع الكلمات', 'Quick', 'سريعة', '5-15 min', '5-15 دقيقة', '#F472B6', ['logic', 'word'], true),
  ];

  function game(id, en, ar, skillEn, skillAr, depthEn, depthAr, timeEn, timeAr, accent, tags, featured) {
    return {
      id,
      title: { en, ar },
      href: id === 'backgammon' ? 'backgammon.html' : id === 'crossword' ? 'crossword.html' : 'game.html?game=' + encodeURIComponent(id),
      skill: { en: skillEn, ar: skillAr },
      depth: { en: depthEn, ar: depthAr },
      time: { en: timeEn, ar: timeAr },
      accent,
      featured,
      tags: ['all', 'computer', 'online'].concat(tags),
      scoreOrder: 'desc',
      scoreLabel: {
        en: 'Higher skill score ranks higher',
        ar: 'النقاط الأعلى تتصدر الترتيب',
      },
      modes: {
        en: 'Computer or online room',
        ar: 'ضد الكمبيوتر أو غرفة أونلاين',
      },
      summary: {
        en: summaryFor(id, en),
        ar: arabicSummaryFor(id, ar),
      },
      lesson: {
        en: lessonFor(id),
        ar: arabicLessonFor(id),
      },
      howTo: {
        en: howToFor(id),
        ar: arabicHowToFor(id),
      },
    };
  }

  function summaryFor(id, title) {
    const map = {
      chess: 'Classic calculation, piece coordination, and long-range planning.',
      checkers: 'Clean diagonal tactics with forced captures and promotion races.',
      go: 'A compact territory game for influence, shape, and patient strategy.',
      reversi: 'Flip lines, protect corners, and time the board swing.',
      backgammon: 'Race, block, and calculate risk through controlled dice movement.',
      'nine-mens-morris': 'Place, slide, and form mills to remove opposing pieces.',
      oware: 'Count seeds, forecast captures, and manage tempo around the board.',
      'four-in-a-row': 'Build threats in columns while blocking immediate wins.',
      gomoku: 'Create five-stone lines through forcing patterns and defense.',
      'dots-and-boxes': 'Claim boxes by timing chains and sacrificing short-term moves.',
      hex: 'Connect opposite sides through virtual links and spatial pressure.',
      tapatan: 'A tiny three-in-line race from the ancient abstract family.',
      alquerque: 'A pre-checkers capture game with dense tactical movement.',
      fanorona: 'Madagascar strategy built around approach and withdrawal captures.',
      'royal-game-of-ur': 'Ancient race strategy with safe squares and tempo choices.',
      senet: 'A historic route game about timing, blocks, and escape.',
      'fox-and-geese': 'An asymmetric hunt where one side escapes and the other surrounds.',
      seega: 'North African placement and capture strategy on a compact board.',
      konane: 'Hawaiian jump tactics with shrinking options and zugzwang pressure.',
      hnefatafl: 'Viking-family king escape strategy with asymmetric forces.',
      crossword: 'Fill a letter grid using across and down clues — five themed puzzles.',
    };
    return map[id] || title + ' trains logic, planning, and tactical attention.';
  }

  function arabicSummaryFor(id, title) {
    const map = {
      chess: 'حساب كلاسيكي وتنسيق للقطع وتخطيط بعيد المدى.',
      checkers: 'تكتيك قطري واضح مع أسر إجباري وسباق ترقية.',
      go: 'لعبة مساحات مصغرة للتأثير والشكل والصبر الاستراتيجي.',
      reversi: 'اقلب الخطوط واحم الزوايا واختر توقيت التحول.',
      backgammon: 'سابق واحصر واحسب المخاطرة مع حركة النرد.',
      'nine-mens-morris': 'ضع وحرك وشكل طاحونة لإزالة قطع الخصم.',
      oware: 'عد البذور وتوقع الأسر وتحكم بإيقاع اللوحة.',
      'four-in-a-row': 'ابن تهديدات في الأعمدة وامنع الفوز الفوري.',
      gomoku: 'اصنع خمسة أحجار على خط عبر ضغط ودفاع.',
      'dots-and-boxes': 'اكسب المربعات بتوقيت السلاسل والتضحية القصيرة.',
      hex: 'اربط الجانبين عبر وصلات افتراضية وضغط مكاني.',
      tapatan: 'لعبة صغيرة من عائلة ثلاث على خط القديمة.',
      alquerque: 'لعبة أسر قديمة سبقت الداما بحركة تكتيكية كثيفة.',
      fanorona: 'استراتيجية من مدغشقر تعتمد على أسر الاقتراب والانسحاب.',
      'royal-game-of-ur': 'سباق قديم بمربعات آمنة واختيارات إيقاعية.',
      senet: 'لعبة مسار تاريخية عن التوقيت والحواجز والخروج.',
      'fox-and-geese': 'مطاردة غير متماثلة بين الهروب والإحاطة.',
      seega: 'استراتيجية شمال أفريقية للتمركز والأسر على لوحة صغيرة.',
      konane: 'تكتيك قفز هاواي مع تقلص الخيارات والضغط.',
      hnefatafl: 'استراتيجية هروب الملك من عائلة ألعاب الفايكنغ.',
      crossword: 'امأ شبكة الحروف باستخدام تلميحات أفقية وعمودية — خمس ألغاز مواضيعية.',
    };
    return map[id] || title + ' تدرب المنطق والتخطيط والانتباه التكتيكي.';
  }

  function lessonFor(id) {
    const map = {
      chess: 'Calculation and planning',
      checkers: 'Forcing moves',
      go: 'Territory judgment',
      reversi: 'Timing and corners',
      backgammon: 'Probability under pressure',
      'nine-mens-morris': 'Pattern traps',
      oware: 'Counting and forecasting',
      'four-in-a-row': 'Threat detection',
      gomoku: 'Line construction',
      'dots-and-boxes': 'Endgame control',
      hex: 'Connection strategy',
      tapatan: 'Micro tactics',
      alquerque: 'Capture sequencing',
      fanorona: 'Approach and withdrawal',
      'royal-game-of-ur': 'Risk and tempo',
      senet: 'Route timing',
      'fox-and-geese': 'Asymmetric planning',
      seega: 'Placement discipline',
      konane: 'Jump economy',
      hnefatafl: 'Escape geometry',
      crossword: 'Word recall and spelling',
    };
    return map[id] || 'Strategic focus';
  }

  function arabicLessonFor(id) {
    const map = {
      chess: 'الحساب والتخطيط',
      checkers: 'الحركات الإجبارية',
      go: 'تقدير المساحة',
      reversi: 'التوقيت والزوايا',
      backgammon: 'الاحتمال تحت الضغط',
      'nine-mens-morris': 'مصائد الأنماط',
      oware: 'العد والتوقع',
      'four-in-a-row': 'اكتشاف التهديد',
      gomoku: 'بناء الخطوط',
      'dots-and-boxes': 'تحكم النهاية',
      hex: 'استراتيجية الربط',
      tapatan: 'تكتيك مصغر',
      alquerque: 'تسلسل الأسر',
      fanorona: 'الاقتراب والانسحاب',
      'royal-game-of-ur': 'المخاطرة والإيقاع',
      senet: 'توقيت المسار',
      'fox-and-geese': 'تخطيط غير متماثل',
      seega: 'انضباط التمركز',
      konane: 'اقتصاد القفز',
      hnefatafl: 'هندسة الهروب',
      crossword: 'استرجاع الكلمات والتهجئة',
    };
    return map[id] || 'تركيز استراتيجي';
  }

  function howToFor(id) {
    const map = {
      chess: ['Move one piece on your turn using its natural chess movement.', 'Capture opposing pieces by landing on their square.', 'Win by capturing the king or leaving the opponent without useful moves.'],
      checkers: ['Move diagonally across the dark-square pattern.', 'Capture by jumping onto an opposing piece when a landing square is open.', 'Win by removing the opponent pieces or trapping their movement.'],
      go: ['Place one stone on an empty intersection each turn.', 'Build influence by surrounding space and limiting the opponent shape.', 'When the compact board fills, the side with more control wins.'],
      reversi: ['Place a disc to pressure rows, columns, and diagonals.', 'Use edges and corners to create stable positions.', 'Win by controlling more spaces when the board is full.'],
      backgammon: ['Choose one of your pieces and move it by the current roll.', 'Race your pieces around the track while blocking the opponent path.', 'Win by bringing all of your pieces home first.'],
      'nine-mens-morris': ['Place pieces on the board to build three-in-a-row mills.', 'Use each placement to threaten a future line.', 'Complete a mill before your opponent does.'],
      oware: ['Choose one pit on your side and sow its seeds around the board.', 'Count carefully so the final seed lands where you want.', 'Capture and store more seeds than the opponent.'],
      'four-in-a-row': ['Drop a disc into any open column.', 'Build horizontal, vertical, or diagonal threats.', 'Connect four before the opponent blocks or wins first.'],
      gomoku: ['Place one stone on an empty point each turn.', 'Build open lines while blocking the opponent line.', 'Create five in a row to win.'],
      'dots-and-boxes': ['Claim empty spaces on the dot grid.', 'Time your moves so you finish valuable box chains.', 'Control more boxes by the end of the board.'],
      hex: ['Place one stone each turn on the hex field.', 'Connect your two opposite sides while cutting enemy paths.', 'Win by completing an unbroken connection.'],
      tapatan: ['Place pieces to form a three-in-a-line threat.', 'Use the tiny board to block and counter-threaten.', 'Complete the line before your opponent.'],
      alquerque: ['Move through the connected points of the board.', 'Capture by landing on opposing pieces when possible.', 'Win by reducing the opponent force or trapping it.'],
      fanorona: ['Move along the board lines toward strong capture lanes.', 'Use approach and withdrawal patterns to gain material.', 'Win by outmaneuvering the opponent pieces.'],
      'royal-game-of-ur': ['Move one piece along the ancient race path.', 'Use safe timing to avoid losing tempo.', 'Bring all pieces home before the opponent.'],
      senet: ['Advance pieces along the route using the current roll.', 'Block and time moves to escape crowded sections.', 'Win by moving your full set off the track first.'],
      'fox-and-geese': ['One side uses the fox to move aggressively through gaps.', 'The other side surrounds and limits escape routes.', 'Win by escaping with the fox or trapping it.'],
      seega: ['Place pieces to build strong central pressure.', 'Move into capture positions once the board opens.', 'Win by controlling space and reducing the opponent.'],
      konane: ['Jump in straight lines from piece to open point.', 'Force the opponent into fewer and fewer jumps.', 'Win by leaving the opponent without a move.'],
      hnefatafl: ['Protect the king and move toward an escape route.', 'Attackers coordinate surrounding pressure.', 'The king side wins by escaping; attackers win by trapping the king.'],
      crossword: ['Read the numbered clues in the Across and Down lists.', 'Click a cell, type a letter, and navigate with arrow keys or Tab.', 'Use Check to highlight errors or Reveal to show the full solution.'],
    };
    return map[id] || ['Read the board.', 'Choose a legal move.', 'Win by controlling the final position.'];
  }

  function arabicHowToFor(id) {
    const map = {
      chess: ['حرّك قطعة واحدة في دورك حسب حركتها الطبيعية.', 'أسر قطعة الخصم بالوصول إلى مربعها.', 'افز بأسر الملك أو ترك الخصم بلا حركة مفيدة.'],
      checkers: ['تحرك قطرياً على نمط المربعات الداكنة.', 'اقفز لأسر قطعة خصم عندما يكون مربع الهبوط مفتوحاً.', 'افز بإزالة قطع الخصم أو حبس حركتها.'],
      go: ['ضع حجراً واحداً على تقاطع فارغ في كل دور.', 'ابنِ تأثيراً حول المساحات وضيّق شكل الخصم.', 'عند امتلاء اللوحة يفوز من يملك سيطرة أكبر.'],
      reversi: ['ضع قرصاً للضغط على الصفوف والأعمدة والأقطار.', 'استخدم الحواف والزوايا لبناء مواقع ثابتة.', 'افز بالسيطرة على مساحات أكثر عند امتلاء اللوحة.'],
      backgammon: ['اختر قطعة وحركها حسب الرمية الحالية.', 'سابق بقطعك حول المسار مع إعاقة طريق الخصم.', 'افز بإيصال كل قطعك إلى النهاية أولاً.'],
      'nine-mens-morris': ['ضع القطع لبناء طاحونة من ثلاث قطع على خط.', 'اجعل كل وضعية تهدد خطاً لاحقاً.', 'أكمل الطاحونة قبل الخصم.'],
      oware: ['اختر حفرة من جهتك وانثر بذورها حول اللوحة.', 'عد بدقة حتى تنتهي البذرة الأخيرة في المكان المطلوب.', 'اجمع بذوراً أكثر من الخصم.'],
      'four-in-a-row': ['أسقط قرصاً في أي عمود مفتوح.', 'ابنِ تهديدات أفقية أو عمودية أو قطرية.', 'اربط أربعة قبل أن يمنعك الخصم أو يفوز.'],
      gomoku: ['ضع حجراً واحداً على نقطة فارغة في كل دور.', 'ابنِ خطوطاً مفتوحة وامنع خط الخصم.', 'اصنع خمسة على خط للفوز.'],
      'dots-and-boxes': ['استحوذ على المساحات الفارغة في شبكة النقاط.', 'اختر توقيتك لإكمال سلاسل المربعات المهمة.', 'سيطر على مربعات أكثر عند نهاية اللوحة.'],
      hex: ['ضع حجراً واحداً في كل دور على حقل الهكس.', 'اربط جانبيك المتقابلين واقطع مسارات الخصم.', 'افز بإكمال اتصال غير منقطع.'],
      tapatan: ['ضع القطع لصناعة تهديد ثلاثي على خط.', 'استخدم اللوحة الصغيرة للمنع والتهديد المضاد.', 'أكمل الخط قبل الخصم.'],
      alquerque: ['تحرك عبر نقاط اللوحة المتصلة.', 'أسر بالوصول إلى قطع الخصم عندما يكون ذلك متاحاً.', 'افز بتقليل قوة الخصم أو حبسها.'],
      fanorona: ['تحرك على خطوط اللوحة نحو مسارات أسر قوية.', 'استخدم الاقتراب والانسحاب لكسب القطع.', 'افز بمناورة قطع الخصم.'],
      'royal-game-of-ur': ['حرّك قطعة واحدة على مسار السباق القديم.', 'استخدم التوقيت الآمن لتجنب خسارة الإيقاع.', 'أوصل كل القطع إلى النهاية قبل الخصم.'],
      senet: ['تقدم بالقطع على المسار حسب الرمية الحالية.', 'استخدم الحواجز والتوقيت للخروج من المناطق المزدحمة.', 'افز بإخراج كل قطعك من المسار أولاً.'],
      'fox-and-geese': ['جانب الثعلب يتحرك بعدوانية عبر الفجوات.', 'الجانب الآخر يحيط ويقلل طرق الهروب.', 'يفوز الثعلب بالهروب ويفوز الآخرون بحبسه.'],
      seega: ['ضع القطع لبناء ضغط قوي في المركز.', 'تحرك إلى مواقع الأسر عندما تنفتح اللوحة.', 'افز بالسيطرة على المساحة وتقليل الخصم.'],
      konane: ['اقفز بخط مستقيم من قطعة إلى نقطة مفتوحة.', 'اجبر الخصم على خيارات قفز أقل.', 'افز بترك الخصم بلا حركة.'],
      hnefatafl: ['احمِ الملك وتحرك نحو طريق الهروب.', 'المهاجمون ينسقون ضغط الإحاطة.', 'يفوز الملك بالهروب ويفوز المهاجمون بحبسه.'],
      crossword: ['اقرأ التلميحات المرقمة في قائمتي أفقي وعمودي.', 'انقر على خلية واكتب حرفاً وتنقل بمفاتيح الأسهم أو Tab.', 'استخدم تحقق لتمييز الأخطاء أو كشف لإظهار الحل الكامل.'],
    };
    return map[id] || ['اقرأ اللوحة.', 'اختر حركة قانونية.', 'افز بالسيطرة على الوضع النهائي.'];
  }

  window.JakhBrainGames = games;
})();
