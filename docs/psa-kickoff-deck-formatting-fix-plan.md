# PSA Kickoff Deck - Formatting Fix Plan

This block covers the formatting issues Alex found in the generated NJOS kickoff
deck after the content pass. The content direction is mostly right; the problem
is now PowerPoint geometry and run-level formatting.

## Current Findings

- Slide 1 title layout has overlapping text after client/date replacement.
- Slide 1 missing kickoff date is not consistently green-highlighted.
- Slide 3 missing fields render awkwardly and are not consistently
  green-highlighted.
- Slide 3 motivation / solution copy is directionally good and should be
  preserved.
- Slide 4 missing instance URL is not green-highlighted.
- Slide 4 optional module checkboxes are currently inline with the text instead
  of inside the green outlined checkbox boxes.
- Slide 11 checkbox layout is the visual reference for the optional module
  checkboxes.

## Root Cause

The current generator primarily replaces text nodes inside the template. That is
fine for simple copy, but weak for this template because:

- some placeholders are split across PowerPoint runs;
- highlight needs to apply to the rendered missing field, not only the original
  placeholder run;
- slide 1 text boxes need geometry/fit handling, not just shorter text;
- slide 4 checkbox state should update the existing checkbox shapes, not prepend
  checkbox characters to the module text.

## Work Blocks

| # | Work block | Slides | Output | Done when |
| --- | --- | --- | --- | --- |
| 1 | Inspect template geometry and run structure | 1, 3, 4, 11 | Shape/run map artifact | We know which XML shapes/runs control title/date, slide 3 missing fields, slide 4 instance URL, slide 4 checkboxes, and slide 11 reference checkboxes. |
| 2 | Add shape-aware replacement helpers | 1, 3, 4 | Generator update | Replacements can target a shape paragraph/run group and apply text, font color, and highlight to the final rendered field. |
| 3 | Fix slide 1 layout | 1 | Regenerated deck | Client name/date no longer overlap; missing kickoff date renders as green `NEEDS: Kickoff date` with correct highlight. |
| 4 | Fix missing-field styling | 1, 3, 4 | Regenerated deck + validation | Every `NEEDS:` field is green-highlighted and green text; completed fields are not highlighted. |
| 5 | Preserve slide 3 content compaction | 3 | Regression check | Motivation and solution text remains concise and presentation-ready. |
| 6 | Replace slide 4 module checkbox handling | 4, 11 | Generator update | Optional module state uses checkbox boxes aligned like slide 11, not inline checkbox text next to labels. |
| 7 | Add formatting validation | 1, 3, 4, 11 | Test/report script or generator report section | Report catches missing `NEEDS:` highlight, unexpected inline checkbox characters, and changed replacement counts. |
| 8 | Regenerate and send review deck | All affected | `output/njos-psa-kickoff-formatting-fixed.pptx` | Alex receives a fresh deck for visual review after validation passes. |
| 9 | Co-branding sample | 1 | `output/njos-psa-kickoff-cobranded-sample.pptx` | Title slide can show a client logo from `logoPath` / `logoUrl`; sample uses NJOS site logo. |

## Detailed Tasks

### 1. Template Inspection

Extract and document:

- slide 1 shape IDs and text content for title, client name, and date;
- slide 3 text runs for motivation, solution, license count/price, billing
  start date;
- slide 4 text runs for instance URL and optional module labels;
- slide 11 checkbox shape structure to use as the reference pattern.

Suggested artifact:

`tmp/psa-kickoff-shape-map.json`

### 2. Missing Field Formatting

Rules:

- Missing values render as `NEEDS: <field label>` or compact approved labels
  such as `NEEDS: Qty`, `NEEDS: Price`, `NEEDS: Start date`.
- Missing values use green font.
- Missing values have green PowerPoint text highlight.
- Completed values remove highlight.
- The validation report must count highlighted missing fields and fail if any
  `NEEDS:` field is not highlighted.

Affected fields:

- Slide 1: Kickoff date.
- Slide 3: license counts, license prices, billing start date.
- Slide 4: instance URL.

### 3. Slide 1 Layout

Fix strategy:

- Preserve the template title text box.
- Put the client name and kickoff date into the intended placeholder areas only.
- If replacement text is longer than the original placeholder, reduce font size
  or adjust the target text box within the template's existing bounds.
- Do not let client/date text collide with `Onboarding Kick-off Call`.

Acceptance:

- No overlapping visible text on title slide.
- Completed client name is readable.
- Missing kickoff date is visibly green-highlighted.

### 4. Slide 3 Missing Fields

Keep:

- condensed motivation text;
- condensed solution/value text.

Fix:

- recurring fee fields must not look like random floating green labels;
- missing quantity/price/start-date fields should inherit the surrounding table
  alignment and use compact `NEEDS:` wording;
- all missing slide 3 fields are green-highlighted.

Acceptance:

- Slide 3 reads as a polished business case/contract summary, even when fields
  are missing.
- No unhighlighted `NEEDS:` text.

### 5. Slide 4 Instance URL

Fix:

- `NEEDS: Instance URL` must be green font and green-highlighted.
- It should remain in the instance URL area, not shift layout around optional
  modules.

Acceptance:

- Field report and PPTX XML both show instance URL as missing/highlighted.

### 6. Slide 4 Optional Module Checkboxes

Current behavior to remove:

- inline `✓ Quoting` / `☐ Quoting` style text next to the label.

Target behavior:

- use visual checkbox boxes like slide 11;
- selected modules show the checked state inside the green outlined box;
- unselected modules show an empty or inactive box inside the same box area;
- module labels remain text-only.

Implementation path:

- identify slide 4 checkbox box shapes, or add/clone equivalent checkbox
  shapes from slide 11;
- map module labels to checkbox shapes by position;
- update checkbox glyph/mark inside the box shape instead of modifying label
  text.

Acceptance:

- No inline checkbox characters appear in module labels.
- Checkbox marks sit inside the green outlined boxes.
- Inventory, Project Management, and Mobile App are checked for NJOS; Quoting is
  unchecked.

### 7. Validation

Add a small validation gate after generation:

- unzip PPTX;
- inspect slides 1, 3, and 4 for all `NEEDS:` fields;
- verify each has highlight XML and green text;
- verify slide 4 module labels do not start with `✓` or `☐`;
- optionally export screenshots if local tooling can render PPTX reliably.

Minimum command should be runnable as:

```bash
python3 scripts/generate-psa-kickoff-deck.py \
  --config tmp/njos-kickoff-from-source.json \
  --output output/njos-psa-kickoff-formatting-fixed.pptx \
  --report-json output/njos-kickoff-field-report-formatting-fixed.json
```

Then run the validation step before emailing.

## Execution Order

1. Inspect XML geometry and create shape map.
2. Fix missing field highlight/color application.
3. Fix slide 1 overlap.
4. Replace slide 4 checkbox implementation.
5. Add co-branding logo insertion for title slide.
6. Regenerate NJOS deck.
7. Run XML validation.
8. Send updated deck for review.

## Co-Branding

The generator supports client logo insertion on slide 1 when either field is
present:

```json
{
  "logoPath": "assets/logos/njos-logo.png",
  "logoUrl": "https://njosllc.com/wp-content/uploads/2019/04/njos_logo_transparent_bg.fw_.png"
}
```

The first pass places the logo in the upper-right title-slide area, opposite the
Rev.io title block. For NJOS, the sample asset came from the public NJOS website
and was embedded into the PPTX as `ppt/media/client-logo.png`.
