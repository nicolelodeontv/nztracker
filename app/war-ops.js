'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { getAffectedTargets, getVictoryResult } from './clan-war-rules';
import WarRulesPanel from './war-rules-panel';

const WATCH_KEY = 'nztracker:watchlist:v2';
const EVENT_KEY = 'nztracker:events:v1';
const SETTINGS_KEY = 'nztracker:settings:v6';
const EVENT_LIMIT = 30;
const read = (key, fallback) => { try { return JSON.parse(localStorage.getItem(key) || '') ?? fallback; } catch { return fallback; } };
const write = (key, value) => { try { localStorage.setItem(key, JSON.stringify(value)); } catch {} };
const fmt = (n) => Number(n || 0).toLocaleString('en-US');
const time = (value) => new Date(value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });

function pushEvent(event) {
  const old = read(EVENT_KEY, []);
  const next = [event, ...old.filter((item) => !(item.clan === event.clan && item.type === event.type && String(item.value) === String(event.value) && Date.now() - Number(item.at || 0) < 2500))].slice(0, EVENT_LIMIT);
  write(EVENT_KEY, next);
  return next;
}

export default function WarOps({ rows, server, updated, status, onOpenClan }) {
  const [view, setView] = useState('all');
  const [statuses, setStatuses] = useState({});
  const statusesRef = useRef({});
  const [statusHealth, setStatusHealth] = useState('connecting');
  const [statusUpdated, setStatusUpdated] = useState(null);
  const [watchlist, setWatchlist] = useState([]);
  const [events, setEvents] = useState([]);
  const [ownRep, setOwnRep] = useState('');
  const [targetClan, setTargetClan] = useState('');
  const [partySize, setPartySize] = useState(0);
  const [focusClan, setFocusClan] = useState('');
  const [recoveryTick, setRecoveryTick] = useState(Date.now());
  const [discordAlerts, setDiscordAlerts] = useState(false);

  useEffect(() => {
    setWatchlist(read(WATCH_KEY, []));
    setEvents(read(EVENT_KEY, []).filter((item) => Date.now() - Number(item.at || 0) < 24 * 60 * 60 * 1000));
    setDiscordAlerts(Boolean(read(SETTINGS_KEY, {}).discordAlerts));
  }, []);

  useEffect(() => {
    const timer = setInterval(() => setRecoveryTick(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const sendDiscord = async (payload) => {
    if (!discordAlerts) return;
    try { await fetch('/api/discord/attack-summary', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }); } catch {}
  };

  useEffect(() => {
    let active = true;
    const loadStatus = async () => {
      if (!rows.length) return;
      try {
        const names = rows.map((row) => row.clan).filter(Boolean).slice(0, 25).map(encodeURIComponent).join(',');
        const started = performance.now();
        const response = await fetch(`/api/clan-status?clans=${names}&t=${Date.now()}`, { cache: 'no-store' });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();
        if (!active) return;
        const nextStatuses = data.statuses || {};
        const previous = statusesRef.current;
        Object.entries(nextStatuses).forEach(([clan, item]) => {
          const oldState = previous[clan]?.state;
          if (oldState && oldState !== item.state) {
            const eventType = item.state === 'bleeding' ? 'bleed' : item.state === 'healthy' ? 'recovery' : 'status';
            setEvents(pushEvent({ clan, type: eventType, value: item.state, at: Date.now() }));
            if (item.state === 'bleeding') sendDiscord({ type: 'bleeding', stage: 'detected', clan, timestamp: new Date().toISOString() });
            if (oldState === 'bleeding' && item.state === 'healthy') sendDiscord({ type: 'bleed_cleared', clan, timestamp: new Date().toISOString() });
          }
          if (item.state === 'bleeding' && oldState === 'bleeding') {
            const mins = Number.isFinite(Number(data.remainingSeconds)) && Number(data.remainingSeconds) > 0 ? Math.ceil(Number(data.remainingSeconds) / 60) : null;
            if (mins === 12 || mins === 6) sendDiscord({ type: 'bleeding', stage: `${mins}m`, clan, remainingSeconds: data.remainingSeconds, timestamp: new Date().toISOString() });
          }
        });
        statusesRef.current = nextStatuses;
        setStatuses(nextStatuses);
        setStatusUpdated(new Date(data.fetchedAt || Date.now()));
        setStatusHealth(performance.now() - started > 5000 ? 'slow' : 'ok');
        if (!focusClan) {
          const firstBleeding = Object.values(nextStatuses).find((item) => item.state === 'bleeding');
          if (firstBleeding?.clan) setFocusClan(firstBleeding.clan);
        }
      } catch { if (active) setStatusHealth('error'); }
    };
    loadStatus();
    const timer = setInterval(loadStatus, 20000);
    return () => { active = false; clearInterval(timer); };
  }, [rows, focusClan, discordAlerts]);

  useEffect(() => {
    if (!rows.length) return;
    const stored = read('nztracker:rep-snapshot:v1', {});
    const nextStored = { ...stored };
    const rankStored = read('nztracker:rank-snapshot:v1', {});
    const nextRankStored = { ...rankStored };
    rows.forEach((row) => {
      const rep = Number(row.reputation || 0);
      const oldRep = Number(stored[row.clan]);
      if (Number.isFinite(oldRep) && rep !== oldRep) setEvents(pushEvent({ clan: row.clan, type: rep > oldRep ? 'gain' : 'loss', value: rep - oldRep, at: Date.now() }));
      const rank = Number(row.rank || 0);
      const oldRank = Number(rankStored[row.clan]);
      if (Number.isFinite(oldRank) && oldRank > 0 && rank !== oldRank) setEvents(pushEvent({ clan: row.clan, type: 'rank', value: `#${oldRank} → #${rank}`, at: Date.now() }));
      nextStored[row.clan] = rep;
      nextRankStored[row.clan] = rank;
    });
    write('nztracker:rep-snapshot:v1', nextStored);
    write('nztracker:rank-snapshot:v1', nextRankStored);
  }, [rows]);

  const statusEntries = useMemo(() => rows.map((row) => ({ ...row, status: statuses[row.clan] || { state: 'unknown', reason: 'Stamina source unavailable' } })), [rows, statuses]);
  const bleeding = statusEntries.filter((item) => item.status.state === 'bleeding');
  const watched = statusEntries.filter((item) => watchlist.includes(item.clan));
  const warRows = [...rows].sort((a, b) => Number(b.reputation || 0) - Number(a.reputation || 0)).slice(0, 8);
  const visibleRows = view === 'watch' ? watched : view === 'war' ? statusEntries.filter((item) => warRows.some((row) => row.clan === item.clan)) : view === 'bleed' ? bleeding : statusEntries;

  const target = statusEntries.find((item) => item.clan === targetClan);
  const own = Number(ownRep || 0);
  const targetRep = Number(target?.reputation || 0);
  const targetState = target?.status?.state || 'unknown';
  const result = target && ownRep !== '' && targetState !== 'unknown' ? getVictoryResult(own, targetRep, targetState === 'bleeding') : null;
  const drainTargets = getAffectedTargets(partySize);

  const nextRecovery = useMemo(() => {
    const base = server ? new Date(server) : new Date(recoveryTick);
    base.setSeconds(0, 0);
    const minute = base.getMinutes();
    base.setMinutes(minute < 30 ? 30 : 60);
    return Math.max(0, Math.ceil((base.getTime() - (server ? server.getTime() : recoveryTick)) / 1000));
  }, [server, recoveryTick]);
  const recoveryText = `${String(Math.floor(nextRecovery / 60)).padStart(2, '0')}:${String(nextRecovery % 60).padStart(2, '0')}`;
  const focus = focusClan ? statuses[focusClan] : null;

  const toggleWatch = (clan) => {
    const next = watchlist.includes(clan) ? watchlist.filter((name) => name !== clan) : [...watchlist, clan];
    setWatchlist(next);
    write(WATCH_KEY, next);
  };
  const toggleDiscord = (enabled) => {
    setDiscordAlerts(enabled);
    write(SETTINGS_KEY, { ...read(SETTINGS_KEY, {}), discordAlerts: enabled });
  };
  const statusLabel = (state) => state === 'bleeding' ? '🔴 BLEEDING' : state === 'healthy' ? '🟢 HEALTHY' : '⚪ UNKNOWN';
  const statusClass = (state) => state === 'bleeding' ? 'bleeding' : state === 'healthy' ? 'healthy' : 'unknown';
  const open = (clan) => { setFocusClan(clan); onOpenClan?.(rows.find((row) => row.clan === clan)); };

  return <section className="war-ops">
    <div className="war-ops-bar">{[['all','ALL'],['watch',`★ WATCHLIST ${watchlist.length ? `· ${watchlist.length}` : ''}`],['war','⚔ CLAN WAR'],['bleed',`🔴 BLEEDING ${bleeding.length ? `· ${bleeding.length}` : ''}`]].map(([key,label]) => <button key={key} className={`war-ops-tab ${key === 'bleed' ? 'bleed' : ''} ${view === key ? 'active' : ''}`} onClick={() => setView(key)}>{label}</button>)}<span className="war-ops-health">● {statusHealth === 'ok' ? 'STAMINA SOURCE OK' : statusHealth === 'slow' ? 'SOURCE SLOW' : statusHealth === 'error' ? 'STAMINA SOURCE ERROR' : 'CHECKING STAMINA'}</span></div>

    <div className="war-ops-grid">
      <div className="war-ops-panel"><div className="war-ops-head"><h3>🔴 BLEEDING NOW</h3><small>{bleeding.length} CLANS</small></div><div className="war-status-list">{bleeding.slice(0,8).map((item)=><button key={item.clan} className="war-status-item" onClick={()=>open(item.clan)}><span><span className="war-status-name">{item.clan}</span><span className="war-status-meta">{item.status.bleedingMembers||0}/{item.status.memberCount||item.memberCurrent||0} members at/below individual 70% threshold</span></span><span className="war-badge bleeding">BLEEDING</span></button>)}{!bleeding.length&&<div className="empty">{statusHealth==='ok'?'No confirmed Bleeding clans.':'Waiting for stamina data.'}</div>}</div><div className="war-data"><span className={statusHealth==='ok'?'ok':'warn'}>● Source: {statusHealth}</span><span>{statusUpdated?`Stamina update ${time(statusUpdated)}`:'No status update yet'}</span></div></div>

      <div className="war-ops-panel"><div className="war-ops-head"><h3>⚡ LIVE EVENT FEED</h3><small>LAST 30 EVENTS</small></div><div className="war-ops-list">{events.slice(0,10).map((event,index)=><div className="war-event" key={`${event.clan}-${event.at}-${index}`}><span className="war-event-time">{time(event.at)}</span><span className="war-event-name">{event.clan}</span><span className={`war-event-value ${event.type==='gain'?'up':event.type==='loss'?'down':event.type==='bleed'?'bleed':event.type==='rank'?'rank':'ready'}`}>{event.type==='gain'?`+${fmt(event.value)} REP`:event.type==='loss'?`−${fmt(Math.abs(event.value))} REP`:event.type==='bleed'?'🔴 BLEED':event.type==='recovery'?'🟢 CLEARED':event.type==='rank'?event.value:'EVENT'}</span></div>)}{!events.length&&<div className="empty">Waiting for the first live event…</div>}</div></div>
    </div>

    <div className="war-ops-grid">
      <div className="war-ops-panel"><div className="war-ops-head"><h3>⚔ WAR CALCULATOR</h3><small>VICTORY ONLY</small></div><div className="war-calculator"><div className="war-calc-grid"><div className="war-calc-field"><label>YOUR CLAN REP</label><input inputMode="numeric" value={ownRep} onChange={(e)=>setOwnRep(e.target.value.replace(/[^0-9]/g,''))} placeholder="267419"/></div><div className="war-calc-field"><label>TARGET CLAN</label><select value={targetClan} onChange={(e)=>setTargetClan(e.target.value)}><option value="">Select target…</option>{rows.map((row)=><option key={row.clan} value={row.clan}>{row.clan} · {fmt(row.reputation)}</option>)}</select></div></div><div className="war-calc-field"><label>PARTY MEMBERS</label><div className="war-party">{[0,1,2].map((size)=><button key={size} className={partySize===size?'active':''} onClick={()=>setPartySize(size)}>{size===0?'SOLO':`+${size} PARTY`}</button>)}</div></div><div className="war-result"><div className="war-result-item"><small>REP DIFFERENCE</small><b>{result?`${result.difference>=0?'+':'−'}${fmt(Math.abs(result.difference))}`:'—'}</b></div><div className="war-result-item"><small>RESULT</small><b>{result?(result.won?'✅ WIN':'❌ LOSS'):targetState==='unknown'&&targetClan?'⚪ UNKNOWN':'—'}</b></div><div className="war-result-item"><small>REWARD</small><b>{result?`${result.reputation} REP`:targetState==='unknown'&&targetClan?'UNKNOWN':'—'}</b></div><div className="war-result-item"><small>DRAIN</small><b>{drainTargets} × 10 STA</b></div></div>{targetState==='unknown'&&targetClan&&<div className="member-reason">The source does not expose enough Stamina data to verify Bleeding, so the calculator will not invent a win/loss result.</div>}{result&&targetState!=='bleeding'&&<div className="member-reason">Target is not Bleeding. Quick Battle = loss and 0 Reputation.</div>}{result?.won&&<div className="member-reason">Target is Bleeding. Victory reward follows the current Reputation-difference tier.</div>}</div></div>

      <div className="war-ops-panel"><div className="war-ops-head"><h3>⭐ WATCHLIST</h3><small>{watched.length} WATCHED</small></div><div className="war-status-list">{watched.slice(0,8).map((item)=><div className="war-status-item" key={item.clan}><button className="war-feed-click" onClick={()=>open(item.clan)}><span className="war-status-name">{item.clan}</span><span className="war-status-meta">{statusLabel(item.status.state)} · {item.status.state==='bleeding'?`${item.status.bleedingMembers}/${item.status.memberCount} below threshold`:item.status.reason||'Healthy'}</span></button><button className="war-badge unknown" onClick={()=>toggleWatch(item.clan)}>★ REMOVE</button></div>)}{!watched.length&&<div className="empty">Add clans to your Watchlist from the main ranking.</div>}</div></div>
    </div>

    <div className="war-ops-panel"><div className="war-ops-head"><h3>🩸 STAMINA BREAKDOWN</h3><small>{focus?focusClan:'SELECT A CLAN'}</small></div>{focus?.staminaAvailable?<div className="war-ops-list">{(focus.members||[]).slice().sort((a,b)=>Number(a.current)-Number(b.current)).map((member)=><div className="war-status-item" key={member.name}><span><span className="war-status-name">{member.name}</span><span className="war-status-meta">Max {fmt(member.max)} · 70% threshold {fmt(member.bleedingThreshold)} · 50% floor {fmt(member.drainFloor)}</span></span><strong className={`member-stamina ${member.bleeding?'bleed':'healthy'}`}>{fmt(member.current)} / {fmt(member.max)}</strong></div>)}</div>:<div className="member-reason">{focus?.reason||'Select a clan from Bleeding Now or Watchlist. If Stamina is not exposed by the source, the state remains UNKNOWN.'}</div>}</div>

    <div className="war-ops-panel"><div className="war-ops-head"><h3>🛡 DATA HEALTH & RECOVERY</h3><small>{updated?`RANKING ${time(updated)}`:'WAITING'}</small></div><div className="war-data"><span className={status==='live'?'ok':'warn'}>● Ranking API: {status==='live'?'OK':status.toUpperCase()}</span><span className={statusHealth==='ok'?'ok':'warn'}>● Stamina API: {statusHealth.toUpperCase()}</span><label className="war-discord-toggle"><input type="checkbox" checked={discordAlerts} onChange={(e)=>toggleDiscord(e.target.checked)}/> Discord Bleed Lifecycle</label><span>● Watchlist: local</span></div><div className="war-recovery"><span>NEXT STAMINA RECOVERY · SERVER TIME (:00 / :30)</span><b>{recoveryText}</b></div></div>

    <WarRulesPanel />

    {view!=='all'&&<div className="mobile-clan-list">{visibleRows.slice(0,8).map((item)=><button key={item.clan} className="mobile-clan-card" onClick={()=>open(item.clan)}><div className="mobile-clan-top"><span><span className="mobile-clan-name">#{item.rank} {item.clan}</span><span className="mobile-clan-sub">{item.master||'Clan Master'}</span></span><span className={`war-badge ${statusClass(item.status.state)}`}>{statusLabel(item.status.state)}</span></div><div className="mobile-clan-stats"><span className="mobile-clan-stat"><small>MEMBERS</small><b>{item.memberCurrent}/{item.memberMax}</b></span><span className="mobile-clan-stat"><small>REPUTATION</small><b>{fmt(item.reputation)}</b></span><span className="mobile-clan-stat"><small>STATUS</small><b>{statusLabel(item.status.state)}</b></span></div></button>)}</div>}
  </section>;
}
