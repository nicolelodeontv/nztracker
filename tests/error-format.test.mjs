import test from 'node:test';
import assert from 'node:assert/strict';
import { formatError } from '../app/lib/error-format.mjs';

test('formats a real Error into readable text', () => {
  const value = formatError(new Error('LEGACY request failed'));
  assert.equal(value, 'LEGACY request failed');
  assert.notEqual(value, '[object Object]');
});

test('formats nested error-shaped objects using their message', () => {
  const value = formatError({
    message: 'Member service returned application status 0.',
    status: 0,
    error: { code: '401' }
  });
  assert.equal(value, 'Member service returned application status 0.');
  assert.notEqual(value, '[object Object]');
});

test('formats reason and nested error fields', () => {
  assert.equal(formatError({ reason: 'HTTP 502 from monitor' }), 'HTTP 502 from monitor');
  assert.equal(formatError({ error: { message: 'Upstream unavailable' } }), 'Upstream unavailable');
});

test('uses a safe fallback for unextractable objects', () => {
  assert.equal(formatError({}, 'Unknown error'), 'Unknown error');
  assert.equal(formatError(Object.create(null)), 'Unknown error');
  assert.notEqual(formatError({}), '[object Object]');
});

test('does not return object coercion for primitive fallbacks', () => {
  assert.equal(formatError(null, 'Unknown error'), 'Unknown error');
  assert.equal(formatError('   ', 'Unknown error'), 'Unknown error');
});
