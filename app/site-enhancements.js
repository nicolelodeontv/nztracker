'use client';

import { useEffect } from 'react';

const WATCH_KEY = 'nztracker:watchlist:v1';
const REP_KEY = 'nztracker:command-rep:v3';
const FEED_KEY = 'nztracker:live-feed:v1';
const FEED_LIMIT = 18;
const REP_WINDOW = 10 * 60 * 1000;

const read = (key, fallback) => {
  try { return JSON.parse(localStorage.getItem(key) || '') ?? fallback; } catch { return fallback; }
};
const write = (key, value) => {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch {}
};
const text = (value) => String(value ?? '').replace(/\s+/g, ' ').trim();
const num = (value) => Number(String(value ?? '').replace(/[^0-9.-]/g, '')) || 0;

const previousValues = new Map();

function injectStyles() {
  if (document.querySelector('[data-nz-enhancement-style]')) return;
  const style = document.createElement('style');
  style.dataset.nzEnhancementStyle = 'true';
  style.textContent = `
    @keyframes nzGainPop{0%{transform:scale(1);opacity:.85}35%{transform:scale(1.18);opacity:1;text-shadow:0 0 12px rgba(93,229,173,.45)}70%{transform:scale(1.06)}100%{transform:scale(1);opacity:1;text-shadow:none}}
    @keyframes nzFloat{0%{transform:translateY(4px);opacity:0}15%{opacity:1}100%{transform:translateY(-24px);opacity:0}}
    .gain.gain-pop,.total-gain.gain-pop{animation:nzGainPop .5s cubic-bezier(.2,.8,.2,1);transform-origin:left center}
    .nz-gain-float{position:absolute;left:0;top:-4px;z-index:30;pointer-events:none;color:#5de5ad;font:700 .72rem 'Space Mono',monospace;white-space:nowrap;text-shadow:0 0 10px rgba(93,229,173,.45);animation:nzFloat .82s ease-out forwards}
    .nz-loss-float{color:#ff8e8e}
    .command-center{display:grid;gap:8px;margin:8px 0 10px;padding:9px 10px;border:1px solid #1b2632;border-radius:12px;background:#080f17}
    .command-tabs{display:flex;gap:6px;flex-wrap:wrap}
    .command-tab{height:32px;padding:0 11px;border:1px solid #26313d;border-radius:8px;background:#0a1119;color:#8794a6;font:700 .5rem 'Space Mono',monospace;cursor:pointer}
    .command-tab:hover,.command-tab.active{border-color:#315a70;color:#54d7ff;background:#0c1821}
    .command-tab.bleed.active{border-color:#7d3535;color:#ff9a9a;background:#1a0d0d}
    .command-status{display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;color:#66758a;font:600 .47rem 'Space Mono',monospace}
    .command-bleed{color:#ff9a9a}.command-bleed.ok{color:#7d8999}
    .nz-feed{display:grid;grid-template-columns:minmax(0,1.3fr) minmax(230px,.8fr);gap:8px;margin:0 0 11px}
    .nz-feed-panel{background:#080f17;border:1px solid #1b2632;border-radius:13px;min-width:0;overflow:hidden}
    .nz-feed-head{display:flex;align-items:center;justify-content:space-between;padding:10px 11px;border-bottom:1px solid #17212b}
    .nz-feed-head h3{margin:0;font:700 .72rem 'Plus Jakarta Sans',system-ui,sans-serif}
    .nz-feed-head span{color:#637186;font:600 .43rem 'Space Mono',monospace}
    .nz-feed-list,.nz-top-list{max-height:300px;overflow:auto}
    .nz-feed-item{display:grid;grid-template-columns:62px minmax(0,1fr) auto;gap:8px;padding:8px 11px;border-bottom:1px solid #131d27;font:600 .5rem 'Space Mono',monospace}
    .nz-feed-time{color:#5f6e80}.nz-feed-clan{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#dce7ef}.nz-feed-value{font-weight:700;white-space:nowrap}.nz-feed-value.up{color:#5de5ad}.nz-feed-value.down{color:#ff8e8e}
    .nz-top-item{display:grid;grid-template-columns:24px minmax(0,1fr) auto;gap:7px;padding:8px 11px;border-bottom:1px solid #131d27;font:600 .5rem 'Space Mono',monospace}.nz-top-rank{color:#54d7ff}.nz-top-name{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#dce7ef}.nz-top-gain{color:#5de5ad;white-space:nowrap}
    .last-change{display:block;margin-top:2px;color:#65758a;font:600 .4rem 'Space Mono',monospace}
    .potential-bleed-row{box-shadow:inset 3px 0 0 #ff6464;background:rgba(255,70,70,.025)!important}
    .watch-button{width:25px;height:24px;margin-right:4px;padding:0;border:0;background:none;color:#536276;font-size:15px;cursor:pointer}.watch-button:hover{color:#ffd768}
    .nz-mobile-card{display:none}
    @media(max-width:760px){.nz-feed{grid-template-columns:1fr}.table-wrap{display:none!important}.nz-mobile-card{display:block;padding:8px}.nz-mobile-item{border:1px solid #1b2632;border-radius:10px;background:#0a1119;padding:10px;margin-bottom:6px;cursor:pointer}.nz-mobile-top{display:flex;justify-content:space-between;gap:8px}.nz-mobile-clan{min-width:0}.nz-mobile-clan b{display:block;font:700 .72rem 'Plus Jakarta Sans',system-ui,sans-serif;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.nz-mobile-clan small{display:block;margin-top:2px;color:#657386;font:600 .43rem 'Space Mono',monospace;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.nz-mobile-rank{color:#54d7ff;font:700 .5rem 'Space Mono',monospace}.nz-mobile-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:5px;margin-top:9px}.nz-mobile-stat{padding:6px;border:1px solid #17232d;border-radius:7px}.nz-mobile-stat small{display:block;color:#647386;font:600 .38rem 'Space Mono',monospace}.nz-mobile-stat b{display:block;margin-top:3px;font:700 .52rem 'Space Mono',monospace;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.nz-mobile-item.bleeding{box-shadow:inset 3px 0 0 #ff6464}}
  `;
  document.head.appendChild(style);
}

