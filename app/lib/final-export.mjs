const escapeCsv=(value)=>{
  const text=String(value??'');
  return /[",\n\r]/.test(text)?'"'+text.replaceAll('"','""')+'"':text;
};

export function finalResultsToCsv(members=[]){
  const headers=['Rank','Member Name','Level','Final REP','REP Gained'];
  const body=(Array.isArray(members)?members:[]).map((row,index)=>[
    row?.rank??index+1,
    row?.member??row?.name??'',
    row?.level??'',
    row?.rep??row?.finalRep??'',
    row?.gain??row?.repGain??''
  ].map(escapeCsv).join(','));
  return [headers.join(','),...body].join('\r\n')+'\r\n';
}
