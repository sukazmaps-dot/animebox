import type { Metadata } from 'next';
import './globals.css';
import './visual-refresh.css';
import Navbar from '@/components/Navbar';

const SITE_URL = 'https://youranimebox.com';

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),

  title: {
    default: 'AnimeBox — Смотри. Отслеживай. Живи.',
    template: '%s | AnimeBox',
  },

  description:
    'AnimeBox — сервис для поиска, просмотра и отслеживания аниме. Добавляй тайтлы в коллекцию, следи за сериями и расписанием новых эпизодов.',

  applicationName: 'AnimeBox',
  creator: 'AnimeBox',
  publisher: 'AnimeBox',

  keywords: [
    'аниме',
    'аниме онлайн',
    'смотреть аниме',
    'аниме трекер',
    'AnimeBox',
    'каталог аниме',
    'расписание аниме',
    'новые серии аниме',
  ],

  alternates: {
    canonical: '/',
  },

  openGraph: {
    type: 'website',
    locale: 'ru_RU',
    url: SITE_URL,
    siteName: 'AnimeBox',
    title: 'AnimeBox — Смотри. Отслеживай. Живи.',
    description:
      'Ищи аниме, отслеживай просмотренные серии, собирай свою коллекцию и следи за выходом новых эпизодов.',
    images: [
      {
        url: '/backgrounds/hero-fallback.webp',
        width: 2244,
        height: 701,
        alt: 'AnimeBox',
      },
    ],
  },

  twitter: {
    card: 'summary_large_image',
    title: 'AnimeBox — Смотри. Отслеживай. Живи.',
    description:
      'Ищи аниме, отслеживай просмотренные серии и собирай свою коллекцию.',
    images: ['/backgrounds/hero-fallback.webp'],
  },

  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-image-preview': 'large',
      'max-snippet': -1,
      'max-video-preview': -1,
    },
  },

  icons: {
    icon: '/favicon.ico',
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ru">
      <body>
        <Navbar />
        <div className="app-shell">
          <main className="page-content">{children}</main>
        </div>
      </body>
    </html>
  );
}
