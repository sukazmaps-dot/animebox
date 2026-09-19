import type { Metadata } from 'next';

import '../community.css';
export const metadata: Metadata = {
  title: 'Избранное',
  robots: {
    index: false,
    follow: false,
  },
};

export default function FavoritesLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children;
}
