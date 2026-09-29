'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';

import AnimeImage, { type AnimeImageLoadState } from '@/components/AnimeImage';
import Icon from '@/components/Icon';
import { animeHref } from '@/lib/anime-url';
import { getAnimeTitle } from '@/lib/anime-display';
import { formatAnimeScore } from '@/lib/anime-score';
import { communityRequest } from '@/lib/community-client';
import {
  clearRecommendationFeedback,
  persistRecommendationFeedback,
} from '@/lib/recommendation-feedback-client';
import {
  recommendationFeedbackMenuItems,
  recommendationFeedbackPolicy,
  type RecommendationFeedbackSignal,
} from '@/lib/recommendation-feedback-policy';
import {
  applyRecommendationFeedbackLocally,
  createImpressionId,
  createRecommendationId,
  readTasteProfile,
  RECOMMENDATION_MODEL_VERSION,
  trackRecommendationEvent,
  writeTasteProfile,
  type RecommendationEventType,
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

function formatDuration(duration: number | null | undefined): string | null {
  if (!duration || duration <= 0) return null;
  if (duration < 60) return `${duration} мин`;

  const hours = Math.floor(duration / 60);
  const minutes = duration % 60;
  return minutes > 0 ? `${hours} ч ${minutes} мин` : `${hours} ч`;
}

type RecommendationCardRuntimeIdentity = {
  recommendationId: string;
  impressionId: string;
  impressionSent: boolean;
};

export type RecommendationFeedbackUndoPayload = {
  anime: RankedRecommendation['anime'];
  signal: RecommendationFeedbackSignal;
  label: string;
  undo: () => void;
};

const STRUCTURED_FEEDBACK_MENU = recommendationFeedbackMenuItems();

function feedbackEventType(
  signal: RecommendationFeedbackSignal,
): RecommendationEventType {
  if (signal === 'like_more') return 'liked';
  if (signal === 'already_watched') return 'already_watched';
  if (signal === 'hidden') return 'not_interested';
  return signal;
}

const MAX_CARD_RUNTIME_IDENTITIES = 1200;
const recommendationCardIdentityCache =
  new Map<string, RecommendationCardRuntimeIdentity>();

function getRecommendationCardRuntimeIdentity(input: {
  animeId: number;
  source: string;
  rowId?: string;
  sessionId?: string;
  position: number;
}) {
  const key = [
    input.sessionId || 'sessionless',
    input.rowId || input.source,
    input.animeId,
  ].join(':');

  const existing = recommendationCardIdentityCache.get(key);
  if (existing) return existing;

  const identity: RecommendationCardRuntimeIdentity = {
    recommendationId: createRecommendationId(input.animeId, input.source),
    impressionId: createImpressionId(input.animeId, input.position),
    impressionSent: false,
  };

  recommendationCardIdentityCache.set(key, identity);

  if (recommendationCardIdentityCache.size > MAX_CARD_RUNTIME_IDENTITIES) {
    const oldest = recommendationCardIdentityCache.keys().next().value as
      | string
      | undefined;
    if (oldest) recommendationCardIdentityCache.delete(oldest);
  }

  return identity;
}

export default function SmartRecommendationCard({
  recommendation,
  position,
  mood,
  recommendationSessionId,
  rowId,
  source = 'smart_feed',
  onHidden,
  onFeedbackApplied,
}: {
  recommendation: RankedRecommendation;
  position: number;
  mood: TasteMood;
  recommendationSessionId?: string;
  rowId?: string;
  source?: string;
  onHidden: (animeId: number) => void;
  onFeedbackApplied?: (payload: RecommendationFeedbackUndoPayload) => void;
}) {
  const {
    anime,
    reason,
    reasons,
    matchScore,
    fatigueScore,
    exposureCount7d,
    exposureCount30d,
    sessionIntentScore,
    sessionIntentConfidence,
    completionScore,
    franchiseContinuation,
    franchiseSeasonNumber,
    explorationClass,
    noveltyScore,
    hiddenGemScore,
    popularityBand,
    seasonalScore,
    freshnessScore,
    seasonRelation,
    season,
    seasonYear,
  } = recommendation;
  const title = getAnimeTitle(anime);
  const rootRef = useRef<HTMLElement | null>(null);
  const feedbackDialogRef = useRef<HTMLDialogElement | null>(null);
  const [runtimeIdentity] = useState<RecommendationCardRuntimeIdentity>(
    () =>
      getRecommendationCardRuntimeIdentity({
        animeId: anime.id,
        source,
        rowId,
        sessionId: recommendationSessionId,
        position,
      }),
  );
  const impressionSentRef = useRef(
    runtimeIdentity.impressionSent,
  );
  const hoverStartedAtRef = useRef<number | null>(null);
  const [planState, setPlanState] = useState<'idle' | 'saving' | 'saved' | 'auth' | 'error'>('idle');
  const [liked, setLiked] = useState(false);
  const [posterState, setPosterState] = useState<AnimeImageLoadState>('loading');
  const ratingLabel = formatAnimeScore(anime);
  const durationLabel = formatDuration(anime.duration);

  const eventContext = {
    animeId: anime.id,
    recommendationId: runtimeIdentity.recommendationId,
    impressionId: runtimeIdentity.impressionId,
    position,
    rowId,
    source,
    mood,
    recommendationSessionId,
    matchScore: matchScore ?? undefined,
    reason,
    fatigueScore,
    exposureCount7d,
    exposureCount30d,
    sessionIntentScore,
    sessionIntentConfidence,
    completionScore,
    franchiseContinuation,
    franchiseSeasonNumber: franchiseSeasonNumber ?? undefined,
    explorationClass,
    noveltyScore,
    hiddenGemScore,
    popularityBand,
    seasonalScore,
    freshnessScore,
    seasonRelation,
    season: season ?? undefined,
    seasonYear: seasonYear ?? undefined,
  };

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
            runtimeIdentity.impressionSent = true;
            trackRecommendationEvent({
              type: 'impression',
              animeId: anime.id,
              recommendationId: runtimeIdentity.recommendationId,
              impressionId: runtimeIdentity.impressionId,
              position,
              rowId,
              source,
              mood,
              recommendationSessionId,
              matchScore: matchScore ?? undefined,
              reason,
              franchiseContinuation,
              franchiseSeasonNumber: franchiseSeasonNumber ?? undefined,
              explorationClass,
              noveltyScore,
              hiddenGemScore,
              popularityBand,
              seasonalScore,
              freshnessScore,
              seasonRelation,
              season: season ?? undefined,
              seasonYear: seasonYear ?? undefined,
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
  }, [
    anime.id,
    franchiseContinuation,
    franchiseSeasonNumber,
    explorationClass,
    noveltyScore,
    hiddenGemScore,
    popularityBand,
    seasonalScore,
    freshnessScore,
    seasonRelation,
    season,
    seasonYear,
    matchScore,
    mood,
    position,
    reason,
    recommendationSessionId,
    rowId,
    runtimeIdentity,
    source,
  ]);

  function trackOpen() {
    trackRecommendationEvent({
      type: 'open',
      ...eventContext,
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
      ...eventContext,
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
        ...eventContext,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message.toLowerCase() : '';
      setPlanState(message.includes('войди') ? 'auth' : 'error');
    }
  }

  function likeMore() {
    if (liked) return;
    setLiked(true);
    applyRecommendationFeedbackLocally(anime, 'like_more');
    trackRecommendationEvent({
      type: 'liked',
      feedbackSignal: 'like_more',
      ...eventContext,
    });
    void persistRecommendationFeedback({
      animeId: anime.id,
      signal: 'like_more',
      source,
      reason,
      modelVersion: RECOMMENDATION_MODEL_VERSION,
      recommendationId: runtimeIdentity.recommendationId,
      recommendationSessionId,
      algorithmVersion: RECOMMENDATION_MODEL_VERSION,
      rowId,
      position,
      mood,
    });
  }

  function applyStructuredFeedback(signal: RecommendationFeedbackSignal) {
    const policy = recommendationFeedbackPolicy(signal);
    const previousProfile = readTasteProfile();

    applyRecommendationFeedbackLocally(anime, signal);
    trackRecommendationEvent({
      type: feedbackEventType(signal),
      feedbackSignal: signal,
      ...eventContext,
    });

    const persistence = persistRecommendationFeedback({
      animeId: anime.id,
      signal,
      source,
      reason,
      modelVersion: RECOMMENDATION_MODEL_VERSION,
      recommendationId: runtimeIdentity.recommendationId,
      recommendationSessionId,
      algorithmVersion: RECOMMENDATION_MODEL_VERSION,
      rowId,
      position,
      mood,
    });

    feedbackDialogRef.current?.close();
    onHidden(anime.id);

    onFeedbackApplied?.({
      anime,
      signal,
      label: policy.label,
      undo: () => {
        writeTasteProfile(previousProfile);
        void persistence.finally(() => {
          void clearRecommendationFeedback(anime.id);
        });
      },
    });
  }

  function markWatched() {
    applyStructuredFeedback('already_watched');
  }

  function openFeedbackMenu() {
    const dialog = feedbackDialogRef.current;
    if (!dialog) return;
    if (typeof dialog.showModal === 'function') {
      if (!dialog.open) dialog.showModal();
      return;
    }
    dialog.setAttribute('open', '');
  }

  const planLabel =
    planState === 'saving'
      ? 'Сохраняем…'
      : planState === 'saved'
        ? 'Сохранено'
        : planState === 'auth'
          ? 'Войти'
          : planState === 'error'
            ? 'Повторить'
            : 'В список';

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
        prefetch={true}
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
            loading="near"
            sizes="(min-width: 3400px) 250px, (min-width: 3000px) 235px, (min-width: 2400px) 225px, (min-width: 1920px) 215px, (max-width: 560px) 41vw, (max-width: 900px) 27vw, (max-width: 1280px) 18vw, 205px"
            quality={62}
            sourcePreference="compact"
            preset="card"
            onStateChange={setPosterState}
          />

          {posterState === 'loaded' && ratingLabel && (
            <div className="smart-card__rating" aria-label={`Рейтинг ${ratingLabel} из 10`}>
              <span aria-hidden="true">★</span>
              {ratingLabel}
            </div>
          )}

          {posterState === 'loaded' && matchScore != null && (
            <div
              className="smart-card__match"
              title={reasons.join(' · ')}
              aria-label={`${matchScore}% совпадение с твоим вкусом`}
            >
              {matchScore}%
            </div>
          )}

          <div className="smart-card__open">
            <span>Открыть</span>
            <span aria-hidden="true">↗</span>
          </div>
        </div>
      </Link>

      <div className="smart-card__body">
        <Link
          href={animeHref(anime)}
          prefetch={true}
          onClick={trackOpen}
          className="smart-card__title"
          title={title}
        >
          {title}
        </Link>

        <div className="smart-card__meta" aria-label="Информация об аниме">
          <span>{formatLabel(anime.format)}</span>
          {durationLabel && (
            <>
              <span aria-hidden="true">•</span>
              <span>{durationLabel}</span>
            </>
          )}
        </div>

        <p className="smart-card__reason" title={reasons.join(' · ')}>
          <span aria-hidden="true">✦</span>
          {reason}
        </p>

        <div className="smart-card__actions">
          <button
            type="button"
            className={planClassName}
            onClick={() => void addToPlans()}
            disabled={planState === 'saving' || planState === 'saved'}
            aria-label={
              planState === 'saved'
                ? 'Добавлено в список «Буду смотреть»'
                : 'Добавить в список «Буду смотреть»'
            }
            title={
              planState === 'saved'
                ? 'Уже в списке «Буду смотреть»'
                : 'Добавить в список «Буду смотреть»'
            }
          >
            <span
              className={
                planState === 'saving'
                  ? 'smart-card__plan-icon is-spinner'
                  : 'smart-card__plan-icon'
              }
              aria-hidden="true"
            >
              {planState === 'saving' ? '' : planIcon}
            </span>
            <span className="smart-card__plan-label">{planLabel}</span>
          </button>

          <button
            type="button"
            className={liked
              ? 'smart-card__feedback smart-card__feedback--like is-active'
              : 'smart-card__feedback smart-card__feedback--like'}
            onClick={likeMore}
            aria-pressed={liked}
            aria-label={`Хочу больше похожего на ${title}`}
            title="Больше похожего"
          >
            <Icon name="heart" size={19} weight={liked ? 'fill' : 'regular'} />
          </button>

          <button
            type="button"
            className="smart-card__feedback smart-card__feedback--watched"
            onClick={markWatched}
            aria-label={`Я уже смотрел ${title}`}
            title="Уже смотрел"
          >
            <Icon name="check" size={19} weight="bold" />
          </button>

          <button
            type="button"
            className="smart-card__dismiss smart-card__feedback--dismiss"
            onClick={openFeedbackMenu}
            aria-label={`Настроить рекомендации для ${title}`}
            title="Почему не подходит?"
          >
            <svg
              className="smart-card__feedback-icon"
              viewBox="0 0 24 24"
              fill="none"
              aria-hidden="true"
            >
              <path
                d="M6.5 6.5l11 11M17.5 6.5l-11 11"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </div>
      </div>

      <dialog
        ref={feedbackDialogRef}
        className="smart-card__feedback-dialog"
        aria-labelledby={`feedback-title-${anime.id}`}
        onClick={(event) => {
          if (event.currentTarget === event.target) {
            event.currentTarget.close();
          }
        }}
      >
        <div className="smart-card__feedback-dialog-panel">
          <div className="smart-card__feedback-dialog-head">
            <div>
              <span>НАСТРОИТЬ ЛЕНТУ</span>
              <strong id={`feedback-title-${anime.id}`}>
                Почему не подходит?
              </strong>
            </div>
            <button
              type="button"
              className="smart-card__feedback-dialog-close"
              onClick={() => feedbackDialogRef.current?.close()}
              aria-label="Закрыть"
            >
              ×
            </button>
          </div>

          <p className="smart-card__feedback-dialog-copy">
            Причина влияет на рекомендации по-разному. «Не сейчас» не портит
            долгосрочный профиль вкуса.
          </p>

          <div className="smart-card__feedback-dialog-options">
            {STRUCTURED_FEEDBACK_MENU.map((item) => (
              <button
                key={item.signal}
                type="button"
                className="smart-card__feedback-dialog-option"
                onClick={() => applyStructuredFeedback(item.signal)}
              >
                <strong>{item.label}</strong>
                <span>{item.description}</span>
              </button>
            ))}
          </div>

          <button
            type="button"
            className="smart-card__feedback-dialog-cancel"
            onClick={() => feedbackDialogRef.current?.close()}
          >
            Отмена
          </button>
        </div>
      </dialog>
    </article>
  );
}
