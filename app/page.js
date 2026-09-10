'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

const REFRESH_MS = 3000;
const RANKING_API = '/api/clan-ranking';
const MEMBERS_API = '/api/clan-members';
const HISTORY_API = '/api/member-history';
const HEALTH_API = '/api/health';
const FALLBACK_SEASON_END = '2026-09-14T00:00:00+08:00';
const LOCAL_HISTORY_KEY = 'nztracker-member-rep-history-v2';
const LAST_KNOWN_KEY = 'nztracker-last-known-members-v2';
const HISTORY_SAMPLE_MS = 5 * 60 * 1000;
const PERIODS = [1, 3, 5, 6, 12, 24, 168];

const fmt = (value) => Number(value || 0).toLocaleString('en-US');
const cleanNumber = (value) => Number(String(value ?? '').replace(/[^0-9.-]/g, '')) || 0;
const pad = (value) => String(value).padStart(2, '0');

function getServerTime(now) {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Singapore',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(new Date(now));
}

function getCountdown(endDate, now) {
  const end = new Date(endDate || 0).getTime();
  if (!Number.isFinite(end)) return { days: 0, hours: 0, minutes: 0, seconds: 0 };
  const diff = Math.max(0, end - now);
  const totalSeconds = Math.floor(diff / 1000);
  return {
    days: Math.floor(totalSeconds / 86400),
    hours: Math.floor(totalSeconds / 3600) % 24,
    minutes: Math.floor(totalSeconds / 60) % 60,
    seconds: totalSeconds % 60,
  };
}

function safeRead(key) {
  try {
    const value = window.localStorage.getItem(key);
    return value ? JSON.parse(value) : {};
  } catch {
    return {};
  }
}

function safeWrite(key, value) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Local fallback is best-effort only.
  }
}

