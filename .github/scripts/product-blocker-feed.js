'use strict';

const PRODUCT_BLOCKER_REVIEW_FOLDER_ID = 'MQAAAAEObc7V';

const PB_FIELD_TITLES = Object.freeze({
  client: 'PB Client',
  blockerSummary: 'PB Blocker Summary',
  sourceStatus: 'PB Source Status',
  evidenceLinks: 'PB Evidence Links',
  affectedAreas: 'PB Affected Areas',
  systemArea: 'PB System Area',
  productTriageRoute: 'PB Product Triage Route',
  mrrImpact: 'PB MRR Impact',
  sourceNotionPage: 'PB Source Notion Page',
  sourceWrikeProject: 'PB Source Wrike Project',
  dedupeKey: 'PB Dedupe Key',
  routingState: 'PB Routing State',
  resolutionOutcome: 'PB Resolution Outcome',
  approvalOwner: 'PB Approval Owner',
});

const FUNCTIONALITY_TRIGGER_STATUSES = Object.freeze([
  'Off Track - Functionality',
  'RTS - Functionality',
  'RTAM - Functionality',
  'Canceled - Functionality',
  'Cancelled - Functionality',
  'On Hold - Functionality',
]);

const STATUS_LIFECYCLE = Object.freeze({
  'Needs Review': ['needs_review', 'ownerQueue', 'Open - Owner Review'],
  'Needs Owner Review': ['needs_review', 'ownerQueue', 'Open - Owner Review'],
  'More Info Needed': ['needs_review', 'needs_more_info', 'Open - More Info Needed'],
  'Approved for Product': ['approved', 'ready_to_route_product', 'Open - Approved for Product'],
  'Approved for Product Routing': ['approved', 'ready_to_route_product', 'Open - Approved for Product Routing'],
  'Product Needs More Info': ['routed', 'product_needs_more_info', 'Open - Product Needs More Info'],
  'Routed to Product': ['routed', 'routed_waiting_product', 'Open - Routed to Product'],
  'Product Accepted / Planned': ['routed', 'product_accepted', 'Open - Product Accepted / Planned'],
  'Product Declined': ['routed', 'product_declined', 'Open - Product Declined'],
  'Awaiting Resolution Verification': ['routed', 'awaiting_resolution_check', 'Open - Awaiting Resolution Verification'],
  Resolved: ['resolved', 'closed_resolved', 'Resolved'],
  'Closed - Unresolved': ['resolved', 'closed_unresolved', 'Unresolved'],
  'Not Product': ['closed_not_product', 'closed_no_product_route', 'Not Product'],
  'Not a Product Issue': ['closed_not_product', 'closed_no_product_route', 'Not Product'],
  'Duplicate / Already Tracked': ['closed_duplicate', 'closed_duplicate', 'Duplicate / Already Tracked'],
});

const REQUIRED_DATA_FIELDS = Object.freeze([
  'client',
  'blockerSummary',
  'evidence',
  'affectedAreas',
  'sourceLinks',
]);

function clean(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function cleanMultiline(value) {
  return String(value ?? '')
    .replace(/<\/(p|li|ul|ol|div|br)>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<li>/gi, '- ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&#61;/g, '=')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/\r/g, '')
    .trim();
}

function normalizeKey(value) {
  return clean(value)
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(String(value).replace(/[$,]/g, ''));
  return Number.isFinite(number) ? number : null;
}

function uniqueStrings(values) {
  return [...new Set(values.map(clean).filter(Boolean))];
}

function parseMulti(value) {
  if (Array.isArray(value)) return uniqueStrings(value);
  if (value === null || value === undefined || value === '') return [];
  if (typeof value === 'string' && value.trim().startsWith('[')) {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) return uniqueStrings(parsed);
    } catch {}
  }
  return uniqueStrings(String(value).split(/[;,\n]+/));
}

