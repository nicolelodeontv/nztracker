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

test('recent activity finds an older gain beyond the previous 100-row cap', () => {
  const points = [];
  for (let i = 0; i < 29; i += 1) {
    for (let j = 0; j < 4; j += 1) {
      points.push({
        member_id: `member-${String(i).padStart(2, '0')}`,
        ign: `Member${i}`,
        reputation: 5000 + i,
        captured_at: `2026-09-21T12:${String(0 + i).padStart(2, '0')}:${String(30 - j).padStart(2, '0')}.000Z`
      });
    }
  }
  points.push(
    { member_id: 'older-gain', ign: 'OlderGain', reputation: 1100, captured_at: '2026-09-20T23:05:00.000Z' },
    { member_id: 'older-gain', ign: 'OlderGain', reputation: 1000, captured_at: '2026-09-20T23:04:00.000Z' }
  );

  points.sort((a, b) => new Date(b.captured_at) - new Date(a.captured_at));

  const events = buildRecentActivityEvents(points, 10);
  assert.deepEqual(events.at(-1), {
    memberId: 'older-gain',
    member: 'OlderGain',
    gain: 100,
    at: '2026-09-20T23:05:00.000Z'
  });
});
