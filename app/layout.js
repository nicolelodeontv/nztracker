import { JetBrains_Mono, Rajdhani } from 'next/font/google';
import { SpeedInsights } from '@vercel/speed-insights/next';
import './rep-tracker.css';

const bodyFont=Rajdhani({variable:'--font-body',subsets:['latin'],weight:['500','600','700']});
const titleFont=Rajdhani({variable:'--font-title',subsets:['latin'],weight:['600','700']});
const displayFont=Rajdhani({variable:'--font-display',subsets:['latin'],weight:['500','600','700']});
const monoFont=JetBrains_Mono({variable:'--font-mono',subsets:['latin'],weight:['400','500','600','700']});

export const metadata={
  title:'CHAOS REP Tracker',
  description:'Live Ninja Zenshin clan reputation operations tracker.',
  metadataBase:new URL('https://chaoszenshintracker.vercel.app'),
  openGraph:{
    title:'CHAOS REP Tracker',
    description:'Live Ninja Zenshin clan reputation operations tracker.',
    type:'website'
  }
};

export const viewport={
  width:'device-width',
  initialScale:1,
  viewportFit:'cover',
  themeColor:'#0A0A0A'
};

export default function RootLayout({children}){
  return <html lang="en"><body className={[bodyFont.variable,titleFont.variable,displayFont.variable,monoFont.variable].join(' ')}>{children}<SpeedInsights/></body></html>;
}
