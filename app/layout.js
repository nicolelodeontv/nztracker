import './globals.css';
import './ui-fixes.css';
import './feature-hub.css';
import './nav-spacing.css';
import MemberHistory from './member-history';
import MemberLiveSort from './member-live-sort';
import NavBehavior from './nav-behavior';
import FeatureHub from './feature-hub';
import LiveSyncMonitor from './live-sync-monitor';

export const metadata = {
  title: 'Ninja Zenshin — Live Clan Tracker',
  description: 'Live Ninja Zenshin clan ranking tracker.'
};

export default function RootLayout({ children }) {
  return <html lang="en"><body><LiveSyncMonitor /><FeatureHub />{children}<MemberHistory /><MemberLiveSort /><NavBehavior /></body></html>;
}
