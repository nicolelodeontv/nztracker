'use client';

import { useEffect } from 'react';

export default function CountdownSync() {
  useEffect(() => {
    let syncTimer;
    let tickTimer;
    let remaining = null;

    const getBoxes = () => Array.from(document.querySelectorAll('.countdownGrid > *')).slice(0, 4);

    const render = () => {
      if (remaining === null) return;
      const total = Math.max(0, Math.floor(remaining));
      const values = [
        Math.floor(total / 86400),
        Math.floor((total % 86400) / 3600),
        Math.floor((total % 3600) / 60),
        total % 60
      ];
      getBoxes().forEach((box, index) => {
        const value = box.querySelector('strong');
        if (!value) return;
        value.textContent = index === 0
          ? String(values[index])
          : String(values[index]).padStart(2, '0');
      });
    };

    const startTicking = seconds => {
      remaining = Math.max(0, Number(seconds));
      clearInterval(tickTimer);
      render();
      tickTimer = setInterval(() => {
        remaining = Math.max(0, remaining - 1);
        render();
      }, 1000);
    };

    const sync = async () => {
      try {
        const response = await fetch(`/api/clan-ranking?countdown=${Date.now()}`, {
          cache: 'no-store',
          headers: { 'Cache-Control': 'no-cache' }
        });
        if (!response.ok) return;
        const data = await response.json();
        const countdown = data?.countdown;
        if (!countdown) return;

        // The source provides D/H/M/S. Convert the complete value to seconds,
        // then count down locally so the display changes every second.
        const seconds = Number(countdown.days) * 86400
          + Number(countdown.hours) * 3600
          + Number(countdown.minutes) * 60
          + Number(countdown.seconds);

        if (Number.isFinite(seconds)) startTicking(seconds);
      } catch {
        // Keep the last valid countdown running if a refresh fails.
      }
    };

    sync();
    syncTimer = setInterval(sync, 30000);

    return () => {
      clearInterval(syncTimer);
      clearInterval(tickTimer);
    };
  }, []);

  return null;
}
