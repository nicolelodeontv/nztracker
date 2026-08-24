'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { getAffectedTargets, getVictoryResult } from './clan-war-rules';
import WarRulesPanel from './war-rules-panel';
import './war-dashboard.css';

const SETTINGS_KEY = 'nztracker:settings:v6';
const RANK_KEY = 'nztracker:war-ranks:v1';
const EVENT_KEY = 'nztracker:events:v2';
const read = (key, fallback) => { try { return JSON.parse(localStorage.getItem(key) || '') ?? fallback; } catch { return fallback; } };
const write = (key, value) => { try { localStorage.setItem(key, JSON.stringify(value)); } catch {} };
const fmt = (n) => Number(n || 0).toLocaleString('en-US');
const clock = (value) => new Date(value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });

function statusMeta(item) {
  const state = item?.state || 'unknown';
  if (state === 'bleeding') return { label: '🔴 BLEEDING', className: 'bleeding' };
  if (state === 'potential-bleeding') return { label: '🟡 POTENTIAL BLEED', className: 'potential' };
  if (state === 'healthy') return { label: '🟢 HEALTHY', className: 'healthy' };
  return { label: '⚪ UNKNOWN', className: 'unknown' };
}

export default function WarDashboard({ rows, server, status, updated }) {
  const [statuses, setStatuses] = useState({});
  const [sourceHealth, setSourceHealth] = useState('checking');
  const [lastStatus, setLastStatus] = useState(null);
  const [events, setEvents] = useState([]);
  const [eventFilter, setEventFilter] = useState('all');
  const [targetClan, setTargetClan] = useState('');
  const [ownRep, setOwnRep] = useState('');
  const [party, setParty] = useState(0);
  const [discord, setDiscord] = useState(false);
  const [discordMsg, setDiscordMsg] = useState('');
  const [watchlist, setWatchlist] = useState([]);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const settings = read(SETTINGS_KEY, {});
    setDiscord(Boolean(settings.discordAlerts));
    setWatchlist(read('nztracker:watchlist:v2', []));
    setEvents(read(EVENT_KEY, []).slice(0, 50));
  }, []);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const saveEvent = useCallback((event) => {
    setEvents((current) => {
      const next = [{ ...event, at: event.at || Date.now() }, ...current].slice(0, 50);
      write(EVENT_KEY, next);
      return next;
    });
  }, []);

  const sendDiscord = useCallback(async (payload) => {
    try {
      const response = await fetch('/api/discord/attack-summary', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      return response.ok;
    } catch { return false; }
  }, []);

  const testDiscord = async () => {
    setDiscordMsg('Sending test…');
    const ok = await sendDiscord({ type: 'test', stage: 'test', clan: 'CHAOS Tracker', timestamp: new Date().toISOString() });
    setDiscordMsg(ok ? 'Test sent' : 'Test failed');
  };

  useEffect(() => {
    if (!rows.length) return;
    let active = true;
    const load = async () => {
      try {
        const clans = rows.map((r) => r.clan).filter(Boolean).slice(0, 40).map(encodeURIComponent).join(',');
        const started = performance.now();
        const response = await fetch(`/api/clan-status?clans=${clans}&t=${Date.now()}`, { cache: 'no-store' });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();
        if (!active) return;
        setStatuses(data.statuses || {});
        setLastStatus(new Date(data.fetchedAt || Date.now()));
        setSourceHealth(performance.now() - started > 5000 ? 'slow' : 'ok');
      } catch { if (active) setSourceHealth('error'); }
    };
    load();
    const timer = setInterval(load, 20000);
    return () => { active = false; clearInterval(timer); };
  }, [rows]);

  useEffect(() => {
    const oldRanks = read(RANK_KEY, {});
    const next = { ...oldRanks };
    rows.forEach((row) => {
      const rank = Number(row.rank || 0);
      const old = Number(oldRanks[row.clan] || 0);
      if (old && rank && rank !== old) saveEvent({ clan: row.clan, type: 'rank', value: `#${old} → #${rank}` });
      next[row.clan] = rank;
    });
    write(RANK_KEY, next);
  }, [rows, saveEvent]);

  const entries = useMemo(() => rows.map((row) => ({ ...row, status: statuses[row.clan] || { state: 'unknown', reason: 'Stamina source unavailable' } })), [rows, statuses]);
  const bleeding = entries.filter((row) => row.status.state === 'bleeding');
  const potential = entries.filter((row) => row.status.state === 'potential-bleeding');
  const healthy = entries.filter((row) => row.status.state === 'healthy');

  const bestTargets = useMemo(() => entries
    .filter((row) => row.status.state === 'bleeding')
    .map((row) => ({ ...row, difference: ownRep === '' ? null : Number(ownRep) - Number(row.reputation || 0), reward: ownRep === '' ? null : getVictoryResult(Number(ownRep), Number(row.reputation || 0), true)?.reputation }))
    .sort((a, b) => (Number(b.reward ?? -1) - Number(a.reward ?? -1)) || (Number(b.reputation || 0) - Number(a.reputation || 0)))
    .slice(0, 8), [entries, ownRep]);

  const target = entries.find((row) => row.clan === targetClan);
  const targetState = target?.status?.state || 'unknown';
  const result = target && ownRep !== '' && targetState !== 'unknown' && targetState !== 'potential-bleeding'
    ? getVictoryResult(Number(ownRep), Number(target.reputation || 0), targetState === 'bleeding')
    : null;
  const ready = Boolean(result?.won);
  const drain = getAffectedTargets(party);

  const filteredEvents = eventFilter === 'all' ? events : events.filter((event) => event.type === eventFilter);
  const recoverySeconds = useMemo(() => {
    const base = server ? new Date(server) : new Date(now);
    base.setSeconds(0, 0);
    base.setMinutes(base.getMinutes() < 30 ? 30 : 60);
    return Math.max(0, Math.ceil((base.getTime() - (server ? server.getTime() : now)) / 1000));
  }, [server, now]);
  const recovery = `${String(Math.floor(recoverySeconds / 60)).padStart(2, '0')}:${String(recoverySeconds % 60).padStart(2, '0')}`;

  const toggleWatch = (clan) => {
    const next = watchlist.includes(clan) ? watchlist.filter((x) => x !== clan) : [...watchlist, clan];
    setWatchlist(next);
    write('nztracker:watchlist:v2', next);
  };

  return <section className="war-dashboard">
    <div className="war-summary-grid">
      <div className="war-summary-card danger"><small>CONFIRMED BLEEDING</small><b>{bleeding.length}</b><span>full stamina verification</span></div>
      <div className="war-summary-card warning"><small>POTENTIAL BLEED</small><b>{potential.length}</b><span>partial stamina evidence</span></div>
      <div className="war-summary-card healthy"><small>HEALTHY</small><b>{healthy.length}</b><span>verified clans</span></div>
      <div className="war-summary-card"><small>STAMINA SOURCE</small><b>{sourceHealth === 'ok' ? 'OK' : sourceHealth.toUpperCase()}</b><span>{lastStatus ? `updated ${clock(lastStatus)}` : 'checking source'}</span></div>
    </div>

    <div className="war-main-grid">
      <section className="war-panel best-targets">
        <div className="war-panel-head"><div><small>DECISION CENTER</small><h2>⚔ Best Targets</h2></div><span>sorted by expected reward</span></div>
        <div className="war-input-row"><label>Your Clan Reputation<input value={ownRep} onChange={(e) => setOwnRep(e.target.value.replace(/[^0-9]/g, ''))} placeholder="267419" /></label><label>Party Size<div className="party-toggle">{[0,1,2].map((n)=><button key={n} className={party===n?'active':''} onClick={()=>setParty(n)}>{n===0?'SOLO':`+${n}`}</button>)}</div></label></div>
        <div className="target-list">{bestTargets.map((row, index) => <button key={row.clan} className="target-row" onClick={()=>setTargetClan(row.clan)}><span className="target-rank">#{index+1}</span><span className="target-name"><b>{row.clan}</b><small>{row.status.bleedingMembers || 0}/{row.status.memberCount || 0} members below individual threshold</small></span><span className="target-reward">{row.reward == null ? '—' : `${row.reward} REP`}</span><span className="target-arrow">→</span></button>)}{!bestTargets.length && <div className="war-empty">No confirmed Bleeding targets are currently available.</div>}</div>
      </section>

      <section className="war-panel attack-card">
        <div className="war-panel-head"><div><small>ATTACK PLANNER</small><h2>Attack Decision</h2></div>{target && <span className={`decision decision-${ready?'ready':targetState==='unknown'||targetState==='potential-bleeding'?'unknown':'blocked'}`}>{ready?'ATTACK READY':targetState==='unknown'||targetState==='potential-bleeding'?'NEEDS STAMINA':'DO NOT ATTACK'}</span>}</div>
        <label className="full-label">Target Clan<select value={targetClan} onChange={(e)=>setTargetClan(e.target.value)}><option value="">Select target…</option>{entries.map((row)=><option key={row.clan} value={row.clan}>{row.clan} · {fmt(row.reputation)}</option>)}</select></label>
        <div className="decision-grid"><div><small>STATUS</small><b>{target ? statusMeta(target.status).label : '—'}</b></div><div><small>REP DIFF</small><b>{result ? `${result.difference >= 0 ? '+' : '−'}${fmt(Math.abs(result.difference))}` : '—'}</b></div><div><small>REWARD</small><b>{result ? `${result.reputation} REP` : targetState==='unknown' || targetState==='potential-bleeding' ? 'UNKNOWN' : '0 REP'}</b></div><div><small>DRAIN</small><b>{drain} TARGET{drain === 1 ? '' : 'S'}</b></div></div>
        <div className="decision-note">{ready ? `Target is confirmed Bleeding. Quick Battle victory reward is ${result.reputation} Reputation.` : targetState === 'potential-bleeding' ? 'Potential Bleed is not enough to authorize an attack. Wait for full stamina verification.' : targetState === 'unknown' ? 'Stamina data is unavailable. The tracker will not invent an attack result.' : target ? 'Target is not Bleeding. Quick Battle results in 0 Reputation.' : 'Select a target to calculate the attack.'}</div>
      </section>
    </div>

    <div className="war-main-grid">
      <section className="war-panel"><div className="war-panel-head"><div><small>LIVE ACTIVITY</small><h2>⚡ Event Feed</h2></div><div className="feed-filters">{[['all','ALL'],['gain','REP'],['rank','RANK'],['bleed','BLEED'],['recovery','RECOVERY']].map(([key,label])=><button key={key} className={eventFilter===key?'active':''} onClick={()=>setEventFilter(key)}>{label}</button>)}</div></div><div className="event-list">{filteredEvents.slice(0,14).map((event,index)=><div className="event-row" key={`${event.clan}-${event.at}-${index}`}><span>{clock(event.at)}</span><b>{event.clan}</b><em className={event.type}>{event.type==='gain'?`+${fmt(event.value)} REP`:event.type==='loss'?`−${fmt(Math.abs(event.value))} REP`:event.type==='rank'?event.value:event.type==='bleed'?'🔴 BLEED':event.type==='recovery'?'🟢 CLEARED':'STATUS'}</em></div>)}{!filteredEvents.length&&<div className="war-empty">No matching events yet.</div>}</div></section>
      <section className="war-panel"><div className="war-panel-head"><div><small>MONITORING</small><h2>★ Watchlist</h2></div><span>{watchlist.length} watched</span></div><div className="watch-list">{entries.filter((row)=>watchlist.includes(row.clan)).map((row)=><div className="watch-row" key={row.clan}><button onClick={()=>setTargetClan(row.clan)}><b>{row.clan}</b><small>{statusMeta(row.status).label}</small></button><button className="watch-remove" onClick={()=>toggleWatch(row.clan)}>★</button></div>)}{!watchlist.length&&<div className="war-empty">Use the Watch control on Clan Intelligence to monitor a clan here.</div>}</div></section>
    </div>

    <div className="war-main-grid">
      <section className="war-panel"><div className="war-panel-head"><div><small>RECOVERY SYSTEM</small><h2>⏱ Recovery Timeline</h2></div><b className="recovery-clock">{recovery}</b></div><div className="recovery-box"><span>Next server recovery</span><strong>:00 / :30</strong><small>Base +30 Stamina · Ramen +10 per level</small></div><div className="health-row"><span>Ranking API</span><b className={status==='live'?'ok':'bad'}>● {status==='live'?'OK':status.toUpperCase()}</b><span>Stamina API</span><b className={sourceHealth==='ok'?'ok':sourceHealth==='slow'?'warn':'bad'}>● {sourceHealth.toUpperCase()}</b></div></section>
      <section className="war-panel"><div className="war-panel-head"><div><small>DISCORD</small><h2>CHAOS Tracker - Bot</h2></div><b className="discord-state">{discord?'ENABLED':'OFF'}</b></div><div className="discord-controls"><label><input type="checkbox" checked={discord} onChange={(e)=>{const on=e.target.checked;setDiscord(on);write(SETTINGS_KEY,{...read(SETTINGS_KEY,{}),discordAlerts:on});}}/> Bleeding lifecycle alerts</label><button onClick={testDiscord}>Test Alert</button><span>{discordMsg}</span></div><small className="discord-help">Detected → ~12 min → ~6 min → Cleared. Alerts remain state-based to prevent duplicates.</small></section>
    </div>

    <WarRulesPanel />
  </section>;
}
