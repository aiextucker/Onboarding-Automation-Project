#!/usr/bin/env node
'use strict';

const fs = require('fs');

const TEAM_ID = process.env.PSA_GRADUATIONS_TEAM_ID || 'd29698dd-ac76-4d06-909e-e2bdd1c4e84b';
const CHANNEL_ID = process.env.PSA_GRADUATIONS_CHANNEL_ID || '19:7bd5bd11caf6431dbebbe5051a0ccd0b@thread.tacv2';
const CHANNEL_NAME = process.env.PSA_GRADUATIONS_CHANNEL_NAME || '- PSA Graduations';

function requiredEnv(name) {
  const value = process.env[name];
  if (!value) {
    console.error(`API ERROR missing ${name}`);
    process.exit(1);
  }
  return value;
}

async function apiJson(url, options = {}, label = 'API') {
  const res = await fetch(url, options);
  const text = await res.text();
  let body = {};
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    body = { raw: text };
  }
  if (!res.ok || body.error || body.errors || body.object === 'error') {
    console.error(`API ERROR ${label} ${res.status} ${JSON.stringify(body).slice(0, 2000)}`);
    process.exit(1);
  }
  return body;
}

async function getGraphToken() {
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    client_id: requiredEnv('MS_CLIENT_ID'),
    refresh_token: requiredEnv('MS_REFRESH_TOKEN'),
    scope: 'https://graph.microsoft.com/.default offline_access',
  });
  const token = await apiJson(`https://login.microsoftonline.com/${requiredEnv('MS_TENANT_ID')}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  }, 'Graph token');
  if (!token.access_token) {
    console.error(`API ERROR Graph token missing access_token ${JSON.stringify(token).slice(0, 1000)}`);
    process.exit(1);
  }
  return token.access_token;
}

async function graphJson(method, graphPath, token, body, label = graphPath) {
  return apiJson(`https://graph.microsoft.com/v1.0${graphPath}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  }, label);
}

function readPayload() {
  let payload = null;
  const eventPath = process.env.GITHUB_EVENT_PATH;
  if (eventPath && fs.existsSync(eventPath)) {
    const event = JSON.parse(fs.readFileSync(eventPath, 'utf8'));
    payload = event.client_payload || {};
  } else if (process.env.GRADUATION_CHECKLIST_PAYLOAD) {
    payload = JSON.parse(process.env.GRADUATION_CHECKLIST_PAYLOAD);
  } else {
    console.error('API ERROR missing repository_dispatch client_payload');
    process.exit(1);
  }
  return payload && payload.submission && typeof payload.submission === 'object'
    ? payload.submission
    : payload;
}

function clean(value, fallback = '') {
  return String(value == null ? fallback : value).trim();
}

function validatePayload(input) {
  const signoff = input.signoff && typeof input.signoff === 'object' ? input.signoff : {};
  const criteria = Array.isArray(input.criteria) ? input.criteria : [];
  const clientName = clean(input.clientName || signoff.clientName, 'Unknown Client');
  if (!clientName || clientName === 'Unknown Client') {
    console.error('API ERROR payload missing clientName/signoff.clientName');
    process.exit(1);
  }
  if (!criteria.length) {
    console.error('API ERROR payload missing criteria array');
    process.exit(1);
  }
  return {
    requestId: clean(input.requestId, `graduation-${Date.now()}`),
    submittedAt: clean(input.submittedAt, new Date().toISOString()),
    sourceUrl: clean(input.sourceUrl),
    completion: input.completion && typeof input.completion === 'object' ? input.completion : {},
    clientName,
    saName: clean(input.saName || signoff.saName),
    graduationDate: clean(input.graduationDate || signoff.graduationDate),
    csHandoffOwner: clean(input.csHandoffOwner || signoff.csHandoffOwner),
    notes: clean(input.notes || signoff.notes),
    signoff,
    criteria: criteria.map(item => ({
      section: clean(item.section),
      title: clean(item.title),
      description: clean(item.description),
      checked: Boolean(item.checked),
      notApplicable: Boolean(item.notApplicable),
      exampleLabel: clean(item.exampleLabel),
      exampleValue: clean(item.exampleValue),
    })),
  };
}

function htmlEscape(value) {
  return String(value || '').replace(/[&<>"]/g, ch => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
  }[ch]));
}

function statusLabel(item) {
  if (item.notApplicable) return 'N/A';
  return item.checked ? 'Met' : 'Not met';
}

function criteriaRows(data) {
  const rows = [];
  let currentSection = '';
  for (const item of data.criteria) {
    if (item.section && item.section !== currentSection) {
      currentSection = item.section;
      rows.push(`<br><b>${htmlEscape(currentSection)}</b>`);
    }
    const details = [];
    if (item.exampleLabel || item.exampleValue) {
      details.push(`${item.exampleLabel || 'Example'}: ${item.exampleValue || 'Not provided'}`);
    }
    rows.push(`${htmlEscape(statusLabel(item))} - ${htmlEscape(item.title || 'Untitled criterion')}${details.length ? `<br><i>${htmlEscape(details.join(' | ')).slice(0, 800)}</i>` : ''}`);
  }
  return rows;
}

function teamsMessage(data) {
  const rows = [
    `<b>${htmlEscape(data.clientName)}</b>`,
    `<b>Submitted:</b> ${htmlEscape(data.submittedAt)}`,
    `<b>SA:</b> ${htmlEscape(data.saName || 'Not provided')}`,
    `<b>Graduation date:</b> ${htmlEscape(data.graduationDate || 'Not provided')}`,
    `<b>CS handoff owner:</b> ${htmlEscape(data.csHandoffOwner || 'Not provided')}`,
  ];
  if (data.notes) rows.push(`<b>Notes:</b> ${htmlEscape(data.notes.slice(0, 900))}`);
  rows.push('<br><b>Checklist</b>');
  rows.push(...criteriaRows(data));
  if (data.sourceUrl) rows.push(`<br><a href="${htmlEscape(data.sourceUrl)}">Checklist source</a>`);
  return rows.join('<br>').slice(0, 26000);
}

async function postTeamsMessage(token, data) {
  const payload = {
    body: {
      contentType: 'html',
      content: teamsMessage(data),
    },
  };
  const posted = await graphJson(
    'POST',
    `/teams/${TEAM_ID}/channels/${encodeURIComponent(CHANNEL_ID)}/messages`,
    token,
    payload,
    'Teams graduation message'
  );
  console.log(`TEAMS_POST_STATUS ok ${posted.id || ''} ${CHANNEL_NAME}`);
}

async function main() {
  const data = validatePayload(readPayload());
  const token = await getGraphToken();
  await postTeamsMessage(token, data);
}

main().catch(err => {
  console.error(err.stack || err.message);
  process.exit(1);
});
