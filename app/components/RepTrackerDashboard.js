'use client';

import { useEffect, useMemo, useState } from 'react';

const fmt = (n) => Number(n || 0).toLocaleString();
const fmtHours = (n) => Number(n || 0).toFixed(2);
const age = (s) => s == null ? '—' : s < 60 ? `${s}s ago` : s < 3600 ? `${Math.floor(s/60)}m ago` : `${Math.floor(s/3600)}h ago`;

async function api(url, options) {
  const response = await fetch(url, { cache: 'no-store', ...options, headers: { Accept: 'application/json', ...(options?.headers || {}) } });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (response.status === 401 && typeof window !== 'undefined') window.dispatchEvent(new Event('admin-session-expired'));
    throw new Error(data.error || data.details || `HTTP ${response.status}`);
  }
  return data;
}

function Countdown({ target }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);
  if (!target) return <b>—</b>;
  const ms = Math.max(0, new Date(target).getTime() - now);
  const total = Math.floor(ms / 1000);
  const d = Math.floor(total / 86400), h = Math.floor((total % 86400) / 3600), m = Math.floor((total % 3600) / 60), s = total % 60;
  return <b className="countdown">{d}d {String(h).padStart(2,'0')}h {String(m).padStart(2,'0')}m {String(s).padStart(2,'0')}s</b>;
}

function LineChart({ points }) {
  if (!points?.length) return <div className="chart-empty">NO STORED SNAPSHOTS</div>;
  const min = Math.min(...points.map(p => Number(p.reputation))), max = Math.max(...points.map(p => Number(p.reputation)));
  const span = Math.max(1, max - min);
  const path = points.map((p, i) => {
    const x = (i / Math.max(1, points.length - 1)) * 100;
    const y = 96 - ((Number(p.reputation) - min) / span) * 78;
    return `${i ? 'L' : 'M'} ${x} ${y}`;
  }).join(' ');
  return <svg className="chart" viewBox="0 0 100 100" preserveAspectRatio="none" aria-label="REP progression"><path d="M 0 96 L 100 96" className="chart-axis"/><path d={path} className="chart-line" /></svg>;
}

function MemberDrawer({ member, onClose }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => { if (!member) return; api(`/api/members?id=${encodeURIComponent(member.id)}`).then(setData).catch(e => setError(e.message)); }, [member]);
  if (!member) return null;
  return <div className="drawer-backdrop" onClick={onClose}><aside className="drawer" onClick={e => e.stopPropagation()}>
    <div className="drawer-head"><div><span className="eyebrow">CHAOS MEMBER</span><h2>{member.member}</h2><p>Level {member.level} · ID {member.id}</p></div><button className="icon-btn" onClick={onClose}>×</button></div>
    {error && <div className="notice bad">{error}</div>}
    {!data ? <div className="loading">LOADING HISTORY…</div> : <>
      <div className="mini-stats"><div><span>CURRENT REP</span><b>{fmt(member.rep)}</b></div><div><span>SEASON GAIN</span><b>+{fmt(member.gain)}</b></div><div><span>TODAY</span><b>+{fmt(member.todayGain)}</b></div><div><span>REP / HR</span><b>{fmt(member.repPerHour)}</b></div></div>
      <div className="panel inset"><div className="section-title"><div><span className="eyebrow">PROGRESSION</span><h3>REP OVER TIME</h3></div><span>{data.points?.length || 0} snapshots</span></div><LineChart points={data.points}/></div>
      <div className="panel inset"><div className="section-title"><div><span className="eyebrow">HISTORY</span><h3>RECENT SNAPSHOTS</h3></div></div><div className="timeline">{(data.points || []).slice(-30).reverse().map((p, i, arr) => { const next = arr[i+1]; const delta = next ? Number(p.reputation)-Number(next.reputation) : 0; return <div className="timeline-row" key={`${p.captured_at}-${i}`}><time>{new Date(p.captured_at).toLocaleString()}</time><b>{fmt(p.reputation)}</b><em className={delta > 0 ? 'up' : delta < 0 ? 'down' : ''}>{delta > 0 ? `+${fmt(delta)}` : delta < 0 ? fmt(delta) : '—'}</em></div>; })}</div></div>
    </>}
  </aside></div>;
}

