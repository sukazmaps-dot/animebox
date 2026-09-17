'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';

import AnimeImage from '@/components/AnimeImage';
import { animeHref } from '@/lib/anime-url';
import { getAnimeTitle } from '@/lib/anime-display';
import { communityRequest } from '@/lib/community-client';
import {
  createImpressionId,
  hideRecommendation,
  trackRecommendationEvent,
  type TasteMood,
} from '@/lib/personalization';
import type { RankedRecommendation } from '@/lib/recommendations';

function formatLabel(format: string | null | undefined): string {
  const labels: Record<string, string> = {
    TV: 'TV',
    'ТВ': 'TV',
    TV_SHORT: 'TV Short',
    'ТВ (Короткое)': 'TV Short',
    MOVIE: 'Фильм',
    'Фильм': 'Фильм',
    OVA: 'OVA',
    ONA: 'ONA',
    SPECIAL: 'Спецвыпуск',
    'Спешл': 'Спецвыпуск',
    MUSIC: 'Музыка',
    'Клип': 'Музыка',
  };

  return format ? labels[format] ?? format : 'Аниме';
}

function formatDuration(duration: number | null | undefined): string {
  if (!duration || duration <= 0) return 'Длительность уточняется';
  if (duration < 60) return `${duration} мин`;

  const hours = Math.floor(duration / 60);
  const minutes = duration % 60;
  return minutes > 0 ? `${hours} ч ${minutes} мин` : `${hours} ч`;
}

