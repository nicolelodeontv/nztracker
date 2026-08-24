'use client';

import { useEffect, useMemo, useState } from 'react';
import './war-stamina-monitor.css';

const fmt = (n) => Number(n || 0).toLocaleString('en-US');
const MAX_HISTORY = 60;

function metricsFor(member) {
  const current = Number(member?.stamina);
  const max = Number(member?.maxStamina);
  if (!Number.isFinite(current) || !Number.isFinite(max) || max <= 0) return { percent: null, state: { label: 'UNKNOWN', className: 'unknown' } };
  const percent = Math.max(0, Math.min(100, current / max * 100));
  if (percent <= 50) return { percent, state: { label: 'DRAIN FLOOR', className: 'critical' } };
  if (percent <= 70) return { percent, state: { label: 'BLEEDING', className: 'bleeding' } };
  return { percent, state: { label: 'SAFE', className: 'safe' } };
}

function targetScore(member) {
  const { percent } = metricsFor(member);
  if (percent === null) return -1;
  const staminaScore = Math.max(0, 100 - percent);
  const reputation = Number(member?.reputation || 0);
  return staminaScore * 10 + Math.min(100, Math.log10(Math.max(1, reputation)) * 12);
}

function targetMeta(member) {
  const { percent } = metricsFor(member);
  if (percent === null) return { label: 'UNKNOWN DATA', className: 'unknown' };
  if (percent <= 50) return { label: 'CRITICAL', className: 'critical' };
  if (percent <= 70) return { label: 'HIGH PRIORITY', className: 'bleeding' };
  if (percent <= 80) return { label: 'WATCH', className: 'watch' };
  return { label: 'LOW PRIORITY', className: 'safe' };
}

