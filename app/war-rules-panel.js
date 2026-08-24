'use client';

import { useEffect, useState } from 'react';

const fmt = (value) => Number(value).toLocaleString('en-US');

export default function WarRulesPanel() {
  const [open, setOpen] = useState(false);
  const [rules, setRules] = useState(null);

  useEffect(() => {
    let active = true;
    fetch('/api/clan-war-rules', { cache: 'no-store' })
      .then((response) => response.ok ? response.json() : null)
      .then((data) => { if (active) setRules(data); })
      .catch(() => {});
    return () => { active = false; };
  }, []);

  if (!rules) return null;

  return (
    <section className="war-rules-panel" aria-label="Clan War rules">
      <button className="war-rules-toggle" type="button" onClick={() => setOpen((value) => !value)}>
        <span><b>⚔ CLAN WAR RULES</b><small>Quick Battle · Bleeding · Stamina · Victory Rewards</small></span>
        <span>{open ? 'Hide' : 'Show'}</span>
      </button>
      {open && (
        <div className="war-rules-body">
          <div className="war-rules-grid">
            <div><small>BLEEDING</small><b>50% of members</b><span>at or below 70% of Max Stamina</span></div>
            <div><small>DRAIN FLOOR</small><b>50% of Max Stamina</b><span>Per defending member</span></div>
            <div><small>DRAIN</small><b>1 / 2 / 3 targets</b><span>Solo / +1 party / +2 party</span></div>
            <div><small>ATTACKER</small><b>-10 Stamina</b><span>Party Leader only</span></div>
            <div><small>RECOVERY</small><b>+30 Stamina</b><span>Every 30m + ramen level bonus</span></div>
            <div><small>BLEED RESULT</small><b>Victory only</b><span>Not bleeding = 0 Rep</span></div>
          </div>
          <div className="war-rewards">
            <div className="war-rewards-head"><b>VICTORY REWARDS</b><span>REPUTATION DIFFERENCE</span></div>
            <div className="war-rewards-list">
              {(rules.rewards || []).map((tier, index) => {
                const next = rules.rewards?.[index - 1]?.minDifference;
                let label = `< ${fmt(next ?? -50000)}`;
                if (index === 0) label = `≥ +${fmt(tier.minDifference)}`;
                else if (tier.minDifference === -2000) label = '±2,000';
                else if (Number.isFinite(next)) label = `≥ ${tier.minDifference < 0 ? '' : '+'}${fmt(tier.minDifference)}`;
                else label = `< -50,000`;
                return <span key={`${tier.minDifference}-${tier.rep}`}><b>{label}</b><strong>{tier.rep} Rep</strong></span>;
              })}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
