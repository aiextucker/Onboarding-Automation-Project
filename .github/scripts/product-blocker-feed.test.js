'use strict';

const assert = require('assert/strict');
const {
  STATUS_LIFECYCLE,
  buildProductBlockers,
  lifecycleForStatus,
} = require('./product-blocker-feed');

function text(type, value) {
  return { type, [type]: [{ plain_text: value }] };
}

function status(value) {
  return { type: 'status', status: { name: value } };
}

function number(value) {
  return { type: 'number', number: value };
}

const billingPages = [{
  id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
  url: 'https://www.notion.so/aaaaaaaaaaaabbbbccccddddeeeeeeeeeeee',
  created_time: '2026-08-01T00:00:00.000Z',
  last_edited_time: '2026-09-10T00:00:00.000Z',
  properties: {
    'Client Name': text('title', 'Acme Telecom'),
    Status: status('On Track'),
    Blockers: text('rich_text', 'Invoice layout prevents launch.'),
    'Evidence Links': text('rich_text', 'Call notes: https://example.test/call/acme'),
    'Affected Areas': { type: 'multi_select', multi_select: [{ name: 'Billing, invoices, payments' }] },
    'Wrike Project ID': text('rich_text', '12345'),
    'Activation MRR': number(1500),
  },
}, {
  id: 'bbbbbbbb-bbbb-cccc-dddd-eeeeeeeeeeee',
  url: 'https://www.notion.so/bbbbbbbbbbbbbbbbccccddddeeeeeeeeeeee',
  created_time: '2026-08-02T00:00:00.000Z',
  last_edited_time: '2026-09-11T00:00:00.000Z',
  properties: {
    'Client Name': text('title', 'No Explicit Blocker'),
    Status: status('On Track'),
    'Last Forecast Change Reason': text('rich_text', 'Scheduling moved after customer request.'),
  },
}];

const psaPages = [{
  id: 'cccccccc-bbbb-cccc-dddd-eeeeeeeeeeee',
  url: 'https://www.notion.so/ccccccccbbbbccccddddeeeeeeeeeeee',
  created_time: '2026-08-03T00:00:00.000Z',
  last_edited_time: '2026-09-12T00:00:00.000Z',
  properties: {
    Client: text('title', 'Trigger Only Client'),
    Status: status('RTS - Functionality'),
    'Wrike Project ID': text('rich_text', '67890'),
    'Fees (MRR)': number(250),
  },
}];

const customFields = [
  ['client', 'PB Client'],
  ['sourceStatus', 'PB Source Status'],
  ['evidence', 'PB Evidence Links'],
  ['areas', 'PB Affected Areas'],
  ['route', 'PB Product Triage Route'],
  ['mrr', 'PB MRR Impact'],
  ['notion', 'PB Source Notion Page'],
  ['wrike', 'PB Source Wrike Project'],
  ['dedupe', 'PB Dedupe Key'],
  ['routing', 'PB Routing State'],
  ['resolution', 'PB Resolution Outcome'],
  ['owner', 'PB Approval Owner'],
].map(([id, title]) => ({ id, title }));

