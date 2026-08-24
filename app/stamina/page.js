'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import './stamina.css';

const REFRESH_MS = 5000;
const fmt = (n) => new Intl.NumberFormat('en-US').format(Number(n || 0));

function stateFor(member) {
  if (member?.stamina == null || member?.maxStamina == null) return { label: 'UNKNOWN', className: 'unknown' };
  const stamina = Number(member.stamina);
  const max = Number(member.maxStamina);
  if (!Number.isFinite(stamina) || !Number.isFinite(max) || max <= 0) return { label: 'UNKNOWN', className: 'unknown' };
  if (stamina <= max * 0.5) return { label: 'DRAIN FLOOR', className: 'critical' };
  if (stamina <= max * 0.7) return { label: 'BLEEDING', className: 'bleeding' };
  return { label: 'SAFE', className: 'safe' };
}

export default function StaminaPage() {
  const [rows, setRows] = useState([]);
  const [clanId, setClanId] = useState('');
  const [clanName, setClanName] = useState('');
  const [status, setStatus] = useState('waiting');
  const [updated, setUpdated] = useState(null);
  const [autoRefresh, setAutoRefresh] = useState(true);

  const load = useCallback(async () => {
    if (!clanId) return;
    setStatus('loading');
    try {
      const response = await fetch(`/api/clan-members?clanId=${encodeURIComponent(clanId)}&t=${Date.now()}`, { cache: 'no-store' });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      setRows(Array.isArray(data.members) ? data.members : []);
      setClanName(data.clanName || clanName || `Clan ${clanId}`);
      setUpdated(new Date(data.fetchedAt || Date.now()));
      setStatus('live');
    } catch {
      setStatus('error');
    }
  }, [clanId, clanName]);

  useEffect(() => {
    if (!autoRefresh || !clanId) return undefined;
    const timer = setInterval(load, REFRESH_MS);
    return () => clearInterval(timer);
  }, [autoRefresh, clanId, load]);

  const stats = useMemo(() => {
    const known = rows.filter((m) => m.stamina != null && m.maxStamina != null);
    const bleeding = known.filter((m) => Number(m.stamina) <= Number(m.maxStamina) * 0.7);
    const critical = known.filter((m) => Number(m.stamina) <= Number(m.maxStamina) * 0.5);
    return { known: known.length, bleeding: bleeding.length, critical: critical.length, unknown: rows.length - known.length };
  }, [rows]);

  return <main className="stamina-page">
    <header className="stamina-header">
      <div>
        <div className="eyebrow">NINJA ZENSHIN // CLAN WAR</div>
        <h1>Stamina Monitor</h1>
        <p>Track member stamina and identify Bleeding targets without inventing unavailable data.</p>
      </div>
      <div className="header-actions">
        <span className={`status ${status}`}>● {status.toUpperCase()}</span>
        <label className="refresh-toggle"><input type="checkbox" checked={autoRefresh} onChange={(e) => setAutoRefresh(e.target.checked)} /> Auto</label>
      </div>
    </header>

    <section className="controls">
      <input value={clanId} onChange={(e) => setClanId(e.target.value.replace(/\D/g, ''))} placeholder="Enter clan ID" inputMode="numeric" />
      <button onClick={load} disabled={!clanId}>↻ Load stamina</button>
    </section>

    <section className="summary">
      <article><span>CLAN</span><strong>{clanName || '—'}</strong></article>
      <article><span>MEMBERS</span><strong>{rows.length || '—'}</strong></article>
      <article><span>BLEEDING</span><strong>{stats.bleeding || '—'}</strong></article>
      <article><span>CRITICAL</span><strong>{stats.critical || '—'}</strong></article>
      <article><span>UNKNOWN</span><strong>{stats.unknown || '—'}</strong></article>
    </section>

    <section className="panel">
      <div className="panel-head"><div><div className="eyebrow">MEMBER STAMINA</div><h2>{clanName || 'Select a clan'}</h2></div><small>{updated ? `Updated ${updated.toLocaleTimeString()}` : 'No data yet'}</small></div>
      <div className="table-wrap">
        <table>
          <thead><tr><th>MEMBER</th><th>STAMINA</th><th>MAX</th><th>70% THRESHOLD</th><th>50% FLOOR</th><th>STATUS</th></tr></thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan="6" className="empty">Enter a clan ID to load member stamina.</td></tr>}
            {rows.map((member) => {
              const state = stateFor(member);
              const stamina = Number(member.stamina);
              const max = Number(member.maxStamina);
              const percent = Number.isFinite(stamina) && Number.isFinite(max) && max > 0 ? Math.max(0, Math.min(100, stamina / max * 100)) : null;
              return <tr key={member.name}>
                <td><b>{member.name}</b><small>Lv. {fmt(member.level)}</small></td>
                <td>{member.stamina == null ? '—' : `${fmt(member.stamina)}${percent == null ? '' : ` (${percent.toFixed(0)}%)`}`}</td>
                <td>{member.maxStamina == null ? '—' : fmt(member.maxStamina)}</td>
                <td>{member.bleedingThreshold == null ? '—' : fmt(member.bleedingThreshold)}</td>
                <td>{member.drainFloor == null ? '—' : fmt(member.drainFloor)}</td>
                <td><span className={`state ${state.className}`}>{state.label}</span></td>
              </tr>;
            })}
          </tbody>
        </table>
      </div>
    </section>

    <footer>Bleeding = ≤70% of maximum stamina · Drain Floor = ≤50% · Unknown means the source did not expose authoritative stamina.</footer>
  </main>;
}
