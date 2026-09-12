'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import RankingTable from './RankingTable';
import SyncStatusPanel from './SyncStatusPanel';
import ClanIntelligence from './ClanIntelligence';
import { buildMemberRows, deriveAlerts, deriveEvents } from '../lib/metrics';

const RANKING_REFRESH_MS = 30000;
const RANKING_RETRY_MS = 5000;
const OPS_REFRESH_MS = 10000;
const MEMBER_REFRESH_MS = 30000;
const FALLBACK_SEASON_END = '2026-09-14T00:00:00+08:00';

async function readJson(url) {
  const response = await fetch(url, {
    cache: 'no-store',
    headers: { Accept: 'application/json', 'Cache-Control': 'no-cache' },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.details || data.error || `HTTP ${response.status}`);
  return data;
}

function rankingAgeLabel(updatedAt) {
  if (!updatedAt) return 'never';
  const age = Math.max(0, Date.now() - new Date(updatedAt).getTime());
  if (!Number.isFinite(age)) return 'unknown';
  if (age < 60000) return `${Math.floor(age / 1000)}s ago`;
  if (age < 3600000) return `${Math.floor(age / 60000)}m ago`;
  return `${Math.floor(age / 3600000)}h ago`;
}

export default function NZTrackerApp() {
  const [view, setView] = useState('player');
  const [clans, setClans] = useState([]);
  const [season, setSeason] = useState('Season 2');
  const [seasonEnd, setSeasonEnd] = useState(FALLBACK_SEASON_END);
  const [updatedAt, setUpdatedAt] = useState(null);
  const [rankingState, setRankingState] = useState('LOADING');
  const [rankingError, setRankingError] = useState('');
  const [sync, setSync] = useState(null);
  const [health, setHealth] = useState(null);
  const [selected, setSelected] = useState(null);
  const [members, setMembers] = useState([]);
  const [history, setHistory] = useState(null);
  const [memberState, setMemberState] = useState('IDLE');
  const [historyState, setHistoryState] = useState('IDLE');
  const [periodHours, setPeriodHours] = useState(5);
  const [eventFilter, setEventFilter] = useState('ALL');
  const [now, setNow] = useState(Date.now());
  const [lastRankingStatus, setLastRankingStatus] = useState('');
  const retryRef = useRef(null);

  const refreshRanking = useCallback(async () => {
    try {
      const bust = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const data = await readJson(`/api/clan-ranking?refresh=${bust}`);
      const rows = Array.isArray(data.rows) ? data.rows : [];
      if (!rows.length) throw new Error('Game ranking returned no clans.');
      setClans(rows);
      setSeason(data.season || 'Season 2');
      setSeasonEnd(data.seasonEndsAt || FALLBACK_SEASON_END);
      setUpdatedAt(data.updatedAt || data.fetchedAt || null);
      setLastRankingStatus(data.sourceStatus || 'live');
      if (data.sourceStatus === 'live') {
        setRankingState('LIVE');
        setRankingError('');
      } else if (data.sourceStatus === 'stale-live-fallback') {
        setRankingState('STALE');
        setRankingError(data.liveError || 'Live game source is temporarily unavailable. Showing the last verified ranking.');
      } else {
        setRankingState('CACHED');
        setRankingError('Ranking is cached and waiting for a fresh game sync.');
      }
    } catch (error) {
      setRankingState((current) => clans.length ? 'STALE' : 'WAITING');
      setRankingError(error instanceof Error ? error.message : 'Game ranking source unavailable');
    }
  }, [clans.length]);

  const refreshOps = useCallback(async () => {
    try {
      const bust = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const [syncData, healthData] = await Promise.all([
        readJson(`/api/sync-status?refresh=${bust}`),
        readJson(`/api/health?refresh=${bust}`),
      ]);
      setSync(syncData);
      setHealth(healthData);
    } catch {
      // Keep the last known telemetry when an ops poll fails.
    }
  }, []);

  const refreshSelected = useCallback(async (clan) => {
    if (!clan?.clanId) return;
    try {
      setMemberState('LOADING');
      const data = await readJson(`/api/clan-members?clanId=${encodeURIComponent(clan.clanId)}&refresh=${Date.now()}`);
      setMembers(Array.isArray(data.members) ? data.members : []);
      setMemberState(data.stale ? 'STALE' : 'LIVE');
    } catch (error) {
      setMemberState('ERROR');
    }
    try {
      setHistoryState('LOADING');
      const data = await readJson(`/api/member-history?clanId=${encodeURIComponent(clan.clanId)}&season=${encodeURIComponent(season)}&hours=168&refresh=${Date.now()}`);
      setHistory(data);
      setHistoryState(data.stored ? 'DURABLE' : 'LOCAL');
    } catch {
      setHistory(null);
      setHistoryState('ERROR');
    }
  }, [season]);

  useEffect(() => {
    refreshRanking();
    const timer = setInterval(refreshRanking, RANKING_REFRESH_MS);
    return () => clearInterval(timer);
  }, [refreshRanking]);

  useEffect(() => {
    if (rankingState === 'LIVE') {
      if (retryRef.current) clearInterval(retryRef.current);
      retryRef.current = null;
      return undefined;
    }
    if (!retryRef.current) retryRef.current = setInterval(refreshRanking, RANKING_RETRY_MS);
    return () => {
      if (retryRef.current) clearInterval(retryRef.current);
      retryRef.current = null;
    };
  }, [rankingState, refreshRanking]);

  useEffect(() => {
    if (view !== 'ops') return undefined;
    refreshOps();
    const timer = setInterval(refreshOps, OPS_REFRESH_MS);
    return () => clearInterval(timer);
  }, [view, refreshOps]);

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!selected) return undefined;
    refreshSelected(selected);
    const timer = setInterval(() => refreshSelected(selected), MEMBER_REFRESH_MS);
    return () => clearInterval(timer);
  }, [selected, refreshSelected]);

  const selectedRow = useMemo(() => selected ? clans.find((clan) => String(clan.clanId) === String(selected.clanId)) || selected : null, [selected, clans]);
  const rows = useMemo(() => buildMemberRows(members, history?.members || {}, periodHours, now), [members, history, periodHours, now]);
  const events = useMemo(() => deriveEvents(members, history?.members || {}, now).filter((e) => eventFilter === 'ALL' ? true : eventFilter === '+1K' ? e.gain >= 1000 : e.gain >= 5000), [members, history, now, eventFilter]);
  const alerts = useMemo(() => deriveAlerts(rows, periodHours), [rows, periodHours]);
  const intel = useMemo(() => {
    const gain = rows.reduce((sum, row) => sum + row.gain, 0);
    const active = rows.filter((row) => row.status === 'ACTIVE').length;
    const recent = rows.filter((row) => row.status === 'RECENT').length;
    const idle = rows.filter((row) => row.status === 'IDLE').length;
    const noGain = rows.filter((row) => row.status === 'NO GAIN').length;
    const missing = rows.filter((row) => row.status === 'MISSING').length;
    const reset = rows.filter((row) => row.status === 'RESET').length;
    const top = [...rows].sort((a, b) => b.gain - a.gain).slice(0, 5);
    const burn = rows.filter((row) => row.current < 10000).sort((a, b) => a.current - b.current);
    return { gain, hour: gain / Math.max(periodHours, 1), active, recent, idle, noGain, missing, reset, top, burn };
  }, [rows, periodHours]);

  const countdown = useMemo(() => {
    const total = Math.max(0, Math.floor((new Date(seasonEnd).getTime() - now) / 1000));
    return `${Math.floor(total / 86400)}d ${String(Math.floor(total / 3600) % 24).padStart(2, '0')}h ${String(Math.floor(total / 60) % 60).padStart(2, '0')}m ${String(total % 60).padStart(2, '0')}s`;
  }, [seasonEnd, now]);

  const rankingLabel = rankingState === 'LIVE' ? 'LIVE' : rankingState === 'STALE' ? 'STALE' : rankingState === 'CACHED' ? 'CACHED' : 'SYNCING';

  return (
    <main className="nz-app">
      <header className="nz-topbar">
        <div className="nz-brand"><span>🥷</span><div><h1>NINJA ZENSHIN</h1><p>{season} · {countdown}</p></div></div>
        <nav className="nz-switch"><button className={`nz-btn ${view === 'player' ? 'active' : ''}`} onClick={() => setView('player')}>PLAYER</button><button className={`nz-btn ${view === 'ops' ? 'active' : ''}`} onClick={() => setView('ops')}>OPS</button></nav>
      </header>

      {view === 'player' ? (
        <section className="nz-player-layout">
          <div className="nz-status-strip"><span className={`dot ${rankingState === 'LIVE' ? 'live' : rankingState === 'STALE' ? 'stale' : ''}`}></span><b>{rankingLabel}</b><span>Game ranking source</span><span>Updated {rankingAgeLabel(updatedAt)}</span><span>{clans.length} clans</span><span>{lastRankingStatus === 'live' ? 'Verified live fetch' : lastRankingStatus || 'Awaiting verification'}</span></div>
          {rankingState !== 'LIVE' && <div className="nz-notice">{rankingError || 'Waiting for a fresh game ranking sync.'}</div>}
          <RankingTable rows={clans} selectedId={selected?.clanId} onSelect={setSelected} />
          <p className="nz-player-hint">Ranking refreshes every 30s from the game source. If the source is unavailable, the last verified snapshot is labeled STALE instead of being presented as live.</p>
        </section>
      ) : (
        <section className="nz-ops-layout">
          <SyncStatusPanel sync={sync} health={health?.services ? { ranking: health.services.clanRanking?.status, members: health.services.clanMembers?.status, history: health.services.memberHistory?.status } : health} />
          <div className="nz-op-detail"><div><span>MONITOR MODE</span><b>ONE SHARED SCRAPER</b><small>5-minute upstream fetch → durable ranking cache</small></div><div><span>FALLBACK TIER</span><b>LEGACY → AMF → LAST-KNOWN</b><small>Member fallbacks stay operational, not player-facing.</small></div><div><span>CLIENT</span><b>LIVE VERIFY</b><small>30s ranking refresh · 30s member refresh · 10s ops telemetry</small></div></div>
          <div className="nz-ops-note"><b>Operational boundary</b><span>Source health, Blob durability, heartbeat, scraper source, fallback tier and monitor errors stay in Ops.</span></div>
        </section>
      )}

      {selected && <div className="nz-modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setSelected(null); }}><div className="nz-modal"><div className="nz-modal-head"><div><span className="nz-kicker">LIVE → CLAN</span><h2>{selectedRow?.clan || selected.clan}</h2><small>Members: {memberState} · History: {historyState}</small></div><button className="nz-btn" onClick={() => setSelected(null)}>CLOSE</button></div><div className="nz-modal-body"><ClanIntelligence clan={selectedRow} rows={rows} intel={intel} events={events} alerts={alerts} periodHours={periodHours} setPeriodHours={setPeriodHours} eventFilter={eventFilter} setEventFilter={setEventFilter} /></div></div></div>}
    </main>
  );
}
