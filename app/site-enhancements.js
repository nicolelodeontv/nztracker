'use client';

import { useEffect } from 'react';

const WATCH_KEY = 'nztracker:watchlist:v1';
const REP_KEY = 'nztracker:command-rep:v2';
const REP_WINDOW = 10 * 60 * 1000;

const read = (key, fallback) => { try { return JSON.parse(localStorage.getItem(key) || '') || fallback; } catch { return fallback; } };
const write = (key, value) => { try { localStorage.setItem(key, JSON.stringify(value)); } catch {} };
const text = (v) => String(v || '').replace(/\s+/g, ' ').trim();
const num = (v) => Number(String(v || '').replace(/[^0-9.-]/g, '')) || 0;
const previousGain = new Map();
const changeFeed = [];

function installStyles() {
  if (document.querySelector('[data-command-center-style]')) return;
  const style = document.createElement('style');
  style.dataset.commandCenterStyle = 'true';
  style.textContent = `
    @keyframes nzGainPop{0%{transform:scale(1);opacity:.86}35%{transform:scale(1.18);opacity:1;text-shadow:0 0 12px rgba(93,229,173,.5)}70%{transform:scale(1.06);opacity:1}100%{transform:scale(1);opacity:1;text-shadow:none}}
    @keyframes nzGainFloat{0%{transform:translateY(4px) scale(.9);opacity:0}18%{transform:translateY(0) scale(1);opacity:1}100%{transform:translateY(-24px) scale(1.03);opacity:0}}
    .gain.gain-pop,.total-gain.gain-pop{animation:nzGainPop .5s cubic-bezier(.2,.8,.2,1);transform-origin:left center}
    .nz-gain-float{position:absolute;left:0;top:-4px;z-index:50;pointer-events:none;color:#5de5ad;font:700 .72rem 'Space Mono',monospace;white-space:nowrap;text-shadow:0 0 11px rgba(93,229,173,.48);animation:nzGainFloat .82s cubic-bezier(.2,.75,.25,1) forwards}
    .nz-loss-float{color:#ff8e8e;text-shadow:0 0 11px rgba(255,142,142,.38)}
    .command-center{display:grid;gap:8px;margin:8px 0 10px;padding:9px 10px;border:1px solid #1b2632;border-radius:12px;background:#080f17}
    .command-tabs{display:flex;gap:6px;flex-wrap:wrap}
    .command-tab{height:32px;padding:0 11px;border:1px solid #26313d;border-radius:8px;background:#0a1119;color:#8794a6;font:700 .5rem 'Space Mono',monospace;cursor:pointer}
    .command-tab:hover,.command-tab.active{border-color:#315a70;color:#54d7ff;background:#0c1821}.command-tab.bleed.active{border-color:#7d3535;color:#ff9a9a;background:#1a0d0d}
    .command-status{display:flex;justify-content:space-between;gap:10px;align-items:center;flex-wrap:wrap;color:#66758a;font:600 .47rem 'Space Mono',monospace}
    .command-bleed{color:#ff9a9a}.command-bleed.ok{color:#7d8999}.command-changes{display:flex;gap:9px;flex-wrap:wrap}.command-change{white-space:nowrap}.command-change strong{color:#5de5ad}
    .potential-bleed-row{box-shadow:inset 3px 0 0 #ff6464;background:rgba(255,70,70,.025)!important}
    .recent-change-row{background:rgba(84,215,255,.02)!important}
    .nz-feed{display:grid;grid-template-columns:minmax(0,1.35fr) minmax(240px,.8fr);gap:8px;margin:0 0 11px}
    .nz-feed-panel{background:#080f17;border:1px solid #1b2632;border-radius:13px;min-width:0;overflow:hidden}
    .nz-feed-head{display:flex;align-items:center;justify-content:space-between;padding:10px 11px;border-bottom:1px solid #17212b}.nz-feed-head h3{margin:0;font:700 .72rem 'Plus Jakarta Sans',system-ui,sans-serif}.nz-feed-head span{font:600 .43rem 'Space Mono',monospace;color:#637186}
    .nz-feed-item{display:grid;grid-template-columns:62px minmax(0,1fr) auto;gap:8px;padding:8px 11px;border-bottom:1px solid #131d27;font:600 .5rem 'Space Mono',monospace}.nz-feed-item:last-child{border-bottom:0}.nz-feed-time{color:#5f6e80}.nz-feed-clan{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#dce7ef}.nz-feed-value{white-space:nowrap;font-weight:700}.nz-feed-value.up{color:#5de5ad}.nz-feed-value.down{color:#ff8e8e}
    .nz-top-item{display:grid;grid-template-columns:24px minmax(0,1fr) auto;gap:7px;padding:8px 11px;border-bottom:1px solid #131d27;font:600 .5rem 'Space Mono',monospace}.nz-top-item:last-child{border-bottom:0}.nz-top-rank{color:#54d7ff}.nz-top-name{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#dce7ef}.nz-top-gain{color:#5de5ad;white-space:nowrap}
    .last-change{display:block;margin-top:2px;color:#65758a;font:600 .4rem 'Space Mono',monospace}.nz-bleed-tag{display:inline-flex;align-items:center;margin-left:5px;padding:2px 5px;border-radius:5px;border:1px solid #5a2e2e;background:#160c0c;color:#ff8e8e;font:700 .38rem 'Space Mono',monospace;vertical-align:middle}
    .watch-button{width:25px;height:24px;margin-right:4px;padding:0;border:0;background:none;color:#536276;font-size:15px;line-height:1;cursor:pointer;vertical-align:middle}.watch-button:hover{color:#ffd768}
    .nz-mobile-card{display:none}
    @media(max-width:760px){.nz-feed{grid-template-columns:1fr}.nz-filter{flex:1}.nz-mobile-card{display:block;padding:8px}.table-wrap{display:none!important}.nz-mobile-item{border:1px solid #1b2632;border-radius:10px;background:#0a1119;padding:10px;margin-bottom:6px;cursor:pointer}.nz-mobile-top{display:flex;justify-content:space-between;gap:8px}.nz-mobile-clan{min-width:0}.nz-mobile-clan b{display:block;font:700 .72rem 'Plus Jakarta Sans',system-ui,sans-serif;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.nz-mobile-clan small{display:block;margin-top:2px;color:#657386;font:600 .43rem 'Space Mono',monospace;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.nz-mobile-rank{color:#54d7ff;font:700 .5rem 'Space Mono',monospace}.nz-mobile-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:5px;margin-top:9px}.nz-mobile-stat{padding:6px;border:1px solid #17232d;border-radius:7px}.nz-mobile-stat small{display:block;color:#647386;font:600 .38rem 'Space Mono',monospace}.nz-mobile-stat b{display:block;margin-top:3px;font:700 .52rem 'Space Mono',monospace;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.nz-mobile-item.bleeding{box-shadow:inset 3px 0 0 #ff6464}}
  `;
  document.head.appendChild(style);
}

