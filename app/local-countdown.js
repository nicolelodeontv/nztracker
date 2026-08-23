'use client';

import { useEffect } from 'react';

const START_SECONDS = 21 * 86400 + 15 * 3600 + 46 * 60 + 27;

export default function LocalCountdown() {
  useEffect(() => {
    let remaining = START_SECONDS;
    let timer = null;
    let observer = null;

    const render = () => {
      const grid = document.querySelector('.countdownGrid');
      if (!grid) return;

      let local = grid.querySelector('.localCountdownGrid');
      if (!local) {
        local = document.createElement('div');
        local.className = 'localCountdownGrid';
        local.innerHTML = `
          <div class="localCountBox"><b data-local-days></b><span>DAYS</span></div>
          <div class="localCountBox"><b data-local-hours></b><span>HOURS</span></div>
          <div class="localCountBox"><b data-local-minutes></b><span>MINUTES</span></div>
          <div class="localCountBox"><b data-local-seconds></b><span>SECONDS</span></div>
        `;
        grid.appendChild(local);
      }

      grid.querySelectorAll(':scope > .countBox').forEach(box => {
        box.style.display = 'none';
      });

      const days = Math.floor(remaining / 86400);
      const hours = Math.floor((remaining % 86400) / 3600);
      const minutes = Math.floor((remaining % 3600) / 60);
      const seconds = remaining % 60;

      local.querySelector('[data-local-days]').textContent = days;
      local.querySelector('[data-local-hours]').textContent = String(hours).padStart(2, '0');
      local.querySelector('[data-local-minutes]').textContent = String(minutes).padStart(2, '0');
      local.querySelector('[data-local-seconds]').textContent = String(seconds).padStart(2, '0');
    };

    render();
    timer = window.setInterval(() => {
      remaining = Math.max(0, remaining - 1);
      render();
    }, 1000);

    observer = new MutationObserver(render);
    observer.observe(document.body, { childList: true, subtree: true });

    return () => {
      if (timer) window.clearInterval(timer);
      if (observer) observer.disconnect();
    };
  }, []);

  return null;
}
