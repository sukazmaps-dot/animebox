'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

import type { Anime } from '@/types/anime';
import {
  addAnimeToList,
  getAnimeProgress,
  recordAnimeView,
  setAnimeProgress,
} from '@/lib/anime-storage';
import { cleanShikimoriDescription } from '@/lib/shikimori-text';
import { getAnimeTitle } from '@/lib/anime-display';

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
        for (const query of queries) {
          if (!active || controller.signal.aborted) return;

          const response = await fetch(
            `/api/anilibria?slug=${encodeURIComponent(query)}&title=${encodeURIComponent(anime.title.romaji || anime.title.english || "")}&season=${anime.providerSeason || 1}&episode=${episodeNumber}`,
            {
              signal: controller.signal,
              cache: 'no-store',
            },
          );

          const data = (await response.json()) as SourceApiResponse;

          if (!response.ok) {
            lastReason = data.error || data.reason || `Источник HTTP ${response.status}`;
            continue;
          }

          if (!active || controller.signal.aborted) return;

          if (data.episodes) setProviderEpisodes(data.episodes);
          const nextSources: PlayerSource[] = [];

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

          if (nextSources.length > 0) {
            setSources(nextSources);
            setSourceMessage('');
            return;
          }

          lastReason = data.reason || lastReason;
        }

        if (active && !controller.signal.aborted) {
          setSources([]);
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
    <div className="detail episode-page">
      <Link href={`/anime/${animeIdParam}`} className="detail__back">
        ← Назад к {title}
      </Link>

      {waitingForSources ? (
        <div className="player">
          <div className="player__frame relative flex aspect-video w-full items-center justify-center overflow-hidden rounded-2xl bg-black shadow-2xl">
            <span className="text-sm text-gray-400">
              Поиск видеоисточников...
            </span>
          </div>
        </div>
      ) : (
        <AnimePlayer
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
        />
      )}

      {!waitingForSources && sources.length === 0 && sourceMessage && (
        <div className="mt-3 rounded-lg border border-amber-900/40 bg-amber-950/20 py-3 text-center text-sm text-amber-400">
          {sourceMessage}
        </div>
      )}

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
          animeId={animeIdParam}
          episodes={availableEpisodes}
          episodesAired={anime.episodesAired}
          totalEpisodesKnown={totalEpisodesKnown}
          currentEpisode={episodeNumber}
          watchedUpTo={watchedUpTo}
        />
      </section>
    </div>
  );
}
