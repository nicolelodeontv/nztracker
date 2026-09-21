import { readSyncStatus } from '../../lib/member-history.js';
import { readSyncHealth, readMonitorHttpHealth, updateSyncHealthAlert } from '../../lib/sync-health.mjs';
import { requireRequiredCronSecret } from '../../lib/cron-auth.mjs';

export const runtime='nodejs';
export const dynamic='force-dynamic';
export const maxDuration=15;

const MAX_AGE_MS=3*60*1000;
const HTTP_MONITOR_MAX_AGE_MS=3*60*1000;

function problemState(sync,health,http){
  const problems=[];
  if(!sync?.lastRunAt)problems.push('NO_SYNC');
  const lastRunMs=sync?.lastRunAt?Date.parse(sync.lastRunAt):NaN;
  if(!Number.isFinite(lastRunMs))problems.push('INVALID_SYNC_TIMESTAMP');
  else if(Date.now()-lastRunMs>MAX_AGE_MS)problems.push('MISSED_SYNC');
  if(sync?.overall==='error')problems.push('SYNC_ERROR');
  if(sync?.memberStatus==='error')problems.push('MEMBER_SYNC_ERROR');
  if(Number(sync?.membersSeen||0)<=0)problems.push('NO_MEMBERS');
  if(Number(sync?.memberErrors||0)>0)problems.push('MEMBER_ERRORS');
  if(sync?.rankingStatus==='unavailable')problems.push('RANKING_UNAVAILABLE');
  if(sync?.rankingCacheError)problems.push('RANKING_CACHE');

  if(!http){
    problems.push('HTTP_MONITOR_PENDING');
  }else{
    const httpAt=Date.parse(http.created||http.finishedAt||'');
    if(!Number.isFinite(httpAt)||Date.now()-httpAt>HTTP_MONITOR_MAX_AGE_MS)problems.push('HTTP_MONITOR_STALE');
    if(Number(http.statusCode)>=400||http.timedOut||http.errorMsg)problems.push('HTTP_REQUEST_FAILURE');
  }
  return problems;
}

function alertDescription({sync,health,http,problems}){
  const syncAgeMs=sync?.lastRunAt?Math.max(0,Date.now()-Date.parse(sync.lastRunAt)):null;
  const httpAgeMs=http?.created?Math.max(0,Date.now()-Date.parse(http.created)):null;
  return [
    '**CHAOS Tracker sync health alert**',
    '',
    'Problems: **'+problems.join(', ')+'**',
    'Last sync: '+(sync?.lastRunAt||'never'),
    'Sync age: '+(syncAgeMs===null?'unknown':Math.floor(syncAgeMs/1000)+'s'),
    'Members: '+Number(sync?.membersSeen||0),
    'Member status: '+String(sync?.memberStatus||health?.lastMemberStatus||'unknown'),
    'Ranking status: '+String(sync?.rankingStatus||health?.lastRankingStatus||'unknown'),
    'HTTP status: '+(http?.statusCode??'unknown'),
    'HTTP age: '+(httpAgeMs===null?'unknown':Math.floor(httpAgeMs/1000)+'s'),
    http?.errorMsg?'HTTP error: '+http.errorMsg:null,
    sync?.error?'Sync error: '+sync.error:null,
    health?.lastError?'Last sync error: '+health.lastError:null
  ].filter(Boolean).join('\n');
}

async function sendDiscord({title,description,color=0xffc857}){
  const webhook=process.env.DISCORD_WEBHOOK_URL;
  if(!webhook)return{sent:false,reason:'DISCORD_WEBHOOK_URL is not configured.'};
  const response=await fetch(webhook,{
    method:'POST',
    headers:{'Content-Type':'application/json'},
    body:JSON.stringify({
      username:'CHAOS Tracker - Bot',
      embeds:[{title,description,color,footer:{text:'CHAOS Tracker · Sync Health'}}]
    }),
    cache:'no-store'
  });
  if(!response.ok)return{sent:false,reason:'Discord webhook returned '+response.status+'.'};
  return{sent:true};
}

export async function GET(request){
  const denied=requireRequiredCronSecret(request,'/api/monitor-health');
  if(denied)return denied;
  try{
    const [sync,health,http]=await Promise.all([readSyncStatus(),readSyncHealth(),readMonitorHttpHealth()]);
    const problems=problemState(sync,health,http);
    const healthy=problems.length===0;
    const alertKey=healthy?null:JSON.stringify({
      problems,
      syncError:String(sync?.error||''),
      rankingCacheError:String(sync?.rankingCacheError||''),
      httpStatus:Number(http?.statusCode||0),
      httpError:String(http?.errorMsg||'')
    });
    let alertSent=false;
    let alertError=null;
    let recovered=false;

    if(!healthy&&alertKey!==health?.lastAlertKey){
      const result=await sendDiscord({
        title:'🔴 CHAOS Tracker Sync Alert',
        description:alertDescription({sync,health,http,problems}),
        color:0xff6b6b
      });
      if(result.sent){
        alertSent=true;
        await updateSyncHealthAlert({alertKey});
      }else{
        alertError=result.reason;
      }
    }else if(healthy&&health?.lastAlertKey){
      const result=await sendDiscord({
        title:'🟢 CHAOS Tracker Sync Recovered',
        description:'Sync health recovered. Last healthy run: '+(health.lastHealthyAt||sync?.lastRunAt||'unknown')+'; consecutive successful runs: '+Number(health.consecutiveSuccesses||0)+'.',
        color:0x7ef29a
      });
      if(result.sent){
        recovered=true;
        alertSent=true;
        await updateSyncHealthAlert({alertKey:null});
      }else{
        alertError=result.reason;
      }
    }

    return Response.json({
      ok:true,
      healthy,
      problems,
      alertSent,
      recovered,
      alertError,
      webhookConfigured:Boolean(process.env.DISCORD_WEBHOOK_URL),
      checkedAt:new Date().toISOString(),
      sync,
      syncHealth:health||null,
      httpHealth:http||null
    },{headers:{'Cache-Control':'no-store, max-age=0'}});
  }catch(error){
    return Response.json({
      ok:false,
      healthy:false,
      problems:['HEALTH_CHECK_ERROR'],
      error:error instanceof Error?error.message:String(error),
      checkedAt:new Date().toISOString()
    },{status:503,headers:{'Cache-Control':'no-store, max-age=0'}});
  }
}
