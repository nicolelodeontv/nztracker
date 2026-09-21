export function buildRecentActivityEvents(points, limit=12){
  const pending=new Map();
  const events=[];
  for(const point of points||[]){
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
    .sort((a,b)=>Date.parse(b.at)-Date.parse(a.at))
    .slice(0,Math.max(1,Number(limit)||12));
}
