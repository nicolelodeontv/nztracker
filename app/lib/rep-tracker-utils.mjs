export function buildRecentActivityEvents(points, limit=12){
  const sortedPoints=[...(points||[])].filter((point)=>Number.isFinite(Number(point?.captured_at?Date.parse(point.captured_at):NaN)))
    .sort((a,b)=>Date.parse(String(b.captured_at))-Date.parse(String(a.captured_at)));
  const pending=new Map();
  const events=[];
  for(const point of sortedPoints){
    const key=String(point.member_id);
    const older=point;
    const newer=pending.get(key);
    if(newer&&Number(newer.reputation)>Number(older.reputation)){
      events.push({
        memberId:key,
        member:newer.ign,
        gain:Number(newer.reputation)-Number(older.reputation),
        at:newer.captured_at
      });
    }
    pending.set(key,older);
  }
  return events
    .sort((a,b)=>Date.parse(String(b.at))-Date.parse(String(a.at))||Number(b.gain)-Number(a.gain))
    .slice(0,Math.max(0,Number(limit)||0));
}