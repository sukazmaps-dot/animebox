'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { useAuthState } from '@/components/AuthStateProvider';
import {
  rememberContinueWatchingAttribution,
  trackProductClientEvent,
} from '@/lib/product-events-client';
import {
  getLatestWatchProgress,
  hasResumePosition,
} from '@/lib/watch-progress';
import type { WatchTitleOverview } from '@/types/watch';

type AnimeDetailResume = {
  episode: number;
  mode: 'resume' | 'next';
  resumeSeconds: number;
  updatedAt: number;
  episodePercent: number | null;
};

function formatResumeTime(seconds: number) {
  const safe = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(safe / 60);
  const remainder = safe % 60;
  return `${minutes}:${String(remainder).padStart(2, '0')}`;
}

function serverTimestamp(state: WatchTitleOverview | null) {
  if (!state?.lastWatchedAt) return 0;
  const parsed = Date.parse(state.lastWatchedAt);
  return Number.isFinite(parsed) ? parsed : 0;
}

function serverResume(state: WatchTitleOverview | null): AnimeDetailResume | null {
  if (!state?.resumeEpisode || state.fullyCompleted) return null;

  const durationMs = Number(state.durationMs ?? 0);
  const positionMs = Math.max(0, Number(state.resumePositionMs ?? 0));
  const episodePercent =
    durationMs > 0
      ? Math.min(99, Math.max(0, Math.round((positionMs / durationMs) * 100)))
      : null;

  return {
    episode: state.resumeEpisode,
    mode: state.resumeMode ?? (positionMs >= 10_000 ? 'resume' : 'next'),
    resumeSeconds: Math.floor(positionMs / 1000),
    updatedAt: serverTimestamp(state),
    episodePercent,
  };
}

