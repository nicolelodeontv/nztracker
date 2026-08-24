'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import './tracker.css';
import './war-ops.css';
import WarOps from './war-ops';

const REFRESH_MS = 3000;
const HISTORY_SAMPLE_MS = 30 * 1000;
const END_DEFAULT = '2026-09-14T00:00:00+08:00';
const HISTORY_KEY = 'nztracker:history:v7';
const BASELINE_KEY = 'nztracker:baseline:v1';
const SETTINGS_KEY = 'nztracker:settings:v6';

const fmt = (n) => new Intl.NumberFormat('en-US').format(Number(n || 0));
const time = (v) => v ? new Date(v).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '—';
const read = (k, d) => { try { return JSON.parse(localStorage.getItem(k) || '') || d; } catch { return d; } };
const write = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };
const safeRep = (value) => {
  const n = Number(value);
  return Number.isSafeInteger(n) && n >= 0 ? n : 0;
};

let lastClanHistoryWrite = 0;
const lastMemberHistoryWrite = new Map();

function saveClanHistory(rows) {
  const now = Date.now();
  const current = read(HISTORY_KEY, { clans: [], members: {} });
  if (now - lastClanHistoryWrite < HISTORY_SAMPLE_MS && current.clans?.length) return current;
  const snapshot = { at: now, rows: rows.map((r) => ({ clan: r.clan, reputation: safeRep(r.reputation), rank: Number(r.rank || 0) })) };
  const clans = [...(current.clans || []), snapshot].slice(-2880);
  const next = { clans, members: current.members || {} };
  lastClanHistoryWrite = now;
  write(HISTORY_KEY, next);
  return next;
}

function saveMemberHistory(clanId, clan, members) {
  const current = read(HISTORY_KEY, { clans: [], members: {} });
  if (!clanId) return current;
  const now = Date.now();
  const last = lastMemberHistoryWrite.get(String(clanId)) || 0;
  if (now - last < HISTORY_SAMPLE_MS && current.members?.[clanId]?.length) return current;
  const snapshot = { at: now, clan, members: members.map((m) => ({ name: m.name, level: Number(m.level || 0), reputation: safeRep(m.reputation) })) };
  const existing = current.members?.[clanId] || [];
  const next = { clans: current.clans || [], members: { ...(current.members || {}), [clanId]: [...existing, snapshot].slice(-2880) } };
  lastMemberHistoryWrite.set(String(clanId), now);
  write(HISTORY_KEY, next);
  return next;
}

function gain(history, clan, ms) {
  const samples = (history?.clans || []).filter((x) => x.at >= Date.now() - ms);
  if (samples.length < 2) return 0;
  const first = samples[0]?.rows?.find((x) => x.clan === clan);
  const last = samples[samples.length - 1]?.rows?.find((x) => x.clan === clan);
  if (!first || !last) return 0;
  return Math.max(0, safeRep(last.reputation) - safeRep(first.reputation));
}

function burn(history, clanId) {
  const samples = history?.members?.[clanId] || [];
  if (samples.length < 2) return { top: [], active: 0, total: 0 };
  const first = samples.find((x) => x.at >= Date.now() - 30 * 60 * 1000) || samples[0];
  const last = samples[samples.length - 1];
  const base = new Map((first.members || []).map((m) => [m.name, safeRep(m.reputation)]));
  const top = (last.members || []).map((m) => ({ ...m, gain: Math.max(0, safeRep(m.reputation) - safeRep(base.get(m.name) || 0)) })).sort((a, b) => b.gain - a.gain);
  return { top, active: top.filter((x) => x.gain > 0).length, total: top.reduce((sum, member) => sum + member.gain, 0) };
}

function readBaseline() {
  try { return JSON.parse(sessionStorage.getItem(BASELINE_KEY) || '') || { season: '', reputation: {} }; } catch { return { season: '', reputation: {} }; }
}

function writeBaseline(value) {
  try { sessionStorage.setItem(BASELINE_KEY, JSON.stringify(value)); } catch {}
}

