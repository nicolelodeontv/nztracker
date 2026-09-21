import RepTrackerDashboard from './components/RepTrackerDashboard';
import { dashboardData } from './lib/rep-tracker';

export const metadata = {
  title: 'CHAOS REP Tracker',
  description: 'Live Ninja Zenshin clan reputation operations tracker.',
};

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

export default async function Page() {
  let initialData = null;
  let initialError = '';

  try {
    const data = await dashboardData();
    initialData = {
      ...data,
      activity: [],
      syncError: null,
      serverTime: new Date().toISOString(),
    };
  } catch (error) {
    initialError = error instanceof Error ? error.message : String(error);
  }

  return (
    <RepTrackerDashboard
      initialView="dashboard"
      initialData={initialData}
      initialError={initialError}
    />
  );
}
