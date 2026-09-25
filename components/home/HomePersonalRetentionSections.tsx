'use client';

import dynamic from 'next/dynamic';
import Link from 'next/link';

import DeferredMount from '@/components/DeferredMount';
import ScheduleItem from '@/components/ScheduleItem';
import { useHomeFeedRuntime } from '@/components/home/HomeFeedRuntimeProvider';
import {
  formatUpcomingDate,
  getScheduleTitle,
  useHomeScheduleRuntime,
} from '@/components/home/HomeScheduleRuntimeProvider';
import { animeHref } from '@/lib/anime-url';
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

export default function HomePersonalRetentionSections() {
  const {
    userId,
    hasPersonalHistory,
    hasWatchHistory,
    continueWatchingItems,
    personalAnimeIdList,
  } = useHomeFeedRuntime();

  const {
    personalScheduleItems,
    retentionEpisodeSignal,
    retentionCompletionSignal,
  } = useHomeScheduleRuntime();

  return (
    <>
      {personalScheduleItems.length > 0 && (
        <section className="section personal-schedule-section">
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
            {personalScheduleItems.map((item) => {
              const title = getScheduleTitle(item);
              const watchHref =
                `${animeHref(item.media)}/watch?ep=${Math.max(
                  1,
                  item.episode,
                )}`;

              return (
                <div
                  className="personal-schedule-card"
                  key={item.id}
                >
                  <ScheduleItem
                    href={watchHref}
                    title={title}
                    image={item.media.coverImage}
                    episode={item.episode}
                    dateLabel={formatUpcomingDate(
                      item.airingAt,
                    )}
                    airingAt={item.airingAt}
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
      )}

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
