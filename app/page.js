'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import './tracker.css';

const REFRESH_MS = 3000;
const END_DEFAULT = '2026-09-14T00:00:00+08:00';
const HISTORY_KEY = 'nztracker:history:v6';
const SETTINGS_KEY = 'nztracker:settings:v6';
const BLEED_KEY = 'nztracker:bleed:v1';
const BLEED_COOLDOWN = 30 * 60 * 1000;

const fmt = (n) => new Intl.NumberFormat('en-US').format(Number(n || 0));
const time = (v) => v ? new Date(v).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '—';
const read = (k, d) => { try { return JSON.parse(localStorage.getItem(k) || '') || d; } catch { return d; } };
const write = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };

function saveClanHistory(rows) {
  const h = read(HISTORY_KEY, { clans: [], members: {} });
  h.clans = [...(h.clans || []), { at: Date.now(), rows: rows.map(r => ({ clan: r.clan, reputation: Number(r.reputation || 0), rank: Number(r.rank || 0) })) }].slice(-2400);
  write(HISTORY_KEY, h);
  return h;
}

function saveMemberHistory(clanId, clan, members) {
  const h = read(HISTORY_KEY, { clans: [], members: {} });
  if (!clanId) return h;
  const current = h.members?.[clanId] || [];
  h.members = { ...(h.members || {}), [clanId]: [...current, { at: Date.now(), clan, members: members.map(m => ({ name: m.name, level: Number(m.level || 0), reputation: Number(m.reputation || 0) })) }].slice(-2400) };
  write(HISTORY_KEY, h);
  return h;
}

function gain(history, clan, ms) {
  const s = (history?.clans || []).filter(x => x.at >= Date.now() - ms);
  if (s.length < 2) return 0;
  const a = s[0].rows.find(x => x.clan === clan);
  const b = s[s.length - 1].rows.find(x => x.clan === clan);
  return a && b ? Math.max(0, Number(b.reputation || 0) - Number(a.reputation || 0)) : 0;
}

function burn(history, clanId) {
  const s = history?.members?.[clanId] || [];
  if (s.length < 2) return { top: [], active: 0, total: 0 };
  const a = s.find(x => x.at >= Date.now() - 30 * 60 * 1000) || s[0];
  const b = s[s.length - 1];
  const base = new Map((a.members || []).map(m => [m.name, Number(m.reputation || 0)]));
  const top = (b.members || []).map(m => ({ ...m, gain: Math.max(0, Number(m.reputation || 0) - Number(base.get(m.name) || 0)) })).sort((x, y) => y.gain - x.gain);
  return { top, active: top.filter(x => x.gain > 0).length, total: top.reduce((a, b) => a + b.gain, 0) };
}