function cleanLabels(){
  document.querySelectorAll('.section .eyebrow,.section-head .eyebrow').forEach(node=>{if(text(node.textContent).toUpperCase()==='REFERENCE ANALYTICS')node.remove();});
  const walker=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT);const nodes=[];while(walker.nextNode())nodes.push(walker.currentNode);
  nodes.forEach(node=>{if(text(node.nodeValue).toUpperCase()==='30M GAIN')node.nodeValue='GAIN';});
}

function removeAttackAnalytics(tracker){[...tracker.querySelectorAll('.section')].forEach(section=>{if(text(section.querySelector('h2')?.textContent)==='Attack Analytics')section.remove();});}
function rowClan(row){return text(row.children?.[1]?.querySelector('b')?.textContent||row.children?.[1]?.textContent);}

function updateRepState(rows){
  const state=read(REP_KEY,{});const now=Date.now();const newChanges=[];
  rows.forEach(row=>{const clan=rowClan(row);if(!clan)return;const rep=num(row.children?.[4]?.textContent);const prior=state[clan];if(prior&&rep!==prior.rep){const delta=rep-prior.rep;state[clan]={rep,at:now,delta};newChanges.push({clan,delta,at:now});}else if(!prior){state[clan]={rep,at:now,delta:0};}});
  Object.keys(state).forEach(clan=>{if(now-Number(state[clan]?.at||0)>REP_WINDOW)delete state[clan];});
  newChanges.reverse().forEach(change=>{const prev=changeFeed[0];if(!prev||prev.clan!==change.clan||prev.delta!==change.delta||change.at-prev.at>1500)changeFeed.unshift(change);});
  changeFeed.splice(18);write(REP_KEY,state);return state;
}

