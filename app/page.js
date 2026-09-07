'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import './tracker.css';

const REFRESH_MS = 3000;
const SOUND_KEY = 'nztracker:sound-enabled';
const RANKING_API = '/api/clan-ranking';
const MEMBERS_API = '/api/clan-members';

const fmt = (value) => Number(value || 0).toLocaleString('en-US');
const cleanNumber = (value) => Number(String(value ?? '').replace(/[^0-9.-]/g, '')) || 0;

function pad(value) {
  return String(value).padStart(2, '0');
}

function countdownFrom(endDate, now) {
  const end = new Date(endDate || 0).getTime();
  const diff = Number.isFinite(end) ? Math.max(0, end - now) : 0;
  const seconds = Math.floor(diff / 1000);
  return {
    days: Math.floor(seconds / 86400),
    hours: Math.floor(seconds / 3600) % 24,
    minutes: Math.floor(seconds / 60) % 60,
    seconds: seconds % 60,
  };
}

export default function Home() {
  const [clans, setClans] = useState([]);
  const [season, setSeason] = useState('Season 2');
  const [seasonEnd, setSeasonEnd] = useState('2026-09-14T00:00:00+08:00');
  const [serverNow, setServerNow] = useState(Date.now());
  const [status, setStatus] = useState('loading');
  const [error, setError] = useState('');
  const [lastSync, setLastSync] = useState(null);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [previousReputation, setPreviousReputation] = useState({});
  const [totalGainReputation, setTotalGainReputation] = useState({});
  const [memberCache, setMemberCache] = useState({});
  const [previousMemberRep, setPreviousMemberRep] = useState({});
  const [totalMemberGain, setTotalMemberGain] = useState({});
  const [selectedClan, setSelectedClan] = useState(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [memberLoading, setMemberLoading] = useState(false);
  const [memberError, setMemberError] = useState('');

  useEffect(() => {
    try {
      const stored = localStorage.getItem(SOUND_KEY);
      if (stored !== null) setSoundEnabled(stored !== 'false');
    } catch {}
  }, []);

  useEffect(() => {
    const timer = setInterval(() => setServerNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const playGainSound = useCallback(() => {
    if (!soundEnabled || typeof window === 'undefined') return;
    try {
      const audio = new Audio('/beep.mp3');
      audio.volume = 0.8;
      audio.play().catch(() => {});
    } catch {}
  }, [soundEnabled]);

  const refreshClanMembers = useCallback(async (clanId) => {
    if (!clanId) return;
    try {
      const response = await fetch(`${MEMBERS_API}?clanId=${encodeURIComponent(clanId)}&t=${Date.now()}`, { cache: 'no-store' });
      if (!response.ok) return;
      const data = await response.json();
      const members = Array.isArray(data.members) ? data.members : [];
      const nextMembers = members.map((member) => {
        const name = String(member.name || '').trim();
        const level = member.level ?? 0;
        const rep = cleanNumber(member.reputation ?? member.rep);
        const key = `${clanId}_${name.normalize('NFC')}_${level}`;
        const oldRep = previousMemberRep[key];
        let gain = oldRep === undefined ? 0 : rep - oldRep;
        if (!Number.isFinite(gain) || gain < 0) gain = 0;
        const nextTotal = (totalMemberGain[key] || 0) + gain;
        return { ...member, name, rep, gain, totalGain: nextTotal };
      });

      const nextPrev = { ...previousMemberRep };
      const nextTotals = { ...totalMemberGain };
      nextMembers.forEach((member) => {
        const key = `${clanId}_${member.name.normalize('NFC')}_${member.level ?? 0}`;
        nextPrev[key] = member.rep;
        nextTotals[key] = member.totalGain;
      });
      setPreviousMemberRep(nextPrev);
      setTotalMemberGain(nextTotals);
      setMemberCache((current) => ({
        ...current,
        [clanId]: {
          name: data.name || selectedClan?.clan,
          reputation: data.reputation ?? selectedClan?.reputation ?? 0,
          members: nextMembers,
          fetchedAt: data.fetchedAt || new Date().toISOString(),
        },
      }));
    } catch {}
  }, [previousMemberRep, totalMemberGain, selectedClan]);

  const loadRanking = useCallback(async () => {
    try {
      setStatus((current) => current === 'live' ? 'live' : 'loading');
      const response = await fetch(`${RANKING_API}?t=${Date.now()}`, { cache: 'no-store' });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.details || data.error || `HTTP ${response.status}`);

      const rows = Array.isArray(data.rows) ? data.rows : [];
      const nextPrev = { ...previousReputation };
      const nextTotals = { ...totalGainReputation };

      const nextRows = rows.map((row) => {
        const id = String(row.clanId || row.clan || row.rank);
        const currentRep = cleanNumber(row.reputation);
        const oldRep = previousReputation[id];
        let gain = oldRep === undefined ? 0 : currentRep - oldRep;
        if (!Number.isFinite(gain) || gain < 0) gain = 0;
        if (gain > 0) playGainSound();
        nextPrev[id] = currentRep;
        nextTotals[id] = (nextTotals[id] || 0) + gain;
        return { ...row, gain, totalGain: nextTotals[id] };
      });

      setPreviousReputation(nextPrev);
      setTotalGainReputation(nextTotals);
      setClans(nextRows);
      setSeason(data.season || 'Season 2');
      setSeasonEnd(data.seasonEndsAt || '2026-09-14T00:00:00+08:00');
      setLastSync(new Date(data.fetchedAt || Date.now()));
      setStatus('live');
      setError('');

      await Promise.all(nextRows.map((row) => refreshClanMembers(row.clanId)));
    } catch (err) {
      setStatus('error');
      setError(err instanceof Error ? err.message : 'Failed to load clan ranking');
    }
  }, [playGainSound, previousReputation, totalGainReputation, refreshClanMembers]);

  useEffect(() => {
    loadRanking();
    const timer = setInterval(loadRanking, REFRESH_MS);
    return () => clearInterval(timer);
  }, [loadRanking]);

  const countdown = useMemo(() => countdownFrom(seasonEnd, serverNow), [seasonEnd, serverNow]);

  const openClanModal = async (clan) => {
    setSelectedClan(clan);
    setModalOpen(true);
    setMemberError('');
    setMemberLoading(true);
    try {
      await refreshClanMembers(clan.clanId);
    } catch (err) {
      setMemberError(err instanceof Error ? err.message : 'Unable to load members');
    } finally {
      setMemberLoading(false);
    }
  };

  useEffect(() => {
    if (!modalOpen || !selectedClan?.clanId) return;
    const timer = setInterval(() => refreshClanMembers(selectedClan.clanId), REFRESH_MS);
    return () => clearInterval(timer);
  }, [modalOpen, selectedClan, refreshClanMembers]);

  const selectedData = selectedClan ? memberCache[selectedClan.clanId] : null;
  const members = selectedData?.members || [];

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
            <span className="server-time-value">
              {new Intl.DateTimeFormat('en-GB', {
                timeZone: 'Asia/Singapore',
                hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
              }).format(new Date(serverNow))} SGT
            </span>
          </div>
          <button
            type="button"
            id="soundToggle"
            className={`sound-btn ${soundEnabled ? '' : 'off'}`}
            onClick={() => {
              setSoundEnabled((current) => {
                const next = !current;
                try { localStorage.setItem(SOUND_KEY, String(next)); } catch {}
                return next;
              });
            }}
          >
            {soundEnabled ? '🔊 Sound ON' : '🔇 Sound OFF'}
          </button>
        </div>
      </header>

      <main className="main-content">
        <div className="content-panel show">
          <div className="content-card">
            <div className="card-heading">
              <div>
                <h1>Clan Ranking</h1>
                <div className="clr-season" id="clrSeason">{season}</div>
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
              <button type="button" onClick={loadRanking} disabled={status === 'loading'}>↻ Refresh</button>
            </div>

            <div id="clrTableWrap">
              {error ? (
                <div className="clr-status err">Failed to load clan ranking ({error})</div>
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
                      {clans.map((clan) => (
                        <tr key={`${clan.clanId || clan.clan}-${clan.rank}`} className={clan.gain > 0 ? 'gain-row' : ''}>
                          <td className="r">{clan.rank}</td>
                          <td>
                            <button type="button" className="clr-mem" onClick={() => openClanModal(clan)}>
                              {clan.clan}
                            </button>
                          </td>
                          <td>{clan.master || '—'}</td>
                          <td className="c">{clan.memberCurrent}/{clan.memberMax}</td>
                          <td className="sc">{fmt(clan.reputation)}</td>
                          <td className="sc gain-number">{fmt(clan.gain || 0)}</td>
                          <td className="sc total-gain-number">{fmt(clan.totalGain || 0)}</td>
                        </tr>
                      ))}
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
        <div className="clr-modal show" id="clr-modal" role="dialog" aria-modal="true" onMouseDown={(event) => { if (event.target === event.currentTarget) setModalOpen(false); }}>
          <div className="clr-modal-box">
            <div className="clr-modal-head">
              <b id="clr-modal-title">{selectedClan?.clan || 'Clan'}</b>
              <button type="button" className="clr-modal-x" onClick={() => setModalOpen(false)} aria-label="Close">×</button>
            </div>
            <div className="clr-modal-sub">
              Total Reputation: <b>{fmt(selectedData?.reputation ?? selectedClan?.reputation ?? 0)}</b> • {members.length} member(s)
            </div>
            <div className="clr-modal-body" id="clr-modal-body">
              {memberLoading && !members.length ? (
                <div className="clr-status">Loading...</div>
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
                      {[...members].sort((a, b) => cleanNumber(b.rep) - cleanNumber(a.rep)).map((member, index) => (
                        <tr key={`${member.name}-${member.level}-${index}`} className={member.gain > 0 ? 'gain-row' : ''}>
                          <td>{index + 1}</td>
                          <td>{member.name}</td>
                          <td>{member.level || '-'}</td>
                          <td style={{ textAlign: 'right' }}>{fmt(member.rep)}</td>
                          <td style={{ textAlign: 'right' }} className="gain-number">{fmt(member.gain || 0)}</td>
                          <td style={{ textAlign: 'right' }} className="total-gain-number">{fmt(member.totalGain || 0)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
