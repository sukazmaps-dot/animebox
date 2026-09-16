'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import EpisodeComments from '@/components/EpisodeComments';
import type { Anime } from '@/types/anime';
import {
  addAnimeToList,
  getAnimeProgress,
  recordAnimeView,
  setAnimeProgress,
} from '@/lib/anime-storage';
import { cleanShikimoriDescription } from '@/lib/shikimori-text';
import { getAnimeTitle } from '@/lib/anime-display';

import EpisodeCompletion from '@/components/EpisodeCompletion';
import AnimePlayer, { PlayerSource } from '@/components/AnimePlayer';
import AnimeImage from '@/components/AnimeImage';
import EpisodeList from '@/components/EpisodeList';

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
  error?: string;
};

export default function AnimeEpisodePage({ anime, requestedEpisode }: { anime: Anime; requestedEpisode: number }) {
  const router = useRouter();
  const animeIdParam = anime.slug as string;
  const [watchedUpTo, setWatchedUpTo] = useState(0);
  const [providerEpisodes, setProviderEpisodes] = useState<number[]>([]);
  const [sources, setSources] = useState<PlayerSource[]>([]);
  const [loadingSources, setLoadingSources] = useState(false);
  const [sourceMessage, setSourceMessage] = useState('');
  const [sourceIdentity, setSourceIdentity] = useState('');

  const availableEpisodes =
    providerEpisodes.reduce((max, episode) => Math.max(max, episode), Math.max(anime.episodes || 0, anime.episodesAired || 0)) || null;

  const totalEpisodesKnown = Boolean(
    anime?.episodes && anime.episodes > 0,
  );

  const episodeNumber = useMemo(() => {
    if (!Number.isSafeInteger(requestedEpisode) || requestedEpisode < 1) {
      return 1;
    }

    return requestedEpisode;
  }, [requestedEpisode, availableEpisodes]);

  useEffect(() => {
    if (!anime) return;

    addAnimeToList(anime);
    setAnimeProgress(anime.id, episodeNumber);
    setWatchedUpTo(getAnimeProgress(anime.id));
    recordAnimeView(anime);
  }, [anime, animeIdParam, episodeNumber]);

  const expectedSourceIdentity = `${animeIdParam}:${episodeNumber}`;

  useEffect(() => {
    if (!anime) return;

    const controller = new AbortController();
    let active = true;
    const identity = `${animeIdParam}:${episodeNumber}`;
    const timeout = window.setTimeout(() => controller.abort(), 24000);

    const queries = [animeIdParam];
    setLoadingSources(true);
    setSources([]);
    setSourceIdentity('');
    setSourceMessage('');

    async function loadSources() {
      let lastReason = '';

      try {
        const nextSources: PlayerSource[] = [];
        const shikimoriId = anime.idMal || anime.mal_id;

        /*
         * 1. Kodik — основной источник.
         * Токен остаётся на сервере в /api/players/kodik.
         */
        if (shikimoriId) {
          try {
            const kodikResponse = await fetch(
              `/api/players/kodik?shikimoriId=${encodeURIComponent(String(shikimoriId))}`,
              {
                signal: controller.signal,
                cache: 'no-store',
              },
            );

            const kodikData = (await kodikResponse.json()) as KodikApiResponse;

            if (
              kodikResponse.ok &&
              Array.isArray(kodikData.translations) &&
              kodikData.translations.length > 0
            ) {
              nextSources.push({
                name: 'Kodik',
                type: 'kodik',
                translations: kodikData.translations
                  .filter((item) => Boolean(item?.url?.trim()))
                  .map((item) => ({
                    title: item.title || 'Озвучка',
                    url: item.url,
                    type: 'kodik' as const,
                  })),
              });
            } else if (kodikData.error) {
              lastReason = kodikData.error;
            }
          } catch (error) {
            if (controller.signal.aborted) throw error;
            console.warn('[Kodik] source unavailable:', error);
          }
        }

        /*
         * 2. AniLiberty — fallback.
         * Даже если Kodik недоступен, старый плеер продолжит работать.
         */
        for (const query of queries) {
          if (!active || controller.signal.aborted) return;

          try {
            const response = await fetch(
              `/api/anilibria?slug=${encodeURIComponent(query)}&title=${encodeURIComponent(anime.title.romaji || anime.title.english || '')}&season=${anime.providerSeason || 1}&episode=${episodeNumber}`,
              {
                signal: controller.signal,
                cache: 'no-store',
              },
            );

            const data = (await response.json()) as SourceApiResponse;

            if (!response.ok) {
              lastReason =
                data.error ||
                data.reason ||
                `Источник HTTP ${response.status}`;
              continue;
            }

            if (!active || controller.signal.aborted) return;

            if (data.episodes) {
              setProviderEpisodes(data.episodes);
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
                nextSources.push({
                  name: 'AniLiberty',
                  type: 'hls',
                  translations,
                });
              }
            }

            if (data.externalPlayer?.trim()) {
              nextSources.push({
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

            lastReason = data.reason || lastReason;
            break;
          } catch (error) {
            if (controller.signal.aborted) throw error;
            console.warn('[AniLiberty] source unavailable:', error);
          }
        }

        if (!active || controller.signal.aborted) return;

        const validSources = nextSources.filter(
          (source) => source.translations.length > 0,
        );

        setSources(validSources);

        if (validSources.length > 0) {
          setSourceMessage('');
        } else {
          setSourceMessage(
            ['not_found', 'episode_unavailable'].includes(lastReason)
              ? 'Видео для этой серии пока недоступно.'
              : lastReason || 'Видеоисточник для этой серии не найден.',
          );
        }
      } catch (error) {
        if (!active) return;

        setSources([]);
        setSourceMessage(
          controller.signal.aborted
            ? 'Проверка источника заняла слишком много времени. Обновите страницу.'
            : error instanceof Error
              ? error.message
              : 'Не удалось загрузить видео.',
        );
      } finally {
        window.clearTimeout(timeout);

        if (active) {
          setSourceIdentity(identity);
          setLoadingSources(false);
        }
      }
    }

    void loadSources();

    return () => {
      active = false;
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [anime, animeIdParam, episodeNumber]);

  const waitingForSources = loadingSources || sourceIdentity !== expectedSourceIdentity;

  const hasPrev = episodeNumber > 1;
  const hasNext = Boolean(
    availableEpisodes && episodeNumber < availableEpisodes,
  );

  const goToEpisode = (number: number) => {
    router.push(`/anime/${animeIdParam}/episode/${number}`);
  };

  const title = getAnimeTitle(anime);

  const poster =
    anime.coverImage?.extraLarge ||
    anime.coverImage?.large ||
    anime.coverImage?.medium ||
    undefined;

  const description = cleanShikimoriDescription(anime.description);

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
          onPrev={() => goToEpisode(episodeNumber - 1)}
          onNext={() => goToEpisode(episodeNumber + 1)}
          onEpisodeChange={goToEpisode}
        />
      )}

      {!waitingForSources && sources.length === 0 && sourceMessage && (
        <div className="mt-3 rounded-lg border border-amber-900/40 bg-amber-950/20 py-3 text-center text-sm text-amber-400">
          {sourceMessage}
        </div>
      )}

      <EpisodeCompletion key={`${anime.id}:${episodeNumber}`} animeId={anime.id} episode={episodeNumber} />
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
            <h1 className="episode-page__title">{title}</h1>

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
    </div>
    
  );
}

