'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import AnimeImage from '@/components/AnimeImage';
import { useAuthModal } from '@/components/AuthModalProvider';
import { useAuthState } from '@/components/AuthStateProvider';
import { useHomeFeedRuntime } from '@/components/home/HomeFeedRuntimeProvider';
import { useVisibleHomeImpression } from '@/components/home/useVisibleHomeImpression';
import { selectHomeWatchRooms, type HomePublicWatchRoom } from '@/lib/home-watch-room-policy';
import { trackProductClientEvent } from '@/lib/product-events-client';
import { buildWatchPartyUrl, watchPartyTheaterPath } from '@/lib/watch-party';
import { canonicalWatchPartyInvite, isWatchPartyJoinSnapshot } from '@/lib/watch-party-entry';
import type { WatchPartyTheme } from '@/lib/watch-party-premium';
import styles from './HomeWatchTogetherSection.module.css';

type RoomsResponse = { rooms?: unknown; degraded?: boolean };
type ResolveResponse = {
  room?: { roomId: string; joinSecret: string; animeSlug: string; episode: number;
    roomTheme?: WatchPartyTheme; participantCount: number; maxParticipants: number };
  error?: string;
};
const REFRESH_MS = 30_000;
const FETCH_TIMEOUT_MS = 8_000;

function activityLabel(status: HomePublicWatchRoom['status']) {
  switch (status) {
    case 'watching': return 'Смотрят сейчас';
    case 'paused': return 'На паузе';
    case 'voting': return 'Голосуют';
    default: return 'Ждут зрителей';
  }
}

function safeCover(url: string | null): string | null {
  return url && /^https:\/\//i.test(url) ? url : null;
}

