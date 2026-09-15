import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Расписание выхода аниме',
  description:
    'Расписание новых эпизодов аниме на AnimeBox: узнай, какие серии выходят сегодня и в ближайшие дни.',
  alternates: {
    canonical: '/schedule',
  },
};

export default function ScheduleLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children;
}
