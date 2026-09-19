'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import EpisodeComments from '@/components/EpisodeComments';
import LibraryStatusControl from '@/components/LibraryStatusControl';
import AdSlot from '@/components/monetization/AdSlot';
import AnimeNotificationControl from '@/components/AnimeNotificationControl';
import type { Anime } from '@/types/anime';
import {
  addAnimeToList,
  getAnimeProgress,
  recordAnimeView,
  setAnimeProgress,
} from '@/lib/anime-storage';
import { cleanShikimoriDescription } from '@/lib/shikimori-text';
import { getAnimeTitle } from '@/lib/anime-display';
import {
  getEpisodeAvailability,
  peekEpisodeAvailability,
} from '@/lib/episode-availability-client';
import type { EpisodeAvailabilityResponse } from '@/types/episode-availability';

import EpisodeCompletion from '@/components/EpisodeCompletion';
import AnimePlayer, { PlayerSource } from '@/components/AnimePlayer';
import WatchPartyPanel from '@/components/watch-party/WatchPartyPanel';
import theaterStyles from '@/components/watch-party/WatchTogetherTheater.module.css';
import { WATCH_PARTY_EXIT_EVENT } from '@/lib/watch-party';
import AnimeImage from '@/components/AnimeImage';
import EpisodeList from '@/components/EpisodeList';
import type { EpisodeSeasonTab, EpisodeSeasonsResponse } from '@/types/episode-seasons';

type SourceApiResponse = {
  episodes?: number[];
  hls?: Array<{
    title: string;
    url: string;
    type?: 'hls';
  }>;
  externalPlayer?: string | null;
  reason?: string;
  error?: string;
};

type KodikApiResponse = {
  name?: string;
  translations?: Array<{
    title: string;
    url: string;
    type?: 'kodik';
  }>;
  status?: 'available' | 'unavailable' | 'unknown';
  maxEpisode?: number | null;
  error?: string;
};

