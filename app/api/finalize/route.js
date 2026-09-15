import { requireAdmin } from '../../lib/admin-auth';
import { finalizeSeason, finalHistory } from '../../lib/rep-tracker';

export const runtime='nodejs'; export const dynamic='force-dynamic'; export const maxDuration=15;
export async function GET(){try{return Response.json({ok:true,finalizations:await finalHistory()},{headers:{'Cache-Control':'no-store'}})}catch(error){return Response.json({ok:false,error:error instanceof Error?error.message:String(error)},{status:500});}}
export async function POST(request){const denied=requireAdmin(request);if(denied)return denied;const body=await request.json().catch(()=>({}));if(body.action&&body.action!=='lock'&&body.action!=='resnapshot')return Response.json({ok:false,error:'Unknown finalization action.'},{status:400});try{const result=await finalizeSeason(process.env.ADMIN_NAME||'admin');return Response.json({ok:true,finalization:result});}catch(error){return Response.json({ok:false,error:error instanceof Error?error.message:String(error)},{status:400});}}
