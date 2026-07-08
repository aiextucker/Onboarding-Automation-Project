import fs from 'node:fs';

function parseDispatchPayload(value) {
  if (!value || value === 'null') return {};
  try {
    return JSON.parse(value);
  } catch (err) {
    throw new Error(`Invalid DISPATCH_PAYLOAD: ${err.message}`);
  }
}

const dispatchPayload = parseDispatchPayload(process.env.DISPATCH_PAYLOAD);
const eventType = process.env.DISPATCH_EVENT_TYPE || '';
const ALLOWED_EVENTS = new Set(['log-interaction', 'pm-hub-milestone-edit', 'pm-hub-project-edit']);
const payload = dispatchPayload.interaction || dispatchPayload;
const PROJECTS_DB = 'dba0a0aac29e42d7ac7e968e0245f4c4';
const INTERACTIONS_DB = '6246303e-1e51-408f-ad7e-85ad865d449d';
const MILESTONES_DB = '06f1e10a-4531-4e0e-8190-7562c25b4805';
const MILESTONE_STATUSES = new Set(['Not Started', 'In Progress', 'Completed', 'Blocked']);
const OVERRIDES_FILE = 'data/teams-channel-overrides.json';

function requiredEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing ${name}`);
  }
  return value;
}

async function apiJson(url, options = {}) {
  const res = await fetch(url, options);
  const text = await res.text();
  let body = {};
  try { body = text ? JSON.parse(text) : {}; } catch { body = { raw: text }; }
  if (!res.ok || body.object === 'error' || body.error || body.errors) {
    throw new Error(`HTTP ${res.status}: ${JSON.stringify(body).slice(0, 2000)}`);
  }
  return body;
}

function propText(value, max = 1800) {
  const content = String(value || '').slice(0, max);
  return content ? [{ text: { content } }] : [];
}

function validateDate(value, field) {
  if (value === null || value === '') return null;
  const text = String(value || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text) || Number.isNaN(new Date(text + 'T00:00:00Z').getTime())) {
    throw new Error(`Invalid ${field}`);
  }
  return text;
}

function textFromRichText(value) {
  return (value?.rich_text || []).map(t => t.plain_text || '').join('');
}

function milestoneFromPage(page) {
  const pr = page.properties || {};
  return {
    id: page.id,
    name: pr['Milestone Name']?.title?.map(t => t.plain_text || '').join('') || '',
    status: pr.Status?.status?.name || null,
    due: pr['Planned Due Date']?.date?.start?.slice(0, 10) || null,
    completedDate: pr['Actual Completion Date']?.date?.start?.slice(0, 10) || null,
    notes: textFromRichText(pr.Notes),
    notionUrl: page.url || null,
  };
}

function projectFromPage(page) {
  const pr = page.properties || {};
  return {
    id: page.id,
    name: pr.Client?.title?.map(t => t.plain_text || '').join('') || '',
    forecastDate: pr['Forecasted Graduation Date']?.date?.start?.slice(0, 10) || null,
    confidence: pr.Confidence?.select?.name || pr['Forecast Health']?.select?.name || null,
    blockers: textFromRichText(pr.Blockers) || textFromRichText(pr.Blocker),
    notionUrl: page.url || null,
  };
}

function validateMilestonePayload(input) {
  const id = String(input.id || input.milestoneId || '').trim();
  if (!id || !/^[0-9a-f-]{32,36}$/i.test(id)) throw new Error('Invalid milestone id');
  const properties = {};
  let requestedStatus = null;
  if (Object.prototype.hasOwnProperty.call(input, 'status')) {
    const status = String(input.status || '').trim();
    if (!MILESTONE_STATUSES.has(status)) throw new Error('Invalid milestone status');
    requestedStatus = status;
    properties.Status = { status: { name: status } };
    if (status === 'Completed' && !input.completedDate) {
      properties['Actual Completion Date'] = { date: { start: new Date().toISOString().slice(0, 10) } };
    }
  }
  if (Object.prototype.hasOwnProperty.call(input, 'due')) {
    const due = validateDate(input.due, 'planned due date');
    properties['Planned Due Date'] = { date: due ? { start: due } : null };
  }
  if (Object.prototype.hasOwnProperty.call(input, 'completedDate')) {
    const completedDate = validateDate(input.completedDate, 'actual completion date');
    const defaultCompletedDate = requestedStatus === 'Completed' ? new Date().toISOString().slice(0, 10) : null;
    const finalCompletedDate = completedDate || defaultCompletedDate;
    properties['Actual Completion Date'] = { date: finalCompletedDate ? { start: finalCompletedDate } : null };
  }
  if (Object.prototype.hasOwnProperty.call(input, 'notes')) {
    properties.Notes = { rich_text: propText(input.notes, 1800) };
  }
  if (!Object.keys(properties).length) throw new Error('No milestone fields provided');
  return { id, properties };
}

async function triggerSnapshotRefresh(reason) {
  const token = process.env.GITHUB_TOKEN;
  if (!token) {
    console.log('SNAPSHOT_REFRESH_SKIPPED missing GITHUB_TOKEN');
    return;
  }
  try {
    await apiJson('https://api.github.com/repos/aiextucker/Onboarding-Automation-Project/actions/workflows/pm-hub-snapshot.yml/dispatches', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ ref: 'main', inputs: {} }),
    });
    console.log(`SNAPSHOT_REFRESH_REQUESTED ${reason}`);
  } catch (err) {
    console.log(`SNAPSHOT_REFRESH_FAILED ${reason}: ${err.message}`);
  }
}

function firstExistingProperty(properties, names) {
  return names.find(name => Object.prototype.hasOwnProperty.call(properties || {}, name));
}

function validateProjectPayload(input) {
  const id = String(input.id || input.projectId || '').trim();
  if (!id || !/^[0-9a-f-]{32,36}$/i.test(id)) throw new Error('Invalid project id');
  const fields = {};
  if (Object.prototype.hasOwnProperty.call(input, 'forecastDate')) {
    fields.forecastDate = validateDate(input.forecastDate, 'forecast date');
  }
  if (Object.prototype.hasOwnProperty.call(input, 'confidence')) {
    const confidence = String(input.confidence || '').trim();
    if (confidence) {
      if (confidence.length > 120) throw new Error('Invalid confidence');
    }
    fields.confidence = confidence;
  }
  if (Object.prototype.hasOwnProperty.call(input, 'blockers')) {
    fields.blockers = String(input.blockers || '');
  }
  if (!Object.keys(fields).length) throw new Error('No project fields provided');
  return { id, fields };
}

function buildProjectProperties(fields, pageProperties) {
  const properties = {};
  if (Object.prototype.hasOwnProperty.call(fields, 'forecastDate')) {
    const name = firstExistingProperty(pageProperties, ['Forecasted Graduation Date', 'Grad Date (Manual)', 'Current Graduation Date']);
    if (!name) throw new Error('PSA project DB is missing a writable forecast date property');
    properties[name] = { date: fields.forecastDate ? { start: fields.forecastDate } : null };
  }
  if (Object.prototype.hasOwnProperty.call(fields, 'confidence')) {
    const name = firstExistingProperty(pageProperties, ['Confidence', 'Forecast Health']);
    if (!name) throw new Error('PSA project DB is missing a writable confidence property');
    const propertyType = pageProperties[name]?.type;
    if (propertyType !== 'select' && propertyType !== 'status') {
      throw new Error(`${name} is not a writable select/status property`);
    }
    properties[name] = propertyType === 'status'
      ? { status: fields.confidence ? { name: fields.confidence } : null }
      : { select: fields.confidence ? { name: fields.confidence } : null };
  }
  if (Object.prototype.hasOwnProperty.call(fields, 'blockers')) {
    const name = firstExistingProperty(pageProperties, ['Blockers', 'Blocker']);
    if (!name) throw new Error('PSA project DB is missing a writable blocker property');
    properties[name] = { rich_text: propText(fields.blockers, 1800) };
  }
  return properties;
}

function validatePayload(input) {
  const psaId = String(input.psaId || '').trim();
  const clientName = String(input.clientName || '').trim();
  const type = String(input.type || '').trim();
  if (!psaId || !/^[0-9a-f-]{32,36}$/i.test(psaId)) throw new Error('Invalid or missing psaId');
  if (!clientName) throw new Error('Missing clientName');
  if (!type) throw new Error('Missing interaction type');
  return {
    requestId: String(input.requestId || '').trim(),
    submittedAt: String(input.submittedAt || new Date().toISOString()),
    psaId,
    clientName,
    title: String(input.title || '').trim(),
    date: String(input.date || new Date().toISOString().slice(0, 10)).slice(0, 10),
    type,
    outcome: input.outcome ? String(input.outcome).trim() : '',
    sentiment: input.sentiment ? String(input.sentiment).trim() : '',
    notes: input.notes ? String(input.notes).trim() : '',
    followUpNeeded: Boolean(input.followUpNeeded),
    followUpDate: input.followUpDate ? String(input.followUpDate).slice(0, 10) : '',
  };
}

function readOverrides() {
  if (!fs.existsSync(OVERRIDES_FILE)) return { teamId: '', overrides: {} };
  return JSON.parse(fs.readFileSync(OVERRIDES_FILE, 'utf8'));
}

function normalize(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/^web\s*[-–—:]?\s*/i, '')
    .replace(/^self\s+service\s+/i, '')
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const STOP_WORDS = new Set(['inc', 'llc', 'ltd', 'corp', 'corporation', 'company', 'co']);
function tokens(value) {
  return normalize(value).split(' ').filter(token => token && !STOP_WORDS.has(token));
}
function compact(value) {
  return tokens(value).join('');
}
function singularish(token) {
  return token.endsWith('s') && token.length > 4 ? token.slice(0, -1) : token;
}
function sameToken(a, b) {
  return a === b || singularish(a) === singularish(b);
}
function channelKind(displayName) {
  if (/^web\s*[-–—:]\s*self\s+service/i.test(displayName)) return 'web-self-service';
  if (/^web\s*[-–—:]/i.test(displayName)) return 'web';
  if (/self\s+service/i.test(displayName)) return 'self-service';
  return 'plain';
}
function kindRank(kind) {
  return ({ plain: 0, web: 1, 'self-service': 2, 'web-self-service': 3 }[kind] ?? 9);
}

function scoreChannel(client, channel) {
  const clientNorm = normalize(client);
  const channelNorm = normalize(channel.displayName);
  const clientTokens = tokens(client);
  const channelTokens = tokens(channel.displayName);
  const clientCompact = compact(client);
  const channelCompact = compact(channel.displayName);
  const kind = channelKind(channel.displayName);
  let score = 0;
  const reasons = [];
  if (channelNorm === clientNorm) {
    score += 100;
    reasons.push('exact normalized name');
  } else if (clientCompact && clientCompact === channelCompact) {
    score += 95;
    reasons.push('exact compact name');
  } else if (clientCompact && channelCompact && (clientCompact.includes(channelCompact) || channelCompact.includes(clientCompact))) {
    score += 82;
    reasons.push('compact containment');
  }
  const overlap = clientTokens.filter(ct => channelTokens.some(t => sameToken(ct, t))).length;
  if (overlap) {
    score += overlap * 7;
    reasons.push(`${overlap}/${clientTokens.length} token overlap`);
  }
  if (kind === 'web') {
    score += 4;
    reasons.push('web implementation channel');
  } else if (kind.includes('self-service')) {
    score -= 15;
    reasons.push('self-service penalty');
  }
  return { id: channel.id, displayName: channel.displayName, webUrl: channel.webUrl || '', score, kind, reasons };
}

function resolveClient(client, channels, config) {
  const override = config.overrides?.[client];
  if (override) {
    const channel = channels.find(c => c.id === override.channelId);
    return {
      status: channel ? 'override-verified' : 'override-missing',
      confidence: channel ? 'manual' : 'blocked',
      selected: channel ? { id: channel.id, displayName: channel.displayName, webUrl: channel.webUrl || '' } : null,
      reason: override.source || 'manual override',
    };
  }
  const candidates = channels
    .map(channel => scoreChannel(client, channel))
    .filter(result => result.score >= 20)
    .sort((a, b) => b.score - a.score || kindRank(a.kind) - kindRank(b.kind) || a.displayName.localeCompare(b.displayName));
  if (!candidates.length) return { status: 'no-match', confidence: 'none', selected: null, reason: 'no channel candidate met threshold' };
  const [first, second] = candidates;
  if (second && first.score - second.score < 12) {
    return { status: 'ambiguous', confidence: 'blocked', selected: null, reason: 'top candidates too close; no auto-post' };
  }
  return {
    status: first.score >= 90 ? 'matched' : 'review',
    confidence: first.score >= 90 ? 'high' : 'medium',
    selected: first.score >= 90 ? first : null,
    reason: first.reasons.join('; '),
  };
}

function htmlEscape(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function teamsMessage(data, notionUrl) {
  const parts = [
    '<b>PM Hub interaction logged</b>',
    `<b>Client:</b> ${htmlEscape(data.clientName)}`,
    `<b>Type:</b> ${htmlEscape(data.type)}${data.outcome ? ` | <b>Outcome:</b> ${htmlEscape(data.outcome)}` : ''}`,
    `<b>Date:</b> ${htmlEscape(data.date)}`,
  ];
  if (data.sentiment) parts.push(`<b>Sentiment:</b> ${htmlEscape(data.sentiment)}/5`);
  if (data.notes) parts.push(`<b>Notes:</b> ${htmlEscape(data.notes.slice(0, 900))}`);
  if (data.followUpNeeded) parts.push(`<b>Follow-up:</b> Needed${data.followUpDate ? ` by ${htmlEscape(data.followUpDate)}` : ''}`);
  if (notionUrl) parts.push(`<a href="${htmlEscape(notionUrl)}">Open in Notion</a>`);
  return parts.join('<br>');
}

async function createNotionInteraction(data) {
  const token = requiredEnv('NOTION_TOKEN');
  const existing = await findExistingInteraction(data, token);
  if (existing) {
    console.log(`NOTION_STATUS existing ${existing.id}`);
    return existing;
  }
  const title = data.title || `${data.type} - ${data.date}`;
  const notes = [
    data.notes,
    data.requestId ? `Request ID: ${data.requestId}` : '',
    data.submittedAt ? `Submitted: ${data.submittedAt}` : '',
  ].filter(Boolean).join('\n\n');
  const properties = {
    Interaction: { title: [{ text: { content: title } }] },
    Date: { date: { start: data.date } },
    '🏢 Client': { relation: [{ id: data.psaId }] },
  };
  if (data.type) properties['Interaction Type'] = { select: { name: data.type } };
  if (data.outcome) properties.Outcome = { select: { name: data.outcome } };
  if (data.sentiment) properties['Sentiment Score'] = { select: { name: data.sentiment } };
  if (notes) properties.Notes = { rich_text: propText(notes) };
  if (data.followUpNeeded) {
    properties['Follow-up Needed'] = { checkbox: true };
    if (data.followUpDate) properties['Follow-up Date'] = { date: { start: data.followUpDate } };
  }
  const body = { parent: { database_id: INTERACTIONS_DB }, properties };
  const page = await apiJson('https://api.notion.com/v1/pages', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Notion-Version': '2022-06-28',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  console.log(`NOTION_STATUS ok ${page.id}`);
  return page;
}

async function findExistingInteraction(data, token) {
  if (!data.requestId) return null;
  const result = await apiJson(`https://api.notion.com/v1/databases/${INTERACTIONS_DB}/query`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Notion-Version': '2022-06-28',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      filter: { property: 'Notes', rich_text: { contains: `Request ID: ${data.requestId}` } },
      page_size: 1,
    }),
  });
  return result.results?.[0] || null;
}