export default function AnimeEpisodePage({ anime, requestedEpisode, theaterMode = false }: { anime: Anime; requestedEpisode: number; theaterMode?: boolean }) {
  const router = useRouter();
  const animeIdParam = anime.slug as string;
  const [theaterChatOpen, setTheaterChatOpen] = useState(false);
  const [watchedUpTo, setWatchedUpTo] = useState(0);
  const [providerEpisodes, setProviderEpisodes] = useState<number[]>([]);
  const [sources, setSources] = useState<PlayerSource[]>([]);
  const [loadingSources, setLoadingSources] = useState(false);
  const [sourceMessage, setSourceMessage] = useState('');
  const [sourceIdentity, setSourceIdentity] = useState('');
  const [seasonNavigation, setSeasonNavigation] = useState<EpisodeSeasonsResponse | null>(null);
  const [episodeAvailability, setEpisodeAvailability] =
    useState<EpisodeAvailabilityResponse | null>(
      () => peekEpisodeAvailability(anime.id),
    );

  const metadataEpisodes = Math.max(anime.episodes || 0, anime.episodesAired || 0) || null;
  const providerMaxEpisode = providerEpisodes.length
    ? Math.max(...providerEpisodes)
    : null;
  const availableEpisodes =
    episodeAvailability?.status === 'available'
      ? episodeAvailability.maxEpisode
      : episodeAvailability?.status === 'unavailable'
        ? null
        : providerMaxEpisode || metadataEpisodes;

  const totalEpisodesKnown = Boolean(
    anime?.episodes && anime.episodes > 0,
  );

  const episodeNumber = useMemo(() => {
    if (!Number.isSafeInteger(requestedEpisode) || requestedEpisode < 1) {
      return 1;
    }

    return requestedEpisode;
  }, [requestedEpisode]);

  useEffect(() => {
    if (!theaterMode) return;

    document.documentElement.classList.add('animebox-watch-together-theater');
    document.body.classList.add('animebox-watch-together-theater');

    return () => {
      document.documentElement.classList.remove('animebox-watch-together-theater');
      document.body.classList.remove('animebox-watch-together-theater');
    };
  }, [theaterMode]);

  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    const cached = peekEpisodeAvailability(anime.id);

    if (cached) {
      queueMicrotask(() => {
        if (active) setEpisodeAvailability(cached);
      });
      return () => {
        active = false;
        controller.abort();
      };
    }

    getEpisodeAvailability(anime.id, { signal: controller.signal })
      .then((data) => {
        if (active) setEpisodeAvailability(data);
      })
      .catch((error) => {
        if (!active || controller.signal.aborted) return;
        console.warn('Episode availability unavailable:', error);
        setEpisodeAvailability({
          animeId: anime.id,
          status: 'unknown',
          episodes: [],
          maxEpisode: null,
          providers: [],
        });
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [anime.id]);

  useEffect(() => {
    if (!anime) return;

    addAnimeToList(anime);
    setAnimeProgress(anime.id, episodeNumber);
    recordAnimeView(anime);

    queueMicrotask(() => {
      setWatchedUpTo(getAnimeProgress(anime.id));
    });
  }, [anime, animeIdParam, episodeNumber]);

  const expectedSourceIdentity = `${animeIdParam}:${episodeNumber}`;

  useEffect(() => {
    if (!anime) return;

    const controller = new AbortController();
    let active = true;
    const identity = `${animeIdParam}:${episodeNumber}`;
    const timeout = window.setTimeout(() => controller.abort(), 24_000);

    queueMicrotask(() => {
      if (!active) return;
      setLoadingSources(true);
      setSources([]);
      setSourceIdentity('');
      setSourceMessage('');
    });

    function publishSource(source: PlayerSource) {
      if (!active || controller.signal.aborted || source.translations.length === 0) {
        return;
      }

      setSources((current) => {
        const withoutSameSource = current.filter((item) => item.name !== source.name);
        const next = [...withoutSameSource, source];

        // Kodik is the primary provider, so keep it first without changing
        // the selected source after the player has already appeared.
        return next.sort((a, b) => {
          if (a.name === 'Kodik') return -1;
          if (b.name === 'Kodik') return 1;
          return 0;
        });
      });

      setSourceIdentity(identity);
      setSourceMessage('');
      setLoadingSources(false);
    }

    async function loadKodik() {
      const shikimoriId = anime.idMal || anime.mal_id;
      if (!shikimoriId) return false;

      try {
        const response = await fetch(
          `/api/players/kodik?shikimoriId=${encodeURIComponent(String(shikimoriId))}&episode=${encodeURIComponent(String(episodeNumber))}`,
          {
            signal: controller.signal,
            cache: 'no-store',
          },
        );

        const data = (await response.json()) as KodikApiResponse;

        if (data.maxEpisode && data.maxEpisode > 0) {
          setProviderEpisodes((current) => [
            ...new Set([
              ...current,
              ...Array.from({ length: data.maxEpisode! }, (_, index) => index + 1),
            ]),
          ].sort((a, b) => a - b));
        }

        if (
          response.ok &&
          Array.isArray(data.translations) &&
          data.translations.length > 0
        ) {
          const translations = data.translations
            .filter((item) => Boolean(item?.url?.trim()))
            .map((item) => ({
              title: item.title || 'Озвучка',
              url: item.url,
              type: 'kodik' as const,
            }));

          if (translations.length > 0) {
            publishSource({
              name: 'Kodik',
              type: 'kodik',
              translations,
            });
            return true;
          }
        }

        return false;
      } catch (error) {
        if (controller.signal.aborted) throw error;
        console.warn('[Kodik] source unavailable:', error);
        return false;
      }
    }

    async function loadFallback() {
      try {
        const response = await fetch(
          `/api/anilibria?slug=${encodeURIComponent(animeIdParam)}&title=${encodeURIComponent(
            anime.title.romaji || anime.title.english || '',
          )}&season=${anime.providerSeason || 1}&episode=${episodeNumber}`,
          {
            signal: controller.signal,
            cache: 'no-store',
          },
        );

        const data = (await response.json()) as SourceApiResponse;

        if (!response.ok) {
          return data.error || data.reason || `Источник HTTP ${response.status}`;
        }

        if (!active || controller.signal.aborted) return '';

        if (data.episodes?.length) {
          setProviderEpisodes((current) =>
            [...new Set([...current, ...data.episodes!])].sort((a, b) => a - b),
          );
        }

        if (data.hls?.length) {
          const translations = data.hls
            .filter((item) => Boolean(item?.url?.trim()))
            .map((item) => ({
              title: item.title || 'HLS',
              url: item.url,
              type: 'hls' as const,
            }));

          if (translations.length > 0) {
            publishSource({
              name: 'AniLiberty',
              type: 'hls',
              translations,
            });
          }
        }

        if (data.externalPlayer?.trim()) {
          publishSource({
            name: 'Внешний плеер',
            type: 'iframe',
            translations: [
              {
                title: 'Плеер',
                url: data.externalPlayer,
                type: 'iframe',
              },
            ],
          });
        }

        return data.reason || '';
      } catch (error) {
        if (controller.signal.aborted) throw error;
        console.warn('[AniLiberty] source unavailable:', error);
        return error instanceof Error ? error.message : 'Не удалось загрузить резервный источник.';
      }
    }

    async function loadSources() {
      let fallbackReason = '';

      try {
        /*
         * Important performance rule:
         * as soon as Kodik is ready, show the player immediately.
         * AniLiberty then loads as a background fallback instead of blocking
         * the whole page for up to ~24 seconds.
         */
        const kodikReady = await loadKodik();

        if (!active || controller.signal.aborted) return;

        if (kodikReady) {
          // Do not await this before showing the player.
          void loadFallback().catch(() => undefined);
          return;
        }

        fallbackReason = await loadFallback();

        if (!active || controller.signal.aborted) return;

        setSourceIdentity(identity);
        setLoadingSources(false);
        setSourceMessage(
          ['not_found', 'episode_unavailable'].includes(fallbackReason)
            ? 'Видео для этой серии пока недоступно.'
            : fallbackReason || 'Видеоисточник для этой серии не найден.',
        );
      } catch (error) {
        if (!active) return;

        setSourceIdentity(identity);
        setLoadingSources(false);
        setSourceMessage(
          controller.signal.aborted
            ? 'Проверка источника заняла слишком много времени. Обновите страницу.'
            : error instanceof Error
              ? error.message
              : 'Не удалось загрузить видео.',
        );
      } finally {
        window.clearTimeout(timeout);
      }
    }

    void loadSources();

    return () => {
      active = false;
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [anime, animeIdParam, episodeNumber]);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;

    fetch(`/api/anime/${anime.id}/seasons`, {
      signal: controller.signal,
      cache: 'force-cache',
    })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(`Season navigation HTTP ${response.status}`);
        }

        return (await response.json()) as EpisodeSeasonsResponse;
      })
      .then((data) => {
        if (active) setSeasonNavigation(data);
      })
      .catch((error) => {
        if (!active || controller.signal.aborted) return;
        console.warn('Player season navigation unavailable:', error);
        setSeasonNavigation(null);
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [anime.id]);

  const seasonRoute = useMemo(() => {
    const seasons = seasonNavigation?.seasons ?? [];
    const currentIndex = seasons.findIndex(
      (season) => season.id === anime.id || season.isCurrent,
    );

    if (currentIndex < 0) {
      return {
        current: null as EpisodeSeasonTab | null,
        previous: null as EpisodeSeasonTab | null,
        next: null as EpisodeSeasonTab | null,
      };
    }

    return {
      current: seasons[currentIndex] ?? null,
      previous: currentIndex > 0 ? seasons[currentIndex - 1] ?? null : null,
      next:
        currentIndex + 1 < seasons.length
          ? seasons[currentIndex + 1] ?? null
          : null,
    };
  }, [anime.id, seasonNavigation?.seasons]);

  const waitingForSources = loadingSources || sourceIdentity !== expectedSourceIdentity;

  useEffect(() => {
    if (seasonRoute.next?.slug && seasonRoute.next.episodes.length > 0) {
      router.prefetch(`/anime/${seasonRoute.next.slug}/episode/1`);
    }

    const previousLastEpisode = seasonRoute.previous?.episodes.at(-1);
    if (seasonRoute.previous?.slug && previousLastEpisode) {
      router.prefetch(
        `/anime/${seasonRoute.previous.slug}/episode/${previousLastEpisode}`,
      );
    }
  }, [router, seasonRoute.next, seasonRoute.previous]);

  const currentSeasonEpisodes =
    episodeAvailability?.status === 'available'
      ? availableEpisodes ?? 0
      : episodeAvailability?.status === 'unavailable'
        ? 0
        : Math.max(
            availableEpisodes ?? 0,
            seasonRoute.current?.episodes.length ?? 0,
          );

  const previousSeasonLastEpisode =
    seasonRoute.previous?.episodes.at(-1) ?? null;

  const nextSeasonFirstEpisode =
    seasonRoute.next && seasonRoute.next.episodes.length > 0 ? 1 : null;

  const atFirstEpisode = episodeNumber <= 1;
  const atLastKnownEpisode =
    currentSeasonEpisodes > 0 && episodeNumber >= currentSeasonEpisodes;

  const hasPrev =
    episodeNumber > 1 ||
    Boolean(seasonRoute.previous && previousSeasonLastEpisode);

  const hasNext =
    (currentSeasonEpisodes > 0 && episodeNumber < currentSeasonEpisodes) ||
    Boolean(seasonRoute.next && nextSeasonFirstEpisode);

  const navigateToEpisode = (slug: string, number: number) => {
    if (!theaterMode) {
      router.push(`/anime/${slug}/episode/${number}`);
      return;
    }

    const current = new URL(window.location.href);
    const next = new URL(
      `/watch-together/${encodeURIComponent(slug)}/episode/${number}`,
      window.location.origin,
    );
    const roomId = current.searchParams.get('party');

    if (roomId) next.searchParams.set('party', roomId);
    next.hash = current.hash;

    router.push(`${next.pathname}${next.search}${next.hash}`);
  };

  const goToEpisode = (number: number) => {
    navigateToEpisode(animeIdParam, number);
  };

  const goToPrevious = () => {
    if (episodeNumber > 1) {
      goToEpisode(episodeNumber - 1);
      return;
    }

    if (seasonRoute.previous && previousSeasonLastEpisode) {
      navigateToEpisode(seasonRoute.previous.slug, previousSeasonLastEpisode);
    }
  };

  const goToNext = () => {
    if (currentSeasonEpisodes > 0 && episodeNumber < currentSeasonEpisodes) {
      goToEpisode(episodeNumber + 1);
      return;
    }

    if (seasonRoute.next && nextSeasonFirstEpisode) {
      navigateToEpisode(seasonRoute.next.slug, 1);
    }
  };

  const title = getAnimeTitle(anime);

  const poster =
    anime.coverImage?.extraLarge ||
    anime.coverImage?.large ||
    anime.coverImage?.medium ||
    undefined;

  const description = cleanShikimoriDescription(anime.description);

  if (theaterMode) {
    return (
      <div className={theaterStyles.viewport}>
        <div className={theaterStyles.shell}>
          <header className={theaterStyles.header}>
            <div className={theaterStyles.brandRow}>
              <span className={theaterStyles.brandMark} aria-hidden="true">✦</span>
              <div className={theaterStyles.brandCopy}>
                <span>ANIMEBOX · WATCH TOGETHER</span>
                <strong>{title} · {episodeNumber} серия</strong>
              </div>
            </div>

            <div className={theaterStyles.headerActions}>
              <span className={theaterStyles.headerStatus}>P2P ROOM</span>
              <button
                type="button"
                className={theaterStyles.chatToggle}
                onClick={() => setTheaterChatOpen((current) => !current)}
                aria-expanded={theaterChatOpen}
              >
                {theaterChatOpen ? 'Скрыть чат' : 'Чат'}
              </button>
              <button
                type="button"
                className={theaterStyles.exitButton}
                onClick={() => window.dispatchEvent(new Event(WATCH_PARTY_EXIT_EVENT))}
              >
                ← К серии
              </button>
            </div>
          </header>

          <div className={theaterStyles.content}>
            <main className={theaterStyles.playerColumn}>
              <div className={theaterStyles.playerWrap}>
                {waitingForSources ? (
                  <div className={theaterStyles.loadingPlayer}>
                    <div className={theaterStyles.loadingInner}>
                      <span className={theaterStyles.spinner} aria-hidden="true" />
                      <span>Подбираем лучший источник…</span>
                    </div>
                  </div>
                ) : (
                  <AnimePlayer
                    animeId={anime.id}
                    key={`${expectedSourceIdentity}:theater`}
                    title={title}
                    episodeNumber={episodeNumber}
                    totalEpisodes={availableEpisodes}
                    totalEpisodesKnown={totalEpisodesKnown}
                    poster={poster}
                    sources={sources}
                    hasPrev={hasPrev}
                    hasNext={hasNext}
                    prevLabel={atFirstEpisode && seasonRoute.previous ? 'Пред. сезон' : 'Пред. серия'}
                    nextLabel={atLastKnownEpisode && seasonRoute.next ? 'След. сезон' : 'След. серия'}
                    onPrev={goToPrevious}
                    onNext={goToNext}
                    onEnded={hasNext ? goToNext : undefined}
                    onEpisodeChange={goToEpisode}
                    watchTogetherMode
                  />
                )}

                {!waitingForSources && sources.length === 0 && sourceMessage && (
                  <div className={theaterStyles.sourceError}>{sourceMessage}</div>
                )}
              </div>
            </main>

            <button
              type="button"
              className={theaterStyles.drawerBackdrop}
              data-open={theaterChatOpen}
              aria-label="Закрыть чат"
              onClick={() => setTheaterChatOpen(false)}
            />

            <aside
              className={theaterStyles.roomColumn}
              data-open={theaterChatOpen}
              aria-label="Комната Watch Together"
            >
              <WatchPartyPanel
                animeTitle={title}
                animeSlug={animeIdParam}
                episodeNumber={episodeNumber}
                mode="theater"
              />
            </aside>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="detail episode-page pt-10 md:pt-12">
      <Link
        href={`/anime/${animeIdParam}`}
        className="group mb-1 inline-flex w-fit items-center gap-2 rounded-xl border border-white/[0.06] bg-white/[0.025] px-3 py-2 text-[11px] font-semibold text-white/45 transition hover:border-white/[0.10] hover:bg-white/[0.045] hover:text-white/80"
      >
        <span className="transition-transform group-hover:-translate-x-0.5">←</span>
        <span className="max-w-[70vw] truncate">Назад к {title}</span>
      </Link>

      {waitingForSources ? (
        <div className="relative isolate overflow-hidden rounded-[26px] border border-white/[0.08] bg-[linear-gradient(180deg,rgba(14,19,34,0.98),rgba(7,10,20,0.98))] p-3 shadow-[0_28px_90px_rgba(0,0,0,0.50)] md:p-4">
          <div className="pointer-events-none absolute inset-x-16 top-0 h-px bg-gradient-to-r from-transparent via-violet-400/60 to-transparent" />
          <div className="relative flex aspect-video w-full items-center justify-center overflow-hidden rounded-[20px] border border-white/[0.08] bg-black">
            <div className="flex flex-col items-center gap-3 text-center">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-white/10 border-t-violet-400" />
              <span className="text-xs font-semibold text-white/45">
                Подбираем лучший источник…
              </span>
            </div>
          </div>
        </div>
      ) : (
        <AnimePlayer
          animeId={anime.id}
          key={expectedSourceIdentity}
          title={title}
          episodeNumber={episodeNumber}
          totalEpisodes={availableEpisodes}
          totalEpisodesKnown={totalEpisodesKnown}
          poster={poster}
          sources={sources}
          hasPrev={hasPrev}
          hasNext={hasNext}
          prevLabel={atFirstEpisode && seasonRoute.previous ? 'Пред. сезон' : 'Пред. серия'}
          nextLabel={atLastKnownEpisode && seasonRoute.next ? 'След. сезон' : 'След. серия'}
          onPrev={goToPrevious}
          onNext={goToNext}
          onEnded={hasNext ? goToNext : undefined}
          onEpisodeChange={goToEpisode}
        />
      )}

      <WatchPartyPanel
        animeTitle={title}
        animeSlug={animeIdParam}
        episodeNumber={episodeNumber}
        mode="inline"
      />

      {!waitingForSources && sources.length === 0 && sourceMessage && (
        <div className="mt-3 rounded-lg border border-amber-900/40 bg-amber-950/20 py-3 text-center text-sm text-amber-400">
          {sourceMessage}
        </div>
      )}

      <EpisodeCompletion key={`${anime.id}:${episodeNumber}`} animeId={anime.id} episode={episodeNumber} />

      <section className="episode-engagement-grid" aria-label="Отслеживание и уведомления">
        <LibraryStatusControl animeId={anime.id} variant="compact" />

        <AnimeNotificationControl
          animeId={anime.id}
          animeSlug={anime.slug || String(anime.id)}
          animeTitle={title}
          episodesAired={anime.episodesAired || 0}
          variant="compact"
        />

        <a href="#episode-comments" className="episode-engagement-comments">
          <span className="episode-engagement-comments__eyebrow">Community</span>
          <strong>Обсудить {episodeNumber}-ю серию</strong>
          <span>Отдельная ветка только для этого эпизода — меньше случайных спойлеров.</span>
          <b>Перейти к комментариям ↓</b>
        </a>
      </section>

      <section className="detail__section episode-page__body">
        <div className="episode-page__info">
          <div className="episode-page__poster-shell">
            <AnimeImage
              image={anime.coverImage}
              alt={title}
              englishName={anime.title?.english || anime.title?.romaji}
              loading="lazy"
            />
          </div>

          <div>
            <h1 className="episode-page__title">{title} — {episodeNumber} серия</h1>

            <p className="mt-2 text-sm font-medium text-violet-200/70">
              Эпизод {episodeNumber} · прогресс просмотра сохраняется автоматически
            </p>

            {description && (
              <p className="episode-page__description">{description}</p>
            )}
          </div>
        </div>
      </section>

      <section className="detail__section detail__episodes">
        <div className="detail__section-header">
          <h2>Эпизоды</h2>

          {availableEpisodes && (
            <span>
              {totalEpisodesKnown
                ? `${availableEpisodes} эпизодов`
                : `Вышло ${availableEpisodes} эпизодов`}
            </span>
          )}
        </div>

        <EpisodeList
          trackingAnimeId={anime.id}
          animeId={animeIdParam}
          episodes={availableEpisodes}
          episodesAired={anime.episodesAired}
          totalEpisodesKnown={totalEpisodesKnown}
          currentEpisode={episodeNumber}
          watchedUpTo={watchedUpTo}
        />
      </section>
      <EpisodeComments
        animeId={anime.id}
        episode={episodeNumber}
      />

      <div className="episode-ad-break" aria-label="Рекламная пауза">
        <AdSlot
          placement="watch-below-engagement"
          format="horizontal"
          className="monetization-ad--watch"
        />
      </div>
    </div>
    
  );
}

