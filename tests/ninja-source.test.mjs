import test from 'node:test';
import assert from 'node:assert/strict';
import {
  UPSTREAM_MAX_ATTEMPTS,
  UPSTREAM_TIMEOUT_MS,
  clearCachedCsrfToken,
  fetchLiveMembers,
  getCsrfToken,
  isRetryableUpstreamError,
  isRetryableUpstreamStatus,
  normalizeMembers
} from '../app/lib/ninja-source.mjs';

test('upstream retry policy retries transient HTTP failures', () => {
  assert.equal(UPSTREAM_MAX_ATTEMPTS, 2);
  assert.equal(UPSTREAM_TIMEOUT_MS, 4500);
  assert.equal(isRetryableUpstreamStatus(502), true);
  assert.equal(isRetryableUpstreamStatus(503), true);
  assert.equal(isRetryableUpstreamStatus(504), true);
  assert.equal(isRetryableUpstreamStatus(401), false);
  assert.equal(isRetryableUpstreamStatus(404), false);
});

test('upstream retry policy recognizes transient network errors', () => {
  assert.equal(isRetryableUpstreamError(new Error('Upstream request timed out after 4.5s.')), true);
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
  assert.match(source, /sourceDiagnostics:\{amf:\{status:'success',httpStatus:response\.status,durationMs:Date\.now\(\)-started,responseStatus:bodyStatus\?\?null/);
  assert.match(source, /sourceHealth:'degraded'/);
  assert.match(source, /request:\{origin:AMF_ORIGIN,service:SERVICE,responseTarget:RESPONSE_TARGET/);
  assert.match(source, /error\.sourceDiagnostics=\{amf:amfDiagnostic,legacy:legacyDiagnostic\}/);
});


const csrfPageUrl = 'https://ninjazenshin.online/?panel=clan-ranking';

const responseFor = (body, status=200, headers={}) =>
  new Response(body, { status, headers });

function pushU16(bytes, value) {
  bytes.push((value >> 8) & 255, value & 255);
}

function pushU32(bytes, value) {
  bytes.push(
    (value >>> 24) & 255,
    (value >>> 16) & 255,
    (value >>> 8) & 255,
    value & 255
  );
}

function pushAmfDouble(bytes, value) {
  const buffer = new ArrayBuffer(8);
  new DataView(buffer).setFloat64(0, value, false);
  bytes.push(...new Uint8Array(buffer));
}

function pushAmfString(bytes, value) {
  const encoded = new TextEncoder().encode(value);
  bytes.push(0x02);
  pushU16(bytes, encoded.length);
  bytes.push(...encoded);
}

function pushAmfObject(bytes, fields) {
  const encoder = new TextEncoder();
  bytes.push(0x03);

  for (const [key, value] of Object.entries(fields)) {
    const keyBytes = encoder.encode(key);
    pushU16(bytes, keyBytes.length);
    bytes.push(...keyBytes);

    if (typeof value === 'number') {
      bytes.push(0x00);
      pushAmfDouble(bytes, value);
    } else if (typeof value === 'string') {
      pushAmfString(bytes, value);
    } else if (Array.isArray(value)) {
      bytes.push(0x0a);
      pushU32(bytes, value.length);
      for (const item of value) pushAmfObject(bytes, item);
    }
  }

  bytes.push(0x00, 0x00, 0x09);
}

function makeAmfResponse(fields) {
  const body = [];
  pushAmfObject(body, fields);

  const encoder = new TextEncoder();
  const target = encoder.encode('null');
  const response = encoder.encode('/1/onResult');
  const bytes = [0x00, 0x00];

  pushU16(bytes, 0);
  pushU16(bytes, 1);
  pushU16(bytes, target.length);
  bytes.push(...target);
  pushU16(bytes, response.length);
  bytes.push(...response);
  pushU32(bytes, 0xffffffff);
  bytes.push(...body);

  return new Uint8Array(bytes);
}

test('CSRF fetch uses the exact diagnostic page URL and caches within the TTL', async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];

  try {
    clearCachedCsrfToken();
    globalThis.fetch = async (url, options={}) => {
      calls.push({ url: String(url), options });
      return responseFor('<meta name="csrf-token" content="TOKEN-A">');
    };

    assert.equal(await getCsrfToken(true), 'TOKEN-A');
    assert.equal(await getCsrfToken(), 'TOKEN-A');
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, csrfPageUrl);
  } finally {
    globalThis.fetch = originalFetch;
    clearCachedCsrfToken();
  }
});

test('forced CSRF refresh bypasses a valid cached token', async () => {
  const originalFetch = globalThis.fetch;
  let calls = 0;

  try {
    clearCachedCsrfToken();
    globalThis.fetch = async () => {
      calls += 1;
      return responseFor('<meta name="csrf-token" content="TOKEN-' + calls + '">');
    };

    assert.equal(await getCsrfToken(true), 'TOKEN-1');
    assert.equal(await getCsrfToken(), 'TOKEN-1');
    assert.equal(calls, 1);
    assert.equal(await getCsrfToken(true), 'TOKEN-2');
    assert.equal(calls, 2);
  } finally {
    globalThis.fetch = originalFetch;
    clearCachedCsrfToken();
  }
});

