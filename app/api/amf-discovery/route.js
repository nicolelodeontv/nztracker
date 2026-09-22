const SOURCE_ORIGIN=process.env.GAME_SOURCE_ORIGIN||'https://ninjazenshin.online';
const AMF_ORIGIN=process.env.GAME_AMF_ORIGIN||'https://amf.ninjazenshin.online/';

export const runtime='nodejs';
export const dynamic='force-dynamic';
export const maxDuration=20;

const fetchText=async(url,timeoutMs=5000)=>{
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),timeoutMs);
  try{
    const response=await fetch(url,{cache:'no-store',signal:controller.signal,headers:{Accept:'text/html,application/javascript,text/javascript,*/*','User-Agent':'Mozilla/5.0 NinjaZenshinLiveTracker/diagnostic'}});
    return{ok:response.ok,status:response.status,text:await response.text(),contentType:response.headers.get('content-type')||null};
  }finally{clearTimeout(timer);}
};

export async function GET(){
  if(process.env.VERCEL_ENV!=='preview')return Response.json({ok:false,error:'Preview-only diagnostic.'},{status:404});
  try{
    const page=await fetchText(SOURCE_ORIGIN+'/?panel=clan-ranking',7000);
    const scripts=[...page.text.matchAll(/<script[^>]+src=["']([^"']+)["']/gi)]
      .map(m=>m[1])
      .map(src=>new URL(src,SOURCE_ORIGIN).toString())
      .filter((url,index,all)=>all.indexOf(url)===index)
      .slice(0,16);
    const patterns=['ClanService.getMemberList','amf.ninjazenshin.online','application/x-amf','/1/onResult','sendRequest','AMFMessage','Authorization','Bearer','X-API-Key','apiKey','accessToken','authToken','csrf','token','Cookie','session','credentials','401'];
    const matches=[];
    const collect=(url,text)=>{
      const lower=text.toLowerCase();
      for(const pattern of patterns){
        const needle=pattern.toLowerCase();
        const index=lower.indexOf(needle);
        if(index>=0){
          matches.push({url,pattern,snippet:text.slice(Math.max(0,index-220),index+520).replace(/\\s+/g,' ').trim()});
        }
      }
    };
    collect(SOURCE_ORIGIN+'/?panel=clan-ranking',page.text);
    const swfCandidates=[...page.text.matchAll(/(?:src|data|movie|value)=["']([^"']+\\.swf[^"']*)["']/gi)]
      .map(m=>{try{return new URL(m[1],SOURCE_ORIGIN).toString();}catch{return m[1];}})
      .filter((url,index,all)=>all.indexOf(url)===index)
      .slice(0,20);
    const attributeHints=[...page.text.matchAll(/(?:src|data|movie)=["']([^"']+)["']/gi)]
      .map(m=>m[1])
      .filter(value=>/swf|game|client|loader/i.test(value))
      .slice(0,40);

    const scriptResults=await Promise.all(scripts.map(async(url)=>{
      try{
        const result=await fetchText(url,5000);
        collect(url,result.text);
        return{url,status:result.status,ok:result.ok,contentType:result.contentType,size:result.text.length};
      }catch(error){
        return{url,status:null,ok:false,error:error instanceof Error?error.message:String(error)};
      }
    }));
    return Response.json({ok:true,sourceOrigin:SOURCE_ORIGIN,amfOrigin:AMF_ORIGIN,page:{status:page.status,ok:page.ok,contentType:page.contentType,size:page.text.length},swfCandidates,attributeHints,scripts:scriptResults,matches:matches.slice(0,40)},{headers:{'Cache-Control':'no-store, max-age=0'}});
  }catch(error){
    return Response.json({ok:false,error:error instanceof Error?error.message:String(error)},{status:502});
  }
}