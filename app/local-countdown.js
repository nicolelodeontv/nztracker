'use client';

import { useEffect } from 'react';

// Reliable client-side countdown. No external site/API is required.
// Initial value matches the reference: 21 Days, 15 Hours, 46 Minutes, 27 Seconds.
const START_SECONDS = 21 * 86400 + 15 * 3600 + 46 * 60 + 27;

export default function LocalCountdown() {
  useEffect(() => {
    const startedAt = Date.now();

    const render = () => {
      const grid = document.querySelector('.countdownGrid');
      if (!grid) return;

      const boxes = Array.from(grid.querySelectorAll('.countBox')).slice(0, 4);
      if (boxes.length !== 4) return;

      const elapsed = Math.floor((Date.now() - startedAt) / 1000);
      const remaining = Math.max(0, START_SECONDS - elapsed);
      const days = Math.floor(remaining / 86400);
      const hours = Math.floor((remaining % 86400) / 3600);
      const minutes = Math.floor((remaining % 3600) / 60);
      const seconds = remaining % 60;

      const values = [days, hours, minutes, seconds];
      values.forEach((value, index) => {
        const number = boxes[index].querySelector('b');
        if (number) number.textContent = index === 0 ? String(value) : String(value).padStart(2, '0');
      });

      const labels = ['DAYS', 'HRS', 'MINS', 'SECS'];
      labels.forEach((label, index) => {
        const span = boxes[index].querySelector('span');
        if (span) span.textContent = label;
      });
    };

    render();
    const timer = window.setInterval(render, 1000);
    return () => window.clearInterval(timer);
  }, []);

  return null;
}
