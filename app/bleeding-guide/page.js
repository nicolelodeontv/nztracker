import Link from 'next/link';

const rules = [
  {
    title: '1. What is Bleeding?',
    body: <p>A clan enters the <strong>Bleeding</strong> state when <strong>50% or more of its members have 70 Stamina or less</strong>. Once a clan enters Bleeding, it remains in that state until <strong>all clan members have fully recovered their Stamina</strong>.</p>,
  },
  {
    title: '2. How Clan War Attacks Work',
    body: <ul><li><strong>Target is not Bleeding:</strong> you always lose and receive <strong>0 Reputation</strong>, but the attack still reduces the enemy clan&apos;s Stamina.</li><li><strong>Target is Bleeding:</strong> you always win and receive Reputation based on the Reputation difference between the clans.</li></ul>,
  },
  {
    title: '3. Stamina Drain',
    body: <ul><li><strong>Solo Attack:</strong> drains 1 defending member with the highest Stamina.</li><li><strong>1 Party Member:</strong> drains 2 defending members with the highest Stamina.</li><li><strong>2 Party Members:</strong> drains 3 defending members with the highest Stamina.</li><li>Each affected member loses <strong>10 Stamina</strong> per attack.</li><li>Stamina cannot be reduced below <strong>50</strong>.</li><li>Once the defending clan enters Bleeding, Stamina Drain stops until the clan fully recovers.</li></ul>,
  },
  {
    title: '4. Attacker Stamina',
    body: <ul><li>Each attack consumes <strong>10 Stamina</strong> from the <strong>Party Leader only</strong>.</li><li>Recruited party members do not consume their own Stamina.</li><li>A Party Leader with less than <strong>10 Stamina</strong> cannot attack.</li></ul>,
  },
  {
    title: '5. Stamina Recovery',
    body: <ul><li>All clan members recover automatically every <strong>30 minutes</strong>.</li><li>Base Recovery: <strong>+30 Stamina</strong>.</li><li><strong>Ramen Building</strong> adds <strong>+10 Stamina per level</strong>.</li><li>Recovery happens every <strong>:00</strong> and <strong>:30</strong> on Server Time.</li></ul>,
  },
  {
    title: '6. Reputation Rewards',
    body: <div className="rewards"><div><span>Rep Difference</span><b>Reward</b></div><div><span>≥ +20,000</span><b>30 Rep</b></div><div><span>≥ +10,000</span><b>25 Rep</b></div><div><span>≥ +2,000</span><b>20 Rep</b></div><div><span>±2,000</span><b>15 Rep</b></div><div><span>≥ -10,000</span><b>12 Rep</b></div><div><span>≥ -20,000</span><b>9 Rep</b></div><div><span>&lt; -20,000</span><b>6 Rep</b></div><p className="note">You only earn Reputation when you win. Losing always grants <strong>0 Reputation</strong>.</p></div>,
  },
];

export const metadata = {
  title: 'Clan War — Bleeding System Guide',
  description: 'A shareable guide explaining the Ninja Zenshin Clan War Bleeding System.'
};

export default function BleedingGuide() {
  return <main className="guide"><style>{`*{box-sizing:border-box}.guide{min-height:100vh;background:#06080d;color:#eef4fa;padding:28px 18px 60px;font-family:Manrope,system-ui,sans-serif}.wrap{width:min(900px,100%);margin:auto}.top{display:flex;justify-content:space-between;gap:16px;align-items:center;margin-bottom:28px}.brand{font:800 .68rem 'JetBrains Mono',monospace;letter-spacing:.1em;color:#54d7ff}.back{color:#9aa7b6;text-decoration:none;font:600 .6rem 'JetBrains Mono',monospace;border:1px solid #26303d;padding:8px 10px;border-radius:8px}.back:hover{color:#54d7ff;border-color:#54d7ff}.hero{padding:26px 0 24px;border-bottom:1px solid #1b2632}.eyebrow{color:#6f7e91;font:700 .55rem 'JetBrains Mono',monospace;letter-spacing:.12em}.hero h1{margin:9px 0 0;font:800 clamp(2.2rem,6vw,4.6rem)/.97 'Space Grotesk',sans-serif;letter-spacing:-.05em;background:linear-gradient(105deg,#fff,#54d7ff 55%,#a875ff);-webkit-background-clip:text;color:transparent}.hero p{max-width:700px;color:#8794a6;line-height:1.65;font-size:.84rem;margin:16px 0 0}.card{margin-top:12px;padding:20px;border:1px solid #1b2632;border-radius:14px;background:#0a1119}.card h2{margin:0 0 10px;font:700 1rem 'Space Grotesk',sans-serif}.card p,.card li{color:#aeb9c7;font-size:.76rem;line-height:1.7}.card ul{margin:0;padding-left:20px}.card strong{color:#eef4fa}.rewards{display:grid;grid-template-columns:1fr 1fr;border:1px solid #1b2632;border-radius:10px;overflow:hidden}.rewards>div{display:flex;justify-content:space-between;gap:12px;padding:10px 12px;border-bottom:1px solid #17212b}.rewards>div:nth-child(odd){border-right:1px solid #17212b}.rewards span{color:#7c8a9c;font:600 .58rem 'JetBrains Mono',monospace}.rewards b{color:#5de5ad;font:700 .62rem 'JetBrains Mono',monospace}.note{grid-column:1/-1;margin:0;padding:12px;color:#9aa7b6;font-size:.68rem}.footer{margin-top:24px;color:#5f6e82;font:500 .55rem 'JetBrains Mono',monospace;text-align:center}@media(max-width:600px){.guide{padding:18px 12px 40px}.top{align-items:flex-start}.hero{padding-top:18px}.card{padding:15px}.rewards{grid-template-columns:1fr}.rewards>div:nth-child(odd){border-right:0}}`}</style><div className="wrap"><div className="top"><span className="brand">NINJA ZENSHIN // CLAN WAR</span><Link className="back" href="/">← Tracker</Link></div><section className="hero"><div className="eyebrow">SHAREABLE COMMUNITY GUIDE</div><h1>Bleeding System Guide</h1><p>Hii <strong>Zenshin Shinobi</strong> 👋 This page explains the current Clan War Bleeding System in a format that is easy to share in Discord.</p></section>{rules.map((rule)=><section className="card" key={rule.title}><h2>{rule.title}</h2>{rule.body}</section>)}<div className="footer">Keep this page bookmarked for the current Clan War rules · /bleeding-guide</div></div></main>;
}
