import { requireAdmin } from '../../lib/admin-auth';
import { addHours } from '../../lib/rep-tracker';
import { supabaseAdmin } from '../../lib/supabase-admin';

export const runtime='nodejs'; export const dynamic='force-dynamic';
export async function GET(request){
  const denied=requireAdmin(request); if(denied)return denied;
  try {
    const p=new URL(request.url).searchParams; const clanId=p.get('clanId'); const season=p.get('season');
    if(!clanId||!season) return Response.json({ok:false,error:'clanId and season are required.'},{status:400});
    const db=supabaseAdmin(); let query=db.from('rep_tracker_hours').select('*').eq('clan_id',clanId).eq('season',season).order('work_date',{ascending:false}).order('id',{ascending:false}).limit(500);
    const memberId=p.get('memberId'); if(memberId) query=query.eq('member_id',memberId);
    const {data,error}=await query; if(error) throw error; return Response.json({ok:true,hours:data||[]},{headers:{'Cache-Control':'no-store'}});
  } catch(error){return Response.json({ok:false,error:error instanceof Error?error.message:String(error)},{status:500});}
}
export async function POST(request){ const denied=requireAdmin(request); if(denied)return denied; const body=await request.json().catch(()=>({})); try{return Response.json({ok:true,hour:await addHours(body,process.env.ADMIN_NAME||'admin')});}catch(error){return Response.json({ok:false,error:error instanceof Error?error.message:String(error)},{status:400});}}
