'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

const REFRESH_MS = 1000;
const SYNC_REFRESH_MS = 10000;
const HEALTH_REFRESH_MS = 15000;
const FOCUS_REFRESH_MS = 10000;
const RANKING_API = '/api/clan-ranking';
const MEMBERS_API = '/api/clan-members';
const HISTORY_API = '/api/member-history';
const HEALTH_API = '/api/health';
const SYNC_API = '/api/sync-status';
const FALLBACK_SEASON_END = '2026-09-14T00:00:00+08:00';
const LOCAL_HISTORY_KEY = 'nztracker-member-rep-history-v3';
const LAST_KNOWN_KEY = 'nztracker-last-known-members-v3';
const PERIODS = [1, 3, 5, 6, 12, 24, 168];
const MINI_BURN_TARGET = 10000;

const fmt = (value) => Number(value || 0).toLocaleString('en-US');
const cleanNumber = (value) => Number(String(value ?? '').replace(/[^0-9.-]/g, '')) || 0;
const pad = (value) => String(value).padStart(2, '0');

function getServerTime(now) {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Singapore', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  }).format(new Date(now));
}

function formatDate(value) {
  return value ? new Date(value).toLocaleString('en-PH', { hour12: false }) : '—';
}

function formatTime(value) {
  return value ? new Date(value).toLocaleTimeString('en-PH', { hour12: false }) : '—';
}

function getCountdown(endDate, now) {
  const end = new Date(endDate || 0).getTime();
  if (!Number.isFinite(end)) return { days: 0, hours: 0, minutes: 0, seconds: 0 };
  const totalSeconds = Math.max(0, Math.floor((end - now) / 1000));
  return { days: Math.floor(totalSeconds / 86400), hours: Math.floor(totalSeconds / 3600) % 24, minutes: Math.floor(totalSeconds / 60) % 60, seconds: totalSeconds % 60 };
}

function safeRead(key) {
  try { const value = window.localStorage.getItem(key); return value ? JSON.parse(value) : {}; } catch { return {}; }
}

function safeWrite(key, value) {
  try { window.localStorage.setItem(key, JSON.stringify(value)); } catch {}
}

