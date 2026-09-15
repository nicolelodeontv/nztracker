import './rep-tracker.css';

export const metadata = {
  title: 'CHAOS REP Tracker',
  description: 'Live Ninja Zenshin clan reputation operations tracker.',
  icons: { icon: '/icon.svg', shortcut: '/icon.svg', apple: '/icon.svg' }
};

export const viewport = { width: 'device-width', initialScale: 1, viewportFit: 'cover' };

export default function RootLayout({ children }) {
  return <html lang="en"><body>{children}</body></html>;
}
