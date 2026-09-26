import type { Metadata } from 'next';

import '../community.css';
import '../tracker-library-compact.css';
export const metadata: Metadata = {
  title: 'Мой трекер',
  robots: {
    index: false,
    follow: false,
  },
};

export default function ListLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children;
}