function addWatchlist(rows){
  const watched=read(WATCH_KEY,[]);rows.forEach(row=>{const clan=rowClan(row);if(!clan||row.dataset.watchReady)return;row.dataset.watchReady='1';const cell=row.children[0];if(!cell)return;const star=document.createElement('button');star.className='watch-button';star.type='button';star.title='Watch clan';star.textContent=watched.includes(clan)?'★':'☆';star.addEventListener('click',event=>{event.preventDefault();event.stopPropagation();const list=read(WATCH_KEY,[]);const index=list.indexOf(clan);if(index>=0)list.splice(index,1);else list.push(clan);write(WATCH_KEY,list);star.textContent=list.includes(clan)?'★':'☆';applyFilter(document.querySelector('.command-tab.active')?.dataset.view||'all');});cell.prepend(star);});
}

function renderCommandCenter(rows,state){
  const tracker=document.querySelector('.tracker');const hero=tracker?.querySelector('.hero');if(!tracker||!hero)return;let bar=tracker.querySelector('[data-command-center]');
  if(!bar){bar=document.createElement('section');bar.className='command-center';bar.dataset.commandCenter='true';bar.innerHTML='<div class="command-tabs"><button class="command-tab active" data-view="all">ALL</button><button class="command-tab" data-view="watch">★ WATCHLIST</button><button class="command-tab" data-view="war">⚔ CLAN WAR</button><button class="command-tab bleed" data-view="bleed">🔴 BLEEDING</button></div><div class="command-status"><span class="command-bleed" data-bleed-status>⚪ Bleeding state: unknown</span><span data-freshness>● LIVE SOURCE</span><span class="command-changes" data-recent-changes>Recent: —</span></div>';hero.after(bar);bar.querySelectorAll('.command-tab').forEach(button=>button.addEventListener('click',()=>{bar.querySelectorAll('.command-tab').forEach(item=>item.classList.remove('active'));button.classList.add('active');applyFilter(button.dataset.view);}));}
  const potential=Object.values(state).filter(item=>Number(item?.delta||0)<0&&Date.now()-Number(item?.at||0)<=REP_WINDOW).length;const bleed=bar.querySelector('[data-bleed-status]');if(bleed){bleed.className=potential?'command-bleed':'command-bleed ok';bleed.textContent=potential?`🔴 Potential bleed: ${potential}`:'⚪ Bleeding state: unknown';}
  const updated=document.querySelector('.toolbar .eyebrow')?.textContent||'';bar.querySelector('[data-freshness]').textContent=updated?`● ${updated.replace(/^UPDATED\s*/i,'Updated ')}`:'● LIVE SOURCE';
  const recent=changeFeed.slice(0,3).map(change=>`<span class="command-change">${change.clan} <strong>${change.delta>=0?'+':'−'}${Math.abs(change.delta).toLocaleString('en-US')}</strong></span>`).join('');bar.querySelector('[data-recent-changes]').innerHTML=recent?`Recent: ${recent}`:'Recent: —';
  applyFilter(bar.querySelector('.command-tab.active')?.dataset.view||'all');
}

