// Original, finite practice library. These lists are intentionally curated, not
// a general dictionary. Display spellings are preserved; matching strips marks.
export const WORD_BANKS = {
  en: {
    answers: ['TRAIL', 'CORAL', 'LIGHT', 'PLANT', 'CLOUD', 'BRAVE', 'OCEAN', 'STONE', 'BLOOM', 'PEARL', 'DREAM', 'OLIVE', 'APPLE', 'RIVER', 'GRAPE', 'HOUSE', 'MUSIC', 'BEACH', 'HONEY', 'SMILE', 'EARTH', 'FLAME', 'CEDAR', 'LEMON'],
    words: ('TRAIL CORAL LIGHT PLANT CLOUD BRAVE OCEAN STONE BLOOM PEARL DREAM OLIVE APPLE ALLEY EAGLE LEVEL ARRAY ERROR SHEEP GREEN GREAT GRAPE PLATE CRANE TRAIN TRADE STARE SLATE RAISE AROSE HOUSE MOUSE WATER RIVER FIELD GRASS TREES LEAFY BERRY PEACH MANGO MELON LEMON HONEY BREAD FLOUR GRAIN CHAIR TABLE SHELF CLOCK WATCH MUSIC SOUND PIANO DANCE BEACH SHELL WAVES SANDY SMILE HAPPY QUIET CLEAR STORM NIGHT SHINE FLAME SPARK EARTH VENUS MAPLE CEDAR FLORA FAUNA ROAST COAST BOAST TOAST FLOAT GLOAT ALONE ALOUD ABOUT ABOVE OTHER THEIR THERE WHICH WHILE EVERY NEVER THREE SEVEN EIGHT FIRST ROUND POINT GUESS WORDS SWORD WORLD WRITE RIGHT WROTE BLACK WHITE BROWN AMBER AZURE TEALS TILES').split(' '),
  },
  ar: {
    answers: ['حديقة', 'نافذة', 'مدينة', 'سفينة', 'جزيرة', 'طبيعة', 'نجارة', 'رسالة', 'وسادة', 'عبارة', 'مكتبة', 'مفتاح', 'مدرسة', 'جامعة', 'طاولة', 'سيارة', 'حقيبة', 'حكاية', 'فراشة', 'حمامة', 'خريطة', 'ثقافة', 'زيارة', 'قراءة'],
    words: ('حديقة نافذة مدينة سفينة جزيرة طبيعة نجارة رسالة وسادة عبارة مكتبة مفتاح مدرسة جامعة طاولة سيارة حقيبة جميلة صغيرة كبيرة طويلة قصيرة سعيدة حكاية بداية نهاية فراشة غزالة حمامة ثمينة كريمة لطيفة قريبة بعيدة جديدة قديمة قافلة قبيلة فاكهة قهوة خريطة دقيقة حقيقة طريقة نتيجة معرفة مسافة مساحة ثقافة حضارة حرارة برودة سباحة تجارة زيارة نظارة كتابة قراءة ثلاثة أربعة خمسة ستة سبعة ثمانية تسعة عشرة أزهار أشجار أنهار ألوان أخبار أقلام أبواب أصوات أسماء أوقات أمطار أقمشة أوراق أسواق أشكال').split(' '),
  },
};

