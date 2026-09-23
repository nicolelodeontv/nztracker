import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSyncHealthSnapshot, getSyncHealthAlertState } from '../app/lib/sync-health.mjs';
import { formatError } from '../app/lib/error-format.mjs';

test('last failure timestamp follows the most recent consecutive degraded source failure', () => {
  const firstAt='2026-09-22T04:50:20.000Z';
  const secondAt='2026-09-22T04:50:30.000Z';

  const first=buildSyncHealthSnapshot({
    at:firstAt,
    outcome:'success',
    memberStatus:'success',
    memberSource:'legacy',
    sourceHealth:'degraded',
    sourceWarning:'AMF application status 0. message=401'
  });
  assert.equal(first.lastFailureAt, firstAt);
  assert.equal(first.lastFailure, 'AMF application status 0. message=401');
  assert.equal(first.consecutiveSourceWarnings, 1);

  const second=buildSyncHealthSnapshot({
    previous:first,
    at:secondAt,
    outcome:'success',
    memberStatus:'success',
    memberSource:'legacy',
    sourceHealth:'degraded',
    sourceWarning:'AMF application status 0. message=401'
  });
  assert.equal(second.lastFailureAt, secondAt);
  assert.equal(second.lastFailure, 'AMF application status 0. message=401');
  assert.equal(second.consecutiveSourceWarnings, 2);
  assert.notEqual(second.lastFailureAt, first.lastFailureAt);
});

test('recovery preserves the most recent failure timestamp for audit context', () => {
  const failureAt='2026-09-22T04:50:30.000Z';
  const recoveredAt='2026-09-22T04:50:40.000Z';

  const failure=buildSyncHealthSnapshot({
    at:failureAt,
    outcome:'success',
    memberStatus:'success',
    memberSource:'legacy',
    sourceHealth:'degraded',
    sourceWarning:'AMF application status 0. message=401'
  });
  const recovered=buildSyncHealthSnapshot({
    previous:failure,
    at:recoveredAt,
    outcome:'success',
    memberStatus:'success',
    memberSource:'amf',
    sourceHealth:'healthy'
  });

  assert.equal(recovered.lastFailureAt, failureAt);
  assert.equal(recovered.lastFailure, failure.lastFailure);
  assert.equal(recovered.lastSourceHealth, 'healthy');

  const alert=getSyncHealthAlertState({
    health:recovered,
    stats:{syncSuccessRate:0.98}
  });
  assert.equal(alert.visible, false);
  assert.equal(alert.degraded, false);
  assert.equal(alert.lowRate, false);
});

test('shared sync-health banner reads the fresh lastFailureAt field and labels aggregate metrics as 60s updates', async () => {
  const source=await (await import('node:fs/promises')).readFile(
    new URL('../app/components/RepTrackerDashboard.js', import.meta.url),
    'utf8'
  );
  assert.match(source,/new Date\(health\.lastFailureAt\)\.toLocaleString\(\)/);
  assert.match(source,/formatError\(health\.lastFailure,'Failure detected\.'\)/);
  assert.match(source,/health\.lastError \? formatError\(health\.lastError\)/);
  assert.match(source,/formatError\(data\.syncHealth\?\.sourceDiagnostics\?\.amf\?\.error, '—'\)/);
  assert.match(source,/SYNC RATE · 60S/);
  assert.match(source,/MISSED · 60S/);

  const bannerIndex=source.indexOf('<SyncHealthAlert data={data}/>');
  const dashboardIndex=source.indexOf("{view==='dashboard'");
  assert.ok(bannerIndex>=0 && bannerIndex<dashboardIndex);
  for(const view of ['dashboard','members','history','final','admin']){
    assert.ok(source.includes("view==='"+view+"'"), 'missing '+view+' view');
  }
});

test('AMF failure with healthy LEGACY stays non-urgent',()=>{
  const state=getSyncHealthAlertState({
    health:{
      lastSourceHealth:'degraded',
      lastMemberSource:'legacy',
      lastMemberStatus:'success',
      lastLegacySuccessAt:'2026-09-22T05:00:00.000Z',
      consecutiveSourceWarnings:4077,
      sourceDiagnostics:{
        amf:{status:'error',httpStatus:401,error:'AMF authorization required.'},
        legacy:{status:'success',httpStatus:200}
      }
    },
    stats:{syncSuccessRate:0.98}
  });
  assert.equal(state.visible,true);
  assert.equal(state.urgent,false);
  assert.equal(state.quietFallback,true);
});

test('AMF and LEGACY failure escalates to urgent state',()=>{
  const state=getSyncHealthAlertState({
    health:{
      lastSourceHealth:'down',
      lastMemberSource:null,
      lastMemberStatus:'error',
      sourceDiagnostics:{
        amf:{status:'error',httpStatus:401,error:'AMF authorization required.'},
        legacy:{status:'error',httpStatus:503,error:'Legacy source unavailable.'}
      }
    },
    stats:{syncSuccessRate:0.98}
  });
  assert.equal(state.visible,true);
  assert.equal(state.urgent,true);
  assert.equal(state.quietFallback,false);
  assert.equal(state.legacyFailed,true);
});


test('sync health storage never persists [object Object] for error-shaped values', () => {
  const snapshot = buildSyncHealthSnapshot({
    outcome: 'error',
    error: new Error('Database request failed'),
    sourceWarning: { reason: 'Fallback unavailable' },
    at: '2026-09-23T00:00:00.000Z'
  });
  assert.equal(snapshot.lastError, 'Database request failed');
  assert.equal(snapshot.lastFailure, 'Database request failed');
  assert.notEqual(snapshot.lastError, '[object Object]');
  assert.notEqual(snapshot.lastFailure, '[object Object]');
});

test('affected status-display inputs remain readable when supplied real Error objects', () => {
  const error = new Error('LEGACY request failed with HTTP 502');
  assert.equal(formatError(error), 'LEGACY request failed with HTTP 502');
  assert.equal(formatError({ error }), 'LEGACY request failed with HTTP 502');

  const objectError = {
    message: 'Member service returned application status 0. message=401',
    status: 'error',
    response: { httpStatus: 200 }
  };
  assert.equal(formatError(objectError), 'Member service returned application status 0. message=401');
  assert.notEqual(formatError(objectError), '[object Object]');
});
