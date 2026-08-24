'use client';

import { useEffect, useMemo, useState } from 'react';
import './war-stamina-monitor.css';

const MAX_STAMINA = 200;
const fmt = (n) => Number(n || 0).toLocaleString('en-US');
const MAX_HISTORY = 60;

function metricsFor(member) {
  const rawCurrent = Number(member?.stamina);
  const rawMax = Number(member?.maxStamina);
  const max = Number.isFinite(rawMax) && rawMax > 0 ? rawMax : MAX_STAMINA;
  const current = Number.isFinite(rawCurrent) ? Math.max(0, Math.min(rawCurrent, max)) : max;
  const percent = Math.max(0, Math.min(100, current / max * 100));
  if (percent <= 50) return { current, max, percent, state: { label: 'DRAIN FLOOR', className: 'critical' } };
  if (percent <= 70) return { current, max, percent, state: { label: 'BLEEDING', className: 'bleeding' } };
  return { current, max, percent, state: { label: 'SAFE', className: 'safe' } };
}

function targetScore(member) {
  const { current, percent } = metricsFor(member);
  const staminaScore = Math.max(0, 100 - percent);
  const reputation = Number(member?.reputation || 0);
  return staminaScore * 10 + Math.min(100, Math.log10(Math.max(1, reputation)) * 12) + (current < MAX_STAMINA ? 10 : 0);
}

