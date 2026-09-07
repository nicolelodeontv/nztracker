'use client';

const items = [
  { href: '#rankings', label: 'Rankings', icon: '▦' },
  { href: '#members', label: 'Members', icon: '♟' },
  { href: '#war', label: 'Clan War', icon: '⚔' },
  { href: '#stamina', label: 'Stamina', icon: '◈' },
  { href: '#rules', label: 'Quick Rules', icon: '◇' }
];

const navStyle = { position: 'sticky', top: 8, zIndex: 1000, width: 'min(1500px, calc(100% - 28px))', minHeight: 58, margin: '8px auto 12px', padding: '7px 10px', display: 'flex', alignItems: 'center', gap: 12, border: '1px solid #2A2824', borderRadius: 12, background: '#141413', boxShadow: '0 12px 35px rgba(0,0,0,.22)', boxSizing: 'border-box' };
const brandStyle = { display: 'flex', alignItems: 'center', gap: 9, flex: '0 0 auto', color: '#F5F3EE', textDecoration: 'none' };
const markStyle = { width: 36, height: 36, display: 'grid', placeItems: 'center', border: '1px solid #514A42', borderRadius: 9, background: '#111110', color: '#F1B39A', font: '800 12px Geist Mono, monospace' };
const linksStyle = { display: 'flex', alignItems: 'center', gap: 5, flex: 1, minWidth: 0, overflowX: 'auto', scrollbarWidth: 'none' };
const linkStyle = { flex: '0 0 auto', minHeight: 40, padding: '0 12px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, border: '1px solid #2A2824', borderRadius: 8, background: '#111110', color: '#AAA49A', textDecoration: 'none', whiteSpace: 'nowrap', font: '700 12px Geist, sans-serif', boxSizing: 'border-box' };

export default function AppNav() {
  return <nav style={navStyle} aria-label="Single-page tracker navigation">
    <a style={brandStyle} href="#rankings" aria-label="Ninja Zenshin Clan Tracker">
      <span style={markStyle}>NZ</span>
      <span>
        <b style={{ display: 'block', font: '800 12px Geist, sans-serif' }}>Ninja Zenshin</b>
        <small style={{ display: 'block', marginTop: 2, color: '#777169', font: '700 8px Geist Mono, monospace', letterSpacing: '.08em' }}>LIVE TRACKER</small>
      </span>
    </a>
    <div style={linksStyle}>
      {items.map((item) => <a key={item.href} href={item.href} style={linkStyle}>
        <span style={{ color: '#D97757', fontSize: 15, lineHeight: 1 }}>{item.icon}</span>
        <span>{item.label}</span>
      </a>)}
    </div>
  </nav>;
}
