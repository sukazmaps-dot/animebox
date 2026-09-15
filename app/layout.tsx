import type { Metadata } from 'next';
import './globals.css';
import './visual-refresh.css';
import Navbar from '@/components/Navbar';

export const metadata: Metadata = {
  title: 'AnimeBox — Смотри. Отслеживай. Живи.',
  description: 'Поиск, трекер и расписание аниме на основе Shikimori.',
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
