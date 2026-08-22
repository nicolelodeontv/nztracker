'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

const REFRESH_MS = 30000;

function formatNumber(value) {
  return new Intl.NumberFormat('en-US').format(Number(value || 0));
}

export default function Home() {
  const [rows, setRows] = useState([]);
  const [season, setSeason] = useState('Season 2');
  const [updatedAt, setUpdatedAt] = useState(null);
  const [sourceUpdatedAt, setSourceUpdatedAt] = useState(null);
  const [status, setStatus] = useState('loading');
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState('rank');
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [countdown, setCountdown] = useState(30);
  const [previous, setPrevious] = useState({});

  const load = useCallback(async (silent = false) => {
    try {
      if (!silent) setStatus('loading');
      const res = await fetch('/api/clan-ranking', { cache: 'no-store' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setRows(current => {
        const snapshot = {};
        for (const r of current) snapshot[r.clan] = r.rank;
        if (Object.keys(snapshot).length) setPrevious(snapshot);
        return data.rows;
      });
      setSeason(data.season || 'Season 2');
      setUpdatedAt(new Date());
      setSourceUpdatedAt(data.fetchedAt ? new Date(data.fetchedAt) : null);
      setStatus('live');
      setCountdown(30);
    } catch {
      setStatus('error');
    }
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (!autoRefresh) return;
    const timer = setInterval(() => load(true), REFRESH_MS);
    return () => clearInterval(timer);
  }, [autoRefresh, load]);
  useEffect(() => {
    if (!autoRefresh) return;
    const timer = setInterval(() => setCountdown(v => v <= 1 ? 30 : v - 1), 1000);
    return () => clearInterval(timer);
  }, [autoRefresh]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    let data = q ? rows.filter(r => `${r.clan} ${r.master}`.toLowerCase().includes(q)) : [...rows];
    if (sort === 'reputation') data.sort((a,b) => b.reputation - a.reputation);
    else if (sort === 'members') data.sort((a,b) => b.memberCurrent - a.memberCurrent);
    else data.sort((a,b) => a.rank - b.rank);
    return data;
  }, [rows, query, sort]);

  const leader = rows[0];
  const totalMembers = rows.reduce((a, r) => a + r.memberCurrent, 0);
  const totalSlots = rows.reduce((a, r) => a + r.memberMax, 0);
  const averageRep = rows.length ? Math.round(rows.reduce((a, r) => a + r.reputation, 0) / rows.length) : 0;

  return (
    <main className="shell">
      <header className="hero">
        <div>
          <div className="eyebrow"><span className={`dot ${status}`} /> NINJA ZENSHIN // LIVE TRACKER</div>
          <h1>Clan Ranking</h1>
          <p>Real-time reputation tracking for <strong>{season}</strong>.</p>
        </div>
        <div className="controls">
          <button className="refresh" onClick={() => load()} aria-label="Refresh now">↻ Refresh</button>
          <button className={`toggle ${autoRefresh ? 'on' : ''}`} onClick={() => setAutoRefresh(v => !v)}>
            <span className="switch" /> Auto {autoRefresh ? 'ON' : 'OFF'}
          </button>
        </div>
      </header>

      <section className="stats">
        <Stat label="CURRENT #1" value={leader?.clan || '—'} sub={leader ? `${formatNumber(leader.reputation)} reputation` : 'Loading'} />
        <Stat label="TRACKED CLANS" value={rows.length || '—'} sub="Top 100 shown by source" />
        <Stat label="MEMBERS" value={rows.length ? `${formatNumber(totalMembers)} / ${formatNumber(totalSlots)}` : '—'} sub={totalSlots ? `${Math.round(totalMembers / totalSlots * 100)}% capacity` : 'Loading'} />
        <Stat label="AVG. REPUTATION" value={rows.length ? formatNumber(averageRep) : '—'} sub="Across tracked clans" />
      </section>

      <section className="toolbar">
        <div className="search"><span>⌕</span><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search clan or master..." /></div>
        <div className="selectWrap"><span>Sort</span><select value={sort} onChange={e => setSort(e.target.value)}><option value="rank">Rank</option><option value="reputation">Reputation</option><option value="members">Members</option></select></div>
        <div className="updated">{status === 'error' ? 'Connection error' : updatedAt ? `Updated ${updatedAt.toLocaleTimeString()}` : 'Connecting...'} {autoRefresh && <span>• next {countdown}s</span>}</div>
      </section>

      <section className="tableCard">
        <div className="tableHead"><span>RANK</span><span>CLAN</span><span>MASTER</span><span>MEMBERS</span><span>REPUTATION</span><span>Δ</span></div>
        <div className="rows">
          {!filtered.length && <div className="empty">No clans match your search.</div>}
          {filtered.map(row => <ClanRow key={`${row.rank}-${row.clan}`} row={row} previous={previous[row.clan]} />)}
        </div>
      </section>

      <footer>
        <span>Source: ninjazenshin.online/?panel=clan-ranking</span>
        <span>Server fetch: {sourceUpdatedAt ? sourceUpdatedAt.toLocaleTimeString() : '—'} · Refresh interval: 30s</span>
      </footer>
    </main>
  );
}

function Stat({ label, value, sub }) {
  return <div className="stat"><div className="label">{label}</div><div className="statValue">{value}</div><div className="sub">{sub}</div></div>;
}

function ClanRow({ row, previous }) {
  const delta = previous ? previous - row.rank : 0;
  const movement = delta > 0 ? 'up' : delta < 0 ? 'down' : 'same';
  const pct = row.memberMax ? Math.round(row.memberCurrent / row.memberMax * 100) : 0;
  return <div className="tableRow">
    <div className={`rank r${row.rank}`}>{row.rank <= 3 ? ['♛','◆','◆'][row.rank - 1] : `#${row.rank}`}</div>
    <div className="clan"><strong>{row.clan}</strong><div className="bar"><i style={{ width: `${Math.min(pct,100)}%` }} /></div></div>
    <div className="master">{row.master || '—'}</div>
    <div className="members">{row.memberCurrent}/{row.memberMax}</div>
    <div className="rep">{formatNumber(row.reputation)}</div>
    <div className={`movement ${movement}`}>{movement === 'up' ? `↑ ${delta}` : movement === 'down' ? `↓ ${Math.abs(delta)}` : '—'}</div>
  </div>;
}
