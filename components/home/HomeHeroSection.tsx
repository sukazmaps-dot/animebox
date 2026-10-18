'use client';

import HomeHeroCarousel from '@/components/HomeHeroCarousel';
import { useHomeFeedRuntime } from '@/components/home/HomeFeedRuntimeProvider';
import styles from './HomeCinematicHero.module.css';

export default function HomeHeroSection() {
  const {
    heroLoading,
    popular,
    ongoing,
  } = useHomeFeedRuntime();

  if (heroLoading) {
    return (
      <section className={styles.scene} aria-busy="true">
        <div className={styles.content}>
          <span className={styles.eyebrow}>ANIMEBOX</span>
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
      cinematic
    />
  );
}
