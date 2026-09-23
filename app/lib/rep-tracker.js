import { supabaseAdmin } from './supabase-admin';
import { discoverChaos, fetchLiveMembers } from './ninja-source.mjs';
import { DISCOVERY_CACHE_KEY, DISCOVERY_MAX_AGE_MS, DISCOVERY_RETRY_COOLDOWN_MS, readDiscoveryCache, writeDiscoveryCache, writeLastKnownMembers } from './sync-source-state.mjs';
import { startOfTodayManila } from './dashboard-time.mjs';
import { buildRecentActivityEvents } from './rep-tracker-utils.mjs';
import { buildDailyClanRepTrend, globalRankSummary, readRankingHistory, readRankingSnapshot, recordRankingSnapshot } from './ranking-cache.js';
import { recordMemberSnapshot } from './member-history.js';
import { applyRankChanges, sortMembersByRank } from './rank-tracker.mjs';
import { readSyncHealth, recordSyncHealth } from './sync-health.mjs';
import { calculateBleedingState, serverReportedStamina } from './stamina-tracker.mjs';

const FRESH_MS=90000,AGING_MS=180000,SYNC_RUN_REUSE_GUARD_MS=10000,SYNC_RUN_RETENTION_KEY='retention:sync-runs:last-run',SYNC_RUN_RETENTION_INTERVAL_MS=60*60*1000,syncLocks=new Map();
const nowIso=()=>new Date().toISOString();
const safeText=(value)=>String(value??'').trim();
const asInt=(value,fallback=0)=>Number.isFinite(Number(value))?Math.trunc(Number(value)):fallback;
const isStaminaSchemaError=(error)=>{
  const code=String(error?.code||'');
  const message=String(error?.message||error||'').toLowerCase();
  return ['pgrst202','pgrst204','42703','42883'].includes(code)
    || message.includes('advance_rep_tracker_stamina')
    || message.includes('column')&&message.includes('stamina')
    || message.includes('rep_tracker_stamina_state')&&message.includes('relation');
};
export function freshness(iso){if(!iso)return{status:'offline',ageSeconds:null};const ageMs=Math.max(0,Date.now()-new Date(iso).getTime());return{status:ageMs<=FRESH_MS?'live':ageMs<=AGING_MS?'aging':'stale',ageSeconds:Math.floor(ageMs/1000)};}
export async function getConfig(){const db=supabaseAdmin();const{data,error}=await db.from('rep_tracker_config').select('*').eq('id','main').maybeSingle();if(error)throw error;return data||null;}
async function ensureSeason(config,season,clanId,startedAt=nowIso()){const db=supabaseAdmin();const{data:existing}=await db.from('rep_tracker_seasons').select('*').eq('season',season).maybeSingle();if(existing)return existing;const{data,error}=await db.from('rep_tracker_seasons').insert({season,clan_id:clanId,started_at:startedAt,status:'active'}).select('*').single();if(error)throw error;return data;}
async function updateConfig(values){const db=supabaseAdmin();const{data,error}=await db.from('rep_tracker_config').upsert({id:'main',...values,updated_at:nowIso()}).select('*').single();if(error)throw error;return data;}
async function audit(action,details={},admin='system'){try{await supabaseAdmin().from('rep_tracker_audit_log').insert({action,admin,details});}catch(error){console.warn('Audit write failed',error);}}
async function upsertMembers({clanId,season,members,capturedAt,staminaById=new Map()}) {
  const db=supabaseAdmin();
  const memberRows=members.filter((m)=>m.id).map((m)=>({
    clan_id:clanId,
    member_id:m.id,
    current_ign:m.name,
    current_level:asInt(m.level),
    last_seen_at:capturedAt,
    updated_at:capturedAt
  }));
  if(!memberRows.length)return;
  const ids=memberRows.map((row)=>row.member_id);
  const latestColumns='member_id,rep,last_point_at,rank,stamina,max_stamina';
  const [{data:existingRows,error:existingError},{data:latestRows,error:latestError}]=await Promise.all([
    db.from('rep_tracker_members').select('*').eq('clan_id',clanId).in('member_id',ids),
    db.from('rep_tracker_member_latest').select(latestColumns).eq('clan_id',clanId).eq('season',season).in('member_id',ids)
  ]);
  if(existingError)throw existingError;
  if(latestError)throw latestError;
  const existing=new Map((existingRows||[]).map((r)=>[String(r.member_id),r]));
  const latest=new Map((latestRows||[]).map((r)=>[String(r.member_id),r]));
  const previousRanks=new Map((latestRows||[]).map((r)=>[String(r.member_id),r.rank]));
  const rankedMembers=applyRankChanges(members,previousRanks);
  const rankedById=new Map(rankedMembers.map((member)=>[String(member.id),member]));
  const eventRows=[];
  const latestUpserts=[];
  for(const [,row] of memberRows.entries()){
    const member=members.find((m)=>String(m.id)===String(row.member_id))||{};
    const rankState=rankedById.get(String(row.member_id));
    const prev=existing.get(String(row.member_id));
    if(prev&&prev.current_ign!==row.current_ign)eventRows.push({
      clan_id:clanId,season,member_id:row.member_id,event_type:'renamed',
      previous_data:{ign:prev.current_ign,level:prev.current_level},
      current_data:{ign:row.current_ign,level:row.current_level},occurred_at:capturedAt
    });
    else if(!prev)eventRows.push({
      clan_id:clanId,season,member_id:row.member_id,event_type:'joined',
      previous_data:null,current_data:{ign:row.current_ign,level:row.current_level},occurred_at:capturedAt
    });
    const previousLatest=latest.get(String(row.member_id));
    latestUpserts.push({
      clan_id:clanId,season,member_id:row.member_id,member_name:row.current_ign,
      level:asInt(row.current_level),rep:asInt(member.reputation),
      rank:rankState?.rank??null,
      previous_rank:rankState?.previousRank??null,
      ...(staminaById.size?{
        stamina:staminaById.get(String(row.member_id))?.stamina??null,
        max_stamina:staminaById.get(String(row.member_id))?.maxStamina??null
      }:{}),
      last_point_at:previousLatest&&Number(previousLatest.rep)===asInt(member.reputation)?previousLatest.last_point_at:capturedAt,
      last_seen_at:capturedAt
    });
  }
  if(eventRows.length){
    const {error}=await db.from('rep_tracker_member_events').insert(eventRows);
    if(error)throw error;
  }
  const {error}=await db.from('rep_tracker_members').upsert(
    memberRows.map((row)=>({...row,...(existing.has(String(row.member_id))?{}:{first_seen_at:capturedAt,created_at:capturedAt})})),
    {onConflict:'clan_id,member_id'}
  );
  if(error)throw error;
  const {error:latestUpsertError}=await db.from('rep_tracker_member_latest').upsert(latestUpserts,{onConflict:'clan_id,season,member_id'});
  if(latestUpsertError)throw latestUpsertError;
}
async function runSyncRunRetention(db,nowMs){
  try{
    const {data:guard,error:guardError}=await db.from('rep_tracker_kv').select('value,updated_at').eq('key',SYNC_RUN_RETENTION_KEY).maybeSingle();
    if(guardError)throw guardError;
    const lastRunMs=guard?.value?.ranAt?Date.parse(guard.value.ranAt):Date.parse(guard?.updated_at||'');
    if(Number.isFinite(lastRunMs)&&nowMs-lastRunMs<SYNC_RUN_RETENTION_INTERVAL_MS)return{deleted:0,skipped:true};
    const cutoff=new Date(nowMs-90*24*60*60*1000).toISOString();
    const {count,error:deleteError}=await db.from('rep_tracker_sync_runs').delete({count:'exact'}).lt('started_at',cutoff);
    if(deleteError)throw deleteError;
    const ranAt=new Date(nowMs).toISOString();
    const {error:kvError}=await db.from('rep_tracker_kv').upsert({key:SYNC_RUN_RETENTION_KEY,value:{ranAt},updated_at:ranAt},{onConflict:'key'});
    if(kvError)throw kvError;
    return{deleted:Number(count||0),skipped:false};
  }catch(error){
    console.warn('Sync run retention failed',error);
    return{deleted:0,skipped:false,error:error instanceof Error?error.message:String(error)};
  }
}

