import assert from 'node:assert/strict';
import test from 'node:test';
import { buildRecentActivityEvents } from '../app/lib/rep-tracker-utils.mjs';

test('latest gains are sorted newest first', () => {
  const events = buildRecentActivityEvents([
    { member_id: 'a', ign: 'A', reputation: 1100, captured_at: '2026-09-21T10:05:00.000Z' },
    { member_id: 'b', ign: 'B', reputation: 900, captured_at: '2026-09-21T10:10:00.000Z' },
    { member_id: 'a', ign: 'A', reputation: 1000, captured_at: '2026-09-21T10:00:00.000Z' },
    { member_id: 'b', ign: 'B', reputation: 800, captured_at: '2026-09-21T10:01:00.000Z' }
  ], 12);
  assert.deepEqual(events.map((event) => event.at), [
    '2026-09-21T10:10:00.000Z',
    '2026-09-21T10:05:00.000Z'
  ]);
});
