# Language and maths expansion editorial review

Date: 2026-09-30

Source: `data/kids/activities-language-maths-expansion.json`

## Scope and inventory

This source adds 120 distinct bilingual question resources. It adds 15 questions (IDs 06–20) to each of the eight age-and-area combinations: language and maths for ages 3–4, 5–6, 7–8 and 9–12. That is 60 per area and 30 per age. Existing activities 01–05 were not edited by this task.

Both language versions include a complete concrete prompt, answer, explanation, specific learning objective, individual hint, easier and harder variation, three participation steps, materials and alternatives, preparation, extension and supervision guidance. Shared participation scaffolding is intentional; the question, objective, hint, answer, explanation and adaptations were individually authored.

Thirty questions suggest five minutes; ninety suggest ten minutes. Ninety require no materials; thirty older maths questions list paper and pencil. These are approximate play-session durations, not deadlines. Younger questions can be read aloud, answered orally or with gestures, and discussed without physical small objects. Described objects, food, water, tools, journeys and machines are question scenarios, not required experiments or purchases.

## Checks completed

- Checked exact counts and expected IDs for all eight combinations, with no missing or repeated IDs.
- Checked that every entry has the same field set as the original activity source and both language values for all required content fields. Steps and hints use the existing array structure.
- Checked all 120 English and Arabic prompts, answers and explanations for their intended meaning, self-contained questions and appropriate adult support. Each English objective and each Arabic objective is distinct across this source.
- Compared proposed questions with the existing language and maths library to avoid merely replacing names or numbers. In particular, replaced a proposed older survey-evidence exercise because it was too close to the existing Evidence Editor activity.
- Checked IDs, English and Arabic titles, and English and Arabic prompts across the five source files then containing all 480 activities: no exact duplicates were found. This checks exact repetition, not every possible conceptual overlap between learning areas.
- Ran 93 numeric assertions covering the calculations and several extensions in 48 numerical maths questions. These include addition, subtraction, regrouping, multiplication, division and remainders, fractions, percentages, decimal arithmetic, perimeter, area, volume, unit conversion, elapsed time, integer differences, data range and angles. The remaining 12 maths questions concern shape, position, capacity, measurement method or conceptual quantity relationships and were checked editorially.
- Checked arithmetic explanations against their stated questions; scenarios use explicit equal units, equal-size wholes, constant rates or equally likely outcomes where needed.
- Checked language-specific adaptations: spoken word sounds and syllables use suitable words in each language; English compound-word work is paired with an Arabic meaningful phrase; agreement, commands and ambiguity examples use the forms appropriate to each language. Explanations are self-contained in the selected language.
- Spelled out Arabic coordinate components and the negative-temperature starting value to avoid ambiguity from mixed right-to-left prose and left-to-right numeric notation.
- Checked text for accidental separators and malformed Unicode. The longest question prompt is 210 characters, keeping the complete question practical for the printable activity sheet layout.

A separate AI editorial pass by the integrating agent reviewed the saved age-group checkpoints. Incorporated corrections included unambiguous square-corner wording, avoiding phonetic `/u/` for the vowel in English *sun*, removing cross-version implementation commentary from learning explanations, clarifying chronological wording, removing unspecified basket masses from a balance problem, and replacing the Arabic binocular ambiguity with a natural noun/descriptor ambiguity.

## Limits and release checks

This is AI authorship and editorial review, not a claim of review by a qualified educator, native-language editor or child-development specialist. No children or families were involved in usability or learning-outcome testing. The age bands guide discovery and the easier/harder alternatives support adjustment; they are not curriculum or attainment guarantees.

The numeric checks confirm the authored calculations; they do not replace the editorial review of the problem statements. Website rendering, Arabic equation direction, accessibility, generated page links, expanded printable layout and PDF delivery are handled by the integrating release workflow and are not claimed as completed by this content-only review.

Final integration review also spells out two bare numerical Arabic answers and labels two clock answers with «الساعة», retaining the same values.
