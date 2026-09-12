import NZTrackerApp from './components/NZTrackerApp';
import './nz3-v3.css';

export const metadata = {
  title: 'Ninja Zenshin Tracker',
  description: 'Player ranking and operational monitoring for Ninja Zenshin clan data.',
};

export default function Page() {
  return <NZTrackerApp />;
}