async function firstTodaySnapshotMap(db,clanId,season,sinceIso,memberCount){
  const firstByMember=new Map();
  if(!memberCount)return firstByMember;
  const pageSize=1000;
  for(let offset=0;;offset+=pageSize){
    const {data,error}=await db.from('rep_tracker_snapshots')
      .select('member_id,reputation,captured_at')
      .eq('clan_id',clanId).eq('season',season)
      .gte('captured_at',sinceIso)
      .order('captured_at',{ascending:true})
      .range(offset,offset+pageSize-1);
    if(error)throw error;
    for(const row of data||[]){
      const id=String(row.member_id);
      if(!firstByMember.has(id))firstByMember.set(id,Number(row.reputation||0));
    }
    if(firstByMember.size>=memberCount||!data||data.length<pageSize)break;
  }
  return firstByMember;
}

async function previousSnapshotMap(clanId,season,memberIds,capturedAt){if(!memberIds.length)return new Map();const db=supabaseAdmin();const before=new Date(new Date(capturedAt).getTime()-1000).toISOString();const{data,error}=await db.from('rep_tracker_snapshots').select('member_id,ign,level,reputation,stamina,max_stamina,source,captured_at').eq('clan_id',clanId).eq('season',season).in('member_id',memberIds).lt('captured_at',before).order('captured_at',{ascending:false}).limit(memberIds.length*2);if(error)throw error;const out=new Map();for(const row of data||[])if(!out.has(String(row.member_id)))out.set(String(row.member_id),row);return out;}
function snapshotMetricsEqual(a,b){
  return String(a?.ign || '') === String(b?.ign || '')
    && Number(a?.level || 0) === Number(b?.level || 0)
    && Number(a?.reputation || 0) === Number(b?.reputation || 0)
    && (a?.stamina == null ? null : Number(a.stamina)) === (b?.stamina == null ? null : Number(b.stamina))
    && (a?.max_stamina == null ? null : Number(a.max_stamina)) === (b?.max_stamina == null ? null : Number(b.max_stamina))
    && String(a?.source || '') === String(b?.source || '');
}

