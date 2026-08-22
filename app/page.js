'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

const REFRESH_MS = 30000;
const HISTORY_KEY = 'nztracker-history-v1';
const FAVORITES_KEY = 'nztracker-favorites-v1';

function formatNumber(value) {
  return new Intl.NumberFormat('en-US').format(Number(value || 0));
}

function formatTime(value) {
  return value ? new Date(value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '—';
}

export default function Home() {
  const [rows, setRows] = useState([]);
  const [season, setSeason] = useState('Season 2');
  const [updatedAt, setUpdatedAt] = useState(null);
  const [status, setStatus] = useState('loading');
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState('rank');
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [countdown, setCountdown] = useState(30);
  const [previous, setPrevious] = useState({});
  const [history, setHistory] = useState([]);
  const [favorites, setFavorites] = useState([]);
  const [showFavorites, setShowFavorites] = useState(false);
  const [selectedClan, setSelectedClan] = useState(null);
  const [notifications, setNotifications] = useState(false);

  useEffect(() => {
    try {
      setHistory(JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]'));
      setFavorites(JSON.parse(localStorage.getItem(FAVORITES_KEY) || '[]'));
    } catch {}
  }, []);

  const saveHistory = useCallback((snapshot) => {
    setHistory(current => {
      const next = [...current, snapshot].slice(-240);
      try { localStorage.setItem(HISTORY_KEY, JSON.stringify(next)); } catch {}
      return next;
    });
  }, []);

  const load = useCallback(async (silent = false) => {
    try {
      if (!silent) setStatus('loading');
      const res = await fetch('/api/clan-ranking', { cache: 'no-store' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const now = new Date().toISOString();
      setRows(current => {
        const snapshot = {};
        for (const r of current) snapshot[r.clan] = r.rank;
        if (Object.keys(snapshot).length) setPrevious(snapshot);
        if (data.rows?.length) saveHistory({ capturedAt: now, season: data.season, rows: data.rows });

        if (notifications && 'Notification' in window && Notification.permission === 'granted') {
          const changes = current.filter(old => {
            const fresh = data.rows.find(r => r.clan === old.clan);
            return fresh && fresh.rank !== old.rank;
          });
          changes.slice(0, 3).forEach(old => {
            const fresh = data.rows.find(r => r.clan === old.clan);
            new Notification('Ninja Zenshin rank change', { body: `${fresh.clan}: #${old.rank} → #${fresh.rank}` });
          });
        }
        return data.rows || [];
      });
      setSeason(data.season || 'Season 2');
      setUpdatedAt(new Date(now));
      setStatus('live');
      setCountdown(30);
    } catch {
      setStatus('error');
    }
  }, [notifications, saveHistory]);

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
    if (showFavorites) data = data.filter(r => favorites.includes(r.clan));
    if (sort === 'reputation') data.sort((a,b) => b.reputation - a.reputation);
    else if (sort === 'members') data.sort((a,b) => b.memberCurrent - a.memberCurrent);
    else data.sort((a,b) => a.rank - b.rank);
    return data;
  }, [rows, query, sort, showFavorites, favorites]);

  const leader = rows[0];
  const totalMembers = rows.reduce((a, r) => a + r.memberCurrent, 0);
  const totalSlots = rows.reduce((a, r) => a + r.memberMax, 0);
  const averageRep = rows.length ? Math.round(rows.reduce((a, r) => a + r.reputation, 0) / rows.length) : 0;
  const selected = selectedClan ? rows.find(r => r.clan === selectedClan) : leader;
  const selectedHistory = history.filter(h => h.rows?.some(r => r.clan === selected?.clan)).slice(-36);
  const selectedPoints = selectedHistory.map(h => h.rows.find(r => r.clan === selected.clan)?.reputation).filter(v => typeof v === 'number');
  const historyMin = selectedPoints.length ? Math.min(...selectedPoints) : 0;
  const historyMax = selectedPoints.length ? Math.max(...selectedPoints) : 1;
  const path = selectedPoints.map((value, i) => {
    const x = selectedPoints.length <= 1 ? 0 : (i / (selectedPoints.length - 1)) * 100;
    const y = 92 - ((value - historyMin) / Math.max(1, historyMax - historyMin)) * 80;
    return `${x.toFixed(2)},${y.toFixed(2)}`;
  }).join(' ');

  function toggleFavorite(clan) {
    setFavorites(current => {
      const next = current.includes(clan) ? current.filter(v => v !== clan) : [...current, clan];
      try { localStorage.setItem(FAVORITES_KEY, JSON.stringify(next)); } catch {}
      return next;
    });
  }

  async function enableNotifications() {
    if (!('Notification' in window)) return;
    const permission = await Notification.requestPermission();
    setNotifications(permission === 'granted');
  }

  function exportHistory() {
    const blob = new Blob([JSON.stringify(history, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `ninja-zenshin-history-${new Date().toISOString().slice(0,10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <main className="shell">
      <header className="hero">
        <div>
          <div className="eyebrow"><span className={`dot ${status}`} /> NINJA ZENSHIN // LIVE TRACKER</div>
          <h1>Clan Ranking</h1>
          <p>Live reputation monitoring for <strong>{season}</strong> with rank movement and history.</p>
        </div>
        <div className="controls">
          <button className="ghost" onClick={enableNotifications}>🔔 {notifications ? 'Alerts ON' : 'Alerts'}</button>
          <button className="ghost" onClick={exportHistory}>⇩ History</button>
          <button className="refresh" onClick={() => load()} aria-label="Refresh now">↻ Refresh</button>
          <button className={`toggle ${autoRefresh ? 'on' : ''}`} onClick={() => setAutoRefresh(v => !v)}>
            <span className="switch" /> Auto {autoRefresh ? 'ON' : 'OFF'}
          </button>
        </div>
      </header>

      <section className="stats">
        <Stat label="CURRENT #1" value={leader?.clan || '—'} sub={leader ? `${formatNumber(leader.reputation)} reputation` : 'Loading'} />
        <Stat label="TRACKED CLANS" value={rows.length || '—'} sub="Live source ranking" />
        <Stat label="MEMBERS" value={rows.length ? `${formatNumber(totalMembers)} / ${formatNumber(totalSlots)}` : '—'} sub={totalSlots ? `${Math.round(totalMembers / totalSlots * 100)}% capacity` : 'Loading'} />
        <Stat label="AVG. REPUTATION" value={rows.length ? formatNumber(averageRep) : '—'} sub="Across tracked clans" />
      </section>

      <section className="toolbar">
        <div className="search"><span>⌕</span><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search clan or master..." /></div>
        <div className="filters">
          <button className={showFavorites ? 'filter active' : 'filter'} onClick={() => setShowFavorites(v => !v)}>★ Favorites {favorites.length ? `(${favorites.length})` : ''}</button>
          <div className="selectWrap"><span>Sort</span><select value={sort} onChange={e => setSort(e.target.value)}><option value="rank">Rank</option><option value="reputation">Reputation</option><option value="members">Members</option></select></div>
        </div>
        <div className="updated">{status === 'error' ? 'Connection error' : updatedAt ? `Updated ${formatTime(updatedAt)}` : 'Connecting...'} {autoRefresh && <span>• next {countdown}s</span>}</div>
      </section>

      <section className="tableCard">
        <div className="tableHead"><span>RANK</span><span>CLAN</span><span>MASTER</span><span>MEMBERS</span><span>REPUTATION</span><span>Δ</span><span>★</span></div>
        <div className="rows">
          {!filtered.length && <div className="empty">No clans match your search.</div>}
          {filtered.map(row => <ClanRow key={`${row.rank}-${row.clan}`} row={row} previous={previous[row.clan]} favorite={favorites.includes(row.clan)} onFavorite={() => toggleFavorite(row.clan)} onSelect={() => setSelectedClan(row.clan)} />)}
        </div>
      </section>

      <section className="analytics">
        <div className="panel">
          <div className="panelTop"><div><div className="panelLabel">REP GAIN</div><h2>{selected?.clan || '—'}</h2></div><div className="metric">{selected ? `#${selected.rank}` : '—'}</div></div>
          <div className="gainGrid">
            <Metric label="CURRENT REP" value={selected ? formatNumber(selected.reputation) : '—'} />
            <Metric label="10-MIN GAIN" value={`${reputationGain(selected, history)} rep`} />
            <Metric label="REP / MIN" value={`${reputationPerMinute(selected, history)} rep`} />
            <Metric label="RANK MOVE" value={selected && previous[selected.clan] ? `${previous[selected.clan] - selected.rank >= 0 ? '+' : ''}${previous[selected.clan] - selected.rank}` : '—'} />
          </div>
        </div>

        <div className="panel chartPanel">
          <div className="panelTop"><div><div className="panelLabel">REPUTATION HISTORY</div><h2>{selected?.clan || 'Select a clan'}</h2></div><div className="tiny">{selectedPoints.length} snapshots</div></div>
          {selectedPoints.length > 1 ? <svg viewBox="0 0 100 100" className="chart" preserveAspectRatio="none"><polyline points={path} fill="none" stroke="var(--accent)" strokeWidth="1.8" vectorEffect="non-scaling-stroke" /></svg> : <div className="chartEmpty">Keep the tracker open to build history automatically.</div>}
          <div className="chartLegend"><span>LOW {formatNumber(historyMin)}</span><span>HIGH {formatNumber(historyMax)}</span></div>
        </div>
      </section>

      <footer>
        <span>Source: ninjazenshin.online/?panel=clan-ranking</span>
        <span>Local history: {history.length} snapshots · Refresh: 30s · Select a row to inspect</span>
      </footer>
    </main>
  );
}

function reputationGain(selected, history) {
  if (!selected) return 0;
  const cutoff = Date.now() - 10 * 60 * 1000;
  const earlier = [...history].reverse().find(h => new Date(h.capturedAt).getTime() <= cutoff && h.rows?.some(r => r.clan === selected.clan));
  const previous = earlier?.rows?.find(r => r.clan === selected.clan);
  return previous ? selected.reputation - previous.reputation : 0;
}

function reputationPerMinute(selected, history) {
  const gain = reputationGain(selected, history);
  return Math.round(gain / 10);
}

function Stat({ label, value, sub }) {
  return <div className="stat"><div className="label">{label}</div><div className="statValue">{value}</div><div className="sub">{sub}</div></div>;
}

function Metric({ label, value }) {
  return <div className="metricCard"><div className="label">{label}</div><div className="metricValue">{value}</div></div>;
}

function ClanRow({ row, previous, favorite, onFavorite, onSelect }) {
  const delta = previous ? previous - row.rank : 0;
  const movement = delta > 0 ? 'up' : delta < 0 ? 'down' : 'same';
  const pct = row.memberMax ? Math.round(row.memberCurrent / row.memberMax * 100) : 0;
  return <div className="tableRow" onClick={onSelect}>
    <div className={`rank r${row.rank}`}>{row.rank <= 3 ? ['♛','◆','◆'][row.rank - 1] : `#${row.rank}`}</div>
    <div className="clan"><strong>{row.clan}</strong><div className="bar"><i style={{ width: `${Math.min(pct,100)}%` }} /></div></div>
    <div className="master">{row.master || '—'}</div>
    <div className="members">{row.memberCurrent}/{row.memberMax}</div>
    <div className="rep">{formatNumber(row.reputation)}</div>
    <div className={`movement ${movement}`}>{movement === 'up' ? `↑ ${delta}` : movement === 'down' ? `↓ ${Math.abs(delta)}` : '—'}</div>
    <button className={favorite ? 'star active' : 'star'} onClick={e => { e.stopPropagation(); onFavorite(); }}>{favorite ? '★' : '☆'}</button>
  </div>;
}