function csvEscape(value) {
  const text = String(value ?? '');
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function pointSeries(history, id) {
  const points = Array.isArray(history?.members?.[id]?.points) ? history.members[id].points : [];
  return [...points].filter((point) => Number.isFinite(Number(point.t)) && Number.isFinite(Number(point.r))).sort((a, b) => Number(a.t) - Number(b.t));
}

function positiveDeltaTotal(points) {
  let total = 0;
  for (let i = 1; i < points.length; i += 1) {
    const delta = Number(points[i].r) - Number(points[i - 1].r);
    if (delta > 0) total += delta;
  }
  return total;
}

function deriveStatus({ currentRep, baselineRep, latestPointAt, now, gain }) {
  if (baselineRep !== null && currentRep < baselineRep) return 'RESET';
  if (!latestPointAt) return 'MISSING';
  const ageMinutes = Math.max(0, (now - latestPointAt) / 60000);
  if (gain > 0 && ageMinutes <= 15) return 'ACTIVE';
  if (gain > 0 && ageMinutes <= 60) return 'RECENT';
  if (ageMinutes > 60) return 'IDLE';
  if (ageMinutes >= 30 && gain === 0) return 'NO GAIN';
  return 'NEW';
}

function statusLabel(status) { return status; }

function statusClass(status) {
  return String(status || '').toLowerCase().replace(/\s+/g, '-');
}

export default function Home() {
  const [clans, setClans] = useState([]);
  const [season, setSeason] = useState('Season 2');
  const [seasonEnd, setSeasonEnd] = useState(FALLBACK_SEASON_END);
  const [serverNow, setServerNow] = useState(Date.now());
  const [status, setStatus] = useState('loading');
  const [lastSync, setLastSync] = useState(null);
  const [error, setError] = useState('');
  const [syncStatus, setSyncStatus] = useState(null);
  const [health, setHealth] = useState({ ranking: 'UNKNOWN', members: 'UNKNOWN', history: 'UNKNOWN' });
  const [mode, setMode] = useState('normal');

  const [modalOpen, setModalOpen] = useState(false);
  const [selectedClan, setSelectedClan] = useState(null);
  const [memberData, setMemberData] = useState(null);
  const [memberError, setMemberError] = useState('');
  const [memberLoading, setMemberLoading] = useState(false);
  const [historyData, setHistoryData] = useState(null);
  const [historyError, setHistoryError] = useState('');
  const [historyStored, setHistoryStored] = useState(false);
  const [periodHours, setPeriodHours] = useState(5);
  const [eventFilter, setEventFilter] = useState('ALL');
  const [copied, setCopied] = useState(false);
  const [focusHistory, setFocusHistory] = useState(null);

  const selectedClanRef = useRef(null);
  const rankingRequestRef = useRef(false);
  const memberRequestRef = useRef(false);
  const previousClanReputationRef = useRef({});
  const liveClanTotalsRef = useRef({});

  useEffect(() => {
    const timer = setInterval(() => setServerNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const loadSyncStatus = useCallback(async () => {
    try {
      const response = await fetch(`${SYNC_API}?t=${Date.now()}`, { cache: 'no-store', headers: { Accept: 'application/json' } });
      const data = await response.json().catch(() => ({}));
      setSyncStatus(data);
    } catch {}
  }, []);

  const loadHealth = useCallback(async () => {
    try {
      const response = await fetch(`${HEALTH_API}?t=${Date.now()}`, { cache: 'no-store' });
      const data = await response.json().catch(() => ({}));
      setHealth({
        ranking: data?.services?.clanRanking?.status === 'ready' ? 'READY' : 'ERROR',
        members: data?.services?.clanMembers?.status === 'ready' ? 'READY' : 'ERROR',
        history: data?.services?.memberHistory?.durable ? 'DURABLE' : 'LOCAL',
      });
    } catch {}
  }, []);

  const fetchHistoryForClan = useCallback(async (clan, hours = 168, setter = setHistoryData) => {
    if (!clan?.clanId) return null;
    try {
      const params = new URLSearchParams({ clanId: String(clan.clanId), season: String(season || 'Season 2'), hours: String(Math.min(168, Math.max(1, hours))), t: String(Date.now()) });
      const response = await fetch(`${HISTORY_API}?${params.toString()}`, { cache: 'no-store', headers: { Accept: 'application/json' } });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.details || data.error || `HTTP ${response.status}`);
      setter(data);
      if (setter === setHistoryData) {
        setHistoryStored(Boolean(data.stored));
        setHealth((current) => ({ ...current, history: data.stored ? 'DURABLE' : 'LOCAL' }));
        safeWrite(`${LOCAL_HISTORY_KEY}:${clan.clanId}:${season}`, data);
        setHistoryError('');
      }
      return data;
    } catch (err) {
      if (setter === setHistoryData) {
        const local = safeRead(`${LOCAL_HISTORY_KEY}:${clan.clanId}:${season}`);
        if (local?.members) {
          setter(local);
          setHistoryStored(false);
          setHistoryError('Server history unavailable — using local fallback.');
          setHealth((current) => ({ ...current, history: 'LOCAL' }));
        } else {
          setHistoryError(err instanceof Error ? err.message : 'Unable to load history');
        }
      }
      return null;
    }
  }, [season]);

  const loadRanking = useCallback(async () => {
    if (rankingRequestRef.current) return;
    rankingRequestRef.current = true;
    try {
      setStatus((current) => current === 'live' ? 'live' : 'loading');
      const response = await fetch(`${RANKING_API}?t=${Date.now()}`, { cache: 'no-store', headers: { Accept: 'application/json' } });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.details || data.error || `HTTP ${response.status}`);
      const rows = Array.isArray(data.rows) ? data.rows : [];
      const previous = previousClanReputationRef.current;
      const totals = liveClanTotalsRef.current;
      const nextRows = rows.map((row) => {
        const id = String(row.clanId || row.clan || row.rank);
        const reputation = cleanNumber(row.reputation);
        const oldRep = previous[id];
        const reset = oldRep !== undefined && reputation < oldRep;
        const delta = oldRep === undefined || reset ? 0 : Math.max(0, reputation - oldRep);
        previous[id] = reputation;
        if (reset) totals[id] = 0;
        totals[id] = (totals[id] || 0) + delta;
        return { ...row, liveDelta: delta, liveTotal: totals[id], resetDetected: reset };
      });
      setClans(nextRows);
      setSeason(data.season || 'Season 2');
      setSeasonEnd(data.seasonEndsAt || FALLBACK_SEASON_END);
      setLastSync(new Date(data.fetchedAt || Date.now()));
      setStatus('live');
      setError('');
      const active = selectedClanRef.current;
      if (active) {
        const updated = nextRows.find((row) => String(row.clanId) === String(active.clanId));
        if (updated) setSelectedClan(updated);
      }
    } catch (err) {
      setStatus('error');
      setError(err instanceof Error ? err.message : 'Failed to load clan ranking');
    } finally {
      rankingRequestRef.current = false;
    }
  }, []);

  const refreshClanMembers = useCallback(async (clan, showLoading = false) => {
    if (!clan?.clanId || memberRequestRef.current) return;
    memberRequestRef.current = true;
    if (showLoading) setMemberLoading(true);
    const clanKey = `${season}:${clan.clanId}`;
    try {
      const response = await fetch(`${MEMBERS_API}?clanId=${encodeURIComponent(clan.clanId)}&t=${Date.now()}`, { cache: 'no-store', headers: { Accept: 'application/json' } });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.details || data.error || `HTTP ${response.status}`);
      const members = Array.isArray(data.members) ? data.members : [];
      if (!members.length) throw new Error('No member records returned by the live source.');
      const seen = new Set();
      const uniqueMembers = members.filter((member, index) => {
        const key = String(member?.id || member?.name || index);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
      const cleanMembers = uniqueMembers.map((member, index) => ({ ...member, id: String(member.id || member.name || `${clan.clanId}-${index}`), reputation: cleanNumber(member.reputation ?? member.rep), rep: cleanNumber(member.reputation ?? member.rep) }));
      const nextData = { ...data, members: cleanMembers, updatedAt: data.servedAt || data.fetchedAt || new Date().toISOString(), duplicateCount: Math.max(0, members.length - uniqueMembers.length) };
      setMemberData(nextData);
      setMemberError('');
      setHealth((current) => ({ ...current, members: data.stale ? 'STALE' : 'LIVE' }));
      safeWrite(`${LAST_KNOWN_KEY}:${clanKey}`, { ...nextData, savedAt: Date.now() });
      await fetchHistoryForClan(clan, periodHours === 168 ? 168 : periodHours, setHistoryData);
    } catch (err) {
      const local = safeRead(`${LAST_KNOWN_KEY}:${clanKey}`);
      if (local?.members?.length) {
        setMemberData(local);
        setMemberError('Live source unavailable — showing last valid server data.');
        setHealth((current) => ({ ...current, members: 'LAST KNOWN' }));
      } else {
        setMemberError(err instanceof Error ? err.message : 'Failed to load clan members');
        setHealth((current) => ({ ...current, members: 'ERROR' }));
      }
    } finally {
      memberRequestRef.current = false;
      if (showLoading) setMemberLoading(false);
    }
  }, [fetchHistoryForClan, periodHours, season]);

  useEffect(() => {
    void loadRanking();
    void loadHealth();
    void loadSyncStatus();
    const rankingTimer = setInterval(() => void loadRanking(), REFRESH_MS);
    const healthTimer = setInterval(() => void loadHealth(), HEALTH_REFRESH_MS);
    const syncTimer = setInterval(() => void loadSyncStatus(), SYNC_REFRESH_MS);
    return () => { clearInterval(rankingTimer); clearInterval(healthTimer); clearInterval(syncTimer); };
  }, [loadHealth, loadRanking, loadSyncStatus]);

  const focusClan = useMemo(() => clans.find((clan) => /chaos/i.test(clan.clan || '')) || clans[0] || null, [clans]);

  useEffect(() => {
    if (!focusClan?.clanId) return;
    let cancelled = false;
    const loadFocus = async () => {
      const data = await fetchHistoryForClan(focusClan, 24, (value) => {
        if (!cancelled) setFocusHistory(value);
      });
      return data;
    };
    void loadFocus();
    const timer = setInterval(() => void loadFocus(), FOCUS_REFRESH_MS);
    return () => { cancelled = true; clearInterval(timer); };
  }, [fetchHistoryForClan, focusClan?.clanId]);

  const openClanModal = useCallback(async (clan) => {
    selectedClanRef.current = clan;
    setSelectedClan(clan);
    setModalOpen(true);
    setMemberError('');
    setHistoryError('');
    setMemberData(null);
    setHistoryData(null);
    setEventFilter('ALL');
    await refreshClanMembers(clan, true);
  }, [refreshClanMembers]);

  useEffect(() => {
    if (!modalOpen || !selectedClanRef.current?.clanId) return;
    const timer = setInterval(() => void refreshClanMembers(selectedClanRef.current), REFRESH_MS);
    return () => clearInterval(timer);
  }, [modalOpen, refreshClanMembers]);

  const closeModal = useCallback(() => {
    setModalOpen(false);
    selectedClanRef.current = null;
    setSelectedClan(null);
    setMemberData(null);
    setHistoryData(null);
    setHistoryError('');
    setMemberError('');
    setCopied(false);
  }, []);

  useEffect(() => {
    const onKeyDown = (event) => { if (event.key === 'Escape' && modalOpen) closeModal(); };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [closeModal, modalOpen]);

  const currentMembers = memberData?.members || [];
  const currentHistoryMembers = historyData?.members || {};
  const windowStart = serverNow - periodHours * 60 * 60 * 1000;

  const memberInsights = useMemo(() => currentMembers.map((member) => {
    const id = String(member.id || member.name);
    const points = pointSeries(historyData, id);
    const eligible = points.filter((point) => Number(point.t) <= windowStart);
    const baseline = eligible[eligible.length - 1] || points[0] || null;
    const latest = points[points.length - 1] || null;
    const currentRep = cleanNumber(member.reputation ?? member.rep);
    const beforeRep = baseline ? cleanNumber(baseline.r) : null;
    const gain = beforeRep === null || currentRep < beforeRep ? 0 : Math.max(0, currentRep - beforeRep);
    const measuredHours = baseline ? Math.max(0, (serverNow - Number(baseline.t)) / 3600000) : 0;
    const ratePerHour = measuredHours > 0.05 ? gain / measuredHours : 0;
    const gain24h = (() => {
      const cutoff = serverNow - 24 * 3600000;
      const start = points.filter((point) => Number(point.t) <= cutoff).at(-1) || points[0];
      if (!start || currentRep < cleanNumber(start.r)) return 0;
      return Math.max(0, currentRep - cleanNumber(start.r));
    })();
    const gain6h = (() => {
      const cutoff = serverNow - 6 * 3600000;
      const start = points.filter((point) => Number(point.t) <= cutoff).at(-1) || points[0];
      if (!start || currentRep < cleanNumber(start.r)) return 0;
      return Math.max(0, currentRep - cleanNumber(start.r));
    })();
    const status = deriveStatus({ currentRep, baselineRep: beforeRep, latestPointAt: latest?.t ? Number(latest.t) : null, now: serverNow, gain });
    return {
      ...member,
      id,
      beforeRep,
      afterRep: currentRep,
      gain,
      measuredHours,
      ratePerHour,
      gain6h,
      gain24h,
      sessionGain: positiveDeltaTotal(points),
      status,
      statusLabel: statusLabel(status),
      latestPointAt: latest?.t || null,
      points,
      targetProgress: Math.min(100, (gain24h / MINI_BURN_TARGET) * 100),
    };
  }), [currentMembers, historyData, serverNow, windowStart]);

  const sortedInsights = useMemo(() => [...memberInsights].sort((a, b) => b.gain - a.gain || b.afterRep - a.afterRep), [memberInsights]);
  const activeMembers = memberInsights.filter((member) => member.status === 'ACTIVE' || member.status === 'RECENT');
  const zeroGain = memberInsights.filter((member) => member.status === 'NO GAIN');
  const resetMembers = memberInsights.filter((member) => member.status === 'RESET');
  const missingMembers = memberInsights.filter((member) => member.status === 'MISSING');
  const idleMembers = memberInsights.filter((member) => member.status === 'IDLE');
  const miniBurn = memberInsights.filter((member) => member.gain24h < MINI_BURN_TARGET && member.status !== 'MISSING');
  const topGainers = sortedInsights.filter((member) => member.gain > 0).slice(0, 5);

  const eventRows = useMemo(() => {
    const events = [];
    memberInsights.forEach((member) => {
      for (let index = 1; index < member.points.length; index += 1) {
        const previous = member.points[index - 1];
        const current = member.points[index];
        const delta = cleanNumber(current.r) - cleanNumber(previous.r);
        if (delta === 0) continue;
        const deltaHours = Math.max(1 / 3600, (Number(current.t) - Number(previous.t)) / 3600000);
        const rate = delta > 0 ? delta / deltaHours : 0;
        events.push({ time: Number(current.t), member: member.name, id: member.id, delta, rate, kind: delta < 0 ? 'RESET' : rate >= 1000 ? 'FAST' : delta >= 10000 ? '10K+' : 'GAIN' });
      }
    });
    return events.sort((a, b) => b.time - a.time).filter((event) => eventFilter === 'ALL' || (eventFilter === 'CHAOS' ? /chaos/i.test(event.member) : eventFilter === '1K+' ? event.delta >= 1000 : eventFilter === '5K+' ? event.delta >= 5000 : eventFilter === 'RESET' ? event.delta < 0 : event.member === eventFilter)).slice(0, 80);
  }, [eventFilter, memberInsights]);

  const alertRows = useMemo(() => {
    const alerts = [];
    memberInsights.forEach((member) => {
      if (member.status === 'RESET') alerts.push({ kind: 'danger', label: 'REP RESET', text: `${member.name}: current rep is below the selected baseline.` });
      if (member.gain >= 10000) alerts.push({ kind: 'good', label: '+10K GAIN', text: `${member.name} gained +${fmt(member.gain)} in this window.` });
      if (member.ratePerHour >= 1000) alerts.push({ kind: 'good', label: 'FAST GAIN', text: `${member.name} is averaging +${fmt(Math.round(member.ratePerHour))}/h.` });
      if (member.status === 'NO GAIN') alerts.push({ kind: 'warn', label: 'NO ACTIVITY', text: `${member.name} has no gain in the measured window.` });
      if (member.status === 'MISSING') alerts.push({ kind: 'warn', label: 'MISSING', text: `${member.name} has no durable history for this window.` });
    });
    return alerts.slice(0, 16);
  }, [memberInsights]);

  const timestampRows = useMemo(() => memberInsights.flatMap((member) => member.points.filter((point) => Number(point.t) >= windowStart).map((point) => ({ member: member.name, id: member.id, time: Number(point.t), rep: cleanNumber(point.r) }))).sort((a, b) => b.time - a.time).slice(0, 120), [memberInsights, windowStart]);

  const chartBars = useMemo(() => {
    const bucketCount = 12;
    const bucketSize = Math.max(1, (periodHours * 3600000) / bucketCount);
    const buckets = Array.from({ length: bucketCount }, () => 0);
    eventRows.forEach((event) => {
      if (event.delta <= 0 || event.time < windowStart) return;
      const index = Math.min(bucketCount - 1, Math.max(0, Math.floor((event.time - windowStart) / bucketSize)));
      buckets[index] += event.delta;
    });
    const max = Math.max(1, ...buckets);
    return buckets.map((value) => ({ value, height: Math.max(4, Math.round((value / max) * 76)) }));
  }, [eventRows, periodHours, windowStart]);

  const focusInsights = useMemo(() => {
    if (!focusClan) return null;
    const rows = Array.isArray(focusHistory?.members) ? [] : Object.entries(focusHistory?.members || {}).map(([id, value]) => ({ id, value }));
    let totalGain = 0;
    let active = 0;
    const contributors = [];
    rows.forEach(({ id, value }) => {
      const points = Array.isArray(value?.points) ? [...value.points].sort((a, b) => Number(a.t) - Number(b.t)) : [];
      if (!points.length) return;
      const cutoff = serverNow - 24 * 3600000;
      const start = points.filter((point) => Number(point.t) <= cutoff).at(-1) || points[0];
      const end = points.at(-1);
      const gain = start && end ? Math.max(0, cleanNumber(end.r) - cleanNumber(start.r)) : 0;
      const age = Math.max(0, (serverNow - Number(end.t)) / 60000);
      if (gain > 0 && age <= 60) active += 1;
      totalGain += gain;
      contributors.push({ id, name: value?.name || id, gain });
    });
    contributors.sort((a, b) => b.gain - a.gain);
    return { totalGain, active, contributors: contributors.slice(0, 5) };
  }, [focusClan, focusHistory, serverNow]);

  const copyDiscordSummary = useCallback(async () => {
    const clan = selectedClan?.clan || 'Clan';
    const lines = [
      `🔥 **${clan} ${mode === 'fd' ? 'FD' : ''} REP REPORT**`.replace(/  +/g, ' '),
      `Rank: #${selectedClan?.rank || '—'}`,
      `Rep: ${fmt(selectedClan?.reputation || memberData?.reputation || 0)}`,
      `Window: ${periodHours === 168 ? '7D' : `${periodHours}H`}`,
      `Active: ${activeMembers.length}/${currentMembers.length}`,
      `24H Gain: +${fmt(memberInsights.reduce((sum, member) => sum + member.gain24h, 0))}`,
      '',
      '**TOP GAINERS**',
      ...(topGainers.length ? topGainers.map((member, index) => `${index + 1}. ${member.name} — +${fmt(member.gain)}`) : ['None recorded.']),
      '',
      '**MINI BURN / UNDER 10K**',
      ...(miniBurn.length ? miniBurn.slice(0, 10).map((member) => `${member.name} — +${fmt(member.gain24h)} / 10,000`) : ['None']),
      ...(resetMembers.length ? ['', '**RESETS**', ...resetMembers.map((member) => `${member.name} — ${fmt(member.beforeRep)} → ${fmt(member.afterRep)}`)] : []),
      `Updated: ${formatDate(serverNow)}`,
    ];
    try { await navigator.clipboard.writeText(lines.join('\n')); setCopied(true); setTimeout(() => setCopied(false), 1600); } catch {}
  }, [activeMembers.length, currentMembers.length, memberData?.reputation, memberInsights, miniBurn, mode, periodHours, resetMembers, selectedClan, serverNow, topGainers]);

  const exportMembers = useCallback(() => {
    if (!currentMembers.length) return;
    const safeClan = (selectedClan?.clan || 'clan').replace(/[^a-z0-9_-]+/gi, '-').replace(/^-|-$/g, '') || 'clan';
    const rows = [
      ['NZ TRACKER 3.0'],
      ['Clan', selectedClan?.clan || 'Clan'],
      ['Season', season],
      ['Window', periodHours === 168 ? '7 days' : `${periodHours} hours`],
      ['History', historyStored ? 'Server durable' : 'Local fallback'],
      [],
      ['#', 'Member', 'Lv', 'Before Rep', 'After Rep', 'Gain', 'Rate/H', 'Gain 6H', 'Gain 24H', 'Status', 'Total Stored Gain'],
      ...memberInsights.map((member, index) => [index + 1, member.name, member.level || '-', member.beforeRep ?? '', member.afterRep, member.gain, Math.round(member.ratePerHour), member.gain6h, member.gain24h, member.status, member.sessionGain]),
      [],
      ['EVENT TIMELINE'],
      ['Timestamp', 'Member', 'Change', 'Rate/H', 'Type'],
      ...eventRows.map((event) => [formatDate(event.time), event.member, event.delta, Math.round(event.rate), event.kind]),
    ];
    const csv = rows.map((row) => row.map(csvEscape).join(',')).join('\r\n');
    const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob); const anchor = document.createElement('a'); anchor.href = url; anchor.download = `${safeClan}-nztracker3-report.csv`; document.body.appendChild(anchor); anchor.click(); anchor.remove(); URL.revokeObjectURL(url);
  }, [currentMembers.length, eventRows, historyStored, memberInsights, periodHours, season, selectedClan]);

  const countdown = useMemo(() => getCountdown(seasonEnd, serverNow), [seasonEnd, serverNow]);
  const serverTime = getServerTime(serverNow);
  const syncAgeSeconds = syncStatus?.ageSeconds ?? null;
  const syncStatusLabel = syncStatus?.status === 'active' ? 'ACTIVE' : syncStatus?.status === 'delayed' ? 'DELAYED' : syncStatus?.status === 'offline' ? 'OFFLINE' : 'ERROR';
  const syncStatusClass = syncStatus?.status === 'active' ? 'good' : syncStatus?.status === 'delayed' ? 'warn' : 'bad';
  const focusRank = focusClan?.rank ? Number(focusClan.rank) : null;
  const gapToTop = focusClan && clans[0] && focusClan !== clans[0] ? Math.max(0, cleanNumber(clans[0].reputation) - cleanNumber(focusClan.reputation)) : 0;
  const nextLower = focusRank && clans[focusRank] ? Math.max(0, cleanNumber(focusClan.reputation) - cleanNumber(clans[focusRank].reputation)) : 0;

  return (
    <div className="site-wrapper">
      <header className="site-header">
        <div className="header-banner"><h1>NINJA ZENSHIN</h1><span>Clan Operations 3.0</span></div>
        <div className="server-time-bar"><div className="server-time-left"><div className={`server-time-dot ${status}`} /><span className="server-time-label">Server Time</span><span className="server-time-value">{serverTime} SGT</span></div></div>
      </header>

      <main className="main-content">
        <div className="content-card">
          <div className="card-heading"><div><h1>Clan Ranking</h1><div className="clr-season">{season}</div></div><div className="sync-state"><span className={`sync-dot ${status}`} /><span>{status === 'live' ? 'LIVE · 1S' : status === 'loading' ? 'SYNCING' : 'ERROR'}</span></div></div>

          <div className="clr-cd"><div><b>{countdown.days}</b><span>Days</span></div><div><b>{pad(countdown.hours)}</b><span>Hours</span></div><div><b>{pad(countdown.minutes)}</b><span>Minutes</span></div><div><b>{pad(countdown.seconds)}</b><span>Seconds</span></div></div>

          <div className="nz3-command">
            <div className="nz3-wide"><span className="nz3-label">Background Sync</span><span className={`nz3-value ${syncStatusClass}`}>{syncStatusLabel}</span><span className="nz3-sub">Runs independently of the open tracker</span></div>
            <div><span className="nz3-label">Last Snapshot</span><span className="nz3-value">{syncStatus?.lastRunAt ? formatTime(syncStatus.lastRunAt) : '—'}</span><span className="nz3-sub">{syncAgeSeconds === null ? 'No heartbeat' : `${syncAgeSeconds}s ago`}</span></div>
            <div><span className="nz3-label">Next Expected</span><span className="nz3-value">{syncStatus?.nextExpectedAt ? formatTime(syncStatus.nextExpectedAt) : '—'}</span><span className="nz3-sub">5 minute monitor</span></div>
            <div><span className="nz3-label">Clans</span><span className="nz3-value">{syncStatus?.clansSeen || '—'}</span><span className="nz3-sub">with data {syncStatus?.clansWithMemberData || '—'}</span></div>
            <div><span className="nz3-label">Members</span><span className="nz3-value">{syncStatus?.membersSeen || '—'}</span><span className="nz3-sub">errors {syncStatus?.memberErrors || 0}</span></div>
            <div><span className="nz3-label">History</span><span className={`nz3-value ${syncStatus?.durable ? 'good' : 'bad'}`}>{syncStatus?.durable ? 'DURABLE' : 'LOCAL'}</span><span className="nz3-sub">{syncStatus?.storageProvider || 'storage'}</span></div>
            <div><span className="nz3-label">Source</span><span className="nz3-value">Ninja</span><span className="nz3-sub">Zenshin</span></div>
          </div>

          <div className="nz3-mode"><span>{mode === 'fd' ? 'FD OPERATIONS MODE' : 'NORMAL OPERATIONS MODE'}</span><div className="nz3-toggle"><button type="button" className={mode === 'normal' ? 'active' : ''} onClick={() => setMode('normal')}>NORMAL</button><button type="button" className={mode === 'fd' ? 'active' : ''} onClick={() => setMode('fd')}>FD MODE</button></div></div>

          {focusClan && <section className="nz3-section"><div className="nz3-section-head"><b>{focusClan.clan} · CLAN INTELLIGENCE</b><span>live source + durable history</span></div><div className="nz3-focus">
            <div><b>#{focusClan.rank || '—'}</b><span>RANK</span></div>
            <div><b>{fmt(focusClan.reputation)}</b><span>REPUTATION</span></div>
            <div><b className="positive">+{fmt(focusInsights?.totalGain || 0)}</b><span>24H GAIN</span></div>
            <div><b>{focusInsights?.active || 0}/{focusClan.memberCurrent || 0}</b><span>ACTIVE MEMBERS</span></div>
            <div><b>{gapToTop ? fmt(gapToTop) : '0'}</b><span>{focusRank === 1 ? 'AT #1' : 'TO #1'}</span></div>
            <div><b>{nextLower ? fmt(nextLower) : '—'}</b><span>LEAD OVER NEXT</span></div>
          </div>{focusInsights?.contributors?.length ? <div className="nz3-mini-grid">{focusInsights.contributors.map((member, index) => <div className="nz3-mini" key={member.id}><b>{index + 1}. {member.name}</b><span>24H +{fmt(member.gain)} REP</span></div>)}</div> : <div className="nz3-empty">No durable 24H contributor data yet.</div>}</section>}

          <div className="ranking-status-row"><span>{lastSync ? `Live source updated ${lastSync.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}` : 'Connecting to live ranking…'}</span><button type="button" onClick={() => { void loadRanking(); void loadSyncStatus(); }} disabled={status === 'loading'}>↻ Refresh</button></div>

          {error ? <div className="clr-status err">Live ranking error: {error}</div> : clans.length === 0 ? <div className="clr-status">Loading clan ranking…</div> : <div className="table-scroll"><table className="clr-table"><thead><tr><th>#</th><th>Clan</th><th>Master</th><th>Members</th><th className="num">Reputation</th><th className="num">Live Δ</th><th className="num">Live Total</th></tr></thead><tbody>{clans.map((clan) => <tr key={`${clan.clanId || clan.clan}-${clan.rank}`} className={clan.liveDelta > 0 ? 'gain-row' : ''}><td className="r">{clan.rank}</td><td><button type="button" className="clr-mem" onClick={() => void openClanModal(clan)}>{clan.clan}</button></td><td>{clan.master || '—'}</td><td className="c">{clan.memberCurrent}/{clan.memberMax}</td><td className="num">{fmt(clan.reputation)}</td><td className="num gain-number">{clan.liveDelta ? `+${fmt(clan.liveDelta)}` : '0'}</td><td className="num total-gain-number">{fmt(clan.liveTotal)}</td></tr>)}</tbody></table></div>}

          <div className="nz3-integrity"><span className={syncStatus?.durable ? 'good' : 'bad'}>HISTORY {syncStatus?.durable ? 'DURABLE' : 'LOCAL'}</span><span className={syncStatus?.status === 'active' ? 'good' : 'warn'}>BACKGROUND {syncStatusLabel}</span><span className="good">SOURCE NINJA ZENSHIN</span><span>{syncStatus?.memberErrors ? `PARTIAL ${syncStatus.memberErrors}` : 'NO KNOWN MONITOR ERRORS'}</span><span>UI REFRESH 1S</span></div>

          <section className="nz3-section"><div className="nz3-section-head"><b>{mode === 'fd' ? 'FD CONTRIBUTORS / MINI BURN' : 'LIVE OPERATIONS OVERVIEW'}</b><span>{mode === 'fd' ? '10K target' : 'background intelligence'}</span></div><div className="nz3-mini-grid">
            <div className="nz3-mini"><b>{mode === 'fd' ? `${miniBurn.length} members` : `${activeMembers.length} active`}</b><span>{mode === 'fd' ? 'Below 10K / 24H' : 'Selected clan live state'}</span></div>
            <div className="nz3-mini"><b>+{fmt(memberInsights.reduce((sum, member) => sum + member.gain24h, 0))}</b><span>Selected clan 24H gain</span></div>
            <div className="nz3-mini"><b>{resetMembers.length + missingMembers.length}</b><span>Reset / missing records</span></div>
          </div></section>

          <div className="clr-foot">Click a clan name for 1-second Live Member Data • Before/Gain use durable server history • Background monitor remains independent of the open page</div>
        </div>
      </main>

      <footer className="site-footer"><p>© 2026 Ninja Zenshin — Created by <a href="https://discord.com/users/396080330702061588" target="_blank" rel="noopener noreferrer">Michol</a></p></footer>

      {modalOpen && <div className="clr-modal show" role="dialog" aria-modal="true" aria-label={`${selectedClan?.clan || 'Clan'} live members`} onMouseDown={(event) => { if (event.target === event.currentTarget) closeModal(); }}><div className="clr-modal-box">
        <div className="clr-modal-head"><div className="live-head-main"><div className="eyebrow">LIVE MEMBER DATA · 1 SECOND</div><b>{selectedClan?.clan || 'Clan'}</b><span>{currentMembers.length} members • {periodHours === 168 ? '7D' : `${periodHours}H`} intelligence window</span></div><div className="clr-modal-actions"><div className="period-control" role="group" aria-label="Tracking period">{PERIODS.map((hours) => <button key={hours} type="button" className={periodHours === hours ? 'active' : ''} onClick={() => { setPeriodHours(hours); void fetchHistoryForClan(selectedClanRef.current, hours, setHistoryData); }}>{hours === 168 ? '7D' : `${hours}H`}</button>)}</div><button type="button" className="clr-modal-export" onClick={exportMembers} disabled={!currentMembers.length}>↧ CSV</button><button type="button" className="clr-modal-export" onClick={() => void copyDiscordSummary()} disabled={!currentMembers.length}> {copied ? '✓ COPIED' : 'DISCORD'} </button><button type="button" className="clr-modal-x" onClick={closeModal} aria-label="Close">×</button></div></div>

        <div className="health-strip"><span className={health.ranking === 'LIVE' ? 'ok' : 'ok'}>RANK {health.ranking}</span><span className={health.members === 'LIVE' ? 'ok' : health.members === 'STALE' || health.members === 'LAST KNOWN' ? 'warn' : 'bad'}>MEMBERS {health.members}</span><span className={health.history === 'DURABLE' ? 'ok' : 'warn'}>HISTORY {health.history}</span><span className={syncStatus?.durable ? 'ok' : 'bad'}>BACKGROUND {syncStatusLabel}</span><span>LAST SNAPSHOT {syncStatus?.lastRunAt ? formatTime(syncStatus.lastRunAt) : '—'}</span></div>

        <div className="clr-modal-sub"><span>Total Reputation: <b>{fmt(memberData?.reputation ?? selectedClan?.reputation ?? 0)}</b></span><span>{memberData?.stale ? 'Last-known server data' : memberError || 'Live source connected'}</span></div>

        <div className="nz3-modal-extra"><div><b>{activeMembers.length}</b><span>ACTIVE / RECENT</span></div><div><b>{topGainers[0] ? `+${fmt(topGainers[0].gain)}` : '—'}</b><span>TOP WINDOW GAIN</span></div><div><b>{fmt(memberInsights.reduce((sum, member) => sum + member.gain6h, 0))}</b><span>6H GAIN</span></div><div><b>{fmt(memberInsights.reduce((sum, member) => sum + member.gain24h, 0))}</b><span>24H GAIN</span></div></div>

        {mode === 'fd' && <div className="nz3-section"><div className="nz3-section-head"><b>FD TARGET / MINI BURN</b><span>{MINI_BURN_TARGET.toLocaleString()} rep target</span></div><div className="nz3-list">{miniBurn.slice(0, 12).map((member) => <div className="nz3-list-row" key={member.id}><span>{member.name}</span><b>{fmt(member.gain24h)} / {fmt(MINI_BURN_TARGET)}</b></div>)}{!miniBurn.length && <div className="nz3-empty">Everyone cleared the 10K 24H target.</div>}</div></div>}

        {historyError && <div className="history-notice">{historyError}</div>}
        {memberLoading && !currentMembers.length ? <div className="clr-status">Loading live members…</div> : memberError && !currentMembers.length ? <div className="clr-status err">{memberError}</div> : <div className="clr-modal-body">
          <div className="table-scroll modal-table-scroll"><table className="clr-mtable"><thead><tr><th>#</th><th>Member</th><th>Lv</th><th>Rep</th><th>Before</th><th>Gain</th><th>Rate/H</th><th>6H</th><th>24H</th><th>Status</th><th>Total</th></tr></thead><tbody>{sortedInsights.map((member, index) => <tr key={`${member.id}-${index}`} className={member.gain > 0 ? 'gain-row' : ''}><td className="r">{index + 1}</td><td>{member.name}</td><td>{member.level || '—'}</td><td className="num">{fmt(member.afterRep)}</td><td className="num before-number">{member.beforeRep === null ? '—' : fmt(member.beforeRep)}</td><td className="num gain-number">+{fmt(member.gain)}</td><td className="num">{member.ratePerHour ? `+${fmt(Math.round(member.ratePerHour))}` : '0'}</td><td className="num">+{fmt(member.gain6h)}</td><td className="num">+{fmt(member.gain24h)}</td><td><span className={`member-status ${statusClass(member.status)}`}>{member.statusLabel}</span></td><td className="num total-gain-number">{fmt(member.sessionGain)}</td></tr>)}</tbody></table></div>

          <div className="insight-columns"><section className="insight-panel"><div className="panel-title">TOP GAINERS <span>{periodHours === 168 ? '7D' : `${periodHours}H`}</span></div>{topGainers.length ? topGainers.map((member, index) => <div className="insight-row" key={member.id}><span>{index + 1}. {member.name}</span><b>+{fmt(member.gain)}</b></div>) : <div className="insight-empty">No gains recorded.</div>}</section><section className="insight-panel"><div className="panel-title">ACTIVITY</div>{[...activeMembers, ...idleMembers].slice(0, 10).map((member) => <div className="insight-row" key={member.id}><span>{member.name}</span><b>{member.status}</b></div>)}{!activeMembers.length && !idleMembers.length && <div className="insight-empty">No activity data.</div>}</section><section className="insight-panel"><div className="panel-title">RESETS / MISSING</div>{[...resetMembers, ...missingMembers].slice(0, 10).map((member) => <div className="insight-row" key={member.id}><span>{member.name}</span><b>{member.status}</b></div>)}{!resetMembers.length && !missingMembers.length && <div className="insight-empty">No integrity issues detected.</div>}</section></div>

          <div className="history-panel"><div className="panel-title">REP TREND <span>{periodHours === 168 ? '7D' : `${periodHours}H`} • aggregated gains</span></div><div className="nz3-chart">{chartBars.map((bar, index) => <div key={index} className="nz3-bar" style={{ height: `${bar.height}px` }} title={`+${fmt(bar.value)} rep`} />)}</div></div>

          <div className="history-panel"><div className="panel-title">REP CHANGE EVENT LOG <span>{eventRows.length} shown</span></div><div className="period-control" style={{ margin: '7px', width: 'fit-content' }}>{['ALL', 'CHAOS', '1K+', '5K+', 'RESET'].map((filter) => <button key={filter} type="button" className={eventFilter === filter ? 'active' : ''} onClick={() => setEventFilter(filter)}>{filter}</button>)}</div><div className="nz3-timeline">{eventRows.length ? eventRows.map((event, index) => <div className="nz3-event" key={`${event.id}-${event.time}-${index}`}><span>{formatTime(event.time)}</span><span>{event.member}</span><span className="gain">{event.delta > 0 ? '+' : ''}{fmt(event.delta)}</span><span className="kind">{event.kind}</span></div>) : <div className="nz3-empty">No reputation changes recorded for this window.</div>}</div></div>

          <div className="history-panel"><div className="panel-title">AUTOMATIC ALERTS <span>{alertRows.length}</span></div>{alertRows.length ? alertRows.map((alert, index) => <div className={`nz3-alert ${alert.kind}`} key={`${alert.label}-${index}`}><b>{alert.label}</b><span>{alert.text}</span></div>) : <div className="nz3-empty">No alerts detected.</div>}</div>

          <div className="history-panel"><div className="panel-title">ACTIVITY TIMELINE <span>{timestampRows.length} points</span></div><div className="table-scroll history-table-scroll"><table className="history-table"><thead><tr><th>Timestamp</th><th>Member</th><th>Rep</th></tr></thead><tbody>{timestampRows.map((row) => <tr key={`${row.id}-${row.time}`}><td>{formatDate(row.time)}</td><td>{row.member}</td><td className="num">{fmt(row.rep)}</td></tr>)}</tbody></table></div></div>

          <div className="nz3-discord"><pre>{`🔥 ${selectedClan?.clan || 'Clan'} ${mode === 'fd' ? 'FD ' : ''}REPORT\nRank: #${selectedClan?.rank || '—'}\nRep: ${fmt(selectedClan?.reputation || memberData?.reputation || 0)}\n24H Gain: +${fmt(memberInsights.reduce((sum, member) => sum + member.gain24h, 0))}\nTop Gainer: ${topGainers[0] ? `${topGainers[0].name} +${fmt(topGainers[0].gain)}` : '—'}\nMini Burn: ${miniBurn.length} members under 10K\nUpdated: ${formatDate(serverNow)}`}</pre><button type="button" onClick={() => void copyDiscordSummary()}>{copied ? '✓ COPIED' : 'COPY SUMMARY'}</button></div>
        </div>}

        <div className="clr-modal-foot">Background sync: {syncStatus?.durable ? 'durable' : 'local'} • Live UI polling: 1 second • History baseline: server-side • Source protection: stale / empty / duplicate / reset-safe</div>
      </div></div>}
    </div>
  );
}