export default function Home() {
  const [rows, setRows] = useState([]);
  const rowsRef = useRef([]);
  const inFlight = useRef(false);
  const [status, setStatus] = useState('connecting');
  const [updated, setUpdated] = useState(null);
  const [server, setServer] = useState(null);
  const [season, setSeason] = useState('Season 2');
  const [end, setEnd] = useState(END_DEFAULT);
  const [history, setHistory] = useState({ clans: [], members: {} });
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(null);
  const [members, setMembers] = useState([]);
  const [memberStatus, setMemberStatus] = useState('idle');
  const [memberUpdated, setMemberUpdated] = useState(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [compact, setCompact] = useState(false);
  const [browserAlerts, setBrowserAlerts] = useState(false);
  const [rankAlerts, setRankAlerts] = useState(false);
  const [threshold, setThreshold] = useState(100);
  const [discordAlerts, setDiscordAlerts] = useState(false);
  const [showAnalytics, setShowAnalytics] = useState(true);
  const [sort, setSort] = useState('reputation');
  const [direction, setDirection] = useState('desc');

  useEffect(() => {
    const s = read(SETTINGS_KEY, {});
    setAutoRefresh(s.autoRefresh ?? true);
    setCompact(s.compact ?? false);
    setBrowserAlerts(s.browserAlerts ?? false);
    setRankAlerts(s.rankAlerts ?? false);
    setThreshold(Number(s.threshold || 100));
    setDiscordAlerts(s.discordAlerts ?? false);
    setHistory(read(HISTORY_KEY, { clans: [], members: {} }));
  }, []);

  useEffect(() => write(SETTINGS_KEY, { autoRefresh, compact, browserAlerts, rankAlerts, threshold, discordAlerts }), [autoRefresh, compact, browserAlerts, rankAlerts, threshold, discordAlerts]);

  const notify = useCallback((title, body) => {
    if (browserAlerts && 'Notification' in window && Notification.permission === 'granted') new Notification(title, { body, tag: 'nztracker' });
  }, [browserAlerts]);

  const sendBleed = useCallback(async (clan, before, current) => {
    if (!discordAlerts || current >= before) return;
    const sent = read(BLEED_KEY, {});
    const now = Date.now();
    if (now - Number(sent[clan] || 0) < BLEED_COOLDOWN) return;
    try {
      const response = await fetch('/api/discord/attack-summary', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'bleeding', clan, previousReputation: before, currentReputation: current, reputationLoss: before - current, timestamp: new Date().toISOString() })
      });
      if (response.ok) { sent[clan] = now; write(BLEED_KEY, sent); }
    } catch {}
  }, [discordAlerts]);

  const load = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    try {
      const response = await fetch(`/api/clan-ranking?t=${Date.now()}`, { cache: 'no-store' });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      const next = Array.isArray(data.rows) ? data.rows : [];
      const previous = rowsRef.current;
      rowsRef.current = next;

      if (previous.length) {
        const oldRanks = new Map(previous.map(r => [r.clan, Number(r.rank || 0)]));
        for (const row of next) {
          const beforeRow = previous.find(r => r.clan === row.clan);
          if (beforeRow && Number(row.reputation || 0) < Number(beforeRow.reputation || 0)) {
            await sendBleed(row.clan, Number(beforeRow.reputation || 0), Number(row.reputation || 0));
          }
          if (rankAlerts) {
            const oldRank = oldRanks.get(row.clan);
            if (oldRank && oldRank !== Number(row.rank || 0)) notify('Clan rank changed', `${row.clan}: #${oldRank} → #${row.rank}`);
          }
        }
      }

      const nextHistory = saveClanHistory(next);
      setHistory(nextHistory);
      setRows(next);
      setSeason(data.season || 'Season 2');
      if (data.seasonEndsAt) setEnd(data.seasonEndsAt);
      setServer(response.headers.get('date') ? new Date(response.headers.get('date')) : new Date());
      setUpdated(new Date());
      setStatus('live');
    } catch {
      setStatus('error');
    } finally {
      inFlight.current = false;
    }
  }, [notify, rankAlerts, sendBleed]);

  const loadMembers = useCallback(async (clan) => {
    if (!clan?.clanId) { setMembers([]); setMemberStatus('unavailable'); return; }
    setMemberStatus('loading');
    try {
      const response = await fetch(`/api/clan-members?clanId=${encodeURIComponent(clan.clanId)}&t=${Date.now()}`, { cache: 'no-store' });
      if (!response.ok) throw new Error();
      const data = await response.json();
      const next = Array.isArray(data.members) ? data.members.map(m => ({ ...m, gain: Number(m.gain || 0), totalGain: Number(m.totalGain || 0) })) : [];
      const nextHistory = saveMemberHistory(clan.clanId, clan.clan, next);
      setHistory(nextHistory);
      setMembers(next);
      setMemberUpdated(new Date(data.fetchedAt || Date.now()));
      setMemberStatus('live');
      const stats = burn(nextHistory, clan.clanId);
      if (stats.top[0]?.gain >= threshold) notify('Ninja Zenshin gain alert', `${clan.clan}: ${stats.top[0].name} +${fmt(stats.top[0].gain)} rep in 30m`);
    } catch { setMemberStatus('error'); }
  }, [notify, threshold]);

  useEffect(() => {
    load();
    if (!autoRefresh) return undefined;
    const timer = setInterval(load, REFRESH_MS);
    return () => clearInterval(timer);
  }, [load, autoRefresh]);

  useEffect(() => {
    if (!selected || !autoRefresh) return undefined;
    const timer = setInterval(() => loadMembers(selected), REFRESH_MS);
    return () => clearInterval(timer);
  }, [selected, autoRefresh, loadMembers]);

  useEffect(() => {
    if (!server) return undefined;
    const timer = setInterval(() => setServer(v => v ? new Date(v.getTime() + 1000) : v), 1000);
    return () => clearInterval(timer);
  }, [server]);

  useEffect(() => {
    const key = e => { if (e.key === 'Escape') { setSettingsOpen(false); setSelected(null); } };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter(r => !q || `${r.clan} ${r.master}`.toLowerCase().includes(q)).sort((a, b) => Number(a.rank || 0) - Number(b.rank || 0));
  }, [rows, query]);

  const sortedMembers = useMemo(() => {
    const list = [...members];
    const mul = direction === 'asc' ? 1 : -1;
    return list.sort((a, b) => sort === 'name' ? String(a.name).localeCompare(String(b.name)) * mul : (Number(a[sort] || 0) - Number(b[sort] || 0)) * mul);
  }, [members, sort, direction]);

  const totalMembers = rows.reduce((a, b) => a + Number(b.memberCurrent || 0), 0);
  const maxMembers = rows.reduce((a, b) => a + Number(b.memberMax || 0), 0);
  const global30 = rows.reduce((a, r) => a + gain(history, r.clan, 30 * 60 * 1000), 0);
  const global1h = rows.reduce((a, r) => a + gain(history, r.clan, 60 * 60 * 1000), 0);
  const rate = global30 / 30;
  const top3 = rows.slice(0, 3);
  const selectedStats = selected ? { gain30: gain(history, selected.clan, 30 * 60 * 1000), gain1h: gain(history, selected.clan, 60 * 60 * 1000), ...burn(history, selected.clanId) } : null;
  const countdown = useMemo(() => {
    const total = Math.max(0, Math.floor((new Date(end).getTime() - (server ? server.getTime() : Date.now())) / 1000));
    return [Math.floor(total / 86400), Math.floor((total % 86400) / 3600), Math.floor((total % 3600) / 60), total % 60];
  }, [end, server]);

  const openClan = clan => { setSelected(clan); setMembers([]); loadMembers(clan); };
  const sortBy = key => { if (sort === key) setDirection(v => v === 'asc' ? 'desc' : 'asc'); else { setSort(key); setDirection(key === 'name' ? 'asc' : 'desc'); } };
  const mark = key => sort === key ? (direction === 'asc' ? ' ↑' : ' ↓') : '';
  const requestAlerts = async enabled => {
    if (!enabled) { setBrowserAlerts(false); return; }
    if (!('Notification' in window)) { setBrowserAlerts(false); return; }
    setBrowserAlerts((await Notification.requestPermission()) === 'granted');
  };

  return <main className={`tracker ${compact ? 'compact' : ''}`}>
    <div className="topbar"><button className="settings-button" onClick={() => setSettingsOpen(v => !v)} aria-label="Settings" title="Settings">🛠️</button></div>

    {settingsOpen && <aside className="settings-panel">
      <header><div><div className="eyebrow">TRACKER CONFIG</div><h3>Settings</h3></div><button className="close-button" onClick={() => setSettingsOpen(false)}>×</button></header>
      <div className="settings-body">
        <label><span><b>Auto refresh</b><small>Keep live data updated every 3 seconds.</small></span><input type="checkbox" checked={autoRefresh} onChange={e => setAutoRefresh(e.target.checked)} /></label>
        <label><span><b>Compact rows</b><small>Reduce ranking row height.</small></span><input type="checkbox" checked={compact} onChange={e => setCompact(e.target.checked)} /></label>
        <label><span><b>Browser alerts</b><small>Notify when member gains reach the threshold.</small></span><input type="checkbox" checked={browserAlerts} onChange={e => requestAlerts(e.target.checked)} /></label>
        <label><span><b>Rank alerts</b><small>Notify when a clan changes rank.</small></span><input type="checkbox" checked={rankAlerts} onChange={e => setRankAlerts(e.target.checked)} /></label>
        <label><span><b>Gain threshold</b><small>{fmt(threshold)} reputation.</small></span><input className="threshold" type="number" min="1" value={threshold} onChange={e => setThreshold(Number(e.target.value || 1))} /></label>
        <label><span><b>Discord bleeding alerts</b><small>Send a Discord alert when a clan loses reputation.</small></span><input type="checkbox" checked={discordAlerts} onChange={e => setDiscordAlerts(e.target.checked)} /></label>
        <button className="refresh-button" onClick={() => { load(); if (selected) loadMembers(selected); }}>↻ Refresh now</button>
      </div>
    </aside>}

    <header className="hero"><div><div className="eyebrow">● NINJA ZENSHIN // LIVE ANALYTICS</div><h1>Clan Intelligence</h1><p>Real-time clan ranking, member activity, reputation gains, Top Burn and attack projections for <b>{season}</b>.</p></div><div className="hero-actions"><span className={`live-pill ${status === 'error' ? 'offline' : ''}`}>● {status === 'live' ? 'LIVE · SYNCING' : status === 'error' ? 'OFFLINE · RETRYING' : 'CONNECTING'}</span><button onClick={load}>↻ Refresh</button></div></header>

    <section className="stats"><div className="card"><div className="eyebrow">TRACKED CLANS</div><strong>{rows.length || '—'}</strong><small>Live global ranking</small></div><div className="card"><div className="eyebrow">ACTIVE MEMBERS</div><strong>{rows.length ? fmt(totalMembers) : '—'}</strong><small>{maxMembers ? `${Math.round(totalMembers / maxMembers * 100)}% capacity` : 'Waiting for source'}</small></div><div className="card"><div className="eyebrow">GLOBAL GAIN / 30M</div><strong>+{fmt(global30)}</strong><small>{fmt(Math.round(rate))} rep / min</small></div><div className="card season"><div><div className="eyebrow">{season}</div><strong>ENDS IN</strong></div><div className="countdown"><div><b>{countdown[0]}</b><small>DAYS</small></div><div><b>{String(countdown[1]).padStart(2, '0')}</b><small>HRS</small></div><div><b>{String(countdown[2]).padStart(2, '0')}</b><small>MINS</small></div><div><b>{String(countdown[3]).padStart(2, '0')}</b><small>SECS</small></div></div></div></section>

    <section className="section"><div className="section-head"><div><div className="eyebrow">REFERENCE ANALYTICS</div><h2>Attack Analytics</h2><p>Rolling history is collected while this tracker is open.</p></div><button className="minor-button" onClick={() => setShowAnalytics(v => !v)}>{showAnalytics ? 'Hide' : 'Show'}</button></div>{showAnalytics && <div className="analytics"><div className="card"><div className="eyebrow">30M REPUTATION</div><strong>+{fmt(global30)}</strong></div><div className="card"><div className="eyebrow">1H REPUTATION</div><strong>+{fmt(global1h)}</strong></div><div className="card"><div className="eyebrow">PROJECTED / 1H</div><strong>+{fmt(Math.round(rate * 60))}</strong></div><div className="card"><div className="eyebrow">PROJECTED / 4H</div><strong>+{fmt(Math.round(rate * 240))}</strong></div><div className="panel"><h3>Top Burn <span className="eyebrow">30M</span></h3>{selected ? selectedStats.top.slice(0, 5).map((m, i) => <div className="burn" key={m.name}><span>#{i + 1}</span><b>{m.name}</b><em>+{fmt(m.gain)}</em></div>) : <div className="empty">Select a clan to see highest-gain members.</div>}</div><div className="panel"><h3>Activity Pulse <span className="eyebrow">LIVE</span></h3><div className="burn"><span>ACTIVE</span><b>{selected ? selectedStats.active : 0}</b><em>members</em></div><div className="burn"><span>30M GAIN</span><b>{selected ? fmt(selectedStats.total) : 0}</b><em>rep</em></div><div className="burn"><span>REP / MIN</span><b>{selected ? fmt(Math.round(selectedStats.total / 30)) : 0}</b><em>pace</em></div></div></div>}</section>

    <section className="podiums">{top3.map((r, i) => <button className="podium" key={r.clan} onClick={() => openClan(r)}><div className="podium-top"><span className="rank">{i + 1}</span><span className="avatar">{r.clan?.[0] || 'N'}</span><span className="clan-name"><b>{r.clan}</b><small>{r.master || 'Clan Master'}</small></span></div><div className="podium-stats"><span><small>MEMBERS</small><b>{r.memberCurrent}/{r.memberMax}</b></span><span><small>REPUTATION</small><b>{fmt(r.reputation)}</b></span><span><small>30M GAIN</small><b className="gain">+{fmt(gain(history, r.clan, 30 * 60 * 1000))}</b></span></div></button>)}</section>

    <section className="section"><div className="toolbar"><input className="search" value={query} onChange={e => setQuery(e.target.value)} placeholder="Search clan or master..."/><span className="eyebrow">{updated ? time(updated) : 'Connecting'} · {server ? time(server) : '—'}</span></div><div className="table-wrap"><div className="table-head"><span>RANK</span><span>CLAN</span><span>MASTER</span><span>MEMBERS</span><span>REPUTATION</span><span>30M GAIN</span><span>TOTAL GAIN</span></div>{filtered.map(r => <button className="table-row" key={`${r.clan}-${r.rank}`} onClick={() => openClan(r)}><span className="rank">{r.rank}</span><span className="clan-cell"><b>{r.clan}</b><i style={{ width: `${r.memberMax ? Math.min(100, r.memberCurrent / r.memberMax * 100) : 0}%` }} /></span><span className="muted">{r.master || '—'}</span><span>{r.memberCurrent}/{r.memberMax}</span><span>{fmt(r.reputation)}</span><span className="gain">+{fmt(gain(history, r.clan, 30 * 60 * 1000))}</span><span className="total-gain">{fmt(Math.max(0, Number(r.reputation || 0) - Number(rowsRef.current.find(x => x.clan === r.clan)?.reputation || r.reputation || 0)))}</span></button>)}{!filtered.length && <div className="empty">{status === 'error' ? 'Unable to load live clan data.' : 'No clans match your search.'}</div>}</div></section>

    {selected && <div className="modal" onMouseDown={e => e.target === e.currentTarget && setSelected(null)}><div className="modal-box"><div className="modal-head"><div><div className="eyebrow">LIVE MEMBERS // REPUTATION</div><h2>{selected.clan}</h2><p>Master: {selected.master || '—'} · {selected.memberCurrent}/{selected.memberMax} members</p></div><button className="close-button" onClick={() => setSelected(null)}>×</button></div><div className="modal-body"><div className="member-stats"><div><small>30M GAIN</small><b>+{fmt(selectedStats?.gain30 || 0)}</b></div><div><small>REP / MIN</small><b>{fmt(Math.round((selectedStats?.gain30 || 0) / 30))}</b></div><div><small>1H PROJECTED</small><b>+{fmt(Math.round((selectedStats?.gain30 || 0) * 2))}</b></div><div><small>4H PROJECTED</small><b>+{fmt(Math.round((selectedStats?.gain30 || 0) * 8))}</b></div></div>{memberStatus === 'loading' && <div className="empty">Fetching live member names, levels and reputation…</div>}{memberStatus === 'error' && <div className="empty">Unable to fetch live members right now.</div>}{memberStatus === 'live' && !members.length && <div className="empty">No members returned by the source.</div>}{members.length > 0 && <div className="member-table"><div className="member-head"><span>#</span><button onClick={() => sortBy('name')}>MEMBER{mark('name')}</button><button onClick={() => sortBy('level')}>LEVEL{mark('level')}</button><button onClick={() => sortBy('reputation')}>REPUTATION{mark('reputation')}</button><button onClick={() => sortBy('gain')}>GAIN{mark('gain')}</button><button onClick={() => sortBy('totalGain')}>TOTAL GAIN{mark('totalGain')}</button></div>{sortedMembers.map((m, i) => <div className="member-row" key={`${m.name}-${i}`}><span>{i + 1}</span><b>{m.name}</b><span>{m.level || '—'}</span><span>{fmt(m.reputation)}</span><span className="gain">{m.gain > 0 ? `+${fmt(m.gain)}` : '0'}</span><span className="total-gain">{fmt(m.totalGain)}</span></div>)}</div>}</div><div className="modal-foot">{memberStatus === 'live' ? `● LIVE · ${time(memberUpdated)}` : memberStatus === 'loading' ? 'Loading…' : 'Unavailable'} · Press Esc to close</div></div></div>}

    <footer>Created by <strong>Michol</strong> · <a href="https://discordapp.com/users/396080330702061588" target="_blank" rel="noreferrer">Discord</a></footer>
  </main>;
}
