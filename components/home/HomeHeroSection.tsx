'use client';

import HomeHeroCarousel from '@/components/HomeHeroCarousel';
import { useHomeFeedRuntime } from '@/components/home/HomeFeedRuntimeProvider';

export default function HomeHeroSection() {
  const {
    heroLoading,
    popular,
    ongoing,
  } = useHomeFeedRuntime();

  if (heroLoading) {
    return (
      <section className="page-hero page-hero--empty">
        <div className="page-hero__content">
          <span className="pill pill--accent">ANIMEBOX</span>
          <h1>Загружаем AnimeBox…</h1>
          <p>Секунду — собираем главную.</p>
        </div>
      </section>
    );
  }

  return (
    <HomeHeroCarousel
      popular={popular}
      ongoing={ongoing}
    />
  );
}
