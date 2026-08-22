'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

const REFRESH_MS = 3000;
const HISTORY_KEY = 'nztracker-history-v1';
const FAVORITES_KEY = 'nztracker-favorites-v1';
const formatNumber = value => new Intl.NumberFormat('en-US').format(Number(value || 0));
const formatTime = value => value ? new Date(value).toLocaleTimeString([], { hour:'2-digit', minute:'2-digit', second:'2-digit' }) : '—';

function downloadText(filename, content, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.rel = 'noopener';
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function csvEscape(value) {
  return `"${String(value ?? '').replace(/"/g, '""')}"`;
}

function clanHistoryCsv(history) {
  const lines = ['timestamp,season,rank,clan,master,members_current,members_max,reputation'];
  for (const snapshot of history) {
    for (const row of snapshot.rows || []) {
      lines.push([
        snapshot.capturedAt,
        snapshot.season || '',
        row.rank,
        row.clan,
        row.master,
        row.memberCurrent,
        row.memberMax,
        row.reputation
      ].map(csvEscape).join(','));
    }
  }
  return lines.join('\n');
}

export default function Home() {
  const [rows,setRows]=useState([]),[season,setSeason]=useState('Season 2'),[status,setStatus]=useState('loading'),[updatedAt,setUpdatedAt]=useState(null);
  const [query,setQuery]=useState('');
  const [history,setHistory]=useState([]),[previous,setPrevious]=useState({}),[previousRep,setPreviousRep]=useState({}),[favorites,setFavorites]=useState([]),[showFavorites,setShowFavorites]=useState(false);
  const [selectedClan,setSelectedClan]=useState(null),[members,setMembers]=useState([]),[memberPrevious,setMemberPrevious]=useState({}),[memberStatus,setMemberStatus]=useState('idle'),[memberUpdatedAt,setMemberUpdatedAt]=useState(null);

  useEffect(()=>{try{setHistory(JSON.parse(localStorage.getItem(HISTORY_KEY)||'[]'));setFavorites(JSON.parse(localStorage.getItem(FAVORITES_KEY)||'[]'));}catch{}},[]);
  const saveHistory=useCallback(snapshot=>setHistory(current=>{const next=[...current,snapshot].slice(-240);try{localStorage.setItem(HISTORY_KEY,JSON.stringify(next));}catch{}return next;}),[]);
  const load=useCallback(async()=>{try{setStatus('loading');const res=await fetch('/api/clan-ranking',{cache:'no-store'});if(!res.ok)throw new Error();const data=await res.json();const now=new Date().toISOString();setRows(current=>{const rankSnap={},repSnap={};current.forEach(r=>{rankSnap[r.clan]=r.rank;repSnap[r.clan]=r.reputation;});if(Object.keys(rankSnap).length)setPrevious(rankSnap);if(Object.keys(repSnap).length)setPreviousRep(repSnap);if(data.rows?.length)saveHistory({capturedAt:now,season:data.season,rows:data.rows});return data.rows||[];});setSeason(data.season||'Season 2');setUpdatedAt(new Date(now));setStatus('live');}catch{setStatus('error');}},[saveHistory]);
  const loadMembers=useCallback(async clan=>{if(!clan?.clanId){setMembers([]);setMemberStatus('unavailable');return;}try{setMemberStatus('loading');const res=await fetch(`/api/clan-members?clanId=${encodeURIComponent(clan.clanId)}`,{cache:'no-store'});if(!res.ok)throw new Error();const data=await res.json();setMembers(current=>{const snap={};current.forEach(m=>snap[m.name]=m.reputation);setMemberPrevious(snap);return data.members||[];});setMemberUpdatedAt(new Date(data.fetchedAt||Date.now()));setMemberStatus('live');}catch{setMemberStatus('error');}},[]);
  useEffect(()=>{load();const t=setInterval(load,REFRESH_MS);return()=>clearInterval(t);},[load]);
  useEffect(()=>{if(!selectedClan)return;const onKeyDown=e=>e.key==='Escape'&&setSelectedClan(null);document.addEventListener('keydown',onKeyDown);return()=>document.removeEventListener('keydown',onKeyDown);},[selectedClan]);
  useEffect(()=>{if(!selectedClan)return;const t=setInterval(()=>{const clan=rows.find(r=>r.clan===selectedClan.clan);if(clan)loadMembers(clan);},REFRESH_MS);return()=>clearInterval(t);},[selectedClan,rows,loadMembers]);
  const filtered=useMemo(()=>{const q=query.trim().toLowerCase();let data=q?rows.filter(r=>`${r.clan} ${r.master}`.toLowerCase().includes(q)):[...rows];if(showFavorites)data=data.filter(r=>favorites.includes(r.clan));return data.sort((a,b)=>a.rank-b.rank);},[rows,query,showFavorites,favorites]);
  const leader=rows[0],totalMembers=rows.reduce((a,r)=>a+r.memberCurrent,0),totalSlots=rows.reduce((a,r)=>a+r.memberMax,0),averageRep=rows.length?Math.round(rows.reduce((a,r)=>a+r.reputation,0)/rows.length):0,selected=selectedClan?rows.find(r=>r.clan===selectedClan.clan):leader;
  const selectedHistory=history.filter(h=>h.rows?.some(r=>r.clan===selected?.clan)).slice(-36),points=selectedHistory.map(h=>h.rows.find(r=>r.clan===selected.clan)?.reputation).filter(v=>typeof v==='number'),min=points.length?Math.min(...points):0,max=points.length?Math.max(...points):1;
  const chart=points.map((v,i)=>`${points.length<2?0:i/(points.length-1)*100},${92-(v-min)/Math.max(1,max-min)*80}`).join(' ');
  function toggleFavorite(clan){setFavorites(cur=>{const next=cur.includes(clan)?cur.filter(x=>x!==clan):[...cur,clan];try{localStorage.setItem(FAVORITES_KEY,JSON.stringify(next));}catch{}return next;});}
  function selectClan(row){setSelectedClan(row);setMembers([]);setMemberPrevious({});loadMembers(row);}
  function exportHistoryJson(){downloadText('ninja-zenshin-clan-history.json',JSON.stringify(history,null,2),'application/json;charset=utf-8');}
  function exportHistoryCsv(){downloadText('ninja-zenshin-clan-history.csv',clanHistoryCsv(history),'text/csv;charset=utf-8');}

  return <main className="shell">
    <header className="hero"><div><div className="eyebrow"><span className={`dot ${status}`}/> NINJA ZENSHIN // CLAN TRACKER</div><h1>Clan Ranking</h1><p>Live clan reputation and member reputation for <strong>{season}</strong>.</p></div><div className="controls"><span className="liveBadge">● LIVE · SYNCING</span><button className="ghost" onClick={exportHistoryJson}>⇩ History JSON</button><button className="ghost" onClick={exportHistoryCsv}>⇩ History CSV</button></div></header>
    <section className="stats"><Stat label="CURRENT #1" value={leader?.clan||'—'} sub={leader?`${formatNumber(leader.reputation)} reputation`:'Loading'}/><Stat label="TRACKED CLANS" value={rows.length||'—'} sub="Live Clan Ranking"/><Stat label="MEMBERS" value={rows.length?`${formatNumber(totalMembers)} / ${formatNumber(totalSlots)}`:'—'} sub={totalSlots?`${Math.round(totalMembers/totalSlots*100)}% capacity`:'Loading'}/><Stat label="AVG. REPUTATION" value={rows.length?formatNumber(averageRep):'—'} sub="Across clans"/></section>
    <section className="toolbar"><div className="search"><span>⌕</span><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search clan or master..."/></div><div className="filters"><button className={showFavorites?'filter active':'filter'} onClick={()=>setShowFavorites(v=>!v)}>★ Favorites {favorites.length?`(${favorites.length})`:''}</button></div><div className="updated">{updatedAt?`Updated ${formatTime(updatedAt)}`:'Connecting...'} <span>• LIVE</span></div></section>
    <section className="tableCard"><div className="tableHead"><span>RANK</span><span>CLAN</span><span>MASTER</span><span>MEMBERS</span><span>REPUTATION</span><span>REP/MIN</span><span>★</span></div><div className="rows">{filtered.map(row=>{const repGain=typeof previousRep[row.clan]==='number'&&row.reputation>previousRep[row.clan];const rpm=repPerMinute(row,history);return <div key={`${row.clan}-${row.rank}`} className={`tableRow ${repGain?'repGainRow':''}`} onClick={()=>selectClan(row)} role="button" tabIndex={0} onKeyDown={e=>e.key==='Enter'&&selectClan(row)}><div className={`rank r${row.rank}`}>{row.rank<=3?['♛','◆','◆'][row.rank-1]:`#${row.rank}`}</div><div className="clan"><strong>{row.clan}</strong><div className="bar"><i style={{width:`${row.memberMax?Math.min(100,row.memberCurrent/row.memberMax*100):0}%`}}/></div></div><div className="master">{row.master||'—'}</div><div className="members">{row.memberCurrent}/{row.memberMax}</div><div className={`rep ${repGain?'repGain':''}`}>{formatNumber(row.reputation)}{repGain&&<span className="repPop">+ REP</span>}</div><div className={`movement ${rpm>0?'up':'same'}`}>{rpm>0?formatNumber(rpm):'—'}</div><button className={favorites.includes(row.clan)?'star active':'star'} onClick={e=>{e.stopPropagation();toggleFavorite(row.clan)}}>{favorites.includes(row.clan)?'★':'☆'}</button></div>})}{!filtered.length&&<div className="empty">No clans match your search.</div>}</div></section>
    <section className="analytics"><div className="panel"><div className="panelTop"><div><div className="panelLabel">CLAN REP GAIN</div><h2>{selected?.clan||'—'}</h2></div><div className="metric">{selected?`#${selected.rank}`:'—'}</div></div><div className="gainGrid"><Metric label="CURRENT REP" value={selected?formatNumber(selected.reputation):'—'}/><Metric label="10-MIN GAIN" value={selected?formatNumber(repGain(selected,history)):'—'}/><Metric label="REP / MIN" value={selected?formatNumber(Math.round(repGain(selected,history)/10)):'—'}/><Metric label="MEMBER COUNT" value={selected?`${selected.memberCurrent}/${selected.memberMax}`:'—'}/></div></div><div className="panel chartPanel"><div className="panelTop"><div><div className="panelLabel">REPUTATION HISTORY</div><h2>{selected?.clan||'Select a clan'}</h2></div><div className="tiny">{points.length} snapshots</div></div>{points.length>1?<svg viewBox="0 0 100 100" className="chart" preserveAspectRatio="none"><polyline points={chart} fill="none" stroke="var(--accent)" strokeWidth="1.8" vectorEffect="non-scaling-stroke"/></svg>:<div className="chartEmpty">Keep the tracker open to build history.</div>}<div className="chartLegend"><span>LOW {formatNumber(min)}</span><span>HIGH {formatNumber(max)}</span></div></div></section>
    {selectedClan&&<div className="memberModal" role="dialog" aria-modal="true" aria-label={`${selectedClan.clan} live members and reputation history`} onMouseDown={e=>e.target===e.currentTarget&&setSelectedClan(null)}><div className="memberModalBox"><div className="memberModalHeader"><div><div className="panelLabel">LIVE MEMBERS // REPUTATION HISTORY · CLAN #{selectedClan.rank}</div><h2>{selectedClan.clan}</h2><div className="memberModalMeta">Master: {selectedClan.master||'—'} · {selectedClan.memberCurrent}/{selectedClan.memberMax} members</div></div><div className="memberModalActions"><span className="memberStatus">{memberStatus==='live'?`● LIVE · ${formatTime(memberUpdatedAt)}`:memberStatus==='loading'?'Loading…':memberStatus==='error'?'Fetch error':'Unavailable'}</span><button className="modalClose" onClick={()=>setSelectedClan(null)} aria-label="Close members">×</button></div></div><div className="memberModalBody">{memberStatus==='loading'&&<div className="memberEmpty">Fetching live member names, levels and reputation…</div>}{memberStatus==='error'&&<div className="memberEmpty">Unable to fetch live members right now.</div>}{memberStatus==='unavailable'&&<div className="memberEmpty">No clan ID was returned by the source.</div>}{memberStatus==='live'&&!members.length&&<div className="memberEmpty">This clan currently has no members returned by the source.</div>}{members.length>0&&<div className="memberTable"><div className="memberHead"><span>#</span><span>MEMBER</span><span>LEVEL</span><span>REPUTATION</span><span>Δ REP</span></div>{members.map((member,index)=>{const delta=typeof memberPrevious[member.name]==='number'?member.reputation-memberPrevious[member.name]:0;return <div className="memberRow" key={`${member.name}-${index}`}><span className="memberRank">{index+1}</span><strong>{member.name}</strong><span>{member.level||'—'}</span><span className={delta>0?'memberRepGain':''}>{formatNumber(member.reputation)}{delta>0&&<span className="repPop">+ REP</span>}</span><span className={delta>0?'movement up':delta<0?'movement down':'movement same'}>{delta>0?`+${formatNumber(delta)}`:delta<0?formatNumber(delta):'—'}</span></div>})}</div>}</div><div className="memberModalFooter">Live member reputation stays synchronized while this clan is open · Press Esc to close</div></div></div>}
    <footer><span className="footerCredits">Created by <strong>Michol</strong> · <a href="https://discordapp.com/users/396080330702061588" target="_blank" rel="noopener noreferrer">Discord</a></span></footer>
  </main>;
}
function repGain(selected,history){if(!selected)return 0;const cutoff=Date.now()-600000;const old=[...history].reverse().find(h=>new Date(h.capturedAt).getTime()<=cutoff&&h.rows?.some(r=>r.clan===selected.clan))?.rows?.find(r=>r.clan===selected.clan);return old?selected.reputation-old.reputation:0;}
function repPerMinute(row,history){if(!row)return 0;const cutoff=Date.now()-600000;const old=[...history].reverse().find(h=>new Date(h.capturedAt).getTime()<=cutoff&&h.rows?.some(r=>r.clan===row.clan))?.rows?.find(r=>r.clan===row.clan);if(!old)return 0;return Math.max(0,Math.round((row.reputation-old.reputation)/10));}
function Stat({label,value,sub}){return <div className="stat"><div className="label">{label}</div><div className="statValue">{value}</div><div className="sub">{sub}</div></div>}
function Metric({label,value}){return <div className="metricCard"><div className="label">{label}</div><div className="metricValue">{value}</div></div>}
