import assert from 'node:assert/strict';
import { handleRequest, validatePayload } from '../workers/repository-dispatch-relay.mjs';

validatePayload({
  event_type: 'graduation-checklist-submitted',
  client_payload: { submission: { clientName: 'Smoke Test' } },
});

assert.throws(() => validatePayload({
  event_type: 'unsupported',
  client_payload: {},
}), /Unsupported dispatch event/);

const originalFetch = globalThis.fetch;
try {
  let forwarded;
  globalThis.fetch = async (url, options) => {
    forwarded = { url, options };
    return new Response(null, { status: 204 });
  };

  const response = await handleRequest(new Request('https://relay.example/api/repository-dispatch', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Origin: 'https://aiextucker.github.io',
    },
    body: JSON.stringify({
      event_type: 'alex-roadmap-task-submitted',
      client_payload: { title: 'Smoke test' },
    }),
  }), {
    GITHUB_DISPATCH_TOKEN: 'test-token',
    ALLOWED_ORIGINS: 'https://aiextucker.github.io',
  });

  assert.equal(response.status, 202);
  assert.equal(forwarded.url, 'https://api.github.com/repos/aiextucker/Onboarding-Automation-Project/dispatches');
  assert.equal(forwarded.options.headers.Authorization, 'Bearer test-token');
  assert.deepEqual(JSON.parse(forwarded.options.body), {
    event_type: 'alex-roadmap-task-submitted',
    client_payload: { title: 'Smoke test' },
  });

  await handleRequest(new Request('https://relay.example/api/repository-dispatch', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      event_type: 'questionnaire-submitted',
      client_payload: { clientName: 'Smoke test' },
    }),
  }), {
    GITHUB_DISPATCH_TOKEN: 'test-token',
  });
  assert.equal(forwarded.url, 'https://api.github.com/repos/aiextucker/revio-automations/dispatches');

  const blocked = await handleRequest(new Request('https://relay.example/api/repository-dispatch', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      event_type: 'unsupported',
      client_payload: {},
    }),
  }), {
    GITHUB_DISPATCH_TOKEN: 'test-token',
  });

  assert.equal(blocked.status, 400);

  const blockedOrigin = await handleRequest(new Request('https://relay.example/api/repository-dispatch', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Origin: 'https://evil.example',
    },
    body: JSON.stringify({
      event_type: 'graduation-checklist-submitted',
      client_payload: { submission: { clientName: 'Smoke test' } },
    }),
  }), {
    GITHUB_DISPATCH_TOKEN: 'test-token',
    ALLOWED_ORIGINS: 'https://aiextucker.github.io',
  });

  assert.equal(blockedOrigin.status, 403);
} finally {
  globalThis.fetch = originalFetch;
}

console.log('[ok] repository dispatch relay smoke');
