# Logic and science expansion review

Reviewed 30 September 2026. Scope: `data/kids/activities-logic-science-expansion.json` only. This is an AI editorial and programmatic review, not an independent educator certification or a report of child testing.

## Inventory and completeness

The file contains 120 new bilingual question-based activities: 60 logic and 60 science. Each of the four age pathways (3–4, 5–6, 7–8, 9–12) receives 15 in each area, using suffixes 06–20. Existing activities and identifiers were not changed. Combined with the original five per age/area, logic and science each contain 80 activities.

Every resource includes a complete standalone question with its setup and all clues, an explained answer, a specific learning objective, a relevant hint, three practical steps, materials, preparation, easier and harder variations, a screen-free extension and supervision guidance in English and Modern Standard Arabic. The longest English standalone prompt is 47 words. The activities use paper, drawing and discussion; risky apparatus and actual experiments are not required. Younger activities are adult-guided. Seven more demanding logic activities allow 15 minutes instead of 10.

Shared navigation-like instructions provide a consistent routine, while the questions, objectives, clues, answers, explanations and variations are authored individually. Younger tasks use familiar pictures and concrete choices; older ones include counterexamples, missing information, constrained search, scientific models and limits of evidence. Answers to underdetermined questions explicitly identify what is unknown instead of inventing a single solution.

## Checks completed

- Validated all required schema fields, permitted enums, nonempty bilingual strings/arrays, matching array lengths, at least three steps, exact age/area counts and exact ID ranges.
- Compared all five activity files (480 resources): no duplicate IDs, English or Arabic titles, or English or Arabic standalone prompts.
- Read and edited the complete English and Arabic question/answer pairs for equivalent meaning, appropriate conditions and practical feasibility. A separate coordinating agent independently read all 120 question/answer pairs and supplied wording and overlap corrections. Those corrections were applied, including precise Arabic heat-transfer wording and qualification of ordinary paper filtration.
- Replaced an early conservation-of-number question that overlapped another author's maths question with a hidden-ribbon inference. Corrected ambiguous Arabic descriptions of plain fabric and used explicit positions for letter swaps.
- Arabic Sudoku rows use words separated by “then” with explicit direction. Codes include a word-by-word reading. These avoid relying on ambiguous mixed-direction character sequences.
- Qualified variable real-world effects, including loudness with distance, camouflage, seed dispersal, magnetic attraction and floating. No developmental, clinical or curriculum-alignment claims are made.
- Water-clarity and filtration questions explicitly say that clearer appearance is not proof of drinking safety. The illustrated filtrates are not for drinking. Heat, electricity, magnets and sky questions remain paper scenarios, with relevant restrictions where an extension could otherwise invite a hazardous trial.

The ignored helper `work/content-expansion/verify-logic-science.py` passed on the completed file. It exhaustively enumerates the following rather than merely repeating the answer text:

| Activity | Verification |
|---|---|
| 9–12 logic 06, wrong fruit labels | Only assignment is Apples-label→bananas, Bananas-label→mixed, Mixed-label→apples |
| 9–12 logic 07, two speakers | Only consistent assignment: A lies, B tells truth |
| 9–12 logic 09, light toggles | Four reachable states; all-on unreachable; even parity preserved |
| 9–12 logic 10, four-by-four grid | Exactly one grid satisfies rows, columns, blocks and givens |
| 9–12 logic 11, bridge walk | Exactly two trails from D; no complete trail starting at B |
| 9–12 logic 12, three-digit code | Exactly one of all 60 permitted codes fits: 415 |
| 9–12 logic 18, five-cell picture | Unique pattern: empty, filled, filled, empty, filled |
| 7–8 logic 06, workshop order | Unique order: storytelling, drawing, building |

Also checked project timing (12 minutes parallel, 14 sequential), club overlap (3), pair counts (15), field-sampling estimate (60), measurement mean (14.0666… cm), and density calculations (1.2 g/mL; 30 g for 25 mL). Other simple fixed-answer puzzles were checked directly against every supplied choice and rule. Harder variations that deliberately remove information are framed as exploration rather than claiming uniqueness.

## Primary science references consulted

The questions and illustrations are newly authored. The following first-party educational/scientific sources were used to check factual explanations; no source text was copied into activities.

