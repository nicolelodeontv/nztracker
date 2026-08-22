'use client';

import { useEffect } from 'react';

export default function NavBehavior() {
  useEffect(() => {
    const actions = {
      Leaderboard: () => document.querySelector('.tableCard')?.scrollIntoView({ behavior: 'smooth', block: 'start' }),
      'Clan activity': () => document.querySelector('.podium')?.scrollIntoView({ behavior: 'smooth', block: 'start' }),
      Notifications: () => {
        const badge = document.querySelector('.liveBadge');
        if (!badge) return;
        badge.animate([{ opacity: 1 }, { opacity: .35 }, { opacity: 1 }], { duration: 450 });
      },
      Members: () => document.querySelector('.tableCard')?.scrollIntoView({ behavior: 'smooth', block: 'start' }),
    };

    const buttons = Array.from(document.querySelectorAll('.sideNav .navItem:not(.settings)'));
    const handlers = buttons.map(button => {
      const handler = () => actions[button.getAttribute('aria-label')]?.();
      button.addEventListener('click', handler);
      return [button, handler];
    });

    return () => handlers.forEach(([button, handler]) => button.removeEventListener('click', handler));
  }, []);

  return null;
}
