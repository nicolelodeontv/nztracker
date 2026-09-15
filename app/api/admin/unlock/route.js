import { requireAdmin } from '../../../lib/admin-auth';
import { getConfig } from '../../../lib/rep-tracker';
import { supabaseAdmin } from '../../../lib/supabase-admin';

export const runtime='nodejs'; export const dynamic='force-dynamic';
export async function POST(request){
  const denied=requireAdmin(request); if(denied)return denied;
  const body=await request.json().catch(()=>({})); const reason=String(body.reason||'').trim();
  if(reason.length<8)return Response.json({ok:false,error:'Unlock reason must be at least 8 characters.'},{status:400});
  try{
    const config=await getConfig(); if(!config?.current_season)return Response.json({ok:false,error:'No active season configured.'},{status:400});
    const db=supabaseAdmin();
    const {data,error}=await db.from('rep_tracker_seasons').update({status:'active'}).eq('season',config.current_season).select('*').single();
    if(error)throw error;
    await db.from('rep_tracker_audit_log').insert({action:'Final Day Unlock',admin:process.env.ADMIN_NAME||'admin',details:{season:config.current_season,reason}});
    return Response.json({ok:true,season:data});
  }catch(error){return Response.json({ok:false,error:error instanceof Error?error.message:String(error)},{status:400});}
}