function applyFilter(view){
  const rows=[...document.querySelectorAll('.table-wrap .table-row')];const watched=read(WATCH_KEY,[]);const state=read(REP_KEY,{});const ranked=rows.map(row=>({row,clan:rowClan(row),gain:num(row.children?.[5]?.textContent),rep:num(row.children?.[4]?.textContent)}));const topWar=new Set(ranked.sort((a,b)=>b.gain-a.gain||b.rep-a.rep).slice(0,6).map(item=>item.clan));
  rows.forEach(row=>{const clan=rowClan(row);const recentLoss=Number(state[clan]?.delta||0)<0&&Date.now()-Number(state[clan]?.at||0)<=REP_WINDOW;row.classList.toggle('potential-bleed-row',recentLoss);row.style.display=view==='watch'?(watched.includes(clan)?'':'none'):view==='war'?(topWar.has(clan)?'':'none'):view==='bleed'?(recentLoss?'':'none'):'';});
  document.querySelectorAll('.command-tab').forEach(tab=>tab.setAttribute('aria-pressed',tab.dataset.view===view?'true':'false'));
  refreshMobileCards(view);
}

function animateGains(){
  document.querySelectorAll('.gain,.total-gain').forEach(node=>{const row=node.closest('.table-row,.member-row,.podium');const clan=text(row?.querySelector('.clan-cell b,.clan-name b')?.textContent);const member=text(row?.querySelector('.member-row b')?.textContent);const key=`${member||clan||row?.textContent||''}:${node.classList.contains('total-gain')?'total':'gain'}`;const value=num(node.textContent);const old=previousGain.get(key);previousGain.set(key,value);if(old===undefined||value<=old)return;node.classList.remove('gain-pop');void node.offsetWidth;node.classList.add('gain-pop');window.setTimeout(()=>node.classList.remove('gain-pop'),540);const host=node.parentElement;if(!host)return;if(getComputedStyle(host).position==='static')host.style.position='relative';host.querySelectorAll('.nz-gain-float').forEach(el=>el.remove());const pop=document.createElement('span');pop.className='nz-gain-float';pop.textContent=`+${(value-old).toLocaleString('en-US')} REP`;host.appendChild(pop);window.setTimeout(()=>pop.remove(),850);});
}

function buildFeed(){
  if(document.querySelector('[data-nz-feed]'))return;const section=document.querySelector('.table-wrap')?.closest('.section');if(!section)return;const feed=document.createElement('section');feed.className='nz-feed';feed.dataset.nzFeed='true';feed.innerHTML='<div class="nz-feed-panel"><div class="nz-feed-head"><h3>⚡ LIVE FEED</h3><span>LAST 18 CHANGES</span></div><div class="nz-feed-list"></div></div><div class="nz-feed-panel"><div class="nz-feed-head"><h3>📈 TOP GAINERS</h3><span>LIVE GAIN</span></div><div class="nz-top-list"></div></div>';section.before(feed);
}

function renderFeed(rows){
  const feed=document.querySelector('[data-nz-feed]');if(!feed)return;const list=feed.querySelector('.nz-feed-list');const top=feed.querySelector('.nz-top-list');list.innerHTML=changeFeed.length?changeFeed.slice(0,18).map(item=>`<div class="nz-feed-item"><span class="nz-feed-time">${new Date(item.at).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit',second:'2-digit'})}</span><span class="nz-feed-clan">${item.clan}</span><span class="nz-feed-value ${item.delta>=0?'up':'down'}">${item.delta>=0?'+':'−'}${Math.abs(item.delta).toLocaleString('en-US')} REP</span></div>`).join(''):'<div class="empty">Waiting for the first reputation change…</div>';
  const topRows=[...rows].sort((a,b)=>num(b.children?.[5]?.textContent)-num(a.children?.[5]?.textContent)).slice(0,5);top.innerHTML=topRows.length?topRows.map((row,index)=>`<div class="nz-top-item"><span class="nz-top-rank">#${index+1}</span><span class="nz-top-name">${rowClan(row)}</span><span class="nz-top-gain">+${num(row.children?.[5]?.textContent).toLocaleString('en-US')}</span></div>`).join(''):'<div class="empty">Waiting for gain data…</div>';
}

