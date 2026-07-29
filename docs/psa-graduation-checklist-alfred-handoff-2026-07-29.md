# PSA Graduation Checklist - Alfred Handoff

Date: 2026-07-29
Status: Production form path restored, webhook posting verified, failure alerting added.

## Current State

The PSA graduation checklist form is working in production.

Implemented:
- Fixed the checklist progress display so the static page no longer starts at
  the stale `0 of 16 criteria met` text.
- Runs `updateProgress()` on load so the initial UI reflects the actual 15
  criteria in the form.
- Preserves submitted answers in the source link fragment.
- Keeps the existing browser-side dispatch fallback in place for now so live
  submissions do not break.
- Adds optional server-side repository dispatch relay support through
  `window.ONBOARDING_DISPATCH_RELAY_URL` or a
  `meta[name="onboarding-dispatch-relay"]` tag.
- Adds Cloudflare Worker-compatible relay scaffolding in
  `workers/repository-dispatch-relay.mjs`.
- Adds local relay smoke coverage in
  `scripts/repository-dispatch-relay-smoke.mjs`.
- Documents relay deployment/configuration in
  `docs/repository-dispatch-relay.md`.
- Adds GitHub Actions failure monitoring for the graduation checklist workflow.

## Production Verification

Latest Onboarding repo commit:

`e3c23bd Alert on graduation checklist workflow failures`

Production GitHub Pages verification:
- `/psa-graduation-criteria.html` updated after the form patch.
- Live HTML contains `0 criteria met`, not the stale `0 of 16` copy.
- Live HTML contains the optional relay helper and the load-time progress call.

Workflow verification:
- Live repository dispatch returned `204`.
- Successful workflow run: `30488875760`.
- The `Post checklist to Teams` step used `PSA_GRADUATIONS_WEBHOOK_URL`.
- Log showed `TEAMS_WEBHOOK_STATUS ok 1 - PSA Graduations`.

## Failure Alerting

Added:
- `.github/workflows/graduation-checklist-alert.yml`
- `.github/scripts/alert-graduation-workflow-failure.js`

Behavior:
- Runs after `PSA Graduation Checklist Submitted` completes.
- On failure, opens or comments on one GitHub issue titled:
  `[Alert] PSA Graduation Checklist workflow failing`
- Uses label `automation-alert`.
- On a later success, comments and closes the alert issue.

This gives us a GitHub-visible failure path even if the Teams webhook itself is
the broken component.

## Credentials

Alex explicitly said not to rotate or revoke exposed GitHub or Notion
credentials during this fix because doing so could break other live flows.

Accordingly:
- Existing static-page credential fallbacks remain active.
- `PSA_GRADUATIONS_WEBHOOK_URL` is set as a GitHub Actions secret.
- The webhook URL itself is intentionally not written into repo docs.

## Optional Next Step

The clean hardening step is to deploy a real server-side
`/api/repository-dispatch` endpoint and then configure the static pages to use
it.

Prepared options:
- Use the Cloudflare Worker scaffold in this repo.
- Use the already-pushed Railway/API endpoint in
  `/home/openclaw/.openclaw/workspace/railway-api`, commit
  `be3670e Add repository dispatch relay endpoint`.

Required environment for the relay:
- `GITHUB_DISPATCH_TOKEN`
- Optional origin allowlist if deployed through the Worker scaffold.

Do not disable the current fallback until the relay has been deployed and a real
browser submission has been verified end to end.

## Local Validation Run

Checks completed before handoff:
- `node --check .github/scripts/handle-graduation-checklist-submission.js`
- `node --check .github/scripts/alert-graduation-workflow-failure.js`
- `ALERT_DRY_RUN=1 node .github/scripts/alert-graduation-workflow-failure.js`
- `node scripts/repository-dispatch-relay-smoke.mjs`
- `git diff --check`

The Onboarding repo was pushed and verified clean on `main` at `e3c23bd`.
