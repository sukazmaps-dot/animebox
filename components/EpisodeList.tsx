'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';

import {
  findEpisodeGroupIndex,
  getEpisodeGroups,
} from '@/lib/episode-groups';

interface EpisodeListProps {
  animeId: string | number;
  episodes?: number | null;
  episodesAired?: number | null;
  totalEpisodesKnown?: boolean;
  currentEpisode?: number;
  watchedUpTo?: number;
}

export default function EpisodeList({
  animeId,
  episodes,
  episodesAired,
  totalEpisodesKnown = true,
  currentEpisode,
  watchedUpTo = 0,
}: EpisodeListProps) {
  const count =
    episodes && episodes > 0
      ? episodes
      : episodesAired && episodesAired > 0
        ? episodesAired
        : 0;

  const groups = useMemo(
    () => getEpisodeGroups(animeId, count),
    [animeId, count],
  );

  const focusEpisode = useMemo(() => {
    if (currentEpisode && currentEpisode > 0) {
      return Math.min(currentEpisode, count || currentEpisode);
    }

    if (watchedUpTo > 0) {
      return Math.min(watchedUpTo + 1, count || watchedUpTo + 1);
    }

    return 1;
  }, [count, currentEpisode, watchedUpTo]);

  const automaticGroupIndex = useMemo(
    () => findEpisodeGroupIndex(groups, focusEpisode),
    [focusEpisode, groups],
  );

  const [selectedGroupIndex, setSelectedGroupIndex] = useState(
    automaticGroupIndex,
  );

  useEffect(() => {
    setSelectedGroupIndex(automaticGroupIndex);
  }, [animeId, automaticGroupIndex]);

  if (count === 0 || groups.length === 0) {
    return (
      <div className="empty-state">
        <span>Информация об эпизодах пока недоступна.</span>
      </div>
    );
  }

  const activeGroup = groups[selectedGroupIndex] ?? groups[0];
  const visibleEpisodes = Array.from(
    { length: activeGroup.to - activeGroup.from + 1 },
    (_, index) => activeGroup.from + index,
  );

  return (
    <div>
      <div className="episode-list__meta">
        {totalEpisodesKnown
          ? `${count} эпизодов`
          : `Вышло ${count} эпизодов`}

        {groups.length > 1 && (
          <span className="ml-2 text-white/35">
            · показаны {activeGroup.from}–{activeGroup.to}
          </span>
        )}
      </div>

      {groups.length > 1 && (
        <div className="mb-4">
          <div className="mb-2 flex items-center justify-between gap-3">
            <span className="text-xs font-semibold uppercase tracking-[0.14em] text-white/45">
              Части / арки
            </span>
            <span className="text-xs text-white/35">
              {selectedGroupIndex + 1} / {groups.length}
            </span>
          </div>

          <div
            className="flex gap-2 overflow-x-auto pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
            role="tablist"
            aria-label="Группы эпизодов"
          >
            {groups.map((group, index) => {
              const active = index === selectedGroupIndex;

              return (
                <button
                  key={group.id}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setSelectedGroupIndex(index)}
                  className={`shrink-0 rounded-xl border px-3 py-2 text-left transition-colors ${
                    active
                      ? 'border-violet-400/60 bg-violet-500/20 text-white'
                      : 'border-white/10 bg-white/[0.03] text-white/60 hover:border-violet-400/35 hover:text-white'
                  }`}
                >
                  <span className="block text-xs font-semibold">
                    {group.kind === 'arc' ? group.title : `Серии ${group.title}`}
                  </span>
                  {group.kind === 'arc' && (
                    <span className="mt-0.5 block text-[10px] text-white/40">
                      {group.from}–{group.to}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div className="episode-list">
        {visibleEpisodes.map((number) => {
          const isCurrent = number === currentEpisode;
          const isWatched = !isCurrent && number <= watchedUpTo;

          const className = [
            'episode-list__item',
            isCurrent ? 'is-current' : '',
            isWatched ? 'is-watched' : '',
          ]
            .filter(Boolean)
            .join(' ');

          return (
            <Link
              key={number}
              href={`/anime/${animeId}/episode/${number}`}
              prefetch={false}
              className={className}
            >
              <span className="episode-list__number">{number}</span>
              <span className="episode-list__label">Серия {number}</span>
              {isWatched && <span className="episode-list__check">✓</span>}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
