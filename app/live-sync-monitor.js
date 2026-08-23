'use client';

import { useEffect, useRef, useState } from 'react';

const POLL_MS = 5000;
const HISTORY_KEY = 'nztracker:discord-bleeding:v1';
const ALERT_COOLDOWN_MS = 30 * 60 * 1000;

function cleanSnapshot(rows) {
  return Object.fromEntries((rows || []).map((r) => [r.clan, Number(r.reputation || 0)]));
}

export default function LiveSyncMonitor() {
  const [state, setState] = useState('connecting');
  const lastRef = useRef(null);

  useEffect(() => {
    let timer;
    let stopped = false;

    const poll = async () => {
      try {
        const response = await fetch(`/api/clan-ranking?sync=${Date.now()}`, { cache: 'no-store' });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();
        if (stopped) return;

        setState('live');
        const next = cleanSnapshot(data.rows);
        const previous = lastRef.current;
        lastRef.current = next;

        if (!previous || !Object.keys(previous).length) return;

        let sent = {};
        try { sent = JSON.parse(localStorage.getItem(HISTORY_KEY) || '{}') || {}; } catch {}
        const now = Date.now();

        for (const [clan, current] of Object.entries(next)) {
          const before = previous[clan];
          if (typeof before !== 'number' || current >= before) continue;

          const loss = before - current;
          const lastSent = Number(sent[clan] || 0);
          if (now - lastSent < ALERT_COOLDOWN_MS) continue;

          try {
            const discordSetting = JSON.parse(localStorage.getItem('nztracker:settings:v4') || '{}');
            if (discordSetting?.discord === false) continue;
          } catch {}

          const discordResponse = await fetch('/api/discord/attack-summary', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              type: 'bleeding',
              clan,
              previousReputation: before,
              currentReputation: current,
              reputationLoss: loss,
              timestamp: new Date().toISOString()
            })
          });

          if (discordResponse.ok) sent[clan] = now;
        }

        try { localStorage.setItem(HISTORY_KEY, JSON.stringify(sent)); } catch {}
      } catch {
        if (!stopped) setState('error');
      } finally {
        if (!stopped) timer = window.setTimeout(poll, POLL_MS);
      }
    };

    poll();
    return () => {
      stopped = true;
      if (timer) window.clearTimeout(timer);
    };
  }, []);

  return (
    <div className={`nz-sync-pill nz-sync-${state}`} aria-live="polite">
      <span className="nz-sync-dot" />
      {state === 'live' ? 'LIVE SYNC' : state === 'error' ? 'SYNC ERROR' : 'CONNECTING'}
    </div>
  );
}
