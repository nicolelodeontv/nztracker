'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

const REFRESH_MS = 1000;
const INTELLIGENCE_REFRESH_MS = 10000;
const SYNC_REFRESH_MS = 5000;
const RANKING_API = '/api/clan-ranking';
const MEMBERS_API = '/api/clan-members';
const HISTORY_API = '/api/member-history';
const HEALTH_API = '/api/health';
const SYNC_API = '/api/sync-status';
const FALLBACK_SEASON_END = '2026-09-14T00:00:00+08:00';
const PERIODS = [1, 3, 5, 6, 12, 24, 168];
const PERIOD_LABELS = { 1: '1H', 3: '3H', 5: '5H', 6: '6H', 12: '12H', 24: '24H', 168: '7D' };
const format = (n) => Number(n || 0).toLocaleString('en-US');
const num = (v) => Number(String(v ?? '').replace(/[^0-9.-]/g, '')) || 0;
const clamp = (n, min, max) => Math.max(min, Math.min(max, n));
const hoursBetween = (a, b) => Math.max(0, (Number(b) - Number(a)) / 3600000);
const dateText = (v) => v ? new Date(v).toLocaleString('en-PH', { hour12: false }) : '—';

function timelineFor(historyMember) {
  return Array.isArray(historyMember?.points) ? historyMember.points.slice().sort((a, b) => Number(a.t) - Number(b.t)) : [];
}

function baselinePoint(points, since) {
  if (!points.length) return null;
  const before = points.filter((p) => Number(p.t) <= since).at(-1);
  return before || points[0];
}

function statusFor(member, historyMember, now, windowStart) {
  const points = timelineFor(historyMember);
  if (member?.missing) return 'MISSING';
  if (points.length < 2) return 'NEW';
  const latest = points.at(-1);
  const prior = points.at(-2);
  if (Number(latest.r) < Number(prior.r)) return 'RESET';
  const ageMinutes = (now - Number(latest.t)) / 60000;
  const baseline = baselinePoint(points, windowStart);
  const periodGain = num(latest.r) - num(baseline?.r);
  if (periodGain > 0 && ageMinutes <= 15) return 'ACTIVE';
  if (ageMinutes <= 30) return 'RECENT';
  if (ageMinutes <= 360) return 'IDLE';
  return 'NO GAIN';
}

function memberMetrics(member, historyMember, hours, now) {
  const points = timelineFor(historyMember);
  const since = now - hours * 3600000;
  const current = num(member?.reputation ?? member?.rep ?? points.at(-1)?.r);
  const baseline = baselinePoint(points, since);
  const first = baseline ? num(baseline.r) : current;
  const gain = Math.max(0, current - first);
  const reset = Boolean(baseline && current < first) || points.some((p, i) => i && num(p.r) < num(points[i - 1].r));
  const latestTs = Number(points.at(-1)?.t || 0);
  const measuredHours = latestTs ? hoursBetween(Number(points[0]?.t || latestTs), latestTs) : 0;
  const gainPerHour = measuredHours > 0 ? gain / Math.max(hoursBetween(Number(baseline?.t || since), now), 1 / 60) : 0;
  return { current, before: first, gain, gainPerHour, latestTs, reset };
}

function deriveEvents(members, history, now) {
  const events = [];
  for (const member of members) {
    const points = timelineFor(history?.[member.id]);
    for (let i = 1; i < points.length; i += 1) {
      const before = num(points[i - 1].r);
      const after = num(points[i].r);
      const gain = after - before;
      if (gain <= 0) continue;
      const t = Number(points[i].t);
      if (now - t > 24 * 3600000) continue;
      events.push({ t, member: member.name, gain, before, after });
    }
  }
  return events.sort((a, b) => b.t - a.t);
}

function badgeClass(value) {
  return `badge badge-${String(value).toLowerCase().replace(/\s+/g, '-')}`;
}

