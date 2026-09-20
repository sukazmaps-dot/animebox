'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';

import { statusLabels, type LibraryStatus } from '@/lib/community-client';
import {
  getTrackerSnapshot,
  invalidateTrackerSnapshot,
  peekTrackerSnapshot,
  type TrackerSnapshot,
} from '@/lib/tracker-client';
import { isTelegramMiniAppRuntime } from '@/lib/telegram-auto-login';
import { useAuthState } from '@/components/AuthStateProvider';
import LibraryStatusControl from '@/components/LibraryStatusControl';

type Filter = LibraryStatus | 'all';

function formatResumeTime(milliseconds: number) {
  const seconds = Math.max(0, Math.floor(milliseconds / 1000));
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return `${minutes}:${String(remainder).padStart(2, '0')}`;
}

const filterIcons: Record<Filter, string> = {
  all: '/brand/brand-mark.png',
  watching: '/brand/icons/watching.svg',
  planned: '/brand/icons/planned.svg',
  completed: '/brand/icons/completed.svg',
  dropped: '/brand/icons/dropped.svg',
};

export default function MyListPage() {
  const {
    user,
    loading: authLoading,
    telegramMiniApp,
    telegramAutoLoginDisabled,
  } = useAuthState();

  const [data, setData] = useState<TrackerSnapshot | null>(null);
  const [filter, setFilter] = useState<Filter>('all');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (force = false) => {
    if (!user?.id) return;

    try {
      setError('');
      const cached = peekTrackerSnapshot(user.id);
      if (cached) {
        setData(cached);
        setLoading(false);
      } else {
        setLoading(true);
      }

      const nextData = await getTrackerSnapshot(user.id, force);
      setData(nextData);
    } catch (error) {
      setData(null);
      setError(
        error instanceof Error
          ? error.message
          : 'Не удалось загрузить библиотеку.',
      );
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    let active = true;

    const inTelegram = telegramMiniApp || isTelegramMiniAppRuntime();
    const waitingForTelegramAuth =
      inTelegram && !telegramAutoLoginDisabled && !user;

    function handleLibraryUpdated() {
      if (!user?.id) return;
      invalidateTrackerSnapshot(user.id);
      if (active) void load(true);
    }

    window.addEventListener('library-updated', handleLibraryUpdated);

    let stateTimer: number | null = null;

    if (authLoading || waitingForTelegramAuth) {
      stateTimer = window.setTimeout(() => {
        if (!active) return;
        setData(null);
        setError('');
        setLoading(true);
      }, 0);
    } else if (!user) {
      stateTimer = window.setTimeout(() => {
        if (!active) return;
        setData(null);
        setLoading(false);
        setError('Войди в аккаунт.');
      }, 0);
    } else {
      const cached = peekTrackerSnapshot(user.id);
      stateTimer = window.setTimeout(() => {
        if (!active) return;
        setData(cached);
        setError('');
        setLoading(!cached);
        void load(false);
      }, 0);
    }

    return () => {
      active = false;
      if (stateTimer !== null) window.clearTimeout(stateTimer);
      window.removeEventListener('library-updated', handleLibraryUpdated);
    };
  }, [
    authLoading,
    telegramAutoLoginDisabled,
    telegramMiniApp,
    user,
    load,
  ]);

  const filteredLibrary = useMemo(() => {
    if (!data) return [];
    if (filter === 'all') return data.library;
    return data.library.filter((item) => item.status === filter);
  }, [data, filter]);

  function filterCount(value: Filter) {
    if (!data) return 0;
    if (value === 'all') return data.library.length;
    return data.stats[value];
  }

  function removeLocally(animeId: number) {
    setData((current) => {
      if (!current) return current;

      const removed = current.library.find((item) => item.anime_id === animeId);
      if (!removed) return current;

      return {
        library: current.library.filter((item) => item.anime_id !== animeId),
        stats: {
          ...current.stats,
          [removed.status]: Math.max(0, current.stats[removed.status] - 1),
        },
      };
    });
  }

  return (
    <main className="detail tracker-page">
      <header className="tracker-hero">
        <div className="tracker-hero__brand">
          <div className="tracker-hero__mark" aria-hidden="true">
            <img src="/brand/brand-mark.png" alt="" />
          </div>

          <div>
            <span className="tracker-eyebrow">ANIMEBOX LIBRARY</span>
            <h1>Мой трекер</h1>
            <p>Твоя коллекция, статусы и прогресс — в одном месте.</p>
          </div>
        </div>

        {data && (
          <div className="tracker-summary" aria-label="Статистика библиотеки">
            <div>
              <strong>{data.library.length}</strong>
              <span>В закладках</span>
            </div>
            <div>
              <strong>{data.stats.watching}</strong>
              <span>Смотрю</span>
            </div>
            <div>
              <strong>{data.stats.completed}</strong>
              <span>Завершено</span>
            </div>
          </div>
        )}
      </header>

      {!authLoading && !loading && !user && !data && (
        <section className="mx-auto flex w-full max-w-lg flex-col items-center rounded-2xl border border-violet-400/20 bg-gradient-to-br from-slate-900 to-slate-950 p-6 text-center sm:p-8">
          <div aria-hidden="true" className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-violet-500/15 text-violet-300">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><rect x="5" y="10" width="14" height="11" rx="3" /><path d="M8 10V7a4 4 0 0 1 8 0v3M12 14v3" /></svg>
          </div>
          <h2 className="text-xl font-bold text-white">Твоя история аниме начинается здесь</h2>
          <p className="mt-3 text-sm leading-relaxed text-slate-400">Войди, чтобы сохранять любимые тайтлы, отслеживать серии и прогресс. Смотри аниме, прокачивай уровень и поднимайся в лидерборде.</p>
          <Link href="/login" className="mt-5 inline-flex min-h-12 w-full items-center justify-center rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 px-5 py-3 font-semibold text-white transition hover:brightness-110 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-violet-400">Войти</Link>
        </section>
      )}

      {error && user && (
        <section className="tracker-error" role="alert">
          <span>{error}</span>
          <div className="tracker-error__actions flex flex-wrap items-center gap-3">
            <Link href="/login" className="tracker-error__login">
              Войти
            </Link>
            <button
              type="button"
              className="tracker-error__retry"
              onClick={() => void load(true)}
            >
              Повторить
            </button>
          </div>
        </section>
      )}

      {!data && !error && loading && (
        <div className="tracker-loading" role="status">
          <span className="tracker-loading__dot" />
          Загружаем библиотеку…
        </div>
      )}

      {data && (
        <>
          <nav className="tracker-filters" aria-label="Фильтр библиотеки">
            {(
              ['all', 'watching', 'planned', 'completed', 'dropped'] as Filter[]
            ).map((value) => {
              const active = filter === value;
              const label = value === 'all' ? 'Все' : statusLabels[value];

              return (
                <button
                  key={value}
                  type="button"
                  aria-pressed={active}
                  data-status={value}
                  className={active ? 'tracker-filter is-active' : 'tracker-filter'}
                  onClick={() => setFilter(value)}
                >
                  <span className="tracker-filter__icon" aria-hidden="true">
                    <img src={filterIcons[value]} alt="" />
                  </span>
                  <span className="tracker-filter__label">{label}</span>
                  <span className="tracker-filter__count">
                    {filterCount(value)}
                  </span>
                </button>
              );
            })}
          </nav>

          {filteredLibrary.length > 0 ? (
            <div className="tracker-list">
              {filteredLibrary.map((item) => (
                <article
                  className="tracker-card"
                  data-status={item.status}
                  key={item.anime_id}
                >
                  <div className="tracker-card__top">
                    <div className="tracker-card__identity">
                      <div className="tracker-card__mark" aria-hidden="true">
                        <img src="/brand/brand-mark.png" alt="" />
                      </div>

                      <div className="tracker-card__title">
                        <span className="tracker-card__label">
                          ЛИЧНАЯ БИБЛИОТЕКА
                        </span>
                        <Link href={`/anime/${item.anime_id}`} title={item.title}>
                          {item.title}
                        </Link>
                      </div>
                    </div>

                    <div className="tracker-card__right">
                      <span
                        className={`tracker-status tracker-status--${item.status}`}
                      >
                        {statusLabels[item.status]}
                      </span>

                      <Link
                        href={`/anime/${item.anime_id}`}
                        className="tracker-card__open"
                      >
                        Открыть <span aria-hidden="true">→</span>
                      </Link>
                    </div>
                  </div>

                  {item.progress && item.progress.trackedEpisodes > 0 && (
                    <div className="mt-3 rounded-xl border border-violet-400/10 bg-violet-500/[0.035] p-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="min-w-0">
                          <span className="block text-[9px] font-extrabold uppercase tracking-[0.16em] text-violet-300/45">
                            Подтверждённый просмотр
                          </span>
                          <strong className="mt-1 block text-xs text-white/80">
                            {item.progress.fullyCompleted
                              ? 'Тайтл полностью просмотрен'
                              : item.progress.resumeEpisode
                                ? `Серия ${item.progress.resumeEpisode}`
                                : item.progress.latestEpisode
                                  ? `Последняя серия: ${item.progress.latestEpisode}`
                                  : 'Прогресс сохранён'}
                          </strong>
                        </div>

                        <span className="text-[11px] font-bold text-violet-200/75">
                          {item.progress.totalEpisodes
                            ? `${item.progress.completedEpisodes} / ${item.progress.totalEpisodes} серий`
                            : `${item.progress.completedEpisodes} серий подтверждено`}
                        </span>
                      </div>

                      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/[0.055]">
                        <span
                          className="block h-full rounded-full bg-gradient-to-r from-violet-500 to-indigo-400"
                          style={{
                            width: `${Math.min(
                              100,
                              Math.max(
                                0,
                                item.progress.totalEpisodes
                                  ? (item.progress.completedEpisodes /
                                      item.progress.totalEpisodes) *
                                      100
                                  : item.progress.progressPercent ?? 0,
                              ),
                            )}%`,
                          }}
                        />
                      </div>

                      {item.progress.resumeEpisode && (
                        <Link
                          href={`/anime/${item.anime_id}/episode/${item.progress.resumeEpisode}`}
                          className="mt-2 inline-flex min-h-9 items-center gap-2 rounded-lg border border-violet-400/15 bg-violet-500/[0.07] px-3 text-[11px] font-bold text-violet-100 transition hover:bg-violet-500/[0.12]"
                        >
                          Продолжить
                          {item.progress.resumePositionMs >= 10_000
                            ? ` · ${formatResumeTime(item.progress.resumePositionMs)}`
                            : ''}
                          <span aria-hidden="true">→</span>
                        </Link>
                      )}
                    </div>
                  )}

                  <div className="tracker-card__controls">
                    <LibraryStatusControl
                      animeId={item.anime_id}
                      initialStatus={item.status}
                      variant="compact"
                      onRemoved={() => removeLocally(item.anime_id)}
                    />
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <section className="tracker-empty">
              <img src="/brand/empty-library.png" alt="" aria-hidden="true" />
              <span className="tracker-eyebrow">БИБЛИОТЕКА</span>
              <h2>Здесь пока пусто</h2>
              <p>
                Добавь аниме в эту категорию — и оно появится здесь вместе со
                статусом и прогрессом.
              </p>
              <Link href="/search">
                Найти аниме <span aria-hidden="true">→</span>
              </Link>
            </section>
          )}
        </>
      )}
    </main>
  );
}
