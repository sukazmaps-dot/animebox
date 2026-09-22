'use client';
import { communityRequest } from '@/lib/community-client';
import {
  getEpisodeAvailability,
  peekEpisodeAvailability,
} from '@/lib/episode-availability-client';
import type { EpisodeAvailabilityResponse } from '@/types/episode-availability';

import { animeHref } from '@/lib/anime-url';

import {
  useEffect,
  useMemo,
  useState,
} from 'react';

import { useRouter } from 'next/navigation';

import type {
  Anime,
  AnimeListItem,
} from '@/types/anime';

import {
  addAnimeToList,
  getAnimeProgress,
  getWatchingState,
  isAnimeFavorite,
  readAnimeList,
  toggleAnimeFavorite,
} from '@/lib/anime-storage';

import EpisodeList from '@/components/EpisodeList';

type LatestWatchState = {
  episode: number;
  positionMs: number;
  durationMs: number | null;
  coverageMs: number;
  activeMs: number;
  completed: boolean;
  watchedAt: string | null;
};

type WatchStateResponse = {
  state?: LatestWatchState | null;
};

function toListItem(
  anime: Anime,
): AnimeListItem {
  return {
    ...anime,

    genres: Array.isArray(anime.genres)
      ? anime.genres
      : [],
  };
}

function getAvailableEpisodes(
  anime: Anime,
): number | null {
  if (
    anime.episodes &&
    anime.episodes > 0
  ) {
    return anime.episodes;
  }

  if (
    anime.episodesAired &&
    anime.episodesAired > 0
  ) {
    return anime.episodesAired;
  }

  return null;
}

