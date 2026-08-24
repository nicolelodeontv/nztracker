'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import WarOps from '../war-ops';
import '../tracker.css';
import '../war-ops.css';
import './page.css';

const REFRESH_MS = 3000;

export default function ClanWarPage() {
  const [rows, setRows] = useState([]);
  const [status, setStatus] = useState('connecting');
  const [updated, setUpdated] = useState(null);
  const [server, setServer] = useState(null);
  const inFlight = useRef(false);

  const load = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    try {
      const response = await fetch(`/api/clan-ranking?t=${Date.now()}`, { cache: 'no-store' });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      setRows(Array.isArray(data.rows) ? data.rows : []);
      setUpdated(new Date(data.fetchedAt || Date.now()));
      setServer(response.headers.get('date') ? new Date(response.headers.get('date')) : new Date());
      setStatus('live');
    } catch {
      setStatus('error');
    } finally {
      inFlight.current = false;
    }
  }, []);

  useEffect(() => {
    load();
    const timer = setInterval(load, REFRESH_MS);
    return () => clearInterval(timer);
  }, [load]);

  return (
    <main className="war-page">
      <header className="war-page-hero">
        <div>
          <div className="eyebrow">⚔ CLAN WAR // LIVE</div>
          <h1>Battle Monitor</h1>
          <p>Bleeding detection, attack readiness, reputation rewards, recovery timing and Discord lifecycle alerts.</p>
        </div>
        <div className={`war-page-live ${status === 'error' ? 'offline' : ''}`}>● {status === 'live' ? 'LIVE · SYNCING' : status === 'error' ? 'OFFLINE · RETRYING' : 'CONNECTING'}</div>
      </header>

      <WarOps rows={rows} server={server} updated={updated} status={status} />
    </main>
  );
}
