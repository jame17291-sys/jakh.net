# Riddle Arabia Arabic editorial style guide

Riddle Arabia question cards and interface copy use **clear Modern Standard Arabic** (فصحى مبسّطة): contemporary, plain wording that any Arabic reader understands and that a device voice can read aloud. The goal is wording a fluent Arabic speaker would naturally write, not a literal copy of the English sentence. Meaning, answer alignment and difficulty must remain identical across both languages.

**History.** On 2026-10-21 the cards were rewritten in light everyday (Gulf and Levantine) Arabic (PR #144, ledger `arabic-everyday-2026-10-21.json`). The owner reversed that experiment on 2026-10-25: dialect spellings were hard to read, and device voices could not pronounce them. Cards whose wording had not changed since got their earlier Modern Standard Arabic text back; the rest were rewritten by hand. Every change is recorded in `arabic-msa-restore-2026-10-25.json`. Do not write cards in dialect.

## Question cards

- Use the Modern Standard Arabic question words: `ما` / `ماذا` (what), `مَن` (who), `أين` (where), `لماذا` (why), `متى` (when), `كم` (how many/much), `كيف` (how) and `أيّ` (which), with `الذي/التي/الذين` for relative clauses. Do not use dialect words such as `شو`، `مين`، `منو`، `وين`، `ليش`، `اللي`، `عشان`، `بس`، `هذي`، `يبي`، `ياكل`, or dialect passives such as `انعرض` and `ينقال`. `scripts/arabic-msa-contract.test.mjs` rejects the clear dialect markers.
- Riddles speak in the first person and end with `ما أنا؟` (or `ما هو؟` / `ما هي؟`). Example: `حين تقف في ضوء الشمس، أرسم هيئتك على الأرض من دون أن يكون لي وجه. ما أنا؟`
- Prefer `ما اسم…؟` when asking for a named thing or process and `ما…؟` for a direct definition: `ما اسم تحوّل الغاز إلى سائل؟`. Use `مَن` for people and `ما` for things. Avoid unnecessary `ما هو/ما هي` when a shorter sentence sounds natural.
- Keep sentences short and direct. Restructure rather than translate word for word: `ما الشيء الذي يصعد وينزل لكنه لا يتحرك من مكانه؟`.
- Keep a riddle fair in Arabic: its wordplay or mechanism must still work (for example `لي عقارب لكنها لا تلدغ`), and multiple-choice options keep their letters and meaning.
- Do not let the question give away its answer, in either language. If the Arabic term for the answer would appear in the question, describe it instead.
- Put titles of shows, books, films and songs in «», and keep established names and the Latin form in parentheses only where it helps. A title keeps its own wording even when it is colloquial (`«علشان خاطر عيونك»`).
- Write abbreviations without an attached article (`قيمة pH`, not `الـpH`) so read-aloud stays natural.
- Answers stay short. Change an answer only together with its `quickFire` and `acceptedAnswers` copies; for a TV card, recalculate `tvQuiz.contentKey` with `contentKey()` from `tv-trivia-engine.js` after any text change.
- Record every wording change in a content-review ledger with before/after card hashes and the previous value of each changed field.

## Interface copy: voice and grammar

- Address the reader directly and simply. Prefer `اختر`، `اكتشف`، `جرّب` and `أجب` over passive or bureaucratic phrasing.
- Keep noun–adjective agreement and case endings natural: `عُثر على 3 موضوعات مطابقة` or `3 موضوعاتٍ مطابقةٍ`, never `3 موضوع مطابق`.
- Use `موضوعات` in formal interface copy. Do not mix `المواضيع` and `الموضوعات` on the same surface.
- Avoid English syntax carried into Arabic, stacked nouns, unexplained abbreviations, and machine-translated verbs such as `قم بـ`. State the action directly.

## Typography and terminology

- Use Arabic punctuation: `؟` for questions, `،` for commas, and `؛` where a semicolon is useful. Never use the Latin `?` in Arabic copy.
- Use «» for quotations and titles, not straight quotes `'…'` or `"…"`.
- Put a space after punctuation and no space before it. Keep mathematical notation intact unless the spoken form is clearer.
- Keep names in their established Arabic form where one exists. If no established form exists, use a readable transliteration consistently and retain the Latin name in parentheses only when it genuinely helps identification.
- Use Eastern or Western Arabic numerals consistently within one card. Do not change a value, unit, date, chemical symbol or proper noun merely for style.
- Preferred UI terms: `الموضوعات` (topics), `الموضوعات الفرعية` (subtopics), `لوحة الصدارة` (leaderboard), `مركز الألعاب` (Game Hub), `اقرأ بصوت عالٍ` (read aloud), and `احفظ تقدّمي` (save my progress).

## Read-aloud

The read-aloud button uses only the device's own voices (`speech-quality.js`); there is no cloud or paid speech service. Device voices read Modern Standard Arabic spelling, so dialect spellings come out garbled. The reader removes «», straight quotes, invisible direction marks, tatweel after بـ/لـ, dashes and fill-in blanks before speaking, and it never chooses Apple's novelty voices. Still, listen to a changed card with an Arabic voice and with an English voice.

## Editorial workflow

1. Read the English and Arabic together and identify the exact fact or riddle mechanism being tested.
2. Rewrite the Arabic from meaning, without following the English word order.
3. Read the Arabic aloud. If it sounds like a translation, shorten or restructure it.
4. Confirm that the Arabic answer is neither broader nor narrower than the English answer.
5. Test the read-aloud control with an Arabic voice and listen for symbols, dates and abbreviations.
6. Add authoritative HTTPS sources for factual changes. Submit the draft for review; publication requires a separate, recorded approval step.

Saving a Content Studio draft never replaces the last published wording. Restoring an older revision also creates a new draft and must pass review again. A high-stakes category remains quarantined until the full evidence process in [README.md](README.md) is complete.

## Final human-review checklist

- The Arabic is clear, idiomatic Modern Standard Arabic with no dialect words, and makes sense without seeing the English.
- Grammar, number agreement, punctuation and gender agreement are correct.
- Question and answer are equivalent in both languages, and the question does not reveal the answer.
- Names, units, formulas, dates and factual qualifiers are preserved.
- The read-aloud version sounds natural at normal listening speed.
- Sources support the exact claim, and no pending or restored draft is mistaken for published content.
