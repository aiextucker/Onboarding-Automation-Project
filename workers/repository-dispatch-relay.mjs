const DEFAULT_REPO = 'aiextucker/Onboarding-Automation-Project';
const MAX_BODY_BYTES = 64 * 1024;
const ALLOWED_EVENTS = new Set([
  'graduation-checklist-submitted',
  'alex-roadmap-task-submitted',
  'log-interaction',
  'pm-hub-milestone-edit',
  'pm-hub-project-edit',
  'questionnaire-approved',
  'questionnaire-submitted',
]);
const EVENT_REPOS = {
  'questionnaire-submitted': 'aiextucker/revio-automations',
};

function jsonResponse(body, status = 200, headers = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...headers,
    },
  });
}

function corsHeaders(request, env) {
  const origin = request.headers.get('Origin') || '';
  const configured = String(env.ALLOWED_ORIGINS || '')
    .split(',')
    .map(item => item.trim())
    .filter(Boolean);

  if (!origin) return {};
  if (configured.length && !configured.includes(origin)) return {};

  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    Vary: 'Origin',
  };
}

function originAllowed(request, env) {
  const configured = String(env.ALLOWED_ORIGINS || '')
    .split(',')
    .map(item => item.trim())
    .filter(Boolean);
  if (!configured.length) return true;
  const origin = request.headers.get('Origin') || '';
  return Boolean(origin && configured.includes(origin));
}

function validatePayload(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new Error('Request body must be a JSON object.');
  }

  const eventType = String(input.event_type || '').trim();
  if (!ALLOWED_EVENTS.has(eventType)) {
    throw new Error('Unsupported dispatch event.');
  }

  const clientPayload = input.client_payload;
  if (!clientPayload || typeof clientPayload !== 'object' || Array.isArray(clientPayload)) {
    throw new Error('client_payload must be an object.');
  }

  return {
    event_type: eventType,
    client_payload: clientPayload,
  };
}

async function readJson(request) {
  const length = Number(request.headers.get('Content-Length') || 0);
  if (length > MAX_BODY_BYTES) {
    throw new Error('Request body is too large.');
  }

  const text = await request.text();
  if (new TextEncoder().encode(text).byteLength > MAX_BODY_BYTES) {
    throw new Error('Request body is too large.');
  }

  try {
    return JSON.parse(text);
  } catch {
    throw new Error('Request body must be valid JSON.');
  }
}

async function handleRequest(request, env = {}) {
  const cors = corsHeaders(request, env);

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: cors });
  }

  if (request.method !== 'POST') {
    return jsonResponse({ ok: false, error: 'Method not allowed.' }, 405, {
      ...cors,
      Allow: 'POST, OPTIONS',
    });
  }

  if (!originAllowed(request, env)) {
    return jsonResponse({ ok: false, error: 'Origin not allowed.' }, 403, cors);
  }

  if (!env.GITHUB_DISPATCH_TOKEN) {
    return jsonResponse({ ok: false, error: 'Dispatch relay is not configured.' }, 500, cors);
  }

  try {
    const dispatch = validatePayload(await readJson(request));
    const repo = String(EVENT_REPOS[dispatch.event_type] || env.GITHUB_REPO || DEFAULT_REPO).trim() || DEFAULT_REPO;
    const githubResponse = await fetch(`https://api.github.com/repos/${repo}/dispatches`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.GITHUB_DISPATCH_TOKEN}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'Content-Type': 'application/json',
        'User-Agent': 'onboarding-dispatch-relay',
      },
      body: JSON.stringify(dispatch),
    });

    if (githubResponse.status !== 204) {
      const text = await githubResponse.text();
      return jsonResponse({
        ok: false,
        error: 'GitHub dispatch failed.',
        status: githubResponse.status,
        detail: text.slice(0, 500),
      }, 502, cors);
    }

    return jsonResponse({ ok: true }, 202, cors);
  } catch (error) {
    return jsonResponse({ ok: false, error: error.message || String(error) }, 400, cors);
  }
}

export default {
  fetch: handleRequest,
};

export { handleRequest, validatePayload };