export default function HomeWatchTogetherLobby() {
  const { personalAnimeIdList } = useHomeFeedRuntime();
  const { user, loading: authLoading } = useAuthState();
  const { openAuth } = useAuthModal();

  const [rawRooms, setRawRooms] = useState<unknown>([]);
  const [loading, setLoading] = useState(true);
  const [degraded, setDegraded] = useState(false);
  const [error, setError] = useState('');
  const [joiningId, setJoiningId] = useState<string | null>(null);
  const mountedRef = useRef(false);
  const visibleRef = useRef(false);
  const requestRef = useRef<AbortController | null>(null);
  const joinRef = useRef<AbortController | null>(null);
  const joinBusyRef = useRef(false);
  const lastFetchRef = useRef(0);
  const lobbyRef = useRef<HTMLDivElement | null>(null);

  const rooms = useMemo(
    () => selectHomeWatchRooms(rawRooms, personalAnimeIdList),
    [rawRooms, personalAnimeIdList],
  );

  const refresh = useCallback(async (force = false) => {
    if (document.hidden || !visibleRef.current || requestRef.current) return;
    if (!force && Date.now() - lastFetchRef.current < REFRESH_MS) return;
    lastFetchRef.current = Date.now();

    const controller = new AbortController();
    requestRef.current = controller;
    const timeout = window.setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
      const response = await fetch('/api/watch-party/rooms?limit=30', {
        headers: { Accept: 'application/json' }, cache: 'no-store', signal: controller.signal,
      });
      if (!response.ok) throw new Error('rooms_fetch_failed');
      const payload = (await response.json()) as RoomsResponse;
      if (!mountedRef.current || controller.signal.aborted) return;
      setRawRooms(payload.rooms ?? []);
      setDegraded(Boolean(payload.degraded));
      setError('');
    } catch {
      if (!mountedRef.current) return;
      setError('Не удалось обновить список комнат.');
    } finally {
      window.clearTimeout(timeout);
      if (requestRef.current === controller) requestRef.current = null;
      if (mountedRef.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    const host = lobbyRef.current;
    const observer = host && typeof IntersectionObserver !== 'undefined'
      ? new IntersectionObserver((entries) => {
          visibleRef.current = entries.some((entry) => entry.isIntersecting);
          if (visibleRef.current) void refresh();
        }, { rootMargin: '160px 0px', threshold: 0 })
      : null;

    if (host) observer?.observe(host);
    if (!observer) {
      visibleRef.current = true;
      void refresh();
    }
    const interval = window.setInterval(() => { void refresh(); }, REFRESH_MS);
    const onVisibility = () => { if (!document.hidden) void refresh(); };
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      mountedRef.current = false;
      observer?.disconnect();
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisibility);
      requestRef.current?.abort();
      joinRef.current?.abort();
      requestRef.current = null;
      joinRef.current = null;
    };
  }, [refresh]);

  const signature = loading ? '' : rooms.length
    ? rooms.map((room) => room.roomId).join('|')
    : 'empty';
  const impressionRef = useVisibleHomeImpression(signature, () => {
    trackProductClientEvent('home_section_view', {
      source: 'home_watch_together',
      path: '/',
      entityType: 'surface',
      entityId: 'home_watch_together_lobby',
      metadata: { section: 'watch_together', room_count: rooms.length },
    });
  });

  async function joinRoom(room: HomePublicWatchRoom) {
    if (joinBusyRef.current || authLoading) return;
    if (!user?.id) {
      openAuth({
        mode: 'login',
        intent: 'watch_party',
        title: 'Войди, чтобы смотреть аниме вместе',
        next: '/watch-together',
      });
      return;
    }

    joinBusyRef.current = true;
    setJoiningId(room.roomId);
    setError('');
    const controller = new AbortController();
    joinRef.current = controller;
    const timeout = window.setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
      const response = await fetch(
        '/api/watch-party/rooms/resolve?roomId=' + encodeURIComponent(room.roomId),
        { cache: 'no-store', signal: controller.signal, headers: { Accept: 'application/json' } },
      );
      const payload = (await response.json()) as ResolveResponse;
      if (!response.ok || !payload.room || !isWatchPartyJoinSnapshot(payload.room)) {
        throw new Error(payload.error || 'Комната больше недоступна.');
      }
      const resolved = payload.room;
      const target = buildWatchPartyUrl(
        { roomId: resolved.roomId, secret: resolved.joinSecret },
        watchPartyTheaterPath(resolved.animeSlug, resolved.episode),
        resolved.roomTheme,
      );
      const safeTarget = canonicalWatchPartyInvite(target, window.location.origin);
      if (!safeTarget) throw new Error('Некорректная ссылка комнаты.');
      if (controller.signal.aborted || !mountedRef.current) return;

      trackProductClientEvent('watch_party_public_join_click', {
        source: 'home_watch_together', path: '/', entityType: 'watch_party_room',
        entityId: room.roomId,
        metadata: { anime_id: room.animeId, episode: room.episode, participant_count: room.participantCount },
        flush: true,
      });
      window.location.assign(safeTarget);
    } catch (cause) {
      if (!mountedRef.current) return;
      setError(controller.signal.aborted
        ? 'Превышено время ожидания. Повтори попытку.'
        : cause instanceof Error ? cause.message : 'Не удалось войти в комнату.');
    } finally {
      window.clearTimeout(timeout);
      if (joinRef.current === controller) joinRef.current = null;
      joinBusyRef.current = false;
      if (mountedRef.current) setJoiningId(null);
    }
  }

  return (
    <div ref={lobbyRef} className={styles.lobby} aria-busy={loading}>
      {loading ? (
        <div className={styles.empty} role="status">Ищем открытые комнаты…</div>
      ) : rooms.length ? (
        <section ref={impressionRef} className={styles.roomGrid} aria-label="Доступные комнаты">
          {rooms.map((room) => {
            const cover = safeCover(room.coverUrl);
            return (
              <article className={styles.roomCard} key={room.roomId}>
                <div className={styles.poster}>
                  <AnimeImage
                    image={cover ? { medium: cover } : null}
                    alt={room.animeTitle}
                    englishName={room.animeTitle}
                    sizes="76px"
                    loading="lazy"
                    preset="tiny"
                    quality={60}
                    sourcePreference="compact"
                  />
                </div>
                <div className={styles.roomCopy}>
                  <span className={styles.roomStatus}>
                    {activityLabel(room.status)} · {room.participantCount} участников
                  </span>
                  <h3 title={room.animeTitle}>{room.animeTitle}</h3>
                  <p>Серия {room.episode} · {room.host.username}</p>
                  <button
                    type="button"
                    className={styles.joinButton}
                    onClick={() => { void joinRoom(room); }}
                    disabled={Boolean(joiningId) || authLoading}
                  >
                    {joiningId === room.roomId ? 'Подключаем…' : 'Присоединиться →'}
                  </button>
                </div>
              </article>
            );
          })}
        </section>
      ) : (
        <section ref={impressionRef} className={styles.empty} aria-label="Состояние комнат">
          <span className={styles.emptyIcon} aria-hidden="true">✦</span>
          <strong>{degraded ? 'Совместные просмотры временно недоступны' : 'Сейчас нет открытых комнат'}</strong>
          <p>Начни свою комнату и пригласи друзей — живой просмотр начинается с одного приглашения.</p>
        </section>
      )}

      {error && (
        <div className={styles.error} role="status">
          <span>{error}</span>
          <button type="button" onClick={() => { void refresh(true); }}>Повторить</button>
        </div>
      )}
    </div>
  );
}