function targetMeta(member) {
  const { percent } = metricsFor(member);
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
        const next = Array.isArray(data.members) ? nextMembers(data.members) : [];
        const at = Date.now();
        setMembers(next);
        setHistory((current) => {
          const nextHistory = { ...current };
          next.forEach((member) => {
            const { current: stamina, max, percent } = metricsFor(member);
            const sample = { at, stamina, maxStamina: max, percent, reputation: Number(member.reputation || 0) };
            nextHistory[member.name] = [...(nextHistory[member.name] || []), sample].slice(-MAX_HISTORY);
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
    const withPercent = members.map(metricsFor);
    const bleeding = withPercent.filter((member) => member.percent <= 70);
    const critical = withPercent.filter((member) => member.percent <= 50);
    const avg = withPercent.length ? withPercent.reduce((sum, member) => sum + member.percent, 0) / withPercent.length : null;
    return { known: withPercent.length, bleeding: bleeding.length, critical: critical.length, unknown: 0, avg };
  }, [members]);

  const bestTargets = useMemo(() => members.map((member) => ({ ...member, score: targetScore(member), meta: targetMeta(member) })).sort((a, b) => b.score - a.score).slice(0, 3), [members]);
  const timelineMember = useMemo(() => [...members].sort((a, b) => targetScore(b) - targetScore(a))[0] || null, [members]);
  const timeline = timelineMember ? (history[timelineMember.name] || []) : [];
  const first = timeline[0];
  const last = timeline[timeline.length - 1];
  const timelineValue = (sample) => sample?.percent ?? (Number(sample?.stamina || MAX_STAMINA) / MAX_STAMINA) * 100;
  const timelineDelta = timeline.length > 1 ? timelineValue(last) - timelineValue(first) : 0;

  return <section className="war-panel war-stamina-panel">
    <div className="war-panel-head">
      <div><small>GAME MEMBER SERVICE · AMF</small><h2>🩸 Stamina Command Center</h2></div>
      <span>{status === 'live' ? `LIVE · ${updated?.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}` : status.toUpperCase()}</span>
    </div>

    <div className="stamina-toolbar">
      <select value={selected?.clan || ''} onChange={(event) => setSelectedClan(event.target.value)}>
        {rows.filter((row) => row.clanId).map((row) => <option key={row.clan} value={row.clan}>{row.clan}</option>)}
      </select>
      <div className="stamina-summary">
        <div><b>{stats.known}</b><small>STAMINA TRACKED</small></div>
        <div><b>{stats.bleeding}</b><small>BLEEDING</small></div>
        <div><b>{stats.critical}</b><small>DRAIN FLOOR</small></div>
        <div><b>{stats.unknown}</b><small>UNKNOWN</small></div>
        <div><b>{stats.avg == null ? '—' : `${Math.round(stats.avg)}%`}</b><small>AVG % / 200</small></div>
      </div>
    </div>

    <div className="stamina-command-grid">
      <div className="stamina-block">
        <div className="stamina-block-head"><div><small>TARGET SELECTION</small><h3>Best Targets</h3></div><span>200 MAX</span></div>
        {bestTargets.length === 0 && <div className="war-empty">No live stamina data available.</div>}
        {bestTargets.map((member, index) => { const m = metricsFor(member); return <div className="target-row" key={member.name}>
          <span className="target-rank">#{index + 1}</span>
          <div className="target-main"><b>{member.name}</b><small>{fmt(member.reputation)} REP · {fmt(m.current)} / {fmt(m.max)} stamina · {Math.round(m.percent)}%</small></div>
          <span className={`target-priority ${member.meta.className}`}>{member.meta.label}</span>
        </div>; })}
        <div className="stamina-rule-note">Current stamina uses the live game value when available. Missing Max Stamina defaults to 200.</div>
      </div>

      <div className="stamina-block">
        <div className="stamina-block-head"><div><small>LIVE TREND</small><h3>Stamina Timeline</h3></div><span>{timelineMember?.name || 'NO TARGET'}</span></div>
        {timeline.length < 2 ? <div className="war-empty">Collecting live game samples…</div> : <>
          <div className="timeline-chart">
            <div className="timeline-labels"><span>200</span><span>140</span><span>100</span><span>0</span></div>
            <svg viewBox="0 0 600 160" preserveAspectRatio="none" role="img" aria-label={`Stamina timeline for ${timelineMember.name}`}>
              <polyline points={timeline.map((sample, index) => `${index * (600 / Math.max(1, timeline.length - 1))},${160 - (timelineValue(sample) / 100) * 150}`).join(' ')} fill="none" stroke="currentColor" strokeWidth="3" vectorEffect="non-scaling-stroke" />
            </svg>
          </div>
          <div className="timeline-stats"><b>{last.percent == null ? `${fmt(last.stamina)} / ${fmt(last.maxStamina || MAX_STAMINA)}` : `${Math.round(last.percent)}%`}</b><span>{timelineDelta <= 0 ? `${Math.abs(Math.round(timelineDelta))}% down` : `+${Math.round(timelineDelta)}% up`} since first sample</span><span>{fmt(last.stamina)} / {fmt(last.maxStamina || MAX_STAMINA)}</span></div>
        </>}
      </div>
    </div>

    <div className="stamina-member-list">
      <div className="stamina-list-head"><span>MEMBER</span><span>STAMINA</span><span>STATE</span><span>REP</span></div>
      {members.length === 0 && <div className="war-empty">{status === 'loading' ? 'Fetching live game stamina…' : 'No live game member data available.'}</div>}
      {members.map((member) => { const m = metricsFor(member); return <div className="stamina-member-row" key={member.name}>
        <div><b>{member.name}</b><small>Lv. {member.level || '—'}</small></div>
        <div className="stamina-meter"><i style={{ width: `${m.percent}%` }} /><span>{fmt(m.current)} / {fmt(m.max)} · {Math.round(m.percent)}%</span></div>
        <span className={`stamina-state ${m.state.className}`}>{m.state.label}</span>
        <span className="stamina-rep">{fmt(member.reputation)}</span>
      </div>; })}
    </div>
    <div className="stamina-rule-note">Source: game AMF ClanService.getMemberList · Max stamina fallback: 200.</div>
  </section>;
}

function nextMembers(members) {
  return members.map((member) => ({ ...member, name: String(member?.name ?? '').trim() })).filter((member) => member.name);
}
