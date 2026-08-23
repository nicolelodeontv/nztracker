import './globals.css';
import './layout-overrides.css';
import './chaos-theme.css';
import './mobile-responsive.css';
import './rep-pop.css';
import './final-theme.css';
import './damn-good-theme.css';
import './nav-polish.css';
import './sidebar-cleanup.css';
import './countdown-match.css';
import MemberHistory from './member-history';
import MemberLiveSort from './member-live-sort';
import NavBehavior from './nav-behavior';
import CountdownSync from './countdown-sync';

export const metadata = {
  title: 'Ninja Zenshin — Live Clan Tracker',
  description: 'Live Ninja Zenshin clan ranking tracker.'
};

export default function RootLayout({ children }) {
  return <html lang="en"><body>{children}<MemberHistory /><MemberLiveSort /><NavBehavior /><CountdownSync /></body></html>;
}
