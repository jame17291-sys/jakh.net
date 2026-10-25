import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

// Arabic card text is written in clear Modern Standard Arabic. The owner
// reversed the 2026-10-21 everyday-dialect experiment on 2026-10-25: dialect
// spellings were hard to read and device voices could not pronounce them. See
// docs/content-review/ARABIC-STYLE-GUIDE.md.
const read = relative => JSON.parse(fs.readFileSync(new URL(`../${relative}`, import.meta.url), 'utf8'));
const catalog = read('data/catalog.json');
const held = new Set(read('docs/content-review/production-quarantine.json').categories.map(category => category.slug));
const topics = catalog.categories.map(category => category.slug).filter(slug => !held.has(slug));

// Unambiguous dialect words only. Words that are also Modern Standard Arabic
// are deliberately left out: لمّا/لما ("not yet", "when" with a past verb, لِما),
// مَن/مِن, ممكن (an adjective), يقدر (يُقدِّر, "appreciates"), صار, راح, كمان
// (a violin), زي (a costume), شي (inside names such as تشين شي هوانغ) and هالـ
// words (هالة, هالوين). A marker must be a whole word; prefixes are listed
// explicitly so transliterated names such as فيبي or كار ووش do not match.
const DIALECT_MARKERS = [
  'شو', 'وشو', 'شنو', 'شلون', 'مين', 'ومين', 'منو', 'اللي', 'واللي', 'اللى', 'وين', 'ليش', 'وليش', 'ليه',
  'عشان', 'علشان', 'إيش', 'ايش', 'وش', 'يبي', 'تبي', 'يبون', 'يبغى', 'تبغى', 'أبغى', 'ابغى', 'هذي', 'هاذي',
  'هيك', 'هيدا', 'دايمًا', 'دايما', 'كتير', 'وايد', 'الحين', 'بعدين', 'ياكل', 'تاكل', 'ياكلون', 'ياخذ', 'تاخذ',
  'ياخذون', 'يشوف', 'تشوف', 'نشوف', 'يسوي', 'تسوي', 'يسوون', 'تسوون', 'فين', 'إزاي', 'ازاي', 'امتى', 'إمتى',
  'مش', 'مو', 'بس', 'وبس', 'حط', 'يحط', 'تحط', 'انحط', 'ينحط', 'ينقال', 'انقال', 'بدي', 'بدك', 'منيح', 'كويس',
  'إنو', 'انو', 'لسه', 'لسا', 'قديش', 'أديش', 'ماكو', 'أكو', 'هسه', 'هلق', 'توه', 'جوا', 'برا',
  // Added after the phase-2 sweep (2026-10-25), which found these forms in
  // cards the list above let through. Each is checked against the whole bank,
  // the held topics, the kids, party-game and interface copy.
  // بـ + present tense for the future or a habit (MSA uses سـ or the bare verb).
  'بتستضيف', 'بيستضيف', 'بيكون', 'بنكون', 'بيصير', 'بيروح', 'بتروح', 'بيقول', 'بتقول', 'بيقفز', 'بتشرق', 'بيعرف',
  // انـ / ينـ used as a passive (MSA: صُوِّر، عُرض، وُلد، يُقام). Real form VII
  // verbs such as انتقل، انفجر، انكسر، انطلق or انبنى are not listed.
  'انصوّر', 'انصور', 'انصوّرت', 'انصورت', 'انعرض', 'انعرضت', 'انكتب', 'انكتبت', 'انلغى', 'انلغت', 'انسرق', 'انسرقت',
  'انولد', 'انولدت', 'انولدوا', 'انسمّى', 'انسمى', 'انسمّت', 'انسمت', 'انبرهن', 'انبرهنت', 'انرجع', 'انلعب', 'انعمل',
  'انقتل', 'انشاف', 'انباع', 'انصنع', 'انذكر', 'ينوزن', 'ينعرف', 'ينكتب', 'ينلعب', 'ينقام', 'تنقام', 'ينعرض', 'تنعرض',
  'ينصنع', 'تنصنع', 'ينباع', 'تنباع', 'يندفن', 'ينشاف',
  // هالـ ("this") as whole words, and شي for شيء in fixed phrases.
  'هالشي', 'هالشيء', 'هالنوع', 'هالشكل', 'هالمرة', 'هالمرّة', 'هالعداد', 'هالعدّاد', 'هالتحقيق', 'هالكلمة', 'هالحين',
  'هالسؤال', 'أكثر شي', 'أول شي', 'كل شي', 'أي شي', 'أيّ شي', 'لشو', 'بشو',
  // Dropped hamzas (MSA: صحراء، خضراء، كهرباء، الهواء، دقائق، جائزة، وراء).
  // بيضا and صفرا are left out: they are also an accusative written without tanween.
  'صحرا', 'الصحرا', 'خضرا', 'حمرا', 'كهربا', 'الكهربا', 'بالهوا', 'والهوا', 'دقايق', 'جايزة', 'جوايز', 'ورا', 'وراها', 'وراه',
  // Gulf, Levantine and Egyptian words with no MSA reading. قُدّام، بُكرة، خلّى،
  // تطلّع، لقوا، يلقون، جاي (Jay) and لين (Lynn) are left out on purpose.
  'لحاله', 'لحالها', 'لحالهم', 'قايم', 'رايح', 'رايحة', 'شاف', 'شافت', 'شافوا', 'شافه', 'لسّا', 'لسّه', 'إنت', 'إنتي',
  'مليان', 'مليانة', 'الجاية', 'الجاي', 'طاح', 'طاحت', 'شوية', 'شويّة', 'شوي', 'خربانة', 'الخربانة', 'خربان', 'جوّا', 'برّا', 'إللي',
  'عايز', 'عاوز', 'كده', 'دلوقتي', 'بتاع', 'بتاعة', 'إحنا', 'احنا', 'مافي', 'مافيه', 'نص ساعة', 'نص الليل',
];
const LETTERS = '\\u0621-\\u064A\\u064B-\\u065F\\u0670\\u0671-\\u06D3';
const MARKER = new RegExp(`(?<![${LETTERS}])(?:${DIALECT_MARKERS.join('|')})(?![${LETTERS}])`, 'u');

