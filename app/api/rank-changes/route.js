import { readRankingSnapshot, rankingStorageHealth } from '../../lib/ranking-cache.js';

export const runtime='nodejs';
export const dynamic='force-dynamic';

export async function GET(request){
  try{
    const season=new URL(request.url).searchParams.get('season')?.trim()||undefined;
    const snapshot=await readRankingSnapshot();
    if(!snapshot?.rows?.length)return Response.json({ok:true,season,changes:{},snapshots:[]},{headers:{'Cache-Control':'no-store'}});
    const rows=snapshot.rows.filter((row)=>!season||row.season===season);
    const changes={};
    for(const row of rows){
      const change=snapshot.changes?.[String(row.clanId)];
      if(change)changes[String(row.clanId)]={...change,currentAt:snapshot.fetchedAt||snapshot.updatedAt||null};
    }
    return Response.json({ok:true,season:season||snapshot.season,snapshots:[snapshot.previousFetchedAt,snapshot.fetchedAt].filter(Boolean),changes,sourceStatus:'canonical-ranking-cache',storage:rankingStorageHealth()},{headers:{'Cache-Control':'no-store, max-age:0'}});
  }catch(error){
    return Response.json({ok:false,error:error instanceof Error?error.message:String(error),storage:rankingStorageHealth()},{status:503});
  }
}
