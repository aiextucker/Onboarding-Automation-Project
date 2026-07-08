import { spawnSync } from 'node:child_process';

const validId = '06f1e10a-4531-4e0e-8190-7562c25b4805';

const cases = [
  {
    name: 'log-interaction',
    event: 'log-interaction',
    payload: {
      interaction: {
        requestId: 'smoke-log-interaction',
        submittedAt: '2026-07-08T00:00:00.000Z',
        psaId: validId,
        clientName: 'Smoke Test Client',
        title: 'Smoke test interaction',
        date: '2026-07-08',
        type: 'Status Call',
        outcome: 'Neutral',
        sentiment: '3',
        notes: 'Dry-run smoke test',
        followUpNeeded: false,
        followUpDate: null,
      },
    },
  },
  {
    name: 'pm-hub-milestone-edit',
    event: 'pm-hub-milestone-edit',
    payload: {
      milestone: {
        id: validId,
        requestId: 'smoke-milestone-edit',
        submittedAt: '2026-07-08T00:00:00.000Z',
        clientName: 'Smoke Test Client',
        status: 'In Progress',
        due: '2026-07-31',
        completedDate: null,
        notes: 'Dry-run smoke test',
      },
    },
  },
  {
    name: 'pm-hub-project-edit',
    event: 'pm-hub-project-edit',
    payload: {
      project: {
        id: validId,
        requestId: 'smoke-project-edit',
        submittedAt: '2026-07-08T00:00:00.000Z',
        clientName: 'Smoke Test Client',
        forecastDate: '2026-08-15',
        confidence: 'Medium',
        blockers: 'Dry-run smoke test',
      },
    },
  },
];

for (const testCase of cases) {
  const result = spawnSync(process.execPath, ['scripts/pm-hub-dispatch.mjs'], {
    env: {
      ...process.env,
      PM_HUB_DRY_RUN: '1',
      DISPATCH_EVENT_TYPE: testCase.event,
      DISPATCH_PAYLOAD: JSON.stringify(testCase.payload),
    },
    encoding: 'utf8',
  });

  if (result.status !== 0) {
    process.stderr.write(result.stdout);
    process.stderr.write(result.stderr);
    throw new Error(`${testCase.name} smoke test failed`);
  }

  process.stdout.write(`[ok] ${testCase.name}\n`);
}
