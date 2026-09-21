import { fetchCachedMembers } from '../../lib/ninja-source.mjs';

export const runtime='nodejs';
export const dynamic='force-dynamic';
export const maxDuration=15;

function clean(value){return String(value??'').trim();}
function validClanId(value){return /^[a-zA-Z0-9_-]+$/.test(value);}

export async function GET(request){
  const url=new URL(request.url);
  const clanId=clean(url.searchParams.get('clanId'));
  if(!clanId||!validClanId(clanId)){
    return Response.json({error:'A valid Ninja Zenshin clanId is required.'},{status:400});
  }
  try{
    const payload=await fetchCachedMembers(clanId);
    return Response.json(payload,{
      headers:{
        'Cache-Control':'no-store, max-age=0',
        'X-NZ-Member-Source':payload.stale?'last-known':payload.service||'live'
      }
    });
  }catch(error){
    return Response.json({
      error:'Unable to fetch Ninja Zenshin clan members right now',
      details:error instanceof Error?error.message:String(error),
      clanId
    },{
      status:502,
      headers:{'Cache-Control':'no-store, max-age=0'}
    });
  }
}
