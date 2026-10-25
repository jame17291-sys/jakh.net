import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import * as speech from '../speech-quality.js';
import { readContentPhase2Ledger } from './content-phase2-ledger.mjs';

function question(category, id) {
  const cards = JSON.parse(readFileSync(new URL(`../data/${category}.json`, import.meta.url), 'utf8'));
  const card = cards.find(candidate => candidate.id === id);
  assert.ok(card, `published fixture ${id} exists`);
  return card.question.ar;
}

test('real Arabic tank and series questions pronounce fractions before sentence punctuation', () => {
  assert.equal(speech.prepareSpeechText(question('math', 'math-062'), 'ar'),
    'خزان ممتلئ إلى 3 على 5 من سعته. بعد إضافة 24 لتراً أصبح ممتلئاً إلى 9 على 10. ما سعة الخزان؟');
  assert.equal(speech.prepareSpeechText(question('math', 'math-136'), 'ar'),
    'متتالية هندسية حدها الأول 3 وأساسها 1 على 2. ما مجموعها إلى ما لا نهاية؟');
});

test('fraction speech keeps decimal operand values and Arabic digits intact', () => {
  assert.equal(speech.prepareSpeechText('1/2.5، 1.5/2.25، ١٫٥/٢٫٢٥.', 'ar'),
    '1 على 2.5، 1.5 على 2.25، ١٫٥ على ٢٫٢٥.');
  assert.equal(speech.prepareSpeechText('1/2. 3/4؟ 5/8؛', 'ar'), '1 على 2. 3 على 4؟ 5 على 8؛');
});

test('dates, times, standalone decimals and symbolic division retain their actual notation', () => {
  const text = 'التاريخ 12/05/2026 أو ١٢/٠٥/٢٠٢٦، الساعة 12:30، 2026-10-08، 3.14، ١٫٥، A/B.';
  assert.equal(speech.prepareSpeechText(text, 'ar'), text);
  assert.equal(speech.prepareSpeechText('9/9/99', 'ar'), '9/9/99');
  assert.equal(speech.prepareSpeechText('12 / 05 / 2026', 'ar'), '12 / 05 / 2026');
});

test('the actual Arabic C++ question uses the language name rather than two arithmetic operators', () => {
  // coding-and-design-025 asked about C++ until the 2026-10-25 phase-2 pass gave
  // it a new fact; the bank has no other C++ card, so its recorded question is used.
  const cpp = readContentPhase2Ledger().changes.find(change => change.id === 'coding-and-design-025').previous['question.ar'];
  assert.equal(speech.prepareSpeechText(cpp, 'ar'),
    'في بناء سي بلس بلس المعتاد بالترجمة المسبقة، هل يُترجم المصدر قبل تشغيل الملف التنفيذي الناتج؟');
  assert.equal(speech.prepareSpeechText('هل تستخدم C# أم C++؟', 'ar'), 'هل تستخدم سي شارب أم سي بلس بلس؟');
  assert.equal(speech.prepareSpeechText('ما حاصل 2+3=5 و7−3=4؟', 'ar'),
    'ما حاصل 2 زائد 3 يساوي 5 و7 ناقص 3 يساوي 4؟');
});

test('real scientific questions spell acronyms without revealing their answers', () => {
  assert.equal(speech.prepareSpeechText(question('biology', 'biology-003'), 'ar'), 'ماذا يعني اختصار دي إن إيه؟');
  assert.equal(speech.prepareSpeechText('ما الفرق بين DNA وRNA؟', 'ar'), 'ما الفرق بين دي إن إيه وآر إن إيه؟');
  assert.equal(speech.prepareSpeechText(question('chemistry', 'chemistry-009'), 'ar'),
    'على مقياس بي إتش، هل قيمة 2 تعتبر حمضية أم قاعدية؟');
  assert.equal(speech.prepareSpeechText(question('chemistry', 'chemistry-049'), 'ar'),
    'عند 25 درجة مئوية، ماذا تعني قيمة بي إتش تساوي 7 لمحلول مائي، وهل يقتصر بي إتش حتمًا على المدى 0–14؟');
});

