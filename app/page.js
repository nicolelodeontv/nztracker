import RepTrackerDashboard from './components/RepTrackerDashboard';

export const metadata = {
  title: 'CHAOS REP Tracker',
  description: 'Live Ninja Zenshin clan reputation operations tracker.',
};

export default function Page() {
  return <RepTrackerDashboard initialView="dashboard" />;
}
