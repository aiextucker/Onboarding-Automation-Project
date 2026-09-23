#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const TASKS_DB = '33ba59b7e7b2803486f0e749a312b51a';
const NOTION_VERSION = '2022-06-28';
const OUTPUT_PATH = path.join(__dirname, '..', '..', 'data', 'alex-roadmap-submitted-work.json');
const WORKSTREAMS = new Set([
  'Onboarding Automation',
  'PM Hub Internal Improvements',
  'Client-Facing Portal',
  'Forecast & SLT Reporting',
  'Sales / GTM Automation',
  'Product Evidence / Roadmap',
  'Revvy / Agentic Ops',
  'Operations Maintenance',
  'Training / Admin',
]);

function requiredEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`API ERROR missing ${name}`);
  return value;
}

function readPayload() {
  if (process.env.ALEX_ROADMAP_PAYLOAD) return JSON.parse(process.env.ALEX_ROADMAP_PAYLOAD);
  if (process.env.GITHUB_EVENT_PATH && fs.existsSync(process.env.GITHUB_EVENT_PATH)) {
    const event = JSON.parse(fs.readFileSync(process.env.GITHUB_EVENT_PATH, 'utf8'));
    return event.client_payload || {};
  }
  throw new Error('API ERROR missing roadmap payload');
}

async function notion(endpoint, { method = 'GET', body } = {}) {
  const res = await fetch(`https://api.notion.com/v1${endpoint}`, {
    method,
    headers: {
      Authorization: `Bearer ${requiredEnv('NOTION_TOKEN')}`,
      'Notion-Version': NOTION_VERSION,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const raw = await res.text();
  let data;
  try { data = raw ? JSON.parse(raw) : {}; } catch { data = { raw }; }
  if (res.status !== 200 && res.status !== 201) throw new Error(`API ERROR ${res.status} ${raw}`);
  if (data.errorCode || data.errors || data.object === 'error') {
    throw new Error(`API ERROR ${res.status} ${JSON.stringify(data).slice(0, 2000)}`);
  }
  return data;
}

function text(value, max = 1800) {
  const content = String(value || '').slice(0, max);
  return content ? [{ type: 'text', text: { content } }] : [];
}

function plain(prop) {
  if (!prop) return '';
  if (prop.type === 'title') return prop.title.map(item => item.plain_text).join('');
  if (prop.type === 'rich_text') return prop.rich_text.map(item => item.plain_text).join('');
  if (prop.type === 'status') return prop.status?.name || '';
  if (prop.type === 'select') return prop.select?.name || '';
  if (prop.type === 'checkbox') return prop.checkbox ? 'true' : 'false';
  return '';
}

function cleanPayload(input) {
  const title = String(input.title || '').trim().slice(0, 140);
  if (!title) throw new Error('API ERROR 400 Missing title');
  return {
    requestId: String(input.requestId || '').trim().slice(0, 120),
    submittedAt: String(input.submittedAt || new Date().toISOString()).trim(),
    submittedBy: String(input.submittedBy || 'Alex roadmap page').trim().slice(0, 160),
    title,
    notes: String(input.notes || '').trim().slice(0, 1800),
    workstream: WORKSTREAMS.has(input.workstream) ? input.workstream : 'Operations Maintenance',
    priority: ['High', 'Medium', 'Low'].includes(input.priority) ? input.priority : 'Medium',
  };
}

async function findExisting(requestId) {
  if (!requestId) return null;
  const result = await notion(`/databases/${TASKS_DB}/query`, {
    method: 'POST',
    body: {
      filter: { property: 'Roadmap Notes', rich_text: { contains: `Request ID: ${requestId}` } },
      page_size: 1,
    },
  });
  return result.results?.[0] || null;
}

async function createTask(data) {
  const existing = await findExisting(data.requestId);
  if (existing) {
    console.log(`NOTION_STATUS existing ${existing.id}`);
    return existing;
  }
  const notes = [
    data.notes,
    `Submitted via Alex roadmap page: ${data.submittedAt}`,
    data.requestId ? `Request ID: ${data.requestId}` : '',
  ].filter(Boolean).join('\n\n');
  const page = await notion('/pages', {
    method: 'POST',
    body: {
      parent: { database_id: TASKS_DB },
      properties: {
        'Task name': { title: text(data.title, 140) },
        Status: { status: { name: 'Not Started' } },
        Priority: { select: { name: data.priority } },
        'Effort level': { select: { name: 'Small' } },
        Summary: { rich_text: text('Submitted from the Alex roadmap page for review before roadmap acceptance.') },
        Description: { rich_text: text(notes) },
        'Roadmap Workstream': { select: { name: data.workstream } },
        'Dashboard Increment': { select: { name: 'Next' } },
        'Dashboard Visible': { checkbox: true },
        'Roadmap Notes': { rich_text: text(notes) },
        'Roadmap Review Status': { select: { name: 'Pending Review' } },
        'Submitted Via Roadmap': { checkbox: true },
        'Submitted By': { rich_text: text(data.submittedBy, 160) },
      },
    },
  });
  console.log(`NOTION_STATUS created ${page.id}`);
  return page;
}

async function queryPending() {
  const result = await notion(`/databases/${TASKS_DB}/query`, {
    method: 'POST',
    body: {
      filter: {
        and: [
          { property: 'Submitted Via Roadmap', checkbox: { equals: true } },
          { property: 'Roadmap Review Status', select: { equals: 'Pending Review' } },
        ],
      },
      sorts: [{ timestamp: 'last_edited_time', direction: 'descending' }],
      page_size: 100,
    },
  });
  return (result.results || []).map(page => {
    const p = page.properties || {};
    return {
      id: page.id,
      url: page.url,
      name: plain(p['Task name']),
      status: plain(p.Status),
      priority: plain(p.Priority),
      workstream: plain(p['Roadmap Workstream']),
      submittedBy: plain(p['Submitted By']),
      submittedAt: page.created_time,
      lastEdited: page.last_edited_time,
    };
  });
}

async function main() {
  const data = cleanPayload(readPayload());
  const page = await createTask(data);
  const pendingReviewTasks = await queryPending();
  fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
  fs.writeFileSync(OUTPUT_PATH, JSON.stringify({
    generatedAt: new Date().toISOString(),
    source: 'Notion Tasks Tracker',
    pendingReviewTasks,
  }, null, 2) + '\n');
  console.log(JSON.stringify({ ok: true, pageId: page.id, pendingReview: pendingReviewTasks.length }));
}

main().catch(error => {
  console.error(error.stack || error.message || String(error));
  process.exit(1);
});
