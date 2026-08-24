'use client';

import { useEffect, useMemo, useState } from 'react';
import { getAffectedTargets, getRecoveryAmount, getVictoryResult } from './clan-war-rules';
import WarRulesPanel from './war-rules-panel';

const WATCH_KEY = 'nztracker:watchlist:v2';
const EVENT_KEY = 'nztracker:events:v1';
const EVENT_LIMIT = 30;
const read = (key, fallback) => { try { return JSON.parse(localStorage.getItem(key) || '') ?? fallback; } catch { return fallback; } };
const write = (key, value) => { try { localStorage.setItem(key, JSON.stringify(value)); } catch {} };
const fmt = (n) => Number(n || 0).toLocaleString('en-US');
const time = (value) => new Date(value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });

function pushEvent(event) {
  const old = read(EVENT_KEY, []);
  const next = [event, ...old.filter((item) => !(item.clan === event.clan && item.type === event.type && Math.abs(Number(item.value || 0) - Number(event.value || 0)) < 1 && Date.now() - Number(item.at || 0) < 2500))].slice(0, EVENT_LIMIT);
  write(EVENT_KEY, next);
  return next;
}

export default function WarOps({ rows, server, updated, status }) {
  const [view, setView] = useState('all');
  const [statuses, setStatuses] = useState({});
  const [statusHealth, setStatusHealth] = useState('connecting');
  const [statusUpdated, setStatusUpdated] = useState(null);
  const [watchlist, setWatchlist] = useState([]);
  const [events, setEvents] = useState([]);
  const [ownRep, setOwnRep] = useState('');
  const [targetRep, setTargetRep] = useState('');
  const [partySize, setPartySize] = useState(0);
  const [recoveryTick, setRecoveryTick] = useState(Date.now());

  useEffect(() => {
    setWatchlist(read(WATCH_KEY, []));
    setEvents(read(EVENT_KEY, []).filter((item) => Date.now() - Number(item.at || 0) < 24 * 60 * 60 * 1000));
  }, []);

  useEffect(() => {
    const timer = setInterval(() => setRecoveryTick(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

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
        setStatuses(data.statuses || {});
        setStatusUpdated(new Date(data.fetchedAt || Date.now()));
        setStatusHealth('ok');
        const previous = statuses;
        Object.entries(data.statuses || {}).forEach(([clan, item]) => {
          const old = previous[clan]?.state;
          if (old && old !== item.state) {
            const nextEvents = pushEvent({ clan, type: item.state === 'bleeding' ? 'bleed' : 'recovery', value: item.state, at: Date.now() });
            setEvents(nextEvents);
          }
        });
        if (performance.now() - started > 5000) setStatusHealth('slow');
      } catch {
        if (active) setStatusHealth('error');
      }
    };
    loadStatus();
    const timer = setInterval(loadStatus, 20000);
    return () => { active = false; clearInterval(timer); };
  }, [rows]);

  useEffect(() => {
    if (!rows.length) return;
    const oldMap = new Map(events.filter((item) => item.type === 'gain' || item.type === 'loss').map((item) => [item.clan, item]));
    const stored = read('nztracker:rep-snapshot:v1', {});
    const nextStored = { ...stored };
    let changed = false;
    rows.forEach((row) => {
      const rep = Number(row.reputation || 0);
      const old = Number(stored[row.clan]);
      if (Number.isFinite(old) && rep !== old) {
        const delta = rep - old;
        const event = { clan: row.clan, type: delta > 0 ? 'gain' : 'loss', value: delta, at: Date.now() };
        const nextEvents = pushEvent(event);
        setEvents(nextEvents);
        changed = true;
      }
      nextStored[row.clan] = rep;
      if (!oldMap.has(row.clan)) changed = true;
    });
    if (changed) write('nztracker:rep-snapshot:v1', nextStored);
  }, [rows]);

  const statusEntries = useMemo(() => rows.map((row) => ({ ...row, status: statuses[row.clan] || { state: 'unknown', reason: 'Stamina source unavailable' } })), [rows, statuses]);
  const bleeding = statusEntries.filter((item) => item.status.state === 'bleeding');
  const watched = statusEntries.filter((item) => watchlist.includes(item.clan));
  const warRows = [...rows].sort((a, b) => Number(b.reputation || 0) - Number(a.reputation || 0)).slice(0, 8);
  const visibleRows = view === 'watch' ? watched : view === 'war' ? statusEntries.filter((item) => warRows.some((row) => row.clan === item.clan)) : view === 'bleed' ? bleeding : statusEntries;

  const target = Number(targetRep || 0);
  const own = Number(ownRep || 0);
  const targetBleeding = targetRep !== '' ? statuses[rows.find((row) => Number(row.reputation || 0) === target)?.clan]?.state === 'bleeding' : false;
  const result = targetRep !== '' && ownRep !== '' ? getVictoryResult(own, target, targetBleeding) : null;
  const drainTargets = getAffectedTargets(partySize);
  const nextRecovery = useMemo(() => {
    const date = server || new Date(recoveryTick);
    const d = new Date(date);
    d.setSeconds(0, 0);
    const minute = d.getMinutes();
    d.setMinutes(minute < 30 ? 30 : 60);
    const diff = Math.max(0, d.getTime() - (server ? server.getTime() : recoveryTick));
    return Math.ceil(diff / 1000);
  }, [server, recoveryTick]);
  const recoveryText = `${String(Math.floor(nextRecovery / 60)).padStart(2, '0')}:${String(nextRecovery % 60).padStart(2, '0')}`;

  const toggleWatch = (clan) => {
    const next = watchlist.includes(clan) ? watchlist.filter((name) => name !== clan) : [...watchlist, clan];
    setWatchlist(next);
    write(WATCH_KEY, next);
  };

  const statusLabel = (state) => state === 'bleeding' ? '🔴 BLEEDING' : state === 'healthy' ? '🟢 HEALTHY' : '⚪ UNKNOWN';
  const statusClass = (state) => state === 'bleeding' ? 'bleeding' : state === 'healthy' ? 'healthy' : 'unknown';

  return <section className="war-ops">
    <div className="war-ops-bar">
      {[
        ['all', 'ALL'],
        ['watch', `★ WATCHLIST ${watchlist.length ? `· ${watchlist.length}` : ''}`],
        ['war', '⚔ CLAN WAR'],
        ['bleed', `🔴 BLEEDING ${bleeding.length ? `· ${bleeding.length}` : ''}`]
      ].map(([key, label]) => <button key={key} className={`war-ops-tab ${key === 'bleed' ? 'bleed' : ''} ${view === key ? 'active' : ''}`} onClick={() => setView(key)}>{label}</button>)}
      <span className="war-ops-health">● {statusHealth === 'ok' ? 'STAMINA SOURCE OK' : statusHealth === 'slow' ? 'SOURCE SLOW' : statusHealth === 'error' ? 'STAMINA SOURCE ERROR' : 'CHECKING STAMINA'}</span>
    </div>

    <div className="war-ops-grid">
      <div className="war-ops-panel">
        <div className="war-ops-head"><h3>🔴 BLEEDING NOW</h3><small>{bleeding.length} CLANS</small></div>
        <div className="war-status-list">
          {bleeding.slice(0, 8).map((item) => <button key={item.clan} className="war-status-item" onClick={() => document.querySelector(`[data-clan-open="${CSS.escape(item.clan)}"]`)?.click()}>
            <span><span className="war-status-name">{item.clan}</span><span className="war-status-meta">{item.status.bleedingMembers || 0}/{item.status.memberCount || item.memberCurrent || 0} members at/below threshold · threshold scales to 70% Max STA</span></span>
            <span className="war-badge bleeding">BLEEDING</span>
          </button>)}
          {!bleeding.length && <div className="empty">{statusHealth === 'ok' ? 'No confirmed Bleeding clans.' : 'Waiting for stamina data.'}</div>}
        </div>
        <div className="war-data"><span className={statusHealth === 'ok' ? 'ok' : 'warn'}>● Source: {statusHealth}</span><span>{statusUpdated ? `Stamina update ${time(statusUpdated)}` : 'No status update yet'}</span></div>
      </div>

      <div className="war-ops-panel">
        <div className="war-ops-head"><h3>⚡ LIVE EVENT FEED</h3><small>LAST 30 EVENTS</small></div>
        <div className="war-ops-list">
          {events.slice(0, 10).map((event, index) => <div className="war-event" key={`${event.clan}-${event.at}-${index}`}><span className="war-event-time">{time(event.at)}</span><span className="war-event-name">{event.clan}</span><span className={`war-event-value ${event.type === 'gain' ? 'up' : event.type === 'loss' ? 'down' : event.type === 'bleed' ? 'bleed' : event.type === 'rank' ? 'rank' : 'ready'}`}>{event.type === 'gain' ? `+${fmt(event.value)} REP` : event.type === 'loss' ? `−${fmt(Math.abs(event.value))} REP` : event.type === 'bleed' ? '🔴 BLEED' : event.type === 'recovery' ? '🟢 CLEARED' : event.type === 'rank' ? `${event.value}` : 'EVENT'}</span></div>)}
          {!events.length && <div className="empty">Waiting for the first live event…</div>}
        </div>
      </div>
    </div>

    <div className="war-ops-grid">
      <div className="war-ops-panel">
        <div className="war-ops-head"><h3>⚔ WAR CALCULATOR</h3><small>VICTORY ONLY</small></div>
        <div className="war-calculator">
          <div className="war-calc-grid"><div className="war-calc-field"><label>YOUR CLAN REP</label><input inputMode="numeric" value={ownRep} onChange={(e) => setOwnRep(e.target.value.replace(/[^0-9]/g, ''))} placeholder="267419" /></div><div className="war-calc-field"><label>TARGET CLAN REP</label><input inputMode="numeric" value={targetRep} onChange={(e) => setTargetRep(e.target.value.replace(/[^0-9]/g, ''))} placeholder="255902" /></div></div>
          <div className="war-calc-field"><label>PARTY MEMBERS</label><div className="war-party">{[0,1,2].map((size) => <button key={size} className={partySize === size ? 'active' : ''} onClick={() => setPartySize(size)}>{size === 0 ? 'SOLO' : `+${size} PARTY`}</button>)}</div></div>
          <div className="war-result"><div className="war-result-item"><small>REP DIFFERENCE</small><b>{result ? `${result.difference >= 0 ? '+' : '−'}${fmt(Math.abs(result.difference))}` : '—'}</b></div><div className="war-result-item"><small>RESULT</small><b>{result ? result.won ? '✅ WIN' : '❌ LOSS' : '—'}</b></div><div className="war-result-item"><small>REWARD</small><b>{result ? `${result.reputation} REP` : '—'}</b></div><div className="war-result-item"><small>DRAIN</small><b>{drainTargets} × 10 STA</b></div></div>
          {result && !targetBleeding && <div className="member-reason">Target is not confirmed Bleeding. Quick Battle = loss and 0 Reputation.</div>}
          {result?.won && <div className="member-reason">Target is confirmed Bleeding. Victory reward is based on the Reputation difference tier.</div>}
        </div>
      </div>

      <div className="war-ops-panel">
        <div className="war-ops-head"><h3>⭐ WATCHLIST</h3><small>{watched.length} WATCHED</small></div>
        <div className="war-status-list">
          {watched.slice(0, 8).map((item) => <div className="war-status-item" key={item.clan}><span><span className="war-status-name">{item.clan}</span><span className="war-status-meta">{item.status.state === 'bleeding' ? `${item.status.bleedingMembers}/${item.status.memberCount} below threshold` : item.status.reason || 'Status available'}</span></span><button className="war-badge unknown" onClick={() => toggleWatch(item.clan)}>★ REMOVE</button></div>)}
          {!watched.length && <div className="empty">Star clans from the tracker to monitor them here.</div>}
        </div>
      </div>
    </div>

    <div className="war-ops-panel">
      <div className="war-ops-head"><h3>🛡 DATA HEALTH & RECOVERY</h3><small>{updated ? `RANKING ${time(updated)}` : 'WAITING'}</small></div>
      <div className="war-data"><span className={status === 'live' ? 'ok' : 'warn'}>● Ranking API: {status === 'live' ? 'OK' : status.toUpperCase()}</span><span className={statusHealth === 'ok' ? 'ok' : 'warn'}>● Stamina API: {statusHealth.toUpperCase()}</span><span>● Discord: configured server-side</span><span>● Watchlist: local</span></div>
      <div className="war-recovery"><span>NEXT STAMINA RECOVERY · SERVER TIME (:00 / :30)</span><b>{recoveryText}</b></div>
    </div>

    <WarRulesPanel />

    {view !== 'all' && <div className="mobile-clan-list">{visibleRows.slice(0, 8).map((item) => <button key={item.clan} className="mobile-clan-card" onClick={() => document.querySelector(`[data-clan-open="${CSS.escape(item.clan)}"]`)?.click()}><div className="mobile-clan-top"><span><span className="mobile-clan-name">#{item.rank} {item.clan}</span><span className="mobile-clan-sub">{item.master || 'Clan Master'}</span></span><span className={`war-badge ${statusClass(item.status.state)}`}>{statusLabel(item.status.state)}</span></div><div className="mobile-clan-stats"><span className="mobile-clan-stat"><small>MEMBERS</small><b>{item.memberCurrent}/{item.memberMax}</b></span><span className="mobile-clan-stat"><small>REPUTATION</small><b>{fmt(item.reputation)}</b></span><span className="mobile-clan-stat"><small>GAIN</small><b>+—</b></span></div></button>)}</div>}
  </section>;
}
