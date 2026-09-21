const AMF_ORIGIN='https://amf.ninjazenshin.online/';
const SERVICE='ClanService.getMemberList';
const RESPONSE_TARGET='/1';
const enc=new TextEncoder(), dec=new TextDecoder();

function u16(a,v){a.push((v>>>8)&255,v&255);}
function u32(a,v){a.push((v>>>24)&255,(v>>>16)&255,(v>>>8)&255,v&255);}
function str(a,v){const b=enc.encode(String(v??''));u16(a,b.length);a.push(...b);}
function build(clanId){
  const a=[0,0];u16(a,0);u16(a,1);str(a,SERVICE);str(a,RESPONSE_TARGET);u32(a,0xffffffff);
  a.push(0x0a);u32(a,1);a.push(0x02);str(a,clanId);return new Uint8Array(a);
}
class Reader{
  constructor(bytes){this.b=bytes;this.v=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);this.o=0;this.refs=[];}
  need(n){if(this.o+n>this.b.length)throw new Error('AMF response truncated');}
  u8(){this.need(1);return this.v.getUint8(this.o++);}
  u16(){this.need(2);const n=this.v.getUint16(this.o);this.o+=2;return n;}
  u32(){this.need(4);const n=this.v.getUint32(this.o);this.o+=4;return n;}
  f64(){this.need(8);const n=this.v.getFloat64(this.o);this.o+=8;return n;}
  bytes(n){this.need(n);const x=this.b.slice(this.o,this.o+n);this.o+=n;return x;}
  s16(){return dec.decode(this.bytes(this.u16()));}
  s32(){return dec.decode(this.bytes(this.u32()));}
  amf0(){
    const t=this.u8();
    if(t===0x00)return this.f64();
    if(t===0x01)return this.u8()===1;
    if(t===0x02)return this.s16();
    if(t===0x03)return this.obj();
    if(t===0x05||t===0x06)return null;
    if(t===0x07)return this.refs[this.u16()]??null;
    if(t===0x08){this.u32();return this.obj();}
    if(t===0x0a)return this.arr();
    if(t===0x0b){this.f64();this.u16();return null;}
    if(t===0x0c)return this.s32();
    if(t===0x10){this.s16();return this.obj();}
    if(t===0x11)throw new Error('AMF3 response');
    throw new Error('Unsupported AMF0 type 0x'+t.toString(16));
  }
  obj(){const r={};this.refs.push(r);for(;;){const k=this.u16();if(k===0){if(this.u8()===9)break;throw new Error('Bad AMF object terminator');}r[dec.decode(this.bytes(k))]=this.amf0();}return r;}
  arr(){const n=this.u32(),r=[];this.refs.push(r);for(let i=0;i<n;i++)r.push(this.amf0());return r;}
}
function parse(buffer){
  const r=new Reader(buffer),version=r.u8();r.u8();
  if(version!==0)throw new Error('Unsupported AMF message version '+version);
  const hc=r.u16();
  for(let i=0;i<hc;i++){r.s16();r.u8();r.u32();r.amf0();}
  const bc=r.u16();if(!bc)throw new Error('No AMF bodies');
  const bodies=[];
  for(let i=0;i<bc;i++){const target=r.s16(),response=r.s16(),length=r.u32(),data=r.amf0();bodies.push({target,response,length,data});}
  return bodies[0]?.data;
}
function rawMembers(body){
  const looks=v=>v&&typeof v==='object'&&!Array.isArray(v)&&('name' in v||'username' in v);
  const from=c=>{
    if(Array.isArray(c))return c.filter(looks);
    if(!c||typeof c!=='object')return [];
    return Object.entries(c).filter(([k,v])=>/^\\d+$/.test(k)&&looks(v)).sort((a,b)=>Number(a[0])-Number(b[0])).map(([,v])=>v);
  };
  for(const c of [body?.result,body?.clan_members,body?.members]){const x=from(c);if(x.length)return x;}
  return [];
}
const clanId=process.argv[2];
if(!clanId){console.error('usage: node check-member-list-live.mjs <clanId>');process.exit(2);}
const response=await fetch(AMF_ORIGIN,{method:'POST',body:build(clanId),headers:{
  Accept:'*/*','Cache-Control':'no-cache','Content-Type':'application/x-amf',
  Origin:'https://ninjazenshin.online',Pragma:'no-cache',Referer:'https://ninjazenshin.online/',
  'User-Agent':'Mozilla/5.0 NinjaZenshinLiveTracker/3.0'
}});
const bytes=new Uint8Array(await response.arrayBuffer());
console.log('http:',response.status);
console.log('bytes:',bytes.length);
if(!response.ok)process.exit(3);
const body=parse(bytes);
function safe(v, depth=0){
  if(depth>2)return '[object]';
  if(v===null||typeof v==='number'||typeof v==='boolean')return v;
  if(typeof v==='string')return v.length>64?'[string:'+v.length+']':v;
  if(Array.isArray(v))return {type:'array',length:v.length};
  if(v&&typeof v==='object'){
    const out={};
    for(const [k,val] of Object.entries(v).slice(0,40)) out[k]=safe(val,depth+1);
    return out;
  }
  return typeof v;
}
console.log('body-structure:',JSON.stringify(safe(body)));
const members=rawMembers(body);
console.log('members:',members.length);
const normalized=members.map(m=>({id:m.id,name:m.name,donatedGold:m.donated_gold,donatedToken:m.donated_token,stamina:m.stamina,reputationGain:m.reputation_gain}));
console.log(JSON.stringify(normalized.filter(m=>m.name==='CHAOS Nnao'||m.name==='CHAOS Michol'),null,2));
if(normalized.length!==29)process.exit(4);
if(normalized.some(m=>!/^\\d+$/.test(String(m.id??''))))process.exit(5);
