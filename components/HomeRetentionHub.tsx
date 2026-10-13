'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef } from 'react';

import AnimeImage from '@/components/AnimeImage';
import { animeHref, animeWatchHref } from '@/lib/anime-url';
import { trackProductClientEvent } from '@/lib/product-events-client';
import type { AnimeImage as AnimeImageType } from '@/types/anime';

export type HomeRetentionEpisodeSignal = {
  animeId: number;
  slug: string | null;
  title: string;
  episode: number;
  airingAt: number;
  coverImage: AnimeImageType | null;
  released: boolean;
};

export type HomeRetentionCompletionSignal = {
  animeId: number;
  slug: string | null;
  title: string;
  posterUrl: string | null;
  completedEpisodes: number;
  totalEpisodes: number;
  remainingEpisodes: number;
  nextEpisode: number;
  lastWatchedAt: number;
};

function formatAiringTime(airingAt: number) {
  return new Date(airingAt * 1000).toLocaleTimeString('ru-RU', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function HomeRetentionHub({
  episode,
  completion,
}: {
  episode: HomeRetentionEpisodeSignal | null;
  completion: HomeRetentionCompletionSignal | null;
}) {
  const sectionRef = useRef<HTMLElement | null>(null);
  const impressionTrackedRef = useRef(false);
  const sectionViewTrackedRef = useRef(false);
  const signalSignature = useMemo(
    () =>
      [
        episode ? `episode:${episode.animeId}:${episode.episode}:${episode.airingAt}` : '',
        completion
          ? `completion:${completion.animeId}:${completion.remainingEpisodes}`
          : '',
      ]
        .filter(Boolean)
        .join('|'),
    [completion, episode],
  );

  useEffect(() => {
    const element = sectionRef.current;
    if (!element || !signalSignature || impressionTrackedRef.current) return;

    let dwellTimer: number | null = null;
    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];

        if (entry?.isIntersecting && entry.intersectionRatio >= 0.4) {
          if (dwellTimer !== null) return;
          dwellTimer = window.setTimeout(() => {
            if (impressionTrackedRef.current) return;

            impressionTrackedRef.current = true;
            trackProductClientEvent('home_retention_impression', {
              source: 'home_retention',
              path: '/',
              entityType: 'surface',
              entityId: 'home_retention_hub',
              metadata: {
                has_episode: Boolean(episode),
                has_near_completion: Boolean(completion),
                signal_count:
                  Number(Boolean(episode)) +
                  Number(Boolean(completion)),
              },
            });

            if (!sectionViewTrackedRef.current) {
              sectionViewTrackedRef.current = true;
              trackProductClientEvent('home_section_view', {
                source: 'home_retention',
                path: '/',
                entityType: 'surface',
                entityId: 'home_retention_hub',
                metadata: { section: 'retention_hub' },
              });
            }

            observer.disconnect();
          }, 650);
        } else if (dwellTimer !== null) {
          window.clearTimeout(dwellTimer);
          dwellTimer = null;
        }
      },
      { threshold: [0, 0.4, 1] },
    );

    observer.observe(element);

    return () => {
      if (dwellTimer !== null) window.clearTimeout(dwellTimer);
      observer.disconnect();
    };
  }, [completion, episode, signalSignature]);

  if (!episode && !completion) return null;

  const signalCount =
    Number(Boolean(episode)) +
    Number(Boolean(completion));

  const episodeImage = episode?.coverImage ?? null;
  const completionImage = completion?.posterUrl
    ? {
        extraLarge: completion.posterUrl,
        large: completion.posterUrl,
        medium: completion.posterUrl,
      }
    : null;
  return (
    <section
      ref={sectionRef}
      className="home-retention"
      data-count={signalCount}
      aria-labelledby="home-retention-title"
    >
      <div className="home-retention__head">
        <div>
          <span>Твой вечер</span>
          <h2 id="home-retention-title">Что ждёт тебя в AnimeBox</h2>
        </div>
        <Link href="/list">Мой список →</Link>
      </div>

      <div className="home-retention__rail">
        {episode && (
          <Link
            href={
              episode.released
                ? animeWatchHref(
                    { id: episode.animeId, slug: episode.slug },
                    episode.episode,
                  )
                : animeHref({ id: episode.animeId, slug: episode.slug })
            }
            className="home-retention__card"
            onClick={() => {
              trackProductClientEvent('new_episode_click', {
                source: 'home_retention',
                path: '/',
                entityType: 'episode',
                entityId: `${episode.animeId}:${episode.episode}`,
                metadata: {
                  anime_id: episode.animeId,
                  episode: episode.episode,
                  airing_at: episode.airingAt,
                  released: episode.released,
                },
                flush: true,
              });
            }}
          >
            <span className="home-retention__poster">
              <AnimeImage
                image={episodeImage}
                alt={episode.title}
                englishName={episode.title}
                loading="lazy"
                sizes="64px"
                quality={58}
                sourcePreference="compact"
                preset="tiny"
              />
            </span>
            <span className="home-retention__copy">
              <small>{episode.released ? 'Новая серия' : 'Сегодня'}</small>
              <strong>{episode.title}</strong>
              <em>
                {episode.released
                  ? `Эпизод ${episode.episode} уже вышел`
                  : `Эпизод ${episode.episode} · ${formatAiringTime(episode.airingAt)}`}
              </em>
            </span>
            <b aria-hidden="true">→</b>
          </Link>
        )}

        {completion && (
          <Link
            href={animeWatchHref(
              { id: completion.animeId, slug: completion.slug },
              completion.nextEpisode,
            )}
            className="home-retention__card"
            onClick={() => {
              trackProductClientEvent('near_completion_click', {
                source: 'home_retention',
                path: '/',
                entityType: 'anime_id',
                entityId: String(completion.animeId),
                metadata: {
                  anime_id: completion.animeId,
                  completed_episodes: completion.completedEpisodes,
                  total_episodes: completion.totalEpisodes,
                  remaining_episodes: completion.remainingEpisodes,
                  next_episode: completion.nextEpisode,
                },
                flush: true,
              });
            }}
          >
            <span className="home-retention__poster">
              <AnimeImage
                image={completionImage}
                alt={completion.title}
                englishName={completion.title}
                loading="lazy"
                sizes="64px"
                quality={58}
                sourcePreference="compact"
                preset="tiny"
              />
            </span>
            <span className="home-retention__copy">
              <small>Финиш рядом</small>
              <strong>{completion.title}</strong>
              <em>
                {completion.remainingEpisodes === 1
                  ? 'Осталась последняя серия'
                  : `Осталось ${completion.remainingEpisodes} серии · ${completion.completedEpisodes}/${completion.totalEpisodes}`}
              </em>
            </span>
            <b aria-hidden="true">→</b>
          </Link>
        )}

      </div>
    </section>
  );
}
