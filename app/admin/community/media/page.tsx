import type { Metadata } from 'next';

import ProfileMediaReviewClient from '@/components/admin/ProfileMediaReviewClient';

export const metadata: Metadata = {
  title: 'Модерация медиа',
  robots: { index: false, follow: false },
};

export default function ProfileMediaModerationPage() {
  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6">
      <header className="mb-6">
        <span className="text-[10px] font-black uppercase tracking-[0.2em] text-violet-300/60">ANIMEBOX COMMUNITY</span>
        <h1 className="mt-2 text-2xl font-black text-white sm:text-3xl">Модерация аватаров и баннеров</h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-white/45">
          Очередь содержит только пограничные изображения и анимации. Явно запрещённое медиа блокируется автоматически, безопасное публикуется без ручного шага.
        </p>
      </header>

      <ProfileMediaReviewClient />
    </main>
  );
}