function csvEscape(value) {
  const text = String(value ?? '');
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function formatDate(value) {
  return value ? new Date(value).toLocaleString('en-PH', { hour12: false }) : '';
}

function statusLabel(item) {
  return item?.status === 'RESET' ? 'RESET' : item?.status === 'MISSING' ? 'MISSING' : item?.gain > 0 ? 'ACTIVE' : item?.measuredHours >= 0.5 ? 'ZERO' : 'NEW';
}

export default function Home() {
  const [clans, setClans] = useState([]);
  const [season, setSeason] = useState('Season 2');
  const [seasonEnd, setSeasonEnd] = useState(FALLBACK_SEASON_END);
  const [serverNow, setServerNow] = useState(Date.now());
  const [status, setStatus] = useState('loading');
  const [lastSync, setLastSync] = useState(null);
  const [error, setError] = useState('');

  const [modalOpen, setModalOpen] = useState(false);
  const [selectedClan, setSelectedClan] = useState(null);
  const [memberData, setMemberData] = useState(null);
  const [memberLoading, setMemberLoading] = useState(false);
  const [memberError, setMemberError] = useState('');
  const [historyData, setHistoryData] = useState(null);
  const [historyError, setHistoryError] = useState('');
  const [historyStored, setHistoryStored] = useState(false);
  const [periodHours, setPeriodHours] = useState(5);
  const [health, setHealth] = useState({ ranking: 'UNKNOWN', members: 'UNKNOWN', history: 'UNKNOWN' });
  const [copied, setCopied] = useState(false);

  const previousReputationRef = useRef({});
  const totalGainReputationRef = useRef({});
  const lastHistoryPostRef = useRef({});
  const selectedClanRef = useRef(null);
  const rankingRequestRef = useRef(false);
  const memberRequestRef = useRef(false);

  useEffect(() => {
    const timer = setInterval(() => setServerNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const loadHealth = useCallback(async () => {
    try {
      const response = await fetch(`${HEALTH_API}?t=${Date.now()}`, { cache: 'no-store' });
      const data = await response.json().catch(() => ({}));
      setHealth({
        ranking: data?.services?.clanRanking?.status === 'ready' ? 'READY' : 'ERROR',
        members: data?.services?.clanMembers?.status === 'ready' ? 'READY' : 'ERROR',
        history: data?.services?.memberHistory?.status === 'ready' ? 'DURABLE' : 'LOCAL',
      });
    } catch {
      setHealth((current) => ({ ...current, history: current.history === 'UNKNOWN' ? 'LOCAL' : current.history }));
    }
  }, []);

  const fetchHistory = useCallback(async (clan, hours = 168) => {
    if (!clan?.clanId) return;
    try {
      const params = new URLSearchParams({
        clanId: String(clan.clanId),
        season: String(season || 'Season 2'),
        hours: String(Math.min(168, Math.max(1, hours))),
        t: String(Date.now()),
      });
      const response = await fetch(`${HISTORY_API}?${params.toString()}`, { cache: 'no-store', headers: { Accept: 'application/json' } });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.details || data.error || `HTTP ${response.status}`);
      setHistoryData(data);
      setHistoryStored(Boolean(data.stored));
      setHistoryError('');
      setHealth((current) => ({ ...current, history: data.stored ? 'DURABLE' : 'LOCAL' }));
      safeWrite(`${LOCAL_HISTORY_KEY}:${clan.clanId}:${season}`, data);
    } catch (err) {
      const local = safeRead(`${LOCAL_HISTORY_KEY}:${clan.clanId}:${season}`);
      if (local?.members) {
        setHistoryData(local);
        setHistoryStored(false);
        setHistoryError('Server history unavailable — using last local history.');
        setHealth((current) => ({ ...current, history: 'LOCAL' }));
      } else {
        setHistoryError(err instanceof Error ? err.message : 'Unable to load history');
      }
    }
  }, [season]);

  const persistHistorySnapshot = useCallback(async (clan, members, capturedAt) => {
    if (!clan?.clanId || !members?.length) return;
    const clanKey = `${season}:${clan.clanId}`;
    const now = Number(capturedAt) || Date.now();
    const lastPosted = lastHistoryPostRef.current[clanKey] || 0;
    const repFingerprint = members.map((member) => `${member.id || member.name}:${cleanNumber(member.reputation ?? member.rep)}`).join('|');
    const previousFingerprint = lastHistoryPostRef.current[`${clanKey}:fp`];
    const shouldPost = !lastPosted || now - lastPosted >= HISTORY_SAMPLE_MS || repFingerprint !== previousFingerprint;
    if (!shouldPost) return;
    lastHistoryPostRef.current[clanKey] = now;
    lastHistoryPostRef.current[`${clanKey}:fp`] = repFingerprint;

    try {
      const response = await fetch(HISTORY_API, {
        method: 'POST',
        cache: 'no-store',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          clanId: clan.clanId,
          season,
          capturedAt: now,
          members,
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.details || data.error || `HTTP ${response.status}`);
      setHistoryStored(Boolean(data.stored));
      setHealth((current) => ({ ...current, history: data.stored ? 'DURABLE' : 'LOCAL' }));
      void fetchHistory(clan, 168);
    } catch {
      setHealth((current) => ({ ...current, history: 'LOCAL' }));
    }
  }, [fetchHistory, season]);

  const refreshClanMembers = useCallback(async (clan, options = {}) => {
    if (!clan?.clanId || memberRequestRef.current) return;
    memberRequestRef.current = true;
    const showLoading = Boolean(options.showLoading);
    if (showLoading) setMemberLoading(true);
    const clanKey = `${season}:${clan.clanId}`;
    try {
      const response = await fetch(`${MEMBERS_API}?clanId=${encodeURIComponent(clan.clanId)}&t=${Date.now()}`, {
        cache: 'no-store',
        headers: { Accept: 'application/json' },
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.details || data.error || `HTTP ${response.status}`);

      const members = Array.isArray(data.members) ? data.members : [];
      const previous = previousReputationRef.current;
      const totals = totalGainReputationRef.current;
      const nextMembers = members.map((member, index) => {
        const id = String(member.id || member.name || `${clan.clanId}-${index}`);
        const reputation = cleanNumber(member.reputation ?? member.rep);
        const prevKey = `${clanKey}:${id}`;
        const oldRep = previous[prevKey];
        const reset = oldRep !== undefined && reputation < oldRep;
        const gain = oldRep === undefined || reset ? 0 : Math.max(0, reputation - oldRep);
        previous[prevKey] = reputation;
        if (reset) totals[`${clanKey}:${id}`] = 0;
        totals[`${clanKey}:${id}`] = (totals[`${clanKey}:${id}`] || 0) + gain;
        return { ...member, id, reputation, rep: reputation, gain, totalGain: totals[`${clanKey}:${id}`], resetDetected: reset };
      });

      setMemberData({ ...data, members: nextMembers, updatedAt: data.servedAt || data.fetchedAt || new Date().toISOString() });
      setMemberError('');
      setHealth((current) => ({ ...current, members: data.stale ? 'STALE' : 'LIVE' }));
      safeWrite(`${LAST_KNOWN_KEY}:${clanKey}`, { ...data, members: nextMembers, savedAt: Date.now() });
      void persistHistorySnapshot(clan, members, Date.now());
    } catch (err) {
      const local = safeRead(`${LAST_KNOWN_KEY}:${clanKey}`);
      if (local?.members?.length) {
        setMemberData(local);
        setMemberError('Live source unavailable — showing last successful member data.');
        setHealth((current) => ({ ...current, members: 'LAST KNOWN' }));
      } else {
        setMemberError(err instanceof Error ? err.message : 'Failed to load clan members');
        setHealth((current) => ({ ...current, members: 'ERROR' }));
      }
    } finally {
      memberRequestRef.current = false;
      if (showLoading) setMemberLoading(false);
    }
  }, [persistHistorySnapshot, season]);

  const loadRanking = useCallback(async () => {
    if (rankingRequestRef.current) return;
    rankingRequestRef.current = true;
    try {
      setStatus((current) => current === 'live' ? 'live' : 'loading');
      const response = await fetch(`${RANKING_API}?t=${Date.now()}`, {
        cache: 'no-store',
        headers: { Accept: 'application/json' },
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.details || data.error || `HTTP ${response.status}`);
      const rows = Array.isArray(data.rows) ? data.rows : [];
      const previous = previousReputationRef.current;
      const totals = totalGainReputationRef.current;
      const nextRows = rows.map((row) => {
        const id = String(row.clanId || row.clan || row.rank);
        const reputation = cleanNumber(row.reputation);
        const key = `${data.season || 'Season 2'}:${id}`;
        const oldRep = previous[key];
        const reset = oldRep !== undefined && reputation < oldRep;
        const gain = oldRep === undefined || reset ? 0 : Math.max(0, reputation - oldRep);
        previous[key] = reputation;
        if (reset) totals[key] = 0;
        totals[key] = (totals[key] || 0) + gain;
        return { ...row, gain, totalGain: totals[key], resetDetected: reset };
      });
      setClans(nextRows);
      setSeason(data.season || 'Season 2');
      setSeasonEnd(data.seasonEndsAt || FALLBACK_SEASON_END);
      setLastSync(new Date(data.fetchedAt || Date.now()));
      setStatus('live');
      setError('');
      setHealth((current) => ({ ...current, ranking: 'LIVE' }));
      const activeClan = selectedClanRef.current;
      if (activeClan) {
        const updatedSelected = nextRows.find((row) => String(row.clanId) === String(activeClan.clanId));
        if (updatedSelected) setSelectedClan(updatedSelected);
      }
    } catch (err) {
      setStatus('error');
      setError(err instanceof Error ? err.message : 'Failed to load clan ranking');
      setHealth((current) => ({ ...current, ranking: 'ERROR' }));
    } finally {
      rankingRequestRef.current = false;
    }
  }, []);

  useEffect(() => {
    void loadHealth();
    void loadRanking();
    const timer = setInterval(() => void loadRanking(), REFRESH_MS);
    return () => clearInterval(timer);
  }, [loadHealth, loadRanking]);

  const openClanModal = useCallback(async (clan) => {
    selectedClanRef.current = clan;
    setSelectedClan(clan);
    setModalOpen(true);
    setMemberError('');
    setHistoryError('');
    setMemberData(null);
    setHistoryData(null);
    await refreshClanMembers(clan, { showLoading: true });
    await fetchHistory(clan, 168);
  }, [fetchHistory, refreshClanMembers]);

  useEffect(() => {
    const clan = selectedClanRef.current;
    if (!modalOpen || !clan?.clanId) return;
    const timer = setInterval(() => {
      void refreshClanMembers(selectedClanRef.current);
    }, REFRESH_MS);
    return () => clearInterval(timer);
  }, [modalOpen, selectedClan?.clanId, refreshClanMembers]);

  const closeModal = useCallback(() => {
    setModalOpen(false);
    setMemberLoading(false);
    setMemberError('');
    selectedClanRef.current = null;
    setSelectedClan(null);
    setMemberData(null);
    setHistoryData(null);
    setHistoryError('');
    setCopied(false);
  }, []);

  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.key === 'Escape' && modalOpen) closeModal();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [closeModal, modalOpen]);

  const currentMembers = memberData?.members || [];
  const currentHistoryMembers = historyData?.members || {};
  const now = serverNow;
  const windowStart = now - periodHours * 60 * 60 * 1000;

  const memberInsights = useMemo(() => currentMembers.map((member, index) => {
    const id = String(member.id || member.name || `${selectedClan?.clanId || 'clan'}-${index}`);
    const points = Array.isArray(currentHistoryMembers[id]?.points) ? [...currentHistoryMembers[id].points].sort((a, b) => Number(a.t) - Number(b.t)) : [];
    const eligible = points.filter((point) => Number(point.t) <= windowStart);
    const startPoint = eligible[eligible.length - 1] || points[0] || null;
    const currentRep = cleanNumber(member.reputation ?? member.rep);
    const beforeRep = startPoint ? cleanNumber(startPoint.r) : currentRep;
    const measuredMs = startPoint ? Math.max(0, now - Number(startPoint.t)) : 0;
    const measuredHours = measuredMs / 3600000;
    const reset = Boolean(startPoint && currentRep < beforeRep);
    const gain = reset ? 0 : Math.max(0, currentRep - beforeRep);
    const sessionGain = cleanNumber(member.totalGain);
    const status = reset ? 'RESET' : !startPoint ? 'MISSING' : gain > 0 ? 'ACTIVE' : measuredHours >= 0.5 ? 'ZERO' : 'NEW';
    return {
      ...member,
      id,
      beforeRep,
      afterRep: currentRep,
      gain,
      measuredHours,
      startAt: startPoint?.t || null,
      endAt: now,
      sessionGain,
      status,
      statusLabel: statusLabel({ gain, measuredHours, status }),
      points,
    };
  }), [currentMembers, currentHistoryMembers, now, periodHours, selectedClan?.clanId, windowStart]);

  const sortedInsights = useMemo(() => [...memberInsights].sort((a, b) => b.gain - a.gain || b.afterRep - a.afterRep), [memberInsights]);
  const topGainers = sortedInsights.filter((member) => member.gain > 0).slice(0, 5);
  const zeroGain = memberInsights.filter((member) => member.status === 'ZERO');
  const resetMembers = memberInsights.filter((member) => member.status === 'RESET');
  const missingMembers = memberInsights.filter((member) => member.status === 'MISSING');

  const timestampRows = useMemo(() => memberInsights.flatMap((member) => member.points
    .filter((point) => Number(point.t) >= windowStart)
    .map((point) => ({
      member: member.name,
      id: member.id,
      time: Number(point.t),
      rep: cleanNumber(point.r),
    }))
  ).sort((a, b) => b.time - a.time).slice(0, 120), [memberInsights, windowStart]);

  const discordSummary = useMemo(() => {
    const clanName = selectedClan?.clan || 'Clan';
    const lines = [
      `**${clanName} — ${periodHours === 168 ? '7D' : `${periodHours}H`} REP SUMMARY**`,
      `Members: ${currentMembers.length} | Active: ${memberInsights.filter((m) => m.status === 'ACTIVE').length} | Zero: ${zeroGain.length} | Reset: ${resetMembers.length} | Missing: ${missingMembers.length}`,
      '',
      '**TOP GAINERS**',
      ...(topGainers.length ? topGainers.map((member, index) => `${index + 1}. ${member.name} — +${fmt(member.gain)} rep`) : ['None recorded in this window.']),
      '',
      '**ZERO GAIN**',
      ...(zeroGain.length ? zeroGain.map((member) => `${member.name} — ${fmt(member.afterRep)} rep`) : ['None']),
      ...(resetMembers.length ? ['', '**RESETS DETECTED**', ...resetMembers.map((member) => `${member.name} — before ${fmt(member.beforeRep)}, now ${fmt(member.afterRep)}`)] : []),
      `\nUpdated: ${formatDate(now)}`,
    ];
    return lines.join('\n');
  }, [currentMembers.length, missingMembers.length, now, periodHours, resetMembers, selectedClan?.clan, topGainers, zeroGain]);

  const exportMembers = useCallback((format = 'csv') => {
    if (!currentMembers.length) return;
    const safeClan = (selectedClan?.clan || 'clan-members').replace(/[^a-z0-9_-]+/gi, '-').replace(/^-|-$/g, '') || 'clan-members';
    if (format === 'txt') {
      const blob = new Blob([discordSummary], { type: 'text/plain;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `${safeClan}-discord-summary-${periodHours === 168 ? '7d' : `${periodHours}h`}.txt`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
      return;
    }

    const summaryHeaders = ['#', 'Member', 'Lv', 'Before Rep', 'After Rep', 'Rep Gain', 'Measured Hours', 'Start Time', 'End Time', 'Status', 'Current Total Gain'];
    const summaryRows = memberInsights.map((member, index) => [
      index + 1,
      member.name,
      member.level || '-',
      member.beforeRep,
      member.afterRep,
      member.gain,
      member.measuredHours.toFixed(2),
      formatDate(member.startAt),
      formatDate(member.endAt),
      member.statusLabel,
      member.sessionGain,
    ]);
    const historyHeaders = ['Timestamp', 'Member', 'Rep'];
    const historyRows = timestampRows.map((row) => [formatDate(row.time), row.member, row.rep]);
    const metadata = [
      ['Clan', selectedClan?.clan || 'Clan'],
      ['Season', season],
      ['Window', periodHours === 168 ? '7 days' : `${periodHours} hours`],
      ['Exported', formatDate(now)],
      ['History Source', historyStored ? 'Server-side durable history' : 'Local fallback'],
      ['Note', 'Before Rep is the latest stored point at or before the selected window. After Rep is the live/latest displayed rep. Rep Gain is reset-safe and never includes negative reset deltas.'],
    ];
    const rows = [
      ['NZ TRACKER 2.0'],
      ...metadata,
      [],
      summaryHeaders,
      ...summaryRows,
      [],
      ['TIMESTAMP HISTORY'],
      historyHeaders,
      ...historyRows,
    ];
    const csv = rows.map((row) => row.map(csvEscape).join(',')).join('\r\n');
    const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${safeClan}-rep-history-${periodHours === 168 ? '7d' : `${periodHours}h`}.csv`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  }, [currentMembers.length, discordSummary, historyStored, memberInsights, now, periodHours, season, selectedClan?.clan, timestampRows]);

  const copyDiscordSummary = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(discordSummary);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  }, [discordSummary]);

  const countdown = useMemo(() => getCountdown(seasonEnd, serverNow), [seasonEnd, serverNow]);
  const serverTime = getServerTime(serverNow);
  const historyAge = historyData?.updatedAt ? Math.max(0, Math.floor((now - new Date(historyData.updatedAt).getTime()) / 60000)) : null;

  return (
    <div className="site-wrapper">
      <header className="site-header">
        <div className="header-banner">
          <h1>NINJA ZENSHIN</h1>
          <span>Clan Ranking</span>
        </div>
        <div className="server-time-bar">
          <div className="server-time-left">
            <div className={`server-time-dot ${status}`} />
            <span className="server-time-label">Server Time</span>
            <span className="server-time-value">{serverTime} SGT</span>
          </div>
        </div>
      </header>

      <main className="main-content">
        <div className="content-card">
          <div className="card-heading">
            <div>
              <h1>Clan Ranking</h1>
              <div className="clr-season">{season}</div>
            </div>
            <div className="sync-state"><span className={`sync-dot ${status}`} /><span>{status === 'live' ? 'LIVE' : status === 'loading' ? 'SYNCING' : 'ERROR'}</span></div>
          </div>

          <div className="clr-cd">
            <div><b>{countdown.days}</b><span>Days</span></div>
            <div><b>{pad(countdown.hours)}</b><span>Hours</span></div>
            <div><b>{pad(countdown.minutes)}</b><span>Minutes</span></div>
            <div><b>{pad(countdown.seconds)}</b><span>Seconds</span></div>
          </div>

          <div className="ranking-status-row">
            <span>{lastSync ? `Last updated ${lastSync.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}` : 'Connecting to live ranking…'}</span>
            <button type="button" onClick={() => void loadRanking()} disabled={status === 'loading'}>↻ Refresh</button>
          </div>

          {error ? <div className="clr-status err">Failed to load clan ranking ({error})</div> : clans.length === 0 ? <div className="clr-status">Loading clan ranking…</div> : (
            <div className="table-scroll">
              <table className="clr-table">
                <thead><tr><th>#</th><th>Clan</th><th>Master</th><th>Members</th><th className="num">Reputation</th><th className="num">Gain</th><th className="num">Total Gain</th></tr></thead>
                <tbody>{clans.map((clan) => {
                  const isTopTen = Number(clan.rank) >= 1 && Number(clan.rank) <= 10;
                  return <tr key={`${clan.clanId || clan.clan}-${clan.rank}`} className={clan.gain > 0 ? 'gain-row' : ''}>
                    <td className="r">{clan.rank}</td>
                    <td><button type="button" className="clr-mem" onClick={() => void openClanModal(clan)}>{clan.clan}</button></td>
                    <td>{clan.master || '—'}</td>
                    <td className="c">{clan.memberCurrent}/{clan.memberMax}</td>
                    <td className="num">{fmt(clan.reputation)}</td>
                    <td className="num gain-number">{fmt(clan.gain)}</td>
                    <td className="num total-gain-number">{fmt(clan.totalGain)}</td>
                  </tr>;
                })}</tbody>
              </table>
            </div>
          )}

          <div className="clr-foot">Click a clan name to open Live Member Data • Reputation resets are protected from false gain calculations</div>
        </div>
      </main>

      <footer className="site-footer"><p>© 2026 Ninja Zenshin — Created by <a href="https://discord.com/users/396080330702061588" target="_blank" rel="noopener noreferrer">Michol</a></p></footer>

      {modalOpen && <div className="clr-modal show" role="dialog" aria-modal="true" aria-label={`${selectedClan?.clan || 'Clan'} live members`} onMouseDown={(event) => { if (event.target === event.currentTarget) closeModal(); }}>
        <div className="clr-modal-box">
          <div className="clr-modal-head">
            <div className="live-head-main">
              <div className="eyebrow">LIVE MEMBER DATA</div>
              <b>{selectedClan?.clan || 'Clan'}</b>
              <span>{currentMembers.length} members • {periodHours === 168 ? '7D' : `${periodHours}H`} intelligence window</span>
            </div>
            <div className="clr-modal-actions">
              <div className="period-control" role="group" aria-label="Tracking period">
                {PERIODS.map((hours) => <button key={hours} type="button" className={periodHours === hours ? 'active' : ''} onClick={() => { setPeriodHours(hours); void fetchHistory(selectedClanRef.current, hours); }}>{hours === 168 ? '7D' : `${hours}H`}</button>)}
              </div>
              <button type="button" className="clr-modal-export" onClick={() => exportMembers('csv')} disabled={!currentMembers.length}>↧ CSV</button>
              <button type="button" className="clr-modal-export" onClick={() => exportMembers('txt')} disabled={!currentMembers.length}>↧ Discord</button>
              <button type="button" className="clr-modal-x" onClick={closeModal} aria-label="Close">×</button>
            </div>
          </div>

          <div className="health-strip" aria-label="API health">
            <span className={health.ranking === 'LIVE' ? 'ok' : health.ranking === 'ERROR' ? 'bad' : ''}>RANK {health.ranking}</span>
            <span className={health.members === 'LIVE' ? 'ok' : health.members === 'STALE' || health.members === 'LAST KNOWN' ? 'warn' : health.members === 'ERROR' ? 'bad' : ''}>MEMBERS {health.members}</span>
            <span className={health.history === 'DURABLE' ? 'ok' : 'warn'}>HISTORY {health.history}</span>
            {historyAge !== null && <span>SYNC {historyAge < 1 ? 'NOW' : `${historyAge}M AGO`}</span>}
          </div>

          <div className="clr-modal-sub">
            <span>Total Reputation: <b>{fmt(memberData?.reputation ?? selectedClan?.reputation ?? 0)}</b></span>
            <span>{memberData?.stale ? 'Showing last-known server data' : memberError ? memberError : 'Live source connected'}</span>
          </div>

          <div className="intelligence-grid">
            <div><b>{memberInsights.filter((m) => m.status === 'ACTIVE').length}</b><span>ACTIVE</span></div>
            <div><b>{zeroGain.length}</b><span>ZERO GAIN</span></div>
            <div><b>{resetMembers.length}</b><span>RESETS</span></div>
            <div><b>{missingMembers.length}</b><span>MISSING</span></div>
            <div><b>{topGainers[0] ? `+${fmt(topGainers[0].gain)}` : '—'}</b><span>TOP GAIN</span></div>
          </div>

          {historyError && <div className="history-notice">{historyError}</div>}
          {memberLoading && !currentMembers.length ? <div className="clr-status">Loading live members…</div> : memberError && !currentMembers.length ? <div className="clr-status err">{memberError}</div> : (
            <div className="clr-modal-body">
              <div className="table-scroll modal-table-scroll">
                <table className="clr-mtable">
                  <thead><tr><th>#</th><th>Member</th><th>Lv</th><th>Rep</th><th>Before</th><th>Gain</th><th>Measured</th><th>Status</th><th>Total</th></tr></thead>
                  <tbody>{sortedInsights.map((member, index) => <tr key={`${member.id}-${index}`} className={member.status === 'ACTIVE' ? 'gain-row' : ''}>
                    <td className="r">{index + 1}</td>
                    <td>{member.name}</td>
                    <td>{member.level || '—'}</td>
                    <td className="num">{fmt(member.afterRep)}</td>
                    <td className="num before-number">{fmt(member.beforeRep)}</td>
                    <td className="num gain-number">+{fmt(member.gain)}</td>
                    <td className="num">{member.measuredHours.toFixed(2)}h</td>
                    <td><span className={`member-status ${member.status.toLowerCase().replace(/\s+/g, '-')}`}>{member.statusLabel}</span></td>
                    <td className="num total-gain-number">{fmt(member.sessionGain)}</td>
                  </tr>)}</tbody>
                </table>
              </div>

              <div className="insight-columns">
                <section className="insight-panel"><div className="panel-title">TOP GAINERS</div>{topGainers.length ? topGainers.map((member, index) => <div className="insight-row" key={member.id}><span>{index + 1}. {member.name}</span><b>+{fmt(member.gain)}</b></div>) : <div className="insight-empty">No gains recorded.</div>}</section>
                <section className="insight-panel"><div className="panel-title">ZERO GAIN MEMBERS</div>{zeroGain.length ? zeroGain.slice(0, 10).map((member) => <div className="insight-row" key={member.id}><span>{member.name}</span><b>0</b></div>) : <div className="insight-empty">No zero-gain members in this window.</div>}</section>
                <section className="insight-panel"><div className="panel-title">RESET / MISSING</div>{[...resetMembers, ...missingMembers].length ? [...resetMembers, ...missingMembers].slice(0, 10).map((member) => <div className="insight-row" key={member.id}><span>{member.name}</span><b>{member.statusLabel}</b></div>) : <div className="insight-empty">No issues detected.</div>}</section>
              </div>

              <div className="history-panel">
                <div className="panel-title">TIMESTAMP HISTORY <span>{timestampRows.length} points shown</span></div>
                <div className="table-scroll history-table-scroll"><table className="history-table"><thead><tr><th>Timestamp</th><th>Member</th><th>Rep</th></tr></thead><tbody>{timestampRows.map((row) => <tr key={`${row.id}-${row.time}`}><td>{formatDate(row.time)}</td><td>{row.member}</td><td className="num">{fmt(row.rep)}</td></tr>)}</tbody></table></div>
              </div>

              <div className="discord-panel"><div><div className="panel-title">DISCORD-READY SUMMARY</div><pre>{discordSummary}</pre></div><button type="button" onClick={() => void copyDiscordSummary()}>{copied ? '✓ COPIED' : 'COPY SUMMARY'}</button></div>
            </div>
          )}

          <div className="clr-modal-foot">History: {historyStored ? 'server-side durable' : 'local fallback'} • Before/After/Rep Gain are reset-safe • Updated {memberData?.updatedAt ? new Date(memberData.updatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '—'}</div>
        </div>
      </div>}
    </div>
  );
}