async function updateMilestone(input) {
  const token = requiredEnv('NOTION_TOKEN');
  const { id, properties } = validateMilestonePayload(input);
  const page = await apiJson(`https://api.notion.com/v1/pages/${id}`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
      'Notion-Version': '2022-06-28',
      'Content-Type': 'application/json',
    },
  });
  if ((page.parent?.database_id || '').replace(/-/g, '') !== MILESTONES_DB.replace(/-/g, '')) {
    throw new Error('Milestone id is not in the PM Hub milestone database');
  }
  const updated = await apiJson(`https://api.notion.com/v1/pages/${id}`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${token}`,
      'Notion-Version': '2022-06-28',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ properties }),
  });
  const milestone = milestoneFromPage(updated);
  console.log(`MILESTONE_STATUS ok ${milestone.id} ${milestone.status || ''}`);
  return milestone;
}

async function updateProject(input) {
  const token = requiredEnv('NOTION_TOKEN');
  const { id, fields } = validateProjectPayload(input);
  const page = await apiJson(`https://api.notion.com/v1/pages/${id}`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
      'Notion-Version': '2022-06-28',
      'Content-Type': 'application/json',
    },
  });
  if ((page.parent?.database_id || '').replace(/-/g, '') !== PROJECTS_DB.replace(/-/g, '')) {
    throw new Error('Project id is not in the PM Hub PSA client database');
  }
  const properties = buildProjectProperties(fields, page.properties || {});
  const updated = await apiJson(`https://api.notion.com/v1/pages/${id}`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${token}`,
      'Notion-Version': '2022-06-28',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ properties }),
  });
  const project = projectFromPage(updated);
  console.log(`PROJECT_STATUS ok ${project.id} ${project.confidence || ''}`);
  return project;
}

async function getGraphToken() {
  const tenant = requiredEnv('MS_TENANT_ID');
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    client_id: requiredEnv('MS_CLIENT_ID'),
    refresh_token: requiredEnv('MS_REFRESH_TOKEN'),
    scope: 'https://graph.microsoft.com/.default offline_access',
  });
  const token = await apiJson(`https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  return token.access_token;
}

