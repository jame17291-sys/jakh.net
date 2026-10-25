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
    'خزان مليان لـ3 على 5 من سعته. بعد ما زدنا 24 لتر صار مليان لـ9 على 10. كم سعة الخزان؟');
  assert.equal(speech.prepareSpeechText(question('math', 'math-136'), 'ar'),
    'متتالية هندسية أول حد فيها 3 وأساسها 1 على 2. كم مجموعها للانهاية؟');
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
    'في بناء سي بلس بلس العادي بالترجمة المسبقة، هل الكود ينترجم قبل ما يشتغل الملف التنفيذي؟');
  assert.equal(speech.prepareSpeechText('هل تستخدم C# أم C++؟', 'ar'), 'هل تستخدم سي شارب أم سي بلس بلس؟');
  assert.equal(speech.prepareSpeechText('ما حاصل 2+3=5 و7−3=4؟', 'ar'),
    'ما حاصل 2 زائد 3 يساوي 5 و7 ناقص 3 يساوي 4؟');
});

test('real scientific questions spell acronyms without revealing their answers', () => {
  assert.equal(speech.prepareSpeechText(question('biology', 'biology-003'), 'ar'), 'شو معنى اختصار دي إن إيه؟');
  assert.equal(speech.prepareSpeechText('ما الفرق بين DNA وRNA؟', 'ar'), 'ما الفرق بين دي إن إيه وآر إن إيه؟');
  assert.equal(speech.prepareSpeechText(question('chemistry', 'chemistry-009'), 'ar'),
    'على مقياس بي إتش، القيمة 2 حمضية ولا قاعدية؟');
  assert.equal(speech.prepareSpeechText(question('chemistry', 'chemistry-049'), 'ar'),
    'عند 25 درجة مئوية، شو يعني إن قيمة بي إتش لمحلول مائي تساوي 7، وهل قيمة بي إتش لازم تكون بين 0 و14 بس؟');
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
  assert.ok(chunks.at(-1).endsWith('أيهم يفوز أكثر: إنك دايمًا تبدّل ولا دايمًا تبقى؟'));
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
