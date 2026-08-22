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

function observedRepPerMinute(clan, history) {
  if (!clan || !history?.length) return 0;
  const snapshots = history
    .filter(snapshot => snapshot?.rows?.some(row => row.clan === clan.clan))
    .slice(-2);
  if (snapshots.length < 2) return 0;
  const previousSnapshot = snapshots[0];
  const currentSnapshot = snapshots[1];
  const previousRow = previousSnapshot.rows.find(row => row.clan === clan.clan);
  const currentRow = currentSnapshot.rows.find(row => row.clan === clan.clan);
  if (!previousRow || !currentRow) return 0;
  const elapsedMinutes = (new Date(currentSnapshot.capturedAt).getTime() - new Date(previousSnapshot.capturedAt).getTime()) / 60000;
  if (!Number.isFinite(elapsedMinutes) || elapsedMinutes <= 0) return 0;
  const gain = Number(currentRow.reputation || 0) - Number(previousRow.reputation || 0);
  return gain > 0 ? Math.round(gain / elapsedMinutes) : 0;
}

export default function Home() {
  const [rows,setRows]=useState([]),[season,setSeason]=useState('Season 2'),[status,setStatus]=useState('loading'),[updatedAt,setUpdatedAt]=useState(null);
  const [query,setQuery]=useState('');
  const [history,setHistory]=useState([]),[previous,setPrevious]=useState({}),[previousRep,setPreviousRep]=useState({}),[totalGain,setTotalGain]=useState({}),[favorites,setFavorites]=useState([]),[showFavorites,setShowFavorites]=useState(false);
  const [selectedClan,setSelectedClan]=useState(null),[members,setMembers]=useState([]),[memberPrevious,setMemberPrevious]=useState({}),[memberTotalGain,setMemberTotalGain]=useState({}),[memberStatus,setMemberStatus]=useState('idle'),[memberUpdatedAt,setMemberUpdatedAt]=useState(null);

  useEffect(()=>{try{setHistory(JSON.parse(localStorage.getItem(HISTORY_KEY)||'[]'));setFavorites(JSON.parse(localStorage.getItem(FAVORITES_KEY)||'[]'));}catch{}},[]);
  const saveHistory=useCallback(snapshot=>setHistory(current=>{const next=[...current,snapshot].slice(-240);try{localStorage.setItem(HISTORY_KEY,JSON.stringify(next));}catch{}return next;}),[]);
  const load=useCallback(async()=>{try{setStatus('loading');const res=await fetch('/api/clan-ranking?t='+Date.now(),{cache:'no-store'});if(!res.ok)throw new Error();const data=await res.json();const now=new Date().toISOString();setRows(current=>{const rankSnap={},repSnap={};const nextTotals={...totalGain};current.forEach(r=>{rankSnap[r.clan]=r.rank;repSnap[r.clan]=r.reputation;});if(Object.keys(rankSnap).length)setPrevious(rankSnap);if(data.rows?.length){data.rows.forEach(r=>{const id=String(r.clanId||r.clan);const currentRep=Number(r.reputation||0);const oldRep=typeof repSnap[id]==='number'?repSnap[id]:typeof repSnap[r.clan]==='number'?repSnap[r.clan]:undefined;const gain=oldRep===undefined?0:Math.max(0,currentRep-oldRep);nextTotals[id]=(nextTotals[id]||0)+gain;r.liveGain=gain;r.totalGain=nextTotals[id];});setTotalGain(nextTotals);setPreviousRep(repSnap);saveHistory({capturedAt:now,season:data.season,rows:data.rows});}return data.rows||[];});setSeason(data.season||'Season 2');setUpdatedAt(new Date(now));setStatus('live');}catch{setStatus('error');}},[saveHistory,totalGain]);
  const loadMembers=useCallback(async clan=>{if(!clan?.clanId){setMembers([]);setMemberStatus('unavailable');return;}try{setMemberStatus('loading');const res=await fetch(`/api/clan-members?clanId=${encodeURIComponent(clan.clanId)}&t=${Date.now()}`,{cache:'no-store'});if(!res.ok)throw new Error();const data=await res.json();setMembers(current=>{const snap={};const nextTotals={...memberTotalGain};(data.members||[]).forEach(member=>{const key=`${clan.clanId}:${member.name.trim().normalize('NFC')}:${member.level}`;const oldRep=current.find(m=>m.name===member.name)?.reputation;const gain=typeof oldRep==='number'?Math.max(0,Number(member.reputation||0)-oldRep):0;nextTotals[key]=(nextTotals[key]||0)+gain;snap[key]=Number(member.reputation||0);member.gain=gain;member.totalGain=nextTotals[key];});setMemberPrevious(snap);setMemberTotalGain(nextTotals);return data.members||[];});setMemberUpdatedAt(new Date(data.fetchedAt||Date.now()));setMemberStatus('live');}catch{setMemberStatus('error');}},[memberTotalGain]);
  useEffect(()=>{load();const t=setInterval(load,REFRESH_MS);return()=>clearInterval(t);},[load]);
  useEffect(()=>{if(!selectedClan)return;const onKeyDown=e=>e.key==='Escape'&&setSelectedClan(null);document.addEventListener('keydown',onKeyDown);return()=>document.removeEventListener('keydown',onKeyDown);},[selectedClan]);
  useEffect(()=>{if(!selectedClan)return;const t=setInterval(()=>{const clan=rows.find(r=>r.clan===selectedClan.clan);if(clan)loadMembers(clan);},REFRESH_MS);return()=>clearInterval(t);},[selectedClan,rows,loadMembers]);
  const filtered=useMemo(()=>{const q=query.trim().toLowerCase();let data=q?rows.filter(r=>`${r.clan} ${r.master}`.toLowerCase().includes(q)):[...rows];if(showFavorites)data=data.filter(r=>favorites.includes(r.clan));return data.sort((a,b)=>a.rank-b.rank);},[rows,query,showFavorites,favorites]);
  const leader=rows[0],totalMembers=rows.reduce((a,r)=>a+r.memberCurrent,0),totalSlots=rows.reduce((a,r)=>a+r.memberMax,0),averageRep=rows.length?Math.round(rows.reduce((a,r)=>a+r.reputation,0)/rows.length):0,selected=selectedClan?rows.find(r=>r.clan===selectedClan.clan):leader;
  const selectedHistory=history.filter(h=>h.rows?.some(r=>r.clan===selected?.clan)).slice(-36),points=selectedHistory.map(h=>h.rows.find(r=>r.clan===selected.clan)?.reputation).filter(v=>typeof v==='number'),min=points.length?Math.min(...points):0,max=points.length?Math.max(...points):1;
  const chart=points.map((v,i)=>`${points.length<2?0:i/(points.length-1)*100},${92-(v-min)/Math.max(1,max-min)*80}`).join(' ');
  function toggleFavorite(clan){setFavorites(cur=>{const next=cur.includes(clan)?cur.filter(x=>x!==clan):[...cur,clan];try{localStorage.setItem(FAVORITES_KEY,JSON.stringify(next));}catch{}return next;});}
  function selectClan(row){setSelectedClan(row);setMembers([]);setMemberPrevious({});setMemberTotalGain({});loadMembers(row);}
  function exportHistoryJson(){downloadText('ninja-zenshin-clan-history.json',JSON.stringify(history,null,2),'application/json;charset=utf-8');}
  function exportHistoryCsv(){downloadText('ninja-zenshin-clan-history.csv',clanHistoryCsv(history),'text/csv;charset=utf-8');}

  return <main className="shell">
    <header className="hero"><div><div className="eyebrow"><span className={`dot ${status}`}/> NINJA ZENSHIN // CLAN TRACKER</div><h1>Clan Ranking</h1><p>Live clan reputation and member reputation for <strong>{season}</strong>.</p></div><div className="controls"><span className="liveBadge">● LIVE · SYNCING</span><button className="ghost" onClick={exportHistoryJson}>⇩ History JSON</button><button className="ghost" onClick={exportHistoryCsv}>⇩ History CSV</button></div></header>
    <section className="stats"><Stat label="CURRENT #1" value={leader?.clan||'—'} sub={leader?`${formatNumber(leader.reputation)} reputation`:'Loading'}/><Stat label="TRACKED CLANS" value={rows.length||'—'} sub="Live Clan Ranking"/><Stat label="MEMBERS" value={rows.length?`${formatNumber(totalMembers)} / ${formatNumber(totalSlots)}`:'—'} sub={totalSlots?`${Math.round(totalMembers/totalSlots*100)}% capacity`:'Loading'}/><Stat label="AVG. REPUTATION" value={rows.length?formatNumber(averageRep):'—'} sub="Across clans"/></section>
    <section className="toolbar"><div className="search"><span>⌕</span><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search clan or master..."/></div><div className="filters"><button className={showFavorites?'filter active':'filter'} onClick={()=>setShowFavorites(v=>!v)}>★ Favorites {favorites.length?`(${favorites.length})`:''}</button></div><div className="updated">{updatedAt?`Updated ${formatTime(updatedAt)}`:'Connecting...'} <span>• LIVE</span></div></section>
    <section className="tableCard"><div className="tableHead"><span>RANK</span><span>CLAN</span><span>MASTER</span><span>MEMBERS</span><span>REPUTATION</span><span>GAIN</span><span>TOTAL GAIN</span><span>★</span></div><div className="rows">{filtered.map(row=>{const gain=Number(row.liveGain||0);const total=Number(row.totalGain||0);return <div key={`${row.clan}-${row.rank}`} className={`tableRow ${gain>0?'repGainRow':''}`} onClick={()=>selectClan(row)} role="button" tabIndex={0} onKeyDown={e=>e.key==='Enter'&&selectClan(row)}><div className={`rank r${row.rank}`}>{row.rank<=3?['♛','◆','◆'][row.rank-1]:`#${row.rank}`}</div><div className="clan"><strong>{row.clan}</strong><div className="bar"><i style={{width:`${row.memberMax?Math.min(100,row.memberCurrent/row.memberMax*100):0}%`}}/></div></div><div className="master">{row.master||'—'}</div><div className="members">{row.memberCurrent}/{row.memberMax}</div><div className={`rep ${gain>0?'repGain':''}`}>{formatNumber(row.reputation)}{gain>0&&<span className="repPop">+{formatNumber(gain)} REP</span>}</div><div className="gainValue">{gain>0?`+${formatNumber(gain)}`:'0'}</div><div className="totalGainValue">{total>0?formatNumber(total):'0'}</div><button className={favorites.includes(row.clan)?'star active':'star'} onClick={e=>{e.stopPropagation();toggleFavorite(row.clan)}}>{favorites.includes(row.clan)?'★':'☆'}</button></div>})}{!filtered.length&&<div className="empty">No clans match your search.</div>}</div></section>
    <section className="analytics"><div className="panel"><div className="panelTop"><div><div className="panelLabel">CLAN REP GAIN</div><h2>{selected?.clan||'—'}</h2></div><div className="metric">{selected?`#${selected.rank}`:'—'}</div></div><div className="gainGrid"><Metric label="CURRENT REP" value={selected?formatNumber(selected.reputation):'—'}/><Metric label="CURRENT GAIN" value={selected?`+${formatNumber(selected.liveGain||0)}`:'—'}/><Metric label="TOTAL GAIN" value={selected?formatNumber(selected.totalGain||0):'—'}/><Metric label="MEMBER COUNT" value={selected?`${selected.memberCurrent}/${selected.memberMax}`:'—'}/></div></div><div className="panel chartPanel"><div className="panelTop"><div><div className="panelLabel">REPUTATION HISTORY</div><h2>{selected?.clan||'Select a clan'}</h2></div><div className="tiny">{points.length} snapshots</div></div>{points.length>1?<svg viewBox="0 0 100 100" className="chart" preserveAspectRatio="none"><polyline points={chart} fill="none" stroke="var(--accent)" strokeWidth="1.8" vectorEffect="non-scaling-stroke"/></svg>:<div className="chartEmpty">Keep the tracker open to build history.</div>}<div className="chartLegend"><span>LOW {formatNumber(min)}</span><span>HIGH {formatNumber(max)}</span></div></div></section>
    {selectedClan&&<div className="memberModal" role="dialog" aria-modal="true" aria-label={`${selectedClan.clan} live members and reputation history`} onMouseDown={e=>e.target===e.currentTarget&&setSelectedClan(null)}><div className="memberModalBox"><div className="memberModalHeader"><div><div className="panelLabel">LIVE MEMBERS // REPUTATION HISTORY · CLAN #{selectedClan.rank}</div><h2>{selectedClan.clan}</h2><div className="memberModalMeta">Master: {selectedClan.master||'—'} · {selectedClan.memberCurrent}/{selectedClan.memberMax} members</div></div><div className="memberModalActions"><span className="memberStatus">{memberStatus==='live'?`● LIVE · ${formatTime(memberUpdatedAt)}`:memberStatus==='loading'?'Loading…':memberStatus==='error'?'Fetch error':'Unavailable'}</span><button className="modalClose" onClick={()=>setSelectedClan(null)} aria-label="Close members">×</button></div></div><div className="memberModalBody">{memberStatus==='loading'&&<div className="memberEmpty">Fetching live member names, levels and reputation…</div>}{memberStatus==='error'&&<div className="memberEmpty">Unable to fetch live members right now.</div>}{memberStatus==='unavailable'&&<div className="memberEmpty">No clan ID was returned by the source.</div>}{memberStatus==='live'&&!members.length&&<div className="memberEmpty">This clan currently has no members returned by the source.</div>}{members.length>0&&<div className="memberTable"><div className="memberHead"><span>#</span><span>MEMBER</span><span>LEVEL</span><span>REPUTATION</span><span>GAIN</span><span>TOTAL GAIN</span></div>{members.map((member,index)=>{const gain=Number(member.gain||0);const total=Number(member.totalGain||0);return <div className="memberRow" key={`${member.name}-${index}`}><span className="memberRank">{index+1}</span><strong>{member.name}</strong><span>{member.level||'—'}</span><span className={gain>0?'memberRepGain':''}>{formatNumber(member.reputation)}{gain>0&&<span className="repPop">+{formatNumber(gain)} REP</span>}</span><span className={gain>0?'movement up':'movement same'}>{gain>0?`+${formatNumber(gain)}`:'0'}</span><span className="totalGainValue">{total>0?formatNumber(total):'0'}</span></div>})}</div>}</div><div className="memberModalFooter">Live member reputation stays synchronized while this clan is open · Press Esc to close</div></div></div>}
    <footer><span className="footerCredits">Created by <strong>Michol</strong> · <a href="https://discordapp.com/users/396080330702061588" target="_blank" rel="noopener noreferrer">Discord</a></span></footer>
  </main>;
}
function Stat({label,value,sub}){return <div className="stat"><div className="label">{label}</div><div className="statValue">{value}</div><div className="sub">{sub}</div></div>}
function Metric({label,value}){return <div className="metricCard"><div className="label">{label}</div><div className="metricValue">{value}</div></div>}