test('concurrent ordinary CSRF requests share one in-flight fetch', async () => {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  let release;
  const gate = new Promise(resolve => { release = resolve; });

  try {
    clearCachedCsrfToken();
    globalThis.fetch = async () => {
      calls += 1;
      await gate;
      return responseFor('<meta name="csrf-token" content="TOKEN-SHARED">');
    };

    const first = getCsrfToken(true);
    await new Promise(resolve => setImmediate(resolve));
    const second = getCsrfToken();
    release();

    assert.equal(await first, 'TOKEN-SHARED');
    assert.equal(await second, 'TOKEN-SHARED');
    assert.equal(calls, 1);
  } finally {
    globalThis.fetch = originalFetch;
    clearCachedCsrfToken();
  }
});

test('two simultaneous forced-refresh callers share one forced token fetch', async () => {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  let release;
  const gate = new Promise(resolve => { release = resolve; });

  try {
    clearCachedCsrfToken();
    globalThis.fetch = async () => {
      calls += 1;
      await gate;
      return responseFor('<meta name="csrf-token" content="TOKEN-FORCED-SHARED">');
    };

    const first = getCsrfToken(true);
    await new Promise(resolve => setImmediate(resolve));
    const second = getCsrfToken(true);
    release();

    assert.equal(await first, 'TOKEN-FORCED-SHARED');
    assert.equal(await second, 'TOKEN-FORCED-SHARED');
    assert.equal(calls, 1);
  } finally {
    globalThis.fetch = originalFetch;
    clearCachedCsrfToken();
  }
});

test('forced refresh does not reuse an ordinary in-flight CSRF fetch', async () => {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  let release;
  const gate = new Promise(resolve => { release = resolve; });

  try {
    clearCachedCsrfToken();
    globalThis.fetch = async () => {
      calls += 1;
      if (calls === 1) {
        await gate;
        return responseFor('<meta name="csrf-token" content="TOKEN-OLD">');
      }
      return responseFor('<meta name="csrf-token" content="TOKEN-NEW">');
    };

    const ordinary = getCsrfToken();
    await new Promise(resolve => setImmediate(resolve));
    const forced = getCsrfToken(true);
    release();

    assert.equal(await ordinary, 'TOKEN-OLD');
    assert.equal(await forced, 'TOKEN-NEW');
    assert.equal(calls, 2);
  } finally {
    globalThis.fetch = originalFetch;
    clearCachedCsrfToken();
  }
});

test('missing CSRF token has an explicit source error code', async () => {
  const originalFetch = globalThis.fetch;

  try {
    clearCachedCsrfToken();
    globalThis.fetch = async () => responseFor('<html><body>No token</body></html>');

    await assert.rejects(
      () => getCsrfToken(true),
      error => error?.code === 'CSRF_TOKEN_MISSING'
    );
  } finally {
    globalThis.fetch = originalFetch;
    clearCachedCsrfToken();
  }
});

test('production AMF request sends the cached CSRF token and XMLHttpRequest header', async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];

  try {
    clearCachedCsrfToken();
    globalThis.fetch = async (url, options={}) => {
      const value = String(url);
      calls.push({ url: value, options });

      if (value === csrfPageUrl) {
        return responseFor('<meta name="csrf-token" content="TOKEN-AMF">');
      }

      return responseFor(
        makeAmfResponse({
          status: 1,
          result: [{ id: '1', name: 'Alice', level: 90, reputation: 1000 }],
        }),
        200,
        { 'content-type': 'application/x-amf' }
      );
    };

    const result = await fetchLiveMembers('3');
    const amfCall = calls.find(call => call.url.startsWith('https://amf.ninjazenshin.online/'));

    assert.ok(amfCall);
    const amfHeaders = new Headers(amfCall.options.headers);
    assert.equal(amfHeaders.get('x-csrf-token'), 'TOKEN-AMF');
    assert.equal(amfHeaders.get('x-requested-with'), 'XMLHttpRequest');
    assert.equal(result.source, 'https://amf.ninjazenshin.online/');
    assert.equal(result.members[0].name, 'Alice');
  } finally {
    globalThis.fetch = originalFetch;
    clearCachedCsrfToken();
  }
});

