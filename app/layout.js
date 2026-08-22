import './globals.css';
import { Analytics } from '@vercel/analytics/next';

export const metadata = {
  title: 'Ninja Zenshin — Live Clan Tracker',
  description: 'Live Ninja Zenshin clan ranking tracker.'
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        {children}
        <Analytics />
      </body>
    </html>
  );
}
