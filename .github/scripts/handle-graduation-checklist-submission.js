#!/usr/bin/env node
'use strict';

const fs = require('fs');

const TEAM_ID = process.env.PSA_GRADUATIONS_TEAM_ID || 'd29698dd-ac76-4d06-909e-e2bdd1c4e84b';
const CHANNEL_ID = process.env.PSA_GRADUATIONS_CHANNEL_ID || '19:7bd5bd11caf6431dbebbe5051a0ccd0b@thread.tacv2';
const CHANNEL_NAME = process.env.PSA_GRADUATIONS_CHANNEL_NAME || '- PSA Graduations';
const WEBHOOK_URL = process.env.PSA_GRADUATIONS_WEBHOOK_URL || '';
const MAX_TEAMS_MESSAGE_CHARS = 26000;
const GRADUATION_MENTION_USERS = [
  {
    email: 'alexia.scottmorrison@rev.io',
    displayName: 'Alexia Scottmorrison',
  },
  {
    email: 'ryan.burton@rev.io',
    displayName: 'Ryan Burton',
  },
  {
    email: 'blaine.villafuerte@rev.io',
    displayName: 'Blaine Villafuerte',
  },
];

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

async function apiText(url, options = {}, label = 'API') {
  const res = await fetch(url, options);
  const text = await res.text();
  if (!res.ok) {
    console.error(`API ERROR ${label} ${res.status} ${text.slice(0, 2000)}`);
    process.exit(1);
  }
  return text;
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
  return String(value == null ? '' : value).replace(/[&<>"]/g, ch => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
  }[ch]));
}

function markdownEscape(value) {
  return String(value == null ? '' : value);
}

function mentionTargetsFromUsers(users) {
  return users.map((user, index) => ({
    mentionId: index,
    userId: user.id || user.email,
    email: user.email,
    displayName: user.displayName || user.email,
  }));
}

function mentionHtml(target) {
  return `<at id="${htmlEscape(target.mentionId)}">${htmlEscape(target.displayName || target.email)}</at>`;
}

function mentionLine(mentionTargets) {
  return mentionTargets.length
    ? `<b>Heads up:</b> ${mentionTargets.map(mentionHtml).join(' ')}`
    : '';
}

function sectionSummary(data) {
  const sections = new Map();
  for (const item of data.criteria) {
    const section = item.section || 'Checklist';
    if (!sections.has(section)) sections.set(section, { total: 0, satisfied: 0 });
    const stats = sections.get(section);
    stats.total += 1;
    if (item.checked || item.notApplicable) stats.satisfied += 1;
  }
  return Array.from(sections.entries()).map(([section, stats]) => {
    const label = stats.satisfied === stats.total ? 'Complete' : `${stats.satisfied}/${stats.total} complete`;
    return `${htmlEscape(section)}: ${htmlEscape(label)}`;
  }).join('<br>');
}

function sectionSummaryText(data) {
  const sections = new Map();
  for (const item of data.criteria) {
    const section = item.section || 'Checklist';
    if (!sections.has(section)) sections.set(section, { total: 0, satisfied: 0 });
    const stats = sections.get(section);
    stats.total += 1;
    if (item.checked || item.notApplicable) stats.satisfied += 1;
  }
  return Array.from(sections.entries()).map(([section, stats]) => {
    const label = stats.satisfied === stats.total ? 'Complete' : `${stats.satisfied}/${stats.total} complete`;
    return `- ${markdownEscape(section)}: ${markdownEscape(label)}`;
  }).join('\n');
}

function teamsWebhookMessage(data, options = {}) {
  const includeNotes = options.includeNotes !== false;
  const reviewerNames = GRADUATION_MENTION_USERS.map(user => user.displayName).join(', ');
  const rows = [
    `**Heads up:** ${markdownEscape(reviewerNames)}`,
    `**${markdownEscape(data.clientName)}**`,
    `**Submitted:** ${markdownEscape(data.submittedAt)}`,
    `**SA:** ${markdownEscape(data.saName || 'Not provided')}`,
    `**Graduation date:** ${markdownEscape(data.graduationDate || 'Not provided')}`,
    `**CS handoff owner:** ${markdownEscape(data.csHandoffOwner || 'Not provided')}`,
  ];
  if (includeNotes && data.notes) rows.push(`**Notes:** ${markdownEscape(data.notes)}`);
  const sections = sectionSummaryText(data);
  if (sections) rows.push(`**Section rollup**\n${sections}`);
  if (data.sourceUrl) rows.push(`[Open completed checklist](${data.sourceUrl})`);
  return rows.join('\n\n');
}

function teamsMessage(data, options = {}) {
  const includeNotes = options.includeNotes !== false;
  const mentionTargets = Array.isArray(options.mentionTargets) ? options.mentionTargets : [];
  const rows = [];
  const mentions = mentionLine(mentionTargets);
  if (mentions) rows.push(mentions);
  rows.push(
    `<b>${htmlEscape(data.clientName)}</b>`,
    `<b>Submitted:</b> ${htmlEscape(data.submittedAt)}`,
    `<b>SA:</b> ${htmlEscape(data.saName || 'Not provided')}`,
    `<b>Graduation date:</b> ${htmlEscape(data.graduationDate || 'Not provided')}`,
    `<b>CS handoff owner:</b> ${htmlEscape(data.csHandoffOwner || 'Not provided')}`,
  );
  if (includeNotes && data.notes) rows.push(`<b>Notes:</b> ${htmlEscape(data.notes)}`);
  const sections = sectionSummary(data);
  if (sections) rows.push(`<br><b>Section rollup</b><br>${sections}`);
  if (data.sourceUrl) rows.push(`<br><a href="${htmlEscape(data.sourceUrl)}">Open completed checklist</a>`);
  return rows.join('<br>');
}

