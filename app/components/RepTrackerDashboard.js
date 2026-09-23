'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { createRefreshGate, DASHBOARD_REFRESH_INTERVAL_MS, LIVE_REFRESH_INTERVAL_MS, PERIOD_HISTORY_REFRESH_INTERVAL_MS } from '../lib/dashboard-client.mjs';
import { buildMemberRows } from '../lib/metrics.js';
import { getSyncHealthAlertState } from '../lib/sync-health.mjs';
import { formatError } from '../lib/error-format.mjs';
import { compareMemberRank, formatRankChange, sortMembersByRank } from '../lib/rank-tracker.mjs';
import OperationsOverview from './OperationsOverview.js';
import ThemedModal from './ThemedModal.js';

const fmt = (n) => Number(n || 0).toLocaleString();
const fmtHours = (n) => Number(n || 0).toFixed(2);
const age = (s) => s == null ? '—' : s < 60 ? `${s}s ago` : s < 3600 ? `${Math.floor(s/60)}m ago` : `${Math.floor(s/3600)}h ago`;
const DASHBOARD_CACHE_KEY = 'nztracker:last-dashboard';
const SYNC_LOCK_KEY = 'nztracker:sync-lock';
const SYNC_LOCK_MS = 20000;
const LIVE_HISTORY_REFRESH_INTERVAL_MS = 10000;

function readDashboardCache() {
  if (typeof window === 'undefined') return null;
  try {
    const cached = JSON.parse(window.localStorage.getItem(DASHBOARD_CACHE_KEY) || 'null');
    return cached?.data?.configured !== undefined ? cached : null;
  } catch {
    return null;
  }
}

function writeDashboardCache(data) {
  if (typeof window === 'undefined' || !data) return;
  try {
    window.localStorage.setItem(DASHBOARD_CACHE_KEY, JSON.stringify({ savedAt: new Date().toISOString(), data }));
  } catch {}
}

function acquireSyncLock() {
  if (typeof window === 'undefined') return true;
  try {
    const current = JSON.parse(window.localStorage.getItem(SYNC_LOCK_KEY) || 'null');
    if (current?.startedAt && Date.now() - Number(current.startedAt) < SYNC_LOCK_MS) return false;
    window.localStorage.setItem(SYNC_LOCK_KEY, JSON.stringify({ startedAt: Date.now() }));
    return true;
  } catch {
    return true;
  }
}

function releaseSyncLock() {
  if (typeof window === 'undefined') return;
  try { window.localStorage.removeItem(SYNC_LOCK_KEY); } catch {}
}

async function api(url, options) {
  const response = await fetch(url, { cache: 'no-store', ...options, headers: { Accept: 'application/json', ...(options?.headers || {}) } });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (response.status === 401 && typeof window !== 'undefined') window.dispatchEvent(new Event('admin-session-expired'));
    throw new Error(formatError(data.error || data.details || `HTTP ${response.status}`, `HTTP ${response.status}`));
  }
  return data;
}

function Countdown({ target }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);
  if (!target) return <b>—</b>;
  const ms = Math.max(0, new Date(target).getTime() - now);
  const total = Math.floor(ms / 1000);
  const d = Math.floor(total / 86400), h = Math.floor((total % 86400) / 3600), m = Math.floor((total % 3600) / 60), s = total % 60;
  return <b className="countdown">{d}d {String(h).padStart(2,'0')}h {String(m).padStart(2,'0')}m {String(s).padStart(2,'0')}s</b>;
}

function LineChart({ points }) {
  if (!points?.length) return <div className="chart-empty">NO STORED SNAPSHOTS</div>;
  const min = Math.min(...points.map(p => Number(p.reputation))), max = Math.max(...points.map(p => Number(p.reputation)));
  const span = Math.max(1, max - min);
  const path = points.map((p, i) => {
    const x = (i / Math.max(1, points.length - 1)) * 100;
    const y = 96 - ((Number(p.reputation) - min) / span) * 78;
    return `${i ? 'L' : 'M'} ${x} ${y}`;
  }).join(' ');
  return <svg className="chart" viewBox="0 0 100 100" preserveAspectRatio="none" aria-label="REP progression"><path d="M 0 96 L 100 96" className="chart-axis"/><path d={path} className="chart-line" /></svg>;
}
function ClanRepTrendChart({points=[]}) {
  const trend=Array.isArray(points)?points.filter((point)=>Number.isFinite(Number(point?.reputation))):[];
  if(!trend.length)return <section className="panel trend-panel"><div className="section-title"><div><span className="eyebrow">SEASON TREND</span><h3>CLAN REP</h3></div><span>Daily snapshots</span></div><div className="chart-empty">NO DAILY REP SNAPSHOTS YET</div></section>;
  const min=Math.min(...trend.map((point)=>Number(point.reputation)));
  const max=Math.max(...trend.map((point)=>Number(point.reputation)));
  const span=Math.max(1,max-min);
  const chartPoints=trend.map((point,index)=>{
    const x=(index/Math.max(1,trend.length-1))*100;
    const y=92-((Number(point.reputation)-min)/span)*74;
    return{...point,x,y};
  });
  const path=chartPoints.map((point,index)=>(index?'L':'M')+' '+point.x.toFixed(2)+' '+point.y.toFixed(2)).join(' ');
  const labelIndexes=[0,Math.floor((trend.length-1)/2),trend.length-1].filter((value,index,array)=>array.indexOf(value)===index);
  const labelDate=(value)=>new Date(value).toLocaleDateString(undefined,{month:'short',day:'numeric'});
  return <section className="panel trend-panel" aria-label="Clan REP trend">
    <div className="section-title"><div><span className="eyebrow">SEASON TREND</span><h3>CLAN REP</h3></div><span>{trend.length} day{trend.length===1?'':'s'} tracked</span></div>
    <div className="trend-chart-wrap">
      <div className="trend-y-axis"><span>{fmt(max)}</span><span>{fmt(min)}</span></div>
      <svg className="trend-chart" viewBox="0 0 100 100" preserveAspectRatio="none" role="img" aria-label="Daily total clan REP trend">
        <path d="M 0 18 L 100 18" className="trend-grid-line"/>
        <path d="M 0 55 L 100 55" className="trend-grid-line"/>
        <path d="M 0 92 L 100 92" className="trend-grid-line"/>
        {chartPoints.length>1&&<path d={path} className="trend-chart-line"/>}
        {chartPoints.map((point)=><circle key={point.date} cx={point.x} cy={point.y} r="1.6" className="trend-chart-point"/>).slice(-7)}
      </svg>
    </div>
    <div className="trend-x-axis">{labelIndexes.map((index)=><span key={trend[index].date}>{labelDate(trend[index].date)} · {fmt(trend[index].reputation)}</span>)}</div>
    {trend.length===1&&<div className="chart-empty trend-caption">ONE DAILY SNAPSHOT STORED · THE LINE WILL EXTEND WITH THE NEXT DAY</div>}
  </section>;
}

