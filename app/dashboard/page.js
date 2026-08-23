import { auth, currentUser } from '@clerk/nextjs/server';
import { UserButton } from '@clerk/nextjs';
import Link from 'next/link';

export default async function DashboardPage() {
  const { userId } = await auth();
  if (!userId) return null;
  const user = await currentUser();
  const name = user?.firstName || user?.username || 'Ninja';
  const email = user?.primaryEmailAddress?.emailAddress || '';

  return (
    <main style={styles.page}>
      <header style={styles.header}>
        <div>
          <div style={styles.brand}>NINJA ZENSHIN // PRIVATE DASHBOARD</div>
          <h1 style={styles.title}>Welcome, {name}</h1>
          <p style={styles.sub}>{email}</p>
        </div>
        <UserButton afterSignOutUrl="/" />
      </header>

      <section style={styles.grid}>
        <article style={styles.card}><span style={styles.label}>LIVE TRACKER</span><h2 style={styles.cardTitle}>Clan Rankings</h2><p style={styles.cardText}>Open the public live tracker with your account context.</p><Link href="/" style={styles.link}>Open tracker →</Link></article>
        <article style={styles.card}><span style={styles.label}>ANALYTICS</span><h2 style={styles.cardTitle}>Attack Analytics</h2><p style={styles.cardText}>Your dashboard is ready for saved 30m, 1h, 2h and 4h tracking preferences.</p><span style={styles.status}>READY</span></article>
        <article style={styles.card}><span style={styles.label}>NOTIFICATIONS</span><h2 style={styles.cardTitle}>Alerts & Discord</h2><p style={styles.cardText}>Configure browser alerts, gain thresholds and Discord summaries from your private settings.</p><span style={styles.status}>READY</span></article>
        <article style={styles.card}><span style={styles.label}>ACCOUNT</span><h2 style={styles.cardTitle}>Profile & Security</h2><p style={styles.cardText}>Manage your account securely through the authentication provider.</p><span style={styles.status}>SECURED</span></article>
      </section>
    </main>
  );
}

const styles = {
  page: { minHeight: '100vh', background: '#06080d', color: '#f4f7fb', padding: '44px max(22px, 5vw)', fontFamily: 'system-ui,sans-serif' },
  header: { maxWidth: 1100, margin: '0 auto 28px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 20 },
  brand: { color: '#54d7ff', fontFamily: 'monospace', fontSize: 11, letterSpacing: '.14em', fontWeight: 700 },
  title: { margin: '10px 0 4px', fontSize: 'clamp(34px,5vw,58px)', letterSpacing: '-.04em' },
  sub: { margin: 0, color: '#7e8b9f', fontSize: 13 },
  grid: { maxWidth: 1100, margin: '0 auto', display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(240px,1fr))', gap: 12 },
  card: { padding: 18, border: '1px solid rgba(148,163,184,.13)', borderRadius: 15, background: '#0b1018' },
  label: { color: '#68778b', font: '700 9px monospace', letterSpacing: '.12em' },
  cardTitle: { margin: '8px 0 5px', fontSize: 22 },
  cardText: { margin: 0, minHeight: 58, color: '#8491a4', fontSize: 13, lineHeight: 1.5 },
  link: { display: 'inline-block', marginTop: 15, color: '#54d7ff', textDecoration: 'none', font: '700 12px monospace' },
  status: { display: 'inline-block', marginTop: 15, padding: '6px 8px', borderRadius: 7, border: '1px solid rgba(93,229,173,.2)', color: '#5de5ad', background: 'rgba(93,229,173,.04)', font: '700 10px monospace' }
};