function splitNotesMessages(notes) {
  if (!notes) return [];
  const prefix = '<b>Notes:</b> ';
  const escaped = htmlEscape(notes);
  const maxChunk = MAX_TEAMS_MESSAGE_CHARS - prefix.length - 100;
  const messages = [];
  for (let start = 0; start < escaped.length; start += maxChunk) {
    messages.push(prefix + escaped.slice(start, start + maxChunk));
  }
  return messages;
}

function splitWebhookNotesMessages(notes) {
  if (!notes) return [];
  const prefix = '**Notes:** ';
  const escaped = markdownEscape(notes);
  const maxChunk = MAX_TEAMS_MESSAGE_CHARS - prefix.length - 100;
  const messages = [];
  for (let start = 0; start < escaped.length; start += maxChunk) {
    messages.push(prefix + escaped.slice(start, start + maxChunk));
  }
  return messages;
}

function composeTeamsMessages(data, options = {}) {
  const mentionTargets = Array.isArray(options.mentionTargets) ? options.mentionTargets : [];
  let content = teamsMessage(data, { mentionTargets });
  const notesReplies = [];
  if (content.length > MAX_TEAMS_MESSAGE_CHARS && data.notes) {
    content = teamsMessage(data, { includeNotes: false, mentionTargets });
    notesReplies.push(...splitNotesMessages(data.notes));
  }
  if (content.length > MAX_TEAMS_MESSAGE_CHARS) {
    console.error(`API ERROR Teams graduation message too large without notes (${content.length} chars)`);
    process.exit(1);
  }
  return { content, notesReplies };
}

function composeTeamsWebhookMessages(data) {
  let text = teamsWebhookMessage(data);
  const notesMessages = [];
  if (text.length > MAX_TEAMS_MESSAGE_CHARS && data.notes) {
    text = teamsWebhookMessage(data, { includeNotes: false });
    notesMessages.push(...splitWebhookNotesMessages(data.notes));
  }
  if (text.length > MAX_TEAMS_MESSAGE_CHARS) {
    console.error(`API ERROR Teams graduation webhook message too large without notes (${text.length} chars)`);
    process.exit(1);
  }
  return [text, ...notesMessages];
}

function teamsMentions(mentionTargets) {
  return mentionTargets.map(target => ({
    id: target.mentionId,
    mentionText: target.displayName || target.email,
    mentioned: {
      user: {
        id: target.userId,
        displayName: target.displayName || target.email,
        userIdentityType: 'aadUser',
      },
    },
  }));
}

async function postTeamsMessage(token, data) {
  const mentionTargets = mentionTargetsFromUsers(GRADUATION_MENTION_USERS);
  const { content, notesReplies } = composeTeamsMessages(data, { mentionTargets });
  const payload = {
    body: {
      contentType: 'html',
      content,
    },
    mentions: teamsMentions(mentionTargets),
  };
  const posted = await graphJson(
    'POST',
    `/teams/${TEAM_ID}/channels/${encodeURIComponent(CHANNEL_ID)}/messages`,
    token,
    payload,
    'Teams graduation message'
  );
  for (const noteContent of notesReplies) {
    await graphJson(
      'POST',
      `/teams/${TEAM_ID}/channels/${encodeURIComponent(CHANNEL_ID)}/messages/${posted.id}/replies`,
      token,
      { body: { contentType: 'html', content: noteContent } },
      'Teams graduation notes reply'
    );
  }
  console.log(`TEAMS_POST_STATUS ok ${posted.id || ''} ${CHANNEL_NAME}`);
}

async function postTeamsWebhook(data) {
  const messages = composeTeamsWebhookMessages(data);
  for (const text of messages) {
    await apiText(WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    }, 'Teams graduation webhook');
  }
  console.log(`TEAMS_WEBHOOK_STATUS ok ${messages.length} ${CHANNEL_NAME}`);
}

async function main() {
  const data = validatePayload(readPayload());
  if (String(process.env.PSA_GRADUATIONS_DRY_RUN || '').toLowerCase() === 'true') {
    const mentionTargets = mentionTargetsFromUsers(GRADUATION_MENTION_USERS);
    const { content, notesReplies } = composeTeamsMessages(data, { mentionTargets });
    console.log(JSON.stringify({
      channel: CHANNEL_NAME,
      webhook: WEBHOOK_URL ? {
        messages: composeTeamsWebhookMessages(data).map(text => ({ text })),
      } : null,
      body: {
        contentType: 'html',
        content,
      },
      mentions: teamsMentions(mentionTargets),
      replies: notesReplies.map(content => ({ body: { contentType: 'html', content } })),
    }, null, 2));
    return;
  }
  if (WEBHOOK_URL) {
    await postTeamsWebhook(data);
    return;
  }
  const token = await getGraphToken();
  await postTeamsMessage(token, data);
}

main().catch(err => {
  console.error(err.stack || err.message);
  process.exit(1);
});