function SyncHealthStrip({data}) {
  const [now,setNow]=useState(Date.now());
  useEffect(()=>{const t=setInterval(()=>setNow(Date.now()),1000);return()=>clearInterval(t);},[]);
  const health=data?.syncHealth||{};
  const stats=data?.stats||{};
  const http=data?.httpHealth||{};
  const lastHealthy=health.lastMemberSuccessAt?Date.parse(health.lastMemberSuccessAt):health.lastHealthyAt?Date.parse(health.lastHealthyAt):NaN;
  const ageSeconds=Number.isFinite(lastHealthy)?Math.max(0,Math.floor((now-lastHealthy)/1000)):null;
  const next=data?.syncStatus?.nextExpectedAt?Date.parse(data.syncStatus.nextExpectedAt):NaN;
  const nextSeconds=Number.isFinite(next)?Math.max(0,Math.ceil((next-now)/1000)):null;
  const successRate=Number.isFinite(Number(stats.syncSuccessRate))?Math.round(Number(stats.syncSuccessRate)*100):0;
  const httpStatus=Number(http.statusCode||0);
  const source=String(health.lastMemberSource || (stats.sourceCounts?.legacy>0 && !stats.sourceCounts?.amf ? 'legacy' : stats.sourceCounts?.amf>0 ? 'amf' : '—')).toUpperCase();
  const sourceHealth=String(health.lastSourceHealth||'unknown').toUpperCase();
  return <section className="sync-health-strip" aria-label="Sync health">
    <div className="sync-cluster"><div className="sync-cluster-title">SYNC</div><div className="sync-cluster-grid">
      <div className="sync-field"><span>LAST MEMBER SYNC</span><b>{ageSeconds===null?'—':new Date(lastHealthy).toLocaleTimeString()}</b></div>
      <div className="sync-field"><span>CURRENT AGE</span><b className={ageSeconds!==null&&ageSeconds<=90?'up':ageSeconds!==null&&ageSeconds<=180?'warn-text':'down'}>{ageSeconds===null?'—':age(ageSeconds)}</b></div>
      <div className="sync-field"><span>NEXT SYNC</span><b>{nextSeconds===null?'—':nextSeconds<60?nextSeconds+'s':Math.ceil(nextSeconds/60)+'m'}</b></div>
      <div className="sync-field"><span>MEMBERS</span><b className={health.lastMemberStatus==='success'?'up':'warn-text'}>{String(health.lastMemberStatus||data?.syncStatus?.memberStatus||'—').toUpperCase()}</b></div>
    </div></div>
    <div className="sync-cluster"><div className="sync-cluster-title">SOURCE</div><div className="sync-cluster-grid">
      <div className="sync-field"><span>MEMBER SOURCE</span><b className={source==='LEGACY'?'warn-text':'up'}>{source}</b></div>
      <div className="sync-field"><span>SOURCE HEALTH</span><b className={sourceHealth==='DEGRADED'?'warn-text':sourceHealth==='DOWN'?'down':'up'}>{sourceHealth}</b></div>
      <div className="sync-field"><span>HTTP MONITOR</span><b className={httpStatus>=400?'down':'up'}>{httpStatus||'—'}</b></div>
      <div className="sync-field"><span>FALLBACK RUNS</span><b className={Number(health.consecutiveSourceWarnings||0)>0?'warn-text':'up'}>{Number(health.consecutiveSourceWarnings||0)}</b></div>
    </div></div>
    <div className="sync-cluster"><div className="sync-cluster-title">MONITOR</div><div className="sync-cluster-grid">
      <div className="sync-field"><span>RANKING</span><b>{String(health.lastRankingStatus||data?.syncStatus?.rankingStatus||'—').toUpperCase()}</b></div>
      <div className="sync-field"><span>SYNC RATE · 60S</span><b>{stats.syncsCompleted||0}/{stats.syncsExpected||0} · {successRate}%</b></div>
      <div className="sync-field"><span>MISSED · 60S</span><b className={Number(stats.syncsMissed||0)>0?'warn-text':'up'}>{Number(stats.syncsMissed||0)}</b></div>
      <div className="sync-field sync-field-wide"><span>LAST ERROR</span><b>{health.lastError ? formatError(health.lastError) : 'NONE'}</b></div>
    </div></div>
  </section>;
}

function SyncHealthAlert({data}) {
  const stats=data?.stats||{};
  const health=data?.syncHealth||{};
  const alertState=getSyncHealthAlertState({health,stats});
  if(!alertState.visible)return null;
  if(!alertState.urgent){
    const fallback=alertState.quietFallback;
    return <section className="sync-health-note" role="status" aria-label="Sync health notice">
      <div className="sync-health-note-icon">i</div>
      <div className="sync-health-note-body">
        <div><strong>{fallback?'AMF FALLBACK ACTIVE':'SYNC RATE BELOW 70%'}</strong><span>{fallback?'LEGACY HEALTHY':'MONITOR'}</span></div>
        <p>{fallback
          ? 'AMF authorization is unavailable; LEGACY is serving live member data normally.'
          : 'Recorded successful syncs are below the configured schedule target.'}</p>
        {fallback&&<small>FALLBACK RUNS {Number(health.consecutiveSourceWarnings||0)} · AMF diagnostics remain available in Admin</small>}
        {!fallback&&<small>SYNC RATE {alertState.rateText} · SOURCE DATA REMAINS AVAILABLE</small>}
      </div>
    </section>;
  }
  const reason=formatError(
    health.lastSourceWarning
      || health.sourceDiagnostics?.legacy?.error
      || health.lastFailure,
    'LEGACY member source is unavailable.'
  );
  const lastFailure=health.lastFailureAt
    ? new Date(health.lastFailureAt).toLocaleString()+' · '+formatError(health.lastFailure,'Failure detected.')
    : null;
  return <section className="sync-health-alert" role="alert" aria-label="Sync health urgent warning">
    <div className="sync-health-alert-icon">!</div>
    <div className="sync-health-alert-body">
      <div><strong>LEGACY SOURCE FAILURE</strong><span>SYNC RATE {alertState.rateText}</span></div>
      <p>{reason}</p>
      {lastFailure&&<small>LAST FAILURE {lastFailure}</small>}
    </div>
  </section>;
}

function SyncCountdown({target}) {
  const [now,setNow]=useState(Date.now());
  useEffect(()=>{const t=setInterval(()=>setNow(Date.now()),1000);return()=>clearInterval(t);},[]);
  if(!target)return <span className="sync-countdown">NEXT SYNC —</span>;
  const seconds=Math.max(0,Math.ceil((new Date(target).getTime()-now)/1000));
  return <span className="sync-countdown">NEXT SYNC {seconds<60?seconds+'s':Math.ceil(seconds/60)+'m'}</span>;
}

