import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PERIOD_LABELS,
  timelineFor,
  baselinePoint,
  statusFor,
  memberMetrics,
  buildMemberRows,
  deriveEvents,
  deriveAlerts
} from '../app/lib/metrics.js';

const HOUR = 60 * 60 * 1000;
const now = 10 * HOUR;
const points = [
  { t: 0, r: 1000 },
  { t: 5 * HOUR, r: 3000 },
  { t: 8 * HOUR, r: 5000 },
  { t: 10 * HOUR, r: 8000 }
];

test('period labels expose supported tracking windows', () => {
  assert.equal(PERIOD_LABELS[1], '1H');
  assert.equal(PERIOD_LABELS[5], '5H');
  assert.equal(PERIOD_LABELS[168], '7D');
});

test('timelineFor sorts snapshots and baselinePoint selects the prior snapshot', () => {
  const unordered = [points[3], points[0], points[2], points[1]];
  const timeline = timelineFor({ points: unordered });
  assert.deepEqual(timeline.map((point) => point.t), [0, 5 * HOUR, 8 * HOUR, 10 * HOUR]);
  assert.deepEqual(baselinePoint(timeline, 7 * HOUR), points[1]);
  assert.deepEqual(baselinePoint(timeline, 2 * HOUR), points[0]);
});

test('statusFor classifies active, recent, idle, old, reset, new, and missing states', () => {
  assert.equal(statusFor({ name: 'A' }, { points: [{ t: now - 10 * 60000, r: 100 }, { t: now, r: 200 }] }, now), 'ACTIVE');
  assert.equal(statusFor({ name: 'A' }, { points: [{ t: now - 30 * 60000, r: 100 }, { t: now - 20 * 60000, r: 200 }] }, now), 'RECENT');
  assert.equal(statusFor({ name: 'A' }, { points: [{ t: now - 2 * HOUR, r: 100 }, { t: now - 90 * 60000, r: 200 }] }, now), 'IDLE');
  assert.equal(statusFor({ name: 'A' }, { points: [{ t: now - 8 * HOUR, r: 100 }, { t: now - 7 * HOUR, r: 100 }] }, now), 'NO GAIN');
  assert.equal(statusFor({ name: 'A' }, { points: [{ t: now - 5 * 60000, r: 200 }, { t: now, r: 100 }] }, now), 'RESET');
  assert.equal(statusFor({ name: 'A' }, { points: [{ t: now, r: 100 }] }, now), 'NEW');
  assert.equal(statusFor({ name: 'A', missing: true }, { points: [] }, now), 'MISSING');
});

test('memberMetrics calculates baseline gain and hourly rate without negative gains', () => {
  const member = { id: '1', name: 'A', reputation: 8000 };
  const metrics = memberMetrics(member, { points }, 5, now);
  assert.equal(metrics.current, 8000);
  assert.equal(metrics.before, 3000);
  assert.equal(metrics.gain, 5000);
  assert.equal(metrics.gainPerHour, 1000);
  assert.equal(metrics.latestTs, now);
  assert.equal(metrics.reset, false);

  const reset = memberMetrics({ reputation: 2000 }, { points }, 5, now);
  assert.equal(reset.gain, 0);
  assert.equal(reset.reset, true);
});

test('buildMemberRows merges live and history-only members, then sorts by reputation', () => {
  const members = [
    { id: '1', name: 'Low', reputation: 2000 },
    { id: '2', name: 'High', reputation: 9000 }
  ];
  const historyMembers = {
    '1': { name: 'Low', points: [{ t: 0, r: 1000 }, { t: now, r: 2000 }] },
    '2': { name: 'High', points: [{ t: 0, r: 5000 }, { t: now, r: 9000 }] },
    '3': { name: 'Missing', points: [{ t: 0, r: 1000 }, { t: now, r: 1000 }] }
  };
  const rows = buildMemberRows(members, historyMembers, 5, now);
  assert.deepEqual(rows.map((row) => row.name), ['High', 'Low', 'Missing']);
  assert.equal(rows[2].status, 'MISSING');
  assert.equal(rows[1].gain, 1000);
  assert.equal(rows[0].gain, 4000);
});

test('deriveEvents ignores non-gains and events older than 24 hours', () => {
  const members = [{ id: '1', name: 'A' }];
  const historyMembers = {
    '1': {
      points: [
        { t: now - 30 * HOUR, r: 100 },
        { t: now - 2 * HOUR, r: 200 },
        { t: now - HOUR, r: 150 },
        { t: now - 30 * 60000, r: 450 }
      ]
    }
  };
  const events = deriveEvents(members, historyMembers, now);
  assert.equal(events.length, 2);
  assert.deepEqual(events.map((event) => event.gain), [300, 100]);
  assert.ok(events[0].t > events[1].t);
});

test('deriveAlerts emits gain, speed, inactivity, reset, and missing alerts with a cap', () => {
  const rows = [
    { name: 'Burn', gain: 10000, gainPerHour: 1200, status: 'ACTIVE' },
    { name: 'Idle', gain: 0, gainPerHour: 0, status: 'IDLE' },
    { name: 'Reset', gain: 0, gainPerHour: 0, status: 'RESET' },
    { name: 'Missing', gain: 0, gainPerHour: 0, status: 'MISSING' }
  ];
  const alerts = deriveAlerts(rows, 5);
  assert.ok(alerts.some((alert) => alert.type === '+10K GAIN' && alert.text.includes('5H')));
  assert.ok(alerts.some((alert) => alert.type === 'FAST GAIN'));
  assert.ok(alerts.some((alert) => alert.type === 'NO ACTIVITY'));
  assert.ok(alerts.some((alert) => alert.type === 'REP RESET'));
  assert.ok(alerts.some((alert) => alert.type === 'MEMBER MISSING'));
  assert.ok(alerts.length <= 30);
});
