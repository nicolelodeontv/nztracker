'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import WarNextBuild from './war-next-build';
import WarStaminaMonitor from './war-stamina-monitor';
import './one-page.css';

const REFRESH_MS = 5000;
const SETTINGS_KEY = 'nztracker:settings:v8';
const HISTORY_KEY = 'nztracker:history:v8';
const DEFAULT_END = '2026-09-14T00:00:00+08:00';

const fmt = (value) => new Intl.NumberFormat('en-US').format(Number(value || 0));
const num = (value) => Number.isFinite(Number(value)) ? Number(value) : 0;
const clock = (value) => value ? new Date(value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '—';

function read(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key) || '') ?? fallback; } catch { return fallback; }
}
function write(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch {}
}
function rememberSnapshot(rows) {
  const current = read(HISTORY_KEY, []);
  const next = [...current, { at: Date.now(), rows: rows.map((r) => ({ clan: r.clan, reputation: num(r.reputation), rank: num(r.rank) })) }].slice(-2880);
  write(HISTORY_KEY, next);
  return next;
}
function gain(history, clan, windowMs = 30 * 60 * 1000) {
  const samples = history.filter((x) => x.at >= Date.now() - windowMs);
  if (samples.length < 2) return 0;
  const first = samples.find((x) => x.rows.some((r) => r.clan === clan));
  const last = [...samples].reverse().find((x) => x.rows.some((r) => r.clan === clan));
  const a = first?.rows.find((r) => r.clan === clan)?.reputation;
  const b = last?.rows.find((r) => r.clan === clan)?.reputation;
  return Math.max(0, num(b) - num(a));
}
function statusCopy(status) {
  if (status === 'live') return { label: 'LIVE', tone: 'good', detail: 'Source connected' };
  if (status === 'loading') return { label: 'SYNCING', tone: 'sync', detail: 'Fetching live source' };
  if (status === 'error') return { label: 'DEGRADED', tone: 'bad', detail: 'Last sync failed' };
  return { label: 'WAITING', tone: 'neutral', detail: 'Waiting for first sync' };
}
function memberStatus(member) {
  const current = Number(member?.stamina);
  const max = Number(member?.maxStamina || 200);
  if (!Number.isFinite(current)) return { label: 'UNKNOWN', className: 'unknown', pct: 0 };
  const pct = Math.max(0, Math.min(100, current / max * 100));
  if (pct <= 50) return { label: 'DRAIN FLOOR', className: 'low', pct };
  if (pct <= 70) return { label: 'BLEEDING', className: 'warn', pct };
  return { label: pct >= 100 ? 'FULL' : 'SAFE', className: 'good', pct };
}

