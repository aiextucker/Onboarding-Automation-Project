# PSA Kickoff Deck Automation - Demo Package

Use this for the Evan / leadership walkthrough.

## Demo Client

New Jersey Office Systems.

Artifacts:

- Source payload: `examples/psa-kickoff-source-payload.example.json`
- Generated config: `tmp/njos-kickoff-test.json`
- Generated deck: `output/njos-psa-kickoff-test-v2.pptx`
- Field report: `output/njos-kickoff-field-report.json`

## Demo Story

1. **Sales completes the brief / Salesforce fields**
   - Main buying motivator
   - Expected value / business outcome
   - Priority modules
   - Integrations
   - Contract/license fields
   - Kickoff / instance details
   - Logo and important document links

2. **Automation converts source data into deck config**
   - Adapter creates JSON from normalized Sales/brief payload.
   - Adapter also produces a source-field map so Sales can see what was used
     and what was missing.

3. **Generator creates the client kickoff deck**
   - Complete fields replace the template text.
   - Complete fields clear text highlight.
   - Missing fields render as `NEEDS: <field label>`.
   - Missing fields stay green-highlighted.

4. **Delivery wrapper sends through Alfred**
   - Uses Microsoft Graph.
   - Supports `--dry-run`.
   - Live sends require `--force`.
   - Audit log records dry runs/sends and idempotency keys.

## Slide 3 Talk Track

Slide 3 is the clearest proof that the kickoff is not starting from scratch.

For NJOS, the deck shows:

- Main buying motivator:
  - Move away from E-Automate because it is cumbersome, freezes frequently, and
    slows common workflows.
- Expected value:
  - Give service, field, billing, and collections teams shared visibility
    without manual workarounds.
- Rev.io solution points:
  - Simpler shared workspace for tickets, work orders, and field activity.
  - Centralized operational visibility across service, billing context,
    payments, and customer follow-up.

Leadership point:

> The deck should play back the reason the customer bought, not just the
> standard onboarding process.

## Missing-Field Talk Track

For NJOS, automation found 25 deck fields:

- 18 complete
- 7 missing

Missing fields:

- Kickoff date
- Standard license count
- Standard license price
- Field license count
- Field license price
- Billing start date
- Instance URL

Leadership point:

> We can generate a polished deck from the brief, but the deck also exposes
> where the brief or source systems are not ready. Missing fields stay green and
> say exactly what needs to be filled in.

## Logo / Co-Branding Talk Track

The config now has placeholders for:

- `logoPath`
- `logoUrl`
- `logoSourceUrl`

Leadership ask:

> Where should Sales upload or store the customer logo so the automation can use
> it reliably?

Potential sources:

- Brief attachment
- Salesforce account/logo field
- Notion file
- Manual upload field in a Sales handoff UI

## Important Documents Talk Track

The config now has placeholders for:

- `briefUrl`
- `notionProjectUrl`
- `orderFormUrl`

Leadership ask:

> Which document links should travel with the kickoff deck, and should they live
> in the deck, speaker notes, or email body?

## Dry-Run Commands

Build source payload into deck config:

```bash
python3 scripts/build-psa-kickoff-config.py \
  --source-json examples/psa-kickoff-source-payload.example.json \
  --output tmp/njos-kickoff-from-source.json \
  --report-json output/njos-source-field-map.json
```

Generate deck and field report:

```bash
python3 scripts/generate-psa-kickoff-deck.py \
  --config tmp/njos-kickoff-from-source.json \
  --output output/njos-psa-kickoff-from-source.pptx \
  --report-json output/njos-kickoff-field-report-from-source.json
```

Dry-run delivery from parent workspace:

```bash
node /home/openclaw/.openclaw/workspace/scripts/psa-kickoff-deck-delivery.js \
  --config /home/openclaw/.openclaw/workspace/Onboarding-Automation-Project/tmp/njos-kickoff-from-source.json \
  --attachment /home/openclaw/.openclaw/workspace/Onboarding-Automation-Project/output/njos-psa-kickoff-from-source.pptx \
  --report-json /home/openclaw/.openclaw/workspace/Onboarding-Automation-Project/output/njos-kickoff-field-report-from-source.json \
  --from alfred@rev.io \
  --to alext@rev.io \
  --dry-run
```

## Leadership Ask Summary

- Confirm source of customer logo.
- Confirm exact source fields for main buying motivator and expected value.
- Confirm whether priority modules are ranked and where rank lives.
- Confirm source of kickoff date/time.
- Confirm source of instance URL.
- Confirm source of license counts/prices and billing start date.
- Decide where document links should appear.
- Decide whether Tigerpaw migration opportunities need a separate brief and
  deck path.

