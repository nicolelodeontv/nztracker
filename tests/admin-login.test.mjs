import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { GET } from '../app/api/admin/login/route.js';
import { issueAdminCookie } from '../app/lib/admin-auth.js';

process.env.ADMIN_SESSION_SECRET = 'admin-session-test-secret';

function requestWithCookie(value) {
  return {
    cookies: {
      get(name) {
        return name === 'nz_admin' && value ? { value } : undefined;
      },
    },
  };
}

async function read(response) {
  return response.json();
}

test('GET admin session: valid cookie returns admin true', async () => {
  const response = await GET(requestWithCookie(issueAdminCookie()));
  assert.equal(response.status, 200);
  assert.deepEqual(await read(response), { admin: true });
  assert.equal(response.headers.get('cache-control'), 'no-store');
});

test('GET admin session: no cookie returns admin false', async () => {
  const response = await GET(requestWithCookie(''));
  assert.equal(response.status, 200);
  assert.deepEqual(await read(response), { admin: false });
});

test('GET admin session: expired cookie returns admin false', async () => {
  const timestamp = String(Date.now() - (12 * 60 * 60 * 1000) - 1000);
  const signature = createHmac('sha256', process.env.ADMIN_SESSION_SECRET).update(timestamp).digest('hex');
  const response = await GET(requestWithCookie(`${timestamp}.${signature}`));
  assert.equal(response.status, 200);
  assert.deepEqual(await read(response), { admin: false });
});

test('GET admin session: tampered signature returns admin false', async () => {
  const cookie = issueAdminCookie();
  const [timestamp, signature] = cookie.split('.');
  const tampered = `${timestamp}.${signature.slice(0, -1)}${signature.endsWith('0') ? '1' : '0'}`;
  const response = await GET(requestWithCookie(tampered));
  assert.equal(response.status, 200);
  assert.deepEqual(await read(response), { admin: false });
});
