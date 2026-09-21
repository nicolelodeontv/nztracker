import { readRankingSnapshot, rankingStorageHealth } from '../../lib/ranking-cache.js';

export const runtime='nodejs';
export const dynamic='force-dynamic';

export async function GET(request){
  try{
    const params=new URL(request.url).searchParams;
    const limit=Math.min(500,Math.max(1,Number(params.get('limit')||100)));
    const requestedSeason=params.get('season')?.trim()||null;
    const snapshot=await readRankingSnapshot();
    if(!snapshot?.rows?.length)return Response.json({success:false,error:'Ranking dataset is not ready yet.',sourceStatus:'waiting-for-monitor',storage:rankingStorageHealth()},{status:503});
    const season=requestedSeason||snapshot.season||null;
    const clans=snapshot.rows
      .filter((row)=>!season||row.season===season)
      .sort((a,b)=>Number(a.rank||9999)-Number(b.rank||9999))
      .slice(0,limit)
      .map((row)=>({...row,capturedAt:snapshot.fetchedAt||null,change:snapshot.changes?.[String(row.clanId)]||null}));
    return Response.json({
      success:true,clans,count:clans.length,season,lastUpdated:snapshot.fetchedAt||snapshot.updatedAt||null,
      sync:{lastRunAt:snapshot.updatedAt||null},source:snapshot.source||null,storage:rankingStorageHealth()
    },{headers:{'Cache-Control':'no-store, max-age=0'}});
  }catch(error){
    return Response.json({success:false,error:error instanceof Error?error.message:String(error),storage:rankingStorageHealth()},{status:503,headers:{'Cache-Control':'no-store'}});
  }
}