function rowClan(row){
  return text(row.children?.[1]?.querySelector('b')?.textContent || row.children?.[1]?.textContent);
}

function cleanLegacy(tracker){
  tracker.querySelectorAll('.section').forEach((section)=>{
    if(text(section.querySelector('h2')?.textContent)==='Attack Analytics') section.remove();
  });
  document.querySelectorAll('.section .eyebrow,.section-head .eyebrow').forEach((node)=>{
    if(text(node.textContent).toUpperCase()==='REFERENCE ANALYTICS') node.remove();
  });
  const walker=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT);const nodes=[];
  while(walker.nextNode()) nodes.push(walker.currentNode);
  nodes.forEach((node)=>{if(text(node.nodeValue).toUpperCase()==='30M GAIN') node.nodeValue='GAIN';});
}

function captureChanges(rows){
  const state=read(REP_KEY,{});
  const feed=read(FEED_KEY,[]);
  const now=Date.now();
  const events=Array.isArray(feed)?feed:[];
  rows.forEach((row)=>{
    const clan=rowClan(row);if(!clan)return;
    const rep=num(row.children?.[4]?.textContent);
    const prev=state[clan];
    if(prev && rep!==prev.rep){
      const delta=rep-prev.rep;
      const event={clan,delta,rep,at:now};
      const duplicate=events[0] && events[0].clan===clan && Number(events[0].delta)===delta && now-Number(events[0].at||0)<2000;
      if(!duplicate) events.unshift(event);
      state[clan]=event;
    }else if(!prev){
      state[clan]={rep,delta:0,at:now};
    }else{
      state[clan]={...prev,rep};
    }
  });
  const recent=events.filter((event)=>now-Number(event?.at||0)<=24*60*60*1000).slice(0,FEED_LIMIT);
  write(REP_KEY,state);write(FEED_KEY,recent);
  return {state,feed:recent};
}

