'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

const REFRESH_MS = 3000;
const RANKING_API = '/api/clan-ranking';
const MEMBERS_API = '/api/clan-members';
const FALLBACK_SEASON_END = '2026-09-14T00:00:00+08:00';

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

  const previousReputationRef = useRef({});
  const totalGainReputationRef = useRef({});
  const previousMemberRepRef = useRef({});
  const totalMemberGainRef = useRef({});
  const selectedClanRef = useRef(null);
  const rankingRequestRef = useRef(false);
  const memberRequestRef = useRef(false);

  useEffect(() => {
    const timer = setInterval(() => setServerNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const refreshClanMembers = useCallback(async (clan, options = {}) => {
    if (!clan?.clanId || memberRequestRef.current) return;
    memberRequestRef.current = true;
    const showLoading = Boolean(options.showLoading);
    if (showLoading) setMemberLoading(true);
    try {
      const response = await fetch(`${MEMBERS_API}?clanId=${encodeURIComponent(clan.clanId)}&t=${Date.now()}`, {
        cache: 'no-store',
        headers: { Accept: 'application/json' },
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.details || data.error || `HTTP ${response.status}`);

      const members = Array.isArray(data.members) ? data.members : [];
      const previous = previousMemberRepRef.current;
      const totals = totalMemberGainRef.current;
      const nextMembers = members.map((member, index) => {
        const id = String(member.id || member.name || `${clan.clanId}-${index}`);
        const reputation = cleanNumber(member.reputation ?? member.rep);
        const oldRep = previous[id];
        let gain = oldRep === undefined ? 0 : reputation - oldRep;
        if (!Number.isFinite(gain) || gain < 0) gain = 0;
        previous[id] = reputation;
        totals[id] = (totals[id] || 0) + gain;
        return { ...member, reputation, rep: reputation, gain, totalGain: totals[id] };
      });

      setMemberData({ ...data, members: nextMembers });
      setMemberError('');
    } catch (err) {
      setMemberError(err instanceof Error ? err.message : 'Failed to load clan members');
    } finally {
      memberRequestRef.current = false;
      if (showLoading) setMemberLoading(false);
    }
  }, []);

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
      if (!response.ok) {
        throw new Error(data.details || data.error || `HTTP ${response.status}`);
      }

      const rows = Array.isArray(data.rows) ? data.rows : [];
      const previous = previousReputationRef.current;
      const totals = totalGainReputationRef.current;
      const nextRows = rows.map((row) => {
        const id = String(row.clanId || row.clan || row.rank);
        const reputation = cleanNumber(row.reputation);
        const oldRep = previous[id];
        let gain = oldRep === undefined ? 0 : reputation - oldRep;
        if (!Number.isFinite(gain) || gain < 0) gain = 0;
        previous[id] = reputation;
        totals[id] = (totals[id] || 0) + gain;
        return { ...row, gain, totalGain: totals[id] };
      });

      setClans(nextRows);
      setSeason(data.season || 'Season 2');
      setSeasonEnd(data.seasonEndsAt || FALLBACK_SEASON_END);
      setLastSync(new Date(data.fetchedAt || Date.now()));
      setStatus('live');
      setError('');

      const activeClan = selectedClanRef.current;
      if (activeClan) {
        const updatedSelected = nextRows.find((row) => row.clanId === activeClan.clanId);
        if (updatedSelected) setSelectedClan(updatedSelected);
      }
    } catch (err) {
      setStatus('error');
      setError(err instanceof Error ? err.message : 'Failed to load clan ranking');
    } finally {
      rankingRequestRef.current = false;
    }
  }, []);

  useEffect(() => {
    void loadRanking();
    const timer = setInterval(() => void loadRanking(), REFRESH_MS);
    return () => clearInterval(timer);
  }, [loadRanking]);

  const countdown = useMemo(() => getCountdown(seasonEnd, serverNow), [seasonEnd, serverNow]);

  const openClanModal = useCallback(async (clan) => {
    selectedClanRef.current = clan;
    setSelectedClan(clan);
    setModalOpen(true);
    setMemberError('');
    setMemberData(null);
    await refreshClanMembers(clan, { showLoading: true });
  }, [refreshClanMembers]);

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
  }, []);

  const currentMembers = memberData?.members || [];
  const serverTime = getServerTime(serverNow);

  const exportMembers = useCallback(() => {
    if (!currentMembers.length) return;

    const escapeCsv = (value) => {
      const text = String(value ?? '');
      return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
    };

    const headers = ['#', 'Member', 'Lv', 'Rep', 'Gain', 'Total Gain'];
    const rows = currentMembers.map((member, index) => [
      index + 1,
      member.name,
      member.level || '-',
      member.reputation ?? member.rep ?? 0,
      member.gain || 0,
      member.totalGain || 0,
    ]);
    const csv = [headers, ...rows]
      .map((row) => row.map(escapeCsv).join(','))
      .join('\r\n');

    const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${(selectedClan?.clan || 'clan-members').replace(/[^a-z0-9_-]+/gi, '-').replace(/^-|-$/g, '') || 'clan-members'}-members.csv`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  }, [currentMembers, selectedClan]);

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
        <div className="content-panel show">
          <div className="content-card">
            <div className="card-heading">
              <div>
                <h1>Clan Ranking</h1>
                <div className="clr-season">{season}</div>
              </div>
              <div className="sync-state">
                <span className={`sync-dot ${status}`} />
                <span>{status === 'live' ? 'LIVE' : status === 'loading' ? 'SYNCING' : 'ERROR'}</span>
              </div>
            </div>

            <div className="clr-cd" data-clrcd="">
              <div><b>{countdown.days}</b><span>Days</span></div>
              <div><b>{pad(countdown.hours)}</b><span>Hours</span></div>
              <div><b>{pad(countdown.minutes)}</b><span>Minutes</span></div>
              <div><b>{pad(countdown.seconds)}</b><span>Seconds</span></div>
            </div>

            <div className="ranking-status-row">
              <span>{lastSync ? `Last updated ${lastSync.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}` : 'Connecting to live ranking…'}</span>
              <button type="button" onClick={() => void loadRanking()} disabled={status === 'loading'}>↻ Refresh</button>
            </div>

            <div id="clrTableWrap">
              {error ? (
                <div className="clr-status err">Failed to load clan ranking ({error})</div>
              ) : clans.length === 0 ? (
                <div className="clr-status">Loading clan ranking…</div>
              ) : (
                <div className="table-scroll">
                  <table className="clr-table">
                    <thead>
                      <tr>
                        <th>#</th>
                        <th>Clan</th>
                        <th>Master</th>
                        <th>Members</th>
                        <th style={{ textAlign: 'right' }}>Reputation</th>
                        <th style={{ textAlign: 'right' }}>Gain</th>
                        <th style={{ textAlign: 'right' }}>Total Gain</th>
                      </tr>
                    </thead>
                    <tbody>
                      {clans.map((clan) => {
                        const isTopTen = Number(clan.rank) >= 1 && Number(clan.rank) <= 10;
                        return (
                          <tr
                            key={`${clan.clanId || clan.clan}-${clan.rank}`}
                            className={[clan.gain > 0 ? 'gain-row' : ''].filter(Boolean).join(' ')}
                            style={isTopTen ? {
                              background: 'rgba(217,119,87,.075)',
                              boxShadow: 'inset 3px 0 0 #D97757',
                            } : undefined}
                          >
                            <td className="r" style={isTopTen ? { color: '#D97757', fontWeight: 800 } : undefined}>{clan.rank}</td>
                            <td>
                              <button
                                type="button"
                                className="clr-mem"
                                onClick={() => void openClanModal(clan)}
                                style={isTopTen ? { color: '#F0A184', fontWeight: 800 } : undefined}
                              >
                                {clan.clan}
                              </button>
                            </td>
                            <td>{clan.master || '—'}</td>
                            <td className="c">{clan.memberCurrent}/{clan.memberMax}</td>
                            <td className="sc">{fmt(clan.reputation)}</td>
                            <td className="sc gain-number">{fmt(clan.gain || 0)}</td>
                            <td className="sc total-gain-number">{fmt(clan.totalGain || 0)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className="clr-foot">Click a clan name to see its members • Reputation resets each season</div>
          </div>
        </div>
      </main>

      <footer className="site-footer">
        <p>© 2026 Ninja Zenshin — Unofficial Fan Tracker</p>
      </footer>

      {modalOpen && (
        <div
          className="clr-modal show"
          id="clr-modal"
          role="dialog"
          aria-modal="true"
          aria-label={`${selectedClan?.clan || 'Clan'} members`}
          onMouseDown={(event) => { if (event.target === event.currentTarget) closeModal(); }}
        >
          <div className="clr-modal-box">
            <div className="clr-modal-head">
              <b>{selectedClan?.clan || 'Clan'}</b>
              <div className="clr-modal-actions">
                <button
                  type="button"
                  className="clr-modal-export"
                  onClick={exportMembers}
                  disabled={!currentMembers.length}
                  title="Export the current member list as CSV"
                >
                  ↧ Export
                </button>
                <button type="button" className="clr-modal-x" onClick={closeModal} aria-label="Close">×</button>
              </div>
            </div>
            <div className="clr-modal-sub">
              Total Reputation: <b>{fmt(memberData?.reputation ?? selectedClan?.reputation ?? 0)}</b> • {currentMembers.length} member(s)
            </div>
            <div className="clr-modal-body" id="clr-modal-body">
              {memberLoading && !currentMembers.length ? (
                <div className="clr-status">Loading members…</div>
              ) : memberError ? (
                <div className="clr-status err">{memberError}</div>
              ) : (
                <div className="table-scroll modal-table-scroll">
                  <table className="clr-mtable">
                    <thead>
                      <tr>
                        <th>#</th>
                        <th>Member</th>
                        <th>Lv</th>
                        <th>Rep</th>
                        <th>Gain</th>
                        <th>Total Gain</th>
                      </tr>
                    </thead>
                    <tbody>
                      {currentMembers.map((member, index) => (
                        <tr key={`${member.id || member.name || 'member'}-${index}`}>
                          <td className="r">{index + 1}</td>
                          <td>{member.name}</td>
                          <td>{member.level || '—'}</td>
                          <td className="sc">{fmt(member.reputation ?? member.rep)}</td>
                          <td className="sc gain-number">{fmt(member.gain || 0)}</td>
                          <td className="sc total-gain-number">{fmt(member.totalGain || 0)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
            <div className="clr-modal-foot">
              {memberData?.updatedAt ? `Updated ${new Date(memberData.updatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}` : 'Live member data'}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
