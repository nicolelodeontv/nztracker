import { readRankingSnapshot } from '../../lib/ranking-cache.js';
import { finalHistory } from '../../lib/rep-tracker.js';
import { finalResultsToCsv } from '../../lib/final-export.mjs';

export const runtime='nodejs';
export const dynamic='force-dynamic';

const esc=(value)=>{const text=String(value??'');return /[",\n]/.test(text)?'"'+text.replaceAll('"','""')+'"':text;};

export async function GET(request){
  const url=new URL(request.url);
  const type=url.searchParams.get('type')||'clans';
  const season=url.searchParams.get('season')||undefined;
  const format=url.searchParams.get('format')||'csv';
  try{
    if(type==='final'){
      const finals=(await finalHistory()).filter((row)=>!season||row.season===season);
      if(!finals.length)return Response.json({ok:false,error:'No finalized result found.'},{status:404});
      const final=finals[0],members=final.raw_snapshot?.rows||[];
      if(format==='json')return new Response(JSON.stringify(final,null,2),{headers:{'Content-Type':'application/json; charset=utf-8','Content-Disposition':'attachment; filename="'+final.season+'-final.json"','Cache-Control':'no-store'}});
      return new Response(finalResultsToCsv(members),{headers:{'Content-Type':'text/csv; charset=utf-8','Content-Disposition':'attachment; filename="'+final.season+'-final.csv"','Cache-Control':'no-store'}});
    }
    if(type!=='clans')return Response.json({ok:false,error:'Only clan and final exports are supported by the canonical tracker.'},{status:400});
    const snapshot=await readRankingSnapshot();
    if(!snapshot?.rows?.length)return Response.json({ok:false,error:'Ranking dataset is not ready yet.'},{status:503});
    const rows=snapshot.rows.filter((row)=>!season||row.season===season);
    if(format==='json')return new Response(JSON.stringify({ok:true,type,season:season||snapshot.season,exportedAt:new Date().toISOString(),rows},null,2),{headers:{'Content-Type':'application/json; charset=utf-8','Content-Disposition':'attachment; filename="nztracker-clans.json"','Cache-Control':'no-store'}});
    const headers=['rank','clan','master','members','max_members','reputation','season','captured_at'];
    const body=rows.map(row=>[row.rank,row.clan,row.master,row.memberCurrent,row.memberMax,row.reputation,row.season,snapshot.fetchedAt||snapshot.updatedAt]).map((line)=>line.map(esc).join(',')).join('\n');
    return new Response(headers.join(',')+'\n'+body+'\n',{headers:{'Content-Type':'text/csv; charset=utf-8','Content-Disposition':'attachment; filename="nztracker-clans.csv"','Cache-Control':'no-store'}});
  }catch(error){
    return Response.json({ok:false,error:error instanceof Error?error.message:String(error)},{status:503});
  }
}