function notionPropertyValue(property) {
  if (!property) return null;
  if (property.type === 'title') return (property.title || []).map(item => item.plain_text || item.text?.content || '').join('').trim() || null;
  if (property.type === 'rich_text') return (property.rich_text || []).map(item => item.plain_text || item.text?.content || '').join('').trim() || null;
  if (property.type === 'select') return property.select?.name || null;
  if (property.type === 'status') return property.status?.name || null;
  if (property.type === 'multi_select') return (property.multi_select || []).map(item => item.name).filter(Boolean);
  if (property.type === 'url') return property.url || null;
  if (property.type === 'number') return property.number ?? null;
  if (property.type === 'people') return (property.people || []).map(person => person.name || person.id).filter(Boolean);
  if (property.type === 'date') return property.date?.start || null;
  if (property.type === 'checkbox') return property.checkbox;
  if (property.type === 'formula') {
    const formula = property.formula || {};
    return formula.string ?? formula.number ?? formula.boolean ?? formula.date?.start ?? null;
  }
  if (property.type === 'rollup') {
    const rollup = property.rollup || {};
    return rollup.number ?? rollup.date?.start ?? null;
  }
  return null;
}

function firstProperty(properties, names) {
  for (const name of names) {
    const value = notionPropertyValue(properties?.[name]);
    if (Array.isArray(value) ? value.length : value !== null && value !== undefined && value !== '') return value;
  }
  return null;
}

function notionUrl(page) {
  return page.url || (page.id ? `https://www.notion.so/${String(page.id).replace(/-/g, '')}` : null);
}

function wrikeNumericId(value) {
  const match = String(value || '').match(/[?&]id=(\d+)/i);
  return match?.[1] || (/^\d+$/.test(String(value || '')) ? String(value) : null);
}

function notionPageId(value) {
  const compact = String(value || '').replace(/-/g, '').match(/[0-9a-f]{32}/i)?.[0];
  if (!compact) return null;
  return compact.toLowerCase();
}

function compactNotionId(value) {
  return String(value || '').replace(/-/g, '').toLowerCase() || null;
}

function sourceLink(kind, url) {
  const cleanUrl = clean(url);
  return cleanUrl ? { kind, url: cleanUrl } : null;
}

