import test from 'node:test';
import assert from 'node:assert/strict';
import { buildMemberRequest, RESPONSE_TARGET, isRetryableUpstreamStatus } from '../app/lib/ninja-source.mjs';

test('AMF request uses the known working result callback target', () => {
  assert.equal(RESPONSE_TARGET, '/1/onResult');
  const bytes = new TextDecoder().decode(buildMemberRequest('3'));
  assert.match(bytes, /ClanService\.getMemberList/);
  assert.match(bytes, /\/1\/onResult/);
});

test('AMF retry policy only retries transient upstream HTTP failures', () => {
  assert.equal(isRetryableUpstreamStatus(500), true);
  assert.equal(isRetryableUpstreamStatus(503), true);
  assert.equal(isRetryableUpstreamStatus(400), false);
  assert.equal(isRetryableUpstreamStatus(200), false);
});