test('acronym substitutions do not rewrite longer Latin words or English speech', () => {
  const embedded = 'هل تتغير DNAase وDNAs وRNAseq وpHase وGraphQL وphilosophy وfooDNA و_DNA؟';
  assert.equal(speech.prepareSpeechText(embedded, 'ar'), embedded);
  assert.equal(speech.prepareSpeechText('C++ and C#; DNA, RNA, pH7. 1/2.5 + 3/4.', 'en'),
    'C++ and C#; DNA, RNA, pH7. 1/2.5 + 3/4.');
});

test('speech leaves ambiguous Arabic words and authored vowel marks intact', () => {
  for (const text of [
    'من أي بلد تأتي شركة تصنيع السيارات تويوتا؟',
    'من ماذا تُصنع حجارة الفيلسوف؟',
    'من هو الفيلسوف الشهير الذي كان معلماً للإسكندر الأكبر؟',
    'علم، كتب، من، عدد. مَنْ هو مُحمَّد؟ صِفْ صَوْتَهُ.',
  ]) assert.equal(speech.prepareSpeechText(text, 'ar'), text);
});

test('the real long door question keeps the complete final question in one utterance', () => {
  assert.equal(typeof speech.splitSpeechText, 'function');
  const text = speech.prepareSpeechText(question('logic-puzzles', 'logic-puzzles-036'), 'ar');
  const chunks = speech.splitSpeechText(text, 220);
  assert.equal(chunks.join(' '), text, 'all original spoken words remain in order');
  assert.ok(chunks.every(chunk => chunk.length <= 220));
  assert.ok(chunks.at(-1).endsWith('أيهما يفوز أكثر: التبديل دائمًا أم البقاء دائمًا؟'));
  assert.ok(chunks.slice(0, -1).every(chunk => /[.؟!]$/u.test(chunk)), 'earlier chunks end with complete sentences');
});

test('sentence chunks respect decimal punctuation and preserve text under a smaller budget', () => {
  assert.equal(typeof speech.splitSpeechText, 'function');
  const text = 'القيمة 3.14 وليست 3. القيمة التالية 2.5 بالضبط. هل فهمت المثال؟';
  const chunks = speech.splitSpeechText(text, 35);
  assert.equal(chunks.join(' '), text);
  assert.ok(chunks.every(chunk => chunk.length <= 35));
  assert.ok(chunks.some(chunk => chunk.includes('3.14')), 'the decimal stays in the same utterance');
  assert.ok(chunks.some(chunk => chunk.includes('2.5')), 'both decimal components stay together');
});

test('an oversized sentence falls back to whole words without lost or repeated content', () => {
  assert.equal(typeof speech.splitSpeechText, 'function');
  const text = ('اقرأ هذا السؤال الطويل بعناية ثم أخبرنا بإجابتك الصحيحة ').repeat(8).trim() + '؟';
  const chunks = speech.splitSpeechText(text, 70);
  assert.ok(chunks.length > 1);
  assert.ok(chunks.every(chunk => chunk.length <= 70));
  assert.equal(chunks.join(' '), text);
  assert.deepEqual(speech.splitSpeechText('', 70), []);
});

test('Classic Riddles read their Modern Standard Arabic wording, not dialect spellings', () => {
  assert.equal(speech.prepareSpeechText(question('classic-riddles', 'classic-riddles-001'), 'ar'),
    'حين تقف في ضوء الشمس، أرسم هيئتك على الأرض من دون أن يكون لي وجه. ما أنا؟');
  assert.equal(speech.prepareSpeechText(question('classic-riddles', 'classic-riddles-020'), 'ar'),
    'ما الشيء الذي يصعد وينزل لكنه لا يتحرك من مكانه؟');
});

