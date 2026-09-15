import { finalHistory } from '../../../lib/rep-tracker';

export const runtime='nodejs'; export const dynamic='force-dynamic';
const csvCell=(v)=>`"${String(v??'').replaceAll('"','""')}"`;
export async function GET(request){
  try{
    const p=new URL(request.url).searchParams; const season=p.get('season'); const format=p.get('format')||'csv';
    const all=await finalHistory(); const rows=all.filter(f=>!season||f.season===season); if(!rows.length)return Response.json({ok:false,error:'No finalized result found.'},{status:404});
    const final=rows[0]; const members=final.raw_snapshot?.rows||[];
    if(format==='json') return new Response(JSON.stringify(final,null,2),{headers:{'Content-Type':'application/json; charset=utf-8','Content-Disposition':`attachment; filename="${final.season}-final.json"`,'Cache-Control':'no-store'}});
    const lines=[['Rank','Member ID','IGN','Level','Baseline REP','Final REP','REP Gain','Hours','REP/Hour','Status'].map(csvCell).join(',')];
    for(const [i,r] of members.entries()) lines.push([i+1,r.id,r.member,r.level,r.baseline,r.rep,r.gain,r.hours,r.repPerHour,r.suspicious?'SUSPICIOUS':r.status].map(csvCell).join(','));
    return new Response(lines.join('\n'),{headers:{'Content-Type':'text/csv; charset=utf-8','Content-Disposition':`attachment; filename="${final.season}-final.csv"`,'Cache-Control':'no-store'}});
  }catch(error){return Response.json({ok:false,error:error instanceof Error?error.message:String(error)},{status:500});}
}