export default function Home() {
  const [rows, setRows] = useState([]);
  const [history, setHistory] = useState(() => read(HISTORY_KEY, []));
  const [status, setStatus] = useState('loading');
  const [detail, setDetail] = useState('Connecting to Ninja Zenshin…');
  const [lastSync, setLastSync] = useState(null);
  const [source, setSource] = useState('ninjazenshin.online');
  const [season, setSeason] = useState('Season 2');
  const [seasonEnd, setSeasonEnd] = useState(DEFAULT_END);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(null);
  const [members, setMembers] = useState([]);
  const [memberStatusState, setMemberStatusState] = useState('idle');
  const [memberError, setMemberError] = useState('');
  const [memberUpdated, setMemberUpdated] = useState(null);
  const [memberFilter, setMemberFilter] = useState('all');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [compact, setCompact] = useState(false);
  const [sort, setSort] = useState('reputation');
  const [direction, setDirection] = useState('desc');
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const saved = read(SETTINGS_KEY, {});
    setAutoRefresh(saved.autoRefresh ?? true);
    setCompact(saved.compact ?? false);
  }, []);

  useEffect(() => write(SETTINGS_KEY, { autoRefresh, compact }), [autoRefresh, compact]);

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const load = useCallback(async () => {
    setStatus((current) => current === 'live' ? 'loading' : current);
    try {
      const response = await fetch(`/api/clan-ranking?t=${Date.now()}`, { cache: 'no-store' });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.details || data.error || `HTTP ${response.status}`);
      const nextRows = Array.isArray(data.rows) ? data.rows : [];
      if (!nextRows.length) throw new Error('The source returned no clan rows.');
      const nextHistory = rememberSnapshot(nextRows);
      setRows(nextRows);
      setHistory(nextHistory);
      setSeason(data.season || 'Season 2');
      setSeasonEnd(data.seasonEndsAt || DEFAULT_END);
      setSource(data.source ? new URL(data.source).hostname : 'ninjazenshin.online');
      setLastSync(new Date(data.fetchedAt || Date.now()));
      setDetail(`Fetched ${nextRows.length} clans successfully`);
      setStatus('live');
      setSelected((current) => current || nextRows[0]);
    } catch (error) {
      setStatus('error');
      setDetail(error instanceof Error ? error.message : 'Unable to reach live source');
    }
  }, []);

  const loadMembers = useCallback(async (clan) => {
    if (!clan?.clanId) {
      setMembers([]);
      setMemberStatusState('error');
      setMemberError('This clan does not expose a live clanId.');
      return;
    }
    setMemberStatusState('loading');
    setMemberError('');
    try {
      const response = await fetch(`/api/clan-members?clanId=${encodeURIComponent(clan.clanId)}&t=${Date.now()}`, { cache: 'no-store' });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.details || data.error || `HTTP ${response.status}`);
      setMembers(Array.isArray(data.members) ? data.members : []);
      setMemberUpdated(new Date(data.fetchedAt || Date.now()));
      setMemberStatusState('live');
    } catch (error) {
      setMemberStatusState('error');
      setMemberError(error instanceof Error ? error.message : 'Unable to load live members');
    }
  }, []);

  useEffect(() => {
    load();
    if (!autoRefresh) return;
    const timer = setInterval(load, REFRESH_MS);
    return () => clearInterval(timer);
  }, [load, autoRefresh]);

  useEffect(() => {
    if (!selected) return;
    loadMembers(selected);
    if (!autoRefresh) return;
    const timer = setInterval(() => loadMembers(selected), REFRESH_MS);
    return () => clearInterval(timer);
  }, [selected, autoRefresh, loadMembers]);

  const filteredRows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return [...rows]
      .filter((row) => !q || `${row.clan} ${row.master}`.toLowerCase().includes(q))
      .sort((a, b) => {
        const aValue = sort === 'clan' ? String(a.clan) : num(a[sort]);
        const bValue = sort === 'clan' ? String(b.clan) : num(b[sort]);
        const base = typeof aValue === 'string' ? aValue.localeCompare(bValue) : aValue - bValue;
        return direction === 'asc' ? base : -base;
      });
  }, [rows, query, sort, direction]);

  const activeMembers = rows.reduce((sum, row) => sum + num(row.memberCurrent), 0);
  const maxMembers = rows.reduce((sum, row) => sum + num(row.memberMax), 0);
  const rep30 = rows.reduce((sum, row) => sum + gain(history, row.clan), 0);
  const repRate = rep30 / 30;
  const top3 = rows.slice().sort((a, b) => num(a.rank) - num(b.rank)).slice(0, 3);
  const statusInfo = statusCopy(status);
  const countdownSeconds = Math.max(0, Math.floor((new Date(seasonEnd).getTime() - now) / 1000));
  const countdown = [Math.floor(countdownSeconds / 86400), Math.floor(countdownSeconds / 3600) % 24, Math.floor(countdownSeconds / 60) % 60, countdownSeconds % 60];

  const memberView = useMemo(() => members.filter((member) => {
    const state = memberStatus(member);
    if (memberFilter === 'low') return state.pct <= 50;
    if (memberFilter === 'recovering') return state.pct > 0 && state.pct < 100;
    if (memberFilter === 'full') return state.pct >= 100;
    return true;
  }), [members, memberFilter]);

  const lowStamina = members.filter((member) => memberStatus(member).pct <= 50).length;
  const bleeding = members.filter((member) => memberStatus(member).pct <= 70).length;
  const fullStamina = members.filter((member) => memberStatus(member).pct >= 100).length;
  const knownStamina = members.filter((member) => Number.isFinite(Number(member?.stamina))).length;

  const rankPeaks = useMemo(() => {
    const map = new Map();
    history.forEach((snapshot) => snapshot.rows.forEach((row) => {
      const current = map.get(row.clan);
      map.set(row.clan, Math.min(current ?? Number.POSITIVE_INFINITY, num(row.rank)));
    }));
    return map;
  }, [history]);

  const sortBy = (key) => {
    if (sort === key) setDirection((value) => value === 'asc' ? 'desc' : 'asc');
    else { setSort(key); setDirection(key === 'clan' ? 'asc' : 'desc'); }
  };
  const mark = (key) => sort === key ? (direction === 'asc' ? ' ↑' : ' ↓') : '';
  const openClan = (clan) => {
    setSelected(clan);
    if (typeof window !== 'undefined') window.location.hash = 'members';
  };

  return <main className={`tracker one-page ${compact ? 'compact' : ''}`}>
    <div className="topbar">
      <div className="top-status"><span className={`status-dot ${statusInfo.tone}`}></span><b>{statusInfo.label}</b><span>{statusInfo.detail}</span></div>
      <button className="settings-button" onClick={() => setSettingsOpen((value) => !value)} aria-label="Open settings">⚙</button>
    </div>

    {settingsOpen && <aside className="settings-panel">
      <header><div><div className="eyebrow">TRACKER CONFIG</div><h3>Settings</h3></div><button className="close-button" onClick={() => setSettingsOpen(false)}>×</button></header>
      <div className="settings-body">
        <label><span><b>Auto refresh</b><small>Update rankings and selected-clan members every 5 seconds.</small></span><input type="checkbox" checked={autoRefresh} onChange={(event) => setAutoRefresh(event.target.checked)} /></label>
        <label><span><b>Compact rows</b><small>Reduce table height on large clan lists.</small></span><input type="checkbox" checked={compact} onChange={(event) => setCompact(event.target.checked)} /></label>
        <button className="refresh-button" onClick={() => { load(); if (selected) loadMembers(selected); }}>↻ Refresh now</button>
      </div>
    </aside>}

    <header id="command" className="hero">
      <div><div className="eyebrow">● NINJA ZENSHIN // SINGLE-PAGE OPERATIONS</div><h1>Clan Intelligence</h1><p>One readable workspace for live rankings, members, stamina, clan-war targeting, attack stamina, recovery rules and season history.</p></div>
      <div className="hero-actions"><div className={`live-pill ${statusInfo.tone}`}>● {statusInfo.label}</div><button onClick={load} disabled={status === 'loading'}>↻ {status === 'loading' ? 'Syncing…' : 'Refresh'}</button></div>
    </header>

    <section className="stats">
      <div className="card"><div className="eyebrow">TRACKED CLANS</div><strong>{fmt(rows.length)}</strong><small>{source}</small></div>
      <div className="card"><div className="eyebrow">ACTIVE MEMBERS</div><strong>{fmt(activeMembers)} / {fmt(maxMembers)}</strong><small>{maxMembers ? `${Math.round(activeMembers / maxMembers * 100)}% capacity` : 'Waiting for source'}</small></div>
      <div className="card"><div className="eyebrow">REPUTATION / 30M</div><strong>+{fmt(rep30)}</strong><small>≈ {fmt(Math.round(repRate))} rep/min</small></div>
      <div className="card season-card"><div><div className="eyebrow">{season.toUpperCase()} · TIMER</div><strong>{String(countdown[0]).padStart(2, '0')}d {String(countdown[1]).padStart(2, '0')}h</strong><small>Last sync {clock(lastSync)}</small></div><div className="countdown">{countdown.map((value, index) => <div key={index}><b>{String(value).padStart(2, '0')}</b><small>{['DAYS','HOURS','MIN','SEC'][index]}</small></div>)}</div></div>
    </section>

    <section className="connection-banner">
      <div className={`connection-icon ${statusInfo.tone}`}>{statusInfo.tone === 'good' ? '✓' : statusInfo.tone === 'sync' ? '↻' : statusInfo.tone === 'bad' ? '!' : '•'}</div>
      <div><b>{statusInfo.tone === 'good' ? 'Live source connected' : statusInfo.tone === 'bad' ? 'Live source needs attention' : 'Live source syncing'}</b><span>{detail}</span></div>
      <div className="connection-meta"><span>Last successful sync</span><b>{clock(lastSync)}</b></div>
    </section>

    <section className="podiums">{top3.map((clan, index) => <button className="podium" key={clan.clan} onClick={() => openClan(clan)}>
      <div className="podium-top"><span className="rank">#{clan.rank}</span><span className="avatar">{index === 0 ? '◆' : index === 1 ? '◇' : '◈'}</span><span className="clan-name"><b>{clan.clan}</b><small>{clan.master || '—'}</small></span></div>
      <div className="podium-stats"><span><small>REP</small><b>{fmt(clan.reputation)}</b></span><span><small>MEMBERS</small><b>{clan.memberCurrent}/{clan.memberMax}</b></span><span><small>30M GAIN</small><b className="gain">+{fmt(gain(history, clan.clan))}</b></span></div>
    </button>)}</section>

    <section id="rankings" className="section one-page-section">
      <div className="section-head"><div><div className="eyebrow">CLAN RANKINGS</div><h2>Live leaderboard</h2><p className="section-note">Click any clan to load its live members below. Sort by rank, reputation or member count.</p></div><span className="section-meta">{filteredRows.length} visible</span></div>
      <div className="toolbar"><input className="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search clan or master…" aria-label="Search clans" /><button className="minor-button" onClick={() => setQuery('')}>Clear</button></div>
      <div className="table-wrap">
        <div className="table-head"><button onClick={() => sortBy('rank')}>RANK{mark('rank')}</button><button onClick={() => sortBy('clan')}>CLAN{mark('clan')}</button><span>MASTER</span><button onClick={() => sortBy('memberCurrent')}>MEMBERS{mark('memberCurrent')}</button><button onClick={() => sortBy('reputation')}>REPUTATION{mark('reputation')}</button><span>30M GAIN</span><span>STATUS</span></div>
        {filteredRows.length ? filteredRows.map((row) => <button className="table-row" key={`${row.clan}-${row.rank}`} onClick={() => openClan(row)}>
          <span className="rank">#{row.rank}</span><span className="clan-cell"><b>{row.clan}</b><i style={{ width: `${Math.min(100, Math.max(8, num(row.reputation) / Math.max(1, num(rows[0]?.reputation)) * 100))}%` }} /></span><span>{row.master || '—'}</span><span>{row.memberCurrent}/{row.memberMax}</span><span>{fmt(row.reputation)}</span><span className="gain">+{fmt(gain(history, row.clan))}</span><span className="row-status"><span className="status-dot good"></span>LIVE</span>
        </button>) : <div className="empty">{status === 'error' ? 'Live source unavailable. Use Refresh to retry.' : query ? `No clans found for “${query}”.` : 'Waiting for live clan data…'}</div>}
      </div>
    </section>

    <section id="members" className="section one-page-section">
      <div className="section-head"><div><div className="eyebrow">LIVE MEMBERS</div><h2>{selected?.clan || 'Select a clan'}</h2><p className="section-note">Live member names, reputation and stamina. Missing max stamina uses the 200-point game cap.</p></div><span className="section-meta">Updated {clock(memberUpdated)}</span></div>
      {!selected && <div className="empty-panel"><b>Select a clan from the leaderboard.</b><span>The member table will populate here without opening another page.</span></div>}
      {selected && <>
        <div className="member-grid"><div className="member-stat"><small>MEMBERS</small><b>{members.length}/{selected.memberMax || '—'}</b></div><div className="member-stat"><small>STAMINA KNOWN</small><b>{knownStamina}/{members.length || 0}</b></div><div className="member-stat"><small>BLEEDING ≤70%</small><b>{bleeding}</b></div><div className="member-stat"><small>DRAIN FLOOR ≤50%</small><b>{lowStamina}</b></div></div>
        <div className="member-toolbar">{['all','low','recovering','full'].map((filter) => <button key={filter} className={memberFilter === filter ? 'active' : ''} onClick={() => setMemberFilter(filter)}>{filter === 'all' ? 'ALL MEMBERS' : filter.toUpperCase()}</button>)}<button onClick={() => loadMembers(selected)}>↻ Sync members</button></div>
        {memberStatusState === 'error' && <div className="error-panel"><b>Member source unavailable</b><span>{memberError}</span></div>}
        {memberStatusState === 'loading' && <div className="empty">Fetching live member data…</div>}
        {memberStatusState === 'live' && <div className="member-table">
          <div className="member-table-head"><span>MEMBER</span><span>LEVEL</span><span>REPUTATION</span><span>STAMINA</span><span>STATUS</span></div>
          {memberView.map((member, index) => { const state = memberStatus(member); const current = Number(member.stamina); const max = Number(member.maxStamina || 200); return <div className="member-table-row" key={`${member.name}-${index}`}><span><b>{member.name}</b></span><span>{member.level || '—'}</span><span>{fmt(member.reputation)}</span><span><div className="member-meter"><i style={{ width: `${state.pct}%` }} /></div><small>{Number.isFinite(current) ? `${fmt(current)} / ${fmt(max)}` : 'UNKNOWN'}</small></span><span className={`member-state ${state.className}`}>{state.label}</span></div>; })}
          {!memberView.length && <div className="empty">No members match this filter.</div>}
        </div>}
      </>}
    </section>

    <section id="war" className="one-page-section">
      <div className="section-head"><div><div className="eyebrow">CLAN WAR</div><h2>Targeting & attack operations</h2><p className="section-note">Choose a confirmed target, calculate reputation reward, and track your personal attack stamina in the same page.</p></div></div>
      <WarNextBuild rows={rows} server={lastSync} />
    </section>

    <section id="stamina" className="one-page-section">
      <div className="section-head"><div><div className="eyebrow">STAMINA</div><h2>Command center</h2><p className="section-note">Live member stamina, target priority, timeline and recovery-state visibility.</p></div></div>
      <WarStaminaMonitor rows={rows} />
    </section>

    <section id="rules" className="section one-page-section">
      <div className="section-head"><div><div className="eyebrow">QUICK RULES</div><h2>Clan War reference</h2></div><span className="section-meta">No PvE / PvP</span></div>
      <div className="rules-grid">
        <div className="rule-card"><b>200</b><span>Your personal stamina cap used by the tracker when a game value is unavailable.</span></div>
        <div className="rule-card"><b>−10 / attack</b><span>Attacker leader stamina cost per successful attack.</span></div>
        <div className="rule-card"><b>70%</b><span>Member stamina threshold used for the bleeding state.</span></div>
        <div className="rule-card"><b>50%</b><span>Drain-floor threshold used for critical stamina priority.</span></div>
      </div>
    </section>

    <footer className="footer-note">Ninja Zenshin Live Tracker · Single-page Clan Operations Dashboard · Source: ninjazenshin.online · Last sync {clock(lastSync)}</footer>
  </main>;
}
