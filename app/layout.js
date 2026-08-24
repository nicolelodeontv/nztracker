import './globals.css';
import './tracker.css';
import MemberImport from './member-import';

export const metadata = {
  title: 'Ninja Zenshin — Live Clan Tracker',
  description: 'Live Ninja Zenshin clan ranking tracker.'
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body><MemberImport />{children}</body>
    </html>
  );
}