function dedupeObjects(items, keyFn) {
  const out = [];
  const seen = new Set();
  for (const item of items.filter(Boolean)) {
    const key = keyFn(item);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

function evidenceFromValue(source, value, date = null) {
  const text = cleanMultiline(Array.isArray(value) ? value.join('\n') : value);
  if (!text) return [];
  const urls = [...text.matchAll(/https?:\/\/[^\s<>"')\]]+/gi)].map(match => match[0].replace(/[.,;:]+$/, ''));
  const evidence = urls.map(url => ({ source, text: null, url, date }));
  const withoutUrls = clean(text.replace(/https?:\/\/[^\s<>"')\]]+/gi, ' '));
  if (withoutUrls) evidence.unshift({ source, text: withoutUrls.slice(0, 1200), url: null, date });
  return evidence.length ? evidence : [{ source, text: text.slice(0, 1200), url: null, date }];
}

function summaryFromDescription(description) {
  const text = cleanMultiline(description);
  const match = text.match(/(?:^|\n)\s*Blocker summary\s*\n([\s\S]*?)(?=\n\s*(?:Owner action|Owner approval checklist|Decision options|Details are in the PB fields|Affected areas|Source links|Structured PB metadata|Links|Evidence)\s*(?:\n|$)|$)/i);
  if (match) return clean(match[1].replace(/^[-•]\s*/gm, ''));
  const beforeSections = text.split(/\n\s*(?:Owner action|Owner approval checklist|Decision options|Details are in the PB fields|Affected areas|Source links|Structured PB metadata|Links|Evidence)\s*:?/i)[0] || '';
  return clean(beforeSections.replace(/^Product Blocker Review\s*[—-]\s*[^\n]+/i, '')).slice(0, 1200) || null;
}

function customFieldValuesByTitle(task, customFieldById) {
  const values = {};
  for (const item of task.customFields || []) {
    const title = customFieldById.get(item.id)?.title;
    if (title) values[title] = item.value;
  }
  return values;
}

function lifecycleForStatus(statusName) {
  const [lifecycleBucket, routingState, resolutionOutcome] = STATUS_LIFECYCLE[statusName] || [
    'not_yet_in_review',
    'not_in_review',
    null,
  ];
  return { lifecycleBucket, routingState, resolutionOutcome };
}

function projectStatusIsTrigger(status) {
  const normalized = clean(status).toLowerCase();
  return FUNCTIONALITY_TRIGGER_STATUSES.some(item => {
    const trigger = item.toLowerCase();
    return normalized === trigger || normalized.startsWith(`${trigger} -`);
  });
}

function missingRequiredFields(record) {
  return REQUIRED_DATA_FIELDS.filter(field => {
    if (field === 'evidence' || field === 'affectedAreas' || field === 'sourceLinks') return !record[field]?.length;
    return !record[field];
  });
}

function clientIndexes(clients) {
  const byNotion = new Map();
  const byWrike = new Map();
  const byName = new Map();
  for (const client of clients || []) {
    if (client.id) byNotion.set(compactNotionId(client.id), client);
    if (client.psaId) byNotion.set(compactNotionId(client.psaId), client);
    if (client.wrikeId) byWrike.set(String(client.wrikeId), client);
    const key = normalizeKey(client.name);
    if (key && !byName.has(key)) byName.set(key, client);
  }
  return { byNotion, byWrike, byName };
}

function projectRecord(page, lob, indexes) {
  const properties = page.properties || {};
  const client = firstProperty(properties, lob === 'billing' ? ['Client Name', 'Client', 'Name'] : ['Client', 'Client Name', 'Name']);
  const projectStatus = firstProperty(properties, ['Status']);
  const wrikeProjectId = clean(firstProperty(properties, ['Wrike Project ID', 'Wrike ID'])) || null;
  const blockerEntries = [
    ['Product Blocker Summary', firstProperty(properties, ['Product Blocker Summary'])],
    ['Blockers', firstProperty(properties, ['Blockers'])],
    ['Blocker', firstProperty(properties, ['Blocker'])],
  ].filter(([, value]) => clean(Array.isArray(value) ? value.join('; ') : value));
  const explicitEvidenceEntries = [
    ['PB Evidence Links', firstProperty(properties, ['PB Evidence Links'])],
    ['Product Blocker Evidence', firstProperty(properties, ['Product Blocker Evidence'])],
    ['Product Evidence', firstProperty(properties, ['Product Evidence'])],
    ['Evidence Links', firstProperty(properties, ['Evidence Links'])],
    ['Evidence', firstProperty(properties, ['Evidence'])],
  ].filter(([, value]) => clean(Array.isArray(value) ? value.join('; ') : value));
  if (!projectStatusIsTrigger(projectStatus) && !blockerEntries.length && !explicitEvidenceEntries.length) return null;

  const matchedClient = indexes.byNotion.get(compactNotionId(page.id))
    || indexes.byWrike.get(wrikeProjectId)
    || indexes.byName.get(normalizeKey(client));
  const blockerSummary = clean(blockerEntries[0]?.[1]) || null;
  const evidence = dedupeObjects(
    [...blockerEntries, ...explicitEvidenceEntries].flatMap(([source, value]) => evidenceFromValue(`Notion ${source}`, value, page.last_edited_time || null)),
    item => `${item.source}|${item.text || ''}|${item.url || ''}`,
  );
  const pageUrl = notionUrl(page);
  const wrikeUrl = wrikeProjectId ? `https://www.wrike.com/open.htm?id=${wrikeProjectId}` : null;
  const affectedAreas = parseMulti(firstProperty(properties, ['PB Affected Areas', 'Affected Areas', 'System Area', 'Product Area']));
  const approvalOwner = parseMulti(firstProperty(properties, ['PB Approval Owner', 'Approval Owner', 'Owner', 'Solutions Analyst']))
    .find(value => !/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(value)) || null;
  const productTriageRoute = clean(firstProperty(properties, ['PB Product Triage Route', 'Product Triage Route'])) || null;
  const mrrImpact = parseNumber(firstProperty(properties, lob === 'billing' ? ['Activation MRR', 'MRR'] : ['Fees (MRR)', 'MRRC', 'Activation MRR']));
  const sourceId = wrikeProjectId || page.id;
  const explicitDedupeKey = clean(firstProperty(properties, ['PB Dedupe Key', 'Dedupe Key'])) || null;
  const record = {
    id: `project:${lob}:${sourceId}`,
    dedupeKey: explicitDedupeKey || `product-blocker-project:${lob}:${sourceId}`,
    sourceKind: 'project',
    client: clean(client) || matchedClient?.name || null,
    clientId: matchedClient?.id || page.id || null,
    lob,
    projectStatus: clean(projectStatus) || null,
    blockerSummary,
    evidence,
    affectedAreas,
    approvalStatus: 'Not Yet in Review',
    lifecycleBucket: 'not_yet_in_review',
    routingState: 'not_in_review',
    resolutionOutcome: null,
    approvalOwner,
    productTriageRoute,
    mrrImpact,
    sourceLinks: dedupeObjects([
      sourceLink('notionProject', pageUrl),
      sourceLink('wrikeProject', wrikeUrl),
    ], item => item.url),
    createdAt: page.created_time || null,
    updatedAt: page.last_edited_time || null,
    missingRequiredFields: [],
    _notionPageId: compactNotionId(page.id),
    _wrikeProjectId: wrikeProjectId,
    _clientKey: normalizeKey(client || matchedClient?.name),
  };
  record.missingRequiredFields = missingRequiredFields(record);
  return record;
}

function reviewRecord(task, customFieldById, statusById, indexes) {
  const fields = customFieldValuesByTitle(task, customFieldById);
  const statusName = statusById.get(task.customStatusId)?.name || fields['PB Workflow Status'] || task.status || 'Unknown';
  const derivedLifecycle = lifecycleForStatus(statusName);
  const sourceWrikeProjectValue = clean(fields[PB_FIELD_TITLES.sourceWrikeProject]) || null;
  const sourceNotionPageValue = clean(fields[PB_FIELD_TITLES.sourceNotionPage]) || null;
  const linkedWrikeId = wrikeNumericId(sourceWrikeProjectValue);
  const linkedNotionId = notionPageId(sourceNotionPageValue);
  const sourceWrikeProject = sourceWrikeProjectValue && /^\d+$/.test(sourceWrikeProjectValue)
    ? `https://www.wrike.com/open.htm?id=${sourceWrikeProjectValue}`
    : sourceWrikeProjectValue;
  const sourceNotionPage = sourceNotionPageValue && !/^https?:\/\//i.test(sourceNotionPageValue) && linkedNotionId
    ? `https://www.notion.so/${linkedNotionId}`
    : sourceNotionPageValue;
  const client = clean(fields[PB_FIELD_TITLES.client])
    || clean(task.title).replace(/^\[Product Blocker Review\]\s*/i, '').replace(/\s+[—-]\s+.*$/, '')
    || null;
  const matchedClient = indexes.byWrike.get(linkedWrikeId)
    || indexes.byNotion.get(linkedNotionId)
    || indexes.byName.get(normalizeKey(client));
  const blockerSummary = clean(fields[PB_FIELD_TITLES.blockerSummary]) || summaryFromDescription(task.description);
  const evidence = evidenceFromValue('Wrike PB Evidence Links', fields[PB_FIELD_TITLES.evidenceLinks], task.updatedDate || null);
  const fieldRoutingState = clean(fields[PB_FIELD_TITLES.routingState]) || null;
  const fieldResolutionOutcome = clean(fields[PB_FIELD_TITLES.resolutionOutcome]) || null;
  const hasCanonicalLifecycle = Object.prototype.hasOwnProperty.call(STATUS_LIFECYCLE, statusName);
  const dedupeKey = clean(fields[PB_FIELD_TITLES.dedupeKey]) || `product-blocker-review:${task.id}`;
  const record = {
    id: `review:${task.id}`,
    dedupeKey,
    sourceKind: 'review',
    client,
    clientId: matchedClient?.id || null,
    lob: matchedClient?.lob || null,
    projectStatus: clean(fields[PB_FIELD_TITLES.sourceStatus]) || null,
    blockerSummary,
    evidence,
    affectedAreas: parseMulti(fields[PB_FIELD_TITLES.affectedAreas] || fields[PB_FIELD_TITLES.systemArea]),
    approvalStatus: statusName,
    lifecycleBucket: derivedLifecycle.lifecycleBucket,
    routingState: hasCanonicalLifecycle ? derivedLifecycle.routingState : (fieldRoutingState || derivedLifecycle.routingState),
    resolutionOutcome: hasCanonicalLifecycle ? derivedLifecycle.resolutionOutcome : (fieldResolutionOutcome || derivedLifecycle.resolutionOutcome),
    approvalOwner: clean(fields[PB_FIELD_TITLES.approvalOwner]) || null,
    productTriageRoute: clean(fields[PB_FIELD_TITLES.productTriageRoute]) || null,
    mrrImpact: parseNumber(fields[PB_FIELD_TITLES.mrrImpact]),
    sourceLinks: dedupeObjects([
      sourceLink('wrikeReview', task.permalink || `https://www.wrike.com/open.htm?id=${task.id}`),
      sourceLink('wrikeProject', sourceWrikeProject),
      sourceLink('notionProject', sourceNotionPage),
    ], item => item.url),
    createdAt: task.createdDate || null,
    updatedAt: task.updatedDate || task.completedDate || null,
    missingRequiredFields: [],
    _notionPageId: linkedNotionId,
    _wrikeProjectId: linkedWrikeId,
    _clientKey: normalizeKey(client),
  };
  record.missingRequiredFields = missingRequiredFields(record);
  return record;
}

function latestTimestamp(...values) {
  const valid = values.filter(value => value && !Number.isNaN(Date.parse(value)));
  return valid.sort((a, b) => Date.parse(b) - Date.parse(a))[0] || values.find(Boolean) || null;
}

function mergeReviewAndProject(review, project) {
  const record = {
    ...project,
    ...Object.fromEntries(Object.entries(review).filter(([, value]) => value !== null && value !== undefined && value !== '')),
    id: review.id,
    dedupeKey: review.dedupeKey,
    sourceKind: 'review',
    client: review.client || project.client,
    clientId: review.clientId || project.clientId,
    lob: project.lob || review.lob,
    projectStatus: review.projectStatus || project.projectStatus,
    blockerSummary: review.blockerSummary || project.blockerSummary,
    evidence: dedupeObjects([...review.evidence, ...project.evidence], item => `${item.source}|${item.text || ''}|${item.url || ''}`),
    affectedAreas: uniqueStrings([...review.affectedAreas, ...project.affectedAreas]),
    approvalStatus: review.approvalStatus,
    lifecycleBucket: review.lifecycleBucket,
    routingState: review.routingState,
    resolutionOutcome: review.resolutionOutcome,
    approvalOwner: review.approvalOwner || project.approvalOwner,
    productTriageRoute: review.productTriageRoute || project.productTriageRoute,
    mrrImpact: review.mrrImpact ?? project.mrrImpact,
    sourceLinks: dedupeObjects([...review.sourceLinks, ...project.sourceLinks], item => item.url),
    createdAt: review.createdAt || project.createdAt,
    updatedAt: latestTimestamp(review.updatedAt, project.updatedAt),
    missingRequiredFields: [],
    _notionPageId: review._notionPageId || project._notionPageId,
    _wrikeProjectId: review._wrikeProjectId || project._wrikeProjectId,
    _clientKey: review._clientKey || project._clientKey,
  };
  record.missingRequiredFields = missingRequiredFields(record);
  return record;
}

function stripInternal(record) {
  return Object.fromEntries(Object.entries(record).filter(([key]) => !key.startsWith('_')));
}

function mergeSameSourceRecords(current, incoming) {
  const currentTime = Date.parse(current.updatedAt || current.createdAt || '') || 0;
  const incomingTime = Date.parse(incoming.updatedAt || incoming.createdAt || '') || 0;
  const winner = incomingTime >= currentTime ? incoming : current;
  const loser = winner === incoming ? current : incoming;
  const record = {
    ...loser,
    ...winner,
    dedupeKey: winner.dedupeKey,
    evidence: dedupeObjects([...winner.evidence, ...loser.evidence], item => `${item.source}|${item.text || ''}|${item.url || ''}`),
    affectedAreas: uniqueStrings([...winner.affectedAreas, ...loser.affectedAreas]),
    sourceLinks: dedupeObjects([...winner.sourceLinks, ...loser.sourceLinks], item => item.url),
    createdAt: [winner.createdAt, loser.createdAt].filter(Boolean).sort()[0] || null,
    updatedAt: latestTimestamp(winner.updatedAt, loser.updatedAt),
    missingRequiredFields: [],
  };
  record.missingRequiredFields = missingRequiredFields(record);
  return record;
}

function dedupeByExplicitKey(records) {
  const byKey = new Map();
  for (const record of records) {
    const existing = byKey.get(record.dedupeKey);
    byKey.set(record.dedupeKey, existing ? mergeSameSourceRecords(existing, record) : record);
  }
  return [...byKey.values()];
}

function buildProductBlockers({ reviews, customFields, workflowStatuses, billingPages, psaPages, clients }) {
  const indexes = clientIndexes(clients);
  const customFieldById = new Map((customFields || []).map(field => [field.id, field]));
  const statusById = new Map((workflowStatuses || []).map(status => [status.id, status]));
  const projects = dedupeByExplicitKey([
    ...(billingPages || []).map(page => projectRecord(page, 'billing', indexes)),
    ...(psaPages || []).map(page => projectRecord(page, 'psa', indexes)),
  ].filter(Boolean));
  const reviewRecords = dedupeByExplicitKey((reviews || []).map(task => reviewRecord(task, customFieldById, statusById, indexes)));

  const consumedProjectIndexes = new Set();
  const mergedReviews = reviewRecords.map(review => {
    let projectIndex = projects.findIndex((project, index) => !consumedProjectIndexes.has(index) && project.dedupeKey === review.dedupeKey);
    if (projectIndex < 0 && review._wrikeProjectId) {
      projectIndex = projects.findIndex((project, index) => !consumedProjectIndexes.has(index) && project._wrikeProjectId === review._wrikeProjectId);
    }
    if (projectIndex < 0 && review._notionPageId) {
      projectIndex = projects.findIndex((project, index) => !consumedProjectIndexes.has(index) && project._notionPageId === review._notionPageId);
    }
    if (projectIndex < 0 && review._clientKey) {
      const candidates = projects
        .map((project, index) => ({ project, index }))
        .filter(item => !consumedProjectIndexes.has(item.index) && item.project._clientKey === review._clientKey);
      if (candidates.length === 1) projectIndex = candidates[0].index;
      else if (candidates.length > 1 && review.projectStatus) {
        const exactStatus = candidates.find(item => item.project.projectStatus === review.projectStatus);
        if (exactStatus) projectIndex = exactStatus.index;
      }
    }
    if (projectIndex < 0) return review;
    consumedProjectIndexes.add(projectIndex);
    return mergeReviewAndProject(review, projects[projectIndex]);
  });

  const result = [
    ...mergedReviews,
    ...projects.filter((_, index) => !consumedProjectIndexes.has(index)),
  ].map(stripInternal);

  result.sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')) || a.id.localeCompare(b.id));
  return result;
}

async function wrikeGet(path, token, fetchImpl) {
  let lastError;
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    const response = await fetchImpl(`https://www.wrike.com/api/v4${path}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (response.ok) return response.json();
    const body = await response.text();
    lastError = new Error(`Wrike GET ${path} failed ${response.status}: ${body.slice(0, 300)}`);
    if (![429, 500, 502, 503, 504].includes(response.status) || attempt === 4) break;
    await new Promise(resolve => setTimeout(resolve, attempt * 1000));
  }
  throw lastError;
}

async function fetchFolderTasks(folderId, token, fetchImpl) {
  const tasks = [];
  let nextPageToken = null;
  do {
    const query = new URLSearchParams({ pageSize: '100' });
    if (nextPageToken) query.set('nextPageToken', nextPageToken);
    const response = await wrikeGet(`/folders/${encodeURIComponent(folderId)}/tasks?${query}`, token, fetchImpl);
    tasks.push(...(response.data || []));
    nextPageToken = response.nextPageToken || null;
  } while (nextPageToken);
  return tasks;
}

async function fetchWrikeProductBlockerReviews(token, fetchImpl = fetch) {
  if (!token) throw new Error('WRIKE_TOKEN/WRIKE_API_TOKEN is required to build the canonical Product Blocker feed.');
  const [customFieldsResponse, workflowsResponse, folderTasks] = await Promise.all([
    wrikeGet('/customfields', token, fetchImpl),
    wrikeGet('/workflows', token, fetchImpl),
    fetchFolderTasks(PRODUCT_BLOCKER_REVIEW_FOLDER_ID, token, fetchImpl),
  ]);
  const detailedTasks = [];
  for (let offset = 0; offset < folderTasks.length; offset += 100) {
    const ids = folderTasks.slice(offset, offset + 100).map(task => encodeURIComponent(task.id)).join(',');
    if (!ids) continue;
    const response = await wrikeGet(`/tasks/${ids}`, token, fetchImpl);
    detailedTasks.push(...(response.data || []));
  }
  const workflowStatuses = (workflowsResponse.data || []).flatMap(workflow =>
    (workflow.customStatuses || []).map(status => ({ ...status, workflowId: workflow.id, workflowName: workflow.name })),
  );
  return {
    reviews: detailedTasks,
    customFields: customFieldsResponse.data || [],
    workflowStatuses,
  };
}

module.exports = {
  FUNCTIONALITY_TRIGGER_STATUSES,
  PB_FIELD_TITLES,
  PRODUCT_BLOCKER_REVIEW_FOLDER_ID,
  STATUS_LIFECYCLE,
  buildProductBlockers,
  fetchWrikeProductBlockerReviews,
  lifecycleForStatus,
  projectStatusIsTrigger,
};
