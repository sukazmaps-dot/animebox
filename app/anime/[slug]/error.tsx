'use client';

import Link from 'next/link';
import { useEffect } from 'react';

export default function AnimeRouteError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[Anime route boundary]', error);
  }, [error]);

  return (
    <main className="mx-auto flex min-h-[70vh] max-w-3xl items-center px-4 py-16 md:px-6">
      <section className="w-full rounded-2xl border border-white/10 bg-slate-950/75 p-6 shadow-2xl md:p-8">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-violet-300/70">
          AnimeBox
        </p>
        <h1 className="mt-3 text-2xl font-black text-white">
          Не удалось загрузить тайтл
        </h1>
        <p className="mt-3 text-sm leading-6 text-white/55">
          Один из внешних источников временно не ответил. Страница не должна
          превращаться в системную ошибку — можно повторить запрос или вернуться
          в каталог.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={reset}
            className="rounded-xl bg-violet-500 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-violet-400"
          >
            Повторить
          </button>
          <Link
            href="/search"
            className="rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2.5 text-sm font-semibold text-white/70"
          >
            В каталог
          </Link>
        </div>
      </section>
    </main>
  );
}
