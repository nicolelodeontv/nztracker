'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import RankingTable from './RankingTable';
import LeaderboardTable from './LeaderboardTable';
import SyncStatusPanel from './SyncStatusPanel';
import ClanIntelligence from './ClanIntelligence';
import { buildMemberRows, deriveAlerts, deriveEvents } from '../lib/metrics';

const RANKING_REFRESH_MS = 30000;
const OPS_REFRESH_MS = 10000;
const BOARD_REFRESH_MS = 30000;
const MEMBER_REFRESH_MS = 30000;
const FALLBACK_SEASON_END = '2026-09-14T00:00:00+08:00';

async function readJson(url) {
  const response = await fetch(url, { cache: 'no-store', headers: { Accept: 'application/json', 'Cache-Control': 'no-cache' } });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.details || data.error || `HTTP ${response.status}`);
  return data;
}

function ageLabel(updatedAt, now = Date.now()) {
  if (!updatedAt) return 'never';
  const age = Math.max(0, now - new Date(updatedAt).getTime());
  if (!Number.isFinite(age)) return 'unknown';
  if (age < 60000) return `${Math.floor(age / 1000)}s ago`;
  if (age < 3600000) return `${Math.floor(age / 60000)}m ago`;
  return `${Math.floor(age / 3600000)}h ago`;
}

function sourceHealth(rows, now) {
  if (!rows?.length) return 'empty';
  const newest = rows.reduce((max, row) => Math.max(max, new Date(row.capturedAt || 0).getTime()), 0);
  if (!newest) return 'unknown';
  return now - newest > 60 * 60 * 1000 ? 'stale' : 'live';
}

