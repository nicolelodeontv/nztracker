'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import './site-nav.css';

export default function SiteNav() {
  const pathname = usePathname();
  const items = [
    { href: '/', label: '▣ Clan Intelligence', sub: 'LIVE RANKING' },
    { href: '/war', label: '⚔ Clan War', sub: 'BATTLE MONITOR' }
  ];

  return (
    <nav className="site-nav" aria-label="Primary navigation">
      <div className="site-nav-inner">
        <Link href="/" className="site-brand" aria-label="NZ Tracker home">
          <span className="site-brand-mark">NZ</span>
          <span><b>NZTRACKER</b><small>CLAN COMMAND</small></span>
        </Link>
        <div className="site-tabs">
          {items.map((item) => {
            const active = item.href === '/' ? pathname === '/' : pathname.startsWith(item.href);
            return (
              <Link key={item.href} href={item.href} className={`site-tab ${active ? 'active' : ''}`}>
                <span>{item.label}</span><small>{item.sub}</small>
              </Link>
            );
          })}
        </div>
        <div className="site-nav-status"><span>●</span> LIVE APP</div>
      </div>
    </nav>
  );
}
