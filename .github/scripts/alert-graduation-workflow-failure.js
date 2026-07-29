#!/usr/bin/env node
'use strict';

const ALERT_TITLE = '[Alert] PSA Graduation Checklist workflow failing';
const ALERT_LABEL = 'automation-alert';

function requiredEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing ${name}`);
  }
  return value;
}

function escapeForIssue(value) {
  return String(value || '').replace(/\r/g, '').trim();
}

async function github(path, options = {}) {
  const token = requiredEnv('GITHUB_TOKEN');
  const repo = requiredEnv('GITHUB_REPOSITORY');
  const res = await fetch(`https://api.github.com/repos/${repo}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });
  const text = await res.text();
  const body = text ? JSON.parse(text) : {};
  if (!res.ok) {
    throw new Error(`GitHub API ${res.status}: ${JSON.stringify(body).slice(0, 1200)}`);
  }
  return body;
}

async function findOpenAlertIssue() {
  const issues = await github(`/issues?state=open&labels=${encodeURIComponent(ALERT_LABEL)}&per_page=50`);
  return issues.find(issue => issue.title === ALERT_TITLE) || null;
}

function issueBody(status) {
  const conclusion = escapeForIssue(process.env.WORKFLOW_CONCLUSION || 'unknown');
  const runId = escapeForIssue(process.env.WORKFLOW_RUN_ID || 'unknown');
  const runUrl = escapeForIssue(process.env.WORKFLOW_RUN_URL || '');
  const headSha = escapeForIssue(process.env.WORKFLOW_HEAD_SHA || '');
  const createdAt = escapeForIssue(process.env.WORKFLOW_CREATED_AT || '');
  const updatedAt = escapeForIssue(process.env.WORKFLOW_UPDATED_AT || '');
  return [
    `Status: ${status}`,
    '',
    `Workflow: ${escapeForIssue(process.env.WORKFLOW_NAME || 'PSA Graduation Checklist Submitted')}`,
    `Conclusion: ${conclusion}`,
    `Run ID: ${runId}`,
    runUrl ? `Run URL: ${runUrl}` : '',
    headSha ? `Head SHA: ${headSha}` : '',
    createdAt ? `Created: ${createdAt}` : '',
    updatedAt ? `Updated: ${updatedAt}` : '',
    '',
    'This issue is managed automatically by the PSA Graduation Checklist Alert workflow.',
  ].filter(Boolean).join('\n');
}

async function ensureLabel() {
  try {
    await github(`/labels/${encodeURIComponent(ALERT_LABEL)}`);
  } catch (error) {
    if (!String(error.message || '').includes('GitHub API 404')) throw error;
    await github('/labels', {
      method: 'POST',
      body: JSON.stringify({
        name: ALERT_LABEL,
        color: 'B60205',
        description: 'Automated alert from onboarding workflows',
      }),
    });
  }
}

async function main() {
  const conclusion = String(process.env.WORKFLOW_CONCLUSION || '').toLowerCase();
  const dryRun = process.env.ALERT_DRY_RUN === '1';
  if (dryRun) {
    console.log(JSON.stringify({
      action: conclusion === 'success' ? 'close-if-open' : 'open-or-comment',
      title: ALERT_TITLE,
      body: issueBody(conclusion === 'success' ? 'Recovered' : 'Failing'),
    }, null, 2));
    return;
  }

  await ensureLabel();
  const existing = await findOpenAlertIssue();

  if (conclusion === 'success') {
    if (!existing) {
      console.log('ALERT_STATUS ok no-open-alert');
      return;
    }
    await github(`/issues/${existing.number}/comments`, {
      method: 'POST',
      body: JSON.stringify({ body: issueBody('Recovered') }),
    });
    await github(`/issues/${existing.number}`, {
      method: 'PATCH',
      body: JSON.stringify({ state: 'closed', state_reason: 'completed' }),
    });
    console.log(`ALERT_STATUS closed issue #${existing.number}`);
    return;
  }

  if (existing) {
    await github(`/issues/${existing.number}/comments`, {
      method: 'POST',
      body: JSON.stringify({ body: issueBody('Still failing') }),
    });
    console.log(`ALERT_STATUS updated issue #${existing.number}`);
    return;
  }

  const created = await github('/issues', {
    method: 'POST',
    body: JSON.stringify({
      title: ALERT_TITLE,
      body: issueBody('Failing'),
      labels: [ALERT_LABEL],
    }),
  });
  console.log(`ALERT_STATUS opened issue #${created.number}`);
}

main().catch(error => {
  console.error(error.stack || error.message || String(error));
  process.exit(1);
});
