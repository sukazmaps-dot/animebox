'use client';

import type { ReactNode } from 'react';
import { usePathname } from 'next/navigation';

import Navbar from '@/components/Navbar';
import SiteFooter from '@/components/SiteFooter';

export default function AppChrome({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const theaterMode = pathname.startsWith('/watch-together/');

  if (theaterMode) {
    return <div className="watch-together-app-shell">{children}</div>;
  }

  return (
    <>
      <Navbar />

      <div className="app-shell">
        <main className="page-content">{children}</main>
        <SiteFooter />
      </div>
    </>
  );
}
