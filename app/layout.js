import './globals.css';
import './tracker.css';
import MemberExport from './member-export';
import SiteEnhancements from './site-enhancements';

export const metadata = {
  title: 'Ninja Zenshin — Live Clan Tracker',
  description: 'Live Ninja Zenshin clan ranking tracker.'
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body><MemberExport /><SiteEnhancements />{children}</body>
    </html>
  );
}
