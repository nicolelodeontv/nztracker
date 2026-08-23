'use client';
import {useEffect,useRef,useState} from 'react';
const POLL_MS=5000;
const ALERT_COOLDOWN_MS=30*60*1000;
const ALERT_KEY='nztracker:discord-bleeding:v1';
const snap=rows=>Object.fromEntries((rows||[]).map(r=>[r.clan,Number(r.reputation||0)]));
export default function LiveSyncMonitor(){
 const [state,setState]=useState('connecting'); const previous=useRef(null);
 useEffect(()=>{let timer,stopped=false;
  const poll=async()=>{try{const r=await fetch(`/api/clan-ranking?sync=${Date.now()}`,{cache:'no-store'});if(!r.ok)throw Error();const d=await r.json();if(stopped)return;setState('live');const next=snap(d.rows),old=previous.current;previous.current=next;if(!old)return;
   let sent={};try{sent=JSON.parse(localStorage.getItem(ALERT_KEY)||'{}')||{}}catch{} const now=Date.now();
   for(const [clan,current] of Object.entries(next)){const before=old[clan];if(typeof before!=='number'||current>=before)continue;const last=Number(sent[clan]||0);if(now-last<ALERT_COOLDOWN_MS)continue;
    const resp=await fetch('/api/discord/attack-summary',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({type:'bleeding',clan,previousReputation:before,currentReputation:current,reputationLoss:before-current,timestamp:new Date().toISOString()})});if(resp.ok)sent[clan]=now;
   }
   try{localStorage.setItem(ALERT_KEY,JSON.stringify(sent))}catch{}
  }catch{if(!stopped)setState('error')}finally{if(!stopped)timer=window.setTimeout(poll,POLL_MS)}};
  poll();return()=>{stopped=true;if(timer)clearTimeout(timer)};
 },[]);
 return <div className={`nz-sync-pill nz-sync-${state}`} aria-live="polite"><span className="nz-sync-dot"/>{state==='live'?'LIVE SYNC':state==='error'?'SYNC ERROR':'CONNECTING'}</div>;
}
