import { supabaseAdmin } from './supabase-admin.js';

export const SYNC_HEALTH_KEY = 'sync-health:latest';

export async function readSyncHealth(){
  const db=supabaseAdmin();
  const {data,error}=await db.from('rep_tracker_kv')
    .select('value')
    .eq('key',SYNC_HEALTH_KEY)
    .maybeSingle();
  if(error)throw error;
  return data?.value&&typeof data.value==='object'?data.value:null;
}

export async function recordSyncHealth({
  outcome='success',
  at=new Date().toISOString(),
  error=null,
  memberStatus='unknown',
  memberSource=null,
  discoveryStatus='unknown',
  rankingStatus='unknown',
  durationMs=null
}={}){
  const db=supabaseAdmin();
  const previous=await readSyncHealth();
  const isHealthy=outcome==='success';
  const next={
    version:2,
    lastRunAt:at,
    lastHealthyAt:isHealthy?at:(previous?.lastHealthyAt||null),
    lastErrorAt:outcome==='error'?at:(previous?.lastErrorAt||null),
    lastError:outcome==='error'?String(error||'Sync failed.'):(previous?.lastError||null),
    lastMemberSuccessAt:memberStatus==='success'?at:(previous?.lastMemberSuccessAt||null),
    lastRankingFreshAt:rankingStatus==='fresh'?at:(previous?.lastRankingFreshAt||null),
    lastMemberSource:memberSource||previous?.lastMemberSource||null,
    lastMemberStatus:memberStatus,
    lastDiscoveryStatus:discoveryStatus,
    lastRankingStatus:rankingStatus,
    lastDurationMs:Number.isFinite(Number(durationMs))?Number(durationMs):(previous?.lastDurationMs||null),
    consecutiveSuccesses:isHealthy?Number(previous?.consecutiveSuccesses||0)+1:0,
    consecutiveFailures:outcome==='error'?Number(previous?.consecutiveFailures||0)+1:0,
    consecutiveWarnings:outcome==='warning'?Number(previous?.consecutiveWarnings||0)+1:0,
    updatedAt:at,
    lastAlertKey:previous?.lastAlertKey||null,
    lastAlertAt:previous?.lastAlertAt||null
  };
  const {error:writeError}=await db.from('rep_tracker_kv').upsert({
    key:SYNC_HEALTH_KEY,
    value:next,
    updated_at:at
  },{onConflict:'key'});
  if(writeError)throw writeError;
  return next;
}

export async function readMonitorHttpHealth(){
  const db=supabaseAdmin();
  const {data,error}=await db.from('rep_tracker_kv')
    .select('value')
    .eq('key','monitor:http-latest')
    .maybeSingle();
  if(error)throw error;
  return data?.value&&typeof data.value==='object'?data.value:null;
}

export async function updateSyncHealthAlert({alertKey,alertAt=new Date().toISOString()}={}){
  const db=supabaseAdmin();
  const previous=await readSyncHealth()||{version:2};
  const next={...previous,lastAlertKey:alertKey||null,lastAlertAt:alertAt,updatedAt:alertAt};
  const {error}=await db.from('rep_tracker_kv').upsert({
    key:SYNC_HEALTH_KEY,
    value:next,
    updated_at:alertAt
  },{onConflict:'key'});
  if(error)throw error;
  return next;
}
