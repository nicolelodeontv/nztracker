import { readSyncStatus, storageHealth } from '../../lib/member-history.js';

export const runtime='nodejs';
export const dynamic='force-dynamic';

function ageState(lastRunAt){
  if(!lastRunAt)return'never';
  const age=Math.max(0,Date.now()-new Date(lastRunAt).getTime());
  if(!Number.isFinite(age))return'unknown';
  if(age<=3*60*1000)return'fresh';
  if(age<=6*60*1000)return'delayed';
  return'stale';
}

export async function GET(){
  try{
    const sync=await readSyncStatus();
    const lastRunAt=sync?.lastRunAt||null;
    const ageMs=lastRunAt?Math.max(0,Date.now()-new Date(lastRunAt).getTime()):null;
    return Response.json({
      ok:true,overall:sync?.overall||'offline',status:ageState(lastRunAt),lastRunAt,ageMs,
      ageSeconds:ageMs===null?null:Math.floor(ageMs/1000),nextExpectedAt:sync?.nextExpectedAt||null,
      intervalMs:Number(sync?.intervalMs||60000),season:sync?.season||null,
      clans:Number(sync?.clansSeen||0),members:Number(sync?.membersSeen||0),memberErrors:Number(sync?.memberErrors||0),
      rankingStored:Boolean(sync?.rankingCacheStored||sync?.rankingStored),rosterStored:Boolean(sync?.roster?.stored||false),
      historyClansStored:Number(sync?.history?.changedClans||0),sources:sync?.sources||{},
      error:sync?.error||null,durable:storageHealth().durable,storage:storageHealth(),
      warning:ageMs!==null&&ageMs>5*60*1000?'Sync is outside the expected 1-minute cadence.':null
    },{headers:{'Cache-Control':'no-store, max-age=0'}});
  }catch(error){
    return Response.json({ok:false,overall:'error',error:error instanceof Error?error.message:String(error)},{status:503,headers:{'Cache-Control':'no-store'}});
  }
}
