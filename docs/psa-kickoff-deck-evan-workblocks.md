# PSA Kickoff Deck - Evan Transcript Work Blocks

This tracks the work implied by the Evan transcript against the current kickoff
deck automation prototype.

## Already Proven

- Use the real Rev.io PSA kickoff PowerPoint as the source template.
- Populate client-specific text into the deck.
- Use real sales-brief context for a test run.
- Preserve visible follow-up markers for missing fields.
- Render missing fields as `NEEDS: <field label>` with green highlight.
- Remove text highlight when a field has usable data.
- Generate a field-completion report for gap review.
- Send a generated deck through the existing Microsoft Graph delivery path from
  `alfred@rev.io`.

## Work We Can Still Do Before Leadership Update

The detailed execution checklist is tracked in
`docs/psa-kickoff-deck-pre-leadership-plan.md`.

1. **Field-map cleanup**
   - Rename deck config concepts to match leadership language:
     `mainBuyingMotivator`, `expectedValue`, `priorityModules`.
   - Keep backward compatibility with current `motivations` / `solutions`
     until a production extractor exists.

2. **Missing-field reporting**
   - Use `--report-json` output as the source for "what was missing from the
     brief" in the leadership update.
   - Include complete vs. missing counts, slide number, field label, and
     rendered deck text.

3. **Data extractor scaffold**
   - Create a separate adapter that turns a sales brief / Salesforce payload
     into the deck JSON config.
   - Keep it dry-run first and make source fields explicit so Sales can see
     which brief fields drive which deck fields.

4. **Production email wrapper**
   - Move deck generation/delivery into the parent automation workspace.
   - Reuse the credential-request pattern: env loading, Graph sender,
     test-recipient override, dry-run mode, idempotency, and audit state.

5. **Logo/co-branding prototype**
   - Add a configurable `logoPath` / `logoUrl` input.
   - Replace or insert the client logo on the title slide once we confirm the
     intended logo source and placement.

6. **Brief/doc links**
   - Add an "important docs" field source for the sales brief / Notion page.
   - Decide whether the deck should show this on a slide, in speaker notes, or
     in the email body.

7. **Role-play/demo package**
   - Prepare a short demo script for Sales showing:
     - where the data comes from
     - how missing fields stay green
     - how completed fields clear the highlight
     - how their brief quality directly affects the kickoff deck

## Gaps To Raise With Evan / Leadership

- Client logo source and expected upload location.
- Main buying motivator field.
- Expected value / business outcome field.
- Priority modules field, ideally ranked or tied to motivator/value.
- Important document links: sales brief, Notion project, signed order form, or
  other source docs.
- Kickoff date and time source.
- Instance URL source.
- Billing start / contract start source.
- License counts and prices source.
- Whether missing fields should route to Sales, onboarding owner, or both.
- Whether Tigerpaw migration opportunities need a separate brief format and
  deck path.

## Current NJOS Test Gap Summary

Generated from `tmp/njos-kickoff-test.json`.

- Missing fields: kickoff date, standard license count, standard license price,
  field license count, field license price, billing start date, instance URL.
- Covered fields: client name, business motivations, Rev.io solution points,
  package/MRR summary, optional modules, integrations, and next steps.
