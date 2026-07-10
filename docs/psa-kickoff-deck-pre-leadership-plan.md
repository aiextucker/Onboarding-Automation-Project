# PSA Kickoff Deck - Pre-Leadership Work Plan

This is the remaining work we can complete before sending Evan / leadership the
gap update. It separates buildable work from decisions or data we need from
Sales / Salesforce / brief ownership.

## Goal Before Update

Have a credible working prototype and a clean gap narrative:

- Real template is used.
- Real client test is generated.
- Missing fields are explicit and visually marked.
- Completed fields clear highlight.
- Email delivery path is proven.
- Field gaps are backed by a generated report, not manual interpretation.
- Remaining asks are framed as source-of-truth decisions, not engineering
  uncertainty.

## Work Blocks

| # | Work block | Status | Output artifact | Done when |
| --- | --- | --- | --- | --- |
| 1 | Field language cleanup | Done | Updated deck config and docs | Config supports leadership language: `mainBuyingMotivator`, `expectedValue`, `priorityModules`, while preserving current test compatibility. |
| 2 | Field completion report | Done | `output/njos-kickoff-field-report.json` | Report shows complete/missing fields by slide and can be quoted in update. |
| 3 | Sales brief / Salesforce adapter scaffold | Done | `scripts/build-psa-kickoff-config.py` and `examples/psa-kickoff-source-payload.example.json` | We can feed a normalized payload and produce deck JSON without hand-building every config. |
| 4 | Production delivery wrapper | Done | `/home/openclaw/.openclaw/workspace/scripts/psa-kickoff-deck-delivery.js` | Deck generation + Graph email can run with dry-run, sender override, test recipient override, and idempotency plan. |
| 5 | Logo/co-branding prototype | Partial | Config placeholders + source decision notes | We know where `logoPath` / `logoUrl` will go; actual PPTX image insertion waits on source and placement confirmation. |
| 6 | Brief/document link handling | Partial | Config placeholders + email-body handling | Sales brief / Notion project / order form links have config fields and can be included in delivery email body. |
| 7 | Demo/role-play package | Done | `docs/psa-kickoff-deck-demo-package.md` | We can show Sales/leadership how brief fields render, how missing fields stay green, and why brief completeness matters. |
| 8 | Leadership gap summary | Done | `docs/psa-kickoff-deck-leadership-update-draft.md` | Update clearly lists what works, what is missing from the brief/source systems, and what decisions are needed. |
| 9 | Visual formatting fix pass | Next | `docs/psa-kickoff-deck-formatting-fix-plan.md` | Title slide no longer overlaps, all `NEEDS:` fields are highlighted correctly, and slide 4 optional module checkboxes match the slide 11 checkbox style. |

## Recommended Order

1. **Field language cleanup**
   - Low risk.
   - Makes the prototype line up with Evan's wording.
   - Prevents confusion between generic `motivations` and the more important
     buying/value fields.

2. **Adapter scaffold**
   - Keep dry-run only.
   - Make source-field names explicit.
   - This gives leadership confidence that the deck is driven by Sales inputs,
     not a one-off hand-edited JSON file.

3. **Production wrapper design**
   - Do not fully daemonize yet.
   - Mirror credential request pattern:
     - env loading
     - Graph sender
     - test recipient override
     - dry-run
     - audit/idempotency design

4. **Logo and document-link placeholders**
   - Implement config/schema support even if final sources are pending.
   - Mark final source as leadership/Sales decision.

5. **Demo/update package**
   - Use NJOS as the example.
   - Include screenshots or deck path, field report, and missing-field list.

## Engineering Tasks We Can Do Now

### 1. Field Language Cleanup

Add canonical config fields:

```json
{
  "mainBuyingMotivator": "",
  "expectedValue": "",
  "priorityModules": []
}
```

Mapping:

- `mainBuyingMotivator` should drive slide 3 motivation content.
- `expectedValue` should drive either slide 3 solution/value copy or future
  "what we heard" content.
- `priorityModules` should replace loosely ordered `optionalModules` when
  available.

Backward compatibility:

- Keep accepting `motivations`, `solutions`, and `optionalModules` for current
  test configs.
- Prefer the canonical fields when present.

### 2. Adapter Scaffold

Create a dry-run-only adapter interface:

```bash
python3 scripts/build-psa-kickoff-config.py \
  --source-json tmp/sales-brief-payload.json \
  --output tmp/client-kickoff.json \
  --report-json output/client-source-field-map.json
```

The adapter should not need live Salesforce/Notion access in the first pass.
It should document expected input keys and produce:

- deck config JSON
- source-field mapping report
- missing source fields

### 3. Production Delivery Wrapper

Target parent workspace, not static Pages repo:

`/home/openclaw/.openclaw/workspace/scripts/psa-kickoff-deck-delivery.js`

First pass supports:

- `--config`
- `--attachment`
- `--to`
- `--from alfred@rev.io`
- `--dry-run`
- `--force`
- `--report-json`

Live sends require `--force`. Dry runs and sends append audit rows to:

`/home/openclaw/.openclaw/workspace/data/runtime/psa-kickoff-deck-deliveries.jsonl`

Current idempotency key:

```text
source record id + recipient set + template version
```

### 4. Logo / Co-Branding

Config placeholders:

```json
{
  "logoPath": "",
  "logoUrl": "",
  "logoSourceUrl": ""
}
```

Leadership/Sales decisions needed:

- Where Sales uploads the logo.
- Whether we can use Salesforce account logo, brief attachment, Notion file, or
  manual upload.
- Whether logo must appear on title slide only or throughout the deck.

### 5. Brief / Document Links

Config placeholders:

```json
{
  "briefUrl": "",
  "notionProjectUrl": "",
  "orderFormUrl": ""
}
```

Display options to decide:

- Email body only.
- Speaker notes.
- Small "important documents" slide/section.

### 6. Demo Package

Use NJOS and show:

- Slide 3 before/after.
- Missing fields report.
- Green `NEEDS:` behavior.
- Email from `alfred@rev.io`.
- Which source fields Sales must complete to improve output quality.

## Leadership Gaps To Preserve

These should stay in the leadership update as asks, even after engineering
cleanup:

- Where client logo lives.
- Exact source field for main buying motivator.
- Exact source field for expected value/business outcome.
- Whether priority modules are ranked and where that ranking lives.
- Kickoff date/time source.
- Instance URL source.
- Billing start / contract start source.
- License counts/prices source.
- Recipient routing for missing-field notices.
- Whether Tigerpaw migration opportunities need a separate brief/deck path.
