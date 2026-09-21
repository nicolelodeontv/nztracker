import { readRankingHistory, rankingStorageHealth } from '../../lib/ranking-cache.js';

export const runtime='nodejs';
export const dynamic='force-dynamic';

export async function GET(request){
  const url=new URL(request.url);
  const clanId=String(url.searchParams.get('clanId')||'').trim();
  const season=String(url.searchParams.get('season')||'').trim();
  const hours=Math.min(720,Math.max(1,Number(url.searchParams.get('hours'))||168));
  if(!clanId)return Response.json({ok:false,error:'clanId is required'},{status:400});
  try{
    const history=await readRankingHistory({clanId,season,hours,limit:5000});
    return Response.json({ok:true,clanId,season:season||history[0]?.season||null,hours,history,sourceStatus:'canonical-ranking-history',storage:rankingStorageHealth()},{headers:{'Cache-Control':'no-store'}});
  }catch(error){
    return Response.json({ok:false,clanId,error:error instanceof Error?error.message:String(error),storage:rankingStorageHealth()},{status:503});
  }
}
