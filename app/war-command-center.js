'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { getAffectedTargets, getBleedingThreshold, getDrainFloor, getRecoveryAmount, getVictoryResult } from './clan-war-rules';
import './war-command-center.css';

const WATCH_KEY = 'nztracker:watchlist:v2';
const STATUS_POLL_MS = 20_000;

const readWatch = () => {
  try { return JSON.parse(localStorage.getItem(WATCH_KEY) || '[]').filter(Boolean); } catch { return []; }
};

const writeWatch = (value) => {
  try { localStorage.setItem(WATCH_KEY, JSON.stringify(value)); } catch {}
};

const fmt = (value) => Number(value || 0).toLocaleString('en-US');

export default function WarCommandCenter() {
  const [rows, setRows] = useState([]);
  const [statuses, setStatuses] = useState({});
  const [watchlist, setWatchlist] = useState([]);
  const [sourceStatus, setSourceStatus] = useState('checking');
  const [fetchedAt, setFetchedAt] = useState(null);
  const [selected, setSelected] = useState(null);
  const [attackerRep, setAttackerRep] = useState('');
  const [defenderRep, setDefenderRep] = useState('');
  const [partySize, setPartySize] = useState('0');

  const refresh = useCallback(async () => {
    try {
      const response = await fetch(`/api/clan-ranking?t=${Date.now()}`, { cache: 'no-store' });
      if (!response.ok) throw new Error();
      const ranking = await response.json();
      const nextRows = Array.isArray(ranking.rows) ? ranking.rows : [];
      setRows(nextRows);
      setFetchedAt(new Date(ranking.fetchedAt || Date.now()));

      const clans = nextRows.map((row) => row.clan).filter(Boolean).slice(0, 25);
      if (!clans.length) throw new Error();
      const statusResponse = await fetch(`/api/clan-status?clans=${encodeURIComponent(clans.join(','))}&t=${Date.now()}`, { cache: 'no-store' });
      if (!statusResponse.ok) throw new Error();
      const data = await statusResponse.json();
      setStatuses(data.statuses || {});
      setSourceStatus('live');
    } catch {
      setSourceStatus('error');
    }
  }, []);

  useEffect(() => {
    setWatchlist(readWatch());
    refresh();
    const timer = setInterval(refresh, STATUS_POLL_MS);
    return () => clearInterval(timer);
  }, [refresh]);

  const bleeding = useMemo(() => rows.filter((row) => statuses[row.clan]?.state === 'bleeding'), [rows, statuses]);
  const potential = useMemo(() => rows.filter((row) => statuses[row.clan]?.state === 'unknown'), [rows, statuses]);
  const watched = useMemo(() => rows.filter((row) => watchlist.includes(row.clan)), [rows, watchlist]);

  const toggleWatch = (clan) => {
    const next = watchlist.includes(clan) ? watchlist.filter((item) => item !== clan) : [...watchlist, clan];
    setWatchlist(next);
    writeWatch(next);
  };

  const calculator = useMemo(() => {
    const result = getVictoryResult(Number(attackerRep || 0), Number(defenderRep || 0), selected ? statuses[selected.clan]?.state === 'bleeding' : false);
    return { ...result, targets: getAffectedTargets(Number(partySize || 0)) };
  }, [attackerRep, defenderRep, partySize, selected, statuses]);

  return (
    <>
      <section className="war-command-center" aria-label="Clan War command center">
        <div className="wcc-head">
          <div><div className="wcc-eyebrow">CLAN WAR CONTROL</div><h2>Battle Monitor</h2><p>Live Bleeding status, Watchlist, recovery rules and victory reward calculator.</p></div>
          <div className="wcc-health"><span className={`wcc-dot ${sourceStatus}`}>●</span><span>{sourceStatus === 'live' ? 'SOURCE OK' : sourceStatus === 'error' ? 'SOURCE ERROR' : 'CHECKING'}</span><small>{fetchedAt ? `Updated ${fetchedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}` : '—'}</small></div>
        </div>

        <div className="wcc-strip">
          <div className="wcc-strip-item danger"><b>{bleeding.length}</b><span>BLEEDING NOW</span></div>
          <div className="wcc-strip-item"><b>{watched.length}</b><span>WATCHED</span></div>
          <div className="wcc-strip-item"><b>{potential.length}</b><span>STATUS UNKNOWN</span></div>
          <div className="wcc-strip-note"><b>Recovery</b><span>+30 STA + {`Ramen × 10`} every 30m</span></div>
        </div>

        <div className="wcc-grid">
          <div className="wcc-panel">
            <div className="wcc-panel-head"><div><b>🔴 BLEEDING NOW</b><small>Real stamina status when source data is available</small></div><button onClick={refresh}>↻</button></div>
            <div className="wcc-list">
              {bleeding.length ? bleeding.slice(0, 8).map((row) => {
                const state = statuses[row.clan];
                return <button className="wcc-row" key={row.clan} onClick={() => setSelected(row)}><span className="wcc-rank">#{row.rank}</span><span className="wcc-name"><b>{row.clan}</b><small>{state.bleedingMembers}/{state.memberCount} members below threshold</small></span><strong>🔴</strong></button>;
              }) : <div className="wcc-empty">No confirmed bleeding clans right now.</div>}
            </div>
          </div>

          <div className="wcc-panel">
            <div className="wcc-panel-head"><div><b>★ WATCHLIST</b><small>Saved in this browser</small></div><span>{watchlist.length}</span></div>
            <div className="wcc-list">
              {watched.length ? watched.slice(0, 8).map((row) => <button className="wcc-row" key={row.clan} onClick={() => setSelected(row)}><span className="wcc-rank">#{row.rank}</span><span className="wcc-name"><b>{row.clan}</b><small>{statuses[row.clan]?.state === 'bleeding' ? '🔴 BLEEDING' : statuses[row.clan]?.state === 'healthy' ? '🟢 HEALTHY' : '⚪ UNKNOWN'}</small></span><span onClick={(event) => { event.stopPropagation(); toggleWatch(row.clan); }}>★</span></button>) : <div className="wcc-empty">Star clans in the ranking to build your Watchlist.</div>}
            </div>
          </div>
        </div>

        <div className="wcc-calculator">
          <div className="wcc-panel-head"><div><b>⚔ WAR REWARD CALCULATOR</b><small>Quick Battle • victory only on Bleeding targets</small></div></div>
          <div className="wcc-calc-grid">
            <label><span>Your Clan Rep</span><input inputMode="numeric" value={attackerRep} onChange={(event) => setAttackerRep(event.target.value.replace(/\D/g, ''))} placeholder="267419" /></label>
            <label><span>Target Clan Rep</span><input inputMode="numeric" value={defenderRep} onChange={(event) => setDefenderRep(event.target.value.replace(/\D/g, ''))} placeholder="255902" /></label>
            <label><span>Party Members</span><select value={partySize} onChange={(event) => setPartySize(event.target.value)}><option value="0">Solo</option><option value="1">+1 Party</option><option value="2">+2 Party</option></select></label>
            <div className="wcc-result"><span>REP DIFFERENCE</span><b>{calculator.difference >= 0 ? '+' : '−'}{fmt(Math.abs(calculator.difference))}</b></div>
            <div className={`wcc-result ${calculator.won ? 'win' : 'lose'}`}><span>RESULT</span><b>{selected ? (calculator.won ? `WIN · ${calculator.reputation} REP` : 'LOSS · 0 REP') : 'Select a bleeding target'}</b></div>
            <div className="wcc-result"><span>DEFENDER DRAIN</span><b>{calculator.targets} target{calculator.targets === 1 ? '' : 's'} × 10 STA</b></div>
          </div>
          {selected && <div className="wcc-selected"><span>{selected.clan}</span><span>{statuses[selected.clan]?.state === 'bleeding' ? '🔴 BLEEDING' : statuses[selected.clan]?.state === 'healthy' ? '🟢 NOT BLEEDING' : '⚪ STATUS UNKNOWN'}</span><span><button onClick={() => toggleWatch(selected.clan)}>{watchlist.includes(selected.clan) ? '★ Watched' : '☆ Watch'}</button></span></div>}
        </div>

        <div className="wcc-rules-mini">
          <div><b>100 Max</b><span>50 floor / 70 bleed</span></div>
          <div><b>150 Max</b><span>75 floor / 105 bleed</span></div>
          <div><b>200 Max</b><span>100 floor / 140 bleed</span></div>
          <div><b>Attacker</b><span>-10 STA leader</span></div>
          <div><b>Recovery</b><span>+30 + ramen</span></div>
        </div>
      </section>

      {selected && <div className="wcc-modal" onMouseDown={(event) => event.target === event.currentTarget && setSelected(null)}><div className="wcc-modal-box"><div className="wcc-modal-head"><div><div className="wcc-eyebrow">CLAN WAR STATUS</div><h3>{selected.clan}</h3><p>#{selected.rank} · {fmt(selected.reputation)} REP · {selected.memberCurrent}/{selected.memberMax} members</p></div><button onClick={() => setSelected(null)}>×</button></div>{statuses[selected.clan]?.members ? <div className="wcc-stamina-list">{statuses[selected.clan].members.map((member) => <div className="wcc-stamina-row" key={member.name}><b>{member.name}</b><span>{fmt(member.current)} / {fmt(member.max)} STA</span><span>Threshold {fmt(getBleedingThreshold(member.max))}</span><strong className={member.bleeding ? 'low' : 'ok'}>{member.bleeding ? '🔴' : '🟢'}</strong><small>Floor {fmt(getDrainFloor(member.max))}</small></div>)}</div> : <div className="wcc-empty">Stamina data is not exposed by the current source, so the clan status is UNKNOWN.</div>}<div className="wcc-modal-foot">Recovery every 30m · +{fmt(getRecoveryAmount(0))} base + ramen bonus</div></div></div>}
    </>
  );
}