| Source | Facts checked and relevant entries |
|---|---|
| [USGS: Condensation and the water cycle](https://www.usgs.gov/water-science-school/science/condensation-and-water-cycle) | Vapour changing to liquid on cold surfaces; 7–8 science 06, 9–12 science 09 |
| [USGS: Evaporation and the water cycle](https://www.usgs.gov/water-science-school/science/evaporation-and-water-cycle?page=1) | Liquid water entering air as vapour, without requiring boiling; 5–6 science 19 |
| [USGS: Sediment and suspended sediment](https://www.usgs.gov/special-topic/water-science-school/science/sediment-and-suspended-sediment?qt-science_center_objects=0) | Sediment transport and suspension; 7–8 science 18–19 |
| [NASA: How do clouds form?](https://science.nasa.gov/kids/earth/how-do-clouds-form/) | Clouds contain droplets/ice rather than cotton; 3–4 science 11 |
| [NASA: Moonlight](https://science.nasa.gov/moon/moonlight/) | Reflected sunlight; 7–8 science 20 |
| [NASA: Why can you see the Moon during the day?](https://www.nasa.gov/solar-system/why-can-you-see-the-moon-during-the-day-we-asked-a-nasa-scientist-episode-19/) | Daytime Moon visibility; 5–6 science 16 |
| [NASA: Moon phases](https://science.nasa.gov/moon/moon-phases/) | Geometry of the visible sunlit portion; 9–12 science 11 |
| [NASA Space Place: What causes the seasons?](https://spaceplace.nasa.gov/seasons/en/) | Tilt, sunlight angle and opposite hemispheric seasons; 9–12 science 10 |
| [NPS: Plant adaptations](https://www.nps.gov/teachers/classrooms/plant-adaptations.htm) | Roles of roots, stems, leaves and light in plants; 3–4 science 08/20, 5–6 science 08/15 |
| [NPS: Desert adaptations](https://www.nps.gov/teachers/classrooms/desert-adaptations.htm) | Seeds contain a plant embryo; wing/surface-area adaptations for wind dispersal; 3–4 science 15, 7–8 science 15 |
| [NPS: Butterflies and moths](https://www.nps.gov/grca/learn/nature/butterflies.htm) | Egg, larva, pupa and adult stages; 5–6 science 10 |
| [Smithsonian: Amazing arthropods](https://nationalzoo.si.edu/conservation/news/house-hunters-amazing-arthropods) | Six-legged insect body plan; 5–6 science 11 |
| [Exploratorium: Magnetic tightrope](https://annex.exploratorium.edu/xref/exhibits/magnetic_tightrope.html) | Attraction of iron/steel by a magnet; 5–6 science 07 |
| [Exploratorium: Listening vessels](https://annex.exploratorium.edu/xref/exhibits/listening_vessels.html) | Reflection of sound; 5–6 science 18 |
| [ACS: Air, it's really there](https://www.acs.org/middleschoolchemistry/lessonplans/chapter1/lesson5.html) | Air occupies space; separation of gas particles; 3–4 science 12, 9–12 science 19 |
| [ACS: Heat, temperature and conduction](https://www.acs.org/middleschoolchemistry/lessonplans/chapter2/lesson1.html) and [Exploratorium: Cold metal](https://www.exploratorium.edu/snacks/cold-metal) | Temperature versus heat transfer, conduction direction; 9–12 science 07–08 |
| [ACS: Why does water dissolve salt?](https://www.acs.org/middleschoolchemistry/lessonplans/chapter5/lesson3.html) | Dissolved particles remain in solution; 9–12 science 13 |
| [ACS: Coastal chemistry](https://www.acs.org/education/activities/coastal-chemistry.html) | Rust forms through iron's reaction with oxygen; 9–12 science 18 |
| [NOAA: Aquatic food webs](https://prod-01-alb-www-noaa.woc.noaa.gov/education/resource-collections/marine-life/aquatic-food-webs) | Food-web arrows follow energy from food/prey to consumer; 7–8 science 09 |
| [CDC: Choosing home water filters](https://www.cdc.gov/drinking-water/prevention/about-choosing-home-water-filters.html) | Filter limitations; appearance cannot establish water safety; 7–8 science 10/18, 9–12 science 13 |

No content or PDF rendering claims are based solely on schema validation. Final browser, Arabic layout and generated PDF checks remain the integration team's responsibility. These are enrichment questions, with adjustable support; suggested ages are discovery guidance, not developmental assessments.
