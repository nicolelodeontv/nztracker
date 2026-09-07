import './globals.css';
import './tracker.css';

export const metadata = {
  title: 'NINJA ZENSHIN — Clan Ranking',
  description: 'Unofficial Ninja Zenshin clan ranking tracker.'
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
