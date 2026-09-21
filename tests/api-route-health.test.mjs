import assert from 'node:assert/strict';
import { mock, test } from 'node:test';

const root = new URL('../', import.meta.url);
const f = (p) => new URL(p, root).href;
const secret = 'x'.repeat(32);
const members = Array.from({length:30},(_,i)=>({id:String(i+1),name:'M'+(i+1),level:90,reputation:1000+i}));
const ranking = { rows:[{clanId:'3',clan:'Chaos',memberCurrent:30}], season:'Season 3', capturedAt:new Date(Date.now()-60000).toISOString(), source:'test' };
const config={clan_id:'3',clan_name:'Chaos',current_season:'Season 3',expected_member_count:30};
let monitorMode='success';
let heartbeatPayloads=[];
let syncHealthState={consecutiveSuccesses:4,lastHealthyAt:ranking.capturedAt,lastAlertKey:null,lastMemberStatus:'success',lastRankingStatus:'fresh'};
let httpHealthState={statusCode:200,timedOut:false,errorMsg:null,created:ranking.capturedAt};

mock.module(f('app/lib/rep-tracker.js'),{exports:{
  dashboardData:async()=>({configured:true,config,season:'Season 3',rows:[],stats:{},freshness:{status:'live',ageSeconds:5},lastSuccessfulSyncAt:ranking.capturedAt}),
  recentActivity:async()=>[],
  freshness:()=>({status:'live',ageSeconds:5}),
  syncTracker:async()=>{
    if(monitorMode==='error')throw new Error('test monitor failure');
    return {
      reused:false,
      live:{members,source:'test'},
      config,
      season:'Season 3',
      discovery:{ranking},
      suspiciousCount:0
    };
  }
}});

mock.module(f('app/lib/member-history.js'),{exports:{
  readSyncStatus:async()=>({lastRunAt:ranking.capturedAt,membersSeen:30,memberErrors:0,overall:'success',intervalMs:60000,nextExpectedAt:new Date(Date.now()+60000).toISOString()}),
  recordSyncStatus:async(payload)=>{heartbeatPayloads.push(payload);return{stored:true};},
  storageHealth:()=>({provider:'supabase',configured:true,authenticated:true,durable:true})
}});

mock.module(f('app/lib/ranking-cache.js'),{exports:{
  recordRankingSnapshot:async()=>({stored:true,rowCount:1}),
  readRankingSnapshot:async()=>ranking,
}});
mock.module(f('app/lib/ninja-source.mjs'),{exports:{
  discoverChaos:async()=>({ranking}),
}});

mock.module(f('app/lib/monitor-status.mjs'),{exports:{getMonitorStatus:()=> 'success'}});
mock.module(f('app/lib/sync-health.mjs'),{exports:{
  readSyncHealth:async()=>syncHealthState,
  readMonitorHttpHealth:async()=>httpHealthState,
  recordSyncHealth:async({outcome='success',at=ranking.capturedAt,error=null}={})=>{syncHealthState={...syncHealthState,lastRunAt:at,lastHealthyAt:outcome==='success'?at:syncHealthState.lastHealthyAt,consecutiveSuccesses:outcome==='success'?Number(syncHealthState.consecutiveSuccesses||0)+1:0,lastError:outcome==='error'?error:syncHealthState.lastError};return syncHealthState;},
  updateSyncHealthAlert:async({alertKey})=>{syncHealthState={...syncHealthState,lastAlertKey:alertKey};return syncHealthState;}
}});
mock.module(f('app/lib/monitor-idempotency.mjs'),{exports:{
  MONITOR_WINDOW_MS:60000,
  claimMonitorWindow:async()=>({claimed:true,key:'monitor-window:test'}),
  completeMonitorWindow:async()=>({key:'monitor-window:test'}),
  releaseMonitorWindow:async()=>({key:'monitor-window:test',released:true}),
  pruneMonitorWindows:async()=>({})
}});

const [{GET:dashboardGET},{GET:syncStatusGET},{GET:syncAllGET},{GET:monitorGET},{GET:monitorHealthGET}]=await Promise.all([
  import('../app/api/dashboard/route.js'),
  import('../app/api/sync-status/route.js'),
  import('../app/api/sync-all/route.js'),
  import('../app/api/monitor/route.js'),
  import('../app/api/monitor-health/route.js')
]);

const request=(path,token)=>new Request('https://example.test'+path,token?{headers:{authorization:'Bearer '+token}}:undefined);
const body=(r)=>r.json();

test('dashboard handler returns its real JSON shape',async()=>{
  const r=await dashboardGET();
  const b=await body(r);
  assert.equal(r.status,200);
  assert.equal(b.ok,true);
  assert.equal(b.configured,true);
  assert.equal(b.freshness.status,'live');
});

test('sync-status handler returns one-minute cadence',async()=>{
  const r=await syncStatusGET();
  const b=await body(r);
  assert.equal(r.status,200);
  assert.equal(b.status,'active');
  assert.equal(b.overall,'success');
  assert.equal(b.membersSeen,30);
  assert.equal(b.intervalMs,60000);
});

test('legacy sync-all alias uses monitor authorization',async()=>{
  process.env.CRON_SECRET=secret;
  assert.equal((await syncAllGET(request('/api/sync-all'))).status,401);
  assert.equal((await syncAllGET(request('/api/sync-all','wrong'))).status,401);
  assert.equal((await syncAllGET(request('/api/sync-all',secret))).status,200);
});

test('monitor executes with correct secret',async()=>{
  process.env.CRON_SECRET=secret;
  const r=await monitorGET(request('/api/monitor',secret));
  const b=await body(r);
  assert.equal(r.status,200);
  assert.equal(b.membersSeen,30);
  assert.equal(b.rankingRows,1);
  assert.equal(b.rankingCache.stored,true);
  assert.equal(heartbeatPayloads.at(-1)?.intervalMs,60000);
  delete process.env.CRON_SECRET;
});

test('monitor records an error heartbeat when tracker sync fails',async()=>{
  process.env.CRON_SECRET=secret;
  monitorMode='error';
  try{
    const r=await monitorGET(request('/api/monitor',secret));
    assert.equal(r.status,502);
    assert.equal(heartbeatPayloads.at(-1)?.overall,'error');
    assert.match(heartbeatPayloads.at(-1)?.error||'',/test monitor failure/);
  }finally{
    monitorMode='success';
    delete process.env.CRON_SECRET;
  }
});

test('monitor-health returns a healthy status with shared auth',async()=>{
  process.env.CRON_SECRET=secret;
  const r=await monitorHealthGET(request('/api/monitor-health',secret));
  const b=await body(r);
  assert.equal(r.status,200);
  assert.equal(b.ok,true);
  assert.equal(b.healthy,true);
  assert.deepEqual(b.problems,[]);
  delete process.env.CRON_SECRET;
});


test('monitor-health detects an actual HTTP monitor failure',async()=>{
  process.env.CRON_SECRET=secret;
  httpHealthState={statusCode:502,timedOut:false,errorMsg:null,created:new Date().toISOString()};
  const r=await monitorHealthGET(request('/api/monitor-health',secret));
  const b=await body(r);
  assert.equal(r.status,200);
  assert.equal(b.ok,true);
  assert.equal(b.healthy,false);
  assert.ok(b.problems.includes('HTTP_REQUEST_FAILURE'));
  httpHealthState={statusCode:200,timedOut:false,errorMsg:null,created:new Date().toISOString()};
  delete process.env.CRON_SECRET;
});