export const HIVES = {
  en: [
    { center: 'A', letters: ['A', 'E', 'L', 'P', 'R', 'T', 'N'], pangram: 'PLANTER', words: ('ANTE AREA ARENA EARL EARN LANE LATE LEAN LEAP NEAR NEAT PALE PANE PANT PARE PART PEAL PEAR PEAT PLAN PLANE PLANET PLANT PLANTER PLATE PLEA PLEAT PARENT RANT RARE RATE REAL REAP REAR RENTAL TALL TAPE TARE TARP TART TEAL TEAR TRAP TREAT ALTER ALERT LATER LEARN LEANT PANEL PATENT PATTERN PARALLEL RATTLE RELATE REPEAL REPEAT').split(' ') },
    { center: 'O', letters: ['O', 'C', 'N', 'E', 'D', 'I', 'T'], pangram: 'COINCIDENT', words: ('COIN CONE CODE COED COTE DONE DODO DOTE ICON INTO IONIC NEON NODE NOON NONE NOTE ONCE ONION ONTO TONE TOED COCOON COTTON CONNECTION CONDITION COINCIDENT DECOCTION EDITION NOTION NOTICE INTONE TOOT TOTE ICONIC TONIC').split(' ') },
    { center: 'R', letters: ['R', 'E', 'S', 'T', 'O', 'U', 'C'], pangram: 'COURTEOUS', words: ('CORE CURE CURT CREST CRESS CROSS CRUST CROC CURES CURSE CURSOR CURSES CUTER ERECT EURO EUROS ERROR ERRORS REST RETRO RECUR RECURS RESORT RESTORE RESCUE ROOT ROOTS ROSE ROSES ROTOR ROTORS ROUT ROUTE ROUTES ROTE TOUR TOURS TREE TREES TRUE TRUER TRUST TRUSS TROUT TROT TROTS TORT TORTS TORUS SOURCE SOUR SURE SORE STORE STEER STEREO STREET STRESS STRUCTURE COUTURE COURT COURTS COURTEOUS OCCUR OCCURS').split(' ') },
  ],
  ar: [
    { center: 'ر', letters: ['ر', 'ح', 'ب', 'س', 'ا', 'م', 'ل'], pangram: 'بالمسرح', words: ('بحر حبر حرب ربح رمل سحر سمر مرر حرر حارس ساحر سامر مسار رمال بحار رابح مسرح مراحل مراسل سراب محارب محار حراب رحاب مرام حرام بالمسرح').split(' ') },
    { center: 'ب', letters: ['ب', 'ا', 'ت', 'ك', 'ل', 'م', 'ر'], pangram: 'بالمركبات', words: ('باب بكر برك كتب كبت كلب كاتب كتاب مكتب مكتبات مبارك مركب مركبات ركاب ركب بارك بركات تراب بلبل كباب كرب برم مرتب رتب كبل بتر لباب بلل بالمركبات').split(' ') },
    { center: 'ق', letters: ['ق', 'م', 'س', 'ت', 'ب', 'ل', 'ي'], pangram: 'مستقبلي', words: ('قسم قلب قلبت قبل قبيل قبلي قيم قلم قمت مقبل مستقبل مستقبلي مستقيم مستقل متقلب مقلب مقيت مقيم قليل تقليب تقسيم يقسم يقلب يقبل يستقبل يستقيم يستقل تستقبل تستقيم تستقل يسبق سبق بقي بقيت لقي لقيت').split(' ') },
  ],
};

