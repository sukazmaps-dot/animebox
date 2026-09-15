import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'О проекте',
  description:
    'AnimeBox — anime tracker и сообщество: поиск аниме, личная библиотека, прогресс по сериям, расписание, профили, достижения и обсуждения эпизодов.',
  alternates: {
    canonical: '/about',
  },
};

export default function AboutLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return children;
}
