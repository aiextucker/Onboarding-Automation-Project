#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const PDFDocument = require('pdfkit');

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

async function graphUpload(graphPath, token, buffer, label = graphPath) {
  const res = await fetch(`https://graph.microsoft.com/v1.0${graphPath}`, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/pdf',
    },
    body: buffer,
  });
  const text = await res.text();
  let body = {};
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    body = { raw: text };
  }
  if (!res.ok || body.error || body.errors) {
    console.error(`API ERROR ${label} ${res.status} ${JSON.stringify(body).slice(0, 2000)}`);
    process.exit(1);
  }
  return body;
}

function readPayload() {
  const eventPath = process.env.GITHUB_EVENT_PATH;
  if (eventPath && fs.existsSync(eventPath)) {
    const event = JSON.parse(fs.readFileSync(eventPath, 'utf8'));
    return event.client_payload || {};
  }
  if (process.env.GRADUATION_CHECKLIST_PAYLOAD) {
    return JSON.parse(process.env.GRADUATION_CHECKLIST_PAYLOAD);
  }
  console.error('API ERROR missing repository_dispatch client_payload');
  process.exit(1);
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

function safeFileName(value) {
  return clean(value, 'client')
    .replace(/[^a-z0-9]+/gi, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'client';
}

function formatDateForFile(value) {
  return clean(value).slice(0, 10) || new Date().toISOString().slice(0, 10);
}

function htmlEscape(value) {
  return String(value || '').replace(/[&<>"]/g, ch => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
  }[ch]));
}

function addLine(doc, label, value) {
  if (!value) return;
  doc.font('Helvetica-Bold').text(`${label}: `, { continued: true });
  doc.font('Helvetica').text(value);
}

function generatePdf(data) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    const doc = new PDFDocument({ margin: 48, size: 'LETTER', bufferPages: true });
    doc.on('data', chunk => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    doc.font('Helvetica-Bold').fontSize(18).fillColor('#111827').text('PSA Graduation Checklist', { align: 'left' });
    doc.moveDown(0.4);
    doc.font('Helvetica').fontSize(10).fillColor('#4b5563').text(`Submitted ${data.submittedAt}`);
    doc.moveDown();

    doc.fontSize(11).fillColor('#111827');
    addLine(doc, 'Client', data.clientName);
    addLine(doc, 'SA', data.saName || 'Not provided');
    addLine(doc, 'Graduation Date', data.graduationDate || 'Not provided');
    addLine(doc, 'CS Handoff Owner', data.csHandoffOwner || 'Not provided');
    const satisfied = Number(data.completion.satisfied || 0);
    const total = Number(data.completion.total || data.criteria.length || 0);
    addLine(doc, 'Completion', `${satisfied} of ${total} criteria met`);
    if (data.sourceUrl) addLine(doc, 'Source', data.sourceUrl);

    if (data.notes) {
      doc.moveDown(0.8);
      doc.font('Helvetica-Bold').text('Notes / Open Items');
      doc.font('Helvetica').text(data.notes, { width: 500 });
    }

    doc.moveDown(1);
    doc.font('Helvetica-Bold').fontSize(13).text('Criteria');
    doc.moveDown(0.4);

    let currentSection = '';
    for (const item of data.criteria) {
      if (doc.y > 680) doc.addPage();
      if (item.section && item.section !== currentSection) {
        currentSection = item.section;
        doc.moveDown(0.4);
        doc.font('Helvetica-Bold').fontSize(11).fillColor('#1d3756').text(currentSection);
        doc.moveDown(0.2);
      }
      const status = item.notApplicable ? 'N/A' : item.checked ? 'Met' : 'Not met';
      doc.font('Helvetica-Bold').fontSize(10).fillColor('#111827').text(`[${status}] ${item.title || 'Untitled criterion'}`);
      if (item.description) {
        doc.font('Helvetica').fontSize(9).fillColor('#4b5563').text(item.description, { width: 500 });
      }
      if (item.exampleLabel || item.exampleValue) {
        doc.font('Helvetica').fontSize(9).fillColor('#111827')
          .text(`${item.exampleLabel || 'Example'}: ${item.exampleValue || 'Not provided'}`, { width: 500 });
      }
      doc.moveDown(0.35);
    }

    const range = doc.bufferedPageRange();
    for (let i = range.start; i < range.start + range.count; i += 1) {
      doc.switchToPage(i);
      doc.font('Helvetica').fontSize(8).fillColor('#6b7280')
        .text(`Request ID: ${data.requestId} | Page ${i + 1} of ${range.count}`, 48, 740, { align: 'center', width: 516 });
    }

    doc.end();
  });
}

async function uploadPdf(token, data, pdf) {
  const folder = await graphJson(
    'GET',
    `/teams/${TEAM_ID}/channels/${encodeURIComponent(CHANNEL_ID)}/filesFolder`,
    token,
    null,
    'Teams channel filesFolder'
  );
  const driveId = folder.parentReference && folder.parentReference.driveId;
  const folderId = folder.id;
  if (!driveId || !folderId) {
    console.error(`API ERROR Teams filesFolder missing drive/folder IDs ${JSON.stringify(folder).slice(0, 1000)}`);
    process.exit(1);
  }
  const fileName = `PSA Graduation Checklist - ${safeFileName(data.clientName)} - ${formatDateForFile(data.graduationDate || data.submittedAt)}.pdf`;
  const uploaded = await graphUpload(
    `/drives/${driveId}/items/${folderId}:/${encodeURIComponent(fileName)}:/content`,
    token,
    pdf,
    'Teams PDF upload'
  );
  console.log(`PDF_UPLOAD_STATUS ok ${uploaded.id || ''} ${fileName}`);
  return { fileName, driveItem: uploaded };
}

function teamsMessage(data, file) {
  const rows = [
    '<b>PSA graduation checklist submitted</b>',
    `<b>Client:</b> ${htmlEscape(data.clientName)}`,
    `<b>SA:</b> ${htmlEscape(data.saName || 'Not provided')}`,
    `<b>Graduation date:</b> ${htmlEscape(data.graduationDate || 'Not provided')}`,
    `<b>CS handoff owner:</b> ${htmlEscape(data.csHandoffOwner || 'Not provided')}`,
    `<b>Completion:</b> ${htmlEscape(`${data.completion.satisfied || 0} of ${data.completion.total || data.criteria.length} criteria met`)}`,
  ];
  if (data.notes) rows.push(`<b>Notes:</b> ${htmlEscape(data.notes.slice(0, 900))}`);
  rows.push(`<a href="${htmlEscape(file.driveItem.webUrl || '')}">${htmlEscape(file.fileName)}</a>`);
  return rows.join('<br>');
}

async function postTeamsMessage(token, data, file) {
  const attachmentId = file.driveItem.id || 'graduation-checklist-pdf';
  const payload = {
    body: {
      contentType: 'html',
      content: teamsMessage(data, file),
    },
  };
  if (file.driveItem.webUrl) {
    payload.attachments = [{
      id: attachmentId,
      contentType: 'reference',
      contentUrl: file.driveItem.webUrl,
      name: file.fileName,
    }];
  }
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
  const pdf = await generatePdf(data);
  console.log(`PDF_GENERATED bytes=${pdf.length}`);
  const file = await uploadPdf(token, data, pdf);
  await postTeamsMessage(token, data, file);
}

main().catch(err => {
  console.error(err.stack || err.message);
  process.exit(1);
});
