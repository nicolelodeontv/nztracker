import './globals.css';
import './tracker.css';
import MemberExport from './member-export';
import AppNav from './app-nav';

export const metadata = {
  title: 'Ninja Zenshin — Live Clan Tracker',
  description: 'Live Ninja Zenshin clan ranking tracker.'
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <MemberExport />
        <AppNav />
        {children}
      </body>
    </html>
  );
}