function setupCommandCenter(tracker){
  const hero=tracker?.querySelector('.hero');if(!hero)return null;
  let bar=tracker.querySelector('[data-command-center]');
  if(!bar){
    bar=document.createElement('section');bar.className='command-center';bar.dataset.commandCenter='true';
    bar.innerHTML='<div class="command-tabs"><button class="command-tab active" data-view="all">ALL</button><button class="command-tab" data-view="watch">★ WATCHLIST</button><button class="command-tab" data-view="war">⚔ CLAN WAR</button><button class="command-tab bleed" data-view="bleed">🔴 BLEEDING</button></div><div class="command-status"><span class="command-bleed ok" data-bleed-status>⚪ Bleeding state: unknown</span><span>● LIVE SOURCE</span><span data-recent-changes>Recent: —</span></div>';
    hero.after(bar);
    bar.querySelectorAll('.command-tab').forEach((button)=>button.addEventListener('click',()=>{
      bar.querySelectorAll('.command-tab').forEach((tab)=>tab.classList.remove('active'));button.classList.add('active');applyFilter(button.dataset.view);
    }));
  }
  return bar;
}

function renderCommandCenter(bar,state,feed){
  if(!bar)return;
  const now=Date.now();
  const potential=Object.values(state).filter((item)=>Number(item?.delta||0)<0&&now-Number(item?.at||0)<=REP_WINDOW).length;
  const status=bar.querySelector('[data-bleed-status]');
  if(status){status.className=potential?'command-bleed':'command-bleed ok';status.textContent=potential?`🔴 Potential bleed: ${potential}`:'⚪ Bleeding state: unknown';}
  const recent=(feed||[]).slice(0,3).map((item)=>`${item.clan} ${item.delta>=0?'+':'−'}${Math.abs(item.delta).toLocaleString('en-US')}`).join(' · ');
  const node=bar.querySelector('[data-recent-changes]');if(node)node.textContent=recent?`Recent: ${recent}`:'Recent: —';
}

function applyFilter(view){
  const rows=[...document.querySelectorAll('.table-wrap .table-row')];
  const watched=read(WATCH_KEY,[]);const state=read(REP_KEY,{});
  const topWar=new Set(rows.map((row)=>({clan:rowClan(row),gain:num(row.children?.[5]?.textContent),rep:num(row.children?.[4]?.textContent)})).sort((a,b)=>b.gain-a.gain||b.rep-a.rep).slice(0,6).map((item)=>item.clan));
  rows.forEach((row)=>{
    const clan=rowClan(row);const loss=Number(state[clan]?.delta||0)<0&&Date.now()-Number(state[clan]?.at||0)<=REP_WINDOW;
    row.classList.toggle('potential-bleed-row',loss);
    row.style.display=view==='watch'?(watched.includes(clan)?'':'none'):view==='war'?(topWar.has(clan)?'':'none'):view==='bleed'?(loss?'':'none'):'';
  });
  refreshMobile(view);
}

function renderFeed(rows,feed){
  const root=document.querySelector('[data-nz-feed]');if(!root)return;
  const list=root.querySelector('.nz-feed-list');const top=root.querySelector('.nz-top-list');if(!list||!top)return;
  list.textContent='';
  if(!feed.length){const empty=document.createElement('div');empty.className='empty';empty.textContent='Waiting for the first reputation change…';list.appendChild(empty);}else{
    feed.forEach((event)=>{
      const item=document.createElement('div');item.className='nz-feed-item';
      const time=document.createElement('span');time.className='nz-feed-time';time.textContent=new Date(event.at).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit',second:'2-digit'});
      const clan=document.createElement('span');clan.className='nz-feed-clan';clan.textContent=event.clan;
      const delta=document.createElement('span');delta.className=`nz-feed-value ${event.delta>=0?'up':'down'}`;delta.textContent=`${event.delta>=0?'+':'−'}${Math.abs(event.delta).toLocaleString('en-US')} REP`;
      item.append(time,clan,delta);list.appendChild(item);
    });
  }
  top.textContent='';
  [...rows].sort((a,b)=>num(b.children?.[5]?.textContent)-num(a.children?.[5]?.textContent)).slice(0,5).forEach((row,index)=>{
    const item=document.createElement('div');item.className='nz-top-item';
    const rank=document.createElement('span');rank.className='nz-top-rank';rank.textContent=`#${index+1}`;
    const clan=document.createElement('span');clan.className='nz-top-name';clan.textContent=rowClan(row);
    const gain=document.createElement('span');gain.className='nz-top-gain';gain.textContent=`+${num(row.children?.[5]?.textContent).toLocaleString('en-US')}`;
    item.append(rank,clan,gain);top.appendChild(item);
  });
}

