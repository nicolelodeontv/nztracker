import './globals.css';
import './layout-overrides.css';
import './chaos-theme.css';
import './mobile-responsive.css';
import './rep-pop.css';
import MemberHistory from './member-history';
import MemberLiveSort from './member-live-sort';

export const metadata = {
  title: 'Ninja Zenshin — Live Clan Tracker',
  description: 'Live Ninja Zenshin clan ranking tracker.'
};

export default function RootLayout({ children }) {
  return <html lang="en"><body>{children}<MemberHistory /><MemberLiveSort /></body></html>;
}
