import type { Metadata } from 'next';
import Link from 'next/link';

import SupportAnimeBox from '@/components/monetization/SupportAnimeBox';

export const metadata: Metadata = {
  title: 'Поддержать AnimeBox',
  description:
    'Добровольная поддержка разработки и инфраструктуры AnimeBox.',
};

export default function SupportPage() {
  return (
    <div className="support-page">
      <section className="support-page__hero">
        <span className="support-page__eyebrow">ANIMEBOX · SUPPORT</span>
        <h1>Помоги AnimeBox стать лучше.</h1>
        <p>
          AnimeBox развивается как независимый проект. Поддержка помогает оплачивать инфраструктуру, домен и быстрее выпускать новые функции.
        </p>
      </section>

      <SupportAnimeBox />

      <div className="support-page__back">
        <Link href="/">← Вернуться на главную</Link>
      </div>
    </div>
  );
}
