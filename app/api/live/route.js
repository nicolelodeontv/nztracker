import { liveData } from '../../lib/rep-tracker.js';

export const runtime='nodejs';
export const dynamic='force-dynamic';
export const maxDuration=15;

export async function GET(){
  try{
    const data=await liveData();
    return Response.json({
      ok:true,
      ...data
    },{headers:{'Cache-Control':'no-store, max-age=0'}});
  }catch(error){
    return Response.json({
      ok:false,
      error:error instanceof Error?error.message:String(error)
    },{status:503,headers:{'Cache-Control':'no-store, max-age=0'}});
  }
}
