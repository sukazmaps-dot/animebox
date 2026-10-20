'use client';

import { useState, useSyncExternalStore, type CSSProperties } from 'react';
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
  const [failedArtwork, setFailedArtwork] = useState<string[]>([]);
  const artwork = mobile ? anime.mobileHeroImage : anime.bannerImage;
  const useArtwork = Boolean(artwork && !failedArtwork.includes(artwork));
  const kind = useArtwork ? (mobile ? 'portrait' : 'banner') : 'poster';
  return <div className={styles.artwork} data-hero-art={kind} aria-hidden="true" style={{ '--hero-focus': mobileHeroObjectPosition(anime) } as CSSProperties}>
    <AnimeImage image={useArtwork ? { extraLarge: artwork } : anime.coverImage ?? anime.image}
      alt="" loading="eager" fetchPriority="high" preset={useArtwork ? 'hero' : 'large'} quality={80}
      sizes={useArtwork ? '(max-width: 768px) 100vw, (max-width: 1600px) 70vw, 1000px' : '(max-width: 768px) 96px, 230px'}
      onStateChange={state => {
        if (state === 'fallback' && useArtwork && artwork) {
          setFailedArtwork(previous => previous.includes(artwork) ? previous : [...previous, artwork]);
        }
      }}
      containerClassName={styles.artworkHost} className={styles.artworkImage} />
    <span className={styles.shade} />
  </div>;
}
