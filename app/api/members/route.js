import { memberDetail } from '../../lib/rep-tracker';

export const runtime='nodejs'; export const dynamic='force-dynamic';
export async function GET(request){
  const id=new URL(request.url).searchParams.get('id');
  if(!id) return Response.json({ok:false,error:'Member id is required.'},{status:400});
  try { const data=await memberDetail(id,720); if(!data) return Response.json({ok:false,error:'Member not found.'},{status:404}); return Response.json({ok:true,...data},{headers:{'Cache-Control':'no-store'}}); }
  catch(error){ return Response.json({ok:false,error:error instanceof Error?error.message:String(error)},{status:503}); }
}