function ensureFeed(){
  if(document.querySelector('[data-nz-feed]'))return;
  const section=document.querySelector('.table-wrap')?.closest('.section');if(!section)return;
  const feed=document.createElement('section');feed.className='nz-feed';feed.dataset.nzFeed='true';
  feed.innerHTML='<div class="nz-feed-panel"><div class="nz-feed-head"><h3>⚡ LIVE FEED</h3><span>LAST 18 CHANGES</span></div><div class="nz-feed-list"></div></div><div class="nz-feed-panel"><div class="nz-feed-head"><h3>📈 TOP GAINERS</h3><span>LIVE GAIN</span></div><div class="nz-top-list"></div></div>';
  section.before(feed);
}

function addWatchlist(rows){
  const watched=read(WATCH_KEY,[]);
  rows.forEach((row)=>{const clan=rowClan(row);const cell=row.children?.[0];if(!clan||!cell||row.dataset.watchReady)return;row.dataset.watchReady='1';
    const star=document.createElement('button');star.className='watch-button';star.type='button';star.title='Watch clan';star.textContent=watched.includes(clan)?'★':'☆';
    star.addEventListener('click',(event)=>{event.preventDefault();event.stopPropagation();const list=read(WATCH_KEY,[]);const i=list.indexOf(clan);if(i>=0)list.splice(i,1);else list.push(clan);write(WATCH_KEY,list);star.textContent=list.includes(clan)?'★':'☆';applyFilter(document.querySelector('.command-tab.active')?.dataset.view||'all');});
    cell.prepend(star);
  });
}

function addLastChange(rows,state){
  rows.forEach((row)=>{const clan=rowClan(row);const cell=row.children?.[4];if(!clan||!cell)return;let label=cell.querySelector('.last-change');if(!label){label=document.createElement('span');label.className='last-change';cell.appendChild(label);}const item=state[clan];
    if(!item?.at||!item?.delta){label.textContent='';return;}
    const seconds=Math.max(0,Math.floor((Date.now()-Number(item.at))/1000));label.textContent=`${item.delta>=0?'+':'−'}${Math.abs(Number(item.delta)).toLocaleString('en-US')} · ${seconds<60?`${seconds}s ago`:`${Math.floor(seconds/60)}m ago`}`;
  });
}

function buildMobile(rows){
  let wrap=document.querySelector('.nz-mobile-card');if(!wrap){const table=document.querySelector('.table-wrap');if(!table)return;wrap=document.createElement('div');wrap.className='nz-mobile-card';table.after(wrap);}
  const current=new Set();
  rows.forEach((row)=>{const clan=rowClan(row);if(!clan)return;current.add(clan);let item=wrap.querySelector(`[data-clan="${CSS.escape(clan)}"]`);
    if(!item){item=document.createElement('div');item.className='nz-mobile-item';item.dataset.clan=clan;item.innerHTML='<div class="nz-mobile-top"><div class="nz-mobile-clan"><b></b><small></small></div><span class="nz-mobile-rank"></span></div><div class="nz-mobile-grid"><div class="nz-mobile-stat"><small>MEMBERS</small><b data-m="members"></b></div><div class="nz-mobile-stat"><small>REPUTATION</small><b data-m="rep"></b></div><div class="nz-mobile-stat"><small>GAIN</small><b data-m="gain"></b></div></div>';
      item.addEventListener('click',()=>{const live=[...document.querySelectorAll('.table-wrap .table-row')].find(candidate=>rowClan(candidate)===clan);live?.click();});wrap.appendChild(item);}
    item.querySelector('.nz-mobile-clan b').textContent=clan;item.querySelector('.nz-mobile-clan small').textContent=text(row.children?.[2]?.textContent)||'Clan Master';item.querySelector('.nz-mobile-rank').textContent=`#${text(row.children?.[0]?.textContent).replace(/[★☆]/g,'').trim()}`;item.querySelector('[data-m="members"]').textContent=text(row.children?.[3]?.textContent);item.querySelector('[data-m="rep"]').textContent=num(row.children?.[4]?.textContent).toLocaleString('en-US');item.querySelector('[data-m="gain"]').textContent=`+${num(row.children?.[5]?.textContent).toLocaleString('en-US')}`;
  });
  [...wrap.children].forEach((item)=>{if(!current.has(item.dataset.clan))item.remove();});
}