const reviews = [{
  id: 'review-old-duplicate',
  title: '[Product Blocker Review] Acme Telecom — On Track',
  description: 'Product Blocker Review — Acme Telecom\n\nBlocker summary\n- Older duplicate summary.\n\nOwner action\n- Review.',
  permalink: 'https://www.wrike.com/open.htm?id=88888',
  customStatusId: 'approved-status',
  status: 'Active',
  createdDate: '2026-08-31T00:00:00.000Z',
  updatedDate: '2026-09-14T00:00:00.000Z',
  customFields: [
    { id: 'client', value: 'Acme Telecom' },
    { id: 'sourceStatus', value: 'On Track' },
    { id: 'evidence', value: 'Owner recording: https://example.test/owner-evidence' },
    { id: 'areas', value: JSON.stringify(['Billing, invoices, payments']) },
    { id: 'wrike', value: 'https://www.wrike.com/open.htm?id=12345' },
    { id: 'dedupe', value: 'product-blocker-review:stable-acme' },
    { id: 'routing', value: 'ownerQueue' },
    { id: 'resolution', value: 'Open - Owner Review' },
    { id: 'owner', value: 'Alex Owner' },
  ],
}, {
  id: 'review-1',
  title: '[Product Blocker Review] Acme Telecom — On Track',
  description: 'Product Blocker Review — Acme Telecom\n\nBlocker summary\n- Owner confirmed invoice launch gap.\n\nOwner action\n- Review.',
  permalink: 'https://www.wrike.com/open.htm?id=99999',
  customStatusId: 'approved-status',
  status: 'Active',
  createdDate: '2026-09-01T00:00:00.000Z',
  updatedDate: '2026-09-15T00:00:00.000Z',
  customFields: [
    { id: 'client', value: 'Acme Telecom' },
    { id: 'sourceStatus', value: 'On Track' },
    { id: 'evidence', value: 'Owner recording: https://example.test/owner-evidence' },
    { id: 'areas', value: JSON.stringify(['Billing, invoices, payments']) },
    { id: 'wrike', value: 'https://www.wrike.com/open.htm?id=12345' },
    { id: 'dedupe', value: 'product-blocker-review:stable-acme' },
    { id: 'routing', value: 'ownerQueue' },
    { id: 'resolution', value: 'Open - Owner Review' },
    { id: 'owner', value: 'Alex Owner' },
  ],
}];

const productBlockers = buildProductBlockers({
  reviews,
  customFields,
  workflowStatuses: [{ id: 'approved-status', name: 'Approved for Product Routing' }],
  billingPages,
  psaPages,
  clients: [{
    id: 'client-acme',
    name: 'Acme Telecom',
    lob: 'billing',
    wrikeId: '12345',
  }],
});

assert.equal(productBlockers.length, 2, 'PB Dedupe Key should collapse duplicate reviews before review/project merge');
assert.ok(!productBlockers.some(item => item.client === 'No Explicit Blocker'), 'generic project and forecast reason fields must not be treated as blockers');

const acme = productBlockers.find(item => item.client === 'Acme Telecom');
assert.equal(acme.id, 'review:review-1');
assert.equal(acme.dedupeKey, 'product-blocker-review:stable-acme');
assert.equal(acme.sourceKind, 'review');
assert.equal(acme.clientId, 'client-acme');
assert.equal(acme.lifecycleBucket, 'approved');
assert.equal(acme.routingState, 'ready_to_route_product');
assert.equal(acme.blockerSummary, 'Owner confirmed invoice launch gap.');
assert.equal(acme.mrrImpact, 1500, 'project MRR should fill a blank review MRR');
assert.equal(acme.evidence.length, 5, 'review and project evidence should merge');
assert.deepEqual(new Set(acme.sourceLinks.map(link => link.kind)), new Set(['wrikeReview', 'wrikeProject', 'notionProject']));
assert.deepEqual(acme.missingRequiredFields, []);

const triggerOnly = productBlockers.find(item => item.client === 'Trigger Only Client');
assert.equal(triggerOnly.sourceKind, 'project');
assert.equal(triggerOnly.lifecycleBucket, 'not_yet_in_review');
assert.ok(triggerOnly.missingRequiredFields.includes('blockerSummary'));
assert.ok(triggerOnly.missingRequiredFields.includes('evidence'));
assert.ok(triggerOnly.missingRequiredFields.includes('affectedAreas'));

for (const [statusName, [bucket, routingState, resolutionOutcome]] of Object.entries(STATUS_LIFECYCLE)) {
  assert.deepEqual(lifecycleForStatus(statusName), { lifecycleBucket: bucket, routingState, resolutionOutcome });
}
assert.equal(lifecycleForStatus('Brand New Status').lifecycleBucket, 'not_yet_in_review');

const ids = productBlockers.map(item => item.id);
assert.equal(new Set(ids).size, ids.length, 'ids must remain unique after dedupe');
console.log(`product-blocker-feed tests passed (${productBlockers.length} normalized records)`);
