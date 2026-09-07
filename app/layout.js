import './globals.css';
import './tracker.css';

export const metadata = {
  title: 'NINJA ZENSHIN — Clan Ranking',
  description: 'Unofficial Ninja Zenshin clan ranking tracker.',
  icons: {
    icon: '/icon.svg',
    shortcut: '/icon.svg',
    apple: '/icon.svg'
  }
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