export default function RepTrackerDashboard({ initialView = 'dashboard' }) {
  const [view, setView] = useState(initialView);
  const [data, setData] = useState(null);
  const [history, setHistory] = useState([]);
  const [finalizations, setFinalizations] = useState([]);
  const [selected, setSelected] = useState(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [loginOpen, setLoginOpen] = useState(false);
  const [password, setPassword] = useState('');
  const [admin, setAdmin] = useState(false);
  const [adminLoading, setAdminLoading] = useState(true);
  const [seasonName, setSeasonName] = useState('');
  const [finalDay, setFinalDay] = useState('');
  const [hoursMember, setHoursMember] = useState('');
  const [hoursDate, setHoursDate] = useState(new Date().toISOString().slice(0,10));
  const [hoursStart, setHoursStart] = useState('');
  const [hoursEnd, setHoursEnd] = useState('');
  const [hoursBreak, setHoursBreak] = useState('0');
  const [hoursNotes, setHoursNotes] = useState('');

  const refresh = async (withSync = true) => {
    try {
      if (withSync) await api('/api/sync', { method: 'GET' }).catch(() => null);
      const current = await api('/api/dashboard');
      setData(current);
      const fins = await api('/api/finalize');
      setFinalizations(fins.finalizations || []);
      if (current?.config) {
        setSeasonName(current.config.current_season || '');
        setFinalDay(current.config.final_day_at ? new Date(current.config.final_day_at).toISOString().slice(0,16) : '');
      }
    } catch (e) { setMessage(e.message); }
  };
  useEffect(() => {
    let cancelled = false;
    const checkAdmin = async () => {
      try {
        const session = await api('/api/admin/login', { method: 'GET' });
        if (!cancelled) setAdmin(Boolean(session.admin));
      } catch (e) {
        if (!cancelled) {
          setAdmin(false);
          setMessage(e.message);
        }
      } finally {
        if (!cancelled) setAdminLoading(false);
      }
    };
    checkAdmin();
    const onExpired = () => {
      setAdmin(false);
      setLoginOpen(true);
      setPassword('');
      setMessage('Admin session expired. Please sign in again.');
    };
    window.addEventListener('admin-session-expired', onExpired);
    refresh(true);
    const t = setInterval(() => refresh(false), 30000);
    return () => {
      cancelled = true;
      window.removeEventListener('admin-session-expired', onExpired);
      clearInterval(t);
    };
  }, []);

  const rows = data?.rows || [];
  const top = useMemo(() => [...rows].sort((a,b) => b.todayGain - a.todayGain).slice(0,5), [rows]);
  const activity = data?.activity || [];
  const latestFinal = finalizations[0];

  async function login() { setBusy(true); try { await api('/api/admin/login',{method:'POST',body:JSON.stringify({password}),headers:{'Content-Type':'application/json'}}); setAdmin(true); setLoginOpen(false); setPassword(''); setMessage('Admin session active.'); } catch(e){setMessage(e.message);} finally{setBusy(false);} }
  async function logout() { setBusy(true); try { await api('/api/admin/login',{method:'DELETE'}); setAdmin(false); setLoginOpen(false); setPassword(''); setMessage('Admin session ended.'); } catch(e){setMessage(e.message);} finally{setBusy(false);} }
  async function syncNow(){setBusy(true);try{await api('/api/sync',{method:'POST'});await refresh(false);setMessage('Live sync completed.');}catch(e){setMessage(e.message);}finally{setBusy(false);}}
  async function baseline(){setBusy(true);try{await api('/api/season',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'baseline'})});await refresh(false);setMessage('Season baseline created from the live roster.');}catch(e){setMessage(e.message);}finally{setBusy(false);}}
  async function startSeason(){setBusy(true);try{await api('/api/season',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'start',season:seasonName,finalDayAt:finalDay?new Date(finalDay).toISOString():null})});await refresh(true);setMessage('New season started.');}catch(e){setMessage(e.message);}finally{setBusy(false);}}
  async function addHours(){setBusy(true);try{let total=0;if(hoursStart&&hoursEnd){total=(new Date(`1970-01-01T${hoursEnd}:00Z`).getTime()-new Date(`1970-01-01T${hoursStart}:00Z`).getTime())/3600000-(Number(hoursBreak)||0)/60;if(total<0)total+=24;} await api('/api/hours',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({season:data.season,clanId:data.config.clan_id,memberId:hoursMember,workDate:hoursDate,startTime:hoursStart?`${hoursDate}T${hoursStart}:00+08:00`:null,endTime:hoursEnd?`${hoursDate}T${hoursEnd}:00+08:00`:null,breakMinutes:Number(hoursBreak)||0,totalHours:Number(total.toFixed(2)),source:'MANUAL',notes:hoursNotes})});await refresh(false);setMessage('Hours session added.');}catch(e){setMessage(e.message);}finally{setBusy(false);}}
  async function lockFinal(){if(!confirm('FINALIZE SEASON RESULTS? This creates an immutable final snapshot.'))return;setBusy(true);try{const res=await api('/api/finalize',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'lock'})});await refresh(false);setMessage(`FINAL DAY LOCKED · VERSION ${res.finalization.version}`);}catch(e){setMessage(e.message);}finally{setBusy(false);}}

  let adminContent;
  if (adminLoading) {
    adminContent = <div className="panel"><div className="loading">CHECKING ADMIN SESSION…</div></div>;
  } else if (!admin) {
    adminContent = <div className="panel"><span className="eyebrow">SECURE ADMIN</span><h3>ADMIN LOGIN</h3><p>Sign in to access protected administration actions.</p><input autoFocus type="password" value={password} onChange={e=>setPassword(e.target.value)} placeholder="Admin password" onKeyDown={e=>e.key==='Enter'&&login()}/><button className="btn primary full" onClick={login} disabled={busy}>SIGN IN</button></div>;
  } else {
    adminContent = (
      <>
        <div className="admin-grid"><div className="panel"><span className="eyebrow">SEASON SETTINGS</span><h3>Start / baseline</h3><label>Season<input value={seasonName} onChange={e=>setSeasonName(e.target.value)} placeholder="Season 4"/></label><label>Final day<input type="datetime-local" value={finalDay} onChange={e=>setFinalDay(e.target.value)}/></label><div className="actions"><button className="btn primary" onClick={startSeason} disabled={!admin||busy}>START NEW SEASON</button><button className="btn" onClick={baseline} disabled={!admin||busy}>CREATE BASELINE</button></div></div><div className="panel"><span className="eyebrow">SYNC</span><h3>Live source</h3><div className="source-meta"><span>Status <b>{data.freshness?.status?.toUpperCase()}</b></span><span>Last success <b>{age(data.freshness?.ageSeconds)}</b></span><span>Source <b>{rows[0]?.source || '—'}</b></span></div><button className="btn primary full" onClick={syncNow} disabled={!admin||busy}>SYNC NOW</button></div><div className="panel"><span className="eyebrow">MANUAL HOURS</span><h3>Track activity</h3><label>Member<select value={hoursMember} onChange={e=>setHoursMember(e.target.value)}><option value="">Select member</option>{rows.map(r=><option key={r.id} value={r.id}>{r.member}</option>)}</select></label><div className="split"><label>Date<input type="date" value={hoursDate} onChange={e=>setHoursDate(e.target.value)}/></label><label>Break min<input type="number" min="0" value={hoursBreak} onChange={e=>setHoursBreak(e.target.value)}/></label></div><div className="split"><label>Start<input type="time" value={hoursStart} onChange={e=>setHoursStart(e.target.value)}/></label><label>End<input type="time" value={hoursEnd} onChange={e=>setHoursEnd(e.target.value)}/></label></div><label>Notes<input value={hoursNotes} onChange={e=>setHoursNotes(e.target.value)} placeholder="Optional"/></label><button className="btn primary full" onClick={addHours} disabled={!admin||busy||!hoursMember||!hoursStart||!hoursEnd}>ADD MANUAL SESSION</button></div><div className="panel danger-panel"><span className="eyebrow">FINALIZATION</span><h3>{latestFinal?'FINAL DAY LOCKED':'Ready to lock'}</h3><p>{latestFinal?'Final results are read-only. A future correction must create a new version.':'Before locking, the system runs a fresh sync and blocks stale/incomplete data.'}</p><button className="btn danger full" onClick={lockFinal} disabled={!admin||busy||Boolean(latestFinal)}>LOCK FINAL DAY</button></div></div>
        <div className="actions"><button className="btn" onClick={logout} disabled={busy}>LOG OUT</button></div>
      </>
    );
  }

  const nav = [['dashboard','Dashboard'],['members','Members'],['history','History'],['final','Final Results'],['admin','Admin']];
  if (!data?.configured) return <main className="ops-app"><header className="ops-header"><div className="brand"><div><b>CHAOS</b><span>REP TRACKER</span><small>Ninja Zenshin Clan Operations</small></div></div><button className="btn primary" onClick={() => setLoginOpen(true)}>ADMIN SETUP</button></header><section className="empty-state"><span className="eyebrow">NO LIVE CONFIGURATION</span><h1>Waiting for a real Ninja Zenshin clan source.</h1><p>The tracker will not fabricate roster, REP, season, or countdown values. Open Admin to authenticate and run discovery.</p>{message&&<div className="notice bad">{message}</div>}</section>{loginOpen&&<div className="modal-backdrop"><div className="modal"><h3>ADMIN LOGIN</h3><input autoFocus type="password" value={password} onChange={e=>setPassword(e.target.value)} placeholder="Admin password"/><button className="btn primary full" onClick={login} disabled={busy}>SIGN IN</button></div></div>}</main>;

  return <main className="ops-app">
    <header className="ops-header">
      <div className="brand"><div className="mark">C</div><div><b>CHAOS</b><span>REP TRACKER</span><small>Ninja Zenshin Clan Operations</small></div></div>
      <div className="header-right"><div className="connection"><i className={`dot ${data.freshness?.status==='live'?'good':data.freshness?.status==='aging'?'warn':'bad'}`}></i><b>{data.freshness?.status==='live'?'LIVE':data.freshness?.status==='aging'?'AGING':'STALE'}</b><span>{age(data.freshness?.ageSeconds)}</span></div><time>{new Date(data.serverTime).toLocaleTimeString()}</time><button className="btn" onClick={syncNow} disabled={busy}>↻ SYNC</button><button className="btn" onClick={()=>setLoginOpen(true)}>{admin?'ADMIN':'ADMIN'}</button></div>
    </header>
    <nav className="ops-nav">{nav.map(([key,label])=><button key={key} className={view===key?'active':''} onClick={()=>setView(key)}>{label}</button>)}</nav>
    {message&&<div className={`notice ${/fail|error|blocked|stale|missing/i.test(message)?'bad':'good'}`}>{message}<button onClick={()=>setMessage('')}>×</button></div>}

    {view==='dashboard'&&<>
      <section className="season-band"><div><span className="eyebrow">SEASON</span><h1>{data.season}</h1><p>Clan {data.config.clan_name} · ID {data.config.clan_id} {data.config.current_round?`· Round ${data.config.current_round}`:''}</p></div><div className="season-box"><span>FINAL DAY IN</span><Countdown target={data.config.final_day_at}/></div><div className="season-box"><span>SERVER TIME</span><b>{new Date(data.serverTime).toLocaleString()}</b></div></section>
      <section className="stats-grid"><div><span>TOTAL CLAN REP</span><b>{fmt(data.stats.totalRep)}</b></div><div><span>TODAY'S GAIN</span><b className="up">+{fmt(data.stats.todayGain)}</b></div><div><span>SEASON GAIN</span><b>+{fmt(data.stats.totalGain)}</b></div><div><span>ACTIVE MEMBERS</span><b>{data.stats.activeMembers}</b></div><div><span>TRACKED HOURS</span><b>{fmtHours(data.stats.totalHours)}</b></div><div><span>AVG REP / HOUR</span><b>{fmt(data.stats.avgRepPerHour)}</b></div></section>
      <section className="panel table-panel"><div className="section-title"><div><span className="eyebrow">LIVE MEMBER RANKING</span><h2>REP PERFORMANCE</h2></div><span>{rows.length} members · source {rows[0]?.source || '—'}</span></div><div className="table-scroll"><table><thead><tr><th>RANK</th><th>MEMBER</th><th>LV</th><th>CURRENT REP</th><th>REP GAIN</th><th>HOURS</th><th>REP / HR</th><th>STATUS</th></tr></thead><tbody>{rows.map((r,i)=><tr key={r.id} onClick={()=>setSelected(r)}><td>#{i+1}</td><td className="member-name">{r.member}</td><td>{r.level}</td><td className="num">{fmt(r.rep)}</td><td className={r.gain>0?'up':''}>{r.gain>0?`+${fmt(r.gain)}`:fmt(r.gain)}</td><td>{fmtHours(r.hours)}</td><td>{fmt(r.repPerHour)}</td><td><span className={`status ${r.status}`}>{r.suspicious?'SUSPICIOUS':r.status.toUpperCase()}</span></td></tr>)}</tbody></table>{!rows.length&&<div className="chart-empty">NO LIVE DATA</div>}</div></section>
      <section className="two-col"><div className="panel"><div className="section-title"><div><span className="eyebrow">RECENT REP ACTIVITY</span><h3>LATEST GAINS</h3></div></div><div className="activity">{activity.map((e,i)=><div key={i}><b>{e.member}</b><span className="up">+{fmt(e.gain)}</span><time>{new Date(e.at).toLocaleTimeString()}</time></div>)}{!activity.length&&<div className="chart-empty">NO GAIN EVENTS STORED</div>}</div></div><div className="panel"><div className="section-title"><div><span className="eyebrow">TOP GAINERS TODAY</span><h3>PERFORMANCE</h3></div></div><div className="top-list">{top.map((r,i)=><div key={r.id}><b>{String(i+1).padStart(2,'0')}</b><span>{r.member}</span><strong>+{fmt(r.todayGain)}</strong><em>{fmt(r.repPerHour)}/h</em></div>)}</div></div></section>
      {data.stats.suspiciousCount>0&&<section className="notice bad">{data.stats.suspiciousCount} suspicious REP decrease snapshot(s) retained for audit. No value was discarded.</section>}
    </>}

    {view==='members'&&<section><div className="page-head"><div><span className="eyebrow">ROSTER</span><h1>MEMBER INTELLIGENCE</h1><p>Stable member IDs preserve history even when an IGN changes.</p></div></div><div className="member-grid">{rows.map(r=><button className="member-card" key={r.id} onClick={()=>setSelected(r)}><span className="eyebrow">#{rows.indexOf(r)+1} · LV {r.level}</span><h3>{r.member}</h3><b>{fmt(r.rep)} REP</b><div><span>+{fmt(r.gain)} season</span><span>{fmtHours(r.hours)}h tracked</span></div></button>)}</div></section>}

    {view==='history'&&<section><div className="page-head"><div><span className="eyebrow">SEASON HISTORY</span><h1>IMMUTABLE REPORTS</h1><p>Previous finalized versions remain available for audit.</p></div></div>{finalizations.length?<div className="panel table-panel"><div className="table-scroll"><table><thead><tr><th>SEASON</th><th>VERSION</th><th>FINAL TIMESTAMP</th><th>MEMBERS</th><th>FINAL REP</th><th>GAIN</th><th>HOURS</th><th>REP/H</th></tr></thead><tbody>{finalizations.map(f=><tr key={`${f.season}-${f.version}`}><td>{f.season}</td><td>v{f.version}</td><td>{new Date(f.final_timestamp).toLocaleString()}</td><td>{f.member_count}</td><td>{fmt(f.total_rep)}</td><td>+{fmt(f.season_gain)}</td><td>{fmtHours(f.total_hours)}</td><td>{fmt(f.avg_rep_per_hour)}</td></tr>)}</tbody></table></div></div>:<div className="empty-state compact"><h3>NO FINALIZED SEASONS</h3><p>A final snapshot appears here only after a verified live sync is locked.</p></div>}</section>}

    {view==='final'&&<section><div className="page-head"><div><span className="eyebrow">FINAL RESULTS</span><h1>{latestFinal?.season || data.season}</h1><p>{latestFinal?'FINAL DAY LOCKED':'Not finalized yet'}</p></div>{latestFinal&&<div className="actions"><a className="btn" href={`/api/export?type=final&format=csv&season=${encodeURIComponent(latestFinal.season)}`}>EXPORT CSV</a><a className="btn" href={`/api/export?type=final&format=json&season=${encodeURIComponent(latestFinal.season)}`}>EXPORT JSON</a><button className="btn primary" onClick={()=>window.print()}>PRINT REPORT</button></div>}</div>{latestFinal?<><div className="stats-grid final"><div><span>FINAL REP</span><b>{fmt(latestFinal.total_rep)}</b></div><div><span>TOTAL GAIN</span><b>+{fmt(latestFinal.season_gain)}</b></div><div><span>MEMBERS</span><b>{latestFinal.member_count}</b></div><div><span>TOTAL HOURS</span><b>{fmtHours(latestFinal.total_hours)}</b></div><div><span>AVG REP / HOUR</span><b>{fmt(latestFinal.avg_rep_per_hour)}</b></div><div><span>LOCKED AT</span><b>{new Date(latestFinal.final_timestamp).toLocaleString()}</b></div></div><div className="panel table-panel"><div className="table-scroll"><table><thead><tr><th>RANK</th><th>MEMBER</th><th>LV</th><th>FINAL REP</th><th>GAIN</th><th>HOURS</th><th>REP / HR</th></tr></thead><tbody>{(latestFinal.raw_snapshot?.rows||[]).map((r,i)=><tr key={r.id||i}><td>#{i+1}</td><td>{r.member}</td><td>{r.level}</td><td>{fmt(r.rep)}</td><td>+{fmt(r.gain)}</td><td>{fmtHours(r.hours)}</td><td>{fmt(r.repPerHour)}</td></tr>)}</tbody></table></div></div></>:<div className="empty-state compact"><h3>FINAL DAY NOT LOCKED</h3><p>Locking requires a fresh successful upstream sync and a complete expected roster.</p></div>}</section>}

    {view==='admin'&&<section><div className="page-head"><div><span className="eyebrow">ADMINISTRATION</span><h1>CONTROL ROOM</h1><p>Protected actions. Historical snapshots are never silently replaced.</p></div></div>{adminContent}</section>}

    <footer>Ninja Zenshin Clan REP Tracker · Independent clan administration tool</footer>
    {selected&&<MemberDrawer member={selected} onClose={()=>setSelected(null)}/>} 
    {loginOpen&&<div className="modal-backdrop"><div className="modal"><button className="icon-btn close" onClick={()=>setLoginOpen(false)}>×</button><span className="eyebrow">SECURE ADMIN</span><h3>ADMIN ACCESS</h3><p>Admin actions modify persistent tracking state and finalization status.</p><input autoFocus type="password" value={password} onChange={e=>setPassword(e.target.value)} placeholder="Admin password" onKeyDown={e=>e.key==='Enter'&&login()}/><button className="btn primary full" onClick={login} disabled={busy}>SIGN IN</button></div></div>}
  </main>;
}
