import assert from 'node:assert/strict';
import { mock, test } from 'node:test';

const root=new URL('../',import.meta.url);
const f=(p)=>new URL(p,root).href;

let state={
  version:2,
  lastHealthyAt:null,
  lastErrorAt:new Date(Date.now()-60000).toISOString(),
  lastError:'old failure',
  lastFailureError:'old failure',
  consecutiveSuccesses:0,
  consecutiveFailures:1,
  consecutiveWarnings:152,
  lastAlertKey:null,
  lastAlertAt:null
};
let persisted=null;

const chain={
  select(){return this;},
  eq(){return this;},
  maybeSingle(){return Promise.resolve({data:{value:state},error:null});},
  upsert(payload){persisted=payload.value;state=payload.value;return Promise.resolve({error:null});}
};
mock.module(f('app/lib/supabase-admin.js'),{exports:{supabaseAdmin:()=>({from:()=>chain})}});

const {recordSyncHealth}=await import('../app/lib/sync-health.mjs');

test('legacy fallback can be degraded source while sync remains healthy',async()=>{
  const at=new Date().toISOString();
  const next=await recordSyncHealth({
    outcome:'success',
    at,
    memberStatus:'success',
    memberSource:'legacy',
    sourceStatus:'degraded',
    sourceDiagnostics:{status:'degraded',selected:'legacy'},
    rankingStatus:'cached',
    discoveryStatus:'fresh',
    durationMs:520
  });

  assert.equal(next.lastHealthyAt,at);
  assert.equal(next.lastError,null);
  assert.equal(next.lastFailureError,'old failure');
  assert.equal(next.lastMemberSource,'legacy');
  assert.equal(next.lastSourceStatus,'degraded');
  assert.equal(next.lastSourceDiagnostics.selected,'legacy');
  assert.equal(next.consecutiveSuccesses,1);
  assert.equal(next.consecutiveWarnings,0);
  assert.equal(persisted.lastError,null);
});
