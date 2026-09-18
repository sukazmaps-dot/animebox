import type { Metadata } from 'next';

import { buildStaticPageMetadata } from '@/lib/static-page-seo';

export const metadata: Metadata = buildStaticPageMetadata({
  title: 'О проекте',
  description:
    'AnimeBox — anime tracker и сообщество: поиск аниме, личная библиотека, прогресс по сериям, расписание, профили, достижения и обсуждения эпизодов.',
  path: '/about',
});

export default function AboutLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return children;
}
