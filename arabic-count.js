// Counted nouns for Arabic interface copy (Modern Standard Arabic, Western digits).
//
// The categories follow the CLDR Arabic plural rules, which match standard MSA
// counting when the number is written in digits:
//   0                  → plural noun ("0 أسئلة") unless a zero phrase is supplied
//   1                  → the "one" phrase, with no digit ("سؤال واحد")
//   2                  → the dual phrase, with no digit ("سؤالان")
//   n % 100 in 3–10    → plural noun ("3 أسئلة", "105 أسئلة")
//   n % 100 in 11–99   → singular accusative noun ("11 سؤالًا", "450 سؤالًا")
//   everything else    → singular genitive noun ("100 سؤال", "101 سؤال", "1000 سؤال")
//
// The dual phrase changes with grammatical case. The presets below use the
// nominative form (سؤالان); after a preposition or as an object, pass the
// accusative/genitive form instead, for example { ...TOPIC, two: 'موضوعين' }.
// Adjectives agree with the noun, so pass complete phrases such as
// { one: 'سؤال واحد مطابق', two: 'سؤالان مطابقان', few: 'أسئلة مطابقة',
//   many: 'سؤالًا مطابقًا', other: 'سؤال مطابق' }.

export function arabicPluralCategory(count) {
  const n = Math.trunc(Math.abs(Number(count) || 0));
  if (n === 0) return 'zero';
  if (n === 1) return 'one';
  if (n === 2) return 'two';
  const lastTwo = n % 100;
  if (lastTwo >= 3 && lastTwo <= 10) return 'few';
  if (lastTwo >= 11) return 'many';
  return 'other';
}

export function arabicCount(count, forms, { format = String } = {}) {
  const n = Math.trunc(Math.abs(Number(count) || 0));
  const category = arabicPluralCategory(n);
  if (category === 'zero') return forms.zero || `${format(0)} ${forms.few}`;
  if (category === 'one' || category === 'two') return forms[category];
  return `${format(n)} ${forms[category]}`;
}

const nouns = (one, two, few, many, other) => Object.freeze({ one, two, few, many, other });

export const AR_COUNT = Object.freeze({
  question: nouns('سؤال واحد', 'سؤالان', 'أسئلة', 'سؤالًا', 'سؤال'),
  topic: nouns('موضوع واحد', 'موضوعان', 'موضوعات', 'موضوعًا', 'موضوع'),
  section: nouns('قسم واحد', 'قسمان', 'أقسام', 'قسمًا', 'قسم'),
  card: nouns('بطاقة واحدة', 'بطاقتان', 'بطاقات', 'بطاقة', 'بطاقة'),
  result: nouns('نتيجة واحدة', 'نتيجتان', 'نتائج', 'نتيجة', 'نتيجة'),
  activity: nouns('نشاط واحد', 'نشاطان', 'أنشطة', 'نشاطًا', 'نشاط'),
  day: nouns('يوم واحد', 'يومان', 'أيام', 'يومًا', 'يوم'),
  point: nouns('نقطة واحدة', 'نقطتان', 'نقاط', 'نقطة', 'نقطة'),
  word: nouns('كلمة واحدة', 'كلمتان', 'كلمات', 'كلمة', 'كلمة'),
});
