import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSyncHealthSnapshot } from '../app/lib/sync-health.mjs';

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
});

test('shared sync-health banner reads the fresh lastFailureAt field and labels aggregate metrics as 60s updates', async () => {
  const source=await (await import('node:fs/promises')).readFile(
    new URL('../app/components/RepTrackerDashboard.js', import.meta.url),
    'utf8'
  );
  assert.match(source,/new Date\(health\.lastFailureAt\)\.toLocaleString\(\)/);
  assert.match(source,/health\.lastFailure\|\|'Failure detected\.'/);
  assert.match(source,/SYNC RATE · 60S/);
  assert.match(source,/MISSED · 60S/);

  const bannerIndex=source.indexOf('<SyncHealthAlert data={data}/>');
  const dashboardIndex=source.indexOf("{view==='dashboard'");
  assert.ok(bannerIndex>=0 && bannerIndex<dashboardIndex);
  for(const view of ['dashboard','members','history','final','admin']){
    assert.ok(source.includes("view==='"+view+"'"), 'missing '+view+' view');
  }
});