export const LINK_SETS = {
  en: [
    [
      { title: 'Planets near the Sun', words: ['Mercury', 'Venus', 'Earth', 'Mars'] },
      { title: 'Actions in a recipe', words: ['Chop', 'Whisk', 'Knead', 'Stir'] },
      { title: 'Shades of blue', words: ['Navy', 'Azure', 'Cobalt', 'Teal'] },
      { title: 'Can come before “light”', words: ['Moon', 'Spot', 'Day', 'Flash'] },
    ],
    [
      { title: 'Parts of a tree', words: ['Root', 'Trunk', 'Branch', 'Leaf'] },
      { title: 'Things with keys', words: ['Piano', 'Keyboard', 'Lock', 'Map'] },
      { title: 'Ways to move through water', words: ['Swim', 'Row', 'Sail', 'Paddle'] },
      { title: 'Can follow “book”', words: ['Case', 'Mark', 'Worm', 'Shop'] },
    ],
    [
      { title: 'Breads from the bakery', words: ['Baguette', 'Brioche', 'Focaccia', 'Pita'] },
      { title: 'Associated with sewing', words: ['Needle', 'Thread', 'Thimble', 'Seam'] },
      { title: 'Units of measurement', words: ['Meter', 'Liter', 'Gram', 'Second'] },
      { title: 'Can follow “rain”', words: ['Bow', 'Coat', 'Drop', 'Forest'] },
    ],
    [
      { title: 'Chess pieces', words: ['Bishop', 'Knight', 'Rook', 'Pawn'] },
      { title: 'Precipitation', words: ['Drizzle', 'Hail', 'Sleet', 'Snow'] },
      { title: 'Punctuation marks', words: ['Comma', 'Colon', 'Dash', 'Period'] },
      { title: 'Can follow “tea”', words: ['Cup', 'Pot', 'Spoon', 'Towel'] },
    ],
    [
      { title: 'Musical instruments', words: ['Violin', 'Trumpet', 'Flute', 'Cello'] },
      { title: 'Insects', words: ['Beetle', 'Ant', 'Moth', 'Wasp'] },
      { title: 'Compass directions', words: ['North', 'South', 'East', 'West'] },
      { title: 'Can follow “sun”', words: ['Rise', 'Set', 'Flower', 'Glasses'] },
    ],
    [
      { title: 'Spices', words: ['Cumin', 'Paprika', 'Saffron', 'Nutmeg'] },
      { title: 'Three-dimensional shapes', words: ['Cube', 'Cone', 'Sphere', 'Pyramid'] },
      { title: 'Ways to look', words: ['Gaze', 'Peek', 'Stare', 'Glance'] },
      { title: 'Board games', words: ['Chess', 'Go', 'Ludo', 'Checkers'] },
    ],
  ],
  ar: [
    [
      { title: 'فواكه', words: ['تفاح', 'موز', 'عنب', 'خوخ'] },
      { title: 'ألوان', words: ['أحمر', 'أزرق', 'أخضر', 'أصفر'] },
      { title: 'كائنات بحرية', words: ['حوت', 'قرش', 'دلفين', 'أخطبوط'] },
      { title: 'أدوات في الورشة', words: ['مطرقة', 'منشار', 'مثقاب', 'مفك'] },
    ],
    [
      { title: 'أجزاء الشجرة', words: ['جذر', 'جذع', 'غصن', 'ورقة'] },
      { title: 'آلات موسيقية', words: ['عود', 'ناي', 'قانون', 'كمان'] },
      { title: 'أشياء في المطبخ', words: ['قدر', 'ملعقة', 'صحن', 'مصفاة'] },
      { title: 'تأتي بعد كلمة «عين»', words: ['الشمس', 'الماء', 'الجمل', 'الإبرة'] },
    ],
    [
      { title: 'مكونات الخبز', words: ['دقيق', 'خميرة', 'ماء', 'ملح'] },
      { title: 'أشياء تتعلق بالخياطة', words: ['إبرة', 'خيط', 'كشتبان', 'غرزة'] },
      { title: 'وحدات قياس', words: ['متر', 'لتر', 'غرام', 'ثانية'] },
      { title: 'تأتي بعد كلمة «بيت»', words: ['الشعر', 'المال', 'الحكمة', 'المقدس'] },
    ],
    [
      { title: 'قطع الشطرنج', words: ['ملك', 'وزير', 'رخ', 'حصان'] },
      { title: 'أنواع الهطول', words: ['مطر', 'ثلج', 'برد', 'رذاذ'] },
      { title: 'علامات ترقيم', words: ['فاصلة', 'نقطة', 'شرطة', 'فاصلة منقوطة'] },
      { title: 'أوصاف للشاي', words: ['أخضر', 'أسود', 'مثلج', 'بالنعناع'] },
    ],
    [
      { title: 'آلات موسيقية', words: ['بيانو', 'بوق', 'طبلة', 'قيثارة'] },
      { title: 'حشرات', words: ['نملة', 'نحلة', 'فراشة', 'خنفساء'] },
      { title: 'اتجاهات', words: ['شمال', 'جنوب', 'شرق', 'غرب'] },
      { title: 'تأتي بعد كلمة «قوس»', words: ['قزح', 'النصر', 'الكمان', 'القدم'] },
    ],
    [
      { title: 'توابل', words: ['كمون', 'قرفة', 'زعفران', 'قرنفل'] },
      { title: 'مجسمات هندسية', words: ['مكعب', 'مخروط', 'كرة', 'هرم'] },
      { title: 'أفعال تتعلق بالنظر', words: ['نظر', 'حدق', 'لمح', 'تأمل'] },
      { title: 'ألعاب لوحية', words: ['شطرنج', 'طاولة', 'ضامة', 'لودو'] },
    ],
  ],
};

export const TRAIL_SETS = {
  en: [
    { theme: 'A day outdoors', span: 'GREATOUTDOORS', words: ['GREATOUTDOORS', 'FOREST', 'RIVER', 'TRAIL', 'SUNSHINE', 'MEADOW', 'STONE'], extras: ['GREAT', 'OUT', 'DOOR', 'DOORS', 'REST', 'RAIL', 'SUN', 'SHINE', 'MEAD', 'ONE', 'TONE'] },
    { theme: 'Set the table, put the kettle on', span: 'KITCHENCUPBOARD', words: ['KITCHENCUPBOARD', 'SPOON', 'PLATE', 'BOWL', 'KNIFE', 'KETTLE', 'WHISK', 'CUP'], extras: ['KITCHEN', 'CUPBOARD', 'BOARD', 'ITCH', 'HEN', 'BOAR', 'LATE', 'ATE', 'OWL', 'KIT', 'HIS'] },
  ],
  ar: [
    { theme: 'هواء طلق', span: 'نزهةبالطبيعة', words: ['نزهةبالطبيعة', 'غابة', 'نهر', 'جبال', 'شمس', 'زهور', 'فراشة', 'عشب', 'سماء', 'صخور', 'ظل'], extras: ['نزهة', 'طبيعة', 'بال', 'زهر', 'فراش'] },
    { theme: 'لنجهز المائدة', span: 'أدواتالمطبخ', words: ['أدواتالمطبخ', 'ملعقة', 'صحن', 'كوب', 'سكين', 'شوكة', 'إبريق', 'قدر', 'مصفاة', 'مقلاة'], extras: ['أدوات', 'المطبخ', 'مطبخ', 'طبخ', 'ريق', 'شوك', 'صفا'] },
  ],
};

