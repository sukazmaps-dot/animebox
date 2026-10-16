import Link from 'next/link';

import Icon from '@/components/Icon';
import type { Anime } from '@/types/anime';
import HomeFeedRuntimeProvider from '@/components/home/HomeFeedRuntimeProvider';
import HomeScheduleRuntimeProvider from '@/components/home/HomeScheduleRuntimeProvider';
import HomeHeroSection from '@/components/home/HomeHeroSection';
import HomeContinueSection from '@/components/home/HomeContinueSection';
import HomeWatchTogetherSection from '@/components/home/HomeWatchTogetherSection';
import HomeDiscoverySection from '@/components/home/HomeDiscoverySection';
import HomeCatalogSections from '@/components/home/HomeCatalogSections';
import HomeScheduleSection from '@/components/home/HomeScheduleSection';
import {
  HomeRetentionSections,
} from '@/components/home/HomePersonalRetentionSections';
import {
  HomeDeferredChat,
  HomeDeferredSupport,
} from '@/components/home/HomeDeferredCommunity';
import HomeRightRail from '@/components/home/HomeRightRail';

function HomeShortcuts() {
  return (
    <nav
      className="home-shortcuts"
      aria-label="Быстрые переходы AnimeBox"
    >
      <Link
        href="/search"
        className="home-shortcuts__item"
      >
        <span>
          <strong>Каталог</strong>
          <small>По жанрам и тегам</small>
        </span>
        <b aria-hidden="true">↗</b>
      </Link>

      <Link
        href="/schedule"
        className="home-shortcuts__item"
      >
        <span>
          <strong>Релизы сегодня</strong>
          <small>Свежие эпизоды</small>
        </span>
        <b aria-hidden="true">→</b>
      </Link>

      <Link
        href="/list"
        className="home-shortcuts__item"
      >
        <span>
          <strong>Мой список</strong>
          <small>Продолжить просмотр</small>
        </span>
        <b aria-hidden="true">→</b>
      </Link>

      <Link
        href="/watch-together"
        className="home-shortcuts__item"
      >
        <span>
          <strong>Комнаты</strong>
          <small>Смотреть с друзьями</small>
        </span>
        <b aria-hidden="true">→</b>
      </Link>
    </nav>
  );
}

function HomeTrackerCard() {
  return (
    <section className="panel home-library-panel home-library-panel--footer home-service-card">
      <div className="home-service-card__head">
        <span
          className="home-service-card__icon"
          aria-hidden="true"
        >
          <Icon
            name="tracker"
            size={19}
            weight="regular"
          />
        </span>

        <span className="home-service-card__eyebrow">
          Твоя коллекция
        </span>
      </div>

      <div className="home-service-card__copy">
        <h2>Всё просмотренное — в одном месте.</h2>
        <p>
          Отмечай серии, следи за онгоингами и возвращайся
          к просмотру без лишнего поиска.
        </p>
      </div>

      <Link
        className="btn home-service-card__action"
        href="/list"
      >
        Открыть трекер <span aria-hidden="true">↗</span>
      </Link>
    </section>
  );
}

export default function HomePageShell({
  initialPopular,
  initialOngoing,
}: {
  initialPopular: Anime[];
  initialOngoing: Anime[];
}) {
  return (
    <HomeFeedRuntimeProvider
      initialPopular={initialPopular}
      initialOngoing={initialOngoing}
    >
      <HomeScheduleRuntimeProvider>
        <div className="home-page home-visual-v31">
          <div className="home-grid home-grid--main">
            <div className="main-column">
              {/* Streaming-first order: the next watch is more important than utilities. */}
              <HomeHeroSection />
              <HomeContinueSection />
              <HomeDiscoverySection />
              <HomeCatalogSections />
              <HomeWatchTogetherSection />

              <HomeShortcuts />
              <HomeDeferredChat />
              <HomeScheduleSection />
              <HomeRetentionSections />

              <div className="home-utility-grid">
                <HomeTrackerCard />
                <HomeDeferredSupport />
              </div>
            </div>

            <HomeRightRail />
          </div>
        </div>
      </HomeScheduleRuntimeProvider>
    </HomeFeedRuntimeProvider>
  );
}
