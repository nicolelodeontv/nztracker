import { supabaseAdmin } from './supabase-admin.js';
import { formatError } from './error-format.mjs';

export const SYNC_HEALTH_KEY = 'sync-health:latest';

function sourceStatus(value){
  return String(value??'').trim().toLowerCase();
}

function sourceFailed(value){
  return ['error','timeout','failed','down'].includes(sourceStatus(value));
}

export function getSyncHealthAlertState({health={},stats={}}={}){
  const rate=Number(stats.syncSuccessRate);
  const degraded=sourceStatus(health.lastSourceHealth)==='degraded';
  const sourceDown=sourceStatus(health.lastSourceHealth)==='down';
  const memberStatus=sourceStatus(health.lastMemberStatus);
  const lastMemberSource=sourceStatus(health.lastMemberSource);
  const amfStatus=sourceStatus(health.sourceDiagnostics?.amf?.status);
  const legacyStatus=sourceStatus(health.sourceDiagnostics?.legacy?.status);
  const amfFailed=sourceFailed(amfStatus) || (degraded && lastMemberSource==='legacy');
  const legacyHealthy=legacyStatus==='success' || (lastMemberSource==='legacy' && Boolean(health.lastLegacySuccessAt));
  const amfOnlyFallback=degraded && lastMemberSource==='legacy' && amfFailed && legacyHealthy;
  const legacyFailed=sourceDown || sourceFailed(legacyStatus) || (memberStatus==='error' && !amfOnlyFallback);
  const lowRate=Number.isFinite(rate)&&rate<0.7;
  const urgent=legacyFailed;
  const quietFallback=amfOnlyFallback && !urgent;
  const quietRate=lowRate && !urgent && !quietFallback;
  return{
    visible:urgent||quietFallback||quietRate,
    urgent,
    quietFallback,
    quietRate,
    degraded,
    legacyFailed,
    lowRate,
    rateText:Number.isFinite(rate)?Math.round(rate*100)+'%':'—'
  };
}

export function buildSyncHealthSnapshot({
  previous=null,
  outcome='success',
  at=new Date().toISOString(),
  error=null,
  memberStatus='unknown',
  memberSource=null,
  sourceHealth='healthy',
  sourceWarning=null,
  sourceDiagnostics=null,
  discoveryStatus='unknown',
  rankingStatus='unknown',
  durationMs=null
}={}){
  const prev=previous||{};
  const isHealthy=outcome==='success';
  const isSourceDegraded=sourceHealth==='degraded';
  const isFailure=outcome==='error'||outcome==='warning'||isSourceDegraded;
  const failureMessage=isFailure
    ? formatError((outcome==='error'||outcome==='warning' ? error : null)||sourceWarning||error,'Sync failure detected.')
    : formatError(prev.lastFailure,'');
  return{
    version:4,
    lastRunAt:at,
    lastHealthyAt:isHealthy?at:(prev.lastHealthyAt||null),
    lastFailureAt:isFailure?at:(prev.lastFailureAt||null),
    lastFailure:failureMessage,
    lastErrorAt:outcome==='error'?at:(prev.lastErrorAt||null),
    lastError:outcome==='error'?formatError(error,'Sync failed.'):null,
    lastMemberSuccessAt:memberStatus==='success'?at:(prev.lastMemberSuccessAt||null),
    lastRankingFreshAt:rankingStatus==='fresh'?at:(prev.lastRankingFreshAt||null),
    lastMemberSource:memberSource||prev.lastMemberSource||null,
    lastAmfSuccessAt:memberSource==='amf'?at:(prev.lastAmfSuccessAt||null),
    lastLegacySuccessAt:memberSource==='legacy'?at:(prev.lastLegacySuccessAt||null),
    lastMemberStatus:memberStatus,
    lastSourceHealth:sourceHealth||prev.lastSourceHealth||'healthy',
    lastSourceWarning:isSourceDegraded?formatError(sourceWarning,'Member source fallback is active.'):null,
    sourceDiagnostics:sourceDiagnostics||prev.sourceDiagnostics||null,
    lastDiscoveryStatus:discoveryStatus,
    lastRankingStatus:rankingStatus,
    lastDurationMs:Number.isFinite(Number(durationMs))?Number(durationMs):(prev.lastDurationMs||null),
    consecutiveSuccesses:isHealthy?Number(prev.consecutiveSuccesses||0)+1:0,
    consecutiveFailures:outcome==='error'?Number(prev.consecutiveFailures||0)+1:0,
    consecutiveWarnings:outcome==='warning'?Number(prev.consecutiveWarnings||0)+1:0,
    consecutiveSourceWarnings:isSourceDegraded?Number(prev.consecutiveSourceWarnings||0)+1:0,
    updatedAt:at,
    lastAlertKey:prev.lastAlertKey||null,
    lastAlertAt:prev.lastAlertAt||null
  };
}

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
  sourceHealth='healthy',
  sourceWarning=null,
  sourceDiagnostics=null,
  discoveryStatus='unknown',
  rankingStatus='unknown',
  durationMs=null
}={}){
  const db=supabaseAdmin();
  const previous=await readSyncHealth();
  const next=buildSyncHealthSnapshot({
    previous,
    outcome,
    at,
    error,
    memberStatus,
    memberSource,
    sourceHealth,
    sourceWarning,
    sourceDiagnostics,
    discoveryStatus,
    rankingStatus,
    durationMs
  });
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
