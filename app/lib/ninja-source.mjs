import { parseRankingHtml } from './source-parser.mjs';

export const AMF_ORIGIN = process.env.GAME_AMF_ORIGIN || 'https://amf.ninjazenshin.online/';
export const LEGACY_MEMBER_API = `${process.env.GAME_SOURCE_ORIGIN || 'https://ninjazenshin.online'}/clan-ranking/members/`;
export const RANKING_SOURCE = `${process.env.GAME_SOURCE_ORIGIN || 'https://ninjazenshin.online'}/?panel=clan-ranking`;
export const SERVICE = process.env.GAME_MEMBER_SERVICE || 'ClanService.getMemberList';
export const RESPONSE_TARGET = process.env.GAME_MEMBER_RESPONSE_TARGET || '/1';
const DEFAULT_MAX_STAMINA = 200;
const UPSTREAM_TIMEOUT_MS = 7000;
const inflight = new Map();
const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();
const clean = (value) => String(value ?? '').replace(/\s+/g, ' ').trim();
const toNumber = (value) => { if(value===null||value===undefined||value==='')return null;const number=Number(String(value).replace(/[^0-9.-]/g,''));return Number.isFinite(number)?number:null; };
async function fetchWithTimeout(url,options={}){const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),UPSTREAM_TIMEOUT_MS);try{return await fetch(url,{...options,signal:controller.signal});}catch(error){if(error?.name==='AbortError')throw new Error(`Upstream request timed out after ${UPSTREAM_TIMEOUT_MS/1000}s.`);throw error;}finally{clearTimeout(timer);}}
function pushU16(target,value){target.push((value>>>8)&255,value&255);}function pushU32(target,value){target.push((value>>>24)&255,(value>>>16)&255,(value>>>8)&255,value&255);}function pushUtf(target,value){const bytes=textEncoder.encode(String(value??''));if(bytes.length>65535)throw new Error('AMF string is too long.');pushU16(target,bytes.length);target.push(...bytes);}
export function buildMemberRequest(clanId){const output=[];output.push(0,0);pushU16(output,0);pushU16(output,1);pushUtf(output,SERVICE);pushUtf(output,RESPONSE_TARGET);pushU32(output,0xffffffff);output.push(0x0a);pushU32(output,1);output.push(2);pushUtf(output,clanId);return new Uint8Array(output);}
class Reader{constructor(bytes){this.bytes=bytes instanceof Uint8Array?bytes:new Uint8Array(bytes);this.view=new DataView(this.bytes.buffer,this.bytes.byteOffset,this.bytes.byteLength);this.offset=0;this.references=[];}ensure(count){if(this.offset+count>this.bytes.byteLength)throw new Error(`Invalid AMF response: truncated at byte ${this.offset}.`);}u8(){this.ensure(1);return this.view.getUint8(this.offset++);}u16(){this.ensure(2);const value=this.view.getUint16(this.offset);this.offset+=2;return value;}u32(){this.ensure(4);const value=this.view.getUint32(this.offset);this.offset+=4;return value;}f64(){this.ensure(8);const value=this.view.getFloat64(this.offset);this.offset+=8;return value;}readBytes(count){this.ensure(count);const value=this.bytes.slice(this.offset,this.offset+count);this.offset+=count;return value;}string16(){return textDecoder.decode(this.readBytes(this.u16()));}string32(){return textDecoder.decode(this.readBytes(this.u32()));}amf0(){const type=this.u8();switch(type){case 0:return this.f64();case 1:return this.u8()===1;case 2:return this.string16();case 3:return this.object();case 5:case 6:return null;case 7:return this.references[this.u16()]??null;case 8:this.u32();return this.object();case 10:return this.array();case 11:this.f64();this.u16();return null;case 12:return this.string32();case 16:{const className=this.string16();const value=this.object();if(value&&typeof value==='object')value.__className=className;return value;}case 17:throw new Error('Ninja Zenshin returned AMF3 data.');default:throw new Error(`Unsupported AMF0 type 0x${type.toString(16).padStart(2,'0')}.`);}}object(){const result={};this.references.push(result);while(true){const keyLength=this.u16();if(keyLength===0){const marker=this.u8();if(marker===9)break;throw new Error(`Invalid AMF object terminator 0x${marker.toString(16)}.`);}const key=textDecoder.decode(this.readBytes(keyLength));result[key]=this.amf0();}return result;}array(){const length=this.u32(),result=[];this.references.push(result);for(let index=0;index<length;index++)result.push(this.amf0());return result;}}
export function parseMemberResponse(buffer){const reader=new Reader(buffer);const version=reader.u8();reader.u8();if(version!==0)throw new Error(`Unsupported AMF message version ${version}.`);const headerCount=reader.u16();for(let i=0;i<headerCount;i++){reader.string16();reader.u8();reader.u32();reader.amf0();}const bodyCount=reader.u16();if(bodyCount<1)throw new Error('Ninja Zenshin returned an AMF packet with no bodies.');const bodies=[];for(let i=0;i<bodyCount;i++){const target=reader.string16(),response=reader.string16(),length=reader.u32(),data=reader.amf0();bodies.push({target,response,length,data});}return bodies[0]?.data;}
export function normalizeMembers(rawMembers){
  const normalized=(Array.isArray(rawMembers)?rawMembers:[]).map((member)=>{
    const source=member&&typeof member==='object'?member:{};
    const nested=source?.stats||source?.attributes||source?.status||{};
    const name=clean(source.name??source.username??source.player??source.character);
    const reputation=toNumber(source.reputation??source.rep??source.points);
    const stamina=toNumber(source.stamina??source.currentStamina??source.staminaCurrent??source.sta??source.current_sta)
      ??toNumber(nested.stamina??nested.currentStamina??nested.staminaCurrent??nested.sta??nested.current_sta);
    const maxStaminaValue=toNumber(source.maxStamina??source.staminaMax??source.max_stamina??source.staminaLimit??source.maxSta)
      ??toNumber(nested.maxStamina??nested.staminaMax??nested.max_stamina??nested.staminaLimit??nested.maxSta);
    return{
      id:clean(source.id),
      name,
      level:toNumber(source.level)??0,
      reputation,
      stamina,
      maxStamina:maxStaminaValue,
      staminaKnown:stamina!==null,
      maxStaminaKnown:maxStaminaValue!==null,
      bleedingThreshold:(maxStaminaValue??DEFAULT_MAX_STAMINA)*.7,
      drainFloor:(maxStaminaValue??DEFAULT_MAX_STAMINA)*.5,
    };
  });

  const hasStableIds=normalized.some((member)=>Boolean(member.id));
  const withIdentity=normalized
    .map((member)=>{
      const nameKey=member.name.normalize('NFC').toLocaleLowerCase();
      return{
        ...member,
        identitySource:member.id?'id':'name',
        identityKey:member.id||nameKey,
        id:member.id||(hasStableIds?'':nameKey)
      };
    })
    .filter((member)=>member.name&&member.reputation!==null&&member.id);

  if(hasStableIds){
    const seen=new Set();
    return withIdentity.filter((member)=>{
      const key='id:'+member.id;
      if(seen.has(key))return false;
      seen.add(key);
      return true;
    }).map((member)=>({...member,identityAmbiguous:false}));
  }

  const nameCounts=new Map();
  for(const member of withIdentity) nameCounts.set(member.identityKey,(nameCounts.get(member.identityKey)||0)+1);
  return withIdentity.map((member)=>({
    ...member,
    identityAmbiguous:nameCounts.get(member.identityKey)>1
  }));
}
async function fromAmf(clanId){const response=await fetchWithTimeout(AMF_ORIGIN,{method:'POST',cache:'no-store',body:buildMemberRequest(clanId),headers:{Accept:'*/*','Cache-Control':'no-cache','Content-Type':'application/x-amf',Origin:process.env.GAME_SOURCE_ORIGIN||'https://ninjazenshin.online',Pragma:'no-cache',Referer:RANKING_SOURCE,'User-Agent':'Mozilla/5.0 NinjaZenshinLiveTracker/3.0'}}),bytes=new Uint8Array(await response.arrayBuffer());if(!response.ok)throw new Error(`AMF service returned HTTP ${response.status}.`);if(!bytes.length)throw new Error('AMF service returned an empty response.');const bodyData=parseMemberResponse(bytes);if(!bodyData||typeof bodyData!=='object')throw new Error('AMF response did not contain an object result.');if(bodyData.status&&String(bodyData.status)!=='1')throw new Error(`Member service returned status ${bodyData.status}.`);const rawMembers=Array.isArray(bodyData.result)?bodyData.result:Array.isArray(bodyData.members)?bodyData.members:[];const members=normalizeMembers(rawMembers);if(!members.length)throw new Error('AMF member result contained no valid members.');return{clanId,members,count:members.length,fetchedAt:new Date().toISOString(),source:AMF_ORIGIN,service:SERVICE,stale:false};}
function parseLegacyMemberHtml(text){const rows=text.match(/<tr[\s\S]*?<\/tr>/gi)||[],parsed=[];for(const row of rows){const cells=(row.match(/<t[dh][^>]*>[\s\S]*?<\/t[dh]>/gi)||[]).map((cell)=>clean(cell.replace(/<[^>]+>/g,' ')));if(cells.length<2)continue;const lower=cells.map((cell)=>cell.toLowerCase());if(lower.includes('member')||lower.includes('reputation'))continue;const name=clean(cells[1]||cells[0]);if(!name)continue;parsed.push({id:'',name,level:toNumber(cells[2])??0,reputation:toNumber(cells[3])});}return parsed;}
async function fromLegacy(clanId){const target=`${LEGACY_MEMBER_API}${encodeURIComponent(clanId)}?t=${Date.now()}`,response=await fetchWithTimeout(target,{cache:'no-store',headers:{Accept:'text/html,application/json,text/plain,*/*','User-Agent':'Mozilla/5.0 NinjaZenshinLiveTracker/3.0'}});if(!response.ok)throw new Error(`Legacy member source returned HTTP ${response.status}.`);const text=await response.text();let members;try{const payload=JSON.parse(text),rawMembers=Array.isArray(payload?.members)?payload.members:Array.isArray(payload)?payload:[];members=normalizeMembers(rawMembers);}catch{members=normalizeMembers(parseLegacyMemberHtml(text));}if(!members.length)throw new Error('Legacy member source returned no valid members.');return{clanId,members,count:members.length,fetchedAt:new Date().toISOString(),source:target,service:'legacy-live',stale:false};}
export async function fetchLiveMembers(clanId){const key=String(clanId||'').trim();if(!key||!/^[a-zA-Z0-9_-]+$/.test(key))throw new Error('A valid Ninja Zenshin clanId is required.');const active=inflight.get(key);if(active)return active;const request=(async()=>{try{return await fromAmf(key);}catch(amfError){try{return{...(await fromLegacy(key)),fallbackReason:amfError instanceof Error?amfError.message:String(amfError)};}catch(legacyError){const error=new Error(`Live member sources failed. AMF: ${amfError instanceof Error?amfError.message:String(amfError)} Legacy: ${legacyError instanceof Error?legacyError.message:String(legacyError)}`);error.cause=amfError;throw error;}}})();inflight.set(key,request);try{return await request;}finally{inflight.delete(key);}}
export async function discoverChaos(){const response=await fetchWithTimeout(`${RANKING_SOURCE}&_nz=${Date.now()}`,{cache:'no-store',headers:{Accept:'text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.8','Cache-Control':'no-cache',Pragma:'no-cache','User-Agent':'Mozilla/5.0 NinjaZenshinLiveTracker/3.0'}});if(!response.ok)throw new Error(`Clan ranking source returned HTTP ${response.status}.`);const capturedAt=new Date().toISOString(),parsed=parseRankingHtml(await response.text()),row=parsed.rows?.find((item)=>String(item.clan||'').trim().toLocaleLowerCase()==='chaos');if(!row?.clanId)throw new Error('Clan Chaos was found, but its clan ID could not be discovered from the public ranking source.');const countdownSeconds=Number(parsed.countdown?.remainingSeconds);const finalDayAt=Number.isFinite(countdownSeconds)&&countdownSeconds>=0?new Date(new Date(capturedAt).getTime()+countdownSeconds*1000).toISOString():null;return{clanId:String(row.clanId),clanName:row.clan,expectedMemberCount:row.memberCurrent||null,currentSeason:parsed.season||null,finalDayAt,countdown:parsed.countdown||null,capturedAt,source:RANKING_SOURCE,row,ranking:{...parsed,fetchedAt:capturedAt,source:RANKING_SOURCE}};}
