'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';

import type { PremiumStatsPayload } from '@/lib/premium-stats';
import { trackProductClientEvent } from '@/lib/product-events-client';

type LoadState =
  | { status: 'loading' }
  | { status: 'ready'; data: PremiumStatsPayload }
  | { status: 'error'; message: string; premiumRequired: boolean };

export default function PremiumYearReviewClient() {
  const [state, setState] = useState<LoadState>({ status: 'loading' });

  useEffect(() => {
    const controller = new AbortController();

    void fetch('/api/premium/stats', {
      cache: 'no-store',
      signal: controller.signal,
    })
      .then(async (response) => {
        const payload = await response.json();

        if (!response.ok) {
          throw Object.assign(
            new Error(payload.error || 'Не удалось собрать итоги года.'),
            { premiumRequired: response.status === 403 },
          );
        }

        const data = payload as PremiumStatsPayload;
        setState({
          status: 'ready',
          data,
        });
        trackProductClientEvent('premium_year_review_view', {
          source: 'premium_year_review',
          path: '/premium/year',
          entityType: 'premium_feature',
          entityId: String(data.yearReview.year),
          metadata: {
            episodes: data.yearReview.episodes,
            titles: data.yearReview.titles,
            active_days: data.yearReview.activeDays,
          },
        });
      })
      .catch((error) => {
        if (controller.signal.aborted) return;
        setState({
          status: 'error',
          message:
            error instanceof Error
              ? error.message
              : 'Не удалось собрать Year in Review.',
          premiumRequired: Boolean(
            error &&
              typeof error === 'object' &&
              'premiumRequired' in error &&
              error.premiumRequired,
          ),
        });
      });

    return () => controller.abort();
  }, []);

  const maxMonth = useMemo(() => {
    if (state.status !== 'ready') return 1;
    return Math.max(
      1,
      ...state.data.yearReview.months.map((month) => month.episodes),
    );
  }, [state]);

  if (state.status === 'loading') {
    return (
      <main className="premium-year-v2">
        <div className="premium-year-v2__state" role="status">
          <span className="animebox-loader" aria-hidden="true" />
          <strong>Собираем твой год AnimeBox…</strong>
          <small>Используем только подтверждённую историю просмотра.</small>
        </div>
      </main>
    );
  }

  if (state.status === 'error') {
    return (
      <main className="premium-year-v2">
        <div className="premium-year-v2__state">
          <span>ИТОГИ ГОДА</span>
          <strong>
            {state.premiumRequired
              ? 'Итоги года — часть AnimeBox Premium'
              : 'Не удалось собрать итог года'}
          </strong>
          <small>{state.message}</small>
          <Link href={state.premiumRequired ? '/premium' : '/premium/stats'}>
            {state.premiumRequired ? 'Открыть Premium' : 'Вернуться к статистике'}
          </Link>
        </div>
      </main>
    );
  }

  const { yearReview } = state.data;
  const topTitle = yearReview.topTitle;
  const topGenre = yearReview.topGenre;
  const busiestMonth = yearReview.busiestMonth;

  return (
    <main className="premium-year-v2">
      <section className="premium-year-v2__hero">
        <div className="premium-year-v2__hero-copy">
          <span>ANIMEBOX PREMIUM · YEAR IN REVIEW</span>
          <small>{yearReview.year}</small>
          <h1>Твой год<br />в AnimeBox.</h1>
          <p>
            Не общий рейтинг и не сравнение с другими. Только твоя подтверждённая
            история просмотра за {yearReview.year} год.
          </p>
        </div>

        <div className="premium-year-v2__hero-orbit" aria-hidden="true">
          <i />
          <i />
          <i />
          <div>
            <strong>{yearReview.episodes}</strong>
            <span>серий</span>
          </div>
        </div>
      </section>

      <section className="premium-year-v2__numbers" aria-label="Итоги года">
        <article>
          <span>СЕРИИ</span>
          <strong>{yearReview.episodes.toLocaleString('ru-RU')}</strong>
          <small>завершено в {yearReview.year}</small>
        </article>
        <article>
          <span>ТАЙТЛЫ</span>
          <strong>{yearReview.titles.toLocaleString('ru-RU')}</strong>
          <small>уникальных аниме</small>
        </article>
        <article>
          <span>АКТИВНЫЕ ДНИ</span>
          <strong>{yearReview.activeDays.toLocaleString('ru-RU')}</strong>
          <small>дней с просмотром</small>
        </article>
        <article>
          <span>САМЫЙ АКТИВНЫЙ МЕСЯЦ</span>
          <strong>{busiestMonth?.label ?? '—'}</strong>
          <small>{busiestMonth ? `${busiestMonth.episodes} сер.` : 'данных пока нет'}</small>
        </article>
      </section>

      <section className="premium-year-v2__story">
        <article className="premium-year-v2__feature">
          <span>ТВОЙ ГЛАВНЫЙ ТАЙТЛ</span>
          <div className="premium-year-v2__feature-body">
            <div className="premium-year-v2__poster">
              {topTitle?.posterUrl ? (
                // Catalog artwork is already delivered through the AnimeBox media pipeline.
                // eslint-disable-next-line @next/next/no-img-element
                <img src={topTitle.posterUrl} alt="" loading="lazy" />
              ) : (
                <i aria-hidden="true">✦</i>
              )}
            </div>
            <div>
              <h2>{topTitle?.title ?? 'История ещё формируется'}</h2>
              <p>
                {topTitle
                  ? `${topTitle.episodes} завершённых серий — больше, чем у любого другого тайтла в этом году.`
                  : 'Посмотри несколько серий, и здесь появится главный тайтл года.'}
              </p>
              {topTitle && (
                <Link href={`/anime/${encodeURIComponent(topTitle.slug || String(topTitle.animeId))}`}>
                  Открыть тайтл →
                </Link>
              )}
            </div>
          </div>
        </article>

        <article className="premium-year-v2__feature premium-year-v2__feature--genre">
          <span>ЖАНР ГОДА</span>
          <div>
            <strong>{topGenre?.genre ?? '—'}</strong>
            <p>
              {topGenre
                ? `${topGenre.episodes} серий с этим жанром попали в твою историю за год.`
                : 'Anime DNA появится здесь, когда накопится больше истории.'}
            </p>
          </div>
        </article>
      </section>

      <section className="premium-year-v2__timeline">
        <header>
          <div>
            <span>12 МЕСЯЦЕВ</span>
            <h2>Как менялся твой ритм</h2>
          </div>
          <Link href="/premium/stats">Открыть подробную статистику →</Link>
        </header>

        <div className="premium-year-v2__months">
          {yearReview.months.map((month) => (
            <div key={month.key}>
              <span>
                <i
                  style={{
                    height: `${Math.max(3, (month.episodes / maxMonth) * 100)}%`,
                  }}
                />
              </span>
              <strong>{month.episodes}</strong>
              <small>{month.label.replace(/\s\d{2}$/u, '')}</small>
            </div>
          ))}
        </div>
      </section>

      <footer className="premium-year-v2__footer">
        <div>
          <span>ANIMEBOX PREMIUM</span>
          <strong>Это только твоя история.</strong>
          <small>Итоги строятся из подтверждённых событий аккаунта и не влияют на рейтинги.</small>
        </div>
        <Link href="/profile">Вернуться в профиль →</Link>
      </footer>
    </main>
  );
}
