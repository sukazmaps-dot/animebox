import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Служебная страница',
  robots: {
    index: false,
    follow: false,
  },
};

export default function SupabaseTestLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children;
}
