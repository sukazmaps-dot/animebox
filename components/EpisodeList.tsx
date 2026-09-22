'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { communityRequest } from '@/lib/community-client';
import {
  getEpisodeAvailability,
  peekEpisodeAvailability,
} from '@/lib/episode-availability-client';
import type { EpisodeAvailabilityResponse } from '@/types/episode-availability';
import {
  findEpisodeGroupIndex,
  getEpisodeGroups,
} from '@/lib/episode-groups';
import type {
  EpisodeExtraItem,
  EpisodeSeasonTab,
  EpisodeSeasonsResponse,
} from '@/types/episode-seasons';

interface EpisodeListProps {
  animeId: string | number;
  trackingAnimeId: number;
  episodes?: number | null;
  episodesAired?: number | null;
  totalEpisodesKnown?: boolean;
  currentEpisode?: number;
  watchedUpTo?: number;
}

function seasonKey(id: number) {
  return `season:${id}`;
}

function extraFormatLabel(format: string | null) {
  switch (format) {
    case 'MOVIE':
      return 'Фильм';
    case 'OVA':
      return 'OVA';
    case 'SPECIAL':
      return 'Спецвыпуск';
    default:
      return 'Доп. часть';
  }
}

export default function EpisodeList({
  animeId,
  trackingAnimeId,
  episodes,
  episodesAired,
  totalEpisodesKnown = true,
  currentEpisode,
  watchedUpTo = 0,
}: EpisodeListProps) {
  const currentCount =
    episodes && episodes > 0
      ? episodes
      : episodesAired && episodesAired > 0
        ? episodesAired
        : 0;

  const [seasonData, setSeasonData] = useState<EpisodeSeasonsResponse>({
    seasons: [],
    extras: [],
    partial: false,
  });
  const [activeTab, setActiveTab] = useState(seasonKey(trackingAnimeId));
  const [completedEpisodes, setCompletedEpisodes] = useState<number[]>([]);
  const [availability, setAvailability] = useState<EpisodeAvailabilityResponse | null>(
    () => peekEpisodeAvailability(trackingAnimeId),
  );
  const [availabilityLoading, setAvailabilityLoading] = useState(
    () => !peekEpisodeAvailability(trackingAnimeId),
  );

  useEffect(() => {
    const controller = new AbortController();
    let active = true;

    fetch(`/api/anime/${trackingAnimeId}/seasons`, {
      signal: controller.signal,
      cache: 'force-cache',
    })
      .then(async (response) => {
        if (!response.ok) throw new Error(`Season API HTTP ${response.status}`);
        return (await response.json()) as EpisodeSeasonsResponse;
      })
      .then((data) => {
        if (!active) return;
        setSeasonData(data);

        const currentSeason = data.seasons.find((season) => season.isCurrent);
        if (currentSeason) {
          setActiveTab(seasonKey(currentSeason.id));
        }
      })
      .catch((error) => {
        if (!active || controller.signal.aborted) return;
        console.warn('Season selector unavailable:', error);
        setSeasonData({ seasons: [], extras: [], partial: true });
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [trackingAnimeId]);

  const activeSeason = useMemo<EpisodeSeasonTab | null>(() => {
    if (!activeTab.startsWith('season:')) return null;

    const id = Number(activeTab.slice('season:'.length));
    return seasonData.seasons.find((season) => season.id === id) ?? null;
  }, [activeTab, seasonData.seasons]);

  const selectedAnimeId = activeSeason?.id ?? trackingAnimeId;
  const selectedAnimeSlug = activeSeason?.slug ?? String(animeId);
  const selectedIsCurrent = selectedAnimeId === trackingAnimeId;

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    const cached = peekEpisodeAvailability(selectedAnimeId);

    if (cached) {
      queueMicrotask(() => {
        if (!active) return;
        setAvailability(cached);
        setAvailabilityLoading(false);
      });
      return () => {
        active = false;
        controller.abort();
      };
    }

    queueMicrotask(() => {
      if (!active) return;
      setAvailability(null);
      setAvailabilityLoading(true);
    });

    getEpisodeAvailability(selectedAnimeId, { signal: controller.signal })
      .then((data) => {
        if (!active) return;
        setAvailability(data);
      })
      .catch((error) => {
        if (!active || controller.signal.aborted) return;
        console.warn('Episode availability unavailable:', error);
        setAvailability({
          animeId: selectedAnimeId,
          status: 'unknown',
          episodes: [],
          maxEpisode: null,
          providers: [],
        });
      })
      .finally(() => {
        if (active) setAvailabilityLoading(false);
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [selectedAnimeId]);

  const metadataEpisodeNumbers = useMemo(() => {
    if (selectedIsCurrent) {
      return Array.from({ length: currentCount }, (_, index) => index + 1);
    }

    return activeSeason?.episodes ?? [];
  }, [activeSeason?.episodes, currentCount, selectedIsCurrent]);

  const episodeNumbers = useMemo(() => {
    if (!availability) return [];
    if (availability.status === 'available') return availability.episodes;
    if (availability.status === 'unavailable') return [];

    // Unknown is a temporary provider failure. Keep metadata as a fallback so
    // a 429/timeout never makes valid episodes disappear.
    return metadataEpisodeNumbers;
  }, [availability, metadataEpisodeNumbers]);

  const selectedCount = episodeNumbers.length;

  useEffect(() => {
    let active = true;

    const refresh = () =>
      communityRequest<{ episodes: number[] }>(
        `episodes?animeId=${selectedAnimeId}`,
      )
        .then((data) => {
          if (active) setCompletedEpisodes(data.episodes);
        })
        .catch(() => {
          if (active) setCompletedEpisodes([]);
        });

    void refresh();
    window.addEventListener('episode-completed', refresh);

    return () => {
      active = false;
      window.removeEventListener('episode-completed', refresh);
    };
  }, [selectedAnimeId]);

  const groups = useMemo(
    () => getEpisodeGroups(selectedAnimeId, selectedCount),
    [selectedAnimeId, selectedCount],
  );

  const focusEpisode = useMemo(() => {
    if (selectedIsCurrent && currentEpisode && currentEpisode > 0) {
      return Math.min(currentEpisode, selectedCount || currentEpisode);
    }

    if (selectedIsCurrent && watchedUpTo > 0) {
      return Math.min(watchedUpTo + 1, selectedCount || watchedUpTo + 1);
    }

    if (completedEpisodes.length > 0) {
      const highestCompleted = Math.max(...completedEpisodes);
      return Math.min(highestCompleted + 1, selectedCount || highestCompleted + 1);
    }

    return 1;
  }, [
    completedEpisodes,
    currentEpisode,
    selectedCount,
    selectedIsCurrent,
    watchedUpTo,
  ]);

  const automaticGroupIndex = useMemo(
    () => findEpisodeGroupIndex(groups, focusEpisode),
    [focusEpisode, groups],
  );

  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const episodeListRef = useRef<HTMLDivElement | null>(null);
  const groupTabsRef = useRef<HTMLDivElement | null>(null);
  const [canScrollGroupLeft, setCanScrollGroupLeft] = useState(false);
  const [canScrollGroupRight, setCanScrollGroupRight] = useState(false);

  const selectedGroupIndex = useMemo(() => {
    if (selectedGroupId) {
      const manualIndex = groups.findIndex((group) => group.id === selectedGroupId);
      if (manualIndex >= 0) return manualIndex;
    }

    return automaticGroupIndex;
  }, [automaticGroupIndex, groups, selectedGroupId]);

  const activeGroup = groups[selectedGroupIndex] ?? groups[0];
  const visibleEpisodes = activeGroup
    ? episodeNumbers.filter(
        (episode) => episode >= activeGroup.from && episode <= activeGroup.to,
      )
    : [];

  /*
   * The episode grid itself is a scroll container on long-running shows.
   * React reuses the same DOM node when switching between 50-episode groups,
   * so the browser would otherwise keep the old scrollTop and a newly selected
   * group could appear to start at episode 458 instead of 451. Reset only when
   * the logical group/season changes; normal scrolling inside a group is kept.
   */
  useEffect(() => {
    const list = episodeListRef.current;
    if (!list || !activeGroup) return;

    list.scrollTo({
      top: 0,
      behavior: 'auto',
    });
  }, [activeGroup?.id, selectedAnimeId]);

  const updateGroupScrollState = useCallback(() => {
    const track = groupTabsRef.current;
    if (!track) return;

    const maxScrollLeft = Math.max(0, track.scrollWidth - track.clientWidth);
    setCanScrollGroupLeft(track.scrollLeft > 4);
    setCanScrollGroupRight(track.scrollLeft < maxScrollLeft - 4);
  }, []);

  const scrollGroupTabs = useCallback((direction: 'left' | 'right') => {
    const track = groupTabsRef.current;
    if (!track) return;

    const amount = Math.max(320, track.clientWidth * 0.78);
    track.scrollBy({
      left: direction === 'left' ? -amount : amount,
      behavior: 'smooth',
    });
  }, []);

  useEffect(() => {
    const track = groupTabsRef.current;
    if (!track || groups.length <= 1) return;

    const onScroll = () => updateGroupScrollState();
    const resizeObserver = new ResizeObserver(updateGroupScrollState);

    resizeObserver.observe(track);
    track.addEventListener('scroll', onScroll, { passive: true });
    const frame = requestAnimationFrame(updateGroupScrollState);

    return () => {
      cancelAnimationFrame(frame);
      resizeObserver.disconnect();
      track.removeEventListener('scroll', onScroll);
    };
  }, [groups.length, updateGroupScrollState]);

  useEffect(() => {
    const track = groupTabsRef.current;
    if (!track || groups.length <= 1) return;

    const activeElement = track.querySelector<HTMLElement>(
      '[data-episode-group-active="true"]',
    );
    if (!activeElement) return;

    activeElement.scrollIntoView({
      behavior: 'smooth',
      block: 'nearest',
      inline: 'center',
    });

    const frame = requestAnimationFrame(updateGroupScrollState);
    return () => cancelAnimationFrame(frame);
  }, [groups.length, selectedGroupIndex, updateGroupScrollState]);

  const hasSeasonTabs =
    seasonData.seasons.length > 1 || seasonData.extras.length > 0;
  const extrasActive = activeTab === 'extras';

  const seasonTabsRef = useRef<HTMLDivElement | null>(null);
  const [canScrollSeasonLeft, setCanScrollSeasonLeft] = useState(false);
  const [canScrollSeasonRight, setCanScrollSeasonRight] = useState(false);

  const updateSeasonScrollState = useCallback(() => {
    const track = seasonTabsRef.current;
    if (!track) return;

    const maxScrollLeft = Math.max(0, track.scrollWidth - track.clientWidth);
    setCanScrollSeasonLeft(track.scrollLeft > 4);
    setCanScrollSeasonRight(track.scrollLeft < maxScrollLeft - 4);
  }, []);

  const scrollSeasonTabs = useCallback((direction: 'left' | 'right') => {
    const track = seasonTabsRef.current;
    if (!track) return;

    const amount = Math.max(260, track.clientWidth * 0.72);
    track.scrollBy({
      left: direction === 'left' ? -amount : amount,
      behavior: 'smooth',
    });
  }, []);

  useEffect(() => {
    const track = seasonTabsRef.current;
    if (!track) return;

    const onScroll = () => updateSeasonScrollState();
    const resizeObserver = new ResizeObserver(updateSeasonScrollState);

    resizeObserver.observe(track);
    track.addEventListener('scroll', onScroll, { passive: true });

    const frame = requestAnimationFrame(updateSeasonScrollState);

    return () => {
      cancelAnimationFrame(frame);
      resizeObserver.disconnect();
      track.removeEventListener('scroll', onScroll);
    };
  }, [
    seasonData.extras.length,
    seasonData.seasons.length,
    updateSeasonScrollState,
  ]);

  useEffect(() => {
    const track = seasonTabsRef.current;
    if (!track) return;

    const activeElement = track.querySelector<HTMLElement>(
      '[data-season-tab-active="true"]',
    );
    if (!activeElement) return;

    const trackRect = track.getBoundingClientRect();
    const activeRect = activeElement.getBoundingClientRect();
    const safeInset = 20;

    if (activeRect.left < trackRect.left + safeInset) {
      track.scrollBy({
        left: activeRect.left - trackRect.left - safeInset,
        behavior: 'smooth',
      });
    } else if (activeRect.right > trackRect.right - safeInset) {
      track.scrollBy({
        left: activeRect.right - trackRect.right + safeInset,
        behavior: 'smooth',
      });
    }

    const frame = requestAnimationFrame(updateSeasonScrollState);
    return () => cancelAnimationFrame(frame);
  }, [
    activeTab,
    seasonData.extras.length,
    seasonData.seasons.length,
    updateSeasonScrollState,
  ]);

  return (
    <div className={`episode-list-shell ${hasSeasonTabs ? 'has-seasons' : ''}`}>
      {hasSeasonTabs && (
        <div className="episode-list__seasons mb-5">
          <div className="episode-list__seasons-head mb-2 flex items-center justify-between gap-3">
            <span className="text-xs font-semibold uppercase tracking-[0.14em] text-white/45">
              Сезоны и части
            </span>

            {seasonData.partial && (
              <span className="text-[10px] text-amber-200/55">
                часть связей загружается
              </span>
            )}
          </div>

          <div className="relative">
            <div
              ref={seasonTabsRef}
              className="episode-list__season-tabs flex gap-2 overflow-x-auto pb-2 pr-1 scroll-smooth overscroll-x-contain [scrollbar-width:none] [-webkit-overflow-scrolling:touch] [&::-webkit-scrollbar]:hidden"
              role="tablist"
              aria-label="Сезоны аниме"
            >
            {seasonData.seasons.map((season) => {
              const active = activeTab === seasonKey(season.id);

              return (
                <button
                  key={season.id}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  data-season-tab-active={active ? 'true' : undefined}
                  onClick={() => {
                    setActiveTab(seasonKey(season.id));
                    setSelectedGroupId(null);
                  }}
                  className={`group min-w-[118px] shrink-0 rounded-xl border px-3.5 py-2.5 text-left transition-all duration-200 ${
                    active
                      ? 'border-violet-400/55 bg-gradient-to-r from-purple-600 to-indigo-600 text-white shadow-[0_0_22px_rgba(124,58,237,0.30)]'
                      : 'border-slate-800/80 bg-slate-900/50 text-gray-400 hover:border-violet-400/35 hover:bg-slate-900/80 hover:text-white'
                  }`}
                >
                  <span className="block text-xs font-medium">{season.label}</span>
                  <span
                    className={`mt-1 block max-w-[155px] truncate text-[10px] ${
                      active ? 'text-white/70' : 'text-white/35 group-hover:text-white/50'
                    }`}
                    title={season.title}
                  >
                    {season.title}
                  </span>
                  <span
                    className={`mt-1 block text-[9px] ${
                      active ? 'text-white/60' : 'text-white/25'
                    }`}
                  >
                    {(() => {
                      const cached =
                        season.id === selectedAnimeId
                          ? availability
                          : peekEpisodeAvailability(season.id);

                      if (season.id === selectedAnimeId && availabilityLoading) {
                        return 'проверяем серии';
                      }
                      if (cached?.status === 'available') {
                        return `${cached.episodes.length} эп. в плеере`;
                      }
                      if (cached?.status === 'unavailable') {
                        return 'нет серий в плеере';
                      }
                      return 'проверить серии';
                    })()}
                    {season.year ? ` · ${season.year}` : ''}
                  </span>
                </button>
              );
            })}

            {seasonData.extras.length > 0 && (
              <button
                type="button"
                role="tab"
                aria-selected={extrasActive}
                data-season-tab-active={extrasActive ? 'true' : undefined}
                onClick={() => {
                  setActiveTab('extras');
                  setSelectedGroupId(null);
                }}
                className={`min-w-[128px] shrink-0 rounded-xl border px-3.5 py-2.5 text-left transition-all duration-200 ${
                  extrasActive
                    ? 'border-violet-400/55 bg-gradient-to-r from-purple-600 to-indigo-600 text-white shadow-[0_0_22px_rgba(124,58,237,0.30)]'
                    : 'border-slate-800/80 bg-slate-900/50 text-gray-400 hover:border-violet-400/35 hover:bg-slate-900/80 hover:text-white'
                }`}
              >
                <span className="block text-xs font-medium">Фильмы / OVA</span>
                <span className="mt-1 block text-[10px] text-current opacity-60">
                  {seasonData.extras.length} частей
                </span>
              </button>
            )}
            </div>

            {canScrollSeasonLeft && (
              <button
                type="button"
                onClick={() => scrollSeasonTabs('left')}
                aria-label="Показать предыдущие сезоны"
                className="absolute left-1 top-1/2 z-20 hidden h-9 w-9 -translate-y-[60%] place-items-center rounded-full border border-violet-300/35 bg-slate-950/90 text-white shadow-[0_10px_28px_rgba(0,0,0,0.40)] backdrop-blur transition hover:border-violet-300/70 hover:bg-violet-500/25 md:grid"
              >
                <SeasonChevron direction="left" />
              </button>
            )}

            {canScrollSeasonRight && (
              <button
                type="button"
                onClick={() => scrollSeasonTabs('right')}
                aria-label="Показать следующие сезоны"
                className="absolute right-1 top-1/2 z-20 hidden h-9 w-9 -translate-y-[60%] place-items-center rounded-full border border-violet-300/35 bg-slate-950/90 text-white shadow-[0_10px_28px_rgba(0,0,0,0.40)] backdrop-blur transition hover:border-violet-300/70 hover:bg-violet-500/25 md:grid"
              >
                <SeasonChevron direction="right" />
              </button>
            )}
          </div>

          <p className="mt-1 text-[10px] text-white/30 md:hidden">
            Свайпните по сезонам влево или вправо
          </p>
        </div>
      )}

      <div className="episode-list__content">
      {extrasActive ? (
        <ExtrasGrid items={seasonData.extras} />
      ) : availabilityLoading ? (
        <div className="empty-state" aria-busy="true">
          <span>Проверяем серии, которые реально доступны в плеере…</span>
        </div>
      ) : availability?.status === 'unavailable' ? (
        <div className="empty-state">
          <strong>Серий в плеере пока нет</strong>
          <span>AnimeBox не показывает эпизоды, которые сейчас нельзя запустить.</span>
          {activeSeason && !selectedIsCurrent && (
            <Link
              href={`/anime/${activeSeason.slug}`}
              prefetch={false}
              className="mt-3 inline-flex rounded-lg border border-violet-400/30 bg-violet-500/10 px-3 py-2 text-xs font-semibold text-violet-200 transition hover:bg-violet-500/20"
            >
              Открыть сезон
            </Link>
          )}
        </div>
      ) : selectedCount === 0 || groups.length === 0 || !activeGroup ? (
        <div className="empty-state">
          <span>Информация об эпизодах этого сезона пока недоступна.</span>
          {activeSeason && !selectedIsCurrent && (
            <Link
              href={`/anime/${activeSeason.slug}`}
              prefetch={false}
              className="mt-3 inline-flex rounded-lg border border-violet-400/30 bg-violet-500/10 px-3 py-2 text-xs font-semibold text-violet-200 transition hover:bg-violet-500/20"
            >
              Открыть сезон
            </Link>
          )}
        </div>
      ) : (
        <>
          <div className="episode-list__meta">
            {selectedIsCurrent && !totalEpisodesKnown
              ? `Вышло ${selectedCount} эпизодов`
              : `${selectedCount} эпизодов`}

            {activeSeason && (
              <span className="ml-2 text-white/35">
                · {activeSeason.label}
              </span>
            )}

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

              <div className="relative">
                <div
                  ref={groupTabsRef}
                  className="flex gap-2 overflow-x-auto px-1 pb-2 scroll-smooth overscroll-x-contain [scrollbar-width:none] [-webkit-overflow-scrolling:touch] [&::-webkit-scrollbar]:hidden"
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
                        data-episode-group-active={active ? 'true' : undefined}
                        onClick={() => setSelectedGroupId(group.id)}
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

                {canScrollGroupLeft && (
                  <button
                    type="button"
                    onClick={() => scrollGroupTabs('left')}
                    aria-label="Показать предыдущие группы эпизодов"
                    className="absolute left-1 top-1/2 z-20 hidden h-9 w-9 -translate-y-[60%] place-items-center rounded-full border border-violet-300/35 bg-slate-950/95 text-white shadow-[0_10px_28px_rgba(0,0,0,0.45)] backdrop-blur transition hover:border-violet-300/70 hover:bg-violet-500/25 md:grid"
                  >
                    <SeasonChevron direction="left" />
                  </button>
                )}

                {canScrollGroupRight && (
                  <button
                    type="button"
                    onClick={() => scrollGroupTabs('right')}
                    aria-label="Показать следующие группы эпизодов"
                    className="absolute right-1 top-1/2 z-20 hidden h-9 w-9 -translate-y-[60%] place-items-center rounded-full border border-violet-300/35 bg-slate-950/95 text-white shadow-[0_10px_28px_rgba(0,0,0,0.45)] backdrop-blur transition hover:border-violet-300/70 hover:bg-violet-500/25 md:grid"
                  >
                    <SeasonChevron direction="right" />
                  </button>
                )}
              </div>
            </div>
          )}

          <div ref={episodeListRef} className="episode-list">
            {visibleEpisodes.map((number) => {
              const isCurrent =
                selectedIsCurrent && number === currentEpisode;
              const isWatched =
                !isCurrent && completedEpisodes.includes(number);

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
                  href={`/anime/${selectedAnimeSlug}/episode/${number}`}
                  prefetch={false}
                  className={className}
                >
                  <span className="episode-list__number">{number}</span>
                  <span className="episode-list__label">Серия {number}</span>
                  {isWatched && (
                    <span className="episode-list__check">✓</span>
                  )}
                </Link>
              );
            })}
          </div>
        </>
      )}
      </div>
    </div>
  );
}


function SeasonChevron({ direction }: { direction: 'left' | 'right' }) {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <path
        d={direction === 'left' ? 'M15 18L9 12L15 6' : 'M9 6L15 12L9 18'}
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ExtrasGrid({ items }: { items: EpisodeExtraItem[] }) {
  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
      {items.map((item) => (
        <Link
          key={item.id}
          href={`/anime/${item.slug}`}
          prefetch={false}
          className="group rounded-xl border border-white/10 bg-white/[0.03] p-3 transition-all hover:-translate-y-0.5 hover:border-violet-400/35 hover:bg-violet-500/[0.07]"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <span className="block text-[10px] font-semibold uppercase tracking-[0.12em] text-violet-300/75">
                {extraFormatLabel(item.format)}
              </span>
              <strong className="mt-1 block truncate text-sm text-white/85 group-hover:text-white">
                {item.title}
              </strong>
            </div>

            {item.year && (
              <span className="shrink-0 text-[10px] text-white/30">
                {item.year}
              </span>
            )}
          </div>
        </Link>
      ))}
    </div>
  );
}
