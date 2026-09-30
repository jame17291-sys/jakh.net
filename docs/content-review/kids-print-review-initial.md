# Initial 120-activity printable review (historical)

Review date: 2026-09-30. AI-assisted visual and structural QA; no physical printer test, child usability study, native-speaker certification or professional educational certification is claimed.

## Final inventory

- 24 learning packs × English/Arabic × A4/US Letter = **96 PDF files**.
- Every PDF contains **10 pages**: five activity sheets followed by five individually labelled parent-guide pages. Total: **960 pages**.
- Coverage includes all four age bands (3–4, 5–6, 7–8, 9–12) and all six learning areas (language, maths, logic, science, creativity, life), in both languages and both paper sizes.

## Visual review performed

1. Rendered every page with PDFium and composed all-page contact sheets. Two reviewing agents visually inspected all 96 ten-page contact sheets: one covered the 48 younger-age files and the other the 48 older-age files. Reviewed margins, page flow, answer placement, headings, activity/guide separation, text clipping, overlap and visible glyph defects.
2. Inspected 16 enlarged representative pages across both languages and paper sizes. The younger-page samples were also independently rendered with Poppler; the older samples used PDFium at 2.4×. Inspected Arabic joining, natural visual reading order, retained vowel marks, long material/instruction lines, parent-guide continuity and footer placement.
3. After a final Arabic metadata/footer-only correction, rendered all 960 pages again. Pixel comparisons confirmed all 480 English pages were visually identical and all 480 Arabic page interiors were identical outside the known metadata/footer bands. No unexpected pixel differences were found.
4. Visually rechecked five enlarged Arabic pages after that last correction, covering A4, Letter, ages 5–6/7–8/9–12, activity sheets and a parent guide. The age/progress labels read unambiguously in prose and Latin footer URLs retain the slash at the end.

No clipping, overflow, overlapping text, orphaned answer headings, broken Arabic joins or missing glyphs remained in the inspected final layouts. Answer pages 6–10 each retain the parent-guide heading, activity number/title, hint, explained answer or observation, easier/harder options and follow-up.

## Corrections made during review

- Replaced parent-guide entries that ran across pages with one complete, clearly identified activity guide per page.
- Corrected Arabic minute units: 5/10 use دقائق; 15/20/30 use دقيقة.
- Preserved source vowel marks through Arabic reshaping and bidi ordering instead of dropping them.
- Rendered the Latin footer URL directly in LTR order while keeping right alignment on Arabic pages.
- Replaced potentially reversed numeric ranges/fractions in Arabic metadata with explicit prose such as النشاط 3 من 5 and الأعمار من 7 إلى 8.

## Structural and file checks

- Confirmed 96 matching manifest entries, ten pages each, correct A4 dimensions (595.276 × 841.890 points) or Letter dimensions (612 × 792 points) on every page, and nonempty render output.
- Verified every PDF SHA-256 and byte count against the print manifest, plus source-data and generator hashes.
- Scanned text rectangles on all final 960 pages: zero came within 10 points of any page edge. This bounds scan supplemented visual inspection; it was not used as a substitute.
- Checked shaped bilingual source characters against both embedded font glyph maps; no unsupported characters were found. Checked extracted PDF text for replacement characters.
- Kept all rendering/comparison intermediates in ignored `work/pdf-qa/`; they are not publishing assets.

Final print-manifest SHA-256: `1b6280f22fc3f29023209ac31ab545e18fc688070be51ba80121bc14fa4ec711`
Final generator SHA-256: `e6103d1d0c8bbef8f5ade1c0053c466cf8a2316c8c0acb8314c1af393147ec4d`

## Enlarged samples

Younger packs (Poppler, 1500-pixel long edge):

- `pack-5-6-language-ar-a4.pdf`, pages 1 and 3.
- `pack-5-6-language-ar-letter.pdf`, page 8.
- `pack-5-6-creativity-ar-letter.pdf`, page 2.
- `pack-3-4-science-en-a4.pdf`, page 2.
- `pack-3-4-science-en-letter.pdf`, page 5.
- `pack-5-6-creativity-en-a4.pdf`, page 7.
- `pack-5-6-life-en-letter.pdf`, page 10.

Older packs (PDFium, 2.4×):

- `pack-9-12-language-en-a4.pdf`, page 10.
- `pack-9-12-logic-ar-a4.pdf`, page 9.
- `pack-7-8-language-ar-letter.pdf`, page 3.
- `pack-9-12-science-en-letter.pdf`, page 3.
- `pack-9-12-maths-ar-a4.pdf`, page 6.
- `pack-9-12-language-ar-letter.pdf`, page 3.
- `pack-7-8-creativity-en-a4.pdf`, page 1.
- `pack-9-12-life-en-letter.pdf`, page 6.

Final Arabic metadata/footer rechecks: `pack-5-6-language-ar-a4.pdf` page 1; `pack-5-6-creativity-ar-letter.pdf` page 2; `pack-7-8-language-ar-letter.pdf` page 3; `pack-9-12-logic-ar-a4.pdf` pages 4 and 9.

## Limits

This review establishes rendered-page quality on the checked software outputs. Printer hardware margins, ink output, assistive-technology PDF tagging and hands-on child use were not tested. The generated HTML activity pages remain the readable non-PDF alternative. No unresolved print-layout issue was identified.
