import { requireRequiredCronSecret } from '../../lib/cron-auth.mjs';
import { probeAmfMemberSource } from '../../lib/ninja-source.mjs';

export const runtime='nodejs';
export const dynamic='force-dynamic';
export const maxDuration=15;

export async function GET(request){
  const denied=requireRequiredCronSecret(request,'/api/amf-probe');
  if(denied)return denied;
  const clanId=String(new URL(request.url).searchParams.get('clanId')||'').trim();
  if(!/^[a-zA-Z0-9_-]+$/.test(clanId))return Response.json({ok:false,error:'A valid clanId is required.'},{status:400});
  try{
    const result=await probeAmfMemberSource(clanId);
    return Response.json({
      ok:true,
      source:'amf',
      clanId,
      service:result.service,
      count:result.count,
      fetchedAt:result.fetchedAt,
      diagnostics:result.sourceDiagnostics?.amf||null
    },{headers:{'Cache-Control':'no-store, max-age=0'}});
  }catch(error){
    return Response.json({
      ok:false,
      source:'amf',
      clanId,
      error:error instanceof Error?error.message:String(error),
      diagnostics:error?.sourceDiagnostic||null
    },{status:502,headers:{'Cache-Control':'no-store, max-age=0'}});
  }
}
