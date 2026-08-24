'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import './app-nav.css';

export default function AppNav() {
  const pathname = usePathname();
  const items = [
    { href: '/', label: 'Clan Intelligence', icon: '▣', description: 'Rankings' },
    { href: '/war', label: 'Clan War', icon: '⚔', description: 'Battle Monitor' }
  ];

  return (
    <nav className="app-nav" aria-label="Primary navigation">
      <div className="app-nav-brand">
        <span className="app-nav-mark">NZ</span>
        <span><b>Ninja Zenshin</b><small>LIVE TRACKER</small></span>
      </div>
      <div className="app-nav-links">
        {items.map((item) => {
          const active = pathname === item.href || (item.href !== '/' && pathname.startsWith(item.href));
          return <Link key={item.href} href={item.href} className={`app-nav-link ${active ? 'active' : ''}`}>
            <span className="app-nav-icon">{item.icon}</span>
            <span><b>{item.label}</b><small>{item.description}</small></span>
          </Link>;
        })}
      </div>
    </nav>
  );
}
