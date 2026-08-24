'use client';

import { useEffect } from 'react';

const KEY = 'nztracker:watchlist:v1';
const read = () => { try { return JSON.parse(localStorage.getItem(KEY) || '[]') || []; } catch { return []; } };
const write = (v) => { try { localStorage.setItem(KEY, JSON.stringify(v)); } catch {} };
const text = (v) => String(v || '').replace(/\s+/g, ' ').trim();
const num = (v) => Number(String(v || '').replace(/[^0-9.-]/g, '')) || 0;

function enhance() {
  const tracker = document.querySelector('.tracker');
  const hero = tracker?.querySelector('.hero');
  const table = tracker?.querySelector('.table-wrap');
  if (!tracker || !hero || !table) return;

  if (!document.querySelector('[data-enhancement-bar]')) {
    const bar = document.createElement('section');
    bar.dataset.enhancementBar = 'true';
    bar.className = 'enhancement-bar section';
    bar.innerHTML = '<div class="enh-tabs"><button data-v="all">ALL</button><button data-v="watch">★ WATCHLIST</button><button data-v="war">⚔ CLAN WAR</button></div><div class="enh-summary"></div>';
    hero.after(bar);
    bar.querySelectorAll('button').forEach(b => b.addEventListener('click', () => {
      bar.querySelectorAll('button').forEach(x => x.classList.remove('active'));
      b.classList.add('active');
      filter(b.dataset.v);
    }));
    bar.querySelector('[data-v="all"]').classList.add('active');
  }

  const rows = [...table.querySelectorAll('.table-row')];
  const watched = read();
  rows.forEach(row => {
    const clan = text(row.children?.[1]?.textContent);
    if (!clan || row.dataset.enhanced) return;
    row.dataset.enhanced = '1';
    const cell = row.children[0];
    const star = document.createElement('button');
    star.className = 'watch-button';
    star.type = 'button';
    star.textContent = watched.includes(clan) ? '★' : '☆';
    star.addEventListener('click', e => {
      e.preventDefault(); e.stopPropagation();
      const list = read(); const i = list.indexOf(clan);
      if (i >= 0) list.splice(i, 1); else list.push(clan);
      write(list); star.textContent = list.includes(clan) ? '★' : '☆';
      filter(document.querySelector('[data-enhancement-bar] button.active')?.dataset.v || 'all');
    });
    cell?.prepend(star);
  });

  if (!document.querySelector('[data-war-panel]')) {
    const panel = document.createElement('section');
    panel.dataset.warPanel = 'true';
    panel.className = 'enh-war-panel section';
    panel.innerHTML = '<div class="section-head"><div><div class="eyebrow">CLAN WAR MONITOR</div><h2>Clan War</h2><p>Recent pressure from the live ranking feed.</p></div></div><div class="enh-war-grid"></div>';
    table.closest('.section')?.before(panel);
  }
  buildWar(rows);
}

function buildWar(rows) {
  const grid = document.querySelector('[data-war-panel] .enh-war-grid'); if (!grid) return;
  grid.innerHTML = '';
  rows.map(r => ({ row:r, clan:text(r.children?.[1]?.textContent), rep:num(r.children?.[4]?.textContent), gain:num(r.children?.[5]?.textContent), members:text(r.children?.[3]?.textContent) }))
    .sort((a,b)=>b.gain-a.gain||b.rep-a.rep).slice(0,6).forEach((x,i)=>{
      const card=document.createElement('div'); card.className='enh-war-card';
      card.innerHTML=`<span class="enh-war-rank">#${i+1}</span><b class="enh-war-name"></b><div class="enh-war-meta"><span>REP <b>${x.rep.toLocaleString('en-US')}</b></span><span>30M <b>+${x.gain.toLocaleString('en-US')}</b></span><span>MEM <b>${x.members}</b></span></div><small>⚪ BLEEDING STATE: UNKNOWN</small>`;
      card.querySelector('.enh-war-name').textContent=x.clan; grid.append(card);
    });
}

function filter(view) {
  const rows=[...document.querySelectorAll('.table-wrap .table-row')], watch=read();
  rows.forEach(r=>{ const clan=text(r.children?.[1]?.textContent); r.style.display=view==='watch'&&!watch.includes(clan)?'none':''; });
  const s=document.querySelector('[data-enhancement-bar] .enh-summary');
  if(s) s.textContent=view==='watch'?`${watch.length} watched clan${watch.length===1?'':'s'} · saved on this device`:'Live ranking · Clan War state is UNKNOWN until stamina data is exposed';
}

export default function SiteEnhancements(){
  useEffect(()=>{
    let frame=0; const schedule=()=>{cancelAnimationFrame(frame);frame=requestAnimationFrame(enhance);};
    const observer=new MutationObserver(schedule); observer.observe(document.body,{childList:true,subtree:true});
    const timer=setInterval(schedule,1500); schedule();
    return()=>{observer.disconnect();clearInterval(timer);cancelAnimationFrame(frame);};
  },[]);
  return null;
}