function MemberDrawer({member,onClose}) {
  const [data,setData]=useState(null);
  const [error,setError]=useState('');
  const [refreshing,setRefreshing]=useState(false);
  const [repChanged,setRepChanged]=useState(false);
  const drawerRef=useRef(null);

  const load=async({silent=false}={})=>{
    if(!silent)setRefreshing(true);
    try{
      const next=await api('/api/members?id='+encodeURIComponent(member.id));
      setData((previous)=>{
        if(previous?.summary && next?.summary && Number(previous.summary.rep)!==Number(next.summary.rep)){
          setRepChanged(true);
          window.setTimeout(()=>setRepChanged(false),1800);
        }
        return next;
      });
      setError('');
    }catch(e){setError(e.message);}
    finally{if(!silent)setRefreshing(false);}
  };

  useEffect(()=>{
    if(!member)return;
    load();
    const timer=setInterval(()=>load({silent:true}),LIVE_HISTORY_REFRESH_INTERVAL_MS);
    drawerRef.current?.focus();
    const onKey=(event)=>{if(event.key==='Escape')onClose();};
    window.addEventListener('keydown',onKey);
    return()=>{clearInterval(timer);window.removeEventListener('keydown',onKey);};
  },[member?.id]);

  if(!member)return null;
  const summary=data?.summary||member;
  return <div className="drawer-backdrop" onMouseDown={(event)=>{if(event.target===event.currentTarget)onClose();}}>
    <aside ref={drawerRef} className="drawer" role="dialog" aria-modal="true" aria-labelledby="member-drawer-title" tabIndex="-1" onMouseDown={(event)=>event.stopPropagation()}>
      <div className="drawer-head">
        <div><span className="eyebrow">CHAOS MEMBER</span><h2 id="member-drawer-title">{summary.member||summary.member_name||member.member}</h2><p>Level {summary.level} · {data?.season||'Current season'}</p></div>
        <button className="icon-btn" aria-label="Close member details" onClick={onClose}>×</button>
      </div>
      {error&&<div className="notice bad">{error}</div>}
      {!data?<div className="loading">LOADING LIVE HISTORY…</div>:<>
        <div className="mini-stats">
          <div className={repChanged?'rep-pulse':''}><span>CURRENT REP</span><b>{fmt(summary.rep)}</b></div>
          <div><span>SEASON GAIN</span><b>+{fmt(summary.gain)}</b></div>
          <div><span>TODAY</span><b>+{fmt(summary.todayGain)}</b></div>
          <div><span>REP / HR</span><b>{fmt(summary.repPerHour)}</b></div>
          <div><span>EST. STAMINA</span><b>{summary.stamina==null?'—':fmt(summary.stamina)+'/'+fmt(summary.maxStamina||200)}</b></div>
        </div>
        <div className="drawer-stamina-note stamina-disclaimer" title="Estimated stamina is derived from observed REP activity and timed recovery. It is not server-reported game data.">
          {summary.stamina==null
            ? 'ESTIMATE ONLY · NOT YET INITIALIZED'
            : 'ESTIMATE ONLY · DERIVED FROM OBSERVED REP ACTIVITY + TIMED RECOVERY · NOT SERVER-REPORTED'}
        </div>
        <div className="drawer-check-meta"><span className="drawer-check-dot"></span><b>{refreshing?'UPDATING':'MONITORED'}</b><span>LAST CHECK {age(summary.capturedAt||data.updatedAt||null)}</span></div>
        <div className="panel inset"><div className="section-title"><div><span className="eyebrow">PROGRESSION</span><h3>REP OVER TIME</h3></div><span>{data.points?.length||0} snapshots</span></div><LineChart points={data.points}/></div>
        <div className="panel inset"><div className="section-title"><div><span className="eyebrow">HISTORY</span><h3>RECENT SNAPSHOTS</h3></div></div><div className="timeline">{(data.points||[]).slice(-30).reverse().map((p,i,arr)=>{const next=arr[i+1];const delta=next?Number(p.reputation)-Number(next.reputation):0;return <div className="timeline-row" key={String(p.captured_at)+'-'+i}><time>{new Date(p.captured_at).toLocaleString()}</time><b>{fmt(p.reputation)}</b><em className={delta>0?'up':delta<0?'down':''}>{delta>0?'+'+fmt(delta):delta<0?fmt(delta):'—'}</em></div>;})}</div></div>
      </>}
    </aside>
  </div>;
}

