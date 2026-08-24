'use client';

import { useEffect, useMemo, useState } from 'react';
import { getVictoryResult, CLAN_WAR_RULES } from './clan-war-rules';
import './war-next-build.css';

const HISTORY_KEY = 'nztracker:war-history:v1';
const ATTACK_STAMINA_KEY = 'nztracker:attack-stamina:v1';
const DEFAULT_MAX_STAMINA = 200;
const ATTACK_STAMINA_COST = CLAN_WAR_RULES.attackerLeaderCost;
const DEFAULT_ATTACK_STAMINA = 190;
const read = (key, fallback) => { try { return JSON.parse(localStorage.getItem(key) || '') ?? fallback; } catch { return fallback; } };
const write = (key, value) => { try { localStorage.setItem(key, JSON.stringify(value)); } catch {} };
const fmt = (n) => Number(n || 0).toLocaleString('en-US');
const clampStamina = (value) => Math.max(0, Math.min(DEFAULT_MAX_STAMINA, Number(value) || 0));
const slug = (name) => encodeURIComponent(String(name || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''));

export default function WarNextBuild({ rows, server }) {
  const [statuses, setStatuses] = useState({});
  const [ownRep, setOwnRep] = useState('');
  const [party, setParty] = useState(0);
  const [attackStamina, setAttackStamina] = useState(DEFAULT_ATTACK_STAMINA);
  const [discordHealth, setDiscordHealth] = useState('checking');
  const [discordMessage, setDiscordMessage] = useState('');
  const [history, setHistory] = useState([]);
  const [selected, setSelected] = useState('');

  useEffect(() => {
    setHistory(read(HISTORY_KEY, []).slice(0, 30));
    const stored = Number(read(ATTACK_STAMINA_KEY, DEFAULT_ATTACK_STAMINA));
    setAttackStamina(clampStamina(Number.isFinite(stored) ? stored : DEFAULT_ATTACK_STAMINA));
  }, []);

  useEffect(() => write(ATTACK_STAMINA_KEY, attackStamina), [attackStamina]);

  useEffect(() => {
    if (!rows.length) return;
    let active = true;
    const load = async () => {
      try {
        const names = rows.map((r) => r.clan).filter(Boolean).slice(0, 40).map(encodeURIComponent).join(',');
        const response = await fetch(`/api/clan-status?clans=${names}&t=${Date.now()}`, { cache: 'no-store' });
        if (!response.ok) throw new Error();
        const data = await response.json();
        if (active) setStatuses(data.statuses || {});
      } catch {}
    };
    load();
    const timer = setInterval(load, 20000);
    return () => { active = false; clearInterval(timer); };
  }, [rows]);

  const checkDiscord = async () => {
    setDiscordHealth('checking');
    try {
      const response = await fetch('/api/discord/health', { cache: 'no-store' });
      setDiscordHealth(response.ok ? 'ok' : 'error');
    } catch { setDiscordHealth('error'); }
  };

  useEffect(() => { checkDiscord(); }, []);

  const entries = useMemo(() => rows.map((r) => ({ ...r, status: statuses[r.clan] || { state: 'unknown', memberCount: r.memberCurrent || 0 } })), [rows, statuses]);
  const best = useMemo(() => entries.filter((r) => r.status.state === 'bleeding').map((r) => {
    const result = ownRep === '' ? null : getVictoryResult(Number(ownRep), Number(r.reputation || 0), true);
    return { ...r, reward: result?.reputation ?? null, difference: result?.difference ?? null };
  }).sort((a, b) => (b.reward ?? -1) - (a.reward ?? -1) || Number(b.reputation || 0) - Number(a.reputation || 0)).slice(0, 5), [entries, ownRep]);

  const selectedRow = entries.find((r) => r.clan === selected);
  const selectedResult = selectedRow && ownRep !== '' && selectedRow.status.state === 'bleeding'
    ? getVictoryResult(Number(ownRep), Number(selectedRow.reputation || 0), true)
    : null;

  const recordAttack = (success) => {
    if (!selectedRow) return;
    const item = {
      at: Date.now(),
      clan: selectedRow.clan,
      result: success ? 'ready' : 'blocked',
      reward: selectedResult?.reputation ?? 0,
      difference: selectedResult?.difference ?? null,
      party,
      staminaBefore: attackStamina,
      staminaCost: success ? ATTACK_STAMINA_COST : 0,
      staminaAfter: success ? clampStamina(attackStamina - ATTACK_STAMINA_COST) : attackStamina
    };
    if (success) setAttackStamina((value) => clampStamina(value - ATTACK_STAMINA_COST));
    const next = [item, ...history].slice(0, 30);
    setHistory(next);
    write(HISTORY_KEY, next);
  };

  const resetAttackStamina = () => setAttackStamina(DEFAULT_MAX_STAMINA);

  const confidence = (row) => {
    const known = Number(row.status.knownStaminaMembers || 0);
    const total = Number(row.status.memberCount || 0);
    if (!total) return { pct: 0, label: 'UNKNOWN' };
    const pct = Math.round((known / total) * 100);
    return { pct, label: pct >= 100 ? 'CONFIRMED' : pct > 0 ? 'PARTIAL' : 'UNKNOWN' };
  };

  const bestRow = best[0];
  const attackPercent = Math.round((attackStamina / DEFAULT_MAX_STAMINA) * 100);

  return <section className="war-next-build">
    <div className="next-grid">
      <section className="next-panel recommendation">
        <div className="next-head"><div><small>WAR ASSISTANT</small><h2>⚔ Recommended Attack</h2></div><span>best confirmed target</span></div>
        <div className="next-controls"><label>Your Clan Reputation<input value={ownRep} onChange={(e) => setOwnRep(e.target.value.replace(/[^0-9]/g, ''))} placeholder="267419" /></label><div><small>PARTY</small><div className="next-party">{[0,1,2].map((n)=><button className={party===n?'active':''} key={n} onClick={()=>setParty(n)}>{n===0?'SOLO':`+${n}`}</button>)}</div></div></div>

        <div className="attack-stamina-card">
          <div>
            <small>YOUR ATTACK STAMINA</small>
            <strong>{attackStamina} / {DEFAULT_MAX_STAMINA}</strong>
            <span>{attackPercent}% · {ATTACK_STAMINA_COST} stamina per attack</span>
          </div>
          <div className="attack-stamina-meter"><i style={{ width: `${attackPercent}%` }} /></div>
          <div className="attack-stamina-actions">
            <button onClick={resetAttackStamina}>Reset to 200</button>
            <button onClick={() => setAttackStamina((value) => clampStamina(value - ATTACK_STAMINA_COST))} disabled={attackStamina < ATTACK_STAMINA_COST}>−{ATTACK_STAMINA_COST} Attack</button>
          </div>
        </div>

        {bestRow ? <div className="recommended-card"><div className="recommended-title"><span>#1</span><b>{bestRow.clan}</b><strong>{bestRow.reward == null ? 'ENTER REP' : `+${bestRow.reward} REP`}</strong></div><div className="recommended-meta"><span>🔴 BLEEDING</span><span>{confidence(bestRow).pct}% stamina verified</span><span>{bestRow.status.bleedingMembers || 0}/{bestRow.status.memberCount || 0} below threshold</span></div><div className="recommended-actions"><button onClick={()=>{setSelected(bestRow.clan);recordAttack(true);}}>Use Recommended Target</button><a href={`/clan/${slug(bestRow.clan)}`}>Open Clan</a></div></div> : <div className="next-empty">No confirmed Bleeding target available. The assistant will not recommend a target with partial or unknown stamina.</div>}
      </section>

      <section className="next-panel confidence-panel">
        <div className="next-head"><div><small>SOURCE CONFIDENCE</small><h2>Stamina Verification</h2></div><span>real source coverage</span></div>
        <div className="confidence-list">{entries.slice(0, 8).map((row) => { const c = confidence(row); return <a className="confidence-row" key={row.clan} href={`/clan/${slug(row.clan)}`}><span><b>{row.clan}</b><small>{row.status.state === 'bleeding' ? '🔴 BLEEDING' : row.status.state === 'potential-bleeding' ? '🟡 POTENTIAL' : row.status.state === 'healthy' ? '🟢 HEALTHY' : '⚪ UNKNOWN'}</small></span><strong>{c.pct}%</strong></a>; })}</div>
      </section>
    </div>

    <div className="next-grid">
      <section className="next-panel">
        <div className="next-head"><div><small>DISCORD AUTOMATION</small><h2>CHAOS Tracker</h2></div><button className="small-action" onClick={checkDiscord}>Refresh</button></div>
        <div className="discord-health"><span className={`health-dot ${discordHealth}`}>●</span><b>{discordHealth === 'ok' ? 'WEBHOOK CONFIGURED' : discordHealth === 'error' ? 'WEBHOOK NOT READY' : 'CHECKING WEBHOOK'}</b><span>{discordHealth === 'ok' ? 'Server-side Discord endpoint is reachable.' : discordHealth === 'error' ? 'Set DISCORD_WEBHOOK_URL in Vercel Production.' : 'Checking server configuration…'}</span></div>
        <div className="discord-test"><button onClick={async()=>{setDiscordMessage('Sending…');try{const r=await fetch('/api/discord/attack-summary',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({type:'test',stage:'test',clan:'CHAOS Tracker',timestamp:new Date().toISOString()})});const data=await r.json();setDiscordMessage(r.ok?'✅ TEST SENT':`❌ ${data.error || 'Discord test failed'}`)}catch{setDiscordMessage('❌ Network error')}}}>Test Alert</button><span>{discordMessage}</span></div>
      </section>

      <section className="next-panel">
        <div className="next-head"><div><small>ATTACK HISTORY</small><h2>Recent Decisions</h2></div><span>stored locally</span></div>
        <div className="history-list">{history.slice(0, 8).map((item, i)=><div className="history-row" key={`${item.at}-${i}`}><span>{new Date(item.at).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})}</span><b>{item.clan}</b><em className={item.result}>{item.result==='ready'?`READY · +${fmt(item.reward)} REP · ${item.staminaAfter}/${DEFAULT_MAX_STAMINA}`:'BLOCKED'}</em></div>)}{!history.length&&<div className="next-empty">No attack decisions recorded yet.</div>}</div>
      </section>
    </div>
  </section>;
}
