'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

const REFRESH_MS = 3000;
const DEFAULT_END = '2026-09-14T00:00:00+08:00';
const HISTORY_KEY = 'nztracker:history:v5';
const SETTINGS_KEY = 'nztracker:settings:v5';
const BLEED_KEY = 'nztracker:bleed-alerts:v1';
const BLEED_COOLDOWN = 30 * 60 * 1000;

const fmt = (value) => new Intl.NumberFormat('en-US').format(Number(value || 0));
const time = (value) => value ? new Date(value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '—';
const read = (key, fallback) => { try { return JSON.parse(localStorage.getItem(key) || '') || fallback; } catch { return fallback; } };
const write = (key, value) => { try { localStorage.setItem(key, JSON.stringify(value)); } catch {} };

function saveClanSnapshot(rows) {
  const history = read(HISTORY_KEY, { clans: [], members: {} });
  history.clans = [...(history.clans || []), {
    at: Date.now(),
    rows: rows.map((row) => ({ clan: row.clan, rank: row.rank, reputation: Number(row.reputation || 0) }))
  }].slice(-2400);
  write(HISTORY_KEY, history);
  return history;
}

function saveMemberSnapshot(clanId, clan, rows) {
  if (!clanId) return read(HISTORY_KEY, { clans: [], members: {} });
  const history = read(HISTORY_KEY, { clans: [], members: {} });
  const current = history.members?.[clanId] || [];
  history.members = { ...(history.members || {}), [clanId]: [...current, {
    at: Date.now(), clan,
    members: rows.map((member) => ({ name: member.name, level: Number(member.level || 0), reputation: Number(member.reputation || 0) }))
  }].slice(-2400) };
  write(HISTORY_KEY, history);
  return history;
}

function rollingGain(history, clan, windowMs) {
  const snapshots = (history?.clans || []).filter((item) => item.at >= Date.now() - windowMs);
  if (snapshots.length < 2) return 0;
  const first = snapshots[0].rows.find((row) => row.clan === clan);
  const last = snapshots[snapshots.length - 1].rows.find((row) => row.clan === clan);
  return first && last ? Math.max(0, Number(last.reputation || 0) - Number(first.reputation || 0)) : 0;
}

function burnStats(history, clanId) {
  const snapshots = history?.members?.[clanId] || [];
  if (snapshots.length < 2) return { top: [], active: 0, total: 0 };
  const first = snapshots.find((item) => item.at >= Date.now() - 30 * 60 * 1000) || snapshots[0];
  const last = snapshots[snapshots.length - 1];
  const base = new Map((first.members || []).map((member) => [member.name, member.reputation]));
  const top = (last.members || []).map((member) => ({
    ...member,
    gain: Math.max(0, Number(member.reputation || 0) - Number(base.get(member.name) || 0))
  })).sort((a, b) => b.gain - a.gain);
  return { top, active: top.filter((member) => member.gain > 0).length, total: top.reduce((sum, member) => sum + member.gain, 0) };
}

function Countdown({ value, label }) {
  return <div className="zCount"><b>{value}</b><span>{label}</span></div>;
}

export default function Home() {
  const [rows, setRows] = useState([]);
  const [season, setSeason] = useState('Season 2');
  const [status, setStatus] = useState('connecting');
  const [updated, setUpdated] = useState(null);
  const [server, setServer] = useState(null);
  const [end, setEnd] = useState(DEFAULT_END);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(null);
  const [members, setMembers] = useState([]);
  const [memberStatus, setMemberStatus] = useState('idle');
  const [memberUpdated, setMemberUpdated] = useState(null);
  const [history, setHistory] = useState({ clans: [], members: {} });
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
  const previousClans = useRef(null);
  const loadInFlight = useRef(false);

  useEffect(() => {
    const stored = read(SETTINGS_KEY, {});
    setAutoRefresh(stored.autoRefresh ?? true);
    setCompact(stored.compact ?? false);
    setBrowserAlerts(stored.browserAlerts ?? false);
    setRankAlerts(stored.rankAlerts ?? false);
    setThreshold(Number(stored.threshold || 100));
    setDiscordAlerts(stored.discordAlerts ?? false);
    setHistory(read(HISTORY_KEY, { clans: [], members: {} }));
  }, []);

  useEffect(() => {
    write(SETTINGS_KEY, { autoRefresh, compact, browserAlerts, rankAlerts, threshold, discordAlerts });
  }, [autoRefresh, compact, browserAlerts, rankAlerts, threshold, discordAlerts]);

  const notify = useCallback((title, body) => {
    if (browserAlerts && 'Notification' in window && Notification.permission === 'granted') {
      new Notification(title, { body, tag: 'nztracker' });
    }
  }, [browserAlerts]);

  const sendBleedingAlert = useCallback(async (clan, before, current) => {
    if (!discordAlerts || current >= before) return;
    const sent = read(BLEED_KEY, {});
    const now = Date.now();
    if (now - Number(sent[clan] || 0) < BLEED_COOLDOWN) return;
    try {
      const response = await fetch('/api/discord/attack-summary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'bleeding', clan,
          previousReputation: before,
          currentReputation: current,
          reputationLoss: before - current,
          timestamp: new Date().toISOString()
        })
      });
      if (response.ok) {
        sent[clan] = now;
        write(BLEED_KEY, sent);
      }
    } catch {}
  }, [discordAlerts]);

  const load = useCallback(async () => {
    if (loadInFlight.current) return;
    loadInFlight.current = true;
    try {
      const response = await fetch(`/api/clan-ranking?t=${Date.now()}`, { cache: 'no-store' });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      const next = Array.isArray(data.rows) ? data.rows : [];
      const headerDate = response.headers.get('date');
      const currentServer = headerDate ? new Date(headerDate) : new Date();
      const previous = previousClans.current;
      previousClans.current = Object.fromEntries(next.map((row) => [row.clan, Number(row.reputation || 0)]));

      if (previous) {
        const oldRanks = new Map(rows.map((row) => [row.clan, Number(row.rank || 0)]));
        for (const row of next) {
          const before = previous[row.clan];
          const current = Number(row.reputation || 0);
          if (typeof before === 'number' && current < before) {
            await sendBleedingAlert(row.clan, before, current);
          }
          if (rankAlerts) {
            const oldRank = oldRanks.get(row.clan);
            if (oldRank && oldRank !== Number(row.rank || 0)) notify('Clan rank changed', `${row.clan}: #${oldRank} → #${row.rank}`);
          }
        }
      }

      const nextHistory = saveClanSnapshot(next);
      setHistory(nextHistory);
      setRows(next);
      setSeason(data.season || 'Season 2');
      if (data.seasonEndsAt) setEnd(data.seasonEndsAt);
      setServer(currentServer);
      setUpdated(new Date());
      setStatus('live');
    } catch {
      setStatus('error');
    } finally {
      loadInFlight.current = false;
    }
  }, [notify, rankAlerts, rows, sendBleedingAlert]);

  const loadMembers = useCallback(async (clan) => {
    if (!clan?.clanId) {
      setMembers([]);
      setMemberStatus('unavailable');
      return;
    }
    setMemberStatus('loading');
    try {
      const response = await fetch(`/api/clan-members?clanId=${encodeURIComponent(clan.clanId)}&t=${Date.now()}`, { cache: 'no-store' });
      if (!response.ok) throw new Error();
      const data = await response.json();
      const next = Array.isArray(data.members) ? data.members.map((member) => ({ ...member, gain: Number(member.gain || 0), totalGain: Number(member.totalGain || 0) })) : [];
      const nextHistory = saveMemberSnapshot(clan.clanId, clan.clan, next);
      setHistory(nextHistory);
      setMembers(next);
      setMemberUpdated(new Date(data.fetchedAt || Date.now()));
      setMemberStatus('live');
      const burn = burnStats(nextHistory, clan.clanId);
      if (burn.top[0]?.gain >= threshold) notify('Ninja Zenshin gain alert', `${clan.clan}: ${burn.top[0].name} +${fmt(burn.top[0].gain)} rep in 30m`);
    } catch {
      setMemberStatus('error');
    }
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
    const close = (event) => { if (event.key === 'Escape') { setSelected(null); setSettingsOpen(false); } };
    window.addEventListener('keydown', close);
    return () => window.removeEventListener('keydown', close);
  }, []);

  const filtered = useMemo(() => {
    const q = query.toLowerCase().trim();
    return [...rows].filter((row) => !q || `${row.clan} ${row.master}`.toLowerCase().includes(q)).sort((a, b) => Number(a.rank || 0) - Number(b.rank || 0));
  }, [rows, query]);

  const sortedMembers = useMemo(() => {
    const list = [...members];
    const mul = direction === 'asc' ? 1 : -1;
    return list.sort((a, b) => sort === 'name'
      ? String(a.name).localeCompare(String(b.name)) * mul
      : (Number(a[sort] || 0) - Number(b[sort] || 0)) * mul);
  }, [members, sort, direction]);

  const totalMembers = rows.reduce((sum, row) => sum + Number(row.memberCurrent || 0), 0);
  const maxMembers = rows.reduce((sum, row) => sum + Number(row.memberMax || 0), 0);
  const top3 = rows.slice(0, 3);
  const globalGain30 = rows.reduce((sum, row) => sum + rollingGain(history, row.clan, 30 * 60 * 1000), 0);
  const globalGain1h = rows.reduce((sum, row) => sum + rollingGain(history, row.clan, 60 * 60 * 1000), 0);
  const ratePerMinute = globalGain30 / 30;
  const selectedStats = selected ? {
    gain30: rollingGain(history, selected.clan, 30 * 60 * 1000),
    gain1h: rollingGain(history, selected.clan, 60 * 60 * 1000),
    gain2h: rollingGain(history, selected.clan, 2 * 60 * 60 * 1000),
    gain4h: rollingGain(history, selected.clan, 4 * 60 * 60 * 1000),
    ...burnStats(history, selected.clanId)
  } : null;

  const countdown = useMemo(() => {
    const seconds = Math.max(0, Math.floor((new Date(end).getTime() - (server ? server.getTime() : Date.now())) / 1000));
    return [Math.floor(seconds / 86400), Math.floor((seconds % 86400) / 3600), Math.floor((seconds % 3600) / 60), seconds % 60];
  }, [end, server]);

  const openClan = (clan) => { setSelected(clan); setMembers([]); setMemberStatus('loading'); loadMembers(clan); };
  const sortBy = (key) => { if (sort === key) setDirection((value) => value === 'asc' ? 'desc' : 'asc'); else { setSort(key); setDirection(key === 'name' ? 'asc' : 'desc'); } };
  const sortMark = (key) => sort === key ? (direction === 'asc' ? ' ↑' : ' ↓') : '';
  const requestAlerts = async (enabled) => {
    if (!enabled) return setBrowserAlerts(false);
    if (!('Notification' in window)) return setBrowserAlerts(false);
    setBrowserAlerts((await Notification.requestPermission()) === 'granted');
  };

  return <main className={`zApp ${compact ? 'zCompact' : ''}`}>
    <style>{`
      .zApp{min-height:100vh;width:min(1200px,calc(100% - 44px));margin:auto;padding:16px 0 34px;color:#eef4fa;font-family:Manrope,system-ui,sans-serif}
      .zTop{position:sticky;top:12px;z-index:120;display:flex;justify-content:flex-end;margin-bottom:10px}.zSettingsBtn{width:42px;height:42px;border:1px solid #26303d;border-radius:11px;background:#0a1018;color:#fff;font-size:18px;cursor:pointer;display:grid;place-items:center}.zSettingsBtn:hover{border-color:#54d7ff}
      .zSettings{position:fixed;right:22px;top:70px;z-index:200;width:min(360px,calc(100vw - 28px));max-height:calc(100vh - 86px);overflow:auto;background:#080e16;border:1px solid #283342;border-radius:15px;box-shadow:0 25px 80px #000b}.zSettings header{display:flex;justify-content:space-between;gap:10px;padding:15px;border-bottom:1px solid #1b2530}.zSettingsClose{width:30px;height:30px;border:1px solid #27313e;border-radius:8px;background:none;color:#9ba8b8;cursor:pointer}.zBody{padding:6px 15px 15px}.zBody label{display:flex;justify-content:space-between;gap:12px;padding:13px 0;border-bottom:1px solid #171f29}.zBody strong{display:block;font-size:.72rem}.zBody small{display:block;color:#68768a;font-size:.57rem;margin-top:3px;line-height:1.35}.zBody input[type=number]{width:82px;background:#0d141e;border:1px solid #27313e;border-radius:7px;color:#fff;padding:6px}.zBody input[type=checkbox]{accent-color:#54d7ff}.zRefresh,.zPrimary{height:36px;padding:0 12px;border:1px solid #29566d;border-radius:9px;background:#0a1b26;color:#54d7ff;cursor:pointer}.zRefresh{width:100%;margin-top:13px}
      .zHero{display:flex;justify-content:space-between;gap:22px;align-items:end;padding:22px 0 22px;border-bottom:1px solid #17202a}.zLabel,.zHead,footer,.zMono{font-family:'JetBrains Mono',monospace}.zLabel{font-size:.48rem;color:#6e7c90;letter-spacing:.12em}.zHero h1{margin:8px 0 0;font:700 clamp(2.7rem,6vw,5.2rem)/.95 'Space Grotesk';letter-spacing:-.06em;background:linear-gradient(110deg,#fff,#54d7ff 50%,#a875ff);-webkit-background-clip:text;color:transparent}.zHero p{color:#8190a3;font-size:.8rem;max-width:680px;line-height:1.55}.zActions{display:flex;align-items:center;gap:7px;flex-wrap:wrap;justify-content:flex-end}.zLive{height:34px;padding:0 11px;display:grid;place-items:center;border:1px solid #254637;border-radius:9px;color:#5de5ad;background:#09140f;font:600 .5rem 'JetBrains Mono'}.zLive.error{color:#ff8e8e;border-color:#573535;background:#170b0b}.zActions button{height:34px;border:1px solid #27313e;border-radius:9px;background:#0b121a;color:#d8e2ed;padding:0 11px;cursor:pointer}
      .zStats{display:grid;grid-template-columns:repeat(3,.72fr) 1.8fr;gap:9px;padding:14px 0}.zCard,.zSection,.zPodium,.zRankBox{background:#0a1119;border:1px solid #1b2632;border-radius:13px}.zCard{padding:14px;min-width:0}.zCard strong{display:block;margin-top:6px;font:800 1.5rem 'Space Grotesk';overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.zCard small{color:#66758a;font-size:.56rem}.zSeason{display:flex;align-items:center;justify-content:space-between;gap:9px}.zCountdown{display:grid;grid-template-columns:repeat(4,1fr);gap:4px}.zCount{text-align:center;background:#0c1821;border:1px solid #1b3540;border-radius:7px;padding:6px}.zCount b{display:block;font:700 .9rem 'JetBrains Mono'}.zCount span{display:block;color:#607085;font:600 .4rem 'JetBrains Mono'}
      .zSection{padding:14px;margin-bottom:14px}.zSectionHead{display:flex;justify-content:space-between;align-items:end;gap:12px;margin-bottom:9px}.zSection h2{margin:3px 0;font:700 1.1rem 'Space Grotesk'}.zSection p{margin:0;color:#68778a;font-size:.58rem;line-height:1.4}.zSectionHead button{border:1px solid #27313e;border-radius:8px;background:#0b121a;color:#97a6b9;padding:6px 10px;cursor:pointer}
      .zAnalytics{display:grid;grid-template-columns:repeat(4,1fr);gap:8px}.zAnalytics .zCard strong{font-size:1.05rem}.zPanel{padding:13px;border:1px solid #1b2632;border-radius:11px;grid-column:span 2}.zPanel h3{margin:0;font:700 .82rem 'Space Grotesk'}.zBurn{display:grid;grid-template-columns:28px minmax(0,1fr) auto;gap:7px;padding:8px 0;border-top:1px solid #17212b;font-size:.62rem;min-width:0}.zBurn b,.zBurn span,.zBurn em{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.zBurn span{color:#637186}.zBurn em{font-style:normal;color:#5de5ad;font-family:'JetBrains Mono'}
      .zPodiums{display:grid;grid-template-columns:repeat(3,1fr);gap:9px;margin-bottom:14px}.zPodium{padding:13px;cursor:pointer}.zPodium:hover{border-color:#305066}.zPodTop{display:flex;gap:8px;align-items:center;min-width:0}.zAvatar{width:30px;height:30px;display:grid;place-items:center;flex:0 0 30px;border:1px solid #243242;border-radius:8px;background:#0d1a25}.zName{min-width:0}.zName strong,.zName small{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.zName strong{font:700 .72rem 'Space Grotesk'}.zName small{color:#718094;font-size:.53rem}.zPodStats{display:grid;grid-template-columns:repeat(3,1fr);gap:5px;margin-top:11px}.zPodStats div{padding:8px;border:1px solid #16212c;border-radius:7px;min-width:0;overflow:hidden}.zPodStats small{display:block;color:#637187;font:600 .4rem 'JetBrains Mono';white-space:nowrap}.zPodStats b{display:block;margin-top:4px;font:700 .58rem 'JetBrains Mono';overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      .zToolbar{display:flex;gap:8px;align-items:center;margin-bottom:9px}.zSearch{flex:1;min-width:0;height:40px;border:1px solid #1b2632;border-radius:9px;background:#0a1119;color:#fff;padding:0 10px}.zSearch::placeholder{color:#59687b}.zHead,.zRow{display:grid;grid-template-columns:52px minmax(180px,2fr) minmax(120px,1.2fr) 86px 125px 92px 110px;gap:13px;align-items:center;min-width:930px}.zHead{padding:9px 14px;color:#647388;font-size:.46rem;letter-spacing:.11em;background:#101821}.zRow{padding:10px 14px;min-height:60px;border-top:1px solid #15202a;cursor:pointer;font-size:.63rem}.zRow>*{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.zRank{font:700 .66rem 'JetBrains Mono';color:#54d7ff}.zClan{min-width:0;overflow:hidden}.zClan strong{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font:700 .72rem 'Space Grotesk'}.zBar{height:2px;background:#16222d;margin-top:5px}.zBar i{display:block;height:100%;background:linear-gradient(90deg,#54d7ff,#a875ff)}.zMuted{color:#7d8b9d}.zGain{color:#5de5ad}.zTotal{color:#54d7ff}.zRankBox{overflow:auto}
      .zModal{position:fixed;inset:0;z-index:300;display:grid;place-items:center;padding:14px;background:#020509cf;backdrop-filter:blur(10px)}.zModalBox{width:min(1020px,100%);max-height:92vh;display:flex;flex-direction:column;background:#080e16;border:1px solid #2a3541;border-radius:15px;overflow:hidden}.zModalHead{display:flex;justify-content:space-between;gap:12px;padding:16px;border-bottom:1px solid #1b2530}.zModalHead h2{margin:4px 0;font:700 1.2rem 'Space Grotesk';overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.zMeta{color:#6f7e91;font-size:.58rem}.zModalBody{padding:14px;overflow:auto}.zStrip{display:grid;grid-template-columns:repeat(4,1fr);gap:7px;margin-bottom:10px}.zStrip div{padding:10px;border:1px solid #19242f;border-radius:8px;min-width:0}.zStrip strong{display:block;margin-top:4px;font:700 .78rem 'JetBrains Mono';overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.zTools{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:10px}.zTools span{color:#637186;font-size:.52rem}.zMembers{min-width:730px;border:1px solid #1b2632;border-radius:10px;overflow:hidden}.zMHead,.zMRow{display:grid;grid-template-columns:38px minmax(180px,1fr) 60px 120px 85px 90px;gap:9px;align-items:center}.zMHead{padding:0 10px;background:#101821}.zMHead button{padding:10px 0;border:0;background:none;color:#637186;text-align:left;font:600 .44rem 'JetBrains Mono';cursor:pointer;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.zMRow{min-height:44px;padding:7px 10px;border-top:1px solid #15202a;font-size:.58rem}.zMRow>*{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.zMRow strong{font-family:'Space Grotesk'}.zEmpty{padding:28px;text-align:center;color:#637186;font-size:.58rem}.zFoot{padding:9px;text-align:center;border-top:1px solid #17212b;color:#5f6e82;font:600 .45rem 'JetBrains Mono'}footer{padding-top:18px;text-align:center;color:#566579;font-size:.47rem}footer a{color:#54d7ff}
      @media(max-width:950px){.zApp{width:calc(100% - 28px)}.zStats{grid-template-columns:repeat(2,1fr)}.zSeason{grid-column:1/-1}.zAnalytics{grid-template-columns:repeat(2,1fr)}.zPanel{grid-column:span 1}.zPodiums{grid-template-columns:1fr}}
      @media(max-width:620px){.zTop{top:7px}.zSettings{right:10px;top:60px}.zHero{padding-top:16px;flex-direction:column;align-items:flex-start}.zStats,.zAnalytics{grid-template-columns:1fr}.zSeason{grid-column:auto;flex-direction:column;align-items:stretch}.zCountdown{width:100%}.zPodiums{grid-template-columns:1fr}.zAnalytics .zPanel{grid-column:auto}.zToolbar{align-items:stretch;flex-direction:column}.zToolbar .zLabel{align-self:flex-start!important}.zHead,.zRow{min-width:930px}.zStrip{grid-template-columns:repeat(2,1fr)}}
    `}</style>

    <div className="zTop">
      <button className="zSettingsBtn" onClick={() => setSettingsOpen((value) => !value)} title="Settings" aria-label="Settings">🛠️</button>
    </div>

    {settingsOpen && <aside className="zSettings">
      <header><div><div className="zLabel">TRACKER CONFIG</div><h3 style={{ margin: '4px 0', fontFamily: 'Space Grotesk' }}>Settings</h3></div><button className="zSettingsClose" onClick={() => setSettingsOpen(false)} aria-label="Close settings">×</button></header>
      <div className="zBody">
        <label><span><strong>Auto refresh</strong><small>Refresh live rankings and members every 3 seconds.</small></span><input type="checkbox" checked={autoRefresh} onChange={(event) => setAutoRefresh(event.target.checked)} /></label>
        <label><span><strong>Compact rows</strong><small>Use tighter ranking rows.</small></span><input type="checkbox" checked={compact} onChange={(event) => setCompact(event.target.checked)} /></label>
        <label><span><strong>Browser alerts</strong><small>Notify when the selected gain threshold is reached.</small></span><input type="checkbox" checked={browserAlerts} onChange={(event) => requestAlerts(event.target.checked)} /></label>
        <label><span><strong>Rank alerts</strong><small>Notify when a clan changes position.</small></span><input type="checkbox" checked={rankAlerts} onChange={(event) => setRankAlerts(event.target.checked)} /></label>
        <label><span><strong>Gain threshold</strong><small>{fmt(threshold)} reputation.</small></span><input type="number" min="1" value={threshold} onChange={(event) => setThreshold(Number(event.target.value || 1))} /></label>
        <label><span><strong>Discord bleeding alerts</strong><small>Automatically send a Discord alert when a clan loses reputation.</small></span><input type="checkbox" checked={discordAlerts} onChange={(event) => setDiscordAlerts(event.target.checked)} /></label>
        <button className="zRefresh" onClick={() => { load(); if (selected) loadMembers(selected); }}>↻ Refresh now</button>
      </div>
    </aside>}

    <header className="zHero" id="overview">
      <div><div className="zLabel">● NINJA ZENSHIN // LIVE ANALYTICS</div><h1>Clan Intelligence</h1><p>Real-time clan ranking, member activity, reputation gains, Top Burn and attack projections for <b>{season}</b>.</p></div>
      <div className="zActions"><span className={`zLive ${status === 'error' ? 'error' : ''}`}>● {status === 'live' ? 'LIVE · SYNCING' : status === 'error' ? 'OFFLINE · RETRYING' : 'CONNECTING'}</span><button onClick={load}>↻ Refresh</button></div>
    </header>

    <section className="zStats">
      <div className="zCard"><div className="zLabel">TRACKED CLANS</div><strong>{rows.length || '—'}</strong><small>Live global ranking</small></div>
      <div className="zCard"><div className="zLabel">ACTIVE MEMBERS</div><strong>{rows.length ? fmt(totalMembers) : '—'}</strong><small>{maxMembers ? `${Math.round(totalMembers / maxMembers * 100)}% capacity` : 'Waiting for source'}</small></div>
      <div className="zCard"><div className="zLabel">GLOBAL GAIN / 30M</div><strong>+{fmt(globalGain30)}</strong><small>{fmt(Math.round(ratePerMinute))} rep / min</small></div>
      <div className="zCard zSeason"><div><div className="zLabel">{season}</div><strong>ENDS IN</strong></div><div className="zCountdown"><Countdown value={countdown[0]} label="DAYS"/><Countdown value={String(countdown[1]).padStart(2, '0')} label="HRS"/><Countdown value={String(countdown[2]).padStart(2, '0')} label="MINS"/><Countdown value={String(countdown[3]).padStart(2, '0')} label="SECS"/></div></div>
    </section>

    <section className="zSection" id="analytics">
      <div className="zSectionHead"><div><div className="zLabel">REFERENCE ANALYTICS</div><h2>Attack Analytics</h2><p>Rolling history is collected while the tracker is open.</p></div><button onClick={() => setShowAnalytics((value) => !value)}>{showAnalytics ? 'Hide' : 'Show'}</button></div>
      {showAnalytics && <div className="zAnalytics">
        <div className="zCard"><div className="zLabel">30M REPUTATION</div><strong>+{fmt(globalGain30)}</strong></div>
        <div className="zCard"><div className="zLabel">1H REPUTATION</div><strong>+{fmt(globalGain1h)}</strong></div>
        <div className="zCard"><div className="zLabel">PROJECTED / 1H</div><strong>+{fmt(Math.round(ratePerMinute * 60))}</strong></div>
        <div className="zCard"><div className="zLabel">PROJECTED / 4H</div><strong>+{fmt(Math.round(ratePerMinute * 240))}</strong></div>
        <div className="zPanel"><h3>Top Burn <span className="zLabel">30M</span></h3>{selected ? selectedStats.top.slice(0, 5).map((member, index) => <div className="zBurn" key={member.name}><span>#{index + 1}</span><b>{member.name}</b><em>+{fmt(member.gain)}</em></div>) : <div className="zEmpty">Select a clan to see highest-gain members.</div>}</div>
        <div className="zPanel"><h3>Activity Pulse <span className="zLabel">LIVE</span></h3><div className="zBurn" style={{ marginTop: 9 }}><span>ACTIVE</span><b>{selected ? selectedStats.active : 0}</b><em>members</em></div><div className="zBurn"><span>30M GAIN</span><b>{selected ? fmt(selectedStats.total) : 0}</b><em>rep</em></div><div className="zBurn"><span>REP / MIN</span><b>{selected ? fmt(Math.round(selectedStats.total / 30)) : 0}</b><em>pace</em></div></div>
      </div>}
    </section>

    <section className="zPodiums">{top3.map((row, index) => <div className="zPodium" key={row.clan} onClick={() => openClan(row)}><div className="zPodTop"><span className="zRank">{index + 1}</span><div className="zAvatar">{row.clan?.[0] || 'N'}</div><div className="zName"><strong>{row.clan}</strong><small>{row.master || 'Clan Master'}</small></div></div><div className="zPodStats"><div><small>MEMBERS</small><b>{row.memberCurrent}/{row.memberMax}</b></div><div><small>REPUTATION</small><b>{fmt(row.reputation)}</b></div><div><small>30M GAIN</small><b className="zGain">+{fmt(rollingGain(history, row.clan, 30 * 60 * 1000))}</b></div></div></div>)}</section>

    <section className="zSection" id="ranking">
      <div className="zToolbar"><input className="zSearch" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search clan or master..."/><span className="zLabel">{updated ? time(updated) : 'Connecting'} · {server ? time(server) : '—'}</span></div>
      <div className="zRankBox"><div className="zHead"><span>RANK</span><span>CLAN</span><span>MASTER</span><span>MEMBERS</span><span>REPUTATION</span><span>30M GAIN</span><span>TOTAL GAIN</span></div>
        {filtered.map((row) => { const firstSeen = history.clans?.[0]?.rows?.find((item) => item.clan === row.clan)?.reputation ?? row.reputation; return <div className="zRow" key={`${row.clan}-${row.rank}`} onClick={() => openClan(row)} role="button" tabIndex={0}><span className="zRank">{row.rank}</span><div className="zClan"><strong>{row.clan}</strong><div className="zBar"><i style={{ width: `${row.memberMax ? Math.min(100, row.memberCurrent / row.memberMax * 100) : 0}%` }}/></div></div><span className="zMuted">{row.master || '—'}</span><span className="zMono">{row.memberCurrent}/{row.memberMax}</span><span className="zMono">{fmt(row.reputation)}</span><span className="zMono zGain">+{fmt(rollingGain(history, row.clan, 30 * 60 * 1000))}</span><span className="zMono zTotal">{fmt(Math.max(0, Number(row.reputation || 0) - Number(firstSeen || 0)))}</span></div>; })}
        {!filtered.length && <div className="zEmpty">{status === 'error' ? 'Unable to load live clan data.' : 'No clans match your search.'}</div>}
      </div>
    </section>

    {selected && <div className="zModal" onMouseDown={(event) => { if (event.target === event.currentTarget) setSelected(null); }}><div className="zModalBox">
      <div className="zModalHead"><div><div className="zLabel">LIVE MEMBERS // REPUTATION</div><h2>{selected.clan}</h2><div className="zMeta">Master: {selected.master || '—'} · {selected.memberCurrent}/{selected.memberMax} members</div></div><div><span className="zMeta">{memberStatus === 'live' ? `● LIVE · ${time(memberUpdated)}` : memberStatus === 'loading' ? 'Loading…' : memberStatus === 'error' ? 'Fetch error' : 'Unavailable'}</span> <button className="zSettingsClose" onClick={() => setSelected(null)} aria-label="Close members">×</button></div></div>
      <div className="zModalBody"><div className="zStrip"><div><div className="zLabel">30M GAIN</div><strong>+{fmt(selectedStats?.gain30 || 0)}</strong></div><div><div className="zLabel">REP / MIN</div><strong>{fmt(Math.round((selectedStats?.gain30 || 0) / 30))}</strong></div><div><div className="zLabel">1H PROJECTED</div><strong>+{fmt(Math.round((selectedStats?.gain30 || 0) * 2))}</strong></div><div><div className="zLabel">4H PROJECTED</div><strong>+{fmt(Math.round((selectedStats?.gain30 || 0) * 8))}</strong></div></div>
        {memberStatus === 'loading' && <div className="zEmpty">Fetching live member names, levels and reputation…</div>}
        {memberStatus === 'error' && <div className="zEmpty">Unable to fetch live members right now.</div>}
        {memberStatus === 'live' && !members.length && <div className="zEmpty">No members returned by the source.</div>}
        {members.length > 0 && <div className="zMembers"><div className="zMHead"><button onClick={() => sortBy('name')}># / MEMBER{sortMark('name')}</button><button onClick={() => sortBy('level')}>LEVEL{sortMark('level')}</button><button onClick={() => sortBy('reputation')}>REPUTATION{sortMark('reputation')}</button><button onClick={() => sortBy('gain')}>GAIN{sortMark('gain')}</button><button onClick={() => sortBy('totalGain')}>TOTAL GAIN{sortMark('totalGain')}</button></div>{sortedMembers.map((member, index) => <div className="zMRow" key={`${member.name}-${index}`}><span className="zMono">{index + 1}</span><strong>{member.name}</strong><span className="zMono">{member.level || '—'}</span><span className="zMono">{fmt(member.reputation)}</span><span className="zMono zGain">{member.gain > 0 ? `+${fmt(member.gain)}` : '0'}</span><span className="zMono zTotal">{fmt(member.totalGain)}</span></div>)}</div>}
      </div><div className="zFoot">Click a column to sort · click again to reverse · Press Esc to close</div>
    </div></div>}

    <footer>Created by <strong>Michol</strong> · <a href="https://discordapp.com/users/396080330702061588" target="_blank" rel="noreferrer">Discord</a></footer>
  </main>;
}
