import { readSyncStatus, storageHealth } from '../../lib/member-history.js';
import { formatError } from '../../lib/error-format.mjs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const INTERVAL_MS = 60 * 1000;
const ACTIVE_MAX_AGE_MS = 3 * 60 * 1000;
const DELAYED_MAX_AGE_MS = 6 * 60 * 1000;

export async function GET(){
  const readErrors={database:null,syncStatus:null};
  let sync=null;
  try{sync=await readSyncStatus();}catch(error){readErrors.syncStatus=formatError(error);readErrors.database=readErrors.syncStatus;}
  const storage=storageHealth();
  const lastRunAt=sync?.lastRunAt||null;
  const lastRunAtMs=lastRunAt?new Date(lastRunAt).getTime():NaN;
  const ageMs=Number.isFinite(lastRunAtMs)?Math.max(0,Date.now()-lastRunAtMs):null;
  const intervalMs=Number(sync?.intervalMs||60000);
  const activeMax=Math.max(180000,intervalMs*3);
  const delayedMax=Math.max(360000,intervalMs*6);
  let status='offline';
  if(ageMs!==null&&ageMs<=activeMax)status='active';
  else if(ageMs!==null&&ageMs<=delayedMax)status='delayed';
  const overall=sync?.overall||null;
  return Response.json({
    ok:!readErrors.database,status,overall,lastRunAt,
    nextExpectedAt:sync?.nextExpectedAt||(lastRunAt?new Date(lastRunAtMs+intervalMs).toISOString():null),
    ageMs,ageSeconds:ageMs===null?null:Math.floor(ageMs/1000),intervalMs,
    season:sync?.season||null,clansSeen:Number(sync?.clansSeen||0),clansWithMemberData:Number(sync?.clansWithMemberData||0),
    membersSeen:Number(sync?.membersSeen||0),memberErrors:Number(sync?.memberErrors||0),
    historyClansStored:Number(sync?.historyClansStored||0),historyClansChanged:Number(sync?.historyClansChanged||sync?.history?.changedClans||0),
    rankingCacheStored:Boolean(sync?.rankingCacheStored),rankingRows:Number(sync?.rankingRows||sync?.clansSeen||0),
    memberSources:sync?.memberSources||{},source:sync?.source||'https://ninjazenshin.online/?panel=clan-ranking',
    error:readErrors.database||formatError(sync?.error,null),warning:overall==='warning'||Boolean(readErrors.database),
    readErrors,durable:storage.durable,storageProvider:storage.provider,storage,database:{configured:storage.configured,provider:storage.provider}
  },{status:readErrors.database?503:200,headers:{'Cache-Control':'no-store, max-age=0'}});
}