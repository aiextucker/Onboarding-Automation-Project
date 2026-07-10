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

`output/njos-psa-kickoff-cobranded-logo-align-v4.pptx`

This is the New Jersey Office Systems sample with:
- Corrected title slide layout.
- Green `NEEDS:` treatment.
- Correct module checkboxes.
- NJOS logo co-branded on the title slide, vertically centered with the Rev.io logo.

Validation artifacts:
- `output/njos-kickoff-cobranded-logo-align-v4-validation.json`
- `output/njos-kickoff-cobranded-logo-align-v4-package-validation.json`
- `output/njos-kickoff-field-report-cobranded-logo-align-v4.json`

## Regenerate Current Sample

From `Onboarding-Automation-Project`:

```bash
python3 scripts/generate-psa-kickoff-deck.py \
  --config tmp/njos-kickoff-from-source.json \
  --output output/njos-psa-kickoff-cobranded-logo-align-v4.pptx \
  --report-json output/njos-kickoff-field-report-cobranded-logo-align-v4.json

python3 scripts/validate-psa-kickoff-deck.py \
  output/njos-psa-kickoff-cobranded-logo-align-v4.pptx \
  --json output/njos-kickoff-cobranded-logo-align-v4-validation.json
```

## Send Current Sample Manually

The delivery wrapper is in the parent workspace:

`/home/openclaw/.openclaw/workspace/scripts/psa-kickoff-deck-delivery.js`

Manual send command:

```bash
node /home/openclaw/.openclaw/workspace/scripts/psa-kickoff-deck-delivery.js \
  --config /home/openclaw/.openclaw/workspace/Onboarding-Automation-Project/tmp/njos-kickoff-from-source.json \
  --attachment /home/openclaw/.openclaw/workspace/Onboarding-Automation-Project/output/njos-psa-kickoff-cobranded-logo-align-v4.pptx \
  --report-json /home/openclaw/.openclaw/workspace/Onboarding-Automation-Project/output/njos-kickoff-field-report-cobranded-logo-align-v4.json \
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

After leadership confirms the source fields:
- Wire the adapter to real Salesforce / Notion data.
- Add missing-field notification routing to Sales and onboarding owner.
- Decide trigger point.
- Add idempotency/audit state for production jobs.
- Add health check/PM2 guard only when automation is ready to enable.
