# PSA Kickoff Deck Automation - Alfred Handoff

Date: 2026-07-10
Status: Prototype complete, not enabled for production.

## Current State

The PSA kickoff deck automation prototype is working against the real Rev.io kickoff PowerPoint template.

Implemented:
- Generates a client-specific PSA kickoff deck from JSON config.
- Builds deck config from a normalized sales brief / Salesforce-style source payload.
- Supports canonical deck fields:
  - `mainBuyingMotivator`
  - `expectedValue`
  - `priorityModules`
- Uses the v2 template Alex supplied on 2026-07-21:
  - Slide 3 is contract review / contract specifics only.
  - Slide 4 summarizes Salesforce business issues and current pain points.
  - Slide 5 summarizes Salesforce value and Rev.io solutions.
- Leaves missing fields visible as `NEEDS: <field name>`.
- Applies green missing-field treatment consistently:
  - Bright green fill for standalone missing fields.
  - Green highlight/text for inline missing license fields.
- Removes missing-field green treatment when source data is present.
- Places optional module checkbox marks inside the existing template checkbox boxes.
- Supports client co-branding logo insertion on the title slide.
- Includes a delivery wrapper that can send the generated deck through Microsoft Graph from `alfred@rev.io`.
- Includes validation for missing-field formatting and module checkbox placement.

Do not enable automated production generation yet. Alex sent the leadership review message and is waiting on source-of-truth feedback.

## Latest Reference Deck

Current best sample:

`output/njos-psa-kickoff-template-v2-summarized-v11-from-v4.pptx`

This is the New Jersey Office Systems sample with:
- Corrected title slide layout.
- Green `NEEDS:` treatment.
- Correct module checkboxes.
- Contract specifics isolated on slide 3 using Alex's adjusted template.
- Summarized presentation bullets in the two new green-highlighted areas on
  slides 4 and 5.
- Preserves the v2 template's original slide 4/5 text-box geometry instead of
  resizing/re-filling those boxes.
- Uses dark blue text on slides 4 and 5 so the bullets remain legible on the
  white background.
- Keeps the slide 4/5 headers white for contrast against the blue header boxes.
- Uses up to four concise bullets at a larger body font size when the source
  brief has enough useful material.
- Keeps the accepted v4 visual formatting everywhere except the targeted slide
  4/5 brief-field text areas.
- Uses Montserrat 12 pt for slide 4/5 inserted body bullets.
- Uses Montserrat Bold for the slide 4/5 summary headings.
- Adds speaker notes with source field names and context values for adjusted
  slides, including Salesforce source paths for slides 4 and 5.
- Notes are additive only and should not alter slide content or formatting.

Validation artifacts:
- Accepted sent deck validation:
  `output/njos-kickoff-template-v2-summarized-v11-from-v4-validation.json`
- Normal generator proof output:
  `output/njos-psa-kickoff-template-v2-summarized-v12-accepted-baseline.pptx`
- Normal generator proof validation:
  `output/njos-kickoff-template-v2-summarized-v12-accepted-baseline-validation.json`
- Field report:
  `output/njos-kickoff-field-report-template-v2-summarized-v12-accepted-baseline.json`

## Regenerate Current Sample

From `Onboarding-Automation-Project`:

```bash
python3 scripts/generate-psa-kickoff-deck.py \
  --config tmp/njos-kickoff-from-source.json \
  --output output/njos-psa-kickoff-template-v2-summarized-v12-accepted-baseline.pptx \
  --report-json output/njos-kickoff-field-report-template-v2-summarized-v12-accepted-baseline.json

python3 scripts/validate-psa-kickoff-deck.py \
  output/njos-psa-kickoff-template-v2-summarized-v12-accepted-baseline.pptx \
  --json output/njos-kickoff-template-v2-summarized-v12-accepted-baseline-validation.json
```

## Send Current Sample Manually

The delivery wrapper is in the parent workspace:

`/home/openclaw/.openclaw/workspace/scripts/psa-kickoff-deck-delivery.js`

Manual send command:

```bash
node /home/openclaw/.openclaw/workspace/scripts/psa-kickoff-deck-delivery.js \
  --config /home/openclaw/.openclaw/workspace/Onboarding-Automation-Project/tmp/njos-kickoff-from-source.json \
  --attachment /home/openclaw/.openclaw/workspace/Onboarding-Automation-Project/output/njos-psa-kickoff-template-v2-summarized-v12-accepted-baseline.pptx \
  --report-json /home/openclaw/.openclaw/workspace/Onboarding-Automation-Project/output/njos-kickoff-field-report-template-v2-summarized-v12-accepted-baseline.json \
  --from alfred@rev.io \
  --to alext@rev.io \
  --force
```

Live sends require `--force` intentionally.

## Leadership Feedback Needed

Before enabling:
- Confirm where Sales owns `mainBuyingMotivator`.
- Confirm where Sales owns `expectedValue`.
- Confirm where ranked `priorityModules` should live.
- Confirm exact Salesforce API/source field names for business issues details,
  business issue pick list, current problems, value, and solutions.
- Confirm source of truth for kickoff date.
- Confirm source of truth for instance URL.
- Confirm source of truth for license counts/prices and billing start date.
- Confirm source of truth for client logo.
- Confirm missing-field follow-up should route to both Sales and the onboarding owner.

Document links are not required in the deck.

## Related Notion Field Changes

Added fields:
- Billing DB:
  - `Sales Brief URL`
  - `Instance URL`
- PSA DB:
  - `Sales Brief URL`
  - `Instance URL`
  - `Complexity Score`

These are available for future source mapping but are not yet wired into a production trigger.

## Next Engineering Block

Alex is waiting for feedback from the rest of the team. Do not enable the deck
automation, schedule delivery, or turn on any production trigger yet.

After leadership confirms the source fields:
- Wire the adapter to real Salesforce / Notion data.
- Add missing-field notification routing to Sales and onboarding owner.
- Decide trigger point.
- Add idempotency/audit state for production jobs.
- Add health check/PM2 guard only when automation is ready to enable.

After the kickoff deck review block, return to the paused PSA Wrike/Notion sync
work captured in:

- `/home/openclaw/.openclaw/workspace/plans/alfred-note-psa-wrike-notion-sync-pause-2026-07-21.md`

That work remains paused. Do not merge PSA behavior into the daily cron or create
the 50 unmatched PSA rows until Alex/team review approves the next step.
