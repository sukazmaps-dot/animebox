import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Каталог аниме',
  description:
    'Каталог AnimeBox: находи аниме по названию, жанру и статусу, открывай страницы тайтлов и добавляй их в свой трекер.',
  alternates: {
    canonical: '/search',
  },
};

export default function SearchLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children;
}
