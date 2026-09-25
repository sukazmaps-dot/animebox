'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';

import AnimeImage from '@/components/AnimeImage';
import { animeHref, animeWatchHref } from '@/lib/anime-url';
import { trackProductClientEvent } from '@/lib/product-events-client';
import { watchPartyTheaterPath } from '@/lib/watch-party';
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

type PublicWatchPartyRoom = {
  roomId: string;
  joinSecret: string;
  animeId: number | null;
  animeSlug: string;
  animeTitle: string;
  coverUrl: string | null;
  episode: number;
  status: 'waiting' | 'watching' | 'paused' | 'voting';
  participantCount: number;
  maxParticipants: number;
  host: {
    id: string;
    username: string;
  };
  isFull: boolean;
};

type PublicRoomsResponse = {
  rooms?: PublicWatchPartyRoom[];
};

function formatAiringTime(airingAt: number) {
  return new Date(airingAt * 1000).toLocaleTimeString('ru-RU', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

function roomHref(room: PublicWatchPartyRoom) {
  const path = watchPartyTheaterPath(room.animeSlug, Math.max(1, room.episode));
  return `${path}?party=${encodeURIComponent(room.roomId)}#partyKey=${encodeURIComponent(room.joinSecret)}`;
}

export default function HomeRetentionHub({
  episode,
  completion,
  personalAnimeIds,
  enableRooms,
}: {
  episode: HomeRetentionEpisodeSignal | null;
  completion: HomeRetentionCompletionSignal | null;
  personalAnimeIds: number[];
  enableRooms: boolean;
}) {
  const sectionRef = useRef<HTMLElement | null>(null);
  const impressionTrackedRef = useRef(false);
  const sectionViewTrackedRef = useRef(false);
  const [room, setRoom] = useState<PublicWatchPartyRoom | null>(null);

  const personalSignature = personalAnimeIds.join(',');

  useEffect(() => {
    if (!enableRooms || !personalSignature) {
      setRoom(null);
      return;
    }

    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      void fetch('/api/watch-party/rooms?limit=12', {
        cache: 'no-store',
        signal: controller.signal,
        headers: { Accept: 'application/json' },
      })
        .then(async (response) => {
          if (!response.ok) throw new Error(`Watch rooms HTTP ${response.status}`);
          return (await response.json()) as PublicRoomsResponse;
        })
        .then((payload) => {
          if (controller.signal.aborted) return;

          const personalIds = new Set(personalAnimeIds);
          const relevant = (payload.rooms ?? []).find(
            (candidate) =>
              !candidate.isFull &&
              candidate.animeId != null &&
              personalIds.has(candidate.animeId),
          );

          setRoom(relevant ?? null);
        })
        .catch((error: unknown) => {
          if (!(error instanceof Error && error.name === 'AbortError')) {
            setRoom(null);
          }
        });
    }, 3_200);

    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [enableRooms, personalAnimeIds, personalSignature]);

  const signalSignature = useMemo(
    () =>
      [
        episode ? `episode:${episode.animeId}:${episode.episode}:${episode.airingAt}` : '',
        completion
          ? `completion:${completion.animeId}:${completion.remainingEpisodes}`
          : '',
        room ? `room:${room.roomId}` : '',
      ]
        .filter(Boolean)
        .join('|'),
    [completion, episode, room],
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
                has_room: Boolean(room),
                signal_count:
                  Number(Boolean(episode)) +
                  Number(Boolean(completion)) +
                  Number(Boolean(room)),
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
  }, [completion, episode, room, signalSignature]);

  if (!episode && !completion && !room) return null;

  const signalCount =
    Number(Boolean(episode)) +
    Number(Boolean(completion)) +
    Number(Boolean(room));

  const episodeImage = episode?.coverImage ?? null;
  const completionImage = completion?.posterUrl
    ? {
        extraLarge: completion.posterUrl,
        large: completion.posterUrl,
        medium: completion.posterUrl,
      }
    : null;
  const roomImage = room?.coverUrl
    ? {
        extraLarge: room.coverUrl,
        large: room.coverUrl,
        medium: room.coverUrl,
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

        {room && (
          <Link
            href={roomHref(room)}
            className="home-retention__card"
            onClick={() => {
              trackProductClientEvent('watch_party_public_join_click', {
                source: 'home_retention',
                path: '/',
                entityType: 'watch_party_room',
                entityId: room.roomId,
                metadata: {
                  anime_id: room.animeId,
                  episode: room.episode,
                  participants: room.participantCount,
                  host_user_id: room.host.id,
                },
                flush: true,
              });
            }}
          >
            <span className="home-retention__poster">
              <AnimeImage
                image={roomImage}
                alt={room.animeTitle}
                englishName={room.animeTitle}
                loading="lazy"
                sizes="64px"
                quality={58}
                sourcePreference="compact"
              />
            </span>
            <span className="home-retention__copy">
              <small>Смотрят сейчас</small>
              <strong>{room.animeTitle}</strong>
              <em>
                Серия {room.episode} · {room.host.username} · {room.participantCount} онлайн
              </em>
            </span>
            <b aria-hidden="true">↗</b>
          </Link>
        )}
      </div>
    </section>
  );
}
