import './globals.css';
import MemberHistory from './member-history';
import MemberSort from './member-sort';

export const metadata = {
  title: 'Ninja Zenshin — Live Clan Tracker',
  description: 'Live Ninja Zenshin clan ranking tracker.'
};

export default function RootLayout({ children }) {
  return <html lang="en"><body>{children}<MemberHistory /><MemberSort /></body></html>;
}
