import { readRankingSnapshot, rankingStorageHealth } from '../../lib/ranking-cache.js';

export const runtime='nodejs';
export const dynamic='force-dynamic';

export async function GET(request){
  const url=new URL(request.url);
  const first=String(url.searchParams.get('a')||'').trim();
  const second=String(url.searchParams.get('b')||'').trim();
  if(!first||!second)return Response.json({ok:false,error:'Both clan IDs are required.'},{status:400});
  try{
    const snapshot=await readRankingSnapshot();
    if(!snapshot?.rows?.length)return Response.json({ok:false,error:'Ranking dataset is not ready yet.',storage:rankingStorageHealth()},{status:503});
    const ids=new Set([first,second]);
    const clans=snapshot.rows.filter((row)=>ids.has(String(row.clanId)));
    return Response.json({ok:true,season:snapshot.season,clans,sourceStatus:'canonical-ranking-cache',storage:rankingStorageHealth()},{headers:{'Cache-Control':'no-store'}});
  }catch(error){
    return Response.json({ok:false,error:error instanceof Error?error.message:String(error),storage:rankingStorageHealth()},{status:503});
  }
}
