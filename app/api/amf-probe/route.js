import { probeAmfMemberSource } from '../../lib/ninja-source.mjs';
import { buildAmfProbeSuccess, classifyAmfProbeError } from '../../lib/amf-probe.mjs';

export const runtime='nodejs';
export const dynamic='force-dynamic';
export const maxDuration=15;

const noStoreHeaders={'Cache-Control':'no-store, max-age=0'};

export async function GET(request){
  if(process.env.VERCEL_ENV!=='preview')return Response.json({ok:false,error:'Preview-only diagnostic.'},{status:404});
  const clanId=String(new URL(request.url).searchParams.get('clanId')||'').trim();
  if(!/^[a-zA-Z0-9_-]+$/.test(clanId))return Response.json({ok:false,error:'A valid clanId is required.'},{status:400});
  try{
    const sourceOrigin=process.env.GAME_SOURCE_ORIGIN||'https://ninjazenshin.online';
    const page=await fetch(sourceOrigin+'/?panel=clan-ranking',{cache:'no-store',headers:{Accept:'text/html','User-Agent':'Mozilla/5.0 NinjaZenshinLiveTracker/diagnostic'}});
    const html=await page.text();
    const match=html.match(/<meta[^>]+name=["']csrf-token["'][^>]+content=["']([^"']+)["']/i);
    const csrfToken=match?.[1]||'';
    if(!csrfToken){
      return Response.json({
        ok:false,
        source:'amf',
        status:'failure',
        error:'No public CSRF token was exposed by the game page.',
      },{status:502,headers:noStoreHeaders});
    }
    const result=await probeAmfMemberSource(clanId,{'X-CSRF-TOKEN':csrfToken,'X-Requested-With':'XMLHttpRequest'});
    return Response.json(buildAmfProbeSuccess(result),{headers:noStoreHeaders});
  }catch(error){
    const classification=classifyAmfProbeError(error);
    const diagnostics=error?.sourceDiagnostic||null;
    if(classification.status==='known_unauthorized'){
      return Response.json({
        ok:true,
        source:'amf',
        status:classification.status,
        message:classification.message,
        diagnostics,
      },{status:200,headers:noStoreHeaders});
    }
    return Response.json({
      ok:false,
      source:'amf',
      status:classification.status,
      error:classification.message,
      diagnostics,
    },{status:classification.httpStatus,headers:noStoreHeaders});
  }
}