function useEpisodeAvailability(anime: Anime) {
  const metadataCount = getAvailableEpisodes(anime);
  const [availability, setAvailability] =
    useState<EpisodeAvailabilityResponse | null>(
      () => peekEpisodeAvailability(anime.id),
    );

  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    const cached = peekEpisodeAvailability(anime.id);

    if (cached) {
      queueMicrotask(() => {
        if (active) setAvailability(cached);
      });
      return () => {
        active = false;
        controller.abort();
      };
    }

    queueMicrotask(() => {
      if (active) setAvailability(null);
    });
    getEpisodeAvailability(anime.id, { signal: controller.signal })
      .then((data) => {
        if (active) setAvailability(data);
      })
      .catch((error) => {
        if (!active || controller.signal.aborted) return;
        console.warn('Player availability check failed:', error);
        setAvailability({
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

  const count =
    availability?.status === 'available'
      ? availability.maxEpisode
      : availability?.status === 'unavailable'
        ? null
        : metadataCount;

  return {
    availability,
    count,
    pending: availability === null,
    unavailable: availability?.status === 'unavailable',
  };
}

export default function AnimeDetailControls({
  anime,
  showEpisodes = true,
}: {
  anime: Anime;
  showEpisodes?: boolean;
}) {
  const router = useRouter();

  const item = useMemo(
    () => toListItem(anime),
    [anime],
  );

  const {
    count: availableEpisodes,
    pending: episodeAvailabilityPending,
    unavailable: episodesUnavailable,
  } = useEpisodeAvailability(anime);

  const [favorite, setFavorite] =
    useState(false);

  const [progress, setProgress] =
    useState(0);

  const [saved, setSaved] =
    useState(false);

  const [watchState, setWatchState] =
    useState<LatestWatchState | null>(null);

  const [
    watchingState,
    setWatchingState,
  ] = useState<
    'all' | 'watching' | 'watched'
  >('all');

  useEffect(() => {
    const sync = () => {
      setFavorite(
        isAnimeFavorite(anime.id),
      );

      setProgress(
        getAnimeProgress(anime.id),
      );

      setWatchingState(
        getWatchingState(item),
      );

      setSaved(
        readAnimeList().some(
          (entry) =>
            entry.id === anime.id,
        ),
      );
    };

    // localStorage читается только
    // после гидрации.
    sync();

    window.addEventListener(
      'storage',
      sync,
    );

    window.addEventListener(
      'anime-favorites-changed',
      sync,
    );

    window.addEventListener(
      'anime-list-changed',
      sync,
    );

    return () => {
      window.removeEventListener(
        'storage',
        sync,
      );

      window.removeEventListener(
        'anime-favorites-changed',
        sync,
      );

      window.removeEventListener(
        'anime-list-changed',
        sync,
      );
    };
  }, [anime.id, item]);

  useEffect(() => {
    let active = true;

    fetch(`/api/watch?animeId=${encodeURIComponent(String(anime.id))}`, {
      cache: 'no-store',
    })
      .then(async (response) => {
        if (response.status === 401) return null;
        if (!response.ok) return null;
        return (await response.json()) as WatchStateResponse;
      })
      .then((payload) => {
        if (active) {
          setWatchState(payload?.state ?? null);
        }
      })
      .catch(() => {
        if (active) setWatchState(null);
      });

    return () => {
      active = false;
    };
  }, [anime.id]);

  const fallbackEpisode = Math.max(progress, 1);

  const serverEpisode = watchState
    ? watchState.completed &&
      availableEpisodes &&
      watchState.episode < availableEpisodes
      ? watchState.episode + 1
      : watchState.episode
    : null;

  const nextEpisode = availableEpisodes
    ? Math.min(
        Math.max(serverEpisode ?? fallbackEpisode, 1),
        availableEpisodes,
      )
    : Math.max(serverEpisode ?? fallbackEpisode, 1);

  const progressText =
    availableEpisodes
      ? `${Math.min(
          progress,
          availableEpisodes,
        )} / ${availableEpisodes}`
      : progress > 0
        ? `Серия ${progress}`
        : 'Не начато';

  const handleFavorite = () => {
    setFavorite(
      toggleAnimeFavorite(item),
    );
  };

  const [trackerMessage, setTrackerMessage] = useState('');
  const [trackerBusy, setTrackerBusy] = useState(false);
  const handleAddToTracker = async () => {
    if (trackerBusy) return;
    setTrackerBusy(true); setTrackerMessage('');
    try {
      await communityRequest('library', { animeId: anime.id, status: 'planned' });
      addAnimeToList(item); setSaved(true);
      window.dispatchEvent(new Event('library-updated'));
      setTrackerMessage('Добавлено в планы аккаунта.');
    } catch (error) { setTrackerMessage((error as Error).message); }
    finally { setTrackerBusy(false); }
  };

  const handleWatch = () => {
    addAnimeToList(item);
    setSaved(true);

    router.push(
      `${animeHref(anime)}/episode/${nextEpisode}`,
    );
  };

  return (
    <>
      {trackerMessage && <p className="anime-detail-actions__message" role="status">{trackerMessage}</p>}
      <div className="anime-detail-actions mt-7 flex flex-wrap gap-3">
        <button
          type="button"
          className="btn btn--primary anime-detail-actions__watch"
          onClick={handleWatch}
          disabled={episodeAvailabilityPending || episodesUnavailable}
          title={
            episodesUnavailable
              ? 'Сейчас нет серий, которые можно открыть в плеере'
              : undefined
          }
        >
          ▶{' '}
          {episodeAvailabilityPending
            ? 'Проверяем плеер…'
            : episodesUnavailable
              ? 'Серии пока недоступны'
              : watchState
                ? watchState.completed && nextEpisode > watchState.episode
                  ? `Следующая · серия ${nextEpisode}`
                  : `Продолжить · серия ${nextEpisode}`
                : progress > 0
                  ? `Продолжить · серия ${nextEpisode}`
                  : 'Смотреть с 1 серии'}
        </button>

        <button
          type="button"
          className={`btn anime-detail-actions__favorite ${
            favorite
              ? 'btn--primary'
              : 'btn--ghost'
          }`}
          onClick={handleFavorite}
          aria-pressed={favorite}
        >
          {favorite
            ? '♥ В избранном'
            : '♡ В избранное'}
        </button>

        {!saved && (
          <button
            type="button"
            className="btn btn--ghost anime-detail-actions__tracker"
            onClick={
              handleAddToTracker
            }
          >
            {trackerBusy ? 'Сохраняем…' : '＋ В трекер'}
          </button>
        )}

        {watchingState ===
          'watching' && (
          <span className="anime-detail-actions__state is-watching self-center text-sm">
            Смотрю ·{' '}
            {progressText}
          </span>
        )}

        {watchingState ===
          'watched' && (
          <span className="self-center text-sm text-emerald-300">
            ✓ Просмотрено ·{' '}
            {progressText}
          </span>
        )}

        {watchingState ===
          'all' &&
          saved && (
            <span className="anime-detail-actions__state self-center text-sm">
              Сохранено в трекере
            </span>
          )}
      </div>

      {showEpisodes &&
        (availableEpisodes || episodeAvailabilityPending || episodesUnavailable) && (
        <section className="detail__section mt-10">
          <div className="detail__section-header">
            <h2>Эпизоды</h2>

            <span>
              {episodeAvailabilityPending
                ? 'Проверяем плееры…'
                : episodesUnavailable
                  ? 'Нет доступных серий'
                  : `${availableEpisodes} эпизодов в плеере`}
            </span>
          </div>

          <EpisodeList
          trackingAnimeId={anime.id}
            animeId={anime.slug || anime.id}
            episodes={anime.episodes}
            episodesAired={
              anime.episodesAired
            }
            totalEpisodesKnown={Boolean(
              anime.episodes &&
                anime.episodes >
                  0,
            )}
            watchedUpTo={progress}
          />
        </section>
      )}
    </>
  );
}

export function AnimeDetailEpisodes({
  anime,
}: {
  anime: Anime;
}) {
  const {
    count: availableEpisodes,
    pending: episodeAvailabilityPending,
    unavailable: episodesUnavailable,
  } = useEpisodeAvailability(anime);

  const [progress, setProgress] =
    useState(0);

  useEffect(() => {
    const sync = () => {
      setProgress(
        getAnimeProgress(anime.id),
      );
    };

    sync();

    window.addEventListener(
      'storage',
      sync,
    );
    window.addEventListener(
      'anime-list-changed',
      sync,
    );

    return () => {
      window.removeEventListener(
        'storage',
        sync,
      );
      window.removeEventListener(
        'anime-list-changed',
        sync,
      );
    };
  }, [anime.id]);

  if (!availableEpisodes && !episodeAvailabilityPending && !episodesUnavailable) {
    return null;
  }

  return (
    <section className="detail__section anime-detail-episodes mt-8 md:mt-10">
      <div className="detail__section-header">
        <h2>Эпизоды</h2>
        <span>
          {episodeAvailabilityPending
            ? 'Проверяем плееры…'
            : episodesUnavailable
              ? 'Нет доступных серий'
              : `${availableEpisodes} эпизодов в плеере`}
        </span>
      </div>

      <EpisodeList
          trackingAnimeId={anime.id}
        animeId={anime.slug || anime.id}
        episodes={anime.episodes}
        episodesAired={
          anime.episodesAired
        }
        totalEpisodesKnown={Boolean(
          anime.episodes &&
            anime.episodes > 0,
        )}
        watchedUpTo={progress}
      />
    </section>
  );
}
