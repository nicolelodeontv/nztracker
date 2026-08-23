import { SignUp } from '@clerk/nextjs';

export default function RegisterPage() {
  return (
    <main style={styles.page}>
      <section style={styles.card}>
        <div style={styles.brand}>NINJA ZENSHIN // TRACKER</div>
        <h1 style={styles.title}>Create your account</h1>
        <p style={styles.text}>Register to save your tracker settings and use the private dashboard.</p>
        <SignUp routing="path" path="/register" signInUrl="/login" fallbackRedirectUrl="/dashboard" />
      </section>
    </main>
  );
}

const styles = {
  page: { minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 24, background: '#06080d' },
  card: { width: '100%', maxWidth: 430, padding: 28, border: '1px solid rgba(148,163,184,.15)', borderRadius: 18, background: '#0b1018', color: '#f4f7fb', boxShadow: '0 30px 80px rgba(0,0,0,.45)' },
  brand: { color: '#54d7ff', fontFamily: 'monospace', fontSize: 11, letterSpacing: '.14em', fontWeight: 700 },
  title: { margin: '10px 0 4px', fontFamily: 'system-ui,sans-serif', fontSize: 34 },
  text: { margin: '0 0 20px', color: '#8e9aaa', fontFamily: 'system-ui,sans-serif', fontSize: 13 }
};
