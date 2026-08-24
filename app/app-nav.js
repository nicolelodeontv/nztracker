'use client';

const items = [
  { href: '#command', label: 'Command Center', icon: '⌂' },
  { href: '#rankings', label: 'Rankings', icon: '▦' },
  { href: '#members', label: 'Members', icon: '♟' },
  { href: '#war', label: 'Clan War', icon: '⚔' },
  { href: '#stamina', label: 'Stamina', icon: '◈' },
  { href: '#rules', label: 'Quick Rules', icon: '◇' },
  { href: '#settings', label: 'Settings', icon: '⚙' }
];

export default function AppNav() {
  return <nav className="app-nav" aria-label="Single-page tracker navigation">
    <a className="app-nav-brand" href="#command"><span className="app-nav-mark">NZ</span><span><b>Ninja Zenshin</b><small>ONE-PAGE LIVE TRACKER</small></span></a>
    <div className="app-nav-links">{items.map((item) => <a key={item.href} href={item.href} className="app-nav-link"><span className="app-nav-icon">{item.icon}</span><span><b>{item.label}</b></span></a>)}</div>
  </nav>;
}