function addLastChange(rows,state){
  rows.forEach(row=>{const clan=rowClan(row);const repCell=row.children?.[4];if(!repCell)return;const item=state[clan];let label=repCell.querySelector('.last-change');if(!label){label=document.createElement('span');label.className='last-change';repCell.appendChild(label);}if(item&&item.at){const seconds=Math.max(0,Math.floor((Date.now()-Number(item.at))/1000));label.textContent=`${item.delta>=0?'+':'−'}${Math.abs(Number(item.delta||0)).toLocaleString('en-US')} · ${seconds<60?`${seconds}s ago`:`${Math.floor(seconds/60)}m ago`}`;}else label.textContent='';});
}

function buildMobileCards(rows){
  if(document.querySelector('.nz-mobile-card'))return;const table=document.querySelector('.table-wrap');if(!table)return;const wrap=document.createElement('div');wrap.className='nz-mobile-card';rows.forEach(row=>{const item=document.createElement('div');item.className='nz-mobile-item';item.dataset.clan=rowClan(row);item.innerHTML='<div class="nz-mobile-top"><div class="nz-mobile-clan"><b></b><small></small></div><span class="nz-mobile-rank"></span></div><div class="nz-mobile-grid"><div class="nz-mobile-stat"><small>MEMBERS</small><b></b></div><div class="nz-mobile-stat"><small>REPUTATION</small><b></b></div><div class="nz-mobile-stat"><small>GAIN</small><b class="gain"></b></div></div>';wrap.appendChild(item);item.addEventListener('click',()=>row.click());});table.after(wrap);
}

function refreshMobileCards(view='all'){
  const cards=[...document.querySelectorAll('.nz-mobile-item')];const rows=[...document.querySelectorAll('.table-wrap .table-row')];const watched=read(WATCH_KEY,[]);const state=read(REP_KEY,{});const ranked=rows.map(row=>({row,clan:rowClan(row),gain:num(row.children?.[5]?.textContent),rep:num(row.children?.[4]?.textContent)}));const topWar=new Set(ranked.sort((a,b)=>b.gain-a.gain||b.rep-a.rep).slice(0,6).map(item=>item.clan));
  cards.forEach(card=>{const row=rows.find(item=>rowClan(item)===card.dataset.clan);if(!row)return;const clan=card.dataset.clan;const gain=num(row.children?.[5]?.textContent);const rep=num(row.children?.[4]?.textContent);const loss=Number(state[clan]?.delta||0)<0&&Date.now()-Number(state[clan]?.at||0)<=REP_WINDOW;card.classList.toggle('bleeding',loss);card.style.display=view==='watch'?(watched.includes(clan)?'':'none'):view==='war'?(topWar.has(clan)?'':'none'):view==='bleed'?(loss?'':'none'):'';const values=card.querySelectorAll('.nz-mobile-stat b');card.querySelector('.nz-mobile-rank').textContent=`#${text(row.children?.[0]?.textContent)}`;card.querySelector('.nz-mobile-clan b').textContent=clan;card.querySelector('.nz-mobile-clan small').textContent=text(row.children?.[2]?.textContent)||'Clan Master';if(values[0])values[0].textContent=text(row.children?.[3]?.textContent);if(values[1])values[1].textContent=rep.toLocaleString('en-US');if(values[2])values[2].textContent=`+${gain.toLocaleString('en-US')}`;});
}

function enhance(){
  installStyles();const tracker=document.querySelector('.tracker');const table=tracker?.querySelector('.table-wrap');if(!tracker||!table)return;removeAttackAnalytics(tracker);cleanLabels();const rows=[...table.querySelectorAll('.table-row')];const state=updateRepState(rows);addWatchlist(rows);renderCommandCenter(rows,state);buildFeed();renderFeed(rows);addLastChange(rows,state);buildMobileCards(rows);animateGains();refreshMobileCards(document.querySelector('.command-tab.active')?.dataset.view||'all');
}

export default function SiteEnhancements(){
  useEffect(()=>{let frame=0;const schedule=()=>{cancelAnimationFrame(frame);frame=requestAnimationFrame(enhance)};const observer=new MutationObserver(schedule);observer.observe(document.body,{childList:true,subtree:true,characterData:true});const timer=setInterval(schedule,1200);schedule();return()=>{observer.disconnect();clearInterval(timer);cancelAnimationFrame(frame);};},[]);return null;
}
