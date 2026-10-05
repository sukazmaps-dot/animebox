'use client';
import {scheduleAnimeHref} from '@/lib/schedule-url';

import dynamic from 'next/dynamic';
import Link from 'next/link';

import DeferredMount from '@/components/DeferredMount';
import { useVisibleHomeImpression } from '@/components/home/useVisibleHomeImpression';
import ScheduleItem from '@/components/ScheduleItem';
import { ScheduleCardSkeleton } from '@/components/home/HomeLoadingSkeletons';
import { useHomeFeedRuntime } from '@/components/home/HomeFeedRuntimeProvider';
import {
  formatUpcomingDate,
  getScheduleTitle,
  useHomeScheduleRuntime,
} from '@/components/home/HomeScheduleRuntimeProvider';
import { trackProductClientEvent } from '@/lib/product-events-client';

const HomeRetentionHub = dynamic(
  () => import('@/components/HomeRetentionHub'),
  { ssr: false },
);

const HomePersonalPulse = dynamic(
  () => import('@/components/HomePersonalPulse'),
  { ssr: false },
);

const HomeActivationPanel = dynamic(
  () => import('@/components/HomeActivationPanel'),
  { ssr: false },
);

export function HomePersonalScheduleSection() {
  const {
    personalizedHome,
    personalAnimeIdList,
  } = useHomeFeedRuntime();
  const {
    personalScheduleItems,
    upcomingScheduleLoading,
    clockNow,
  } = useHomeScheduleRuntime();

  const signature = personalScheduleItems
    .map((item) => `${item.media.id}:${item.episode}:${item.airingAt}`).join('|');
  const impressionRef = useVisibleHomeImpression(signature, () => {
    trackProductClientEvent('personal_schedule_impression', {
      source: 'personal_home', path: '/', entityType: 'surface',
      entityId: 'personal_schedule', metadata: {
        count: personalScheduleItems.length,
        items: personalScheduleItems.map((item) => ({
          anime_id: item.media.id, episode: item.episode, airing_at: item.airingAt,
        })),
      },
    });
  });

  const showLoading =
    upcomingScheduleLoading &&
    personalizedHome &&
    personalAnimeIdList.length > 0;

  if (!showLoading && personalScheduleItems.length === 0) {
    return null;
  }

  return (
    <section
      ref={impressionRef}
      className="section personal-schedule-section"
      aria-busy={showLoading}
    >
      <div className="section-head">
        <div>
          <span className="smart-section-eyebrow">
            Твои онгоинги
          </span>
          <h2 className="section-title">
            Расписание твоих аниме
          </h2>
          <p>
            Время эфира в Японии. Перевод и озвучка
            могут появиться позже.
          </p>
        </div>

        <Link
          className="section-link"
          href="/notifications"
        >
          Настроить уведомления →
        </Link>
      </div>

      <div className="personal-schedule-grid">
        {showLoading ? (
          Array.from({ length: 3 }).map((_, index) => (
            <div
              className="personal-schedule-card"
              key={`personal-schedule-loading-${index}`}
            >
              <ScheduleCardSkeleton />
            </div>
          ))
        ) : personalScheduleItems.map((item) => {
          const title = getScheduleTitle(item);
          const released = !item.timingKind && item.episode != null && item.airingAt * 1000 <= clockNow;
          const watchHref =
            `${scheduleAnimeHref(item.media)}/watch?ep=${Math.max(
              1,
              item.episode ?? 1,
            )}`;

          return (
            <div
              className="personal-schedule-card"
              key={item.id}
            >
              <ScheduleItem
                href={released ? watchHref : scheduleAnimeHref(item.media)}
                title={title}
                image={item.media.coverImage}
                episode={item.episode}
                planned={Boolean(item.timingKind)}
                dateLabel={formatUpcomingDate(
                  item.airingAt,
                )}
                airingAt={item.airingAt}
                releasedLabel="Эфир прошёл"
                compact
                onOpen={() => {
                  trackProductClientEvent(
                    'personal_schedule_click',
                    {
                      source: 'personal_home',
                      path: '/',
                      entityType: 'episode',
                      entityId:
                        `${item.media.id}:${item.episode}`,
                      metadata: {
                        anime_id: item.media.id,
                        episode: item.episode,
                        airing_at: item.airingAt,
                        released,
                      },
                      flush: true,
                    },
                  );
                }}
              />
            </div>
          );
        })}
      </div>
    </section>
  );
}

export function HomeRetentionSections() {
  const {
    userId,
    hasPersonalHistory,
    hasWatchHistory,
    continueWatchingItems,
    personalAnimeIdList,
  } = useHomeFeedRuntime();

  const {
    retentionEpisodeSignal,
    retentionCompletionSignal,
  } = useHomeScheduleRuntime();

  return (
    <>
      {hasPersonalHistory && (
        <DeferredMount
          className="home-deferred home-deferred--retention"
          minHeight={180}
          rootMargin="520px 0px"
          ariaLabel="Персональное продолжение AnimeBox"
        >
          <HomeRetentionHub
            episode={retentionEpisodeSignal}
            completion={retentionCompletionSignal}
            personalAnimeIds={personalAnimeIdList}
            enableRooms={Boolean(userId)}
          />
        </DeferredMount>
      )}

      <DeferredMount
        className="home-deferred home-deferred--pulse"
        minHeight={96}
        rootMargin="460px 0px"
        ariaLabel="Твой прогресс AnimeBox"
      >
        <HomePersonalPulse />
      </DeferredMount>

      <DeferredMount
        className="home-deferred home-deferred--activation"
        minHeight={150}
        rootMargin="420px 0px"
        ariaLabel="Настройка персонального AnimeBox"
      >
        <HomeActivationPanel
          hasHistory={hasWatchHistory}
          hasContinue={continueWatchingItems.length > 0}
        />
      </DeferredMount>
    </>
  );
}
