import { Baloo_2, Open_Sans, Teko } from 'next/font/google';
import { SpeedInsights } from '@vercel/speed-insights/next';
import './rep-tracker.css';

const bodyFont=Open_Sans({variable:'--font-body',subsets:['latin'],weight:['400','600','700']});
const titleFont=Baloo_2({variable:'--font-title',subsets:['latin'],weight:['500','600','700','800']});
const displayFont=Teko({variable:'--font-display',subsets:['latin'],weight:['500','600','700']});

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
  themeColor:'#08090b'
};

export default function RootLayout({children}){
  return <html lang="en"><body className={[bodyFont.variable,titleFont.variable,displayFont.variable].join(' ')}>{children}<SpeedInsights/></body></html>;
}
