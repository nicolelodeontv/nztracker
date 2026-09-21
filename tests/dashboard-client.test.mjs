import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { createRefreshGate, DASHBOARD_REFRESH_INTERVAL_MS, LIVE_REFRESH_INTERVAL_MS, HEAVY_DASHBOARD_REFRESH_INTERVAL_MS } from '../app/lib/dashboard-client.mjs';

test('refresh gate uses the near-realtime dashboard interval', async () => {
  assert.equal(DASHBOARD_REFRESH_INTERVAL_MS, 5000);
  assert.equal(LIVE_REFRESH_INTERVAL_MS, 5000);
  assert.equal(HEAVY_DASHBOARD_REFRESH_INTERVAL_MS, 60000);

  let now = 1_000;
  const gate = createRefreshGate({ now: () => now });
  let calls = 0;

  await gate.run(async () => {
    calls += 1;
    return 'first';
  });

  now += DASHBOARD_REFRESH_INTERVAL_MS - 1;
  const skipped = await gate.run(async () => {
    calls += 1;
  });

  now += 1;
  const second = await gate.run(async () => {
    calls += 1;
    return 'second';
  });

  assert.equal(skipped, null);
  assert.equal(second, 'second');
  assert.equal(calls, 2);
});

test('refresh gate coalesces overlapping refresh calls', async () => {
  let resolveTask;
  const gate = createRefreshGate({ now: () => 1_000 });
  let calls = 0;
  const task = new Promise((resolve) => { resolveTask = resolve; });

  const first = gate.run(async () => {
    calls += 1;
    await task;
    return 'done';
  }, { force: true });
  const second = gate.run(async () => {
    calls += 1;
    return 'unexpected';
  }, { force: true });

  assert.strictEqual(first, second);
  await Promise.resolve();
  assert.equal(calls, 1);

  resolveTask();
  assert.equal(await first, 'done');
});

test('dashboard lifecycle regression guard uses declared refresh state and one mount effect', async () => {
  const source = await readFile(new URL('../app/components/RepTrackerDashboard.js', import.meta.url), 'utf8');
  assert.match(source, /const \[dashboardRefreshing, setDashboardRefreshing\] = useState\(false\)/);
  assert.match(source, /const \[syncing, setSyncing\] = useState\(false\)/);

  const componentStart = source.indexOf('export default function RepTrackerDashboard');
  const component = source.slice(componentStart);
  const mountEffect = component.match(/useEffect\(\(\) => \{[\s\S]*?\n  \}, \[\]\);/);
  assert.ok(mountEffect, 'dashboard mount effect must use an empty dependency array');
  assert.equal((mountEffect[0].match(/setInterval\(/g) || []).length, 2);
  assert.match(mountEffect[0], /setInterval\(refreshLive, LIVE_REFRESH_INTERVAL_MS\)/);
  assert.match(mountEffect[0], /setInterval\(\(\) => refresh\(\), HEAVY_DASHBOARD_REFRESH_INTERVAL_MS\)/);
  assert.ok(mountEffect[0].indexOf('readDashboardCache()') > mountEffect[0].indexOf('useEffect(() => {'));
  assert.equal((mountEffect[0].match(/readDashboardCache\(\)/g) || []).length, 1);

  const syncStart = component.indexOf('const triggerBackgroundSync');
  const syncEnd = component.indexOf('\n\n  useEffect', syncStart);
  const syncBlock = component.slice(syncStart, syncEnd);
  assert.equal((syncBlock.match(/\brefresh\(/g) || []).length, 0);
});

test('production payload shape remains lightweight for the client', () => {
  const payload = {
    configured: true,
    rows: Array.from({ length: 30 }, (_, i) => ({ id: String(i + 1), rep: 1000 + i })),
    activity: Array.from({ length: 10 }, (_, i) => ({ member: 'CHAOS ' + i, gain: 60 })),
    freshness: { status: 'aging', ageSeconds: 120 },
  };

  assert.equal(payload.rows.length, 30);
  assert.equal(payload.activity.length, 10);
  assert.equal(payload.freshness.status, 'aging');
});