test('invisible direction marks, quotes, joined prefixes, dashes and blanks are not spelled out', () => {
  // A left-to-right mark before a Latin domain is silent formatting.
  assert.equal(speech.prepareSpeechText(question('tech-retro', 'tech-retro-21'), 'ar'), 'ما أول اسم نطاق سُجّل بامتداد .com؟');
  assert.equal(speech.prepareSpeechText('⁧نص⁩ ​معزول‏', 'ar'), 'نص معزول');
  assert.equal(speech.prepareSpeechText('Isolated⁦ text​', 'en'), 'Isolated text');
  // بـ«…» would leave a lone ب once the quotes go; the prefix joins its word.
  assert.match(speech.prepareSpeechText(question('pop-culture', 'pop-culture-26'), 'ar'), /الملقّب بملك الراي /u);
  assert.equal(speech.prepareSpeechText('أي بطل يُعرف بـ «العداء القرمزي»؟ ما المحور لـ «قانون جريم»؟', 'ar'),
    'أي بطل يُعرف بالعداء القرمزي؟ ما المحور لقانون جريم؟');
  // Straight quotes are dropped; an apostrophe inside a Latin word stays.
  assert.equal(speech.prepareSpeechText('ماذا يعني مصطلح \'FOREX\'؟ وما "النقد"؟', 'ar'), 'ماذا يعني مصطلح FOREX؟ وما النقد؟');
  assert.equal(speech.prepareSpeechText(question('math', 'math-011'), 'ar'), 'كم عنصراً في درزن الخباز (Baker\'s Dozen)؟');
  // Dashes become a pause or a space instead of a spoken symbol.
  assert.equal(speech.prepareSpeechText(question('books-and-quotes', 'books-and-quotes-027'), 'ar'),
    'لقد صرت الموت، مدمّر العوالم، من أي نص ديني قديم أُخذت هذه العبارة؟');
  // chemistry-079 (the Woodward–Hoffmann rules) left the bank in the 2026-10-25
  // phase-2 pass; its recorded question still exercises the dash between names.
  const woodwardHoffmann = readContentPhase2Ledger().removed.find(entry => entry.id === 'chemistry-079').card.question.ar;
  assert.match(woodwardHoffmann, /وودورد–هوفمان/u);
  assert.match(speech.prepareSpeechText(woodwardHoffmann, 'ar'), /قواعد وودورد هوفمان/u);
  assert.equal(speech.prepareSpeechText('682—رقم واحد صحيح', 'ar'), '682، رقم واحد صحيح');
  // A fill-in blank is a pause; its dangling بـ is not read as a letter name.
  assert.equal(speech.prepareSpeechText(question('tv-shows-trivia', 'tv-shows-trivia-281'), 'ar'),
    'أكمل شعار إعلان المحامي الاستعراضي: من الأفضل أن تتصل … .');
  assert.equal(speech.prepareSpeechText('Finish the slogan: Better Call ___.', 'en'), 'Finish the slogan: Better Call … .');
  assert.equal(speech.prepareSpeechText("What is the difference between S_N1 and S_N2 reactions?", 'en'), 'What is the difference between S N1 and S N2 reactions?');
});

test('every public Arabic question reaches the voice without symbols it would spell out', () => {
  const catalog = JSON.parse(readFileSync(new URL('../data/catalog.json', import.meta.url), 'utf8'));
  const held = new Set(JSON.parse(readFileSync(new URL('../docs/content-review/production-quarantine.json', import.meta.url), 'utf8')).categories.map(category => category.slug));
  let checked = 0;
  for (const { slug } of catalog.categories.filter(category => !held.has(category.slug))) {
    for (const card of JSON.parse(readFileSync(new URL(`../data/${slug}.json`, import.meta.url), 'utf8'))) {
      const spoken = speech.prepareSpeechText(card.question.ar, 'ar');
      assert.doesNotMatch(spoken, /[­؜​-‏‪-‮⁦-⁩﻿ـ«»“”"—_]|(?<![A-Za-z])'|'(?![A-Za-z])/u, card.id);
      assert.doesNotMatch(speech.prepareSpeechText(card.question.en, 'en'), /[​-‏‪-‮⁦-⁩﻿_]/u, card.id);
      checked += 1;
    }
  }
  assert.ok(checked > 3_000);
});
