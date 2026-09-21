import assert from 'node:assert/strict';
import { mock, test } from 'node:test';

const root=new URL('../',import.meta.url);
const f=(p)=>new URL(p,root).href;

const config={clan_id:'3',clan_name:'Chaos',current_season:'Season 3'};
const health={
  lastSourceStatus:'degraded',
  lastMemberSource:'legacy',
  lastMemberStatus:'success',
  lastMemberSuccessAt:new Date().toISOString(),
  lastErrorAt:null,
  lastFailureError:null,
  lastSourceDiagnostics:{
    status:'degraded',
    selected:'legacy',
    amf:{source:'amf',status:'error',latencyMs:3000,error:'Upstream request timed out after 3s.',sourceUrl:'https://amf.ninjazenshin.online/'},
    legacy:{source:'legacy',status:'healthy',latencyMs:420,error:null,sourceUrl:'https://ninjazenshin.online/clan-ranking/members/'}
  }
};

mock.module(f('app/lib/admin-auth.js'),{exports:{requireAdmin:()=>null}});
mock.module(f('app/lib/rep-tracker.js'),{exports:{getConfig:async()=>config}});
mock.module(f('app/lib/sync-health.mjs'),{exports:{readSyncHealth:async()=>health}});
mock.module(f('app/lib/ninja-source.mjs'),{exports:{
  fetchLiveMembers:async()=>({
    service:'legacy-live',
    sourceStatus:'degraded',
    sourceDiagnostics:health.lastSourceDiagnostics,
    members:Array.from({length:30},(_,i)=>({id:String(i+1),name:'M'+(i+1),level:90,reputation:1000+i})),
    fetchedAt:new Date().toISOString()
  })
}});

const {GET}=await import('../app/api/admin/source-diagnostics/route.js');

const request=(url)=>new Request(url);

test('source diagnostics returns current recorded health',async()=>{
  const response=await GET(request('https://example.test/api/admin/source-diagnostics'));
  const body=await response.json();
  assert.equal(response.status,200);
  assert.equal(body.ok,true);
  assert.equal(body.configured,true);
  assert.equal(body.current.sourceStatus,'degraded');
  assert.equal(body.current.diagnostics.selected,'legacy');
});

test('source diagnostics probe returns live source result',async()=>{
  const response=await GET(request('https://example.test/api/admin/source-diagnostics?test=1'));
  const body=await response.json();
  assert.equal(response.status,200);
  assert.equal(body.probe.ok,true);
  assert.equal(body.probe.selected,'legacy');
  assert.equal(body.probe.memberCount,30);
  assert.equal(body.probe.sourceDiagnostics.legacy.status,'healthy');
});