export default function SmartRecommendationCard({
  recommendation,
  position,
  mood,
  recommendationSessionId,
  onHidden,
}: {
  recommendation: RankedRecommendation;
  position: number;
  mood: TasteMood;
  recommendationSessionId?: string;
  onHidden: (animeId: number) => void;
}) {
  const { anime, reason } = recommendation;
  const title = getAnimeTitle(anime);
  const rootRef = useRef<HTMLElement | null>(null);
  const impressionIdRef = useRef<string>(createImpressionId(anime.id, position));
  const impressionSentRef = useRef(false);
  const hoverStartedAtRef = useRef<number | null>(null);
  const [planState, setPlanState] = useState<'idle' | 'saving' | 'saved' | 'auth' | 'error'>('idle');

  useEffect(() => {
    const element = rootRef.current;
    if (!element || impressionSentRef.current) return;

    let timer: number | null = null;

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];

        if (entry?.isIntersecting && entry.intersectionRatio >= 0.5) {
          if (timer !== null || impressionSentRef.current) return;

          timer = window.setTimeout(() => {
            impressionSentRef.current = true;
            trackRecommendationEvent({
              type: 'impression',
              animeId: anime.id,
              impressionId: impressionIdRef.current,
              position,
              source: 'smart_feed',
              mood,
              recommendationSessionId,
            });
            observer.disconnect();
          }, 1000);
        } else if (timer !== null) {
          window.clearTimeout(timer);
          timer = null;
        }
      },
      { threshold: [0, 0.5, 1] },
    );

    observer.observe(element);

    return () => {
      if (timer !== null) window.clearTimeout(timer);
      observer.disconnect();
    };
  }, [anime.id, mood, position, recommendationSessionId]);

  function trackOpen() {
    trackRecommendationEvent({
      type: 'open',
      animeId: anime.id,
      impressionId: impressionIdRef.current,
      position,
      source: 'smart_feed',
      mood,
      recommendationSessionId,
    });
  }

  function handlePointerEnter() {
    hoverStartedAtRef.current = performance.now();
  }

  function handlePointerLeave() {
    const startedAt = hoverStartedAtRef.current;
    hoverStartedAtRef.current = null;
    if (startedAt == null) return;

    const dwellMs = Math.round(performance.now() - startedAt);
    if (dwellMs < 700) return;

    trackRecommendationEvent({
      type: 'dwell',
      animeId: anime.id,
      impressionId: impressionIdRef.current,
      position,
      source: 'smart_feed',
      mood,
      recommendationSessionId,
      dwellMs: Math.min(dwellMs, 30_000),
    });
  }

  async function addToPlans() {
    if (planState === 'saving' || planState === 'saved') return;

    setPlanState('saving');

    try {
      await communityRequest('library', {
        animeId: anime.id,
        status: 'planned',
      });

      setPlanState('saved');
      window.dispatchEvent(new Event('library-updated'));
      trackRecommendationEvent({
        type: 'planned',
        animeId: anime.id,
        impressionId: impressionIdRef.current,
        position,
        source: 'smart_feed',
        mood,
        recommendationSessionId,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message.toLowerCase() : '';
      setPlanState(message.includes('войди') ? 'auth' : 'error');
    }
  }

  function dismiss() {
    hideRecommendation(anime);
    trackRecommendationEvent({
      type: 'not_interested',
      animeId: anime.id,
      impressionId: impressionIdRef.current,
      position,
      source: 'smart_feed',
      mood,
      recommendationSessionId,
    });
    onHidden(anime.id);
  }

  const planLabel =
    planState === 'saving'
      ? 'Сохраняем…'
      : planState === 'saved'
        ? 'В планах'
        : planState === 'auth'
          ? 'Войти'
          : planState === 'error'
            ? 'Повторить'
            : 'В планы';

  const planIcon =
    planState === 'saved'
      ? '✓'
      : planState === 'auth'
        ? '↗'
        : planState === 'error'
          ? '↻'
          : '+';

  const planClassName = [
    'smart-card__plan',
    planState === 'saved' ? 'is-saved' : '',
    planState === 'saving' ? 'is-saving' : '',
    planState === 'auth' ? 'is-auth' : '',
    planState === 'error' ? 'is-error' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <article
      ref={rootRef}
      className="smart-card"
      onPointerEnter={handlePointerEnter}
      onPointerLeave={handlePointerLeave}
    >
      <Link
        href={animeHref(anime)}
        className="smart-card__poster-link"
        onClick={trackOpen}
        aria-label={`Открыть ${title}`}
      >
        <div className="smart-card__poster">
          <AnimeImage
            image={anime.coverImage}
            alt={title}
            englishName={anime.title?.english || anime.title?.romaji}
            className="smart-card__image"
            loading="lazy"
          />

          <div className="smart-card__rating">
            <span aria-hidden="true">★</span>
            {anime.score ?? anime.averageScore ?? '—'}
          </div>

          <div className="smart-card__open">
            <span>Открыть</span>
            <span aria-hidden="true">↗</span>
          </div>
        </div>
      </Link>

      <div className="smart-card__body">
        <Link href={animeHref(anime)} onClick={trackOpen} className="smart-card__title" title={title}>
          {title}
        </Link>

        <div className="smart-card__meta" aria-label="Информация об аниме">
          <span>{formatLabel(anime.format)}</span>
          <span aria-hidden="true">•</span>
          <span>{formatDuration(anime.duration)}</span>
        </div>

        <p className="smart-card__reason">
          <span aria-hidden="true">✦</span>
          {reason}
        </p>

        <div className="smart-card__actions">
          <button
            type="button"
            className={planClassName}
            onClick={() => void addToPlans()}
            disabled={planState === 'saving' || planState === 'saved'}
          >
            <span
              className={planState === 'saving' ? 'smart-card__plan-icon is-spinner' : 'smart-card__plan-icon'}
              aria-hidden="true"
            >
              {planState === 'saving' ? '' : planIcon}
            </span>
            <span className="smart-card__plan-label">{planLabel}</span>
          </button>

          <button
            type="button"
            className="smart-card__dismiss"
            onClick={dismiss}
            aria-label={`Не рекомендовать ${title}`}
            title="Не интересно"
          >
            ×
          </button>
        </div>
      </div>
    </article>
  );
}