async function graphJson(method, path, token, body) {
  return apiJson(`https://graph.microsoft.com/v1.0${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
}

async function listChannels(teamId, token) {
  const channels = [];
  let path = `/teams/${teamId}/channels`;
  while (path) {
    const data = await graphJson('GET', path, token);
    channels.push(...(data.value || []));
    path = data['@odata.nextLink']
      ? new URL(data['@odata.nextLink']).pathname.replace(/^\/v1\.0/, '') + new URL(data['@odata.nextLink']).search
      : null;
  }
  console.log(`CHANNEL_COUNT ${channels.length}`);
  return channels;
}

async function postTeams(data, notionUrl) {
  const config = readOverrides();
  const teamId = process.env.PSA_CLIENT_LAUNCH_TEAM_ID || config.teamId;
  if (!teamId) {
    throw new Error('Missing PSA_CLIENT_LAUNCH_TEAM_ID');
  }
  const token = await getGraphToken();
  const channels = await listChannels(teamId, token);
  const match = resolveClient(data.clientName, channels, config);
  console.log(`TEAMS_MATCH ${match.status} ${match.confidence} ${match.selected?.displayName || ''}`);
  if (!match.selected || !['manual', 'high'].includes(match.confidence)) {
    console.log(`TEAMS_POST_SKIPPED ${match.status}: ${match.reason}`);
    return;
  }
  const response = await graphJson(
    'POST',
    `/teams/${teamId}/channels/${encodeURIComponent(match.selected.id)}/messages`,
    token,
    { body: { contentType: 'html', content: teamsMessage(data, notionUrl) } }
  );
  console.log(`TEAMS_POST_STATUS ok ${response.id || ''}`);
}

async function main() {
  if (!ALLOWED_EVENTS.has(eventType)) {
    console.log(`DISPATCH_SKIPPED unsupported event ${eventType || 'unknown'}`);
    return;
  }

  if (eventType === 'pm-hub-project-edit') {
    try {
      await updateProject(dispatchPayload.project || dispatchPayload);
      await triggerSnapshotRefresh('project-edit');
    } catch (err) {
      console.error(`API ERROR project ${err.message}`);
      process.exit(1);
    }
    return;
  }

  if (eventType === 'pm-hub-milestone-edit') {
    try {
      await updateMilestone(dispatchPayload.milestone || dispatchPayload);
      await triggerSnapshotRefresh('milestone-edit');
    } catch (err) {
      console.error(`API ERROR milestone ${err.message}`);
      process.exit(1);
    }
    return;
  }

  let data;
  try {
    data = validatePayload(payload);
  } catch (err) {
    console.error(`API ERROR payload ${err.message}`);
    process.exit(1);
  }
  const page = await createNotionInteraction(data);
  await triggerSnapshotRefresh('interaction-log');
  try {
    await postTeams(data, page.url);
  } catch (err) {
    console.log(`TEAMS_POST_FAILED ${err.message}`);
  }
}

main().catch(err => {
  console.error(err.stack || err.message);
  process.exit(1);
});
