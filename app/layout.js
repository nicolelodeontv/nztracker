import './globals.css';
import './tracker.css';
import './aitmpl-upgrades.css';
import './nz3.css';
import './mobile.css';
import CsvExportFix from './csv-export-fix';

export const metadata = {
  title: 'NINJA ZENSHIN — Clan Operations 3.0',
  description: 'Unofficial Ninja Zenshin clan ranking and reputation operations tracker.',
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
      <body><CsvExportFix />{children}</body>
    </html>
  );
}
