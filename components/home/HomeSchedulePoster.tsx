'use client';

import { useState, type ComponentProps } from 'react';
import AnimeImage from '@/components/AnimeImage';
import styles from './HomeSchedulePoster.module.css';

type ImageSource = ComponentProps<typeof AnimeImage>['image'];

export default function HomeSchedulePoster({
  image, title, englishName,
}: {
  image?: ImageSource;
  title: string;
  englishName?: string | null;
}) {
  const [failed, setFailed] = useState(false);
  return (
    <span className={styles.poster} data-image-fallback={failed ? 'true' : 'false'}>
      {!failed && (
        <AnimeImage
          image={image}
          alt=""
          englishName={englishName ?? undefined}
          className={styles.image}
          sizes="44px"
          quality={60}
          sourcePreference="compact"
          preset="tiny"
          onStateChange={(state) => setFailed(state === 'fallback')}
        />
      )}
      {failed && <span className={styles.monogram} aria-hidden="true">{title.trim().charAt(0).toLocaleUpperCase('ru-RU') || 'А'}</span>}
    </span>
  );
}
