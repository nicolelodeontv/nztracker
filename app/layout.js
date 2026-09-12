import './nz3-v3.css';

export const metadata = {
  title: 'NINJA ZENSHIN — Clan Ranking',
  description: 'Unofficial Ninja Zenshin clan ranking tracker.',
  icons: {
    icon: '/icon.svg',
    shortcut: '/icon.svg',
    apple: '/icon.svg'
  }
};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover'
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