export const LETTER_SQUARES = {
  en: [{ sides: [['T', 'A', 'L'], ['R', 'V', 'I'], ['E', 'G', 'O'], ['H', 'N', 'S']], solution: ['TRAVEL', 'LIGHT', 'TONE', 'EAST'], words: ('TRAVEL LIGHT TONE EAST NIGHT STONE LINE LION NAIL SAIL SING GRAIN TRAIN TRAIL RAVE RAVEN RAIN RAISE ROSE ROAST REST RENT NOTE NEST SIGHT SINE SITE SLING STEIN TEAR TENT THAN THEN THERE THIN THIS THORN TIER TILE TOIL TORN VAIN VAST VEIL VEIN VENT VEST VOTE ANGLE ANTI ARENA ART EAR EARN ERA ERG GIANT GRANT GRAVE GROAN HAIL HARE HAVE HEAR HEN HERE HERO HERS HINT HOLE HONE HORN HORSE HOST HOTEL ION ISLE LEAN LEARN LEAST LEAVE LENT LET LIAR LINT LIST LOAN LONE LONG LORE LOSE LOT LOTION LOVE NEAR NET NINE NITRO NOISE NORTH OAR ONE ORE OTHER OVER OVEN REIGN ROLE SANE SAVE SEAR SEVEN SIGN SILO SOAR SOLE STERN STOLE STORE STOVE STRAIN STRONG TEN TERN TEST THRONE TIN TINGLE TON TOR TORSO VANE VETO').split(' ') },
    { sides: [['G', 'R', 'N'], ['A', 'D', 'H'], ['E', 'I', 'O'], ['T', 'L', 'M']], solution: ['GARDEN', 'NIGHT', 'TRAIL', 'LEMON'], words: ('GARDEN NIGHT TRAIL LEMON TRAIN LIGHT TONE NOTE LINE NAIL LIAR LARD DEAR RIDE RIND HEAR HEARD HEART EARTH MOTHER OTHER MIGHT RIGHT TIGHT TITAN TAIL TILE TAME LAME NAME NEAR MEAN MEAL MEND MIND MINT MINE MAIN MOAN ROAM RODE ROD RED RAN RAT TAR TAN TEN NET TIN LIT LOT LOG DOG GOD DIG DIN DEN END AND AID AIM AIR ARM ART ARE EAR EAT ATE AGE AGO EGO GEL GEM GET GOT HIM HEM HER HEN HOT HIT HID HOG HEAL HEAT HELD HERO HIDE HIND HINT HIRE HOLD HOLE HOME HONE IDEA IDLE IRON LAID LAIN LAND LANE LATE LATH LEAN LEND LENT LIME LIMO LINT LOAM LOAN LODE LONE LORD LORE MAIL MAID MANE MARE MATE MATH MEAT MELD MERE MILD MILE MODE MOLD MOLE MORE MOTE MOTH NEAT NINE NODE NONE NORM OATH ODE OMEN ORAL RAGE RAID RAIL RAIN RANT RATE REAL REAM REAR RENT RETOLD ROAN ROAR ROLE TARE TEAL TEAM TEAR TEND TENT TERM THEM THEN THIN TIDE TIME TOLD TOME TOTE TRIM TROD').split(' ') },
  ],
  ar: [{ sides: [['س', 'ر', 'ي'], ['ف', 'ب', 'ع'], ['ل', 'و', 'ن'], ['م', 'ج', 'ح']], solution: ['سفر', 'ربيع', 'علم', 'موج', 'جبل', 'ليل', 'لحن'], words: ('سفر ربيع علم موج جبل ليل لحن سمر رمل عمل حلم حبر بحر حرب ربح جرم ملح رمي جسم نحل نحر نحس حليب سبيل سور سلم مرن مرج مرح مرحب فيلم فجر فرح فحل جبن جبر جنب جفن جعل جوع يوم يمن يمين يمر يلم ينم نمر نيل نفي نبل سمن سعر برم برج برح برع بسم عسل عمر عميل حرم حين حيل حفر حفل رجل رحل رحيم رفيع مسن مليح لمع يبيع يفرح').split(' ') },
    { sides: [['ت', 'ج', 'ل'], ['ا', 'ب', 'م'], ['ي', 'و', 'ف'], ['س', 'ر', 'ح']], solution: ['تاج', 'جبل', 'ليل', 'لمس', 'سفر', 'ريح', 'حوت'], words: ('تاج جبل ليل لمس سفر ريح حوت جمل حمل ملح سلم سمر رمل رمي ربح حبر جرم جمر يمر يلم يحلم سور فجر فحم فحل جبر حليب جميل سبيل حبيب حجر تاجر تمر تمور توت تيس سوار').split(' ') },
  ],
};
