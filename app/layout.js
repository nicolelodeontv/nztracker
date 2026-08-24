import './globals.css';
import './tracker.css';
import MemberExport from './member-export';
import SiteEnhancements from './site-enhancements';
import WarRulesPanel from './war-rules-panel';

export const metadata = {
  title: 'Ninja Zenshin — Live Clan Tracker',
  description: 'Live Ninja Zenshin clan ranking tracker.'
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body><MemberExport /><SiteEnhancements /><WarRulesPanel />{children}</body>
    </html>
  );
}
