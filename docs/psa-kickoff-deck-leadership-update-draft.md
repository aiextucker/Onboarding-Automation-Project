# PSA Kickoff Deck Automation - Leadership Update Draft

## Summary

We have a working first-pass PSA kickoff deck automation using the real Rev.io
kickoff PowerPoint template. The prototype can generate a client-specific deck,
mark missing fields clearly, and send the deck through the existing Alfred email
path.

The biggest remaining gaps are not deck generation mechanics. They are source
of truth gaps: where Sales/brief/Salesforce will provide logo, buying
motivator, expected value, ranked modules, kickoff date, instance URL, and
contract/license details.

## What Works Now

- Uses the real Rev.io PSA kickoff deck template.
- Generates a client-specific PPTX.
- Supports leadership-facing fields:
  - main buying motivator
  - expected value / business outcome
  - priority modules
- Preserves current test compatibility with older fields:
  - motivations
  - solutions
  - optional modules
- Complete fields clear text highlight.
- Missing fields remain green-highlighted and render as `NEEDS: <field>`.
- Generates a field-completion JSON report.
- Includes a dry-run adapter from normalized sales brief / Salesforce payload
  into deck config.
- Includes a parent-workspace delivery wrapper using Microsoft Graph from
  `alfred@rev.io`.
- Delivery wrapper supports dry-run, sender override, recipient override,
  audit logging, and live-send guard via `--force`.

## NJOS Test Result

Test client: New Jersey Office Systems.

Generated artifacts:

- Deck: `output/njos-psa-kickoff-from-source.pptx`
- Field report: `output/njos-kickoff-field-report-from-source.json`
- Source field map: `output/njos-source-field-map.json`

Deck field status:

- 25 total deck fields
- 18 complete
- 7 missing

Missing deck fields:

- Kickoff date
- Standard license count
- Standard license price
- Field license count
- Field license price
- Billing start date
- Instance URL

## Source Payload Result

The normalized source adapter found:

- 23 target source fields
- 9 complete
- 14 missing

The source adapter intentionally exposes broader source gaps than the deck,
because it also checks for logo and important document links.

## Decisions / Gaps Needed From Leadership

1. **Client logo source**
   - Where should Sales upload the customer logo?
   - Options: brief attachment, Salesforce account/logo field, Notion file, or
     handoff UI upload.

2. **Main buying motivator**
   - Confirm exact Salesforce/brief field.
   - This should drive slide 3.

3. **Expected value / business outcome**
   - Confirm exact Salesforce/brief field.
   - This should be what onboarding points back to when scope discussions get
     tactical.

4. **Priority modules**
   - Confirm whether modules are ranked.
   - Confirm source field and whether ranking should be shown in the deck.

5. **Kickoff date/time**
   - Confirm source of truth.

6. **Instance URL**
   - Confirm source of truth and timing.

7. **Contract/license details**
   - Confirm source for standard/field license counts and prices.
   - Confirm source for billing/contract start date.

8. **Important document links**
   - Confirm which links should travel with the deck:
     - sales brief
     - Notion project
     - signed order form
     - other source documents
   - Decide whether those links appear in the email body, speaker notes, or a
     deck slide.

9. **Missing-field routing**
   - Decide who receives missing-field notices:
     - Sales
     - onboarding owner
     - both

10. **Tigerpaw migration opportunities**
    - Decide whether they need a separate brief format and deck path.

## Recommended Next Step

Use the NJOS prototype to walk Sales/leadership through the workflow:

1. Show the normalized source payload.
2. Show slide 3 after generation.
3. Show the field report.
4. Show the green `NEEDS:` behavior.
5. Show the dry-run Alfred delivery wrapper.
6. Ask leadership to confirm the source fields above.

