'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { useAuthState } from '@/components/AuthStateProvider';
import { useEpisodeAvailability } from '@/components/AnimeDetailControls';
import { addAnimeToList } from '@/lib/anime-storage';
import { animeHref } from '@/lib/anime-url';
import {
  rememberContinueWatchingAttribution,
  trackProductClientEvent,
} from '@/lib/product-events-client';
import {
  getLatestWatchProgress,
  hasResumePosition,
} from '@/lib/watch-progress';
import type { Anime } from '@/types/anime';
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

function serverResume(
  state: WatchTitleOverview | null,
): AnimeDetailResume | null {
  if (!state?.resumeEpisode || state.fullyCompleted) return null;

  const durationMs = Number(state.durationMs ?? 0);
  const positionMs = Math.max(0, Number(state.resumePositionMs ?? 0));
  const episodePercent =
    durationMs > 0
      ? Math.min(
          99,
          Math.max(0, Math.round((positionMs / durationMs) * 100)),
        )
      : null;

  return {
    episode: state.resumeEpisode,
    mode:
      state.resumeMode ??
      (positionMs >= 10_000 ? 'resume' : 'next'),
    resumeSeconds: Math.floor(positionMs / 1000),
    updatedAt: serverTimestamp(state),
    episodePercent,
  };
}

