import test from 'node:test';
import assert from 'node:assert/strict';
import { buildRecentActivityEvents } from '../app/lib/rep-tracker-utils.mjs';

test('recent activity detects increases from Sannin snapshot sequence', () => {
  const points = [
    { member_id: 'sannin', ign: 'ChaosSannin', reputation: 6943, captured_at: '2026-09-21T03:38:00.000Z' },
    { member_id: 'sannin', ign: 'ChaosSannin', reputation: 6743, captured_at: '2026-09-21T03:37:00.000Z' },
    { member_id: 'sannin', ign: 'ChaosSannin', reputation: 6543, captured_at: '2026-09-21T03:10:00.000Z' }
  ];

  assert.deepEqual(buildRecentActivityEvents(points, 10), [
    { memberId: 'sannin', member: 'ChaosSannin', gain: 200, at: '2026-09-21T03:38:00.000Z' },
    { memberId: 'sannin', member: 'ChaosSannin', gain: 200, at: '2026-09-21T03:37:00.000Z' }
  ]);
});
