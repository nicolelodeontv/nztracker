import { getClans } from '../../../lib/supabase-db.mjs';
import { getLeaderboards } from '../../../lib/multisource-db.mjs';
import { finalHistory } from '../../lib/rep-tracker';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const esc=(value)=>{const text=String(value??'');return /[",\n]/.test(text)?`"${text.replace(/"/g,'""')}"`:text;};

export async function GET(request){
 const url=new URL(request.url),type=url.searchParams.get('type')||'clans',season=url.searchParams.get('season')||undefined,format=url.searchParams.get('format')||'csv';
 try{
  if(type==='final'){
   const all=await finalHistory(); const finals=all.filter(f=>!season||f.season===season); if(!finals.length)return Response.json({ok:false,error:'No finalized result found.'},{status:404});
   const final=finals[0],members=final.raw_snapshot?.rows||[];
   if(format==='json')return new Response(JSON.stringify(final,null,2),{headers:{'Content-Type':'application/json; charset=utf-8','Content-Disposition':`attachment; filename="${final.season}-final.json"`,'Cache-Control':'no-store'}});
   const headers=['Rank','Member ID','IGN','Level','Baseline REP','Final REP','REP Gain','Hours','REP/Hour','Status'];
   const body=members.map((row,i)=>[i+1,row.id,row.member,row.level,row.baseline,row.rep,row.gain,row.hours,row.repPerHour,row.suspicious?'SUSPICIOUS':row.status].map(esc).join(',')).join('\n');
   return new Response(`${headers.map(esc).join(',')}\n${body}\n`,{headers:{'Content-Type':'text/csv; charset=utf-8','Content-Disposition':`attachment; filename="${final.season}-final.csv"`,'Cache-Control':'no-store'}});
  }
  let rows=[]; if(type==='pve'||type==='pvp')rows=await getLeaderboards({type,season,limit:500})||[]; else rows=await getClans({season,limit:500})||[];
  if(format==='json')return Response.json({ok:true,type,season,exportedAt:new Date().toISOString(),rows},{headers:{'Content-Disposition':`attachment; filename="nztracker-${type}.json"`}});
  const headers=type==='clans'?['rank','clan','master','members','max_members','reputation','season','captured_at']:['rank','player','score','wins','losses','title','badge','season','round','captured_at'];
  const body=rows.map(row=>type==='clans'?[row.rank,row.clan,row.master,row.memberCurrent,row.memberMax,row.reputation,row.season,row.capturedAt]:[row.rank,row.playerName,row.score,row.wins,row.losses,row.title,row.badge,row.season,row.round,row.capturedAt]).map(line=>line.map(esc).join(',')).join('\n');
  return new Response(`${headers.join(',')}\n${body}\n`,{headers:{'Content-Type':'text/csv; charset=utf-8','Content-Disposition':`attachment; filename="nztracker-${type}.csv"`,'Cache-Control':'no-store'}});
 }catch(error){return Response.json({ok:false,error:error instanceof Error?error.message:String(error)},{status:503});}
}
