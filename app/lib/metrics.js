const number = (value) => Number(String(value ?? '').replace(/[^0-9.-]/g, '')) || 0;

export const PERIOD_LABELS = { 1: '1H', 3: '3H', 5: '5H', 6: '6H', 12: '12H', 24: '24H', 168: '7D' };

export function timelineFor(historyMember) {
  return Array.isArray(historyMember?.points)
    ? historyMember.points.slice().sort((a, b) => Number(a.t) - Number(b.t))
    : [];
}

export function baselinePoint(points, since) {
  if (!points.length) return null;
  return points.filter((point) => Number(point.t) <= since).at(-1) || points[0];
}

export function statusFor(member, historyMember, now = Date.now(), windowStart = now - 3600000) {
  const points = timelineFor(historyMember);
  if (member?.missing) return 'MISSING';
  if (points.length < 2) return 'NEW';

  const latest = points.at(-1);
  const prior = points.at(-2);
  if (number(latest.r) < number(prior.r)) return 'RESET';

  const baseline = baselinePoint(points, windowStart);
  const current = number(member?.reputation ?? member?.rep ?? latest.r);
  const periodGain = Math.max(0, current - number(baseline?.r ?? current));
  const ageMinutes = Math.max(0, (now - Number(latest.t)) / 60000);

  // Positive reputation gain always wins over the old "NO GAIN" fallback.
  // A member is only NO GAIN when the selected period has genuinely produced 0 gain.
  if (periodGain > 0 && ageMinutes <= 15) return 'ACTIVE';
  if (periodGain > 0 && ageMinutes <= 30) return 'RECENT';
  if (periodGain > 0) return 'IDLE';
  return 'NO GAIN';
}

export function memberMetrics(member, historyMember, hours = 5, now = Date.now()) {
  const points = timelineFor(historyMember);
  const safeHours = Math.max(Number(hours) || 0, 1 / 60);
  const since = now - safeHours * 3600000;
  const current = number(member?.reputation ?? member?.rep ?? points.at(-1)?.r);
  const baseline = baselinePoint(points, since);
  const before = baseline ? number(baseline.r) : current;
  const rawGain = current - before;
  const gain = Math.max(0, rawGain);

  // Measure against the same baseline used for GAIN. The previous implementation
  // divided by baseline -> latest snapshot time, which could be near zero while
  // CURRENT REP was newer, producing an inflated GAIN/HR value.
  const baselineTs = Number(baseline?.t || since);
  const elapsedHours = Math.max((now - baselineTs) / 3600000, 1 / 60);
  const gainPerHour = gain / elapsedHours;
  const reset = Boolean(rawGain < 0) || points.some((point, i) => i && number(point.r) < number(points[i - 1].r));

  return {
    current,
    before,
    gain,
    gainPerHour: Number.isFinite(gainPerHour) ? gainPerHour : 0,
    latestTs: Number(points.at(-1)?.t || 0),
    baselineTs,
    elapsedHours,
    reset,
  };
}

export function buildMemberRows(members, historyMembers, hours, now = Date.now()) {
  const currentMap = new Map((members || []).map((member) => [String(member.id || member.name), member]));
  const ids = new Set([...Object.keys(historyMembers || {}), ...currentMap.keys()]);
  return [...ids].map((id) => {
    const historyMember = historyMembers?.[id] || {};
    const live = currentMap.get(id);
    const member = live || { id, name: historyMember.name || id, reputation: historyMember.points?.at(-1)?.r || 0, missing: true };
    const metrics = memberMetrics(member, historyMember, hours, now);
    const status = metrics.reset
      ? 'RESET'
      : statusFor(member, historyMember, now, now - Math.max(Number(hours) || 1, 1 / 60) * 3600000);
    return { ...member, id, ...metrics, status, historyMember };
  }).sort((a, b) => b.gain - a.gain || b.current - a.current || String(a.name).localeCompare(String(b.name)));
}

export function deriveEvents(members, historyMembers, now = Date.now()) {
  const events = [];
  for (const member of members || []) {
    const id = String(member.id || member.name);
    const points = timelineFor(historyMembers?.[id]);
    for (let i = 1; i < points.length; i += 1) {
      const before = number(points[i - 1].r);
      const after = number(points[i].r);
      const gain = after - before;
      const t = Number(points[i].t);
      if (gain <= 0 || now - t > 24 * 3600000) continue;
      events.push({ t, member: member.name, gain, before, after });
    }
  }
  return events.sort((a, b) => b.t - a.t);
}

export function deriveAlerts(rows, periodHours) {
  const label = PERIOD_LABELS[periodHours] || `${periodHours}H`;
  const alerts = [];
  for (const member of rows || []) {
    if (member.gain >= 10000) alerts.push({ level: 'HIGH', type: '+10K GAIN', text: `${member.name} gained ${member.gain.toLocaleString()} in ${label}` });
    else if (member.gain >= 5000) alerts.push({ level: 'INFO', type: '+5K GAIN', text: `${member.name} gained ${member.gain.toLocaleString()} in ${label}` });
    if (member.gainPerHour >= 1000) alerts.push({ level: 'HIGH', type: 'FAST GAIN', text: `${member.name} is averaging ${Math.round(member.gainPerHour).toLocaleString()}/hr` });
    if (member.status === 'IDLE' || member.status === 'NO GAIN') alerts.push({ level: 'WARN', type: 'NO ACTIVITY', text: member.status === 'IDLE' ? `${member.name} has gain, but no recent activity snapshot` : `${member.name} has no positive gain in ${label}` });
    if (member.status === 'RESET') alerts.push({ level: 'CRIT', type: 'REP RESET', text: `${member.name} reputation dropped below a prior snapshot` });
    if (member.status === 'MISSING') alerts.push({ level: 'CRIT', type: 'MEMBER MISSING', text: `${member.name} exists in history but is absent from live data` });
  }
  return alerts.slice(0, 30);
}
