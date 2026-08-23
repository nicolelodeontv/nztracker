'use client';

import { useEffect } from 'react';

export default function CountdownSync() {
  useEffect(() => {
    let timer = null;
    let tick = null;
    let remaining = null;

    const render = () => {
      if (remaining === null) return;
      const total = Math.max(0, Math.floor(remaining));
      const values = [
        Math.floor(total / 86400),
        Math.floor((total % 86400) / 3600),
        Math.floor((total % 3600) / 60),
        total % 60
      ];
      document.querySelectorAll('.countdownGrid .countBox').forEach((box, index) => {
        const value = box.querySelector('strong');
        if (value) value.textContent = index === 0 ? String(values[index]) : String(values[index]).padStart(2, '0');
      });
    };

    const sync = async () => {
      try {
        const response = await fetch(`/api/clan-ranking?countdown=${Date.now()}`, { cache: 'no-store' });
        if (!response.ok) return;
        const data = await response.json();
        const seconds = Number(data?.countdown?.remainingSeconds);
        if (Number.isFinite(seconds)) {
          remaining = Math.max(0, seconds);
          render();
          clearInterval(tick);
          tick = setInterval(() => {
            remaining = Math.max(0, remaining - 1);
            render();
          }, 1000);
        }
      } catch {}
    };

    const observer = new MutationObserver(render);
    observer.observe(document.body, { childList: true, subtree: true });
    sync();
    timer = setInterval(sync, 10000);

    return () => {
      clearInterval(timer);
      clearInterval(tick);
      observer.disconnect();
    };
  }, []);

  return null;
}
