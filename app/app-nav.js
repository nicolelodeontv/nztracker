'use client';

const items = [
  { href: '#command', label: 'Command Center', icon: '⌂' },
  { href: '#rankings', label: 'Rankings', icon: '▦' },
  { href: '#members', label: 'Members', icon: '♟' },
  { href: '#war', label: 'Clan War', icon: '⚔' },
  { href: '#stamina', label: 'Stamina', icon: '◈' },
  { href: '#rules', label: 'Quick Rules', icon: '◇' }
];

const navStyle = { position: 'sticky', top: 8, zIndex: 1000, width: 'min(1500px, calc(100% - 28px))', minHeight: 58, margin: '8px auto 12px', padding: '7px 10px', display: 'flex', alignItems: 'center', gap: 12, border: '1px solid #26313d', borderRadius: 12, background: '#080f17', boxShadow: '0 12px 35px rgba(0,0,0,.28)', boxSizing: 'border-box' };
const brandStyle = { display: 'flex', alignItems: 'center', gap: 9, flex: '0 0 auto', color: '#eef4fa', textDecoration: 'none' };
const markStyle = { width: 36, height: 36, display: 'grid', placeItems: 'center', border: '1px solid #315a70', borderRadius: 9, background: '#0b141d', color: '#54d7ff', font: '800 12px Space Mono, monospace' };
const linksStyle = { display: 'flex', alignItems: 'center', gap: 6, flex: 1, minWidth: 0, overflowX: 'auto', scrollbarWidth: 'none' };
const linkStyle = { flex: '0 0 auto', minHeight: 40, padding: '0 12px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, border: '1px solid #1b2632', borderRadius: 8, background: '#0a1119', color: '#c6d1dc', textDecoration: 'none', whiteSpace: 'nowrap', font: '700 12px Plus Jakarta Sans, sans-serif', boxSizing: 'border-box' };

export default function AppNav() {
  return <nav style={navStyle} aria-label="Single-page tracker navigation">
    <a style={brandStyle} href="#command" aria-label="Ninja Zenshin Command Center">
      <span style={markStyle}>NZ</span>
      <span>
        <b style={{ display: 'block', font: '800 12px Plus Jakarta Sans, sans-serif' }}>Ninja Zenshin</b>
        <small style={{ display: 'block', marginTop: 2, color: '#718097', font: '700 8px Space Mono, monospace', letterSpacing: '.08em' }}>LIVE TRACKER</small>
      </span>
    </a>
    <div style={linksStyle}>
      {items.map((item) => <a key={item.href} href={item.href} style={linkStyle}>
        <span style={{ color: '#54d7ff', fontSize: 15, lineHeight: 1 }}>{item.icon}</span>
        <span>{item.label}</span>
      </a>)}
    </div>
  </nav>;
}