test('AMF status=0/message=401 forces one token refresh and retries with the new token', async () => {
  const originalFetch = globalThis.fetch;
  let tokenFetches = 0;
  let amfCalls = 0;
  const requests = [];

  try {
    clearCachedCsrfToken();
    globalThis.fetch = async (url, options={}) => {
      const value = String(url);
      requests.push({ url: value, options });

      if (value === csrfPageUrl) {
        tokenFetches += 1;
        return responseFor('<meta name="csrf-token" content="TOKEN-' + tokenFetches + '">');
      }

      amfCalls += 1;
      return responseFor(
        amfCalls === 1
          ? makeAmfResponse({ status: 0, message: '401' })
          : makeAmfResponse({
              status: 1,
              result: [{ id: '1', name: 'Alice', level: 90, reputation: 1000 }],
            }),
        200,
        { 'content-type': 'application/x-amf' }
      );
    };

    const result = await fetchLiveMembers('3');
    const amfRequests = requests.filter(call => call.url.startsWith('https://amf.ninjazenshin.online/'));

    assert.equal(tokenFetches, 2);
    assert.equal(amfCalls, 2);
    assert.equal(new Headers(amfRequests[0].options.headers).get('x-csrf-token'), 'TOKEN-1');
    assert.equal(new Headers(amfRequests[1].options.headers).get('x-csrf-token'), 'TOKEN-2');
    assert.equal(result.source, 'https://amf.ninjazenshin.online/');
  } finally {
    globalThis.fetch = originalFetch;
    clearCachedCsrfToken();
  }
});

test('a second AMF status=0/message=401 falls through to the existing legacy source', async () => {
  const originalFetch = globalThis.fetch;
  let tokenFetches = 0;
  let amfCalls = 0;
  let legacyCalls = 0;

  try {
    clearCachedCsrfToken();
    globalThis.fetch = async url => {
      const value = String(url);

      if (value === csrfPageUrl) {
        tokenFetches += 1;
        return responseFor('<meta name="csrf-token" content="TOKEN-' + tokenFetches + '">');
      }

      if (value.startsWith('https://amf.ninjazenshin.online/')) {
        amfCalls += 1;
        return responseFor(
          makeAmfResponse({ status: 0, message: '401' }),
          200,
          { 'content-type': 'application/x-amf' }
        );
      }

      if (value.startsWith('https://ninjazenshin.online/clan-ranking/members/')) {
        legacyCalls += 1;
        return responseFor(
          JSON.stringify({ members: [{ id: '9', name: 'Legacy', level: 88, reputation: 900 }] }),
          200,
          { 'content-type': 'application/json' }
        );
      }

      throw new Error('Unexpected URL: ' + value);
    };

    const result = await fetchLiveMembers('3');

    assert.equal(tokenFetches, 2);
    assert.equal(amfCalls, 2);
    assert.equal(legacyCalls, 1);
    assert.equal(result.sourceHealth, 'degraded');
    assert.equal(result.members[0].name, 'Legacy');
    assert.match(result.fallbackReason, /application status 0/);
  } finally {
    globalThis.fetch = originalFetch;
    clearCachedCsrfToken();
  }
});

test('production sync path uses the shared AMF authorization classifier and CSRF headers', async () => {
  const source = await (await import('node:fs/promises')).readFile(
    new URL('../app/lib/ninja-source.mjs', import.meta.url),
    'utf8'
  );

  assert.ok(source.includes("import { isKnownAmfAuthorizationDenial } from './amf-probe.mjs';"));
  assert.ok(source.includes('async function fromAmfWithCsrf(clanId)'));
  assert.ok(source.includes("'X-CSRF-TOKEN': csrfToken"));
  assert.ok(source.includes("'X-Requested-With': 'XMLHttpRequest'"));
  assert.ok(source.includes('if (!isKnownAmfAuthorizationDenial(error)) throw error'));
  assert.ok(source.includes('try{return await fromAmfWithCsrf(key);}'));
});

test('diagnostic missing-token response contract remains unchanged', async () => {
  const route = await (await import('node:fs/promises')).readFile(
    new URL('../app/api/amf-probe/route.js', import.meta.url),
    'utf8'
  );

  const expected = [
    "return Response.json({",
    "          ok:false,",
    "          source:'amf',",
    "          status:'failure',",
    "          error:'No public CSRF token was exposed by the game page.',",
    "        },{status:502,headers:noStoreHeaders});",
  ].join('\n');

  assert.ok(route.includes(expected));
});

test('diagnostic route reuses the shared CSRF helper and exact page contract', async () => {
  const route = await (await import('node:fs/promises')).readFile(
    new URL('../app/api/amf-probe/route.js', import.meta.url),
    'utf8'
  );

  assert.ok(route.includes('import { getCsrfToken, probeAmfMemberSource }'));
  assert.ok(route.includes('csrfToken=await getCsrfToken()'));
  assert.ok(!route.includes("const page=await fetch(sourceOrigin+'/?panel=clan-ranking'"));
  assert.ok(!route.includes('const match=html.match(/<meta[^>]+name=["\' ]csrf-token'));
  assert.ok(route.includes('No public CSRF token was exposed by the game page'));
});
