import { finalHistory } from '../../../lib/rep-tracker';
import { finalResultsToCsv } from '../../../lib/final-export.mjs';

export const runtime='nodejs'; export const dynamic='force-dynamic';
const csvCell=(v)=>`"${String(v??'').replaceAll('"','""')}"`;
export async function GET(request){
  try{
    const p=new URL(request.url).searchParams; const season=p.get('season'); const format=p.get('format')||'csv';
    const all=await finalHistory(); const rows=all.filter(f=>!season||f.season===season); if(!rows.length)return Response.json({ok:false,error:'No finalized result found.'},{status:404});
    const final=rows[0]; const members=final.raw_snapshot?.rows||[];
    if(format==='json') return new Response(JSON.stringify(final,null,2),{headers:{'Content-Type':'application/json; charset=utf-8','Content-Disposition':`attachment; filename="${final.season}-final.json"`,'Cache-Control':'no-store'}});
    return new Response(finalResultsToCsv(members),{headers:{'Content-Type':'text/csv; charset=utf-8','Content-Disposition':'attachment; filename="'+final.season+'-final.csv"','Cache-Control':'no-store'}});
  }catch(error){return Response.json({ok:false,error:error instanceof Error?error.message:String(error)},{status:500});}
}