export default function Home() {
  const [clans, setClans] = useState([]);
  const [season, setSeason] = useState('Season 2');
  const [seasonEnd, setSeasonEnd] = useState(FALLBACK_SEASON_END);
  const [now, setNow] = useState(Date.now());
  const [rankingState, setRankingState] = useState('LOADING');
  const [rankingError, setRankingError] = useState('');
  const [sync, setSync] = useState(null);
  const [health, setHealth] = useState({ ranking: 'UNKNOWN', members: 'UNKNOWN', history: 'UNKNOWN' });
  const [mode, setMode] = useState('NORMAL');
  const [filter, setFilter] = useState('ALL');
  const [selected, setSelected] = useState(null);
  const [members, setMembers] = useState([]);
  const [history, setHistory] = useState(null);
  const [memberState, setMemberState] = useState('LOADING');
  const [historyState, setHistoryState] = useState('LOADING');
  const [periodHours, setPeriodHours] = useState(5);
  const [eventFilter, setEventFilter] = useState('ALL');
  const [copied, setCopied] = useState(false);
  const [lastRankingAt, setLastRankingAt] = useState(null);
  const requestRef = useRef(false);
  const memberRequestRef = useRef(false);

  const refreshRanking = useCallback(async () => {
    if (requestRef.current) return;
    requestRef.current = true;
    try {
      const r = await fetch(`${RANKING_API}?t=${Date.now()}`, { cache: 'no-store', headers: { Accept: 'application/json' } });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(data.details || data.error || `HTTP ${r.status}`);
      setClans(Array.isArray(data.rows) ? data.rows : []);
      setSeason(data.season || 'Season 2');
      setSeasonEnd(data.seasonEndsAt || FALLBACK_SEASON_END);
      setLastRankingAt(Date.now());
      setRankingState('LIVE');
      setRankingError('');
      setHealth((h) => ({ ...h, ranking: 'LIVE' }));
    } catch (e) {
      setRankingState('ERROR');
      setRankingError(e instanceof Error ? e.message : 'Ranking source unavailable');
      setHealth((h) => ({ ...h, ranking: 'ERROR' }));
    } finally {
      requestRef.current = false;
    }
  }, []);

  const refreshSystem = useCallback(async () => {
    try {
      const [healthResponse, syncResponse] = await Promise.all([
        fetch(`${HEALTH_API}?t=${Date.now()}`, { cache: 'no-store' }),
        fetch(`${SYNC_API}?t=${Date.now()}`, { cache: 'no-store' }),
      ]);
      const hd = await healthResponse.json().catch(() => ({}));
      const sd = await syncResponse.json().catch(() => ({}));
      setHealth({
        ranking: hd?.services?.clanRanking?.status === 'ready' ? 'READY' : 'ERROR',
        members: hd?.services?.clanMembers?.status === 'ready' ? 'READY' : 'ERROR',
        history: hd?.services?.memberHistory?.status === 'ready' ? 'DURABLE' : 'LOCAL',
      });
      setSync(sd);
    } catch {
      // Live APIs are polled again on the next tick.
    }
  }, []);

  const refreshMembers = useCallback(async (clan) => {
    if (!clan?.clanId || memberRequestRef.current) return;
    memberRequestRef.current = true;
    try {
      const r = await fetch(`${MEMBERS_API}?clanId=${encodeURIComponent(clan.clanId)}&t=${Date.now()}`, { cache: 'no-store', headers: { Accept: 'application/json' } });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(data.details || data.error || `HTTP ${r.status}`);
      setMembers(Array.isArray(data.members) ? data.members : []);
      setMemberState(data.stale ? 'STALE' : 'LIVE');
      setHealth((h) => ({ ...h, members: data.stale ? 'STALE' : 'LIVE' }));
    } catch {
      setMemberState('ERROR');
      setHealth((h) => ({ ...h, members: 'ERROR' }));
    } finally {
      memberRequestRef.current = false;
    }
  }, []);

  const loadHistory = useCallback(async (clan, hours = 168) => {
    if (!clan?.clanId) return;
    setHistoryState('LOADING');
    try {
      const params = new URLSearchParams({ clanId: String(clan.clanId), season, hours: String(hours), t: String(Date.now()) });
      const r = await fetch(`${HISTORY_API}?${params}`, { cache: 'no-store', headers: { Accept: 'application/json' } });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(data.details || data.error || `HTTP ${r.status}`);
      setHistory(data);
      setHistoryState(data.stored ? 'DURABLE' : 'LOCAL');
      setHealth((h) => ({ ...h, history: data.stored ? 'DURABLE' : 'LOCAL' }));
    } catch {
      setHistory(null);
      setHistoryState('ERROR');
    }
  }, [season]);

  useEffect(() => {
    setNow(Date.now());
    const clock = setInterval(() => setNow(Date.now()), 1000);
    void refreshRanking();
    void refreshSystem();
    const ranking = setInterval(() => void refreshRanking(), REFRESH_MS);
    const system = setInterval(() => void refreshSystem(), SYNC_REFRESH_MS);
    return () => { clearInterval(clock); clearInterval(ranking); clearInterval(system); };
  }, [refreshRanking, refreshSystem]);

  useEffect(() => {
    if (!selected) return;
    void refreshMembers(selected);
    void loadHistory(selected, 168);
    const timer = setInterval(() => void refreshMembers(selected), REFRESH_MS);
    const historyTimer = setInterval(() => void loadHistory(selected, 168), INTELLIGENCE_REFRESH_MS);
    return () => { clearInterval(timer); clearInterval(historyTimer); };
  }, [selected, refreshMembers, loadHistory]);

  const clanIndex = useMemo(() => new Map(clans.map((c) => [String(c.clanId), c])), [clans]);
  const selectedRow = selected ? clanIndex.get(String(selected.clanId)) || selected : null;
  const historyMembers = history?.members || {};
  const currentMemberMap = useMemo(() => new Map(members.map((m) => [String(m.id || m.name), m])), [members]);
  const allMemberRows = useMemo(() => {
    const ids = new Set([...Object.keys(historyMembers), ...members.map((m) => String(m.id || m.name))]);
    return [...ids].map((id) => {
      const hist = historyMembers[id] || {};
      const live = currentMemberMap.get(id) || null;
      const member = live || { id, name: hist.name || id, reputation: hist.points?.at(-1)?.r || 0, missing: true };
      const metrics = memberMetrics(member, hist, periodHours, now);
      const status = statusFor(member, hist, now, now - periodHours * 3600000);
      return { ...member, id, ...metrics, status, historyMember: hist };
    }).sort((a, b) => b.current - a.current);
  }, [historyMembers, members, currentMemberMap, periodHours, now]);

  const selectedIntel = useMemo(() => {
    const reps = allMemberRows.map((m) => m.current);
    const before = allMemberRows.map((m) => m.before);
    const gain = allMemberRows.reduce((s, m) => s + m.gain, 0);
    const active = allMemberRows.filter((m) => m.status === 'ACTIVE').length;
    const recent = allMemberRows.filter((m) => m.status === 'RECENT').length;
    const idle = allMemberRows.filter((m) => m.status === 'IDLE').length;
    const noGain = allMemberRows.filter((m) => m.status === 'NO GAIN').length;
    const missing = allMemberRows.filter((m) => m.status === 'MISSING').length;
    const resets = allMemberRows.filter((m) => m.status === 'RESET').length;
    const avg = allMemberRows.length ? gain / allMemberRows.length : 0;
    const hour = gain / Math.max(periodHours, 1);
    const top = [...allMemberRows].sort((a, b) => b.gain - a.gain).slice(0, 5);
    const burn = [...allMemberRows].filter((m) => m.current < 10000).sort((a, b) => a.current - b.current);
    const rank = Number(selectedRow?.rank || 0);
    const above = rank > 1 ? clans.find((c) => Number(c.rank) === rank - 1) : null;
    const below = clans.find((c) => Number(c.rank) === rank + 1);
    const takeover = above ? Math.max(0, num(above.reputation) - num(selectedRow?.reputation)) : 0;
    const lead = below ? Math.max(0, num(selectedRow?.reputation) - num(below.reputation)) : 0;
    return { reps, before, gain, active, recent, idle, noGain, missing, resets, avg, hour, top, burn, takeover, lead, rank };
  }, [allMemberRows, clans, selectedRow, periodHours]);

  const events = useMemo(() => {
    if (!selected) return [];
    const raw = deriveEvents(members.map((m) => ({ ...m, id: String(m.id || m.name) })), historyMembers, now);
    if (eventFilter === '+1K') return raw.filter((e) => e.gain >= 1000);
    if (eventFilter === '+5K') return raw.filter((e) => e.gain >= 5000);
    if (eventFilter === 'MEMBER') return raw.filter((e) => e.member);
    return raw;
  }, [selected, members, historyMembers, now, eventFilter]);

  const alerts = useMemo(() => {
    if (!selected) return [];
    const result = [];
    for (const m of allMemberRows) {
      if (m.gain >= 10000) result.push({ level: 'HIGH', type: '+10K GAIN', text: `${m.name} gained ${format(m.gain)} in ${PERIOD_LABELS[periodHours]}` });
      if (m.gainPerHour >= 1000) result.push({ level: 'HIGH', type: 'FAST GAIN', text: `${m.name} is averaging ${format(Math.round(m.gainPerHour))}/hr` });
      if (m.status === 'IDLE' || m.status === 'NO GAIN') result.push({ level: 'WARN', type: 'NO ACTIVITY', text: `${m.name} has no positive gain in ${PERIOD_LABELS[periodHours]}` });
      if (m.status === 'RESET') result.push({ level: 'CRIT', type: 'REP RESET', text: `${m.name} reputation dropped below a prior snapshot` });
      if (m.status === 'MISSING') result.push({ level: 'CRIT', type: 'MEMBER MISSING', text: `${m.name} exists in history but is absent from the live source` });
    }
    return result.slice(0, 30);
  }, [selected, allMemberRows, periodHours]);

  const countdown = useMemo(() => {
    const diff = Math.max(0, new Date(seasonEnd).getTime() - now);
    const total = Math.floor(diff / 1000);
    return `${Math.floor(total / 86400)}d ${String(Math.floor(total / 3600) % 24).padStart(2, '0')}h ${String(Math.floor(total / 60) % 60).padStart(2, '0')}m ${String(total % 60).padStart(2, '0')}s`;
  }, [seasonEnd, now]);

  const filteredClans = useMemo(() => clans.filter((c) => {
    const q = filter.toLowerCase();
    if (q === 'all') return true;
    if (q === 'top') return Number(c.rank) <= 3;
    if (q === 'active') return Number(c.members || 0) > 0;
    return String(c.clan || '').toLowerCase().includes(q);
  }), [clans, filter]);

  const copyReport = async () => {
    if (!selected || !selectedRow) return;
    const lines = [
      `🥷 NINJA ZENSHIN — ${selectedRow.clan || selectedRow.name}`,
      `Rank #${selectedRow.rank} • REP ${format(selectedRow.reputation)} • ${mode}`,
      `Period ${PERIOD_LABELS[periodHours]} • Gain ${format(selectedIntel.gain)} • ${format(Math.round(selectedIntel.hour))}/hr`,
      `Active ${selectedIntel.active} • Recent ${selectedIntel.recent} • Idle ${selectedIntel.idle} • No Gain ${selectedIntel.noGain} • Missing ${selectedIntel.missing}`,
      `10K mini-burn candidates: ${selectedIntel.burn.length}`,
      ...selectedIntel.top.map((m, i) => `${i + 1}. ${m.name} +${format(m.gain)}`),
    ];
    try { await navigator.clipboard.writeText(lines.join('\n')); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { setCopied(false); }
  };

  const exportCsv = () => {
    if (!selected) return;
    const rows = allMemberRows.map((m) => [m.name, m.current, m.before, m.gain, Math.round(m.gainPerHour), m.status].map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`).join(','));
    const csv = ['Member,Current REP,Before,Gains,Gain/Hour,Status', ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = `nztracker-${selected.clanId}-${PERIOD_LABELS[periodHours]}.csv`; a.click(); URL.revokeObjectURL(url);
  };

  return (
    <main className="nz3-root">
      <style jsx global>{`
        :root { color-scheme: dark; }
        * { box-sizing: border-box; }
        body { margin: 0; background:#07090d; color:#f5f7fb; font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif; }
        button,input { font: inherit; }
        button { cursor:pointer; }
        .nz3-root { min-height:100vh; display:flex; flex-direction:column; background:radial-gradient(circle at 50% -10%,#172033 0,#07090d 48%); }
        .nz3-shell { width:min(1500px,100%); margin:0 auto; padding:14px 16px 10px; display:flex; flex-direction:column; gap:10px; flex:1; min-height:0; }
        .topbar,.sync,.strip,.panel,.modal { border:1px solid #273142; background:rgba(12,16,23,.96); border-radius:14px; box-shadow:0 10px 30px rgba(0,0,0,.2); }
        .topbar { padding:12px 14px; display:flex; align-items:center; justify-content:space-between; gap:10px; }
        .brand { display:flex; gap:10px; align-items:baseline; min-width:0; }
        .brand h1 { margin:0; font-size:26px; letter-spacing:.08em; font-weight:900; white-space:nowrap; }
        .brand small { color:#92a0b3; font-size:12px; }
        .controls { display:flex; gap:7px; flex-wrap:wrap; justify-content:flex-end; }
        .btn { border:1px solid #324054; background:#111722; color:#e9edf5; border-radius:9px; padding:8px 11px; font-weight:800; font-size:12px; }
        .btn:hover { border-color:#60708a; background:#17202e; transform:translateY(-1px); }
        .btn.active { background:#e8edf5; color:#10151d; border-color:#e8edf5; }
        .sync { padding:10px 12px; display:grid; grid-template-columns:1.4fr repeat(5,1fr); gap:8px; align-items:stretch; }
        .sync-main { min-width:0; }
        .sync-title { font-size:12px; letter-spacing:.12em; font-weight:900; }
        .sync-state { font-size:22px; font-weight:1000; margin-top:2px; }
        .sync-meta,.metric label,.strip span { color:#8f9caf; font-size:10px; text-transform:uppercase; letter-spacing:.08em; }
        .sync-item { padding:7px 9px; border:1px solid #222d3c; border-radius:10px; min-width:0; }
        .sync-item strong { display:block; margin-top:3px; font-size:14px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
        .strip { padding:7px 10px; display:flex; gap:16px; flex-wrap:wrap; }
        .strip b { color:#e8edf5; margin-left:4px; }
        .workspace { display:grid; grid-template-columns:minmax(0,1.25fr) minmax(460px,.95fr); gap:10px; min-height:0; flex:1; }
        .panel { min-height:0; overflow:hidden; }
        .panel-head { padding:11px 12px; display:flex; align-items:center; justify-content:space-between; gap:8px; border-bottom:1px solid #202a37; }
        .panel-head h2 { margin:0; font-size:16px; letter-spacing:.04em; }
        .sub { color:#8492a6; font-size:11px; }
        .table-wrap { overflow:auto; max-height:calc(100vh - 225px); }
        table { width:100%; border-collapse:collapse; min-width:690px; }
        th,td { padding:8px 9px; border-bottom:1px solid #1d2632; text-align:right; font-size:12px; white-space:nowrap; }
        th:first-child,td:first-child,th:nth-child(2),td:nth-child(2) { text-align:left; }
        th { position:sticky; top:0; z-index:2; background:#0f141c; color:#7f8da0; font-size:10px; letter-spacing:.08em; }
        tbody tr:hover { background:#121924; }
        .clan-link { background:none; border:0; color:#f4f7fb; font-weight:900; padding:0; }
        .clan-link:hover { color:#9cc4ff; }
        .gain { color:#9fe3b1; font-weight:900; }
        .rank { font-weight:900; color:#aeb9c9; }
        .right-stack { display:grid; grid-template-rows:auto minmax(0,1fr); gap:10px; min-height:0; }
        .overview { display:grid; grid-template-columns:repeat(5,1fr); gap:7px; padding:9px; }
        .metric { border:1px solid #222d3b; border-radius:10px; padding:9px; }
        .metric strong { display:block; margin-top:3px; font-size:20px; }
        .scroll-panel { overflow:auto; max-height:calc(100vh - 350px); }
        .empty { padding:28px; text-align:center; color:#78869a; }
        .modal-backdrop { position:fixed; inset:0; background:rgba(0,0,0,.72); backdrop-filter:blur(5px); display:flex; align-items:center; justify-content:center; padding:12px; z-index:20; }
        .modal { width:min(1400px,100%); height:min(92vh,930px); display:flex; flex-direction:column; overflow:hidden; }
        .modal-head { padding:12px 14px; display:flex; justify-content:space-between; gap:10px; align-items:center; border-bottom:1px solid #253041; }
        .modal-head h2 { margin:0; font-size:22px; }
        .modal-body { padding:10px; overflow:auto; display:grid; gap:10px; }
        .grid4 { display:grid; grid-template-columns:repeat(4,1fr); gap:8px; }
        .grid3 { display:grid; grid-template-columns:repeat(3,1fr); gap:8px; }
        .section { border:1px solid #222d3c; border-radius:12px; overflow:hidden; }
        .section-title { padding:9px 10px; font-size:12px; font-weight:1000; letter-spacing:.08em; border-bottom:1px solid #222d3c; }
        .section-body { padding:9px; }
        .periods { display:flex; gap:5px; flex-wrap:wrap; }
        .periods .btn { padding:6px 9px; }
        .status-row { display:flex; gap:5px; flex-wrap:wrap; }
        .badge { display:inline-flex; padding:3px 6px; border-radius:999px; border:1px solid #344154; font-size:9px; font-weight:900; letter-spacing:.04em; }
        .badge-active { color:#9fe3b1; border-color:#2e6944; } .badge-recent{color:#cfe8ff;border-color:#395778}.badge-idle{color:#ead7a0;border-color:#6b592f}.badge-no{color:#a8b2c2}.badge-missing,.badge-reset{color:#ff9c9c;border-color:#6f3434}.badge-new{color:#dcc5ff;border-color:#5a4378}
        .list { display:grid; gap:5px; max-height:260px; overflow:auto; }
        .rowline { display:grid; grid-template-columns:1fr auto auto auto; gap:8px; align-items:center; padding:6px 7px; border:1px solid #202a38; border-radius:8px; font-size:11px; }
        .rowline strong { overflow:hidden; text-overflow:ellipsis; }
        .alert { padding:7px 8px; border-left:3px solid #667; background:#0f151d; border-radius:7px; font-size:11px; }
        .alert-high { border-color:#d7ad4d; } .alert-crit { border-color:#d65f5f; } .alert-warn { border-color:#8f9b69; }
        .footer { padding:8px 2px 2px; color:#6d7888; font-size:10px; display:flex; justify-content:space-between; gap:8px; }
        @media (max-width:1100px){ .workspace{grid-template-columns:1fr}.right-stack{grid-template-rows:auto auto}.table-wrap{max-height:46vh}.scroll-panel{max-height:50vh} }
        @media (max-width:720px){ .nz3-shell{padding:8px}.topbar{align-items:flex-start;flex-direction:column}.brand h1{font-size:21px}.sync{grid-template-columns:repeat(2,1fr)}.sync-main{grid-column:1/-1}.overview,.grid4{grid-template-columns:repeat(2,1fr)}.grid3{grid-template-columns:1fr}.modal{height:96vh}.modal-head h2{font-size:18px}.rowline{grid-template-columns:1fr auto}.rowline span:nth-last-child(-n+2){display:none}.footer{flex-direction:column}.strip{gap:8px 12px} }
      `}</style>
      <div className="nz3-shell">
        <header className="topbar">
          <div className="brand"><h1>NINJA ZENSHIN 3.0</h1><small>{season} • {countdown}</small></div>
          <div className="controls">
            <button className={`btn ${mode === 'NORMAL' ? 'active' : ''}`} onClick={() => setMode('NORMAL')}>NORMAL</button>
            <button className={`btn ${mode === 'FD MODE' ? 'active' : ''}`} onClick={() => setMode('FD MODE')}>FD MODE</button>
            <button className="btn" onClick={() => { void refreshRanking(); void refreshSystem(); }}>REFRESH</button>
          </div>
        </header>

        <section className="sync">
          <div className="sync-main"><div className="sync-title">BACKGROUND SYNC</div><div className="sync-state">{sync?.status === 'active' ? 'ACTIVE' : sync?.status === 'stale' ? 'STALE' : 'CHECKING'}</div><div className="sync-meta">Source: Ninja Zenshin • history: {sync?.durable ? 'DURABLE' : 'CHECKING'}</div></div>
          <div className="sync-item"><div className="sync-meta">Last Snapshot</div><strong>{sync?.lastRunAt ? dateText(sync.lastRunAt) : '—'}</strong></div>
          <div className="sync-item"><div className="sync-meta">Next Expected</div><strong>{sync?.nextExpectedAt ? dateText(sync.nextExpectedAt) : '—'}</strong></div>
          <div className="sync-item"><div className="sync-meta">Clans</div><strong>{sync?.clansWithMemberData ?? sync?.clansSeen ?? '—'}</strong></div>
          <div className="sync-item"><div className="sync-meta">Members</div><strong>{sync?.membersSeen ?? '—'}</strong></div>
          <div className="sync-item"><div className="sync-meta">Monitor</div><strong>{sync?.durable ? 'DURABLE' : 'NOT READY'}</strong></div>
        </section>

        <div className="strip">
          <span>RANKING <b>{health.ranking}</b></span><span>LIVE MEMBERS <b>{health.members}</b></span><span>HISTORY <b>{health.history}</b></span><span>UI REFRESH <b>1S</b></span><span>LAST RANKING <b>{lastRankingAt ? `${Math.floor((now - lastRankingAt) / 1000)}s` : '—'}</b></span>
        </div>

        <div className="workspace">
          <section className="panel">
            <div className="panel-head"><div><h2>CLAN RANKING</h2><div className="sub">Live source • click a clan for intelligence</div></div><div className="controls"><button className={`btn ${filter === 'ALL' ? 'active' : ''}`} onClick={() => setFilter('ALL')}>ALL</button><button className={`btn ${filter === 'TOP' ? 'active' : ''}`} onClick={() => setFilter('TOP')}>TOP 3</button></div></div>
            <div className="table-wrap">
              {rankingState === 'ERROR' ? <div className="empty">SOURCE ERROR — {rankingError}</div> : (
                <table><thead><tr><th>RANK</th><th>CLAN</th><th>REP</th><th>MEMBERS</th><th>SERVER</th></tr></thead><tbody>
                  {filteredClans.map((c) => <tr key={c.clanId}><td className="rank">#{c.rank}</td><td><button className="clan-link" onClick={() => setSelected(c)}>{c.clan || c.name || `Clan ${c.clanId}`}</button></td><td>{format(c.reputation)}</td><td>{format(c.members)}</td><td><span className={badgeClass('ACTIVE')}>LIVE</span></td></tr>)}
                </tbody></table>
              )}
            </div>
          </section>

          <div className="right-stack">
            <section className="panel"><div className="panel-head"><div><h2>OPERATIONS OVERVIEW</h2><div className="sub">System health and live monitor coverage</div></div></div><div className="overview">
              <div className="metric"><label>Season</label><strong>{season}</strong></div><div className="metric"><label>Live Clans</label><strong>{sync?.clansWithMemberData ?? clans.length}</strong></div><div className="metric"><label>Live Members</label><strong>{sync?.membersSeen ?? '—'}</strong></div><div className="metric"><label>Monitor Errors</label><strong>{sync?.memberErrors ?? 0}</strong></div><div className="metric"><label>Mode</label><strong>{mode}</strong></div>
            </div></section>
            <section className="panel"><div className="panel-head"><div><h2>3.0 FEATURES</h2><div className="sub">Select a clan to open the command center</div></div></div><div className="scroll-panel"><div className="section-body">
              <div className="grid3">
                <div className="metric"><label>Durable History</label><strong>{health.history}</strong></div><div className="metric"><label>1s Ranking</label><strong>ON</strong></div><div className="metric"><label>1s Members</label><strong>{selected ? 'ON' : 'OPEN CLAN'}</strong></div>
              </div>
              <div className="empty">Clan Intelligence • Activity Timeline • Gain Rate Intelligence • Rep Events • Alerts • 10K Mini-Burn • CSV • Discord Report</div>
            </div></div></section>
          </div>
        </div>

        <footer className="footer"><span>Server history is authoritative for Before / Gain / Total calculations. localStorage is never used as the calculation source.</span><span>{season} • 1-second UI</span></footer>
      </div>

      {selected && <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) setSelected(null); }}>
        <section className="modal">
          <div className="modal-head"><div><h2>#{selectedRow?.rank} {selectedRow?.clan || selectedRow?.name}</h2><div className="sub">Live REP {format(selectedRow?.reputation)} • History {historyState} • Members {memberState}</div></div><div className="controls"><button className="btn" onClick={exportCsv}>CSV</button><button className="btn" onClick={copyReport}>{copied ? 'COPIED' : 'DISCORD REPORT'}</button><button className="btn" onClick={() => setSelected(null)}>CLOSE</button></div></div>
          <div className="modal-body">
            <section className="section"><div className="section-title">CLAN INTELLIGENCE</div><div className="section-body"><div className="grid4">
              <div className="metric"><label>Current REP</label><strong>{format(selectedRow?.reputation)}</strong></div><div className="metric"><label>{PERIOD_LABELS[periodHours]} Gain</label><strong className="gain">+{format(selectedIntel.gain)}</strong></div><div className="metric"><label>Gain / Hour</label><strong>{format(Math.round(selectedIntel.hour))}</strong></div><div className="metric"><label>Overtake Gap</label><strong>{selectedIntel.takeover ? format(selectedIntel.takeover) : '—'}</strong></div>
            </div></div></section>

            <section className="section"><div className="section-title">ACTIVITY INTELLIGENCE • {PERIOD_LABELS[periodHours]}</div><div className="section-body"><div className="periods">{PERIODS.map((p) => <button key={p} className={`btn ${periodHours === p ? 'active' : ''}`} onClick={() => setPeriodHours(p)}>{PERIOD_LABELS[p]}</button>)}</div><div className="status-row" style={{ marginTop:8 }}><span className="badge badge-active">ACTIVE {selectedIntel.active}</span><span className="badge badge-recent">RECENT {selectedIntel.recent}</span><span className="badge badge-idle">IDLE {selectedIntel.idle}</span><span className="badge badge-no">NO GAIN {selectedIntel.noGain}</span><span className="badge badge-missing">MISSING {selectedIntel.missing}</span><span className="badge badge-reset">RESET {selectedIntel.resets}</span></div></div></section>

            <div className="grid3">
              <section className="section"><div className="section-title">TOP GAINERS</div><div className="section-body"><div className="list">{selectedIntel.top.map((m) => <div className="rowline" key={m.id}><strong>{m.name}</strong><span className="gain">+{format(m.gain)}</span><span>{format(Math.round(m.gainPerHour))}/hr</span><span className={badgeClass(m.status)}>{m.status}</span></div>)}</div></div></section>
              <section className="section"><div className="section-title">10K MINI-BURN</div><div className="section-body"><div className="list">{selectedIntel.burn.length ? selectedIntel.burn.map((m) => <div className="rowline" key={m.id}><strong>{m.name}</strong><span>{format(m.current)}</span><span>+{format(m.gain)}</span><span>{format(Math.max(0,10000-m.current))} LEFT</span></div>) : <div className="empty">No members below 10K.</div>}</div></div></section>
              <section className="section"><div className="section-title">ALERT CENTER</div><div className="section-body"><div className="list">{alerts.length ? alerts.map((a, i) => <div className={`alert alert-${a.level.toLowerCase()}`} key={`${a.type}-${i}`}><b>{a.type}</b> — {a.text}</div>) : <div className="empty">No active alerts.</div>}</div></div></section>
            </div>

            <section className="section"><div className="section-title">REP CHANGE EVENT LOG</div><div className="section-body"><div className="periods" style={{ marginBottom:8 }}>{['ALL','+1K','+5K','MEMBER'].map((f) => <button key={f} className={`btn ${eventFilter === f ? 'active' : ''}`} onClick={() => setEventFilter(f)}>{f}</button>)}</div><div className="list">{events.length ? events.slice(0, 80).map((e, i) => <div className="rowline" key={`${e.t}-${i}`}><strong>{e.member}</strong><span className="gain">+{format(e.gain)}</span><span>{format(e.after)}</span><span>{dateText(e.t)}</span></div>) : <div className="empty">No recorded positive rep events in the last 24H.</div>}</div></div></section>

            <section className="section"><div className="section-title">MEMBER ACTIVITY TIMELINE • SERVER HISTORY</div><div className="section-body"><div className="scroll-panel" style={{ maxHeight: 360 }}><table><thead><tr><th>MEMBER</th><th>LIVE REP</th><th>BEFORE</th><th>GAIN</th><th>GAIN/HR</th><th>STATUS</th><th>LAST SNAPSHOT</th></tr></thead><tbody>{allMemberRows.map((m) => <tr key={m.id}><td>{m.name}</td><td>{format(m.current)}</td><td>{format(m.before)}</td><td className="gain">+{format(m.gain)}</td><td>{format(Math.round(m.gainPerHour))}</td><td><span className={badgeClass(m.status)}>{m.status}</span></td><td>{m.latestTs ? dateText(m.latestTs) : '—'}</td></tr>)}</tbody></table></div></div></section>
          </div>
        </section>
      </div>}
    </main>
  );
}
