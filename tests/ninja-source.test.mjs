import test from 'node:test';
import assert from 'node:assert/strict';
import {
  UPSTREAM_MAX_ATTEMPTS,
  UPSTREAM_TIMEOUT_MS,
  AMF_MAX_ATTEMPTS,
  AMF_TIMEOUT_MS,
  isRetryableUpstreamError,
  isRetryableUpstreamStatus,
  normalizeMembers
} from '../app/lib/ninja-source.mjs';

test('upstream retry policy retries transient HTTP failures', () => {
  assert.equal(UPSTREAM_MAX_ATTEMPTS, 2);
  assert.equal(UPSTREAM_TIMEOUT_MS, 7000);
  assert.equal(AMF_MAX_ATTEMPTS, 1);
  assert.equal(AMF_TIMEOUT_MS, 3000);
  assert.equal(isRetryableUpstreamStatus(502), true);
  assert.equal(isRetryableUpstreamStatus(503), true);
  assert.equal(isRetryableUpstreamStatus(504), true);
  assert.equal(isRetryableUpstreamStatus(401), false);
  assert.equal(isRetryableUpstreamStatus(404), false);
});

test('upstream retry policy recognizes transient network errors', () => {
  assert.equal(isRetryableUpstreamError(new Error('Upstream request timed out after 7s.')), true);
  assert.equal(isRetryableUpstreamError(Object.assign(new Error('reset'), { code: 'ECONNRESET' })), true);
  assert.equal(isRetryableUpstreamError(new Error('permanent parse failure')), false);
});

test('member normalization keeps stable IDs and deduplicates repeated IDs', () => {
  const members = normalizeMembers([
    { id: '1', name: 'Alice', level: 90, reputation: 1000 },
    { id: '1', name: 'Alice Duplicate', level: 90, reputation: 1001 },
    { id: '2', name: 'Bob', level: 91, reputation: 2000 }
  ]);
  assert.equal(members.length, 2);
  assert.equal(members[0].id, '1');
  assert.equal(members[1].id, '2');
});

test('source failover records per-source diagnostics without exposing response bodies', async () => {
  const source = await (await import('node:fs/promises')).readFile(new URL('../app/lib/ninja-source.mjs', import.meta.url), 'utf8');
  assert.match(source, /sourceDiagnostics:\{amf:\{status:'success',httpStatus:response\.status,durationMs:Date\.now\(\)-started\}/);
  assert.match(source, /sourceHealth:'degraded'/);
  assert.match(source, /error\.sourceDiagnostics=\{amf:amfDiagnostic,legacy:legacyDiagnostic\}/);
});
