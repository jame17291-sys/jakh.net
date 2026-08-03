# JAKH Arabic editorial style guide

JAKH uses clear, contemporary Modern Standard Arabic (العربية الفصحى المعاصرة). The goal is wording that a fluent Arabic editor would naturally write, not a literal copy of the English sentence. Meaning, answer alignment, and difficulty must remain identical across both languages.

## Voice and grammar

- Address the reader directly and simply. Prefer `اختر`، `اكتشف`، `جرّب`، and `أجب` over passive or bureaucratic phrasing.
- Write a complete question that ends with the Arabic question mark `؟`. Do not use the Latin `?` in Arabic copy.
- Prefer `ما اسم…؟` when asking for a named process and `ما…؟` for a direct definition. For example, write `ما اسم تحوّل الغاز إلى سائل؟`, not the literal and ungrammatical `ما تغير الحالة…؟`.
- Use `مَن` for people and `ما` for things. Use `أيّ` with the correct noun and avoid unnecessary `ما هو/ما هي` when a shorter sentence sounds more natural.
- Keep noun–adjective agreement and case endings natural: `عُثر على 3 موضوعات مطابقة` or `3 موضوعاتٍ مطابقةٍ`, never `3 موضوع مطابق`.
- Use `موضوعات` in formal interface copy. Do not mix `المواضيع` and `الموضوعات` on the same surface.
- Avoid English syntax carried into Arabic, stacked nouns, unexplained abbreviations, and machine-translated verbs such as `قم بـ`. State the action directly.

## Typography and terminology

- Use Arabic punctuation: `؟` for questions, `،` for commas, and `؛` where a semicolon is useful.
- Put a space after punctuation and no space before it. Keep mathematical notation intact unless the spoken form is clearer.
- Keep names in their established Arabic form where one exists. If no established form exists, use a readable transliteration consistently and retain the Latin name in parentheses only when it genuinely helps identification.
- Use Eastern or Western Arabic numerals consistently within one card. Do not change a value, unit, date, chemical symbol, or proper noun merely for style.
- Preferred UI terms: `الموضوعات` (topics), `الموضوعات الفرعية` (subtopics), `لوحة الصدارة` (leaderboard), `مركز الألعاب` (Game Hub), `اقرأ بصوت عالٍ` (read aloud), and `احفظ تقدّمي` (save my progress).

## Editorial workflow

1. Read the English and Arabic together and identify the exact fact or riddle mechanism being tested.
2. Rewrite the Arabic from meaning, without looking at the English word order.
3. Read the Arabic aloud. If it sounds like a translation, shorten or restructure it.
4. Confirm that the Arabic answer is neither broader nor narrower than the English answer.
5. Test the read-aloud control with an Arabic voice and listen for symbols, dates, and abbreviations.
6. Add authoritative HTTPS sources for factual changes. Submit the draft for review; publication requires a separate, recorded approval step.

Saving a Content Studio draft never replaces the last published wording. Restoring an older revision also creates a new draft and must pass review again. A high-stakes category remains quarantined until the full evidence process in [README.md](README.md) is complete.

## Final human-review checklist

- The Arabic is idiomatic Modern Standard Arabic and makes sense without seeing the English.
- Grammar, number agreement, punctuation, and gender agreement are correct.
- Question and answer are equivalent in both languages.
- Names, units, formulas, dates, and factual qualifiers are preserved.
- The read-aloud version sounds natural at normal listening speed.
- Sources support the exact claim, and no pending or restored draft is mistaken for published content.
