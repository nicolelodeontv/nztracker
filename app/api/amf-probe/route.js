import { probeAmfMemberSource } from '../../lib/ninja-source.mjs';

export const runtime='nodejs';
export const dynamic='force-dynamic';
export const maxDuration=15;

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
    if(!csrfToken)return Response.json({ok:false,source:'amf',error:'No public CSRF token was exposed by the game page.'},{status:502});
    const result=await probeAmfMemberSource(clanId,{'X-CSRF-TOKEN':csrfToken,'X-Requested-With':'XMLHttpRequest'});
    return Response.json({ok:true,source:'amf',csrfHeaderTested:true,count:result.count,diagnostics:result.sourceDiagnostics?.amf||null},{headers:{'Cache-Control':'no-store, max-age=0'}});
  }catch(error){
    return Response.json({ok:false,source:'amf',error:error instanceof Error?error.message:String(error),diagnostics:error?.sourceDiagnostic||null},{status:502,headers:{'Cache-Control':'no-store, max-age=0'}});
  }
}
