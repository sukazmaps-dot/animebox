'use client';

import { useSyncExternalStore, type CSSProperties } from 'react';
import type { Anime } from '@/types/anime';
import AnimeImage from '@/components/AnimeImage';
import { mobileHeroObjectPosition } from '@/lib/home-hero-art';
import styles from './HomeTonightPick.module.css';

const query = '(max-width: 768px)';
function subscribe(callback: () => void) {
  const media = window.matchMedia(query);
  media.addEventListener('change', callback);
  return () => media.removeEventListener('change', callback);
}
const snapshot = () => window.matchMedia(query).matches;
const serverSnapshot = () => false;

/** One live image pipeline: portrait on phones, banner on desktop when known. */
export default function HomeTonightArtwork({ anime }: { anime: Anime }) {
  const mobile = useSyncExternalStore(subscribe, snapshot, serverSnapshot);
  const banner = !mobile && anime.bannerImage;
  const portrait = mobile && anime.mobileHeroImage ? { extraLarge: anime.mobileHeroImage } : anime.coverImage ?? anime.image;
  return <div className={styles.artwork} data-hero-art={banner ? 'banner' : 'poster'} aria-hidden="true" style={{ '--hero-focus': mobileHeroObjectPosition(anime) } as CSSProperties}>
    <AnimeImage image={banner ? { extraLarge: banner } : portrait}
      alt="" loading="eager" fetchPriority="high" preset="hero" quality={70}
      sizes="(max-width: 768px) 100vw, (max-width: 1600px) 70vw, 1000px"
      containerClassName={styles.artworkHost} className={styles.artworkImage} />
    <span className={styles.shade} />
  </div>;
}