export default function NZTrackerApp() {
  const [view, setView] = useState('clans');
  const [clans, setClans] = useState([]);
  const [leaderboards, setLeaderboards] = useState({ pve: [], pvp: [] });
  const [leaderboardMeta, setLeaderboardMeta] = useState({ pve: null, pvp: null });
  const [leaderboardErrors, setLeaderboardErrors] = useState({});
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
  const clockOffsetRef = useRef(0);

  const refreshRanking = useCallback(async () => {
    try {
      const data = await readJson(`/api/clans?limit=500&refresh=${Date.now()}`);
      const rows = Array.isArray(data.clans) ? data.clans : [];
      if (!rows.length) throw new Error('No clan ranking snapshot is available yet.');
      const captured = data.lastUpdated || rows[0]?.capturedAt || null;
      if (captured) clockOffsetRef.current = new Date(captured).getTime() - Date.now();
      setClans(rows);
      setSeason(data.season || rows[0]?.season || 'Season 2');
      setSeasonEnd(data.seasonEndsAt || FALLBACK_SEASON_END);
      setUpdatedAt(captured);
      setRankingState('LIVE');
      setRankingError('');
    } catch (error) {
      setRankingState((state) => clans.length ? 'STALE' : 'WAITING');
      setRankingError(error instanceof Error ? error.message : 'Ranking data unavailable');
    }
  }, [clans.length]);

  const refreshBoards = useCallback(async () => {
    try {
      const data = await readJson(`/api/leaderboards?limit=100&refresh=${Date.now()}`);
      setLeaderboards({ pve: Array.isArray(data.pve) ? data.pve : [], pvp: Array.isArray(data.pvp) ? data.pvp : [] });
      setLeaderboardErrors(data.errors || {});
      setLeaderboardMeta({
        pve: data.pve?.[0] ? { season: data.pve[0].season, round: data.pve[0].round, capturedAt: data.pve[0].capturedAt } : null,
        pvp: data.pvp?.[0] ? { season: data.pvp[0].season, round: data.pvp[0].round, capturedAt: data.pvp[0].capturedAt } : null,
      });
    } catch (error) {
      setLeaderboardErrors((current) => ({ ...current, all: error instanceof Error ? error.message : 'Leaderboard data unavailable' }));
    }
  }, []);

  const refreshOps = useCallback(async () => {
    try {
      const [syncData, healthData] = await Promise.all([
        readJson(`/api/sync-status?refresh=${Date.now()}`),
        readJson(`/api/health?refresh=${Date.now()}`),
      ]);
      setSync(syncData); setHealth(healthData);
    } catch {}
  }, []);

  const refreshSelected = useCallback(async (clan) => {
    if (!clan?.clanId) return;
    try {
      setMemberState('LOADING');
      const data = await readJson(`/api/clan-members?clanId=${encodeURIComponent(clan.clanId)}&refresh=${Date.now()}`);
      setMembers(Array.isArray(data.members) ? data.members : []);
      setMemberState(data.stale ? 'STALE' : 'LIVE');
    } catch { setMemberState('ERROR'); }
    try {
      setHistoryState('LOADING');
      const data = await readJson(`/api/member-history?clanId=${encodeURIComponent(clan.clanId)}&season=${encodeURIComponent(season)}&hours=168&refresh=${Date.now()}`);
      setHistory(data); setHistoryState(data.stored ? 'DURABLE' : 'LOCAL');
    } catch { setHistory(null); setHistoryState('ERROR'); }
  }, [season]);

  useEffect(() => { refreshRanking(); const timer = setInterval(refreshRanking, RANKING_REFRESH_MS); return () => clearInterval(timer); }, [refreshRanking]);
  useEffect(() => { refreshBoards(); const timer = setInterval(refreshBoards, BOARD_REFRESH_MS); return () => clearInterval(timer); }, [refreshBoards]);
  useEffect(() => { if (view !== 'ops') return undefined; refreshOps(); const timer = setInterval(refreshOps, OPS_REFRESH_MS); return () => clearInterval(timer); }, [view, refreshOps]);
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer); }, []);
  useEffect(() => { if (!selected) return undefined; refreshSelected(selected); const timer = setInterval(() => refreshSelected(selected), MEMBER_REFRESH_MS); return () => clearInterval(timer); }, [selected, refreshSelected]);

  const syncedNow = now + clockOffsetRef.current;
  const selectedRow = useMemo(() => selected ? clans.find((clan) => String(clan.clanId) === String(selected.clanId)) || selected : null, [selected, clans]);
  const rows = useMemo(() => buildMemberRows(members, history?.members || {}, periodHours, syncedNow), [members, history, periodHours, syncedNow]);
  const events = useMemo(() => deriveEvents(members, history?.members || {}, syncedNow).filter((e) => eventFilter === 'ALL' ? true : eventFilter === '+1K' ? e.gain >= 1000 : e.gain >= 5000), [members, history, syncedNow, eventFilter]);
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
    const total = Math.max(0, Math.floor((new Date(seasonEnd).getTime() - syncedNow) / 1000));
    return `${Math.floor(total / 86400)}d ${String(Math.floor(total / 3600) % 24).padStart(2, '0')}h ${String(Math.floor(total / 60) % 60).padStart(2, '0')}m ${String(total % 60).padStart(2, '0')}s`;
  }, [seasonEnd, syncedNow]);

  const pveAge = leaderboardMeta.pve?.capturedAt || null;
  const pvpAge = leaderboardMeta.pvp?.capturedAt || null;
  const rankingStatus = sourceHealth(clans, syncedNow);
  const overallStale = [updatedAt, pveAge, pvpAge].some((value) => value && syncedNow - new Date(value).getTime() > 60 * 60 * 1000);

  return (
    <main className="nz-app">
      <header className="nz-topbar">
        <div className="nz-brand"><span>🥷</span><div><h1>NINJA ZENSHIN</h1><p>{season} · {countdown}</p></div></div>
        <nav className="nz-switch" aria-label="Tracker views">
          {[
            ['clans', 'CLANS'],
            ['pve', 'PVE'],
            ['pvp', 'PVP'],
            ['ops', 'OPS'],
          ].map(([key, label]) => <button key={key} className={`nz-btn ${view === key ? 'active' : ''}`} onClick={() => setView(key)}>{label}</button>)}
        </nav>
      </header>

      <section className="nz-global-status">
        <span className={`dot ${rankingStatus === 'live' && !overallStale ? 'live' : 'stale'}`}></span>
        <b>{overallStale ? 'STALE' : rankingState === 'LIVE' ? 'LIVE' : 'SYNCING'}</b>
        <span>CLANS {clans.length || 0} · {ageLabel(updatedAt, syncedNow)}</span>
        <span>PVE {leaderboards.pve.length || 0} · {ageLabel(pveAge, syncedNow)}</span>
        <span>PVP {leaderboards.pvp.length || 0} · {ageLabel(pvpAge, syncedNow)}</span>
        <span>ROSTERS LIVE ON CLICK</span>
      </section>
      {overallStale && <div className="nz-notice">⚠️ Game data may have changed since the last sync. One or more sources are over 1 hour old.</div>}

      {view === 'clans' && <section className="nz-player-layout">
        {rankingError && <div className="nz-notice">{rankingError}</div>}
        <RankingTable rows={clans} selectedId={selected?.clanId} onSelect={setSelected} />
      </section>}

      {view === 'pve' && <section className="nz-player-layout">
        <LeaderboardTable type="pve" rows={leaderboards.pve} season={leaderboardMeta.pve?.season} round={leaderboardMeta.pve?.round} capturedAt={pveAge} error={leaderboardErrors.pve || leaderboardErrors.all} />
      </section>}

      {view === 'pvp' && <section className="nz-player-layout">
        <LeaderboardTable type="pvp" rows={leaderboards.pvp} season={leaderboardMeta.pvp?.season} round={leaderboardMeta.pvp?.round} capturedAt={pvpAge} error={leaderboardErrors.pvp || leaderboardErrors.all} />
      </section>}

      {view === 'ops' && <section className="nz-ops-layout">
        <SyncStatusPanel sync={sync} health={health?.services ? { ranking: health.services.clanRanking?.status, members: health.services.clanMembers?.status, history: health.services.memberHistory?.status } : health} />
        <div className="nz-op-detail">
          <div><span>GAME SOURCE</span><b>ninjazenshin.online</b><small>One upstream HTML fetch for the public leaderboards.</small></div>
          <div><span>SYNC SCHEDULE</span><b>5 MINUTES</b><small>Safe cadence for rankings and leaderboard snapshots.</small></div>
          <div><span>ROSTER MODE</span><b>LIVE ON DEMAND</b><small>Legacy → AMF → last-known fallback when a clan is opened.</small></div>
        </div>
        <div className="nz-ops-note"><b>Partial sync protection</b><span>Clans, PvE, and PvP are recorded independently. A failure in one source does not clear the others.</span></div>
      </section>}

      {selected && <div className="nz-modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setSelected(null); }}><div className="nz-modal"><div className="nz-modal-head"><div><span className="nz-kicker">LIVE → CLAN</span><h2>{selectedRow?.clan || selected.clan}</h2><small>Members: {memberState} · History: {historyState}</small></div><button className="nz-btn" onClick={() => setSelected(null)}>CLOSE</button></div><div className="nz-modal-body"><ClanIntelligence clan={selectedRow} rows={rows} intel={intel} events={events} alerts={alerts} periodHours={periodHours} setPeriodHours={setPeriodHours} eventFilter={eventFilter} setEventFilter={setEventFilter} /></div></div></div>}
    </main>
  );
}
