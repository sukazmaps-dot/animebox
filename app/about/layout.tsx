import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'О проекте',
  description:
    'AnimeBox — сервис для поиска, просмотра и отслеживания аниме, расписания новых серий и ведения собственной коллекции.',
  alternates: {
    canonical: '/about',
  },
};

export default function AboutLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children;
}
