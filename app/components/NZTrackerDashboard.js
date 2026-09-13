'use client';

import { useEffect, useMemo, useState } from 'react';
import ClanIntelligence from './ClanIntelligence';
import { buildMemberRows, deriveAlerts, deriveEvents } from '../lib/metrics';
import { downloadCsv } from '../lib/csv';

const REFRESH_MS = 30000;
const OPS_REFRESH_MS = 10000;
const PLAYER_PAGE = 100;

const fmt = (n) => Number(n || 0).toLocaleString();
const ageText = (seconds) => {
  if (seconds == null) return 'never';
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  return `${Math.floor(seconds / 3600)}h ago`;
};
const statusClass = (status) => `nz4-source ${String(status || 'unknown').toLowerCase()}`;

async function json(url) {
  const response = await fetch(url, { cache: 'no-store', headers: { Accept: 'application/json', 'Cache-Control': 'no-cache' } });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || data.details || `HTTP ${response.status}`);
  return data;
}

export default function NZTrackerDashboard() {
  const [tab, setTab] = useState('clans');
  const [clans, setClans] = useState([]);
  const [changes, setChanges] = useState({});
  const [leaderboards, setLeaderboards] = useState({ pve: [], pvp: [] });
  const [dataStatus, setDataStatus] = useState(null);
  const [search, setSearch] = useState('');
  const [searchData, setSearchData] = useState(null);
  const [selected, setSelected] = useState(null);
  const [members, setMembers] = useState([]);
  const [history, setHistory] = useState(null);
  const [memberState, setMemberState] = useState('IDLE');
  const [periodHours, setPeriodHours] = useState(5);
  const [eventFilter, setEventFilter] = useState('ALL');
  const [sort, setSort] = useState('rank');
  const [queryBusy, setQueryBusy] = useState(false);
  const [clanA, setClanA] = useState('');
  const [clanB, setClanB] = useState('');
  const [comparison, setComparison] = useState(null);
  const [clock, setClock] = useState(null);
  const [error, setError] = useState('');

  async function refresh() {
    const bust = Date.now();
    const [clanResult, boards, status, moves] = await Promise.allSettled([
      json(`/api/clans?limit=500&refresh=${bust}`),
      json(`/api/leaderboards?limit=100&refresh=${bust}`),
      json(`/api/data-status?refresh=${bust}`),
      json(`/api/rank-changes?season=Season%203&refresh=${bust}`)
    ]);
    if (clanResult.status === 'fulfilled') setClans(Array.isArray(clanResult.value.clans) ? clanResult.value.clans : []);
    if (boards.status === 'fulfilled') setLeaderboards({ pve: boards.value.pve || [], pvp: boards.value.pvp || [] });
    if (status.status === 'fulfilled') setDataStatus(status.value);
    if (moves.status === 'fulfilled') setChanges(moves.value.changes || {});
    if ([clanResult, boards, status, moves].every((result) => result.status === 'rejected')) setError('All data endpoints are unavailable. Existing cached data has been kept on screen.');
    else setError('');
  }

  useEffect(() => {
    refresh();
    const timer = setInterval(refresh, REFRESH_MS);
    const clockTimer = setInterval(() => setClock(Date.now()), 1000);
    return () => { clearInterval(timer); clearInterval(clockTimer); };
  }, []);

  useEffect(() => {
    if (tab !== 'ops') return undefined;
    const timer = setInterval(() => json(`/api/data-status?refresh=${Date.now()}`).then(setDataStatus).catch(() => {}), OPS_REFRESH_MS);
    return () => clearInterval(timer);
  }, [tab]);

  useEffect(() => {
    if (!selected?.clanId) return;
    let cancelled = false;
    (async () => {
      setMemberState('LOADING');
      try {
        const data = await json(`/api/clan-members?clanId=${encodeURIComponent(selected.clanId)}&refresh=${Date.now()}`);
        if (!cancelled) { setMembers(data.members || []); setMemberState(data.stale ? 'STALE' : 'LIVE'); }
      } catch {
        if (!cancelled) { setMembers([]); setMemberState('ERROR'); }
      }
      try {
        const data = await json(`/api/member-history?clanId=${encodeURIComponent(selected.clanId)}&season=${encodeURIComponent(selected.season || 'Season 3')}&hours=168&refresh=${Date.now()}`);
        if (!cancelled) setHistory(data);
      } catch { if (!cancelled) setHistory(null); }
    })();
    return () => { cancelled = true; };
  }, [selected]);

  useEffect(() => {
    const q = search.trim();
    if (q.length < 2) { setSearchData(null); return undefined; }
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setQueryBusy(true);
      try {
        const response = await fetch(`/api/player-search?q=${encodeURIComponent(q)}&refresh=${Date.now()}`, { cache: 'no-store', signal: controller.signal });
        const data = await response.json();
        if (response.ok) setSearchData(data);
      } catch {} finally { setQueryBusy(false); }
    }, 250);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [search]);

  const sortedClans = useMemo(() => [...clans].sort((a, b) => {
    if (sort === 'reputation') return Number(b.reputation || 0) - Number(a.reputation || 0);
    if (sort === 'members') return Number(b.memberCurrent || 0) - Number(a.memberCurrent || 0);
    if (sort === 'movers') return Number(changes[b.clanId]?.rankDelta || -999) - Number(changes[a.clanId]?.rankDelta || -999);
    return Number(a.rank || 9999) - Number(b.rank || 9999);
  }), [clans, changes, sort]);

  const selectedRow = selected ? clans.find((row) => String(row.clanId) === String(selected.clanId)) || selected : null;
  const intelRows = useMemo(() => buildMemberRows(members, history?.members || {}, periodHours, clock), [members, history, periodHours, clock]);
  const events = useMemo(() => deriveEvents(members, history?.members || {}, clock).filter((event) => eventFilter === 'ALL' ? true : eventFilter === '+1K' ? event.gain >= 1000 : event.gain >= 5000), [members, history, clock, eventFilter]);
  const alerts = useMemo(() => deriveAlerts(intelRows, periodHours), [intelRows, periodHours]);
  const intel = useMemo(() => {
    const gain = intelRows.reduce((sum, row) => sum + row.gain, 0);
    return {
      gain,
      hour: gain / Math.max(periodHours, 1),
      active: intelRows.filter((row) => row.status === 'ACTIVE').length,
      recent: intelRows.filter((row) => row.status === 'RECENT').length,
      idle: intelRows.filter((row) => row.status === 'IDLE').length,
      noGain: intelRows.filter((row) => row.status === 'NO GAIN').length,
      burn: intelRows.filter((row) => row.current < 10000),
      top: [...intelRows].sort((a, b) => b.gain - a.gain).slice(0, 5)
    };
  }, [intelRows, periodHours]);

  async function runCompare() {
    if (!clanA || !clanB || clanA === clanB) { setComparison(null); return; }
    try { setComparison(await json(`/api/clan-compare?a=${encodeURIComponent(clanA)}&b=${encodeURIComponent(clanB)}&season=${encodeURIComponent(dataStatus?.season || 'Season 3')}`)); } catch { setComparison(null); }
  }

  const sourceEntries = ['clanRanking', 'pve', 'pvp', 'clanMembers'].map((key) => [key, dataStatus?.sources?.[key]]);
  const stale = dataStatus?.status === 'stale';
  const partial = dataStatus?.overall === 'partial';

  return (
    <main className="nz4-app">
      <header className="nz4-head">
        <div className="nz4-brand"><span className="nz4-icon">🥷</span><div><h1>NINJA ZENSHIN TRACKER</h1><p>{dataStatus?.season || 'GAME DATA'} · MULTI-SOURCE OPERATIONS</p></div></div>
        <div className="nz4-head-status"><span className={`nz4-live-dot ${stale ? 'bad' : partial ? 'warn' : 'good'}`}></span><b>{stale ? 'STALE DATA' : partial ? 'PARTIAL SYNC' : dataStatus?.overall === 'success' ? 'LIVE DATA' : 'SYNCING'}</b><span>Updated {ageText(dataStatus?.ageSeconds)}</span></div>
      </header>

      <nav className="nz4-tabs">
        {['clans', 'pve', 'pvp', 'finder', 'ops'].map((item) => <button key={item} className={tab === item ? 'active' : ''} onClick={() => setTab(item)}>{item === 'finder' ? 'PLAYER FINDER' : item.toUpperCase()}</button>)}
      </nav>

      {(stale || partial || error) && <div className={`nz4-alert ${stale ? 'bad' : 'warn'}`}>{stale ? '⚠️ Game data may have changed since last sync.' : partial ? '⚠️ Some sources failed. Working sources remain visible; cached data was not blanked.' : error}</div>}

      {tab === 'clans' && <section className="nz4-panel">
        <div className="nz4-toolbar"><div><span className="nz4-kicker">CLAN RANKING</span><h2>{clans.length} CLANS</h2><p>Current snapshot + movement tracking</p></div><div className="nz4-actions"><select value={sort} onChange={(e) => setSort(e.target.value)}><option value="rank">SORT: RANK</option><option value="reputation">SORT: REPUTATION</option><option value="members">SORT: MEMBERS</option><option value="movers">SORT: MOVERS</option></select><a className="nz4-btn" href={`/api/export?type=clans&format=csv&season=${encodeURIComponent(dataStatus?.season || '')}`}>EXPORT CSV</a></div></div>
        <div className="nz4-source-strip">{sourceEntries.map(([name, source]) => <span key={name} className={statusClass(source?.status)}><i></i><b>{name === 'clanRanking' ? 'CLANS' : name === 'clanMembers' ? 'MEMBERS' : name.toUpperCase()}</b><em>{source?.rows ?? source?.clans ?? 0}{name === 'clanMembers' ? ` clans / ${source?.members || 0} players` : ' rows'}</em></span>)}</div>
        <div className="nz4-table-wrap"><table><thead><tr><th>RANK</th><th>MOVE</th><th>CLAN</th><th>MASTER</th><th>MEMBERS</th><th>REPUTATION</th></tr></thead><tbody>{sortedClans.map((row) => { const move = changes[row.clanId]?.rankDelta || 0; return <tr key={row.clanId} onDoubleClick={() => setSelected(row)}><td className="rank">#{row.rank}</td><td><span className={`nz4-move ${move > 0 ? 'up' : move < 0 ? 'down' : ''}`}>{move > 0 ? `↑ ${move}` : move < 0 ? `↓ ${Math.abs(move)}` : '—'}</span></td><td><button className="nz4-clan" onClick={() => setSelected(row)}>{row.clan}</button></td><td>{row.master || '—'}</td><td>{row.memberCurrent || 0}/{row.memberMax || 0}</td><td><b>{fmt(row.reputation)}</b>{changes[row.clanId]?.reputationDelta ? <small className="nz4-delta"> {changes[row.clanId].reputationDelta > 0 ? '+' : ''}{fmt(changes[row.clanId].reputationDelta)}</small> : null}</td></tr>; })}</tbody></table>{!sortedClans.length && <div className="nz4-empty">No cached clan dataset is available.</div>}</div>
        <div className="nz4-compare"><div><span className="nz4-kicker">COMPARE</span><b>CLAN A vs CLAN B</b><small>Average reputation, members, and rank.</small></div><select value={clanA} onChange={(e) => setClanA(e.target.value)}><option value="">Select clan A</option>{clans.map((clan) => <option key={`a-${clan.clanId}`} value={clan.clanId}>{clan.clan}</option>)}</select><select value={clanB} onChange={(e) => setClanB(e.target.value)}><option value="">Select clan B</option>{clans.map((clan) => <option key={`b-${clan.clanId}`} value={clan.clanId}>{clan.clan}</option>)}</select><button className="nz4-btn" onClick={runCompare}>COMPARE</button>{comparison?.clans?.length === 2 && <div className="nz4-compare-result">{comparison.clans.map((clan) => <span key={clan.clan_id}><b>{clan.clan}</b> #{clan.rank} · {clan.member_current}/{clan.member_max} · {fmt(clan.reputation)} REP</span>)}</div>}</div>
      </section>}

      {(tab === 'pve' || tab === 'pvp') && <section className="nz4-panel"><div className="nz4-toolbar"><div><span className="nz4-kicker">PLAYER LEADERBOARD</span><h2>{tab === 'pve' ? 'PVE' : 'PVP'} LEADERBOARD</h2><p>{tab === 'pve' ? 'Score / season / round' : 'Score + real battle W/L'}</p></div><div className="nz4-actions"><a className="nz4-btn" href={`/api/export?type=${tab}&format=csv`}>EXPORT CSV</a><a className="nz4-btn" href={`/api/export?type=${tab}&format=json`}>EXPORT JSON</a></div></div><div className="nz4-board-meta"><b>{leaderboards[tab]?.[0]?.season || '—'}</b><span>Round {leaderboards[tab]?.[0]?.round || '—'}</span><span>{leaderboards[tab]?.length || 0} rows</span></div><div className="nz4-table-wrap"><table><thead><tr><th>RANK</th><th>PLAYER</th><th>SCORE</th>{tab === 'pvp' && <th>WIN / LOSE</th>}<th>TITLE</th><th>BADGE</th></tr></thead><tbody>{(leaderboards[tab] || []).map((row) => <tr key={`${tab}-${row.season}-${row.round}-${row.rank}`}><td className="rank">#{row.rank}</td><td>{row.playerName || 'ㅤ'}</td><td><b>{fmt(row.score)}</b></td>{tab === 'pvp' && <td>{row.wins} / {row.losses}</td>}<td>{row.title || '—'}</td><td>{row.badge || '—'}</td></tr>)}</tbody></table></div><div className="nz4-note">Titles/badges are stored when exposed by the game payload. The public leaderboard tables currently do not expose a title/badge column.</div></section>}

      {tab === 'finder' && <section className="nz4-panel"><div className="nz4-toolbar"><div><span className="nz4-kicker">PLAYER SEARCH</span><h2>FIND + TRACK</h2><p>Search current clan membership and both leaderboards.</p></div></div><input className="nz4-search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search player name…" autoFocus />{queryBusy && <div className="nz4-search-status">SEARCHING…</div>}{searchData && <div className="nz4-search-grid"><div><b>CLAN MEMBERS</b>{(searchData.members || []).map((row, i) => <div key={`${row.member_id}-${i}`} className="nz4-search-row"><span>{row.name}</span><em>{row.clan_id} · L{row.level} · {fmt(row.reputation)} REP</em></div>)}</div><div><b>PVE</b>{(searchData.pve || []).map((row, i) => <div key={`pve-${i}`} className="nz4-search-row"><span>#{row.rank} {row.player_name}</span><em>{fmt(row.score)} score</em></div>)}</div><div><b>PVP</b>{(searchData.pvp || []).map((row, i) => <div key={`pvp-${i}`} className="nz4-search-row"><span>#{row.rank} {row.player_name}</span><em>{fmt(row.score)} · {row.wins}/{row.losses}</em></div>)}</div><div><b>HISTORY</b><div className="nz4-history-summary">PVE points: {(searchData.history?.pve || []).length} · PVP points: {(searchData.history?.pvp || []).length}</div></div></div>}</section>}

      {tab === 'ops' && <section className="nz4-panel"><div className="nz4-toolbar"><div><span className="nz4-kicker">OPERATIONS</span><h2>SYNC HEALTH</h2><p>Independent source states, freshness, and failures.</p></div><button className="nz4-btn" onClick={refresh}>FORCE REFRESH</button></div><div className="nz4-status-grid">{sourceEntries.map(([name, source]) => <div key={name} className={statusClass(source?.status)}><span>{name.toUpperCase()}</span><b>{String(source?.status || 'unknown').toUpperCase()}</b><small>{source?.error || `${source?.rows ?? source?.clans ?? 0} rows`}</small></div>)}</div><div className="nz4-ops-details"><div><span>LAST SYNC</span><b>{dataStatus?.lastRunAt ? new Date(dataStatus.lastRunAt).toLocaleString() : '—'}</b></div><div><span>FRESHNESS</span><b>{ageText(dataStatus?.ageSeconds)}</b></div><div><span>CLANS</span><b>{dataStatus?.clans ?? 0}</b></div><div><span>PLAYERS</span><b>{dataStatus?.members ?? 0}</b></div><div><span>FAILED MEMBER REQUESTS</span><b>{dataStatus?.memberErrors ?? 0}</b></div><div><span>DURABLE</span><b>{dataStatus?.durable ? 'YES' : 'NO'}</b></div></div>{dataStatus?.error && <div className="nz4-error-box"><b>LAST ERROR</b><span>{dataStatus.error}</span></div>}</section>}

      {selected && <div className="nz4-modal-bg" onMouseDown={(e) => e.target === e.currentTarget && setSelected(null)}><div className="nz4-modal"><div className="nz4-modal-head"><div><span className="nz4-kicker">CLAN PROFILE</span><h2>#{selectedRow?.rank} {selectedRow?.clan}</h2><p>{selectedRow?.master || '—'} · {selectedRow?.memberCurrent}/{selectedRow?.memberMax} · {fmt(selectedRow?.reputation)} REP</p></div><button className="nz4-btn" onClick={() => setSelected(null)}>CLOSE</button></div><ClanIntelligence clan={selectedRow} rows={intelRows} intel={intel} events={events} alerts={alerts} periodHours={periodHours} setPeriodHours={setPeriodHours} eventFilter={eventFilter} setEventFilter={setEventFilter} /></div></div>}

      <footer className="nz4-footer"><span>Independent game-data tracker</span><span>Source: ninjazenshin.online</span><span>{new Date(clock).toLocaleTimeString()}</span></footer>

      <style jsx global>{`
        :root{--nz4-bg:#07090c;--nz4-panel:#0d1117;--nz4-panel2:#10161d;--nz4-line:#27313b;--nz4-text:#f5f7fa;--nz4-muted:#9da8b5;--nz4-accent:#e6edf3;--nz4-good:#56d364;--nz4-warn:#d29922;--nz4-bad:#f85149}
        .nz4-app{min-height:100vh;background:radial-gradient(circle at 50% -10%,#151b24 0,#07090c 38%);color:var(--nz4-text);font:600 16px/1.35 ui-monospace,SFMono-Regular,Menlo,monospace;padding:16px;display:flex;flex-direction:column;gap:10px}
        .nz4-head{display:flex;justify-content:space-between;align-items:center;gap:12px;border:1px solid var(--nz4-line);background:rgba(13,17,23,.96);padding:14px 16px;border-radius:12px}.nz4-brand{display:flex;align-items:center;gap:12px}.nz4-icon{font-size:32px}.nz4-brand h1,.nz4-toolbar h2,.nz4-modal h2{margin:0;font-size:clamp(22px,2.4vw,34px);letter-spacing:.02em}.nz4-brand p,.nz4-toolbar p,.nz4-modal p{margin:3px 0 0;color:var(--nz4-muted);font-size:12px}.nz4-head-status{display:flex;align-items:center;gap:8px;flex-wrap:wrap;font-size:13px;color:var(--nz4-muted)}.nz4-live-dot{width:10px;height:10px;border-radius:999px;background:var(--nz4-good);box-shadow:0 0 0 4px rgba(86,211,100,.1)}.nz4-live-dot.warn{background:var(--nz4-warn)}.nz4-live-dot.bad{background:var(--nz4-bad)}
        .nz4-tabs{display:flex;gap:6px;overflow:auto}.nz4-tabs button,.nz4-btn{border:1px solid var(--nz4-line);background:#111820;color:var(--nz4-text);border-radius:8px;padding:10px 13px;font:inherit;font-size:12px;cursor:pointer;text-decoration:none}.nz4-tabs button.active,.nz4-btn:hover{background:#1b242e;border-color:#465260}.nz4-alert{padding:10px 12px;border-radius:8px;border:1px solid var(--nz4-warn);background:rgba(210,153,34,.09);font-size:13px}.nz4-alert.bad{border-color:var(--nz4-bad);background:rgba(248,81,73,.08)}
        .nz4-panel{min-height:0;flex:1;border:1px solid var(--nz4-line);background:rgba(13,17,23,.96);border-radius:12px;padding:14px;display:flex;flex-direction:column;gap:12px}.nz4-toolbar{display:flex;justify-content:space-between;gap:12px;align-items:center}.nz4-kicker{font-size:10px;color:var(--nz4-muted);letter-spacing:.15em}.nz4-actions{display:flex;gap:6px;flex-wrap:wrap}.nz4-actions select,.nz4-compare select{background:#0b1016;color:var(--nz4-text);border:1px solid var(--nz4-line);border-radius:8px;padding:9px;font:inherit;font-size:12px}.nz4-source-strip{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:7px}.nz4-source{display:flex;flex-direction:column;gap:2px;border:1px solid var(--nz4-line);padding:8px;border-radius:8px;background:#0b1016}.nz4-source i{width:8px;height:8px;border-radius:50%;background:var(--nz4-muted)}.nz4-source.success i{background:var(--nz4-good)}.nz4-source.partial i,.nz4-source.delayed i{background:var(--nz4-warn)}.nz4-source.failed i,.nz4-source.error i{background:var(--nz4-bad)}.nz4-source b{font-size:11px}.nz4-source em{font-style:normal;color:var(--nz4-muted);font-size:10px}.nz4-table-wrap{overflow:auto;min-height:0}.nz4-table-wrap table{width:100%;border-collapse:collapse}.nz4-table-wrap th,.nz4-table-wrap td{padding:10px 8px;border-bottom:1px solid #202934;text-align:left;white-space:nowrap}.nz4-table-wrap th{position:sticky;top:0;background:#0d1117;color:#8f9aa6;font-size:11px;z-index:1}.nz4-table-wrap td{font-size:14px}.nz4-table-wrap tr:hover{background:#121a22}.rank{font-weight:900}.nz4-clan{background:none;border:0;color:var(--nz4-text);font:inherit;cursor:pointer;padding:0}.nz4-move{font-size:12px;color:var(--nz4-muted)}.nz4-move.up{color:var(--nz4-good)}.nz4-move.down{color:var(--nz4-bad)}.nz4-delta{color:var(--nz4-good);font-size:11px}.nz4-empty,.nz4-note,.nz4-search-status,.nz4-history-summary{padding:12px;border:1px dashed var(--nz4-line);border-radius:8px;color:var(--nz4-muted);font-size:12px}.nz4-compare{display:grid;grid-template-columns:1.3fr 1fr 1fr auto;gap:7px;align-items:center;border-top:1px solid var(--nz4-line);padding-top:12px}.nz4-compare>div:first-child{display:flex;flex-direction:column}.nz4-compare small{color:var(--nz4-muted);font-size:10px}.nz4-compare-result{grid-column:1/-1;display:flex;gap:12px;flex-wrap:wrap;color:var(--nz4-muted);font-size:12px}.nz4-compare-result b{color:var(--nz4-text)}
        .nz4-board-meta{display:flex;gap:10px;align-items:center;color:var(--nz4-muted);font-size:12px}.nz4-board-meta b{color:var(--nz4-text);font-size:15px}.nz4-search{width:100%;box-sizing:border-box;background:#0a0f14;border:1px solid var(--nz4-line);color:var(--nz4-text);border-radius:9px;padding:14px 15px;font:inherit;font-size:18px}.nz4-search-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:9px}.nz4-search-grid>div{border:1px solid var(--nz4-line);border-radius:8px;padding:10px;background:#0b1016}.nz4-search-grid>div>b{font-size:11px}.nz4-search-row{display:flex;flex-direction:column;gap:2px;padding:7px 0;border-bottom:1px solid #202934;font-size:12px}.nz4-search-row:last-child{border-bottom:0}.nz4-search-row em{color:var(--nz4-muted);font-style:normal;font-size:10px}
        .nz4-status-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px}.nz4-status-grid .nz4-source{min-height:80px}.nz4-status-grid .nz4-source span{color:var(--nz4-muted);font-size:10px}.nz4-status-grid .nz4-source b{font-size:17px}.nz4-status-grid .nz4-source small{color:var(--nz4-muted);font-size:10px}.nz4-ops-details{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}.nz4-ops-details>div{border:1px solid var(--nz4-line);border-radius:8px;padding:10px;background:#0b1016;display:flex;flex-direction:column;gap:3px}.nz4-ops-details span{color:var(--nz4-muted);font-size:10px}.nz4-ops-details b{font-size:13px}.nz4-error-box{display:flex;gap:10px;flex-direction:column;border:1px solid var(--nz4-bad);background:rgba(248,81,73,.08);padding:10px;border-radius:8px}.nz4-error-box span{color:#ffd9d7;font-size:12px}
        .nz4-modal-bg{position:fixed;inset:0;background:rgba(0,0,0,.72);display:flex;align-items:center;justify-content:center;padding:12px;z-index:50}.nz4-modal{width:min(1280px,100%);max-height:92vh;overflow:auto;background:#090c10;border:1px solid var(--nz4-line);border-radius:12px;padding:14px;box-shadow:0 24px 100px rgba(0,0,0,.55)}.nz4-modal-head{display:flex;justify-content:space-between;gap:10px;align-items:center;margin-bottom:6px}.nz4-footer{display:flex;justify-content:space-between;color:#6f7b87;font-size:10px;padding:2px 4px}
        @media(max-width:900px){.nz4-head{align-items:flex-start;flex-direction:column}.nz4-source-strip,.nz4-status-grid,.nz4-search-grid,.nz4-ops-details{grid-template-columns:repeat(2,minmax(0,1fr))}.nz4-compare{grid-template-columns:1fr 1fr}.nz4-compare>div:first-child{grid-column:1/-1}.nz4-table-wrap th,.nz4-table-wrap td{padding:8px 6px}.nz4-table-wrap td{font-size:13px}.nz4-brand h1{font-size:22px}}
        @media(max-width:560px){.nz4-app{padding:8px}.nz4-source-strip,.nz4-status-grid,.nz4-search-grid,.nz4-ops-details,.nz4-compare{grid-template-columns:1fr}.nz4-tabs button{flex:1}.nz4-footer{flex-direction:column;gap:2px}.nz4-head-status{font-size:11px}}
      `}</style>
    </main>
  );
}
