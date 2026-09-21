import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { requireCronSecret } from '../app/lib/cron-auth.mjs';

const originalSecret = process.env.CRON_SECRET;

function requestWithAuthorization(value) {
  return new Request('https://example.test/api/protected', {
    headers: value ? { authorization: value } : undefined,
  });
}

async function protectedEndpoint(request) {
  const denied = requireCronSecret(request, '/test/protected');
  if (denied) return denied;
  return Response.json({ ok: true });
}

test.afterEach(() => {
  if (originalSecret === undefined) delete process.env.CRON_SECRET;
  else process.env.CRON_SECRET = originalSecret;
});

test('missing header returns 401 when CRON_SECRET is configured', async () => {
  process.env.CRON_SECRET = 'test-cron-secret';
  const response = await protectedEndpoint(requestWithAuthorization());
  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), { ok: false, error: 'Unauthorized' });
});

test('wrong header returns 401 when CRON_SECRET is configured', async () => {
  process.env.CRON_SECRET = 'test-cron-secret';
  const response = await protectedEndpoint(requestWithAuthorization('Bearer wrong-secret'));
  assert.equal(response.status, 401);
});

test('correct header returns 200 when CRON_SECRET is configured', async () => {
  process.env.CRON_SECRET = 'test-cron-secret';
  const response = await protectedEndpoint(requestWithAuthorization('Bearer test-cron-secret'));
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true });
});

test('unset CRON_SECRET keeps the endpoint open and logs a warning', async () => {
  delete process.env.CRON_SECRET;
  const warnings = [];
  const originalWarn = console.warn;
  console.warn = (...args) => warnings.push(args.join(' '));
  try {
    const response = await protectedEndpoint(requestWithAuthorization());
    assert.equal(response.status, 200);
  } finally {
    console.warn = originalWarn;
  }
  assert.ok(warnings.some((message) => message.includes('CRON_SECRET is not configured')));
  assert.ok(warnings.every((message) => !message.includes('test-cron-secret')));
});

test('state-changing diagnostic routes use shared cron authorization', async () => {
  const files = [
    '../app/api/sync-all/route.js',
    '../app/api/sync-clans/route.js',
    '../app/api/monitor/route.js',
    '../app/api/source-debug/route.js',
  ];

  for (const file of files) {
    const source = await readFile(new URL(file, import.meta.url), 'utf8');
    if (/api\\/sync-(?:all|clans)/.test(file)) {
      assert.match(source, /monitorGET/);
    } else {
      assert.match(source, /require(?:Required)?CronSecret/);
    }
    assert.doesNotMatch(source, /authorized\\(request\\)/);
  }
});

test('browser sync path does not contain the cron secret', async () => {
  const source = await readFile(
    new URL('../app/components/RepTrackerDashboard.js', import.meta.url),
    'utf8'
  );
  assert.match(source, /api\('\/api\/sync', \{ method: 'GET' \}\)/);
  assert.doesNotMatch(source, /CRON_SECRET/);
});