export default function AnimeDetailContinueWatching({
  animeId,
  animeSlug,
}: {
  animeId: number;
  animeSlug: string;
}) {
  const { user, loading: authLoading } = useAuthState();
  const [serverState, setServerState] = useState<WatchTitleOverview | null>(null);
  const [revision, setRevision] = useState(0);
  const impressionRef = useRef('');

  const refreshLocal = useCallback(() => {
    setRevision((value) => value + 1);
  }, []);

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible') refreshLocal();
    };

    window.addEventListener('focus', refreshLocal);
    window.addEventListener('pageshow', refreshLocal);
    window.addEventListener('watch-progress', refreshLocal as EventListener);
    window.addEventListener('watch-state-updated', refreshLocal);
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      window.removeEventListener('focus', refreshLocal);
      window.removeEventListener('pageshow', refreshLocal);
      window.removeEventListener('watch-progress', refreshLocal as EventListener);
      window.removeEventListener('watch-state-updated', refreshLocal);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [refreshLocal]);

  useEffect(() => {
    if (authLoading) return;

    if (!user?.id) {
      queueMicrotask(() => setServerState(null));
      return;
    }

    const controller = new AbortController();

    const load = () => {
      void fetch(`/api/watch/title/${animeId}`, {
        signal: controller.signal,
        cache: 'no-store',
      })
        .then(async (response) => {
          if (!response.ok) {
            throw new Error(`Watch title HTTP ${response.status}`);
          }
          return (await response.json()) as {
            item?: WatchTitleOverview | null;
          };
        })
        .then((payload) => {
          if (controller.signal.aborted) return;
          setServerState(payload.item ?? null);
        })
        .catch((error: unknown) => {
          if (!(error instanceof Error && error.name === 'AbortError')) {
            console.debug('[Anime detail] recent watch unavailable');
          }
        });
    };

    const onVisible = () => {
      if (document.visibilityState === 'visible') load();
    };

    load();
    window.addEventListener('focus', load);
    window.addEventListener('pageshow', load);
    window.addEventListener('watch-state-updated', load);
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      controller.abort();
      window.removeEventListener('focus', load);
      window.removeEventListener('pageshow', load);
      window.removeEventListener('watch-state-updated', load);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [animeId, authLoading, user?.id]);

  const resume = useMemo<AnimeDetailResume | null>(() => {
    void revision;

    const local = getLatestWatchProgress(animeId, user?.id ?? null);
    const localResume = hasResumePosition(local)
      ? {
          episode: local.episode,
          mode: 'resume' as const,
          resumeSeconds: Math.floor(local.currentTime),
          updatedAt: local.updatedAt,
          episodePercent:
            local.duration > 0
              ? Math.min(
                  99,
                  Math.max(
                    0,
                    Math.round((local.currentTime / local.duration) * 100),
                  ),
                )
              : null,
        }
      : null;

    const remoteResume = serverResume(serverState);
    const remoteUpdatedAt = serverTimestamp(serverState);

    if (!remoteResume) {
      if (!localResume) return null;

      // A newer authoritative server state with no continuation acts as a
      // tombstone (for example, the title was completed on another device).
      // Only a genuinely newer local crash-resume may supersede it.
      if (serverState && remoteUpdatedAt >= localResume.updatedAt) {
        return null;
      }

      return localResume;
    }

    if (!localResume) return remoteResume;

    return localResume.updatedAt > remoteResume.updatedAt
      ? localResume
      : remoteResume;
  }, [animeId, revision, serverState, user?.id]);

  useEffect(() => {
    if (!resume) return;

    const signature = `${animeId}:${resume.episode}:${resume.mode}:${resume.updatedAt}`;
    if (impressionRef.current === signature) return;
    impressionRef.current = signature;

    trackProductClientEvent('continue_watching_impression', {
      source: 'anime_detail_continue',
      path: `/anime/${animeSlug}`,
      entityType: 'episode',
      entityId: `${animeId}:${resume.episode}`,
      metadata: {
        anime_id: animeId,
        episode: resume.episode,
        mode: resume.mode,
        resume_seconds: resume.resumeSeconds,
      },
    });
  }, [animeId, animeSlug, resume]);

  if (!resume) return null;

  const href = `/anime/${animeSlug}/watch?ep=${Math.max(1, resume.episode)}`;
  const isResume = resume.mode === 'resume' && resume.resumeSeconds >= 10;

  return (
    <Link
      href={href}
      className="anime-detail-v4__continue mt-4 flex max-w-3xl items-center gap-3 rounded-xl border border-violet-400/25 bg-violet-500/[0.08] px-3.5 py-3 text-left transition hover:border-violet-300/45 hover:bg-violet-500/[0.13] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-400"
      onClick={() => {
        rememberContinueWatchingAttribution({
          animeId,
          episode: Math.max(1, resume.episode),
          mode: resume.mode,
          source: 'anime_detail_continue',
        });
        trackProductClientEvent('continue_watching_click', {
          source: 'anime_detail_continue',
          path: `/anime/${animeSlug}`,
          entityType: 'episode',
          entityId: `${animeId}:${Math.max(1, resume.episode)}`,
          metadata: {
            anime_id: animeId,
            episode: Math.max(1, resume.episode),
            mode: resume.mode,
            resume_seconds: resume.resumeSeconds,
          },
          flush: true,
        });
      }}
    >
      <span
        className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-violet-500/20 text-sm text-violet-100"
        aria-hidden="true"
      >
        ▶
      </span>

      <span className="min-w-0 flex-1">
        <span className="block text-[10px] font-semibold uppercase tracking-[0.12em] text-violet-300/75">
          {isResume ? 'Продолжить просмотр' : 'Следующая серия'}
        </span>
        <strong className="mt-0.5 block text-sm text-white">
          Серия {Math.max(1, resume.episode)}
          {isResume ? ` · с ${formatResumeTime(resume.resumeSeconds)}` : ''}
        </strong>

        {resume.episodePercent != null && resume.episodePercent > 0 && (
          <span
            className="mt-2 block h-1.5 overflow-hidden rounded-full bg-white/10"
            role="progressbar"
            aria-label="Прогресс текущей серии"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={resume.episodePercent}
          >
            <i
              className="block h-full rounded-full bg-violet-400"
              style={{ width: `${resume.episodePercent}%` }}
            />
          </span>
        )}
      </span>

      <span className="shrink-0 text-xs font-semibold text-violet-200">
        Смотреть →
      </span>
    </Link>
  );
}