function refreshMobile(view){
  const cards=[...document.querySelectorAll('.nz-mobile-item')];const watched=read(WATCH_KEY,[]);const state=read(REP_KEY,{});const rows=[...document.querySelectorAll('.table-wrap .table-row')];
  const topWar=new Set(rows.map((row)=>({clan:rowClan(row),gain:num(row.children?.[5]?.textContent),rep:num(row.children?.[4]?.textContent)})).sort((a,b)=>b.gain-a.gain||b.rep-a.rep).slice(0,6).map((item)=>item.clan));
  cards.forEach((card)=>{const clan=card.dataset.clan;const loss=Number(state[clan]?.delta||0)<0&&Date.now()-Number(state[clan]?.at||0)<=REP_WINDOW;card.classList.toggle('bleeding',loss);card.style.display=view==='watch'?(watched.includes(clan)?'':'none'):view==='war'?(topWar.has(clan)?'':'none'):view==='bleed'?(loss?'':'none'):'';});
}

function animateGains(){
  document.querySelectorAll('.gain,.total-gain').forEach((node)=>{const row=node.closest('.table-row,.member-row,.podium,.nz-mobile-item');const clan=text(row?.querySelector('.clan-cell b,.clan-name b,.nz-mobile-clan b')?.textContent);const member=text(row?.querySelector('b')?.textContent);const key=`${member||clan||row?.textContent||''}:${node.classList.contains('total-gain')?'total':'gain'}`;const value=num(node.textContent);const old=previousValues.get(key);previousValues.set(key,value);if(old===undefined||value<=old)return;node.classList.remove('gain-pop');void node.offsetWidth;node.classList.add('gain-pop');window.setTimeout(()=>node.classList.remove('gain-pop'),540);const host=node.parentElement;if(!host)return;if(getComputedStyle(host).position==='static')host.style.position='relative';host.querySelectorAll('.nz-gain-float').forEach((element)=>element.remove());const pop=document.createElement('span');pop.className='nz-gain-float';pop.textContent=`+${(value-old).toLocaleString('en-US')} REP`;host.appendChild(pop);window.setTimeout(()=>pop.remove(),850);});
}

function runEnhancement(){
  injectStyles();
  const tracker=document.querySelector('.tracker');const table=tracker?.querySelector('.table-wrap');if(!tracker||!table)return;
  cleanLegacy(tracker);
  const rows=[...table.querySelectorAll('.table-row')];
  const {state,feed}=captureChanges(rows);
  addWatchlist(rows);
  const bar=setupCommandCenter(tracker);
  renderCommandCenter(bar,state,feed);
  ensureFeed();
  renderFeed(rows,feed);
  addLastChange(rows,state);
  buildMobile(rows);
  refreshMobile(bar?.querySelector('.command-tab.active')?.dataset.view||'all');
  animateGains();
}

function renderCommandCenter(bar,state,feed){
  if(!bar)return;const now=Date.now();const potential=Object.values(state).filter((item)=>Number(item?.delta||0)<0&&now-Number(item?.at||0)<=REP_WINDOW).length;const status=bar.querySelector('[data-bleed-status]');if(status){status.className=potential?'command-bleed':'command-bleed ok';status.textContent=potential?`🔴 Potential bleed: ${potential}`:'⚪ Bleeding state: unknown';}const changes=(feed||[]).slice(0,3).map((item)=>`${item.clan} ${item.delta>=0?'+':'−'}${Math.abs(item.delta).toLocaleString('en-US')}`).join(' · ');const node=bar.querySelector('[data-recent-changes]');if(node)node.textContent=changes?`Recent: ${changes}`:'Recent: —';}

export default function SiteEnhancements(){
  useEffect(()=>{
    let frame=0;const schedule=()=>{cancelAnimationFrame(frame);frame=requestAnimationFrame(runEnhancement);};const observer=new MutationObserver(schedule);observer.observe(document.body,{childList:true,subtree:true});const timer=window.setInterval(schedule,1500);schedule();return()=>{observer.disconnect();window.clearInterval(timer);cancelAnimationFrame(frame);};
  },[]);
  return null;
}
