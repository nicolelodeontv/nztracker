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
      <style>{`
        .war-rules-panel{width:min(1200px,calc(100% - 32px));margin:8px auto 0;background:#080f17;border:1px solid #1b2632;border-radius:13px;color:#eef4fa;font-family:'Plus Jakarta Sans',system-ui,sans-serif;overflow:hidden}
        .war-rules-toggle{width:100%;display:flex;justify-content:space-between;align-items:center;gap:12px;padding:10px 12px;border:0;background:#0a1119;color:#dce7ef;text-align:left;cursor:pointer}
        .war-rules-toggle span:first-child{display:grid;gap:3px;min-width:0}.war-rules-toggle b{font:700 .68rem 'Space Mono',monospace;color:#54d7ff;letter-spacing:.03em}.war-rules-toggle small{color:#66758a;font-size:.52rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.war-rules-toggle>span:last-child{flex:0 0 auto;color:#718094;font:700 .48rem 'Space Mono',monospace}
        .war-rules-body{padding:10px;border-top:1px solid #17212b}.war-rules-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:7px}.war-rules-grid>div{padding:9px;border:1px solid #17242f;border-radius:9px;background:#09131b;min-width:0}.war-rules-grid small{display:block;color:#627184;font:600 .42rem 'Space Mono',monospace;letter-spacing:.08em}.war-rules-grid b{display:block;margin-top:4px;font:700 .62rem 'Space Mono',monospace}.war-rules-grid span{display:block;margin-top:3px;color:#78879a;font-size:.49rem;line-height:1.35}
        .war-rewards{margin-top:8px;border:1px solid #17242f;border-radius:9px;overflow:hidden;background:#09131b}.war-rewards-head{display:flex;justify-content:space-between;gap:10px;padding:8px 9px;border-bottom:1px solid #17242f}.war-rewards-head b{font:700 .55rem 'Space Mono',monospace;color:#dce7ef}.war-rewards-head span{font:600 .42rem 'Space Mono',monospace;color:#627184}.war-rewards-list{display:grid;grid-template-columns:repeat(10,1fr)}.war-rewards-list>span{display:grid;gap:3px;padding:8px 6px;border-right:1px solid #17242f;text-align:center;min-width:0}.war-rewards-list>span:last-child{border-right:0}.war-rewards-list b{font:600 .39rem 'Space Mono',monospace;color:#718094;white-space:nowrap}.war-rewards-list strong{font:700 .58rem 'Space Mono',monospace;color:#5de5ad;white-space:nowrap}
        @media(max-width:900px){.war-rules-grid{grid-template-columns:repeat(2,1fr)}.war-rewards-list{grid-template-columns:repeat(5,1fr)}.war-rewards-list>span:nth-child(5n){border-right:0}}
        @media(max-width:560px){.war-rules-panel{width:calc(100% - 14px)}.war-rules-grid{grid-template-columns:1fr}.war-rewards-list{grid-template-columns:repeat(2,1fr)}.war-rewards-list>span{border-bottom:1px solid #17242f}.war-rewards-list>span:nth-child(2n){border-right:0}.war-rewards-list>span:nth-last-child(-n+2){border-bottom:0}}
      `}</style>
      <button className="war-rules-toggle" type="button" onClick={() => setOpen((value) => !value)}>
        <span><b>⚔ CLAN WAR RULES</b><small>Quick Battle · Bleeding · Stamina · Victory Rewards</small></span>
        <span>{open ? 'Hide' : 'Show'}</span>
      </button>
      {open && (
        <div className="war-rules-body">
          <div className="war-rules-grid">
            <div><small>BLEEDING</small><b>50% of members</b><span>At or below each member's 70% Max Stamina threshold.</span></div>
            <div><small>DRAIN FLOOR</small><b>50% of Max Stamina</b><span>Defenders cannot drain below their own floor.</span></div>
            <div><small>STAMINA DRAIN</small><b>1 / 2 / 3 targets</b><span>Solo / 1 party member / 2 party members.</span></div>
            <div><small>ATTACKER</small><b>-10 Stamina</b><span>Party Leader only; leader needs 10+ Stamina.</span></div>
            <div><small>RECOVERY</small><b>+30 Stamina</b><span>Every 30m +10 per Ramen level, at :00 and :30.</span></div>
            <div><small>WAR RESULT</small><b>Bleeding = Victory</b><span>Not Bleeding = loss and 0 Reputation.</span></div>
          </div>
          <div className="war-rewards">
            <div className="war-rewards-head"><b>VICTORY REWARDS</b><span>REPUTATION DIFFERENCE</span></div>
            <div className="war-rewards-list">
              {(rules.rewards || []).map((tier, index) => {
                let label = `< -50,000`;
                if (index === 0) label = '≥ +20,000';
                else if (tier.minDifference === -2000) label = '±2,000';
                else if (Number.isFinite(tier.minDifference)) label = `≥ ${tier.minDifference < 0 ? '' : '+'}${fmt(tier.minDifference)}`;
                return <span key={`${tier.minDifference}-${tier.rep}`}><b>{label}</b><strong>{tier.rep} Rep</strong></span>;
              })}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