export default function RepTrackerDashboard({ initialView = 'dashboard', initialData = null, initialError = '' }) {
  const [view, setView] = useState(initialView);
  const [data, setData] = useState(initialData);

  const [history, setHistory] = useState([]);
  const [finalizations, setFinalizations] = useState([]);
  const [selected, setSelected] = useState(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [loginOpen, setLoginOpen] = useState(false);
  const [themedModal, setThemedModal] = useState(null);
  const [password, setPassword] = useState('');
  const [admin, setAdmin] = useState(false);
  const [adminLoading, setAdminLoading] = useState(true);
  const [dashboardLoading, setDashboardLoading] = useState(!initialData && !initialError);
  const [dashboardError, setDashboardError] = useState(initialError);
  const [dashboardRefreshing, setDashboardRefreshing] = useState(false);
  const [liveRefreshing, setLiveRefreshing] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [periodHistory, setPeriodHistory] = useState(null);
  const [periodHours, setPeriodHours] = useState(6);
  const [memberFilter, setMemberFilter] = useState('ALL');
  const [memberQuery, setMemberQuery] = useState('');
  const [memberSort, setMemberSort] = useState('rep');
  const syncInFlight = useRef(false);
  const refreshGate = useRef(null);
  if (!refreshGate.current) refreshGate.current = createRefreshGate();
  const [seasonName, setSeasonName] = useState('');
  const [finalDay, setFinalDay] = useState('');
  const [hoursMember, setHoursMember] = useState('');
  const [hoursDate, setHoursDate] = useState(new Date().toISOString().slice(0,10));
  const [hoursStart, setHoursStart] = useState('');
  const [hoursEnd, setHoursEnd] = useState('');
  const [hoursBreak, setHoursBreak] = useState('0');
  const [hoursNotes, setHoursNotes] = useState('');

  const refresh = ({ initial = false, force = false } = {}) =>
    refreshGate.current.run(async () => {
      if (initial) {
        setDashboardLoading(true);
        setDashboardError('');
      } else {
        setDashboardRefreshing(true);
      }

      try {
        const current = await api('/api/dashboard');
        setData(current);
        writeDashboardCache(current);
        setDashboardError('');
        if (current?.config) {
          setSeasonName(current.config.current_season || '');
          setFinalDay(current.config.final_day_at ? new Date(current.config.final_day_at).toISOString().slice(0,16) : '');
        }
        try {
          const fins = await api('/api/finalize');
          setFinalizations(fins.finalizations || []);
        } catch (e) {
          setMessage(e.message);
        }
        return current;
      } catch (e) {
        setDashboardError(e.message || 'Unable to load the dashboard.');
        return null;
      } finally {
        if (initial) setDashboardLoading(false);
        if (!initial) setDashboardRefreshing(false);
      }
    }, { initial, force });

  const refreshLive = async () => {
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
    setLiveRefreshing(true);
    try {
      const current = await api('/api/live');
      if (!current?.configured) return;
      setData((previous) => {
        if (!previous) return current;
        const liveById = new Map((current.rows || []).map((row) => [String(row.id), row]));
        const mergedRows = (previous.rows || []).map((row) => {
          const live = liveById.get(String(row.id));
          return live ? { ...row, ...live, gain: row.gain, todayGain: row.todayGain, hours: row.hours, repPerHour: row.repPerHour, suspicious: row.suspicious, status: current.freshness?.status || row.status } : row;
        });
        return {
          ...previous,
          rows: mergedRows.sort((a, b) => Number(b.rep || 0) - Number(a.rep || 0)),
          freshness: current.freshness || previous.freshness,
          lastSuccessfulSyncAt: current.lastSuccessfulSyncAt || previous.lastSuccessfulSyncAt,
          syncHealth: current.syncHealth || previous.syncHealth,
          syncStatus: current.syncStatus || previous.syncStatus,
          httpHealth: current.httpHealth || previous.httpHealth,
          serverTime: current.serverTime || previous.serverTime
        };
      });
    } catch (e) {
      // The full dashboard refresh will surface a persistent failure; keep the last known live view during transient errors.
    } finally {
      setLiveRefreshing(false);
    }
  };

  const triggerBackgroundSync = async () => {
    if (syncInFlight.current || !acquireSyncLock()) return;
    syncInFlight.current = true;
    setSyncing(true);
    try {
      await api('/api/sync', { method: 'GET' });
    } catch (e) {
      setMessage('LIVE SYNC FAILED · ' + (e.message || 'Unable to sync live data.'));
    } finally {
      setSyncing(false);
      syncInFlight.current = false;
      releaseSyncLock();
    }
  };

  useEffect(() => {
    let cancelled = false;
    const checkAdmin = async () => {
      try {
        const session = await api('/api/admin/login', { method: 'GET' });
        if (!cancelled) setAdmin(Boolean(session.admin));
      } catch (e) {
        if (!cancelled) {
          setAdmin(false);
          setMessage(e.message);
        }
      } finally {
        if (!cancelled) setAdminLoading(false);
      }
    };
    checkAdmin();
    const onExpired = () => {
      setAdmin(false);
      setLoginOpen(true);
      setPassword('');
      setMessage('Admin session expired. Please sign in again.');
    };
    window.addEventListener('admin-session-expired', onExpired);
    const cached = readDashboardCache();
    if (initialData) {
      writeDashboardCache(initialData);
      refresh({ force: true }).then(() => triggerBackgroundSync());
    } else if (cached?.data) {
      setData(cached.data);
      setDashboardError('');
      setDashboardLoading(false);
      refresh({ force: true }).then(() => triggerBackgroundSync());
    } else {
      refresh({ initial: true, force: true }).then(() => triggerBackgroundSync());
    }
    const dashboardTimer = setInterval(() => refresh(), DASHBOARD_REFRESH_INTERVAL_MS);
    const liveTimer = setInterval(() => refreshLive(), LIVE_REFRESH_INTERVAL_MS);
    return () => {
      cancelled = true;
      window.removeEventListener('admin-session-expired', onExpired);
      clearInterval(dashboardTimer);
      clearInterval(liveTimer);
    };
  }, []);

  useEffect(() => {
    if (!['dashboard','members'].includes(view)) return undefined;
    if (!data?.configured || !data?.config?.clan_id || !data?.season) return undefined;
    let cancelled = false;
    const loadPeriods = async () => {
      try {
        const result = await api('/api/member-history?clanId='+encodeURIComponent(data.config.clan_id)+'&season='+encodeURIComponent(data.season)+'&hours=168');
        if (!cancelled) setPeriodHistory(result);
      } catch {}
    };
    loadPeriods();
    const timer = setInterval(loadPeriods, PERIOD_HISTORY_REFRESH_INTERVAL_MS);
    return () => { cancelled = true; clearInterval(timer); };
  }, [view, data?.configured, data?.config?.clan_id, data?.season]);

  const rows = useMemo(() => sortMembersByRank(data?.rows || []), [data?.rows]);
  const periodRows = useMemo(() => {
    const currentMembers = rows.map((row)=>({...row,name:row.member,reputation:row.rep,level:row.level}));
    if (!periodHistory?.members) return rows;
    return buildMemberRows(currentMembers, periodHistory.members, periodHours, Date.now());
  }, [rows, periodHistory, periodHours]);
  const top = useMemo(() => data?.stats?.todayGainAvailable
    ? [...rows].sort((a,b) => Number(b.todayGain||0) - Number(a.todayGain||0)).slice(0,5)
    : [], [rows, data?.stats?.todayGainAvailable]);
  const filteredMembers = useMemo(() => {
    const query=memberQuery.trim().toLocaleLowerCase();
    const statusMap={
      'ALL':()=>true,
      'ACTIVE':row=>row.status==='ACTIVE',
      'IDLE':row=>row.status==='IDLE',
      'NO GAIN':row=>row.status==='NO GAIN',
      'RESET':row=>row.status==='RESET',
      'MISSING':row=>row.status==='MISSING'
    };
    return periodRows.filter((row)=>{
      if(!(statusMap[memberFilter]||statusMap.ALL)(row))return false;
      return !query||String(row.member||row.name||'').toLocaleLowerCase().includes(query);
    }).sort((a,b)=>{
      if(memberSort==='gain')return Number(b.gain||0)-Number(a.gain||0);
      if(memberSort==='rate')return Number(b.gainPerHour||0)-Number(a.gainPerHour||0);
      if(memberSort==='activity')return Number(b.latestTs||0)-Number(a.latestTs||0);
      return compareMemberRank(a,b);
    });
  },[periodRows,memberFilter,memberQuery,memberSort]);
  const activity = data?.activity || [];
  const latestFinal = finalizations[0];
  const expectedMemberCount = Number(data?.config?.expected_member_count || 0);
  const upstreamSyncHealthy = String(data?.freshness?.status || "").toLowerCase() === "live"
    && String(data?.syncHealth?.lastMemberStatus || "").toLowerCase() === "success"
    && String(data?.syncHealth?.lastSourceHealth || "").toLowerCase() === "healthy";
  const rosterComplete = expectedMemberCount > 0 && rows.length >= expectedMemberCount;
  const finalLockReady = Boolean(admin && !busy && !latestFinal && upstreamSyncHealthy && rosterComplete);
  const showHoursColumns = rows.some((r)=>Math.abs(Number(r.hours||0))>0.0001 || Math.abs(Number(r.repPerHour||0))>0.0001);
  const finalRows = latestFinal?.raw_snapshot?.rows || [];
  const showFinalHoursColumns = finalRows.some((r)=>Math.abs(Number(r.hours||0))>0.0001 || Math.abs(Number(r.repPerHour||0))>0.0001);
  const showHistoryHoursColumns = finalizations.some((f)=>Math.abs(Number(f.total_hours||0))>0.0001 || Math.abs(Number(f.avg_rep_per_hour||0))>0.0001);

  async function login() { setBusy(true); try { await api('/api/admin/login',{method:'POST',body:JSON.stringify({password}),headers:{'Content-Type':'application/json'}}); setAdmin(true); setLoginOpen(false); setPassword(''); setMessage('Admin session active.'); } catch(e){setMessage(e.message);} finally{setBusy(false);} }
  async function logout() { setBusy(true); try { await api('/api/admin/login',{method:'DELETE'}); setAdmin(false); setLoginOpen(false); setPassword(''); setMessage('Admin session ended.'); } catch(e){setMessage(e.message);} finally{setBusy(false);} }
  async function syncNow(){setBusy(true);try{await api('/api/sync',{method:'POST'});await refresh({force:true});setMessage('Live sync completed.');}catch(e){setMessage(e.message);}finally{setBusy(false);}}
  async function baseline(){setBusy(true);try{await api('/api/season',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'baseline'})});await refresh();setMessage('Season baseline created from the live roster.');}catch(e){setMessage(e.message);}finally{setBusy(false);}}
  async function startSeason(){setBusy(true);try{await api('/api/season',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'start',season:seasonName,finalDayAt:finalDay?new Date(finalDay).toISOString():null})});await refresh();setMessage('New season started.');}catch(e){setMessage(e.message);}finally{setBusy(false);}}
  async function addHours(){setBusy(true);try{let total=0;if(hoursStart&&hoursEnd){total=(new Date(`1970-01-01T${hoursEnd}:00Z`).getTime()-new Date(`1970-01-01T${hoursStart}:00Z`).getTime())/3600000-(Number(hoursBreak)||0)/60;if(total<0)total+=24;} await api('/api/hours',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({season:data.season,clanId:data.config.clan_id,memberId:hoursMember,workDate:hoursDate,startTime:hoursStart?`${hoursDate}T${hoursStart}:00+08:00`:null,endTime:hoursEnd?`${hoursDate}T${hoursEnd}:00+08:00`:null,breakMinutes:Number(hoursBreak)||0,totalHours:Number(total.toFixed(2)),source:'MANUAL',notes:hoursNotes})});await refresh();setMessage('Hours session added.');}catch(e){setMessage(e.message);}finally{setBusy(false);}}
  function requestStartSeason(){
    if(!seasonName.trim()){setMessage('Season name is required.');return;}
    setThemedModal({
      variant:'confirm',
      eyebrow:'SEASON CONTROL',
      title:`START ${seasonName.trim()}?`,
      message:`This will make ${seasonName.trim()} the current active season and create a new season record. Existing finalized season history remains stored.`,
      confirmLabel:'START NEW SEASON',
      cancelLabel:'CANCEL',
      onConfirm:async()=>{setThemedModal(null);await startSeason();}
    });
  }
  function requestBaseline(){
    setThemedModal({
      variant:'confirm',
      eyebrow:'SEASON CONTROL',
      title:'CREATE SEASON BASELINE?',
      message:`This records the current live roster as the baseline for ${data.season}. A baseline already created for this season cannot be created again.`,
      confirmLabel:'CREATE BASELINE',
      cancelLabel:'CANCEL',
      onConfirm:async()=>{setThemedModal(null);await baseline();}
    });
  }
  function requestLockFinal(){
    if(!finalLockReady)return;
    setThemedModal({
      variant:'confirm',
      eyebrow:'FINALIZATION',
      title:'LOCK FINAL DAY?',
      message:`This creates an immutable final snapshot for ${data.season}. Finalized results are read-only; later corrections require a new version.`,
      confirmLabel:'LOCK FINAL DAY',
      cancelLabel:'CANCEL',
      destructive:true,
      onConfirm:async()=>{
        setThemedModal(null);
        const latest=await refresh({force:true});
        const currentSourceHealthy=String(latest?.freshness?.status||'').toLowerCase()==='live'
          && String(latest?.syncHealth?.lastMemberStatus||'').toLowerCase()==='success'
          && String(latest?.syncHealth?.lastSourceHealth||'').toLowerCase()==='healthy';
        const currentExpected=Number(latest?.config?.expected_member_count||0);
        const currentRoster=Array.isArray(latest?.rows)?latest.rows.length:0;
        if(!latest||!currentSourceHealthy||currentExpected<=0||currentRoster<currentExpected){
          setMessage('FINAL DAY LOCK BLOCKED · sync health or roster completeness changed.');
          return;
        }
        try{
          const finals=await api('/api/finalize');
          if(Array.isArray(finals.finalizations)&&finals.finalizations.length){
            await refresh({force:true});
            setMessage('FINAL DAY LOCK BLOCKED · a finalized result already exists.');
            return;
          }
        }catch(e){
          setMessage('FINAL DAY LOCK BLOCKED · unable to re-check finalization state.');
          return;
        }
        await lockFinal();
      }
    });
  }

  async function lockFinal(){setBusy(true);try{const res=await api('/api/finalize',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'lock'})});await refresh();setMessage(`FINAL DAY LOCKED · VERSION ${res.finalization.version}`);}catch(e){setMessage(e.message);}finally{setBusy(false);}}

  let adminContent;
  if (adminLoading) {
    adminContent = <div className="panel"><div className="loading">CHECKING ADMIN SESSION…</div></div>;
  } else if (!admin) {
    adminContent = <div className="panel admin-login-card"><span className="eyebrow">SECURE ADMIN</span><h3>ADMIN LOGIN</h3><p>Sign in to access protected administration actions.</p><div className="admin-login-form"><input autoFocus type="password" value={password} onChange={e=>setPassword(e.target.value)} placeholder="Admin password" onKeyDown={e=>e.key==='Enter'&&login()}/><button className="btn primary full" onClick={login} disabled={busy}>SIGN IN</button></div></div>;
  } else if (!data) {
    adminContent = <div className="panel"><div className="loading">LOADING TRACKER DATA…</div></div>;
  } else {
    adminContent = (
      <>
        <div className="admin-grid"><div className="panel"><span className="eyebrow">SEASON SETTINGS</span><h3>Start / baseline</h3><label>Season<input value={seasonName} onChange={e=>setSeasonName(e.target.value)} placeholder="Season 4"/></label><label>Final day<input type="datetime-local" value={finalDay} onChange={e=>setFinalDay(e.target.value)}/></label><div className="actions"><button className="btn primary" onClick={requestStartSeason} disabled={!admin||busy}>START NEW SEASON</button><button className="btn" onClick={requestBaseline} disabled={!admin||busy}>CREATE BASELINE</button></div></div><div className="panel"><span className="eyebrow">SYNC</span><h3>Live source</h3><div className="source-meta"><span>Status <b>{data.freshness?.status?.toUpperCase()}</b></span><span>Last success <b>{age(data.freshness?.ageSeconds)}</b></span><span>Source <b>{rows[0]?.source || '—'}</b></span></div><button className="btn primary full" onClick={syncNow} disabled={!admin||busy}>SYNC NOW</button></div><div className="panel"><span className="eyebrow">MANUAL HOURS</span><h3>Track activity</h3><label>Member<select value={hoursMember} onChange={e=>setHoursMember(e.target.value)}><option value="">Select member</option>{rows.map(r=><option key={r.id} value={r.id}>{r.member}</option>)}</select></label><div className="split"><label>Date<input type="date" value={hoursDate} onChange={e=>setHoursDate(e.target.value)}/></label><label>Break min<input type="number" min="0" value={hoursBreak} onChange={e=>setHoursBreak(e.target.value)}/></label></div><div className="split"><label>Start<input type="time" value={hoursStart} onChange={e=>setHoursStart(e.target.value)}/></label><label>End<input type="time" value={hoursEnd} onChange={e=>setHoursEnd(e.target.value)}/></label></div><label>Notes<input value={hoursNotes} onChange={e=>setHoursNotes(e.target.value)} placeholder="Optional"/></label><button className="btn primary full" onClick={addHours} disabled={!admin||busy||!hoursMember||!hoursStart||!hoursEnd}>ADD MANUAL SESSION</button></div><div className="panel danger-panel"><span className="eyebrow">FINALIZATION</span><h3>{latestFinal?'FINAL DAY LOCKED':'Ready to lock'}</h3><p>{latestFinal?'Final results are read-only. A future correction must create a new version.':'Before locking, the system runs a fresh sync and blocks stale/incomplete data.'}</p><button className={`btn full ${finalLockReady?'danger':''}`} onClick={requestLockFinal} disabled={!finalLockReady}>LOCK FINAL DAY</button></div>
          <div className="panel source-diagnostic-panel"><span className="eyebrow">SOURCE DIAGNOSTICS</span><h3>AMF MEMBER SERVICE</h3><p className={data.syncHealth?.lastSourceHealth==='degraded'?'warn-text':''}>{data.syncHealth?.lastSourceWarning || (data.syncHealth?.lastMemberSource==='amf'?'AMF is active and healthy.':'AMF member service is not currently active.')}</p><div className="source-diagnostic-grid"><div><span>AMF</span><b>{String(data.syncHealth?.sourceDiagnostics?.amf?.status || '—').toUpperCase()}</b><small>{data.syncHealth?.sourceDiagnostics?.amf?.durationMs != null ? data.syncHealth.sourceDiagnostics.amf.durationMs+'ms' : 'No sample'}</small><small>Last OK {data.syncHealth?.lastAmfSuccessAt ? new Date(data.syncHealth.lastAmfSuccessAt).toLocaleTimeString() : '—'}</small><small>Reason {formatError(data.syncHealth?.sourceDiagnostics?.amf?.error, '—')}</small></div><div><span>LEGACY</span><b>{String(data.syncHealth?.sourceDiagnostics?.legacy?.status || '—').toUpperCase()}</b><small>{data.syncHealth?.sourceDiagnostics?.legacy?.durationMs != null ? data.syncHealth.sourceDiagnostics.legacy.durationMs+'ms' : 'No sample'}</small><small>Last OK {data.syncHealth?.lastLegacySuccessAt ? new Date(data.syncHealth.lastLegacySuccessAt).toLocaleTimeString() : '—'}</small></div><div><span>SOURCE</span><b>{String(data.syncHealth?.lastMemberSource || '—').toUpperCase()}</b><small>{data.syncHealth?.lastSourceHealth ? String(data.syncHealth.lastSourceHealth).toUpperCase() : '—'}</small><small>{data.syncHealth?.consecutiveSourceWarnings||0} degraded runs</small></div></div><small>Server-side source timings and diagnostic fields only; no raw AMF response body is exposed.</small></div>
        </div>
        <div className="actions admin-logout-actions"><button className="btn" onClick={logout} disabled={busy}>LOG OUT</button></div>
      </>
    );
  }

  const nav = [['dashboard','Dashboard'],['members','Members'],['history','History'],['final','Final Results'],['admin','Admin']];
  if (dashboardLoading && !data) return <main className="ops-app"><header className="ops-header"><div className="brand"><img className="brand-logo" src="/chaos-helmet-logo.svg" alt="CHAOS samurai helmet"/><div><b>CHAOS</b><span>REP TRACKER</span><small>Ninja Zenshin Clan Operations</small></div></div></header><section className="dashboard-skeleton" aria-label="Loading dashboard"><div className="skeleton-bar wide"></div><div className="skeleton-stats">{Array.from({length:6}).map((_,i)=><div className="skeleton-block" key={i}><span></span><b></b></div>)}</div><div className="panel skeleton-table"><div className="skeleton-bar"></div>{Array.from({length:8}).map((_,i)=><div className="skeleton-row" key={i}><span></span><span></span><span></span><span></span></div>)}</div></section></main>;

  if (dashboardError && !data) return <main className="ops-app"><header className="ops-header"><div className="brand"><img className="brand-logo" src="/chaos-helmet-logo.svg" alt="CHAOS samurai helmet"/><div><b>CHAOS</b><span>REP TRACKER</span><small>Ninja Zenshin Clan Operations</small></div></div></header><section className="empty-state"><span className="eyebrow">DASHBOARD ERROR</span><h1>Unable to load live dashboard data.</h1><p>{dashboardError}</p><button className="btn primary" onClick={() => refresh({ initial: true })}>RETRY</button></section></main>;

  if (data && data.configured === false) return <main className="ops-app"><header className="ops-header"><div className="brand"><img className="brand-logo" src="/chaos-helmet-logo.svg" alt="CHAOS samurai helmet"/><div><b>CHAOS</b><span>REP TRACKER</span><small>Ninja Zenshin Clan Operations</small></div></div><button className="btn primary" onClick={() => setLoginOpen(true)}>ADMIN SETUP</button></header><section className="empty-state"><span className="eyebrow">NO LIVE CONFIGURATION</span><h1>Waiting for a real Ninja Zenshin clan source.</h1><p>The tracker will not fabricate roster, REP, season, or countdown values. Open Admin to authenticate and run discovery.</p>{message&&<div className="notice bad">{message}</div>}</section>{loginOpen&&<ThemedModal variant="prompt" eyebrow="SECURE ADMIN" title="ADMIN ACCESS" message="Admin actions modify persistent tracking state and finalization status." inputType="password" inputValue={password} onInputChange={setPassword} placeholder="Admin password" confirmLabel="SIGN IN" onConfirm={login} onCancel={()=>{setLoginOpen(false);setPassword('');}} />}</main>;

  if (!data) return <main className="ops-app"><section className="empty-state"><span className="eyebrow">DASHBOARD ERROR</span><h1>Unable to load live dashboard data.</h1><p>{dashboardError || 'No dashboard data was returned.'}</p><button className="btn primary" onClick={() => refresh({ initial: true })}>RETRY</button></section></main>;

  return <main className="ops-app">
    <header className="ops-header">
      <div className="brand"><img className="brand-logo" src="/chaos-helmet-logo.svg" alt="CHAOS samurai helmet"/><div><b>CHAOS</b><span>REP TRACKER</span><small>Ninja Zenshin Clan Operations</small></div></div>
      <div className="header-right"><div className="connection"><span className="header-live" title={data.freshness?.status==='live'?'Live sync is current':`Sync status: ${data.freshness?.status||'unknown'}`}><i className={`dot ${data.freshness?.status==='live'?'good':data.freshness?.status==='aging'?'warn':'bad'}`}></i><b>{data.freshness?.status==='live'?'LIVE':data.freshness?.status==='aging'?'AGING':'STALE'}</b></span><span>LAST SYNC {age(data.freshness?.ageSeconds)}</span><SyncCountdown target={data.syncStatus?.nextExpectedAt}/></div><time>{new Date(data.serverTime).toLocaleTimeString()}</time><button className="btn" onClick={syncNow} disabled={busy}>↻ SYNC</button><button className="btn" onClick={()=>setLoginOpen(true)}>{admin?'ADMIN':'ADMIN'}</button></div>
    </header>
    <nav className="ops-nav">{nav.map(([key,label])=><button key={key} className={view===key?'active':''} onClick={()=>setView(key)}>{label}</button>)}</nav>
    {data&&<><SyncHealthAlert data={data}/><SyncHealthStrip data={data}/></>} 
    {dashboardRefreshing&&data&&<div className="notice good">UPDATING DASHBOARD…</div>}
    {syncing&&data&&!dashboardRefreshing&&<div className="notice good">UPDATING LIVE DATA…</div>}
    {dashboardError&&data&&<div className="notice bad">UPDATE FAILED · {dashboardError}<button onClick={()=>refresh()}>RETRY</button></div>}
    {message&&<div className={`notice ${/fail|error|blocked|stale|missing/i.test(message)?'bad':'good'}`}>{message}<button onClick={()=>setMessage('')}>×</button></div>}

    {view==='dashboard'&&<>
      <section className="season-band"><div><span className="eyebrow">SEASON</span><h1>{data.season}</h1><p>Clan {data.config.clan_name} · ID {data.config.clan_id} {data.config.current_round?`· Round ${data.config.current_round}`:''}</p></div><div className="season-box"><span>FINAL DAY IN</span><Countdown target={data.config.final_day_at}/></div><div className="season-box"><span>SERVER TIME</span><b>{new Date(data.serverTime).toLocaleString()}</b></div></section>
      <OperationsOverview data={data} rows={periodRows} periodHours={periodHours} setPeriodHours={setPeriodHours} />
      <section className="stats-grid"><div><span>TOTAL CLAN REP</span><b>{fmt(data.stats.totalRep)}</b></div><div><span title="Cumulative REP gained since the first recorded member snapshot today.">TODAY'S GAIN</span><b className="up">{data.stats.todayGainAvailable?'+'+fmt(data.stats.todayGain):'—'}</b></div><div><span>SEASON GAIN</span><b>+{fmt(data.stats.totalGain)}</b></div><div><span>ACTIVE MEMBERS</span><b>{data.stats.activeMembers}</b></div><div><span title="Manually recorded/tracked work hours for the current season.">TRACKED HOURS</span><b>{data.stats.totalHours>0?fmtHours(data.stats.totalHours):'—'}</b></div><div><span title="Season REP gain divided by manually recorded tracked hours. This is unavailable until tracked hours exist.">AVG REP / HOUR</span><b>{data.stats.totalHours>0?fmt(data.stats.avgRepPerHour):'—'}</b></div></section>
      <ClanRepTrendChart points={data.clanRepTrend}/>
      <section className="panel table-panel"><div className="section-title"><div><span className="eyebrow">LIVE MEMBER RANKING</span><h2>REP PERFORMANCE</h2></div><span>{rows.length} members · source {rows[0]?.source || '—'}</span></div><div className="table-scroll"><table className="responsive-data-table performance-table"><thead><tr><th>RANK</th><th>MEMBER</th><th>LV</th><th>CURRENT REP</th><th>REP GAIN</th><th title="Estimated only. Derived from observed REP changes and timed recovery; not server-reported game data.">EST. STAMINA</th>{showHoursColumns&&<><th>HOURS</th><th>REP / HR</th></>}</tr></thead><tbody>{rows.map((r,i)=>{const zeroGain=Number(r.gain||0)===0;const tier=i===0?'tier-1':i===1?'tier-2':i===2?'tier-3':'';return <tr key={r.id} className={[tier,zeroGain?'dim-row':'',r.lastPointAt&&Date.now()-new Date(r.lastPointAt).getTime()<90000?'recent-change':''].filter(Boolean).join(' ')} tabIndex="0" role="button" aria-label={'Open details for '+r.member} onKeyDown={(event)=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();setSelected(r);}}} onClick={()=>setSelected(r)}><td>#{r.rank||i+1}{r.rankDelta!=null&&<span className={`rank-movement ${r.rankDelta>0?'up':r.rankDelta<0?'down':''}`} aria-label={r.rankDelta>0?'Moved up '+r.rankDelta+' place'+(r.rankDelta===1?'':'s'):r.rankDelta<0?'Moved down '+Math.abs(r.rankDelta)+' place'+(Math.abs(r.rankDelta)===1?'':'s'):'No rank change'}>{formatRankChange(r.rankDelta)}</span>}</td><td className="member-name">{r.member}{r.suspicious&&<span className="status suspicious-flag"> · SUSPICIOUS</span>}</td><td>{r.level}</td><td className="num">{fmt(r.rep)}</td><td className={r.gain>0?'up':'gain-zero'}>{r.gain>0?'+'+fmt(r.gain):fmt(r.gain)}</td><td className={r.stamina!=null&&Number(r.stamina)<=70?'stamina-low':''} title={r.stamina==null?'Estimated stamina not initialized.':'Estimated stamina derived from observed REP changes and timed recovery; not server-reported.'}>{r.stamina==null?'—':<span className="estimated-stamina-value"><span aria-hidden="true">~</span>{fmt(r.stamina)}/{fmt(r.maxStamina||200)}<span className="sr-only"> estimated</span></span>}</td>{showHoursColumns&&<><td>{fmtHours(r.hours)}</td><td>{fmt(r.repPerHour)}</td></>}</tr>;})}</tbody></table>{!rows.length&&<div className="chart-empty">NO LIVE DATA</div>}</div></section>
      <section className="two-col"><div className="panel"><div className="section-title"><div><span className="eyebrow">RECENT REP ACTIVITY</span><h3>LATEST GAINS</h3></div></div><div className="activity">{activity.map((e,i)=><div key={i}><b>{e.member}</b><span className="up">+{fmt(e.gain)}</span><time>{new Date(e.at).toLocaleTimeString()}</time></div>)}{!activity.length&&<div className="chart-empty">NO GAIN EVENTS STORED</div>}</div></div><div className="panel"><div className="section-title"><div><span className="eyebrow">TOP GAINERS TODAY</span><h3>PERFORMANCE</h3></div></div><div className="top-list">{top.map((r,i)=><div key={r.id}><b>{String(i+1).padStart(2,'0')}</b><span>{r.member}</span><strong>{data.stats.todayGainAvailable?'+'+fmt(r.todayGain):'—'}</strong><em>{fmt(r.repPerHour)}/h</em></div>)}</div></div></section>
      {data.stats.suspiciousCount>0&&<section className="notice bad">{data.stats.suspiciousCount} suspicious REP decrease snapshot(s) retained for audit. No value was discarded.</section>}
    </>}

    {view==='members'&&<section>
      <div className="page-head">
        <div><span className="eyebrow">ROSTER</span><h1>MEMBER INTELLIGENCE</h1><p>Stable member IDs preserve history even when an IGN changes.</p></div>
        <div className="member-controls">
          <input value={memberQuery} onChange={e=>setMemberQuery(e.target.value)} placeholder="Search member…" aria-label="Search members"/>
          <select value={memberSort} onChange={e=>setMemberSort(e.target.value)} aria-label="Sort members">
            <option value="rep">Sort: REP</option>
            <option value="gain">Sort: GAIN</option>
            <option value="rate">Sort: REP / HR</option>
            <option value="activity">Sort: LAST ACTIVITY</option>
          </select>
        </div>
      </div>
      <div className="member-filters" role="group" aria-label="Member status filters">
        {['ALL','ACTIVE','IDLE','NO GAIN','RESET','MISSING'].map(filter=><button key={filter} className={memberFilter===filter?'active':''} onClick={()=>setMemberFilter(filter)}>{filter}</button>)}
      </div>
      <div className="member-grid">
        {filteredMembers.map((r,i)=><button className="member-card" key={r.id} onClick={()=>setSelected(r)}>
          <span className="eyebrow">{r.status} · LV {r.level} · RANK #{r.rank||'—'}{r.rankDelta!=null?<span className="rank-movement">{formatRankChange(r.rankDelta)}</span>:null}</span>
          <h3>{r.member||r.name}</h3>
          <b>{fmt(r.current||r.rep)} REP</b>
          <div><span>+{fmt(r.gain)} · {fmt(r.gainPerHour)}/h</span><span>{r.latestTs?age(Math.floor((Date.now()-r.latestTs)/1000)):'NO SNAPSHOT'}</span></div>
        </button>)}
      </div>
      {!filteredMembers.length&&<div className="empty-state compact"><h3>NO MEMBERS MATCH</h3><p>Change the filter or search term.</p></div>}
    </section>}
    {view==='history'&&<section><div className="page-head"><div><span className="eyebrow">SEASON HISTORY</span><h1>IMMUTABLE REPORTS</h1><p>Previous finalized versions remain available for audit.</p></div></div>{finalizations.length?<div className="panel table-panel"><div className="table-scroll"><table className="responsive-data-table history-table"><thead><tr><th>SEASON</th><th>VERSION</th><th>FINAL TIMESTAMP</th><th>MEMBERS</th><th>FINAL REP</th><th>GAIN</th>{showHistoryHoursColumns&&<><th>HOURS</th><th>REP/H</th></>}</tr></thead><tbody>{finalizations.map(f=><tr key={String(f.season)+'-'+String(f.version)}><td>{f.season}</td><td>v{f.version}</td><td>{new Date(f.final_timestamp).toLocaleString()}</td><td>{f.member_count}</td><td>{fmt(f.total_rep)}</td><td>+{fmt(f.season_gain)}</td>{showHistoryHoursColumns&&<><td>{fmtHours(f.total_hours)}</td><td>{fmt(f.avg_rep_per_hour)}</td></>}</tr>)}</tbody></table></div></div>:<div className="panel empty-state compact"><h3>NO FINALIZED SEASONS</h3><p>A final snapshot appears here only after a verified live sync is locked.</p></div>}</section>}

    {view==='final'&&<section><div className="page-head"><div><span className="eyebrow">FINAL RESULTS</span><h1>{latestFinal?.season || data.season}</h1><p>{latestFinal?'FINAL DAY LOCKED':'Not finalized yet'}</p></div>{latestFinal&&<div className="actions"><a className="btn" href={`/api/export?type=final&format=csv&season=${encodeURIComponent(latestFinal.season)}`}>EXPORT CSV</a><a className="btn" href={`/api/export?type=final&format=json&season=${encodeURIComponent(latestFinal.season)}`}>EXPORT JSON</a><button className="btn primary" onClick={()=>window.print()}>PRINT REPORT</button></div>}</div>{latestFinal?<><div className="stats-grid final"><div><span>FINAL REP</span><b>{fmt(latestFinal.total_rep)}</b></div><div><span>TOTAL GAIN</span><b>+{fmt(latestFinal.season_gain)}</b></div><div><span>MEMBERS</span><b>{latestFinal.member_count}</b></div><div><span>TOTAL HOURS</span><b>{fmtHours(latestFinal.total_hours)}</b></div><div><span>AVG REP / HOUR</span><b>{fmt(latestFinal.avg_rep_per_hour)}</b></div><div><span>LOCKED AT</span><b>{new Date(latestFinal.final_timestamp).toLocaleString()}</b></div></div><div className="panel table-panel"><div className="table-scroll"><table className="responsive-data-table final-results-table"><thead><tr><th>RANK</th><th>MEMBER</th><th>LV</th><th>FINAL REP</th><th>GAIN</th>{showFinalHoursColumns&&<><th>HOURS</th><th>REP / HR</th></>}</tr></thead><tbody>{finalRows.map((r,i)=>{const zeroGain=Number(r.gain||0)===0;return <tr key={r.id||i} className={[zeroGain?'dim-row':'',i===0?'tier-1':i===1?'tier-2':i===2?'tier-3':''].filter(Boolean).join(' ')}><td>#{r.rank||i+1}</td><td>{r.member}</td><td>{r.level}</td><td>{fmt(r.rep)}</td><td className={zeroGain?'gain-zero':'up'}>+{fmt(r.gain)}</td>{showFinalHoursColumns&&<><td>{fmtHours(r.hours)}</td><td>{fmt(r.repPerHour)}</td></>}</tr>;})}</tbody></table></div></div></>:<div className="panel empty-state compact final-lock-state"><h3>FINAL DAY NOT LOCKED</h3><p>Locking requires a fresh successful upstream sync and a complete expected roster.</p><div className="lock-checklist" aria-label="Final day lock requirements"><div className={upstreamSyncHealthy?'lock-check met':'lock-check unmet'}><b aria-hidden="true">{upstreamSyncHealthy?'✓':'×'}</b><span><strong>Upstream sync healthy</strong><small>{upstreamSyncHealthy?'LIVE · SOURCE HEALTH HEALTHY':'Requires LIVE sync, successful member sync, and healthy source health.'}</small></span></div><div className={rosterComplete?'lock-check met':'lock-check unmet'}><b aria-hidden="true">{rosterComplete?'✓':'×'}</b><span><strong>Roster complete</strong><small>{expectedMemberCount>0?`${rows.length} / ${expectedMemberCount} members`:'Expected roster count unavailable'}</small></span></div></div></div>}</section>}

    {view==='admin'&&<section><div className="page-head"><div><span className="eyebrow">ADMINISTRATION</span><h1>CONTROL ROOM</h1><p>Protected actions. Historical snapshots are never silently replaced.</p></div></div>{adminContent}</section>}
    {selected&&<MemberDrawer member={selected} onClose={()=>setSelected(null)}/>}
    {themedModal&&<ThemedModal {...themedModal} onCancel={()=>setThemedModal(null)} />}
    {loginOpen&&<ThemedModal variant="prompt" eyebrow="SECURE ADMIN" title="ADMIN ACCESS" message="Admin actions modify persistent tracking state and finalization status." inputType="password" inputValue={password} onInputChange={setPassword} placeholder="Admin password" confirmLabel="SIGN IN" onConfirm={login} onCancel={()=>{setLoginOpen(false);setPassword('');}} />}
  </main>;
}
