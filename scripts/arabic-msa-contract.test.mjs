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
  assert.ok(checked > 10_000, `checked ${checked} Arabic fields`);
  assert.deepEqual(found, []);
});

test('the check covers every public topic and none of the held ones', () => {
  assert.equal(held.size, 5);
  assert.equal(topics.length, catalog.categories.length - held.size);
  for (const slug of held) assert.ok(!topics.includes(slug), slug);
});
