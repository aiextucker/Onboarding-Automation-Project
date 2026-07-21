# PSA Kickoff Deck Automation

This workflow generates a client-specific PSA onboarding kickoff deck from the
Rev.io PowerPoint template.

## Template

The current source template is:

`templates/revio-psa-onboarding-kickoff-template-v2.pptx`

The first pass focuses on the client-specific fields surfaced in the kickoff
template:

| Slide | Field group |
| --- | --- |
| 1 | Client name, kickoff date |
| 3 | Contract specifics: package, licenses, billing start date |
| 4 | Summarized Salesforce business issues and current pain points |
| 5 | Summarized Salesforce value and Rev.io solutions |
| 6 | Instance URL, optional modules, integrations |
| 13 | Client-specific next steps |

Canonical leadership-facing fields now take precedence when present:

- `mainBuyingMotivator`
- `expectedValue`
- `priorityModules`
- `salesforceBusinessIssuesDetails`
- `salesforceBusinessIssuePickList`
- `salesforceProblems`
- `salesforceValue`
- `salesforceSolutions`

Legacy/test fields still work:

- `motivations`
- `solutions`
- `optionalModules`

## Usage

Copy the sample config and edit the values for a client:

```bash
cp examples/psa-kickoff-client.example.json tmp/client-kickoff.json
```

Preview the planned substitutions:

```bash
python3 scripts/generate-psa-kickoff-deck.py --config tmp/client-kickoff.json --dry-run
```

The dry run reports each field as either `complete` or `missing`.

Write a field-completion report for gap review:

```bash
python3 scripts/generate-psa-kickoff-deck.py \
  --config tmp/client-kickoff.json \
  --dry-run \
  --report-json output/client-kickoff-field-report.json
```

Generate the deck:

```bash
python3 scripts/generate-psa-kickoff-deck.py --config tmp/client-kickoff.json
```

The generated file is written to `output/<client>-psa-kickoff-deck.pptx` unless
`--output` is provided.

Build deck config from a normalized brief/Salesforce payload:

```bash
python3 scripts/build-psa-kickoff-config.py \
  --source-json examples/psa-kickoff-source-payload.example.json \
  --output tmp/client-kickoff.json \
  --report-json output/client-source-field-map.json
```

## Notes

- The script uses only Python standard library modules.
- Complete fields have any PowerPoint text highlight removed for that slot.
- Missing fields stay visibly marked with green PowerPoint text highlight.
- Missing fields are written as `NEEDS: <field label>` so the recipient knows
  exactly what to fill in.
- Blank values and values beginning with `TBD`, `TODO`, `Unknown`, `Not set`,
  `Not provided`, or `Missing` are treated as missing.
- Slide 3 is kept contract-only.
- Slides 4 and 5 use the green-highlighted areas in the v2 template. The
  generator turns the Salesforce issue/value/solution fields into concise
  PowerPoint bullets instead of pasting raw sales brief field text.
- The accepted formatting baseline is
  `output/njos-psa-kickoff-template-v2-summarized-v11-from-v4.pptx`.
- Do not apply Montserrat globally. Ordinary template replacements should keep
  their existing PowerPoint run styling.
- On slides 4 and 5 only, the inserted brief-field body bullets are Montserrat
  12 pt and the summary headings are Montserrat Bold.
- Speaker notes on adjusted slides include source-field context from the
  normalized payload, including Salesforce field paths where available.
- Current substitutions preserve the source template styling by replacing text
  inside existing PowerPoint text runs and filling the v2 summary areas.
- `--report-json` emits slide-level complete/missing field status for brief
  cleanup and leadership gap review.
- `mainBuyingMotivator`, `expectedValue`, and `priorityModules` are preferred
  over older generic fields when both are present.
- `scripts/build-psa-kickoff-config.py` is a dry-run adapter scaffold. It does
  not fetch live Salesforce or Notion data yet; it documents the expected
  normalized payload and produces deck config plus source-field gaps.
- If the template structure changes, rerun the dry-run and confirm the changed
  slide counts before trusting a generated deck.