// Transliterated names that happen to spell a marker. Each entry is the exact
// text of a choice or the name inside a sentence.
const NAMES = [
  'فين وولفهارد', // Finn Wolfhard, the actor
  'ديري، مين', // Derry, Maine
  'شو تي في', // Show TV, the Turkish channel
  'طاش وبس', // a made-up title offered as a wrong choice for the Tash Ma Tash revival
];
const NAME_CHOICES = new Set(['مين']); // Maine, the US state, as a whole choice

function arabicFields(card) {
  const fields = [
    ['question.ar', card.question?.ar],
    ['answer.ar', card.answer?.ar],
    ['tvQuiz.explanation.ar', card.tvQuiz?.explanation?.ar],
    ['quickFire.answer.ar', card.quickFire?.answer?.ar],
    ['quickFire.explanation.ar', card.quickFire?.explanation?.ar],
    ...(card.tvQuiz?.distractors?.ar || []).map(text => ['tvQuiz.distractors.ar', text, true]),
    ...(card.quickFire?.distractors?.ar || []).map(text => ['quickFire.distractors.ar', text, true]),
    ...(Array.isArray(card.acceptedAnswers) ? card.acceptedAnswers : card.acceptedAnswers?.ar || [])
      .map(text => ['acceptedAnswers', text, true]),
  ];
  return fields.filter(([, text]) => typeof text === 'string' && /[؀-ۿ]/u.test(text));
}

// Quoted titles keep their own wording («مستعجلة كتير», «علشان خاطر عيونك»).
const prose = text => NAMES.reduce((value, name) => value.replaceAll(name, ' '), text.replace(/«[^»]*»/gu, '«»'));

test('the dialect check catches dialect and leaves Modern Standard Arabic alone', () => {
  for (const text of ['لما توقف بالشمس، أرسم شكلك على الأرض ومع هذا ما لي وجه. شو أنا؟', 'مين المخرج اللي أخرج الفيلم؟', 'ليش المحقق صار يشك فيه؟', 'وش اسم هذي المدينة؟']) {
    assert.match(prose(text), MARKER, text);
  }
  for (const text of [
    'حين تقف في ضوء الشمس، أرسم هيئتك على الأرض من دون أن يكون لي وجه. ما أنا؟',
    'لمّا يصل القطار بعد، فماذا تفعل؟', 'لما وصل الرسول إلى المدينة استقبله أهلها.', 'مَن الذي كتب هذه الرواية، ومِن أين جاء؟',
    'ما أغنية فيبي المميزة؟', 'إيه ون إيه كار ووش', 'يجسد فين وولفهارد الصبي الشغوف بالألعاب.', 'يعزف على الكمان', 'تشين شي هوانغ',
    'أي مسلسل عُرض في «مستعجلة كتير»؟', 'من الممكن أن يحدث ذلك.', 'هالة القمر', 'هالوين',
  ]) {
    assert.doesNotMatch(prose(text), MARKER, text);
  }
});

