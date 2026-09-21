import { requireAdmin } from '../../../lib/admin-auth.js';
import { getConfig } from '../../../lib/rep-tracker.js';
import { fetchLiveMembers } from '../../../lib/ninja-source.mjs';
import { readSyncHealth } from '../../../lib/sync-health.mjs';

export const runtime='nodejs';
export const dynamic='force-dynamic';
export const maxDuration=30;

export async function GET(request){
  const denied=requireAdmin(request);
  if(denied)return denied;

  const config=await getConfig();
  const health=await readSyncHealth().catch(()=>null);
  const test=new URL(request.url).searchParams.get('test')==='1';
  let probe=null;

  if(test&&config?.clan_id){
    try{
      const live=await fetchLiveMembers(config.clan_id);
      probe={
        ok:true,
        selected:live.service==='legacy-live'?'legacy':'amf',
        sourceStatus:live.sourceStatus||null,
        sourceDiagnostics:live.sourceDiagnostics||null,
        memberCount:Array.isArray(live.members)?live.members.length:0,
        fetchedAt:live.fetchedAt||null
      };
    }catch(error){
      probe={
        ok:false,
        error:error instanceof Error?error.message:String(error),
        sourceDiagnostics:error?.sourceDiagnostics||null
      };
    }
  }

  return Response.json({
    ok:true,
    configured:Boolean(config?.clan_id),
    config:config?{
      clanId:config.clan_id,
      clanName:config.clan_name,
      season:config.current_season
    }:null,
    current:{
      sourceStatus:health?.lastSourceStatus||null,
      memberSource:health?.lastMemberSource||null,
      memberStatus:health?.lastMemberStatus||null,
      lastMemberSuccessAt:health?.lastMemberSuccessAt||null,
      lastFailureAt:health?.lastErrorAt||null,
      lastFailureError:health?.lastFailureError||null,
      diagnostics:health?.lastSourceDiagnostics||null
    },
    probe
  },{headers:{'Cache-Control':'no-store, max-age=0'}});
}
