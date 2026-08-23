'use client';

import { useEffect, useRef, useState } from 'react';

const FEATURE_ITEMS = [
  { icon: '📊', title: 'Clan earnings', text: 'Per attack, 6h, 24h, and 7d', target: 'ranking' },
  { icon: '🧑‍🤝‍🧑', title: 'Member details', text: 'See who earned the most and when', target: 'ranking' },
  { icon: '🌍', title: 'Global Top', text: 'Global ranking of all clans', target: 'ranking' },
  { icon: '🔔', title: 'Push notifications', text: 'Alert on new clan attacks', action: 'notify' },
  { icon: '🎮', title: 'Discord', text: 'Automatic attack summaries', action: 'discord' }
];

export default function FeatureHub({ rows = [], onSelectClan }) {
  const [notificationState, setNotificationState] = useState('idle');
  const previous = useRef(new Map());

  useEffect(() => {
    rows.forEach((row) => {
      const key = String(row.clanId || row.clan || row.rank);
      const current = Number(row.liveGain || 0);
      const prior = previous.current.get(key);
      if (prior !== undefined && current > prior) {
        const message = `${row.clan || 'Your clan'} gained +${current - prior} reputation.`;
        if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
          new Notification('Ninja Zenshin attack detected', { body: message, tag: `nztracker-${key}` });
        }
      }
      previous.current.set(key, current);
    });
  }, [rows]);

  async function enableNotifications() {
    if (typeof Notification === 'undefined') {
      setNotificationState('unsupported');
      return;
    }
    if (Notification.permission === 'granted') {
      setNotificationState('enabled');
      return;
    }
    const permission = await Notification.requestPermission();
    setNotificationState(permission === 'granted' ? 'enabled' : 'denied');
  }

  function handleClick(item) {
    if (item.action === 'notify') return enableNotifications();
    if (item.action === 'discord') {
      window.alert('Discord summaries are ready for webhook integration. Add DISCORD_WEBHOOK_URL in Vercel environment variables to enable posting.');
      return;
    }
    document.getElementById(item.target)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  return (
    <section className="featureHub" aria-label="Tracker features">
      <div className="featureHubHeader">
        <div>
          <span className="panelLabel">TRACKER MODULES</span>
          <h2>Attack &amp; Clan Intelligence</h2>
        </div>
        <span className={`featurePulse ${notificationState === 'enabled' ? 'enabled' : ''}`}>
          {notificationState === 'enabled' ? '● ALERTS ON' : '● LIVE DATA'}
        </span>
      </div>
      <div className="featureGrid">
        {FEATURE_ITEMS.map((item) => (
          <button key={item.title} className="featureTile" onClick={() => handleClick(item)}>
            <span className="featureIcon" aria-hidden="true">{item.icon}</span>
            <span className="featureCopy">
              <strong>{item.title}</strong>
              <small>{item.text}</small>
            </span>
            <span className="featureArrow" aria-hidden="true">→</span>
          </button>
        ))}
      </div>
      <div className="featureNote">
        <span>ATTACK HISTORY</span>
        <strong>6H / 24H / 7D metrics will use real attack events when the source exposes attack history.</strong>
      </div>
    </section>
  );
}