export async function syncTracker({force=false,admin='system'}={}) {
  const lockKey='main';
  if(syncLocks.has(lockKey))return syncLocks.get(lockKey);
  const task=(async()=>{
    const started=Date.now();
    const db=supabaseAdmin();
    let config=await getConfig();

    if(!force&&config?.clan_id&&config?.current_season){
      const last=await db.from('rep_tracker_sync_runs')
        .select('completed_at,status,members_returned,details')
        .eq('clan_id',config.clan_id)
        .order('completed_at',{ascending:false})
        .limit(1)
        .maybeSingle();
      const lastCompleted=last.data?.completed_at?Date.parse(last.data.completed_at):0;
      if(lastCompleted&&Date.now()-lastCompleted<SYNC_RUN_REUSE_GUARD_MS){
        return {
          reused:true,
          config,
          season:config.current_season||null,
          membersSeen:Number(last.data?.members_returned||0),
          lastCompleted:last.data?.completed_at||null,
          lastDetails:last.data?.details||null
        };
      }
    }

    let discovery=null;
    let discoveryError=null;
    const cachedDiscovery=await readDiscoveryCache().catch((error)=>{
      console.warn('Discovery cache read failed',error);
      return null;
    });
    const cachedFetchedAt=Date.parse(cachedDiscovery?.fetchedAt||'');
    const cachedAge=Number.isFinite(cachedFetchedAt)?Math.max(0,Date.now()-cachedFetchedAt):Infinity;
    const lastAttemptAt=Date.parse(cachedDiscovery?.lastAttemptAt||'');
    const canRefresh=!Number.isFinite(lastAttemptAt)||Date.now()-lastAttemptAt>=DISCOVERY_RETRY_COOLDOWN_MS;
    const needsRefresh=!cachedDiscovery||cachedAge>DISCOVERY_MAX_AGE_MS;

    if(needsRefresh&&canRefresh){
      try{
        const fresh=await discoverChaos();
        discovery={...fresh,stale:false,fromCache:false};
        await writeDiscoveryCache({
          ...fresh,
          fetchedAt:fresh.capturedAt,
          lastAttemptAt:fresh.capturedAt,
          lastError:null
        }).catch((error)=>console.warn('Discovery cache write failed',error));
        if(fresh.ranking?.rows?.length){
          await recordRankingSnapshot({
            ...fresh.ranking,
            season:fresh.currentSeason||fresh.ranking.season||null,
            fetchedAt:fresh.capturedAt
          }).catch((error)=>console.warn('Ranking history write failed',error));
        }
        config=await updateConfig({
          clan_id:fresh.clanId,
          clan_name:fresh.clanName,
          current_season:fresh.currentSeason||config?.current_season||null,
          final_day_at:fresh.finalDayAt||config?.final_day_at||null,
          expected_member_count:fresh.expectedMemberCount||config?.expected_member_count||null
        });
      }catch(error){
        discoveryError=error instanceof Error?error.message:String(error);
        await writeDiscoveryCache({
          ...(cachedDiscovery||{}),
          fetchedAt:cachedDiscovery?.fetchedAt||null,
          lastAttemptAt:new Date().toISOString(),
          lastError:discoveryError
        }).catch((cacheError)=>console.warn('Discovery failure cache write failed',cacheError));
        if(cachedDiscovery){
          discovery={...cachedDiscovery,stale:true,fromCache:true,discoveryError};
        }else if(config?.clan_id&&config?.current_season){
          discovery={
            clanId:String(config.clan_id),
            clanName:config.clan_name||null,
            currentSeason:config.current_season,
            finalDayAt:config.final_day_at||null,
            expectedMemberCount:config.expected_member_count||null,
            ranking:null,
            stale:true,
            fromCache:false,
            discoveryError
          };
        }else{
          await audit('Sync discovery failed',{message:discoveryError},admin);
          throw new Error('Clan discovery failed: '+discoveryError);
        }
      }
    }else if(cachedDiscovery){
      discovery={...cachedDiscovery,stale:cachedAge>DISCOVERY_MAX_AGE_MS,fromCache:true};
    }else if(config?.clan_id&&config?.current_season){
      discovery={
        clanId:String(config.clan_id),
        clanName:config.clan_name||null,
        currentSeason:config.current_season,
        finalDayAt:config.final_day_at||null,
        expectedMemberCount:config.expected_member_count||null,
        ranking:null,
        stale:true,
        fromCache:false
      };
    }

    if(discovery?.clanId&&(!config?.clan_id||String(config.clan_id)!==String(discovery.clanId))){
      config=await updateConfig({
        clan_id:discovery.clanId,
        clan_name:discovery.clanName||config?.clan_name||'Chaos',
        current_season:discovery.currentSeason||config?.current_season||null,
        final_day_at:discovery.finalDayAt||config?.final_day_at||null,
        expected_member_count:discovery.expectedMemberCount||config?.expected_member_count||null
      });
    }

    const season=config.current_season||discovery?.currentSeason;
    if(!season)throw new Error('Live source did not expose a season and no season is configured.');
    await ensureSeason(config,season,config.clan_id,discovery?.capturedAt||nowIso());

    const run=await db.from('rep_tracker_sync_runs').insert({
      status:'failed',
      source:'Ninja Zenshin',
      season,
      clan_id:config.clan_id,
      started_at:new Date(started).toISOString()
    }).select('*').single();
    if(run.error)throw run.error;
    const runId=run.data?.id;

    try{
      const live=await fetchLiveMembers(config.clan_id);
      const capturedAt=live.fetchedAt||nowIso();
      const expected=Number(config.expected_member_count||discovery?.expectedMemberCount||0);
      const returned=live.members.length;
      const memberIds=live.members.map((m)=>String(m.id)).filter(Boolean);
      if(!memberIds.length)throw new Error('Live source returned members without stable member IDs.');
      if(expected>0&&returned<expected)throw new Error('Incomplete live roster: '+returned+' returned, '+expected+' expected.');

      const previous=await previousSnapshotMap(config.clan_id,season,memberIds,capturedAt);
      const staminaById=new Map(
        live.members.map((member)=>[String(member.id),serverReportedStamina(member)])
      );
      const staminaKnownMembers=[...staminaById.values()].filter(Boolean).length;
      const staminaSource=staminaKnownMembers===returned&&returned>0
        ? 'server-reported'
        : staminaKnownMembers>0
          ? 'partial'
          : 'unavailable';
      const previousRun=await db.from('rep_tracker_sync_runs')
        .select('members_returned')
        .eq('clan_id',config.clan_id)
        .eq('season',season)
        .eq('status','success')
        .order('completed_at',{ascending:false})
        .limit(1)
        .maybeSingle();
      const previousCount=Number(previousRun.data?.members_returned||0);

      const rosterChange=previousCount>0&&previousCount!==returned
        ? 'Roster count changed from '+previousCount+' to '+returned+'.'
        : null;

      const snapshotRows=live.members.map((member)=>{
        const prev=previous.get(String(member.id));
        const previousRep=prev?Number(prev.reputation):null;
        const currentRep=asInt(member.reputation);
        const repDecrease=previousRep!==null&&currentRep<previousRep;
        const jumpThreshold=Math.max(100000,Math.floor(Math.max(previousRep||0,1)*0.25));
        const largeRepJump=previousRep!==null&&currentRep-previousRep>jumpThreshold;
        const reasons=[];
        if(repDecrease)reasons.push('REP decreased from '+previousRep+' to '+currentRep+'.');
        if(largeRepJump)reasons.push('REP jumped by '+(currentRep-previousRep)+' in one sync.');
        return{
          clan_id:config.clan_id,
          season,
          member_id:String(member.id),
          ign:member.name,
          level:asInt(member.level),
          reputation:currentRep,
          stamina:staminaById.get(String(member.id))?.stamina??null,
          max_stamina:staminaById.get(String(member.id))?.maxStamina??null,
          source:live.service==='legacy-live'?'Ninja Zenshin public member endpoint':'Ninja Zenshin AMF',
          captured_at:capturedAt,
          suspicious:reasons.length>0,
          suspicious_reason:reasons.length?reasons.join(' '):null,
          raw_data:member
        };
      });

      const changedSnapshotRows=snapshotRows.filter((row)=>{
        const previousRow=previous.get(String(row.member_id));
        return !previousRow||!snapshotMetricsEqual(row,previousRow);
      });
      if(changedSnapshotRows.length){
        const{error:insertError}=await db.from('rep_tracker_snapshots').upsert(changedSnapshotRows,{onConflict:'clan_id,season,member_id,captured_at'});
        if(insertError)throw insertError;
      }

      const memberHistory=await recordMemberSnapshot({
        clanId:config.clan_id,
        season,
        members:live.members,
        capturedAt
      });

      await upsertMembers({clanId:config.clan_id,season,members:live.members,capturedAt,staminaById});

      const durationMs=Date.now()-started;
      const details={
        service:live.service,
        source:live.source,
        memberStatus:'success',
        memberSource:live.service==='legacy-live'?'legacy':'amf',
        discoveryStatus:discoveryError?'stale':'fresh',
        discoveryCached:Boolean(discovery?.fromCache),
        discoveryError:discoveryError||null,
        rankingStatus:Array.isArray(discovery?.ranking?.rows)&&discovery.ranking.rows.length
          ? (discovery?.stale?'cached-stale':'fresh')
          : 'unavailable',
        sourceHealth:live.sourceHealth||'healthy',
        fallbackReason:live.fallbackReason||null,
        sourceDiagnostics:live.sourceDiagnostics||null,
        rosterChange,
        suspiciousCount:snapshotRows.filter((row)=>row.suspicious).length,
        historyStoredPoints:Number(memberHistory?.storedPoints||0),
        staminaTracking:staminaSource,
        staminaTrackingError:null,
        staminaTrackedMembers:staminaKnownMembers,
        staminaDrainedEvents:0,
        staminaRecovered:0,
        staminaKnownMembers,
        staminaSource
      };

      await db.from('rep_tracker_sync_runs').update({
        status:'success',
        members_returned:returned,
        members_expected:expected||null,
        completed_at:capturedAt,
        details,
        error_message:null,
        duration_ms:durationMs
      }).eq('id',runId);

      await runSyncRunRetention(db,Date.now());
      await recordSyncHealth({
        outcome:discoveryError?'warning':'success',
        at:capturedAt,
        error:discoveryError||null,
        memberStatus:'success',
        memberSource:live.service==='legacy-live'?'legacy':'amf',
        sourceHealth:live.sourceHealth||'healthy',
        sourceWarning:live.fallbackReason||null,
        sourceDiagnostics:live.sourceDiagnostics||null,
        discoveryStatus:discoveryError?'stale':'fresh',
        rankingStatus:details.rankingStatus,
        durationMs,
        staminaSource,
        staminaKnownMembers
      });

      await writeLastKnownMembers({
        clanId:config.clan_id,
        members:live.members,
        fetchedAt:capturedAt,
        source:live.source,
        service:live.service
      }).catch((error)=>console.warn('Durable member cache write failed',error));

      await audit('Live sync completed',{
        clanId:config.clan_id,
        season,
        returned,
        expected,
        service:live.service,
        discoveryCached:Boolean(discovery?.fromCache),
        discoveryError:discoveryError||null,
        suspiciousCount:details.suspiciousCount
      },admin);

      return{
        reused:false,
        live,
        config,
        season,
        discovery,
        discoveryError,
        memberHistory,
        memberStatus:'success',
        rankingStatus:details.rankingStatus,
        discoveryStatus:discoveryError?'stale':'fresh',
        suspiciousCount:details.suspiciousCount,
        rosterChange,
        staminaTracking:staminaResult.available?'calculated':'unavailable',
        staminaTrackingError:staminaResult.error||null,
        staminaTrackedMembers:staminaStates.length,
        sourceHealth:live.sourceHealth||'healthy',
        sourceDiagnostics:live.sourceDiagnostics||null,
        fallbackReason:live.fallbackReason||null,
        durationMs
      };
    }catch(error){
      const durationMs=Date.now()-started;
      await db.from('rep_tracker_sync_runs').update({
        status:'failed',
        completed_at:nowIso(),
        error_message:error instanceof Error?error.message:String(error),
        duration_ms:durationMs
      }).eq('id',runId);
      await runSyncRunRetention(db,Date.now());
      await recordSyncHealth({
        outcome:'error',
        at:nowIso(),
        error:error instanceof Error?error.message:String(error),
        memberStatus:'error',
        memberSource:null,
        sourceHealth:'down',
        sourceWarning:null,
        sourceDiagnostics:error?.sourceDiagnostics||null,
        discoveryStatus:discoveryError?'stale':'fresh',
        rankingStatus:Array.isArray(discovery?.ranking?.rows)&&discovery.ranking.rows.length?'cached':'unavailable',
        durationMs
      }).catch(()=>{});
      throw error;
    }
  })();
  syncLocks.set(lockKey,task);
  try{return await task;}finally{syncLocks.delete(lockKey);}
}

