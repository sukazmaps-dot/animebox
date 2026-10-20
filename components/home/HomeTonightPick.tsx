'use client';

import { useMemo, useState } from 'react';
import HomeTonightArtwork from './HomeTonightArtwork';
import HomeHeroBookmark from './HomeHeroBookmark';
import AnimeIntentLink from '@/components/AnimeIntentLink';
import type { TasteMood } from '@/lib/personalization';
import { getAnimeTitle } from '@/lib/anime-display';
import { animeHref, animeWatchHref } from '@/lib/anime-url';
import { formatAnimeScore } from '@/lib/anime-score';
import { cleanSeoText, truncateSeoText } from '@/lib/seo-text';
import { homeTonightCandidates, homeTonightReason, type HomeTonightCandidate } from '@/lib/home-tonight-pick';
import { trackProductClientEvent } from '@/lib/product-events-client';
import { useVisibleHomeImpression } from './useVisibleHomeImpression';
import HomeTonightLoading from './HomeTonightLoading';
import styles from './HomeTonightPick.module.css';

/** The parent keys this by the selected mood: each mood starts a new choice. */
export default function HomeTonightPick({ items, mood, busy, hasWatchHistory, preview = false }: {
  items: HomeTonightCandidate[];
  mood: TasteMood;
  busy: boolean;
  hasWatchHistory: boolean;
  preview?: boolean;
}) {
  const candidates = useMemo(() => homeTonightCandidates(items, mood), [items, mood]);
  const [choice, setChoice] = useState<{ selectedId: number | null; skipped: number[] }>({ selectedId: null, skipped: [] });
  const current = candidates.find(item => item.anime.id === choice.selectedId)
    ?? candidates.find(item => !choice.skipped.includes(item.anime.id));
  // Pin an arriving candidate before commit, avoiding a frame of random picks
  // when the existing ranking is refreshed in the background.
  if (current && current.anime.id !== choice.selectedId) {
    setChoice({ ...choice, selectedId: current.anime.id });
  }
  const impressionRef = useVisibleHomeImpression(!preview && !busy && current ? `${mood}:${current.anime.id}` : '', () => {
    if (!current) return;
    trackProductClientEvent('home_section_view', {
      source: 'home_tonight_pick', path: '/', entityType: 'anime', entityId: String(current.anime.id),
      metadata: { section: 'tonight_pick', mood },
    });
  });

  if (busy) return <HomeTonightLoading mood={mood} />;
  if (!current) return (
    <div className={styles.empty} role="status" data-home-tonight="empty" data-tonight-mood={mood}>
      <p>{candidates.length > 0
        ? 'Все доступные варианты уже показаны. Можно начать заново.'
        : 'Пока нет уверенного варианта. Попробуй другое настроение или загляни в каталог.'}</p>
      {candidates.length > 0
        ? <button type="button" className={styles.secondary} onClick={() => setChoice({ selectedId: candidates[0].anime.id, skipped: [] })}>Начать заново</button>
        : <AnimeIntentLink href="/search" className={styles.secondary}>Открыть каталог</AnimeIntentLink>}
    </div>
  );

  const { anime } = current;
  const title = getAnimeTitle(anime);
  const score = formatAnimeScore(anime);
  const year = anime.startDate?.year;
  const summary = truncateSeoText(cleanSeoText(anime.description), 220);
  const next = candidates.find(item => item.anime.id !== anime.id && !choice.skipped.includes(item.anime.id));
  const trackClick = (action: 'watch' | 'details') => {
    if (preview) return;
    trackProductClientEvent('recommendation_click', {
    source: 'home_tonight_pick', path: '/', entityType: 'anime', entityId: String(anime.id),
    metadata: { mood, action },
    });
  };

  return (
    <article ref={impressionRef} className={styles.card} data-home-hero="single" data-home-tonight={preview ? 'preview' : 'ready'} data-tonight-anime-id={anime.id} data-tonight-mood={mood}>
      <HomeTonightArtwork key={anime.id} anime={anime} preview={preview} />
      <div className={styles.body} aria-live="polite" aria-atomic="true">
        <span className={styles.eyebrow}>{preview ? 'Популярное на AnimeBox' : 'Вариант на сегодня'}</span>
        <h2 className={styles.title}>{title}</h2>
        <div className={styles.facts}>
          {score && <span>★ {score}</span>}
          {Number.isInteger(year) && Number(year) > 0 && <span>{year}</span>}
          {anime.format && <span>{anime.format === 'TV' ? 'Сериал' : anime.format === 'MOVIE' ? 'Фильм' : anime.format}</span>}
        </div>
        <p className={styles.reason}>{preview ? 'Показываем доступный тайтл, пока готовится личная подборка.' : homeTonightReason(current, mood, hasWatchHistory)}</p>
        {summary && <p className={styles.summary}>{summary}</p>}
      </div>
      <div className={styles.actions}>
        <AnimeIntentLink className={styles.watch} href={animeWatchHref(anime)} onClick={() => trackClick('watch')}>Смотреть</AnimeIntentLink>
        <AnimeIntentLink className={styles.secondary} href={animeHref(anime)} onClick={() => trackClick('details')}>Подробнее</AnimeIntentLink>
        <HomeHeroBookmark animeId={anime.id} />
        <button className={styles.another} type="button" disabled={candidates.length < 2}
          onClick={() => setChoice(next
            ? { selectedId: next.anime.id, skipped: [...choice.skipped, anime.id] }
            : { selectedId: candidates[0].anime.id, skipped: [] })}>
          {next || candidates.length < 2 ? 'Другой вариант' : 'Начать заново'}
        </button>
      </div>
    </article>
  );
}
