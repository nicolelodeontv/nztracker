'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { CLAN_WAR_RULES, getVictoryResult } from './clan-war-rules';
import './one-page.css';

const REFRESH_MS = 5000;
const SETTINGS_KEY = 'nztracker:settings:v9';
const HISTORY_KEY = 'nztracker:history:v9';
const ATTACK_STAMINA_KEY = 'nztracker:attack-stamina:v2';
const DEFAULT_MAX_STAMINA = 200;
const DEFAULT_ATTACK_STAMINA = 190;
const ATTACK_COST = CLAN_WAR_RULES.attackerLeaderCost;
const DEFAULT_END = '2026-09-14T00:00:00+08:00';

const fmt = (value) => new Intl.NumberFormat('en-US').format(Number(value || 0));
const num = (value) => Number.isFinite(Number(value)) ? Number(value) : 0;
const clamp = (value, min, max) => Math.max(min, Math.min(max, Number(value) || 0));
const clock = (value) => value ? new Date(value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '—';

function read(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key) || '') ?? fallback; } catch { return fallback; }
}
function write(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch {}
}
function snapshot(history, rows) {
  const next = [...history, { at: Date.now(), rows: rows.map((r) => ({ clan: r.clan, reputation: num(r.reputation), rank: num(r.rank) })) }].slice(-2880);
  write(HISTORY_KEY, next);
  return next;
}
function gain(history, clan, windowMs = 30 * 60 * 1000) {
  const samples = history.filter((item) => item.at >= Date.now() - windowMs);
  if (samples.length < 2) return 0;
  const first = samples.find((item) => item.rows.some((row) => row.clan === clan));
  const last = [...samples].reverse().find((item) => item.rows.some((row) => row.clan === clan));
  const a = first?.rows.find((row) => row.clan === clan)?.reputation;
  const b = last?.rows.find((row) => row.clan === clan)?.reputation;
  return Math.max(0, num(b) - num(a));
}
function staminaInfo(member) {
  const currentRaw = Number(member?.stamina);
  const maxRaw = Number(member?.maxStamina);
  const max = Number.isFinite(maxRaw) && maxRaw > 0 ? maxRaw : DEFAULT_MAX_STAMINA;
  const current = Number.isFinite(currentRaw) ? clamp(currentRaw, 0, max) : max;
  const pct = clamp((current / max) * 100, 0, 100);
  if (pct <= 50) return { current, max, pct, label: 'DRAIN FLOOR', tone: 'critical' };
  if (pct <= 70) return { current, max, pct, label: 'BLEEDING', tone: 'warning' };
  if (pct >= 100) return { current, max, pct, label: 'FULL', tone: 'good' };
  return { current, max, pct, label: 'SAFE', tone: 'good' };
}
function slug(name) {
  return String(name || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

export default function Home() {
  const [rows, setRows] = useState([]);
  const [history, setHistory] = useState(() => read(HISTORY_KEY, []));
  const [status, setStatus] = useState('loading');
  const [detail, setDetail] = useState('Connecting to live source…');
  const [lastSync, setLastSync] = useState(null);
  const [source, setSource] = useState('ninjazenshin.online');
  const [season, setSeason] = useState('Season 2');
  const [seasonEnd, setSeasonEnd] = useState(DEFAULT_END);
  const [selected, setSelected] = useState(null);
  const [members, setMembers] = useState([]);
  const [memberState, setMemberState] = useState('idle');
  const [memberError, setMemberError] = useState('');
  const [memberUpdated, setMemberUpdated] = useState(null);
  const [memberFilter, setMemberFilter] = useState('all');
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState('reputation');
  const [direction, setDirection] = useState('desc');
  const [warStatuses, setWarStatuses] = useState({});
  const [ownRep, setOwnRep] = useState('');
  const [targetClan, setTargetClan] = useState('');
  const [party, setParty] = useState(0);
  const [attackStamina, setAttackStamina] = useState(DEFAULT_ATTACK_STAMINA);
  const [attackHistory, setAttackHistory] = useState(() => read(ATTACK_STAMINA_KEY + ':history', []));
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [compact, setCompact] = useState(false);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const settings = read(SETTINGS_KEY, {});
    setAutoRefresh(settings.autoRefresh ?? true);
    setCompact(settings.compact ?? false);
    setAttackStamina(clamp(Number(read(ATTACK_STAMINA_KEY, DEFAULT_ATTACK_STAMINA)), 0, DEFAULT_MAX_STAMINA));
  }, []);
  useEffect(() => write(SETTINGS_KEY, { autoRefresh, compact }), [autoRefresh, compact]);
  useEffect(() => write(ATTACK_STAMINA_KEY, attackStamina), [attackStamina]);
  useEffect(() => write(ATTACK_STAMINA_KEY + ':history', attackHistory.slice(0, 30)), [attackHistory]);
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer); }, []);

  const loadRankings = useCallback(async () => {
    try {
      const response = await fetch(`/api/clan-ranking?t=${Date.now()}`, { cache: 'no-store' });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.details || data.error || `HTTP ${response.status}`);
      const nextRows = Array.isArray(data.rows) ? data.rows : [];
      if (!nextRows.length) throw new Error('No clan rows returned by the live source.');
      setRows(nextRows);
      setHistory((current) => snapshot(current, nextRows));
      setSeason(data.season || 'Season 2');
      setSeasonEnd(data.seasonEndsAt || DEFAULT_END);
      setSource(data.source ? new URL(data.source).hostname : 'ninjazenshin.online');
      setLastSync(new Date(data.fetchedAt || Date.now()));
      setDetail(`Fetched ${nextRows.length} clans successfully`);
      setStatus('live');
      setSelected((current) => current || nextRows[0]);
      setTargetClan((current) => current || nextRows.find((row) => warStatuses[row.clan]?.state === 'bleeding')?.clan || '');
    } catch (error) {
      setStatus('error');
      setDetail(error instanceof Error ? error.message : 'Unable to reach live source');
    }
  }, [warStatuses]);

  const loadMembers = useCallback(async (clan) => {
    if (!clan?.clanId) {
      setMembers([]);
      setMemberState('error');
      setMemberError('This clan does not expose a live clanId.');
      return;
    }
    setMemberState('loading');
    setMemberError('');
    try {
      const response = await fetch(`/api/clan-members?clanId=${encodeURIComponent(clan.clanId)}&t=${Date.now()}`, { cache: 'no-store' });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.details || data.error || `HTTP ${response.status}`);
      setMembers(Array.isArray(data.members) ? data.members : []);
      setMemberUpdated(new Date(data.fetchedAt || Date.now()));
      setMemberState('live');
    } catch (error) {
      setMemberState('error');
      setMemberError(error instanceof Error ? error.message : 'Unable to load live members');
    }
  }, []);

  const loadWarStatus = useCallback(async (clanRows) => {
    const names = clanRows.map((row) => row.clan).filter(Boolean).slice(0, 25);
    if (!names.length) return;
    try {
      const response = await fetch(`/api/clan-status?clans=${names.map(encodeURIComponent).join(',')}&t=${Date.now()}`, { cache: 'no-store' });
      const data = await response.json().catch(() => ({}));
      if (response.ok) setWarStatuses(data.statuses || {});
    } catch {}
  }, []);

  useEffect(() => {
    loadRankings();
    if (!autoRefresh) return;
    const timer = setInterval(loadRankings, REFRESH_MS);
    return () => clearInterval(timer);
  }, [loadRankings, autoRefresh]);
  useEffect(() => { if (rows.length) loadWarStatus(rows); }, [rows, loadWarStatus]);
  useEffect(() => {
    if (!selected) return;
    loadMembers(selected);
    if (!autoRefresh) return;
    const timer = setInterval(() => loadMembers(selected), REFRESH_MS);
    return () => clearInterval(timer);
  }, [selected, loadMembers, autoRefresh]);

  const sortedRows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return [...rows].filter((row) => !q || `${row.clan} ${row.master}`.toLowerCase().includes(q)).sort((a, b) => {
      const av = sort === 'clan' ? String(a.clan) : num(a[sort]);
      const bv = sort === 'clan' ? String(b.clan) : num(b[sort]);
      const base = typeof av === 'string' ? av.localeCompare(bv) : av - bv;
      return direction === 'asc' ? base : -base;
    });
  }, [rows, query, sort, direction]);

  const activeMembers = rows.reduce((sum, row) => sum + num(row.memberCurrent), 0);
  const maxMembers = rows.reduce((sum, row) => sum + num(row.memberMax), 0);
  const totalReputation = rows.reduce((sum, row) => sum + num(row.reputation), 0);
  const rep30 = rows.reduce((sum, row) => sum + gain(history, row.clan), 0);
  const top3 = rows.slice().sort((a, b) => num(a.rank) - num(b.rank)).slice(0, 3);
  const seasonSeconds = Math.max(0, Math.floor((new Date(seasonEnd).getTime() - now) / 1000));
  const countdown = [Math.floor(seasonSeconds / 86400), Math.floor(seasonSeconds / 3600) % 24, Math.floor(seasonSeconds / 60) % 60, seasonSeconds % 60];
  const selectedStatus = selected ? warStatuses[selected.clan] : null;
  const bleedingTargets = rows.filter((row) => warStatuses[row.clan]?.state === 'bleeding');
  const activeTarget = rows.find((row) => row.clan === targetClan) || bleedingTargets[0] || null;
  const activeTargetStatus = activeTarget ? warStatuses[activeTarget.clan] : null;
  const battleResult = activeTarget && ownRep !== '' && activeTargetStatus?.state === 'bleeding'
    ? getVictoryResult(Number(ownRep), Number(activeTarget.reputation || 0), true)
    : null;

  const memberView = useMemo(() => members.filter((member) => {
    const info = staminaInfo(member);
    if (memberFilter === 'low') return info.pct <= 50;
    if (memberFilter === 'bleeding') return info.pct <= 70;
    if (memberFilter === 'full') return info.pct >= 100;
    return true;
  }), [members, memberFilter]);

  const knownStamina = members.filter((member) => Number.isFinite(Number(member?.stamina))).length;
  const bleedingCount = members.filter((member) => staminaInfo(member).pct <= 70).length;
  const criticalCount = members.filter((member) => staminaInfo(member).pct <= 50).length;
  const fullCount = members.filter((member) => staminaInfo(member).pct >= 100).length;
  const attackPercent = Math.round((attackStamina / DEFAULT_MAX_STAMINA) * 100);

  const openClan = (clan) => {
    setSelected(clan);
    setMemberFilter('all');
    window.location.hash = 'members';
  };
  const sortBy = (key) => {
    if (sort === key) setDirection((value) => value === 'asc' ? 'desc' : 'asc');
    else { setSort(key); setDirection(key === 'clan' ? 'asc' : 'desc'); }
  };
  const mark = (key) => sort === key ? (direction === 'asc' ? ' ↑' : ' ↓') : '';
  const performAttack = () => {
    if (!activeTarget || attackStamina < ATTACK_COST || activeTargetStatus?.state !== 'bleeding') return;
    const before = attackStamina;
    const after = clamp(before - ATTACK_COST, 0, DEFAULT_MAX_STAMINA);
    setAttackStamina(after);
    setAttackHistory((current) => [{ at: Date.now(), clan: activeTarget.clan, reward: battleResult?.reputation ?? 0, party, before, after }, ...current].slice(0, 30));
  };

  return <main className={`one-page ${compact ? 'compact' : ''}`}>
    <header id="command" className="hero">
      <div><div className="eyebrow">● NINJA ZENSHIN // LIVE CLAN OPERATIONS</div><h1>Clan Intelligence</h1><p>One readable workspace for rankings, live members, stamina, clan-war targeting, attack history and recovery rules.</p></div>
      <div className="hero-actions"><span className={`live-pill ${status}`}>● {status === 'live' ? 'LIVE' : status === 'loading' ? 'SYNCING' : 'DEGRADED'}</span><button onClick={() => { loadRankings(); loadMembers(selected); }} disabled={status === 'loading'}>↻ Refresh</button></div>
    </header>

    <section className="stats-grid">
      <div className="metric-card"><small>TRACKED CLANS</small><strong>{fmt(rows.length)}</strong><span>{source}</span></div>
      <div className="metric-card"><small>ACTIVE MEMBERS</small><strong>{fmt(activeMembers)} / {fmt(maxMembers)}</strong><span>{maxMembers ? `${Math.round(activeMembers / maxMembers * 100)}% capacity` : 'Waiting for source'}</span></div>
      <div className="metric-card"><small>TOTAL REPUTATION</small><strong>{fmt(totalReputation)}</strong><span>+{fmt(rep30)} gained / 30m</span></div>
      <div className="metric-card season-card"><div><small>{season.toUpperCase()}</small><strong>{String(countdown[0]).padStart(2,'0')}d {String(countdown[1]).padStart(2,'0')}h</strong><span>Last sync {clock(lastSync)}</span></div><div className="timer-grid">{countdown.map((value, i) => <div key={i}><b>{String(value).padStart(2,'0')}</b><span>{['DAYS','HOURS','MIN','SEC'][i]}</span></div>)}</div></div>
    </section>

    <div className={`source-bar ${status}`}><span className="source-dot"></span><div><b>{status === 'live' ? 'Live source connected' : status === 'error' ? 'Live source needs attention' : 'Live source syncing'}</b><span>{detail}</span></div><strong>{clock(lastSync)}</strong></div>

    <section className="top-clans" aria-label="Top clans">{top3.map((clan, i) => <button key={clan.clan} onClick={() => openClan(clan)} className="top-clan"><span className="rank">#{clan.rank}</span><div><b>{clan.clan}</b><small>{clan.master || '—'}</small></div><span><em>{fmt(clan.reputation)}</em><small>REP</small></span><span><em>{clan.memberCurrent}/{clan.memberMax}</em><small>MEMBERS</small></span><span className="gain"><em>+{fmt(gain(history, clan.clan))}</em><small>30M GAIN</small></span></button>)}</section>

    <section id="rankings" className="panel">
      <div className="panel-head"><div><div className="eyebrow">CLAN RANKINGS</div><h2>Live leaderboard</h2><p>Click a clan to load its members in this same page.</p></div><span>{sortedRows.length} clans</span></div>
      <div className="toolbar"><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search clan or master…" aria-label="Search clan or master" /><button onClick={() => setQuery('')}>Clear</button></div>
      <div className="table-scroll"><div className="ranking-head"><button onClick={() => sortBy('rank')}>RANK{mark('rank')}</button><button onClick={() => sortBy('clan')}>CLAN{mark('clan')}</button><span>MASTER</span><button onClick={() => sortBy('memberCurrent')}>MEMBERS{mark('memberCurrent')}</button><button onClick={() => sortBy('reputation')}>REPUTATION{mark('reputation')}</button><span>30M GAIN</span><span>WAR</span></div>
        {sortedRows.map((row) => { const state = warStatuses[row.clan]?.state || 'unknown'; return <button key={`${row.clan}-${row.rank}`} className="ranking-row" onClick={() => openClan(row)}><span className="rank">#{row.rank}</span><span className="clan-name"><b>{row.clan}</b><i style={{ width: `${Math.min(100, Math.max(8, num(row.reputation) / Math.max(1, num(rows[0]?.reputation)) * 100))}%` }} /></span><span>{row.master || '—'}</span><span>{row.memberCurrent}/{row.memberMax}</span><span>{fmt(row.reputation)}</span><span className="gain">+{fmt(gain(history, row.clan))}</span><span className={`war-state ${state}`}>{state === 'bleeding' ? 'BLEEDING' : state === 'potential-bleeding' ? 'POTENTIAL' : state === 'healthy' ? 'READY' : '—'}</span></button>; })}
        {!sortedRows.length && <div className="empty">{status === 'error' ? 'Live source unavailable. Use Refresh to retry.' : 'No clans match your search.'}</div>}
      </div>
    </section>

    <section id="members" className="panel">
      <div className="panel-head"><div><div className="eyebrow">LIVE MEMBERS</div><h2>{selected?.clan || 'Select a clan'}</h2><p>Live member names, reputation and stamina. Missing max stamina defaults to 200.</p></div><span>{clock(memberUpdated)}</span></div>
      {!selected ? <div className="empty">Select a clan from the leaderboard.</div> : <>
        <div className="member-metrics"><div><small>MEMBERS</small><b>{members.length}/{selected.memberMax || '—'}</b></div><div><small>KNOWN STAMINA</small><b>{knownStamina}/{members.length || 0}</b></div><div><small>BLEEDING</small><b>{bleedingCount}</b></div><div><small>FULL</small><b>{fullCount}</b></div></div>
        <div className="filter-bar">{['all','low','bleeding','full'].map((filter) => <button key={filter} className={memberFilter === filter ? 'active' : ''} onClick={() => setMemberFilter(filter)}>{filter === 'all' ? 'ALL' : filter.toUpperCase()}</button>)}<button onClick={() => loadMembers(selected)}>↻ Sync members</button></div>
        {memberState === 'error' && <div className="error-box"><b>Member source unavailable</b><span>{memberError}</span></div>}
        {memberState === 'loading' && <div className="empty">Fetching live member data…</div>}
        {memberState === 'live' && <div className="member-scroll"><div className="member-head"><span>MEMBER</span><span>LEVEL</span><span>REPUTATION</span><span>STAMINA</span><span>STATUS</span></div>{memberView.map((member, i) => { const info = staminaInfo(member); return <div className="member-row" key={`${member.name}-${i}`}><span><b>{member.name}</b></span><span>{member.level || '—'}</span><span>{fmt(member.reputation)}</span><span><div className="meter"><i style={{ width: `${info.pct}%` }} /></div><small>{fmt(info.current)} / {fmt(info.max)}</small></span><span className={`state ${info.tone}`}>{info.label}</span></div>; })}{!memberView.length && <div className="empty">No members match this filter.</div>}</div>}
      </>}
    </section>

    <section id="war" className="operations-grid">
      <div className="panel war-panel">
        <div className="panel-head"><div><div className="eyebrow">CLAN WAR</div><h2>Targeting & attack</h2><p>Choose a confirmed Bleeding clan and calculate the reward before attacking.</p></div><span>{bleedingTargets.length} bleeding</span></div>
        <div className="war-controls"><label>Your reputation<input value={ownRep} onChange={(e) => setOwnRep(e.target.value.replace(/[^0-9]/g, ''))} placeholder="267419" /></label><label>Target<select value={activeTarget?.clan || ''} onChange={(e) => setTargetClan(e.target.value)}><option value="">Select a target</option>{bleedingTargets.map((row) => <option key={row.clan} value={row.clan}>{row.clan} · {fmt(row.reputation)} REP</option>)}</select></label></div>
        <div className="party-row"><span>PARTY</span>{[0,1,2].map((n) => <button key={n} className={party === n ? 'active' : ''} onClick={() => setParty(n)}>{n === 0 ? 'SOLO' : `+${n}`}</button>)}</div>
        <div className="target-card"><div><small>SELECTED TARGET</small><strong>{activeTarget?.clan || 'No confirmed target'}</strong><span>{activeTarget ? `${fmt(activeTarget.reputation)} REP · ${activeTargetStatus?.bleedingMembers || 0}/${activeTargetStatus?.memberCount || 0} below threshold` : 'The assistant only recommends fully verified Bleeding clans.'}</span></div><div className="reward"><small>EXPECTED REP</small><b>{battleResult ? `+${battleResult.reputation}` : '—'}</b></div></div>
        <div className="attack-stamina"><div><small>YOUR ATTACK STAMINA</small><strong>{attackStamina} / {DEFAULT_MAX_STAMINA}</strong><span>{attackPercent}% · −{ATTACK_COST} per attack</span></div><div className="meter large"><i style={{ width: `${attackPercent}%` }} /></div><div className="attack-actions"><button onClick={() => setAttackStamina(DEFAULT_MAX_STAMINA)}>Reset to 200</button><button className="primary" onClick={performAttack} disabled={!activeTarget || activeTargetStatus?.state !== 'bleeding' || attackStamina < ATTACK_COST}>−{ATTACK_COST} Attack</button></div></div>
      </div>

      <div className="panel history-panel">
        <div className="panel-head"><div><div className="eyebrow">ATTACK HISTORY</div><h2>Recent decisions</h2></div><span>local</span></div>
        <div className="history-list">{attackHistory.slice(0, 10).map((item, i) => <div className="history-row" key={`${item.at}-${i}`}><span>{new Date(item.at).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}</span><b>{item.clan}</b><em>−{ATTACK_COST} STA · +{fmt(item.reward)} REP · {item.after}/{DEFAULT_MAX_STAMINA}</em></div>)}{!attackHistory.length && <div className="empty">No attacks recorded yet.</div>}</div>
      </div>
    </section>

    <section id="stamina" className="panel">
      <div className="panel-head"><div><div className="eyebrow">STAMINA</div><h2>Command center</h2><p>Selected-clan stamina at a glance — no duplicate war panels or extra pages.</p></div><span>{selected?.clan || 'No clan selected'}</span></div>
      <div className="stamina-summary"><div><small>KNOWN</small><b>{knownStamina}</b></div><div><small>BLEEDING</small><b>{bleedingCount}</b></div><div><small>DRAIN FLOOR</small><b>{criticalCount}</b></div><div><small>FULL</small><b>{fullCount}</b></div></div>
      {selected && memberState === 'live' && <div className="stamina-list">{memberView.slice(0, 12).map((member, i) => { const info = staminaInfo(member); return <div className="stamina-line" key={`${member.name}-${i}`}><b>{member.name}</b><div className="meter"><i style={{ width: `${info.pct}%` }} /></div><span>{fmt(info.current)}/{fmt(info.max)}</span><em className={info.tone}>{info.label}</em></div>; })}</div>}
      {!selected && <div className="empty">Select a clan to view stamina.</div>}
    </section>

    <section id="rules" className="panel rules-panel">
      <div className="panel-head"><div><div className="eyebrow">QUICK RULES</div><h2>Clan War reference</h2><p>No PvE or PvP sections.</p></div></div>
      <div className="rules-grid"><div><b>200</b><span>Personal stamina cap used by the tracker.</span></div><div><b>−10 / attack</b><span>Attacker leader stamina cost.</span></div><div><b>70%</b><span>Bleeding threshold.</span></div><div><b>50%</b><span>Drain-floor priority threshold.</span></div><div><b>:00 / :30</b><span>Recovery checks every 30 minutes.</span></div><div><b>+30</b><span>Base recovery before Ramen level bonus.</span></div></div>
    </section>

    <section id="settings" className="panel settings-inline">
      <div className="panel-head"><div><div className="eyebrow">SETTINGS</div><h2>Tracker preferences</h2></div></div>
      <div className="settings-row"><label><span><b>Auto refresh</b><small>Update rankings and selected members every 5 seconds.</small></span><input type="checkbox" checked={autoRefresh} onChange={(e) => setAutoRefresh(e.target.checked)} /></label><label><span><b>Compact tables</b><small>Reduce row height for large lists.</small></span><input type="checkbox" checked={compact} onChange={(e) => setCompact(e.target.checked)} /></label><button onClick={() => { loadRankings(); if (selected) loadMembers(selected); }}>↻ Refresh now</button></div>
    </section>

    <footer className="footer-note">Ninja Zenshin Live Tracker · Single-page Clan Operations Dashboard · {source} · Last sync {clock(lastSync)}</footer>
  </main>;
}
