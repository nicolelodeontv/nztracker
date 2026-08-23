'use client';

import { useEffect } from 'react';

export default function LiveTimeDisplay() {
  useEffect(() => {
    const format = date => date.toLocaleTimeString('en-US', {
      hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true
    });
    const tick = () => {
      const now = new Date();
      document.querySelectorAll('[data-live-time]').forEach(el => {
        el.textContent = format(now);
      });
    };
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, []);
  return null;
}
