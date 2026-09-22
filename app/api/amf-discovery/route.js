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
    const patterns=[/ClanService\\.getMemberList/gi,/amf\\.ninjazenshin\\.online/gi,/Authorization/gi,/Bearer/gi,/X-API-Key/gi,/apiKey/gi,/accessToken/gi,/authToken/gi,/credentials/gi];
    const matches=[];
    const collect=(url,text)=>{
      for(const pattern of patterns){
        pattern.lastIndex=0;
        const match=pattern.exec(text);
        if(match){
          const index=Math.max(0,match.index-220);
          matches.push({url,pattern:pattern.source,snippet:text.slice(index,index+520).replace(/\\s+/g,' ').trim()});
        }
      }
    };
    collect(SOURCE_ORIGIN+'/?panel=clan-ranking',page.text);
    const scriptResults=await Promise.all(scripts.map(async(url)=>{
      try{
        const result=await fetchText(url,5000);
        collect(url,result.text);
        return{url,status:result.status,ok:result.ok,contentType:result.contentType,size:result.text.length};
      }catch(error){
        return{url,status:null,ok:false,error:error instanceof Error?error.message:String(error)};
      }
    }));
    return Response.json({ok:true,sourceOrigin:SOURCE_ORIGIN,amfOrigin:AMF_ORIGIN,page:{status:page.status,ok:page.ok,contentType:page.contentType,size:page.text.length},scripts:scriptResults,matches:matches.slice(0,40)},{headers:{'Cache-Control':'no-store, max-age=0'}});
  }catch(error){
    return Response.json({ok:false,error:error instanceof Error?error.message:String(error)},{status:502});
  }
}