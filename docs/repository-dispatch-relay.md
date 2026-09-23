# Protected form submission service

The PSA graduation checklist and Alex roadmap page submit to:

`https://alfred-revio.msappproxy.net/api/repository-dispatch`

The route is protected by Microsoft Entra pre-authentication through Azure Application Proxy. Browser code contains no GitHub or downstream service credential and has no direct GitHub fallback.

## Accepted events

- `graduation-checklist-submitted`
- `alex-roadmap-task-submitted`

The internal service validates the request, serializes processing, and deduplicates completed `requestId` values.

- Graduation submissions run the existing Teams handler server-side and retain the `- PSA Graduations` channel output.
- Roadmap submissions create the same pending-review Notion task and publish the refreshed pending-review feed through a repository-scoped SSH deploy key.

The former GitHub `repository_dispatch` workflows for these events are retired. The old browser-based `questionnaire-approved` action is also retired; questionnaire approval remains a Solutions Architect responsibility and is not accepted by this service.

If a browser session is not authenticated, open:

`https://alfred-revio.msappproxy.net/api/relay-session`

Sign in with a Rev.io account, return to the form, and retry.

## Operational source

The runtime service, route configuration, health check, idempotency state, and credentials are maintained in the private Alfred workspace. No downstream secret belongs in this public repository.
