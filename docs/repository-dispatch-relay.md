# Repository Dispatch Relay

The public GitHub Pages tools must not call `api.github.com/repos/.../dispatches` with a browser-visible token.

Deploy `workers/repository-dispatch-relay.mjs` as a server-side relay at `/api/repository-dispatch` or set `window.ONBOARDING_DISPATCH_RELAY_URL` to the deployed endpoint before the page scripts run.

Required secret:

- `GITHUB_DISPATCH_TOKEN`: GitHub token allowed to create `repository_dispatch` events for `aiextucker/Onboarding-Automation-Project`.

Optional environment:

- `GITHUB_REPO`: defaults to `aiextucker/Onboarding-Automation-Project`.
- `ALLOWED_ORIGINS`: comma-separated browser origins allowed to submit, for example `https://aiextucker.github.io`.

Allowed dispatch events:

- `graduation-checklist-submitted`
- `alex-roadmap-task-submitted`
- `log-interaction`
- `pm-hub-milestone-edit`
- `pm-hub-project-edit`
- `questionnaire-approved`
- `questionnaire-submitted`

`questionnaire-submitted` is forwarded to `aiextucker/revio-automations`; other events default to `aiextucker/Onboarding-Automation-Project`.

After deploying the relay, rotate the old GitHub token because it was previously present in public HTML.