export default function AnimeDetailContinueWatching({
  anime,
}: {
  anime: Anime;
}) {
  const animeId = anime.id;
  const animeSlug = anime.slug || String(anime.id);
  const { user, loading: authLoading } = useAuthState();
  const {
    count: availableEpisodes,
    pending: episodeAvailabilityPending,
    playable: playbackReady,
    unavailable: episodesUnavailable,
    unknown: playbackUnknown,
  } = useEpisodeAvailability(anime);

  const [serverSnapshot, setServerSnapshot] = useState<{
    ownerId: string;
    item: WatchTitleOverview | null;
  } | null>(null);
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
    window.addEventListener(
      'watch-progress',
      refreshLocal as EventListener,
    );
    window.addEventListener('watch-state-updated', refreshLocal);
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      window.removeEventListener('focus', refreshLocal);
      window.removeEventListener('pageshow', refreshLocal);
      window.removeEventListener(
        'watch-progress',
        refreshLocal as EventListener,
      );
      window.removeEventListener('watch-state-updated', refreshLocal);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [refreshLocal]);

  useEffect(() => {
    if (authLoading) return;

    if (!user?.id) {
      queueMicrotask(() => setServerSnapshot(null));
      return;
    }

    const ownerId = user.id;
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

          setServerSnapshot({
            ownerId,
            item: payload.item ?? null,
          });
        })
        .catch((error: unknown) => {
          if (
            !(error instanceof Error && error.name === 'AbortError')
          ) {
            console.debug(
              '[Anime detail] watch title state unavailable',
            );
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

    if (authLoading) return null;

    const local = getLatestWatchProgress(
      animeId,
      user?.id ?? null,
    );
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
                    Math.round(
                      (local.currentTime / local.duration) * 100,
                    ),
                  ),
                )
              : null,
        }
      : null;

    const serverState =
      serverSnapshot &&
      serverSnapshot.ownerId === user?.id
        ? serverSnapshot.item
        : null;
    const remoteResume = serverResume(serverState);
    const remoteUpdatedAt = serverTimestamp(serverState);

    if (!remoteResume) {
      if (!localResume) return null;

      // A newer authoritative server state with no continuation acts as a
      // tombstone (for example, the title was completed on another device).
      // Only a genuinely newer local crash-resume may supersede it.
      if (
        serverState &&
        remoteUpdatedAt >= localResume.updatedAt
      ) {
        return null;
      }

      return localResume;
    }

    if (!localResume) return remoteResume;

    return localResume.updatedAt > remoteResume.updatedAt
      ? localResume
      : remoteResume;
  }, [
    animeId,
    authLoading,
    revision,
    serverSnapshot,
    user?.id,
  ]);

  useEffect(() => {
    if (!resume) return;

    const signature =
      `${animeId}:${resume.episode}:${resume.mode}:${resume.updatedAt}`;
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

  const requestedEpisode = Math.max(1, resume?.episode ?? 1);
  const episodeConfirmed = Boolean(
    playbackReady &&
      availableEpisodes &&
      requestedEpisode <= availableEpisodes,
  );
  const requestedBeyondAvailability = Boolean(
    availableEpisodes &&
      requestedEpisode > availableEpisodes,
  );

  const isResume =
    resume?.mode === 'resume' &&
    (resume.resumeSeconds ?? 0) >= 10;

  let eyebrow = 'Смотреть';
  let title = 'Смотреть с 1 серии';
  let helper = 'Открыть подтверждённый источник воспроизведения';

  if (authLoading) {
    eyebrow = 'Прогресс';
    title = 'Проверяем место просмотра…';
    helper = 'Синхронизируем прогресс этого аккаунта';
  } else if (episodeAvailabilityPending) {
    eyebrow = 'Источник';
    title = 'Проверяем плеер…';
    helper = 'Ссылка появится после подтверждения серии';
  } else if (playbackUnknown) {
    eyebrow = 'Источник';
    title = 'Источник временно недоступен';
    helper = 'Не открываем неподтверждённую серию';
  } else if (episodesUnavailable || !playbackReady) {
    eyebrow = 'Эпизоды';
    title = 'Серии пока недоступны';
    helper = 'Вернись позже — тайтл останется в AnimeBox';
  } else if (requestedBeyondAvailability) {
    eyebrow = resume?.mode === 'next' ? 'Следующая серия' : 'Эпизод';
    title =
      resume?.mode === 'next'
        ? 'Следующая серия ещё недоступна'
        : `Серия ${requestedEpisode} пока недоступна`;
    helper = availableEpisodes
      ? `Сейчас подтверждено серий: ${availableEpisodes}`
      : 'Ждём подтверждения источника';
  } else if (resume) {
    eyebrow = isResume ? 'Продолжить просмотр' : 'Следующая серия';
    title = `Серия ${requestedEpisode}${
      isResume ? ` · с ${formatResumeTime(resume.resumeSeconds)}` : ''
    }`;
    helper = isResume
      ? 'Вернуться ровно к месту просмотра'
      : 'Продолжить с новой серии';
  }

  const body = (
    <>
      <span
        className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-violet-500/20 text-sm text-violet-100"
        aria-hidden="true"
      >
        ▶
      </span>

      <span className="min-w-0 flex-1">
        <span className="block text-[10px] font-semibold uppercase tracking-[0.12em] text-violet-300/75">
          {eyebrow}
        </span>
        <strong className="mt-0.5 block text-sm text-white">
          {title}
        </strong>

        {resume?.episodePercent != null &&
          resume.episodePercent > 0 &&
          !requestedBeyondAvailability && (
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

        <small className="mt-1.5 block text-xs text-white/45">
          {helper}
        </small>
      </span>

      <span className="shrink-0 text-xs font-semibold text-violet-200">
        {episodeConfirmed ? 'Смотреть →' : 'Ожидание'}
      </span>
    </>
  );

  const className =
    'anime-detail-v4__continue mt-4 flex max-w-3xl items-center gap-3 rounded-xl border px-3.5 py-3 text-left transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-400';

  if (!episodeConfirmed || authLoading) {
    return (
      <div
        className={`${className} cursor-not-allowed border-white/10 bg-white/[0.035] opacity-80`}
        aria-disabled="true"
        data-playback-state={
          authLoading
            ? 'auth-loading'
            : episodeAvailabilityPending
              ? 'checking'
              : playbackUnknown
                ? 'unknown'
                : episodesUnavailable
                  ? 'unavailable'
                  : requestedBeyondAvailability
                    ? 'episode-unavailable'
                    : 'blocked'
        }
      >
        {body}
      </div>
    );
  }

  const href =
    `${animeHref(anime)}/watch?ep=${requestedEpisode}`;

  return (
    <Link
      href={href}
      className={`${className} border-violet-400/25 bg-violet-500/[0.08] hover:border-violet-300/45 hover:bg-violet-500/[0.13]`}
      onClick={() => {
        addAnimeToList(anime);

        if (resume) {
          rememberContinueWatchingAttribution({
            animeId,
            episode: requestedEpisode,
            mode: resume.mode,
            source: 'anime_detail_continue',
          });
          trackProductClientEvent('continue_watching_click', {
            source: 'anime_detail_continue',
            path: `/anime/${animeSlug}`,
            entityType: 'episode',
            entityId: `${animeId}:${requestedEpisode}`,
            metadata: {
              anime_id: animeId,
              episode: requestedEpisode,
              mode: resume.mode,
              resume_seconds: resume.resumeSeconds,
            },
            flush: true,
          });
        }
      }}
    >
      {body}
    </Link>
  );
}