export default function Home() {
  const [rows, setRows] = useState([]);
  const rowsRef = useRef([]);
  const baselineRef = useRef(readBaseline());
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
  const [sort, setSort] = useState('reputation');
  const [direction, setDirection] = useState('desc');

  useEffect(() => {
    const s = read(SETTINGS_KEY, {});
    setAutoRefresh(s.autoRefresh ?? true);
    setCompact(s.compact ?? false);
    setBrowserAlerts(s.browserAlerts ?? false);
    setRankAlerts(s.rankAlerts ?? false);
    setThreshold(Number(s.threshold || 100));
    setHistory(read(HISTORY_KEY, { clans: [], members: {} }));
  }, []);

  useEffect(() => write(SETTINGS_KEY, { autoRefresh, compact, browserAlerts, rankAlerts, threshold }), [autoRefresh, compact, browserAlerts, rankAlerts, threshold]);

  const notify = useCallback((title, body) => {
    if (browserAlerts && 'Notification' in window && Notification.permission === 'granted') new Notification(title, { body, tag: 'nztracker' });
  }, [browserAlerts]);

  const load = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    try {
      const response = await fetch(`/api/clan-ranking?t=${Date.now()}`, { cache: 'no-store' });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      const next = Array.isArray(data.rows) ? data.rows : [];
      const previous = rowsRef.current;
      const nextSeason = data.season || 'Season 2';
      rowsRef.current = next;

      if (baselineRef.current.season !== nextSeason) baselineRef.current = { season: nextSeason, reputation: {} };
      const baseline = { ...baselineRef.current.reputation };
      next.forEach((row) => { if (baseline[row.clan] == null) baseline[row.clan] = safeRep(row.reputation); });
      baselineRef.current = { season: nextSeason, reputation: baseline };
      writeBaseline(baselineRef.current);

      if (previous.length && rankAlerts) {
        const oldRanks = new Map(previous.map((r) => [r.clan, Number(r.rank || 0)]));
        next.forEach((row) => {
          const oldRank = oldRanks.get(row.clan);
          if (oldRank && oldRank !== Number(row.rank || 0)) notify('Clan rank changed', `${row.clan}: #${oldRank} → #${row.rank}`);
        });
      }

      const nextHistory = saveClanHistory(next);
      setHistory(nextHistory);
      setRows(next);
      setSeason(nextSeason);
      if (data.seasonEndsAt) setEnd(data.seasonEndsAt);
      setServer(response.headers.get('date') ? new Date(response.headers.get('date')) : new Date());
      setUpdated(new Date());
      setStatus('live');
    } catch {
      setStatus('error');
    } finally {
      inFlight.current = false;
    }
  }, [notify, rankAlerts]);

  const loadMembers = useCallback(async (clan) => {
    if (!clan?.clanId) { setMembers([]); setMemberStatus('unavailable'); return; }
    setMemberStatus((current) => current === 'live' ? current : 'loading');
    try {
      const response = await fetch(`/api/clan-members?clanId=${encodeURIComponent(clan.clanId)}&t=${Date.now()}`, { cache: 'no-store' });
      if (!response.ok) throw new Error();
      const data = await response.json();
      const next = Array.isArray(data.members) ? data.members.map((m) => ({ ...m, gain: Number(m.gain || 0), totalGain: Number(m.totalGain || 0) })) : [];
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
    const timer = setInterval(() => setServer((value) => value ? new Date(value.getTime() + 1000) : value), 1000);
    return () => clearInterval(timer);
  }, [server]);

  useEffect(() => {
    const key = (e) => { if (e.key === 'Escape') { setSettingsOpen(false); setSelected(null); } };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((r) => !q || `${r.clan} ${r.master}`.toLowerCase().includes(q));
  }, [rows, query]);

  const sortedMembers = useMemo(() => {
    const list = [...members];
    const mul = direction === 'asc' ? 1 : -1;
    return list.sort((a, b) => sort === 'name' ? String(a.name).localeCompare(String(b.name)) * mul : (Number(a[sort] || 0) - Number(b[sort] || 0)) * mul);
  }, [members, sort, direction]);

  const totalMembers = rows.reduce((sum, row) => sum + Number(row.memberCurrent || 0), 0);
  const maxMembers = rows.reduce((sum, row) => sum + Number(row.memberMax || 0), 0);
  const global30 = rows.reduce((sum, row) => sum + gain(history, row.clan, 30 * 60 * 1000), 0);
  const rate = global30 / 30;
  const top3 = rows.slice(0, 3);
  const selectedStats = selected ? { gain30: gain(history, selected.clan, 30 * 60 * 1000), ...burn(history, selected.clanId) } : null;
  const countdown = useMemo(() => {
    const total = Math.max(0, Math.floor((new Date(end).getTime() - (server ? server.getTime() : Date.now())) / 1000));
    return [Math.floor(total / 86400), Math.floor((total % 86400) / 3600), Math.floor((total % 3600) / 60), total % 60];
  }, [end, server]);

  const openClan = (clan) => { if (!clan) return; setSelected(clan); setMembers([]); setMemberStatus('loading'); loadMembers(clan); };
  const sortBy = (key) => { if (sort === key) setDirection((value) => value === 'asc' ? 'desc' : 'asc'); else { setSort(key); setDirection(key === 'name' ? 'asc' : 'desc'); } };
  const mark = (key) => sort === key ? (direction === 'asc' ? ' ↑' : ' ↓') : '';
  const requestAlerts = async (enabled) => {
    if (!enabled) { setBrowserAlerts(false); return; }
    if (!('Notification' in window)) { setBrowserAlerts(false); return; }
    setBrowserAlerts((await Notification.requestPermission()) === 'granted');
  };

  return <main className={`tracker ${compact ? 'compact' : ''}`}>
    <div className="topbar"><button className="settings-button" onClick={() => setSettingsOpen((value) => !value)} aria-label="Settings" title="Settings">🛠️</button></div>

    {settingsOpen && <aside className="settings-panel">
      <header><div><div className="eyebrow">TRACKER CONFIG</div><h3>Settings</h3></div><button className="close-button" onClick={() => setSettingsOpen(false)}>×</button></header>
      <div className="settings-body">
        <label><span><b>Auto refresh</b><small>Keep live data updated every 3 seconds.</small></span><input type="checkbox" checked={autoRefresh} onChange={(e) => setAutoRefresh(e.target.checked)} /></label>
        <label><span><b>Compact rows</b><small>Reduce ranking row height.</small></span><input type="checkbox" checked={compact} onChange={(e) => setCompact(e.target.checked)} /></label>
        <label><span><b>Browser alerts</b><small>Notify when member gains reach the threshold.</small></span><input type="checkbox" checked={browserAlerts} onChange={(e) => requestAlerts(e.target.checked)} /></label>
        <label><span><b>Rank alerts</b><small>Notify when a clan changes rank.</small></span><input type="checkbox" checked={rankAlerts} onChange={(e) => setRankAlerts(e.target.checked)} /></label>
        <label><span><b>Gain threshold</b><small>{fmt(threshold)} reputation.</small></span><input className="threshold" type="number" min="1" value={threshold} onChange={(e) => setThreshold(Number(e.target.value || 1))} /></label>
        <button className="refresh-button" onClick={() => { load(); if (selected) loadMembers(selected); }}>↻ Refresh now</button>
      </div>
    </aside>}

    <header className="hero"><div><div className="eyebrow">● NINJA ZENSHIN // LIVE</div><h1>Clan Intelligence</h1><p>Real-time clan ranking, member activity and reputation tracking for <b>{season}</b>.</p></div><div className="hero-actions"><span className={`live-pill ${status === 'error' ? 'offline' : ''}`}>● {status === 'live' ? 'LIVE · SYNCING' : status === 'error' ? 'OFFLINE · RETRYING' : 'CONNECTING'}</span><button onClick={load}>↻ Refresh</button></div></header>

    <section className="stats"><div className="card"><div className="eyebrow">TRACKED CLANS</div><strong>{rows.length || '—'}</strong><small>Live global ranking</small></div><div className="card"><div className="eyebrow">ACTIVE MEMBERS</div><strong>{rows.length ? fmt(totalMembers) : '—'}</strong><small>{maxMembers ? `${Math.round(totalMembers / maxMembers * 100)}% capacity` : 'Waiting for source'}</small></div><div className="card"><div className="eyebrow">GLOBAL GAIN / 30M</div><strong>+{fmt(global30)}</strong><small>{fmt(Math.round(rate))} rep / min</small></div><div className="card season"><div><div className="eyebrow">{season}</div><strong>ENDS IN</strong></div><div className="countdown"><div><b>{countdown[0]}</b><small>DAYS</small></div><div><b>{String(countdown[1]).padStart(2, '0')}</b><small>HRS</small></div><div><b>{String(countdown[2]).padStart(2, '0')}</b><small>MINS</small></div><div><b>{String(countdown[3]).padStart(2, '0')}</b><small>SECS</small></div></div></div></section>

    <WarOps rows={rows} server={server} updated={updated} status={status} onOpenClan={openClan} />

    <section className="podiums">{top3.map((r, i) => <button className="podium" key={r.clan} onClick={() => openClan(r)}><div className="podium-top"><span className="rank">{i + 1}</span><span className="avatar">{r.clan?.[0] || 'N'}</span><span className="clan-name"><b>{r.clan}</b><small>{r.master || 'Clan Master'}</small></span></div><div className="podium-stats"><span><small>MEMBERS</small><b>{r.memberCurrent}/{r.memberMax}</b></span><span><small>REPUTATION</small><b>{fmt(r.reputation)}</b></span><span><small>GAIN</small><b className="gain">+{fmt(gain(history, r.clan, 30 * 60 * 1000))}</b></span></div></button>)}</section>

    <section className="section"><div className="toolbar"><input className="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search clan or master..."/><span className="eyebrow">UPDATED {updated ? time(updated) : 'CONNECTING'}</span></div><div className="table-wrap"><div className="table-head"><span>RANK</span><span>CLAN</span><span>MASTER</span><span>MEMBERS</span><span>REPUTATION</span><span>GAIN</span><span>TOTAL GAIN</span></div>{filtered.map((r) => { const baseline = safeRep(baselineRef.current.reputation?.[r.clan]); const totalGain = Math.max(0, safeRep(r.reputation) - baseline); return <button className="table-row" key={`${r.clan}-${r.rank}`} onClick={() => openClan(r)}><span className="rank">{r.rank}</span><span className="clan-cell"><b>{r.clan}</b><i style={{ width: `${r.memberMax ? Math.min(100, r.memberCurrent / r.memberMax * 100) : 0}%` }} /></span><span className="muted">{r.master || '—'}</span><span>{r.memberCurrent}/{r.memberMax}</span><span>{fmt(r.reputation)}</span><span className="gain">+{fmt(gain(history, r.clan, 30 * 60 * 1000))}</span><span className="total-gain">+{fmt(totalGain)}</span></button>; })}{!filtered.length && <div className="empty">{status === 'error' ? 'Unable to load live clan data.' : 'No clans match your search.'}</div>}</div></section>

    {selected && <div className="modal" onMouseDown={(e) => e.target === e.currentTarget && setSelected(null)}><div className="modal-box"><div className="modal-head"><div><div className="eyebrow">LIVE MEMBERS // STAMINA</div><h2>{selected.clan}</h2><p>Master: {selected.master || '—'} · {selected.memberCurrent}/{selected.memberMax} members</p></div><button className="close-button" onClick={() => setSelected(null)}>×</button></div><div className="modal-body"><div className="member-stats"><div><small>GAIN</small><b>+{fmt(selectedStats?.gain30 || 0)}</b></div><div><small>REP / MIN</small><b>{fmt(Math.round((selectedStats?.gain30 || 0) / 30))}</b></div><div><small>ACTIVE</small><b>{selectedStats?.active || 0}</b></div><div><small>30M TOTAL</small><b>+{fmt(selectedStats?.total || 0)}</b></div></div>{memberStatus === 'loading' && <div className="empty">Fetching live member names, levels, reputation and stamina…</div>}{memberStatus === 'error' && <div className="empty">Unable to fetch live members right now.</div>}{memberStatus === 'live' && !members.length && <div className="empty">No members returned by the source.</div>}{members.length > 0 && <div className="member-table"><div className="member-head"><span>#</span><button onClick={() => sortBy('name')}>MEMBER{mark('name')}</button><button onClick={() => sortBy('level')}>LEVEL{mark('level')}</button><button onClick={() => sortBy('reputation')}>REPUTATION{mark('reputation')}</button><button>STAMINA</button><button onClick={() => sortBy('gain')}>GAIN{mark('gain')}</button><button onClick={() => sortBy('totalGain')}>TOTAL GAIN{mark('totalGain')}</button></div>{sortedMembers.map((m, i) => <div className="member-row" key={`${m.name}-${i}`}><span>{i + 1}</span><b>{m.name}</b><span>{m.level || '—'}</span><span>{fmt(m.reputation)}</span><span className={`member-stamina ${m.bleeding === true ? 'bleed' : m.bleeding === false ? 'healthy' : 'unknown'}`}>{m.stamina != null && m.maxStamina != null ? `${fmt(m.stamina)} / ${fmt(m.maxStamina)}` : 'UNKNOWN'}</span><span className="gain">{m.gain > 0 ? `+${fmt(m.gain)}` : '0'}</span><span className="total-gain">{fmt(m.totalGain)}</span></div>)}</div>}</div><div className="modal-foot">{memberStatus === 'live' ? `● LIVE · ${time(memberUpdated)}` : memberStatus === 'loading' ? 'Loading…' : 'Unavailable'} · Press Esc to close</div></div></div>}

    <footer>Created by <strong>Michol</strong> · <a href="https://discordapp.com/users/396080330702061588" target="_blank" rel="noreferrer">Discord</a></footer>
  </main>;
}
