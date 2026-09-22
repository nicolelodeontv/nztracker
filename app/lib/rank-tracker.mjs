const normalizeId=(value)=>String(value??'').trim();

function numericRank(value){
  const rank=Number(value);
  return Number.isFinite(rank)&&rank>0?Math.trunc(rank):null;
}

export function rankMembers(members=[]){
  const rows=(Array.isArray(members)?members:[])
    .filter((member)=>normalizeId(member?.id))
    .slice()
    .sort((a,b)=>
      Number(b?.reputation??b?.rep??0)-Number(a?.reputation??a?.rep??0)
      || Number(b?.level??0)-Number(a?.level??0)
      || normalizeId(a?.id).localeCompare(normalizeId(b?.id))
    );
  return rows.map((member,index)=>({...member,rank:index+1}));
}

export function applyRankChanges(members=[],previousRanks=new Map()){
  const previous=previousRanks instanceof Map
    ? previousRanks
    : new Map(Object.entries(previousRanks||{}));
  return rankMembers(members).map((member)=>{
    const previousRank=numericRank(previous.get(normalizeId(member.id)));
    return{
      ...member,
      previousRank,
      rankDelta:previousRank===null?null:previousRank-member.rank
    };
  });
}

export function compareMemberRank(a={},b={}){
  const rankA=numericRank(a?.rank);
  const rankB=numericRank(b?.rank);
  if(rankA!==null&&rankB!==null&&rankA!==rankB)return rankA-rankB;
  if(rankA!==null&&rankB===null)return-1;
  if(rankA===null&&rankB!==null)return 1;
  return Number(b?.reputation??b?.rep??b?.current??0)-Number(a?.reputation??a?.rep??a?.current??0)
    || Number(b?.level??0)-Number(a?.level??0)
    || normalizeId(a?.id).localeCompare(normalizeId(b?.id));
}

export function sortMembersByRank(members=[]){
  return(Array.isArray(members)?members:[]).slice().sort(compareMemberRank);
}

export function formatRankChange(delta){
  const value=Number(delta);
  if(!Number.isFinite(value)||value===0)return'—';
  return value>0?'▲'+value:'▼'+Math.abs(value);
}
