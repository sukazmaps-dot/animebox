'use client';

import Link from 'next/link';
import styles from './HomeContinueWatching.module.css';
import { useEffect, useRef } from 'react';

import AnimeImage from '@/components/AnimeImage';
import { getAnimeTitle } from '@/lib/anime-display';
import { animeHref } from '@/lib/anime-url';
import type { AnimeHistoryEntry } from '@/lib/anime-storage';
import {
  rememberContinueWatchingAttribution,
  trackProductClientEvent,
} from '@/lib/product-events-client';

export type ContinueWatchingItem = {
  anime: AnimeHistoryEntry;
  episode: number;
  resumeSeconds?: number;
  resumeMode?: 'resume' | 'next';
  completedEpisodes?: number;
  totalEpisodes?: number | null;
  lastWatchedAt?: number | null;
};

function formatResumeTime(seconds: number) {
  const safe = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(safe / 60);
  const remainder = safe % 60;
  return `${minutes}:${String(remainder).padStart(2, '0')}`;
}

function formatLastWatched(timestamp?: number | null) {
  if (!timestamp || !Number.isFinite(timestamp)) return null;
  const ageMs = Math.max(0, Date.now() - timestamp);
  const minutes = Math.floor(ageMs / 60_000);
  if (minutes < 2) return 'только что';
  if (minutes < 60) return `${minutes} мин. назад`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} ч. назад`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days} дн. назад`;
  return new Date(timestamp).toLocaleDateString('ru-RU', {
    day: '2-digit',
    month: 'short',
  });
}

export default function HomeContinueWatching({
  items,
}: {
  items: ContinueWatchingItem[];
}) {
  const impressionSignature = items
    .slice(0, 4)
    .map((item) => `${item.anime.id}:${item.episode}:${item.resumeMode ?? 'resume'}`)
    .join('|');
  const lastImpressionRef = useRef('');

  useEffect(() => {
    if (!impressionSignature || lastImpressionRef.current === impressionSignature) return;

    lastImpressionRef.current = impressionSignature;
    trackProductClientEvent('continue_watching_impression', {
      source: 'home_continue',
      path: '/',
      entityType: 'surface',
      entityId: 'home_continue',
      metadata: {
        count: Math.min(items.length, 4),
        items: items.slice(0, 4).map((item) => ({
          anime_id: item.anime.id,
          episode: item.episode,
          mode: item.resumeMode ?? 'resume',
        })),
      },
    });
  }, [impressionSignature, items]);

  if (items.length === 0) return null;

  return (
    <section className={`section continue-watching-section ${styles.section}`}>
      <div className="section-head">
        <div>
          <span className="smart-section-eyebrow">Вернуться сегодня</span>
          <h2 className="section-title">Продолжить просмотр</h2>
        </div>

        <Link className="section-link" href="/list">
          Мой трекер →
        </Link>
      </div>

      <div className="continue-smart-grid">
        {items.slice(0, 4).map(({
          anime,
          episode,
          resumeSeconds = 0,
          resumeMode = 'resume',
          completedEpisodes,
          totalEpisodes: explicitTotalEpisodes,
          lastWatchedAt,
        }, index) => {
          const title = getAnimeTitle(anime);
          const totalEpisodes =
            explicitTotalEpisodes ??
            (anime.episodes && anime.episodes > 0 ? anime.episodes : null);
          const titleProgress =
            completedEpisodes != null && totalEpisodes
              ? (completedEpisodes / totalEpisodes) * 100
              : 0;
          const progress = Math.min(100, Math.max(0, titleProgress));
          const lastWatchedLabel = formatLastWatched(lastWatchedAt);

          return (
            <Link
              key={anime.id}
              href={`${animeHref(anime)}/watch?ep=${Math.max(1, episode)}`}
              className={`continue-smart-card ${styles.card} ${index === 0 ? styles.featured : ""}`}
              onClick={() => {
                rememberContinueWatchingAttribution({
                  animeId: anime.id,
                  episode: Math.max(1, episode),
                  mode: resumeMode,
                });
                trackProductClientEvent('continue_watching_click', {
                  source: 'home_continue',
                  path: '/',
                  entityType: 'episode',
                  entityId: `${anime.id}:${Math.max(1, episode)}`,
                  metadata: {
                    anime_id: anime.id,
                    episode: Math.max(1, episode),
                    mode: resumeMode,
                    resume_seconds: Math.max(0, Math.floor(resumeSeconds)),
                  },
                  flush: true,
                });
                trackProductClientEvent('home_resume_click', {
                  source: 'home_retention',
                  path: '/',
                  entityType: 'episode',
                  entityId: `${anime.id}:${Math.max(1, episode)}`,
                  metadata: {
                    anime_id: anime.id,
                    episode: Math.max(1, episode),
                    mode: resumeMode,
                  },
                  flush: true,
                });
              }}
            >
              <div className="continue-smart-card__poster">
                <AnimeImage
                  image={anime.coverImage}
                  alt={title}
                  englishName={anime.title?.english || anime.title?.romaji}
                  className="continue-smart-card__image"
                  loading={index === 0 ? 'eager' : 'lazy'}
                  sizes={index === 0 ? '(max-width: 600px) 76px, 96px' : '54px'}
                  quality={60}
                />
                <span className="continue-smart-card__play" aria-hidden="true">▶</span>
              </div>

              <div className="continue-smart-card__body">
                <span className="continue-smart-card__eyebrow">
                  {resumeMode === 'next' ? 'СЛЕДУЮЩАЯ СЕРИЯ' : `ЭПИЗОД ${Math.max(1, episode)}`}
                  {resumeMode !== 'next' && resumeSeconds >= 10
                    ? ` · ${formatResumeTime(resumeSeconds)}`
                    : ''}
                </span>
                <strong title={title}>{title}</strong>
                {completedEpisodes != null && Boolean(totalEpisodes) && <div className="continue-smart-card__progress" role="progressbar" aria-label="Просмотрено серий" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress)}>
                  <i style={{ width: `${progress}%` }} />
                </div>}
                <small>
                  {resumeMode === 'next'
                    ? `Открыть ${Math.max(1, episode)} серию`
                    : resumeSeconds >= 10
                      ? `Продолжить с ${formatResumeTime(resumeSeconds)}`
                      : completedEpisodes != null && totalEpisodes
                        ? `${completedEpisodes} из ${totalEpisodes} серий подтверждено`
                        : totalEpisodes
                          ? `${episode} из ${totalEpisodes}`
                          : 'Продолжить с места просмотра'}
                  {lastWatchedLabel ? ` · ${lastWatchedLabel}` : ''}
                </small>
              </div>

              <span className={`continue-smart-card__arrow ${index === 0 ? styles.action : ''}`} aria-hidden="true">{index === 0 ? 'Смотреть →' : '→'}</span>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