test('the dialect check catches the forms found in the phase-2 sweep and spares the MSA look-alikes', () => {
  for (const text of [
    'أي دولة تأكّد سنة 2024 إنها بتستضيف كأس العالم؟', 'بأي ولاية أمريكية انصوّر أغلب المسلسل؟', 'على أي جزيرة انولد نابليون؟',
    'أي قرية سويدية انسمّت على اسمها أربع عناصر؟', 'قلب الميت كان ينوزن مقابل ريشة أي إلهة؟', 'أول مونديال ينقام بالعالم العربي',
    'أي قانون يفسّر هالشي؟', 'لشو استخدموها أول شي، قبل العربات؟', 'أي صحرا بتشيلي هي الأجف؟', 'خطوط أفقية خضرا وبيضا وحمرا',
    'في الكهربا ثلاثية الطور', 'عندك ساعة رملية 4 دقايق', 'البطل يكبر لحاله بجزيرة', 'فندق قايم على جزيرة', 'شاف رقم البيت',
    'لسّا ما انبرهنت', 'إنت قلت «إيه» وما ناولته', 'فنجان مليان قهوة', 'بالرمية الجاية', 'امرأة طاح خاتمها', 'طار شوي بجناحين',
    'القنينة الخربانة', 'لو رميت مغناطيس جوّا أنبوب', 'خذ وحدة كل نص ساعة', 'سارة الثامنة من قدّام والثامنة من ورا',
  ]) {
    assert.match(prose(text), MARKER, text);
  }
  for (const text of [
    'انتقل التصوير إلى نيو مكسيكو.', 'انفجر الصاروخ بعد الإطلاق.', 'انكسر الجسر تحت الحمل.', 'انطلق القطار.', 'انبنى الحكم على الدليل.',
    'بعدما فاز الفريق عاد إلى بلده.', 'عنده أعرض جناحين.', 'صار الفولاذ هشًا في البرد.', 'بتطبيق القاعدة نصل إلى الجواب.',
    'وُلد في بيروت.', 'إمداد برلين جوًا.', 'وضعت إناث التنين بيضًا.', 'تساوي صفرًا.', 'وقف قُدّام الجمع.', 'سبّحوه بُكرةً وأصيلًا.',
    'تطلّع إلى المستقبل.', 'لقوا حتفهم في المعركة.', 'يلقون المحاضرات.', 'جاي غاتسبي', 'لين مانويل ميراندا', 'طاحونة هوائية',
    'الصحراء الكبرى', 'الكهرباء والهواء', 'دقائق معدودة', 'جائزة نوبل', 'وراء الستار', 'الرياح الشمالية', 'شويكار', 'قايين وهابيل',
  ]) {
    assert.doesNotMatch(prose(text), MARKER, text);
  }
});

test('public card Arabic is Modern Standard Arabic with no clear dialect markers', () => {
  const found = [];
  let checked = 0;
  for (const slug of topics) {
    for (const card of read(`data/${slug}.json`)) {
      for (const [path, text, choice] of arabicFields(card)) {
        checked += 1;
        if (choice && NAME_CHOICES.has(text.trim())) continue;
        const match = prose(text).match(MARKER);
        if (match) found.push(`${card.id} ${path}: «${match[0]}» in ${text}`);
      }
    }
  }
  assert.ok(checked > 8_000, `checked ${checked} Arabic fields`);
  assert.deepEqual(found, []);
});

test('the check covers every public topic and none of the held ones', () => {
  assert.equal(held.size, 5);
  assert.equal(topics.length, catalog.categories.length - held.size);
  for (const slug of held) assert.ok(!topics.includes(slug), slug);
});
