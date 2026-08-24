'use client';

const items = [
  { href: '#command', label: 'Command Center', icon: '⌂', description: 'Overview' },
  { href: '#rankings', label: 'Rankings', icon: '▣', description: 'Live clans' },
  { href: '#members', label: 'Members', icon: '♟', description: 'Live roster' },
  { href: '#war', label: 'Clan War', icon: '⚔', description: 'Target & attack' },
  { href: '#stamina', label: 'Stamina', icon: '◉', description: 'Command center' },
  { href: '#rules', label: 'Rules', icon: '◈', description: 'Quick reference' }
];

export default function AppNav() {
  return (
    <nav className="app-nav" aria-label="Tracker sections">
      <a className="app-nav-brand" href="#command">
        <span className="app-nav-mark">NZ</span>
        <span><b>Ninja Zenshin</b><small>ONE-PAGE LIVE TRACKER</small></span>
      </a>
      <div className="app-nav-links">
        {items.map((item) => (
          <a key={item.href} href={item.href} className="app-nav-link">
            <span className="app-nav-icon">{item.icon}</span>
            <span><b>{item.label}</b><small>{item.description}</small></span>
          </a>
        ))}
      </div>
    </nav>
  );
}
