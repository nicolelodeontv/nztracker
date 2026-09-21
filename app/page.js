import RepTrackerDashboard from './components/RepTrackerDashboard';

export const metadata = {
  title: 'CHAOS REP Tracker',
  description: 'Live Ninja Zenshin clan reputation operations tracker.',
};

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default function Page() {
  return (
    <RepTrackerDashboard
      initialView="dashboard"
      initialData={null}
      initialError=""
    />
  );
}