export default function WarStaminaMonitor({ rows }) {
  const [selectedClan, setSelectedClan] = useState('');
  const [members, setMembers] = useState([]);
  const [status, setStatus] = useState('idle');
  const [updated, setUpdated] = useState(null);
  const [history, setHistory] = useState({});
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
        const next = Array.isArray(data.members) ? data.members : [];
        const at = Date.now();
        setMembers(next);
        setHistory((current) => {
          const nextHistory = { ...current };
          next.forEach((member) => {
            const { percent } = metricsFor(member);
            if (percent === null) return;
            const samples = [...(nextHistory[member.name] || []), { at, percent, stamina: Number(member.stamina), maxStamina: Number(member.maxStamina), reputation: Number(member.reputation || 0) }];
            nextHistory[member.name] = samples.slice(-MAX_HISTORY);
          });
          return nextHistory;
        });
        setUpdated(new Date(data.fetchedAt || Date.now()));
        setStatus('live');
      } catch {
        if (active) setStatus('error');
      }
    };
    load();
    const timer = setInterval(load, 5000);
    return () => { active = false; clearInterval(timer); };
  }, [selected?.clanId, selected?.clan]);

  const stats = useMemo(() => {
    const known = members.filter((member) => metricsFor(member).percent !== null);
    const bleeding = known.filter((member) => metricsFor(member).percent <= 70);
    const critical = known.filter((member) => metricsFor(member).percent <= 50);
    const avg = known.length ? known.reduce((sum, member) => sum + metricsFor(member).percent, 0) / known.length : null;
    return { known: known.length, bleeding: bleeding.length, critical: critical.length, unknown: members.length - known.length, avg };
  }, [members]);

  const bestTargets = useMemo(() => members.map((member) => ({ ...member, score: targetScore(member), meta: targetMeta(member) })).filter((member) => member.score >= 0).sort((a, b) => b.score - a.score).slice(0, 3), [members]);
  const timelineMember = useMemo(() => [...members].sort((a, b) => targetScore(b) - targetScore(a))[0] || null, [members]);
  const timeline = timelineMember ? (history[timelineMember.name] || []) : [];
  const timelineDelta = timeline.length > 1 ? timeline[timeline.length - 1].percent - timeline[0].percent : 0;

  return <section className="war-panel war-stamina-panel">
    <div className="war-panel-head">
      <div><small>LIVE MEMBER DATA</small><h2>🩸 Stamina Command Center</h2></div>
      <span>{status === 'live' ? `LIVE · ${updated?.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}` : status.toUpperCase()}</span>
    </div>

    <div className="stamina-toolbar">
      <select value={selected?.clan || ''} onChange={(event) => setSelectedClan(event.target.value)}>
        {rows.filter((row) => row.clanId).map((row) => <option key={row.clan} value={row.clan}>{row.clan}</option>)}
      </select>
      <div className="stamina-summary">
        <div><b>{stats.bleeding}</b><small>BLEEDING</small></div>
        <div><b>{stats.critical}</b><small>DRAIN FLOOR</small></div>
        <div><b>{stats.unknown}</b><small>UNKNOWN</small></div>
        <div><b>{stats.avg == null ? '—' : `${Math.round(stats.avg)}%`}</b><small>AVG STAMINA</small></div>
      </div>
    </div>

    <div className="stamina-command-grid">
      <div className="stamina-block">
        <div className="stamina-block-head"><div><small>TARGET SELECTION</small><h3>Best Targets</h3></div><span>STAMINA + REPUTATION</span></div>
        {bestTargets.length === 0 && <div className="war-empty">No authoritative stamina data available.</div>}
        {bestTargets.map((member, index) => <div className="target-row" key={member.name}>
          <span className="target-rank">#{index + 1}</span>
          <div className="target-main"><b>{member.name}</b><small>{fmt(member.reputation)} REP · {Math.round(metricsFor(member).percent)}% stamina</small></div>
          <span className={`target-priority ${member.meta.className}`}>{member.meta.label}</span>
        </div>)}
        <div className="stamina-rule-note">Recommendations are advisory only. Unknown stamina never authorizes an attack.</div>
      </div>

      <div className="stamina-block">
        <div className="stamina-block-head"><div><small>LIVE TREND</small><h3>Stamina Timeline</h3></div><span>{timelineMember?.name || 'NO TARGET'}</span></div>
        {timeline.length < 2 ? <div className="war-empty">Collecting samples… timeline appears after two live readings.</div> : <>
          <div className="timeline-chart">
            <div className="timeline-labels"><span>100%</span><span>70%</span><span>50%</span><span>0%</span></div>
            <svg viewBox="0 0 600 160" preserveAspectRatio="none" role="img" aria-label={`Stamina timeline for ${timelineMember.name}`}>
              <polyline points={timeline.map((sample, index) => `${index * (600 / Math.max(1, timeline.length - 1))},${160 - (sample.percent / 100) * 150}`).join(' ')} fill="none" stroke="currentColor" strokeWidth="3" vectorEffect="non-scaling-stroke" />
            </svg>
          </div>
          <div className="timeline-stats"><b>{Math.round(timeline[timeline.length - 1].percent)}%</b><span>{timelineDelta <= 0 ? `${Math.abs(Math.round(timelineDelta))}% down` : `+${Math.round(timelineDelta)}% up`} since first sample</span><span>{fmt(timeline[timeline.length - 1].stamina)} / {fmt(timeline[timeline.length - 1].maxStamina)}</span></div>
        </>}
      </div>
    </div>

    <div className="stamina-member-list">
      <div className="stamina-list-head"><span>MEMBER</span><span>STAMINA</span><span>STATE</span><span>REP</span></div>
      {members.length === 0 && <div className="war-empty">{status === 'loading' ? 'Fetching authoritative stamina…' : 'No authoritative member stamina available.'}</div>}
      {members.map((member) => {
        const { percent, state } = metricsFor(member);
        return <div className="stamina-member-row" key={member.name}>
          <div><b>{member.name}</b><small>Lv. {member.level || '—'}</small></div>
          <div className="stamina-meter"><i style={{ width: `${percent ?? 0}%` }} /><span>{percent == null ? 'UNKNOWN' : `${fmt(member.stamina)} / ${fmt(member.maxStamina)} · ${Math.round(percent)}%`}</span></div>
          <span className={`stamina-state ${state.className}`}>{state.label}</span>
          <span className="stamina-rep">{fmt(member.reputation)}</span>
        </div>;
      })}
    </div>
    <div className="stamina-rule-note">Bleeding ≤ 70% · Drain Floor ≤ 50% · Best Targets balance lower stamina with higher reputation · refreshes every 5s.</div>
  </section>;
}
