'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

const REFRESH_MS = 5000;
const SETTINGS_KEY = 'nztracker:settings:v7';
const HISTORY_KEY = 'nztracker:history:v8';
const DEFAULT_END = '2026-09-14T00:00:00+08:00';

const fmt = (value) => new Intl.NumberFormat('en-US').format(Number(value || 0));
const num = (value) => Number.isFinite(Number(value)) ? Number(value) : 0;
const clock = (value) => value ? new Date(value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '—';

function read(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key) || '') || fallback; } catch { return fallback; }
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
  const [memberStatus, setMemberStatus] = useState('idle');
  const [memberError, setMemberError] = useState('');
  const [memberUpdated, setMemberUpdated] = useState(null);
  const [memberFilter, setMemberFilter] = useState('all');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [compact, setCompact] = useState(false);
  const [sort, setSort] = useState('reputation');
  const [direction, setDirection] = useState('desc');

  useEffect(() => {
    const s = read(SETTINGS_KEY, {});
    setAutoRefresh(s.autoRefresh ?? true);
    setCompact(s.compact ?? false);
  }, []);

  useEffect(() => write(SETTINGS_KEY, { autoRefresh, compact }), [autoRefresh, compact]);

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
    } catch (error) {
      setStatus('error');
      setDetail(error instanceof Error ? error.message : 'Unable to reach live source');
    }
  }, []);

  const loadMembers = useCallback(async (clan) => {
    if (!clan?.clanId) {
      setMembers([]);
      setMemberStatus('error');
      setMemberError('This clan does not expose a live clanId.');
      return;
    }
    setMemberStatus('loading');
    setMemberError('');
    try {
      const response = await fetch(`/api/clan-members?clanId=${encodeURIComponent(clan.clanId)}&t=${Date.now()}`, { cache: 'no-store' });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.details || data.error || `HTTP ${response.status}`);
      const next = Array.isArray(data.members) ? data.members : [];
      setMembers(next);
      setMemberUpdated(new Date(data.fetchedAt || Date.now()));
      setMemberStatus('live');
    } catch (error) {
      setMemberStatus('error');
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
    if (!selected || !autoRefresh) return;
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

  const memberView = useMemo(() => members.filter((member) => {
    if (memberFilter === 'low') return member.staminaKnown && member.maxStaminaKnown && member.stamina <= member.maxStamina * 0.5;
    if (memberFilter === 'recovering') return member.staminaKnown && member.maxStaminaKnown && member.stamina < member.maxStamina;
    if (memberFilter === 'full') return member.staminaKnown && member.maxStaminaKnown && member.stamina >= member.maxStamina;
    return true;
  }), [members, memberFilter]);

  const lowStamina = members.filter((member) => member.staminaKnown && member.maxStaminaKnown && member.stamina <= member.maxStamina * 0.5).length;
  const knownStamina = members.filter((member) => member.staminaKnown && member.maxStaminaKnown);

  const countdown = useMemo(() => {
    const seconds = Math.max(0, Math.floor((new Date(seasonEnd).getTime() - Date.now()) / 1000));
    return [Math.floor(seconds / 86400), Math.floor(seconds / 3600) % 24, Math.floor(seconds / 60) % 60, seconds % 60];
  }, [seasonEnd, lastSync, status]);

  const sortBy = (key) => {
    if (sort === key) setDirection((value) => value === 'asc' ? 'desc' : 'asc');
    else { setSort(key); setDirection(key === 'clan' ? 'asc' : 'desc'); }
  };
  const mark = (key) => sort === key ? (direction === 'asc' ? ' ↑' : ' ↓') : '';
  const openClan = (clan) => { setSelected(clan); setMembers([]); loadMembers(clan); };

  return <main className={`tracker ${compact ? 'compact' : ''}`}>
    <div className="topbar">
      <div className="top-status"><span className={`status-dot ${statusInfo.tone}`}></span><b>{statusInfo.label}</b><span>{statusInfo.detail}</span></div>
      <button className="settings-button" onClick={() => setSettingsOpen((value) => !value)} aria-label="Settings">⚙</button>
    </div>

    {settingsOpen && <aside className="settings-panel">
      <header><div><div className="eyebrow">TRACKER CONFIG</div><h3>Settings</h3></div><button className="close-button" onClick={() => setSettingsOpen(false)}>×</button></header>
      <div className="settings-body">
        <label><span><b>Auto refresh</b><small>Keep rankings and member data updated every 5 seconds.</small></span><input type="checkbox" checked={autoRefresh} onChange={(e) => setAutoRefresh(e.target.checked)} /></label>
        <label><span><b>Compact rows</b><small>Reduce table density for larger clan lists.</small></span><input type="checkbox" checked={compact} onChange={(e) => setCompact(e.target.checked)} /></label>
        <button className="refresh-button" onClick={() => { load(); if (selected) loadMembers(selected); }}>↻ Refresh now</button>
      </div>
    </aside>}

    <header className="hero">
      <div><div className="eyebrow">● NINJA ZENSHIN // LIVE TRACKER</div><h1>Clan Intelligence</h1><p>Live clan ranking, member activity, stamina visibility and reputation monitoring for <b>{season}</b>.</p></div>
      <div className="hero-actions"><div className={`live-pill ${statusInfo.tone}`}>● {statusInfo.label}</div><button onClick={load} disabled={status === 'loading'}>↻ {status === 'loading' ? 'Syncing' : 'Refresh'}</button></div>
    </header>

    <section className="stats">
      <div className="card"><div className="eyebrow">TRACKED CLANS</div><strong>{fmt(rows.length)}</strong><small>{source}</small></div>
      <div className="card"><div className="eyebrow">ACTIVE MEMBERS</div><strong>{fmt(activeMembers)} / {fmt(maxMembers)}</strong><small>{maxMembers ? `${Math.round((activeMembers / maxMembers) * 100)}% capacity` : 'Waiting for source'}</small></div>
      <div className="card"><div className="eyebrow">REPUTATION / 30M</div><strong>+{fmt(rep30)}</strong><small>≈ {fmt(Math.round(repRate))} rep/min</small></div>
      <div className="card season-card"><div><div className="eyebrow">SEASON TIMER</div><strong>{season}</strong><small>Last sync {clock(lastSync)}</small></div><div className="countdown">{countdown.map((value, index) => <div key={index}><b>{String(value).padStart(2, '0')}</b><small>{['DAYS','HOURS','MIN','SEC'][index]}</small></div>)}</div></div>
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

    <section className="section">
      <div className="section-head"><div><div className="eyebrow">CLAN RANKINGS</div><h2>Live leaderboard</h2></div><span className="section-meta">{filteredRows.length} visible</span></div>
      <div className="toolbar"><input className="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search clan or master…" aria-label="Search clans" /><button className="minor-button" onClick={() => setQuery('')}>Clear</button></div>
      <div className="table-wrap">
        <div className="table-head"><button onClick={() => sortBy('rank')}>RANK{mark('rank')}</button><button onClick={() => sortBy('clan')}>CLAN{mark('clan')}</button><span>MASTER</span><button onClick={() => sortBy('memberCurrent')}>MEMBERS{mark('memberCurrent')}</button><button onClick={() => sortBy('reputation')}>REPUTATION{mark('reputation')}</button><span>30M GAIN</span><span>STATUS</span></div>
        {filteredRows.length ? filteredRows.map((row) => <button className="table-row" key={`${row.clan}-${row.rank}`} onClick={() => openClan(row)}>
          <span className="rank">#{row.rank}</span><span className="clan-cell"><b>{row.clan}</b><i style={{ width: `${Math.min(100, Math.max(8, num(row.reputation) / Math.max(1, num(rows[0]?.reputation)) * 100))}%` }} /></span><span>{row.master || '—'}</span><span>{row.memberCurrent}/{row.memberMax}</span><span>{fmt(row.reputation)}</span><span className="gain">+{fmt(gain(history, row.clan))}</span><span className="row-status"><span className="status-dot good"></span>LIVE</span>
        </button>) : <div className="empty">{status === 'error' ? 'Live source unavailable. Use Refresh to retry.' : query ? `No clans found for “${query}”.` : 'Loading clan data…'}</div>}
      </div>
    </section>

    <section className="section stamina-preview">
      <div className="section-head"><div><div className="eyebrow">STAMINA COMMAND CENTER</div><h2>Live stamina visibility</h2></div><span className={`mini-alert ${lowStamina ? 'warning' : ''}`}>{lowStamina ? `${lowStamina} LOW` : 'NO LOW STAMINA'}</span></div>
      {!selected ? <div className="empty-panel"><b>Select a clan from the leaderboard</b><span>Live members and stamina details open from any clan row.</span></div> : <div className="stamina-summary"><div><span>CLAN</span><b>{selected.clan}</b></div><div><span>MEMBERS</span><b>{fmt(members.length)}</b></div><div><span>KNOWN STAMINA</span><b>{knownStamina.length}/{members.length}</b></div><div><span>LOW STAMINA</span><b className={lowStamina ? 'warning-text' : ''}>{fmt(lowStamina)}</b></div></div>}
    </section>

    <footer><span>Source: {source}</span><span>{status === 'live' ? `Updated ${clock(lastSync)}` : detail}</span></footer>

    {selected && <div className="modal" role="dialog" aria-modal="true">
      <div className="modal-box">
        <header className="modal-head"><div><div className="eyebrow">LIVE MEMBERS · AMF</div><h2>{selected.clan}</h2><p>{selected.master || 'Clan master unavailable'} · {memberStatus === 'live' ? `updated ${clock(memberUpdated)}` : memberStatus === 'loading' ? 'syncing members…' : 'member source unavailable'}</p></div><button className="close-button" onClick={() => setSelected(null)}>×</button></header>
        <div className="modal-body">
          <div className="member-actions"><div className="tabs">{[['all','ALL'],['low','LOW'],['recovering','RECOVERING'],['full','FULL']].map(([key,label]) => <button key={key} className={`enh-tab ${memberFilter === key ? 'active' : ''}`} onClick={() => setMemberFilter(key)}>{label}</button>)}</div><button className="minor-button" onClick={() => loadMembers(selected)}>↻ Sync members</button></div>
          {memberStatus === 'error' ? <div className="error-panel"><b>Unable to fetch live members right now.</b><span>{memberError}</span><button className="refresh-button" onClick={() => loadMembers(selected)}>Retry member sync</button></div> : <>
            <div className="member-stats"><div><small>MEMBERS</small><b>{fmt(members.length)}</b></div><div><small>LOW STAMINA</small><b className={lowStamina ? 'warning-text' : ''}>{fmt(lowStamina)}</b></div><div><small>AVG STAMINA</small><b>{knownStamina.length ? `${Math.round(knownStamina.reduce((sum, m) => sum + (m.stamina / Math.max(1, m.maxStamina)) * 100, 0) / knownStamina.length)}%` : 'N/A'}</b></div><div><small>SOURCE</small><b>AMF</b></div></div>
            <div className="member-table"><div className="member-head"><span>#</span><span>MEMBER</span><span>LVL</span><span>STAMINA</span><span>REP</span><span>GAIN</span></div>{memberView.length ? memberView.map((member, index) => <div className="member-row" key={member.id || member.name}><span className="rank">{index + 1}</span><span><b>{member.name}</b></span><span>{num(member.level)}</span><span className={member.staminaKnown && member.maxStaminaKnown && member.stamina <= member.maxStamina * 0.5 ? 'warning-text' : ''}>{member.staminaKnown && member.maxStaminaKnown ? `${fmt(member.stamina)} / ${fmt(member.maxStamina)}` : 'N/A'}</span><span>{fmt(member.reputation)}</span><span className="gain">+{fmt(member.gain)}</span></div>) : <div className="empty">No members match this filter.</div>}</div>
          </>}
        </div>
        <div className="modal-foot">Live data is read-only · refreshes automatically while Auto refresh is enabled</div>
      </div>
    </div>}
  </main>;
}