async function firstTodayMemberPointMap(db,clanId,season,sinceIso,memberCount){
  const firstByMember=new Map();
  if(!memberCount)return firstByMember;
  const pageSize=500;
  for(let offset=0;;offset+=pageSize){
    const {data,error}=await db.from('rep_tracker_member_points')
      .select('member_id,rep,captured_at')
      .eq('clan_id',clanId)
      .eq('season',season)
      .gte('captured_at',sinceIso)
      .order('captured_at',{ascending:true})
      .range(offset,offset+pageSize-1);
    if(error)throw error;
    for(const row of data||[]){
      const id=String(row.member_id);
      if(!firstByMember.has(id))firstByMember.set(id,Number(row.rep||0));
    }
    if(firstByMember.size>=memberCount||!data||data.length<pageSize)break;
  }
  return firstByMember;
}

async function latestMembers(clanId,season){
  const db=supabaseAdmin();
  const full=await db.from('rep_tracker_member_latest')
    .select('member_id,member_name,level,rep,rank,previous_rank,stamina,max_stamina,last_point_at,last_seen_at')
    .eq('clan_id',clanId).eq('season',season)
    .order('member_name',{ascending:true});
  if(!full.error)return full.data||[];
  if(!isStaminaSchemaError(full.error))throw full.error;
  const fallback=await db.from('rep_tracker_member_latest')
    .select('member_id,member_name,level,rep,rank,previous_rank,last_point_at,last_seen_at')
    .eq('clan_id',clanId).eq('season',season)
    .order('member_name',{ascending:true});
  if(fallback.error)throw fallback.error;
  return (fallback.data||[]).map((row)=>({...row,stamina:null,max_stamina:null}));
}
export async function liveData(){
  const config=await getConfig();
  if(!config?.clan_id||!config?.current_season)return{configured:false,config:null};
  const db=supabaseAdmin(),season=config.current_season;
  const [members,kvResult]=await Promise.all([
    latestMembers(config.clan_id,season),
    db.from('rep_tracker_kv').select('key,value').in('key',['sync-status:latest','sync-health:latest','monitor:http-latest'])
  ]);
  if(kvResult.error)throw kvResult.error;
  const kv=new Map((kvResult.data||[]).map((row)=>[String(row.key),row.value&&typeof row.value==='object'?row.value:null]));
  const syncStatus=kv.get('sync-status:latest')||null;
  const syncHealth=kv.get('sync-health:latest')||null;
  const httpHealth=kv.get('monitor:http-latest')||null;
  const staminaSourceReady=String(syncHealth?.lastStaminaSource||'')==='server-reported'
    && Number(syncHealth?.lastStaminaKnownMembers||0)>=members.length
    && members.length>0;
  const freshnessState=freshness(syncHealth?.lastMemberSuccessAt||syncStatus?.lastRunAt||null);
  return{
    configured:true,
    season,
    config:{clan_id:config.clan_id,clan_name:config.clan_name,current_season:config.current_season,final_day_at:config.final_day_at,expected_member_count:config.expected_member_count},
    rows:members.map((row)=>({
      id:String(row.member_id),
      member:row.member_name,
      level:Number(row.level||0),
      rep:Number(row.rep||0),
      rank:Number(row.rank||0)||null,
      previousRank:Number(row.previous_rank||0)||null,
      rankDelta:row.previous_rank==null?null:Number(row.previous_rank)-Number(row.rank),
      stamina:staminaSourceReady&&row.stamina!=null?Number(row.stamina):null,
      maxStamina:staminaSourceReady&&row.max_stamina!=null?Number(row.max_stamina):null,
      staminaMode:staminaSourceReady&&row.stamina!=null?'SERVER_REPORTED':null,
      capturedAt:row.last_seen_at,
      lastPointAt:row.last_point_at
    })),
    freshness:freshnessState,
    lastSuccessfulSyncAt:syncHealth?.lastMemberSuccessAt||null,
    syncHealth:syncHealth||null,
    syncStatus:syncStatus||null,
    httpHealth:httpHealth||null,
    serverTime:new Date().toISOString()
  };
}
export async function dashboardData(){
  const config=await getConfig();
  if(!config?.clan_id||!config?.current_season)return{configured:false,config};
  const db=supabaseAdmin(),season=config.current_season;
  const [members,rankingCache,syncStatus,syncHealth,httpHealth,baselinesResult,hoursResult,syncRunsResult,syncSuccessCountResult,firstTodaySyncResult,clanRepHistoryResult]=await Promise.all([
    latestMembers(config.clan_id,season),
    readRankingSnapshot().catch(()=>null),
    db.from('rep_tracker_kv').select('value').eq('key','sync-status:latest').maybeSingle().then(({data})=>data?.value||null),
    readSyncHealth().catch(()=>null),
    db.from('rep_tracker_kv').select('value').eq('key','monitor:http-latest').maybeSingle().then(({data})=>data?.value||null),
    db.from('rep_tracker_baselines').select('*').eq('clan_id',config.clan_id).eq('season',season),
    db.from('rep_tracker_hours').select('member_id,total_hours').eq('clan_id',config.clan_id).eq('season',season),
    db.from('rep_tracker_sync_runs')
      .select('status,members_returned,started_at,completed_at,duration_ms,details,error_message')
      .eq('clan_id',config.clan_id)
      .eq('season',season)
      .gte('started_at',new Date(Date.now()-Math.max(1,Number(config.sync_interval_seconds||10))*1000*500).toISOString())
      .order('started_at',{ascending:false})
      .limit(180),
    db.from('rep_tracker_sync_runs')
      .select('id',{count:'exact',head:true})
      .eq('clan_id',config.clan_id)
      .eq('season',season)
      .eq('status','success')
      .gte('started_at',startOfTodayManila().toISOString()),
    db.from('rep_tracker_sync_runs')
      .select('started_at')
      .eq('clan_id',config.clan_id)
      .eq('season',season)
      .gte('started_at',startOfTodayManila().toISOString())
      .order('started_at',{ascending:true})
      .limit(1)
      .maybeSingle(),
    readRankingHistory({clanId:config.clan_id,season,hours:720,limit:5000}).catch((error)=>{
      console.warn('Clan REP trend history read failed',error);
      return [];
    })
  ]);
  if(baselinesResult.error)throw baselinesResult.error;
  if(hoursResult.error)throw hoursResult.error;
  if(syncRunsResult.error)throw syncRunsResult.error;
  if(syncSuccessCountResult.error)throw syncSuccessCountResult.error;
  if(firstTodaySyncResult.error)throw firstTodaySyncResult.error;

  const ids=members.map((r)=>String(r.member_id));
  const since=startOfTodayManila();
  const dayMap=await firstTodayMemberPointMap(db,config.clan_id,season,since.toISOString(),ids.length);
  const syncFresh=freshness(syncHealth?.lastMemberSuccessAt||syncHealth?.lastHealthyAt||syncStatus?.lastRunAt||null);
  const baselineMap=new Map((baselinesResult.data||[]).map((r)=>[String(r.member_id),r]));
  const staminaSourceReady=String(syncHealth?.lastStaminaSource||'')==='server-reported' && Number(syncHealth?.lastStaminaKnownMembers||0)>=members.length && members.length>0;
  const hoursMap=new Map();
  for(const row of hoursResult.data||[]){
    const id=String(row.member_id);
    hoursMap.set(id,(hoursMap.get(id)||0)+Number(row.total_hours||0));
  }

  const rows=members.map((row)=>{
    const baseline=baselineMap.get(String(row.member_id));
    const gain=baseline?Number(row.rep)-Number(baseline.baseline_rep):0;
    const today=dayMap.has(String(row.member_id))?Number(row.rep)-dayMap.get(String(row.member_id)):null;
    const hours=hoursMap.get(String(row.member_id))||0;
    return{
      id:String(row.member_id),
      member:row.member_name,
      level:Number(row.level||0),
      rep:Number(row.rep||0),
      baseline:baseline?.baseline_rep??null,
      gain,
      todayGain:today,
      hours,
      repPerHour:hours>0?gain/hours:0,
      source:'Ninja Zenshin live member monitor',
      rank:Number(row.rank||0)||null,
      previousRank:Number(row.previous_rank||0)||null,
      rankDelta:row.previous_rank==null?null:Number(row.previous_rank)-Number(row.rank),
      capturedAt:row.last_seen_at,
      suspicious:false,
      status:syncFresh.status,
      stamina:row.stamina==null?null:Number(row.stamina),
      maxStamina:row.max_stamina==null?null:Number(row.max_stamina),
      staminaMode:row.stamina==null?null:'CALCULATED'
    };
  });
  const trackedStaminaRows=rows
    .map((row)=>({memberId:String(row.id),stamina:row.stamina,maxStamina:row.maxStamina,serverReported:staminaSourceReady}))
    .filter((row)=>row.stamina!=null&&Number.isFinite(Number(row.stamina))&&row.serverReported);
  const staminaTrackingReady=staminaSourceReady&&rows.length>0&&trackedStaminaRows.length===rows.length;
  const staminaSummary=staminaTrackingReady
    ? {...calculateBleedingState(trackedStaminaRows),trackedMemberCount:trackedStaminaRows.length,trackingReady:true}
    : {
        bleeding:null,
        lowStaminaCount:trackedStaminaRows.filter((row)=>Number(row.stamina)<=70).length,
        memberCount:rows.length,
        trackedMemberCount:trackedStaminaRows.length,
        ratio:rows.length?trackedStaminaRows.length/rows.length:0,
        threshold:70,
        minimumRatio:0.5,
        mode:'SERVER_REPORTED_UNAVAILABLE',
        trackingReady:false
      };

  const orderedRows=sortMembersByRank(rows);

  const totalRep=rows.reduce((s,r)=>s+r.rep,0);
  const totalGain=rows.reduce((s,r)=>s+r.gain,0);
  const todayGain=rows.reduce((s,r)=>s+(Number.isFinite(Number(r.todayGain))?Number(r.todayGain):0),0);
  const todayGainAvailable=dayMap.size>0;
  const totalHours=rows.reduce((s,r)=>s+r.hours,0);
  const {count:suspiciousCount}=await db.from('rep_tracker_snapshots')
    .select('*',{count:'exact',head:true})
    .eq('clan_id',config.clan_id)
    .eq('season',season)
    .eq('suspicious',true);

  const globalRanking=rankingCache?.rows||[];
  const clanRepTrend=buildDailyClanRepTrend(clanRepHistoryResult||[]);
  const global=globalRankSummary(globalRanking,config.clan_id);
  const rankedRows=globalRanking.slice().sort((a,b)=>Number(a.rank||9999)-Number(b.rank||9999)).slice(0,10);
  const elapsedTodayHours=Math.max((Date.now()-since.getTime())/3600000,1/60);
  const hourlyPace=todayGain/elapsedTodayHours;
  const projectedDailyGain=hourlyPace*24;
  const targetGap=global?.above?.gap||0;
  const targetEtaHours=targetGap>0&&hourlyPace>0?targetGap/hourlyPace:null;

  const syncRuns=syncRunsResult.data||[];
  const successRuns=syncRuns.filter((run)=>run.status==='success');
  const errorRuns=syncRuns.filter((run)=>run.status!=='success');
  const expectedIntervalMs=Math.max(10,Number(config.sync_interval_seconds||10))*1000;
  const firstTodaySyncAt=firstTodaySyncResult.data?.started_at||null;
  const scheduleStartMs=firstTodaySyncAt?Date.parse(firstTodaySyncAt):since.getTime();
  const expectedSyncsToday=Math.max(1,Math.floor((Date.now()-scheduleStartMs)/expectedIntervalMs)+1);
  const completedSyncsToday=Number(syncSuccessCountResult.count||0);
  const missedSyncsToday=Math.max(0,expectedSyncsToday-completedSyncsToday);
  const syncSuccessRate=expectedSyncsToday>0?completedSyncsToday/expectedSyncsToday:0;
  const sourceCounts={amf:0,legacy:0,other:0};
  let rosterChangeCount=0,slowSyncCount=0;
  let durationTotal=0,durationCount=0;
  for(const run of successRuns){
    const service=String(run?.details?.memberSource||run?.details?.service||'').toLowerCase();
    if(service.includes('legacy'))sourceCounts.legacy+=1;
    else if(service.includes('amf'))sourceCounts.amf+=1;
    else sourceCounts.other+=1;
    if(run?.details?.rosterChange)rosterChangeCount+=1;
    if(Number(run.duration_ms)>5000)slowSyncCount+=1;
    if(Number.isFinite(Number(run.duration_ms))){durationTotal+=Number(run.duration_ms);durationCount+=1;}
  }

  return{
    configured:true,config,season,rows:orderedRows,
    stats:{
      totalRep,
      totalGain,
      todayGain,
      activeMembers:rows.length,
      totalHours,
      avgRepPerHour:totalHours?totalGain/totalHours:null,
      todayGainAvailable,
      expectedSyncIntervalMs:expectedIntervalMs,
      syncScheduleStartedAt:firstTodaySyncAt||since.toISOString(),
      suspiciousCount:suspiciousCount||0,
      syncsExpected:expectedSyncsToday,
      syncsCompleted:completedSyncsToday,
      syncsMissed:missedSyncsToday,
      syncSuccessRate,
      avgSyncDurationMs:durationCount?Math.round(durationTotal/durationCount):null,
      slowSyncs:slowSyncCount,
      rosterChanges:rosterChangeCount,
      sourceCounts
    },
    freshness:syncFresh,
    lastSuccessfulSyncAt:syncHealth?.lastMemberSuccessAt||syncHealth?.lastHealthyAt||null,
    syncHealth:syncHealth||null,
    syncStatus:syncStatus||null,
    httpHealth:httpHealth||null,
    clanRepTrend,
    global:{...global,projectedDailyGain,targetGap,targetEtaHours,capturedAt:rankingCache?.fetchedAt||null},
    staminaSummary,
    globalRanking:rankedRows.map((row)=>{
      const clanKey=String(row.clanId||row.clan||'');
      return{...row,change:rankingCache?.changes?.[clanKey]||null,previousTracked:(rankingCache?.previousRows||[]).some((previous)=>String(previous.clanId||previous.clan||'')===clanKey)};
    })
  };
}
export async function createBaseline(admin){const data=await dashboardData();if(!data.configured)throw new Error('Clan and season are not configured. Sync live data first.');const db=supabaseAdmin();const{data:existing}=await db.from('rep_tracker_baselines').select('member_id').eq('clan_id',data.config.clan_id).eq('season',data.season);if(existing?.length)throw new Error(`Season baseline already exists for ${existing.length} members.`);const capturedAt=nowIso(),rows=data.rows.map((row)=>({season:data.season,clan_id:data.config.clan_id,member_id:row.id,ign:row.member,level:row.level,baseline_rep:row.rep,captured_at:capturedAt}));const{error}=await db.from('rep_tracker_baselines').insert(rows);if(error)throw error;await db.from('rep_tracker_seasons').update({baseline_created_at:capturedAt}).eq('season',data.season);await audit('Created season baseline',{season:data.season,memberCount:rows.length},admin);return{season:data.season,count:rows.length,capturedAt};}
export async function addHours(payload,admin){const db=supabaseAdmin(),total=Number(payload.totalHours);if(!Number.isFinite(total)||total<0)throw new Error('Total hours must be a non-negative number.');const row={season:safeText(payload.season),clan_id:safeText(payload.clanId),member_id:safeText(payload.memberId),work_date:payload.workDate,start_time:payload.startTime||null,end_time:payload.endTime||null,break_minutes:Math.max(0,asInt(payload.breakMinutes)),total_hours:total,source:['MANUAL','ADMIN','IMPORT'].includes(payload.source)?payload.source:'MANUAL',notes:safeText(payload.notes)||null};if(!row.season||!row.clan_id||!row.member_id||!row.work_date)throw new Error('Season, clan, member, and date are required.');const{data,error}=await db.from('rep_tracker_hours').insert(row).select('*').single();if(error)throw error;await audit('Added hours session',{id:data.id,...row},admin);return data;}
export async function memberDetail(memberId,hours=168){
  const config=await getConfig();
  if(!config?.clan_id||!config?.current_season)return null;
  const db=supabaseAdmin();
  const since=new Date(Date.now()-Math.min(720,Math.max(1,Number(hours)||168))*3600000).toISOString();
  const [memberResult,pointsResult]=await Promise.all([
    (async()=>{
      const full=await db.from('rep_tracker_member_latest').select('member_id,member_name,level,rep,stamina,max_stamina,last_point_at,last_seen_at')
        .eq('clan_id',config.clan_id).eq('season',config.current_season).eq('member_id',String(memberId)).maybeSingle();
      if(!full.error||!isStaminaSchemaError(full.error))return full;
      const fallback=await db.from('rep_tracker_member_latest').select('member_id,member_name,level,rep,last_point_at,last_seen_at')
        .eq('clan_id',config.clan_id).eq('season',config.current_season).eq('member_id',String(memberId)).maybeSingle();
      return fallback.error?fallback:{...fallback,data:fallback.data?{...fallback.data,stamina:null,max_stamina:null}:null};
    })(),
    db.from('rep_tracker_snapshots').select('captured_at,reputation,level,ign,suspicious,suspicious_reason,source,stamina,max_stamina,raw_data')
      .eq('clan_id',config.clan_id).eq('season',config.current_season).eq('member_id',String(memberId))
      .gte('captured_at',since).order('captured_at',{ascending:true})
  ]);
  if(memberResult.error)throw memberResult.error;
  if(pointsResult.error)throw pointsResult.error;
  if(!memberResult.data)return null;
  const row=memberResult.data;
  const latestPoint=(pointsResult.data||[]).at(-1);
  const verified=latestPoint?.raw_data?.staminaKnown===true
    && latestPoint?.raw_data?.maxStaminaKnown===true
    && latestPoint?.stamina!=null
    && latestPoint?.max_stamina!=null;
  const staminaData=verified?serverReportedStamina({
    stamina:latestPoint.stamina,
    maxStamina:latestPoint.max_stamina,
    staminaKnown:true,
    maxStaminaKnown:true
  }):null;
  return{
    summary:{
      id:String(row.member_id),
      member:row.member_name,
      level:Number(row.level||0),
      rep:Number(row.rep||0),
      stamina:staminaData?.stamina??null,
      maxStamina:staminaData?.maxStamina??null,
      staminaMode:staminaData?.mode??null,
      capturedAt:row.last_seen_at,
      lastPointAt:row.last_point_at
    },
    points:pointsResult.data||[],
    season:config.current_season,
    config
  };
}
export async function startNewSeason(season,finalDayAt,admin){const seasonName=safeText(season);if(!seasonName)throw new Error('Season name is required.');const config=await getConfig();if(!config?.clan_id)throw new Error('Discover the Chaos clan before starting a season.');const db=supabaseAdmin();const{data:locked}=await db.from('rep_tracker_finalizations').select('season').eq('season',seasonName).limit(1);if(locked?.length)throw new Error('That season already has a finalized result.');await ensureSeason({...config,current_season:seasonName},seasonName,config.clan_id);await updateConfig({current_season:seasonName,final_day_at:finalDayAt||null});await audit('Started new season',{season:seasonName,finalDayAt:finalDayAt||null},admin);return getConfig();}
export async function finalizeSeason(admin){const config=await getConfig();if(!config?.clan_id||!config?.current_season)throw new Error('Clan/season not configured.');const live=await syncTracker({force:true,admin}),fresh=await dashboardData();const sourceHealth=String(fresh.syncHealth?.lastSourceHealth||'').toLowerCase();const memberStatus=String(fresh.syncHealth?.lastMemberStatus||'').toLowerCase();if(!fresh.configured||fresh.freshness.status!=='live'||memberStatus!=='success'||sourceHealth!=='healthy')throw new Error('Finalization blocked because the latest member sync is not fully healthy.');if(config.expected_member_count&&fresh.rows.length<Number(config.expected_member_count))throw new Error(`Finalization blocked: ${fresh.rows.length} members returned, ${config.expected_member_count} expected.`);const db=supabaseAdmin();const{data:versions}=await db.from('rep_tracker_finalizations').select('version').eq('season',fresh.season).order('version',{ascending:false}).limit(1);const version=Number(versions?.[0]?.version||0)+1,lockedAt=nowIso(),raw={stats:fresh.stats,rows:fresh.rows,config:fresh.config,live:{source:live.live?.source,service:live.live?.service,fetchedAt:live.live?.fetchedAt}};const{data,error}=await db.from('rep_tracker_finalizations').insert({season:fresh.season,version,clan_id:config.clan_id,final_timestamp:lockedAt,server_timestamp:lockedAt,member_count:fresh.rows.length,total_rep:fresh.stats.totalRep,season_gain:fresh.stats.totalGain,total_hours:fresh.stats.totalHours,avg_rep_per_hour:fresh.stats.avgRepPerHour,locked_by:admin,raw_snapshot:raw}).select('*').single();if(error)throw error;await db.from('rep_tracker_seasons').update({status:'locked',final_locked_at:lockedAt}).eq('season',fresh.season);await audit('Final Day Lock',{season:fresh.season,version,memberCount:fresh.rows.length},admin);return data;}
export async function finalHistory(){const db=supabaseAdmin();const{data,error}=await db.from('rep_tracker_finalizations').select('*').order('final_timestamp',{ascending:false});if(error)throw error;return data||[];}
export async function updateFinalizationCorrection({season,rows,admin,reason}){const config=await getConfig(),existing=(await finalHistory()).filter((x)=>x.season===season).sort((a,b)=>b.version-a.version)[0];if(!existing)throw new Error('No finalized result exists for that season.');const db=supabaseAdmin(),version=Number(existing.version)+1,raw={...existing.raw_snapshot,correctedRows:rows,correctionReason:reason},totalRep=rows.reduce((s,r)=>s+Number(r.rep||r.finalRep||0),0),totalGain=rows.reduce((s,r)=>s+Number(r.gain||r.repGain||0),0),totalHours=rows.reduce((s,r)=>s+Number(r.hours||0),0),timestamp=nowIso();const{data,error}=await db.from('rep_tracker_finalizations').insert({season,version,clan_id:config.clan_id,final_timestamp:timestamp,server_timestamp:timestamp,member_count:rows.length,total_rep:totalRep,season_gain:totalGain,total_hours:totalHours,avg_rep_per_hour:totalHours?totalGain/totalHours:0,locked_by:admin,raw_snapshot:raw}).select('*').single();if(error)throw error;await audit('Final Day Unlock / correction',{season,newVersion:version,reason},admin);return data;}
export async function recentActivity(limit=12,dataOverride=null){const data=dataOverride||await dashboardData();if(!data.configured)return[];const db=supabaseAdmin(),ids=data.rows.map((r)=>r.id),since=new Date(Date.now()-24*60*60*1000).toISOString(),points=[];for(let from=0;;from+=1000){const{data:page,error}=await db.from('rep_tracker_snapshots').select('member_id,ign,reputation,captured_at').eq('clan_id',data.config.clan_id).eq('season',data.season).in('member_id',ids.length?ids:['_']).gte('captured_at',since).order('captured_at',{ascending:false}).range(from,from+999);if(error)throw error;points.push(...(page||[]));if(!page||page.length<1000)break;}return buildRecentActivityEvents(points,limit);}
