'use client';

import { useEffect, useMemo, useState } from 'react';
import './war-stamina-monitor.css';

const fmt = (n) => Number(n || 0).toLocaleString('en-US');

function stateFor(member) {
  const current = Number(member?.stamina);
  const max = Number(member?.maxStamina);
  if (!Number.isFinite(current) || !Number.isFinite(max) || max <= 0) return { label: 'UNKNOWN', className: 'unknown' };
  if (current <= max * 0.5) return { label: 'DRAIN FLOOR', className: 'critical' };
  if (current <= max * 0.7) return { label: 'BLEEDING', className: 'bleeding' };
  return { label: 'SAFE', className: 'safe' };
}

export default function WarStaminaMonitor({ rows }) {
  const [selectedClan, setSelectedClan] = useState('');
  const [members, setMembers] = useState([]);
  const [status, setStatus] = useState('idle');
  const [updated, setUpdated] = useState(null);

  const selected = rows.find((row) => row.clan === selectedClan) || rows[0];

  useEffect(() => {
    if (!selected?.clanId) {
      setMembers([]);
      setStatus('unavailable');
      return undefined;
    }
    setSelectedClan((current) => current || selected.clan);
    let active = true;
    const load = async () => {
      setStatus('loading');
      try {
        const response = await fetch(`/api/clan-members?clanId=${encodeURIComponent(selected.clanId)}&t=${Date.now()}`, { cache: 'no-store' });
        if (!response.ok) throw new Error();
        const data = await response.json();
        if (!active) return;
        setMembers(Array.isArray(data.members) ? data.members : []);
        setUpdated(new Date(data.fetchedAt || Date.now()));
        setStatus('live');
      } catch {
        if (active) setStatus('error');
      }
    };
    load();
    const timer = setInterval(load, 5000);
    return () => { active = false; clearInterval(timer); };
  }, [selected?.clanId]);

  const stats = useMemo(() => {
    const known = members.filter((member) => Number.isFinite(Number(member.stamina)) && Number.isFinite(Number(member.maxStamina)) && Number(member.maxStamina) > 0);
    const bleeding = known.filter((member) => Number(member.stamina) <= Number(member.maxStamina) * 0.7);
    const critical = known.filter((member) => Number(member.stamina) <= Number(member.maxStamina) * 0.5);
    return { known: known.length, bleeding: bleeding.length, critical: critical.length, unknown: members.length - known.length };
  }, [members]);

  return <section className="war-panel war-stamina-panel">
    <div className="war-panel-head">
      <div><small>LIVE MEMBER DATA</small><h2>🩸 Stamina Monitor</h2></div>
      <span>{status === 'live' ? `LIVE · ${updated?.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}` : status.toUpperCase()}</span>
    </div>
    <div className="stamina-toolbar">
      <select value={selected?.clan || ''} onChange={(event) => setSelectedClan(event.target.value)}>
        {rows.filter((row) => row.clanId).map((row) => <option key={row.clan} value={row.clan}>{row.clan}</option>)}
      </select>
      <div className="stamina-summary"><b>{stats.bleeding}</b><small>BLEEDING</small><b>{stats.critical}</b><small>DRAIN FLOOR</small><b>{stats.unknown}</b><small>UNKNOWN</small></div>
    </div>
    <div className="stamina-member-list">
      {members.length === 0 && <div className="war-empty">{status === 'loading' ? 'Fetching authoritative stamina…' : 'No authoritative member stamina available.'}</div>}
      {members.map((member) => {
        const state = stateFor(member);
        const current = Number(member.stamina);
        const max = Number(member.maxStamina);
        const percent = Number.isFinite(current) && Number.isFinite(max) && max > 0 ? Math.max(0, Math.min(100, current / max * 100)) : null;
        return <div className="stamina-member-row" key={member.name}>
          <div><b>{member.name}</b><small>Lv. {member.level || '—'}</small></div>
          <div className="stamina-meter"><i style={{ width: `${percent ?? 0}%` }} /><span>{percent == null ? 'UNKNOWN' : `${fmt(current)} / ${fmt(max)}`}</span></div>
          <span className={`stamina-state ${state.className}`}>{state.label}</span>
        </div>;
      })}
    </div>
    <div className="stamina-rule-note">Bleeding ≤ 70% · Drain Floor ≤ 50% · Unknown stamina never authorizes an attack.</div>
  </section>;
}
