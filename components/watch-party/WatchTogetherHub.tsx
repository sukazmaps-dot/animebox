'use client';

import {
  type CSSProperties,
  type FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import Link from 'next/link';

import AnimeImage from '@/components/AnimeImage';
import Icon from '@/components/Icon';
import TelegramPromoCard from '@/components/TelegramPromoCard';
import { useAuthState } from '@/components/AuthStateProvider';
import { getPremiumMe } from '@/lib/entitlements-client';
import { trackProductClientEvent } from '@/lib/product-events-client';
import { getAnimes, isAbortError } from '@/lib/anime-client';
import { getAnimeTitle } from '@/lib/anime-display';
import { formatAnimeScore } from '@/lib/anime-score';
import { parseAnimeSearchIntent } from '@/lib/search-intent';
import {
  buildWatchPartyUrl,
  claimWatchPartyHostTab,
  createWatchPartyInvite,
  watchPartyHostSessionKey,
  watchPartyTheaterPath,
} from '@/lib/watch-party';
import {
  WATCH_PARTY_THEMES,
  WATCH_PARTY_THEME_META,
  type WatchPartyTheme,
} from '@/lib/watch-party-premium';
import type { Anime } from '@/types/anime';

import styles from './WatchTogetherHub.module.css';
import { canonicalWatchPartyInvite, normalizeWatchPartyCode, isWatchPartyJoinSnapshot } from '@/lib/watch-party-entry';
import { requestWatchPartyJson } from '@/lib/watch-party-request';

const LAST_ROOM_KEY = 'animebox:watch-together:last-room:v1';
const ROOM_REFRESH_VISIBLE_MS = 20_000;
const ROOM_REFRESH_MIN_GAP_MS = 4_000;

type PublicWatchPartyRoom = {
  roomId: string;
  roomCode: string;
  roomTheme: WatchPartyTheme;
  animeId: number | null;
  animeSlug: string;
  animeTitle: string;
  coverUrl: string | null;
  episode: number;
  visibility: 'public';
  status: 'waiting' | 'watching' | 'paused' | 'voting';
  language: string;
  participantCount: number;
  maxParticipants: number;
  host: {
    id: string;
    username: string;
  };
  createdAt: string;
  updatedAt: string;
  lastHeartbeatAt: string;
  expiresAt: string;
  isFull: boolean;
};

type PublicRoomsResponse = {
  rooms?: PublicWatchPartyRoom[];
  error?: string;
};

type ResolvedWatchPartyRoom = {
  roomId: string;
  joinSecret: string;
  roomCode: string;
  roomTheme: WatchPartyTheme;
  animeSlug: string;
  animeTitle: string;
  episode: number;
  visibility: 'public' | 'unlisted';
  status: 'waiting' | 'watching' | 'paused' | 'voting';
  participantCount: number;
  maxParticipants: number;
};

type ResolveRoomResponse = {
  ok?: boolean;
  room?: ResolvedWatchPartyRoom;
  error?: string;
};

type RoomVisibility = 'public' | 'unlisted' | 'private';
type RoomSort = 'popular' | 'recent' | 'available';

const VISIBILITY_OPTIONS = [
  ['unlisted', 'По ссылке', 'Видна только тем, у кого есть ссылка'],
  ['public', 'Открытая', 'Появится в списке «Сейчас смотрят»'],
  ['private', 'Приватная', 'Только по приглашению'],
] as const;

const LOGIN_HREF = '/login?next=' + encodeURIComponent('/watch-together');

function roomStatusLabel(status: PublicWatchPartyRoom['status']) {
  if (status === 'watching') return 'Смотрят сейчас';
  if (status === 'paused') return 'На паузе';
  if (status === 'voting') return 'Голосуют';
  return 'Ждут участников';
}

function roomAgeLabel(createdAt: string) {
  const created = new Date(createdAt).getTime();
  if (!Number.isFinite(created)) return 'только что';
  const minutes = Math.max(0, Math.floor((Date.now() - created) / 60_000));
  if (minutes < 1) return 'только что';
  if (minutes < 60) return `${minutes} мин назад`;
  const hours = Math.floor(minutes / 60);
  return `${hours} ч назад`;
}

function animeCoverUrl(anime: Anime | null) {
  if (!anime) return null;
  return (
    anime.coverImage?.extraLarge ||
    anime.coverImage?.large ||
    anime.coverImage?.medium ||
    anime.image?.original ||
    anime.image?.large ||
    anime.image?.medium ||
    anime.image?.preview ||
    null
  );
}


function episodeLimit(anime: Anime | null) {
  if (!anime) return 1;
  return Math.max(1, Number(anime.episodesAired || 0), Number(anime.episodes || 0));
}

function safeEpisode(value: number, anime: Anime | null) {
  const parsed = Number.isSafeInteger(value) ? value : 1;
  return Math.max(1, Math.min(episodeLimit(anime), parsed));
}

function validInviteUrl(value: string) {
  return canonicalWatchPartyInvite(value, window.location.origin);
}

export default function WatchTogetherHub() {
  const { user, loading: authLoading } = useAuthState();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Anime[]>([]);
  const [selected, setSelected] = useState<Anime | null>(null);
  const [episode, setEpisode] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [inviteInput, setInviteInput] = useState('');
  const [inviteError, setInviteError] = useState('');
  const [visibility, setVisibility] = useState<RoomVisibility>('unlisted');
  const [roomTheme, setRoomTheme] = useState<WatchPartyTheme>('default');
  const [premiumRoomThemes, setPremiumRoomThemes] = useState(false);
  const [premiumStateLoading, setPremiumStateLoading] = useState(Boolean(user?.id));
  const [rooms, setRooms] = useState<PublicWatchPartyRoom[]>([]);
  const [roomsLoading, setRoomsLoading] = useState(true);
  const [roomsError, setRoomsError] = useState('');
  const [roomsNotice, setRoomsNotice] = useState('');
  const [roomSort, setRoomSort] = useState<RoomSort>('popular');
  const [createError, setCreateError] = useState('');
  const [joiningRoomId, setJoiningRoomId] = useState<string | null>(null);
  const [joinPending, setJoinPending] = useState(false);
  const entryRequestRef = useRef<AbortController | null>(null);
  const entryBusyRef = useRef(false);
  useEffect(() => () => { entryRequestRef.current?.abort(); }, []);
  const roomRequestRef = useRef<AbortController | null>(null);
  const lastRoomRefreshAtRef = useRef(0);
  const [creatingRoom, setCreatingRoom] = useState(false);
  const lastRoom = useSyncExternalStore(
    (onStoreChange) => {
      const onStorage = (event: StorageEvent) => {
        if (event.key === LAST_ROOM_KEY) onStoreChange();
      };

      window.addEventListener('storage', onStorage);
      return () => window.removeEventListener('storage', onStorage);
    },
    () => {
      try {
        const stored = window.localStorage.getItem(LAST_ROOM_KEY);
        return stored && validInviteUrl(stored) ? stored : null;
      } catch {
        return null;
      }
    },
    () => null,
  );

  useEffect(() => {
    let active = true;

    if (!user?.id) {
      queueMicrotask(() => {
        if (!active) return;
        setPremiumRoomThemes(false);
        setPremiumStateLoading(false);
        setRoomTheme('default');
      });
      return () => {
        active = false;
      };
    }

    queueMicrotask(() => {
      if (active) setPremiumStateLoading(true);
    });

    void getPremiumMe({ force: true })
      .then((premium) => {
        if (!active) return;
        const allowed = Boolean(
          premium.premium && premium.entitlements.watchPartyThemes,
        );
        setPremiumRoomThemes(allowed);
        if (!allowed) setRoomTheme('default');
      })
      .catch(() => {
        if (!active) return;
        setPremiumRoomThemes(false);
        setRoomTheme('default');
      })
      .finally(() => {
        if (active) setPremiumStateLoading(false);
      });

    return () => {
      active = false;
    };
  }, [user?.id]);

  const intent = useMemo(
    () => (query.trim() ? parseAnimeSearchIntent(query.trim()) : null),
    [query],
  );

  const visibleRooms = useMemo(() => {
    const filtered = rooms.filter((room) => roomSort !== 'available' || !room.isFull);

    return [...filtered].sort((left, right) => {
      if (roomSort === 'recent') {
        return new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime();
      }

      if (roomSort === 'available') {
        const leftSpots = left.maxParticipants - left.participantCount;
        const rightSpots = right.maxParticipants - right.participantCount;
        return rightSpots - leftSpots ||
          new Date(right.lastHeartbeatAt).getTime() - new Date(left.lastHeartbeatAt).getTime();
      }

      return right.participantCount - left.participantCount ||
        Number(right.status === 'watching') - Number(left.status === 'watching') ||
        new Date(right.lastHeartbeatAt).getTime() - new Date(left.lastHeartbeatAt).getTime();
    });
  }, [roomSort, rooms]);

  const viewerCount = useMemo(
    () => rooms.reduce((sum, room) => sum + room.participantCount, 0),
    [rooms],
  );

  const loadPublicRooms = useCallback(async (force = false) => {
    const now = Date.now();
    if (
      !force &&
      now - lastRoomRefreshAtRef.current < ROOM_REFRESH_MIN_GAP_MS
    ) {
      return;
    }

    roomRequestRef.current?.abort();
    const controller = new AbortController();
    roomRequestRef.current = controller;
    lastRoomRefreshAtRef.current = now;
    setRoomsLoading(true);

    try {
      const response = await fetch('/api/watch-party/rooms?limit=30', {
        headers: { Accept: 'application/json' },
        signal: controller.signal,
        cache: 'no-store',
      });
      const payload = (await response.json()) as PublicRoomsResponse;
      if (!response.ok) throw new Error(payload.error || 'rooms_failed');
      if (controller.signal.aborted) return;
      setRooms(payload.rooms ?? []);
      setRoomsError('');
    } catch {
      if (controller.signal.aborted) return;
      setRoomsError('Не удалось обновить список открытых комнат.');
    } finally {
      if (roomRequestRef.current === controller) {
        roomRequestRef.current = null;
      }
      if (!controller.signal.aborted) setRoomsLoading(false);
    }
  }, []);

  useEffect(() => {
    const refreshIfVisible = () => {
      if (document.visibilityState !== 'visible') return;
      void loadPublicRooms();
    };

    const initialTimer = window.setTimeout(refreshIfVisible, 0);
    const timer = window.setInterval(
      refreshIfVisible,
      ROOM_REFRESH_VISIBLE_MS,
    );

    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        void loadPublicRooms(true);
      }
    };

    document.addEventListener('visibilitychange', onVisibilityChange);
    window.addEventListener('focus', refreshIfVisible);

    return () => {
      window.clearTimeout(initialTimer);
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener('focus', refreshIfVisible);
      roomRequestRef.current?.abort();
      roomRequestRef.current = null;
    };
  }, [loadPublicRooms]);


  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setLoading(true);
      setError('');

      void getAnimes(
        {
          search: query.trim() || undefined,
          page: 1,
          limit: query.trim() ? 12 : 8,
          order: 'ranked',
        },
        { signal: controller.signal },
      )
        .then((anime) => {
          if (controller.signal.aborted) return;
          setResults(anime);
        })
        .catch((loadError) => {
          if (isAbortError(loadError)) return;
          setResults([]);
          setError('Не удалось загрузить аниме. Попробуй ещё раз.');
        })
        .finally(() => {
          if (!controller.signal.aborted) setLoading(false);
        });
    }, query.trim() ? 320 : 0);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [query]);

  function chooseAnime(anime: Anime) {
    setSelected(anime);
    setEpisode(1);
  }

  async function createRoom() {
    if (!selected || creatingRoom || entryBusyRef.current) return;

    if (!user?.id) {
      setCreateError('Войди в AnimeBox, чтобы создать комнату.');
      return;
    }

    entryBusyRef.current = true;
    const controller = new AbortController();
    entryRequestRef.current = controller;
    setCreatingRoom(true);
    setCreateError('');

    try {
      const selectedEpisode = safeEpisode(episode, selected);
      const invite = createWatchPartyInvite();
      const slug = selected.slug || String(selected.id);
      const target = watchPartyTheaterPath(slug, selectedEpisode);
      const roomUrl = buildWatchPartyUrl(invite, target, roomTheme);

      const { response, payload } = await requestWatchPartyJson<{ error?: string }>('/api/watch-party/rooms', {
        signal: controller.signal,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({
          roomId: invite.roomId,
          joinSecret: invite.secret,
          animeId: selected.id,
          animeSlug: slug,
          animeTitle: getAnimeTitle(selected),
          coverUrl: animeCoverUrl(selected),
          episode: selectedEpisode,
          visibility,
          roomTheme,
          language: 'ru',
        }),
        cache: 'no-store',
      });

      if (controller.signal.aborted) return;
      if (!response.ok) {
        throw new Error(payload.error || 'Не удалось зарегистрировать комнату.');
      }

      try {
        sessionStorage.setItem(watchPartyHostSessionKey(invite.roomId), invite.secret);
        claimWatchPartyHostTab(invite);
      } catch {
        claimWatchPartyHostTab(invite);
      }

      try {
        window.localStorage.setItem(LAST_ROOM_KEY, roomUrl);
      } catch {
        // Resume shortcut is optional.
      }

      // Clipboard is opportunistic only. Some mobile browsers can keep
      // writeText() pending behind a permission prompt, which used to leave the
      // create button spinning even though the room was already registered.
      try {
        void navigator.clipboard?.writeText(roomUrl).catch(() => undefined);
      } catch {
        // The room itself has a dedicated copy button if clipboard permission is denied.
      }

      trackProductClientEvent('watch_party_room_created', {
        source: 'watch_together_hub',
        path: '/watch-together',
        entityType: 'watch_party_room',
        entityId: invite.roomId,
        metadata: {
          anime_id: selected.id,
          episode: selectedEpisode,
          visibility,
          room_theme: roomTheme,
        },
        flush: true,
      });

      window.location.assign(roomUrl);
    } catch (error) {
      if (controller.signal.aborted) return;
      setCreateError(
        error instanceof Error ? error.message : 'Не удалось создать комнату.',
      );
    } finally {
      entryBusyRef.current = false;
      if (entryRequestRef.current === controller) entryRequestRef.current = null;
      if (!controller.signal.aborted) setCreatingRoom(false);
    }
  }

  async function reportRoom(roomId: string) {
    if (!user?.id) {
      setRoomsError('Войди в AnimeBox, чтобы отправить жалобу.');
      return;
    }

    const reason = window.prompt('Что не так с этой комнатой?')?.trim();
    if (!reason) return;

    try {
      const response = await fetch(
        `/api/watch-party/rooms/${encodeURIComponent(roomId)}/report`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ reason }),
          cache: 'no-store',
        },
      );
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(payload.error || 'report_failed');
      setRoomsNotice('Жалоба отправлена модерации AnimeBox.');
      window.setTimeout(() => setRoomsNotice(''), 4_000);
    } catch (error) {
      setRoomsNotice(
        error instanceof Error ? error.message : 'Не удалось отправить жалобу.',
      );
      window.setTimeout(() => setRoomsNotice(''), 4_000);
    }
  }

  async function resolveRoomTarget(input: {
    roomId?: string;
    code?: string;
  }, signal?: AbortSignal) {
    const params = new URLSearchParams();
    if (input.roomId) params.set('roomId', input.roomId);
    if (input.code) params.set('code', input.code);

    const { response, payload } = await requestWatchPartyJson<ResolveRoomResponse>(
      `/api/watch-party/rooms/resolve?${params.toString()}`,
      {
        headers: { Accept: 'application/json' },
        signal,
        cache: 'no-store',
      },
    );

    if (!response.ok || !payload.room) {
      throw new Error(payload.error || 'Активная комната не найдена.');
    }

    const room = payload.room;
    if (!isWatchPartyJoinSnapshot(room)) throw new Error('Сервер вернул некорректные данные комнаты.');
    const target = buildWatchPartyUrl(
      { roomId: room.roomId, secret: room.joinSecret },
      watchPartyTheaterPath(room.animeSlug, room.episode),
      room.roomTheme,
    );

    const safeTarget = validInviteUrl(target);
    if (!safeTarget) throw new Error('Сервер вернул некорректную ссылку комнаты.');
    if (room.participantCount >= room.maxParticipants) throw new Error('Комната заполнена. Выбери другую.');
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    try {
      window.localStorage.setItem(LAST_ROOM_KEY, safeTarget);
    } catch {
      // Resume shortcut is optional.
    }

    return { target: safeTarget, room };
  }

  async function joinPublicRoom(room: PublicWatchPartyRoom) {
    if (room.isFull || joiningRoomId || joinPending || entryBusyRef.current) return;

    if (!user?.id) {
      setRoomsNotice('Войди в AnimeBox, чтобы присоединиться к комнате.');
      window.setTimeout(() => setRoomsNotice(''), 4_000);
      return;
    }

    entryBusyRef.current = true;
    const controller = new AbortController();
    entryRequestRef.current = controller;
    setJoiningRoomId(room.roomId);
    setRoomsNotice('');

    try {
      const resolved = await resolveRoomTarget({ roomId: room.roomId }, controller.signal);

      trackProductClientEvent('watch_party_public_join_click', {
        source: 'watch_together_hub',
        path: '/watch-together',
        entityType: 'watch_party_room',
        entityId: room.roomId,
        metadata: {
          anime_id: room.animeId,
          episode: room.episode,
          participant_count: room.participantCount,
          sort: roomSort,
          room_code: room.roomCode,
        },
        flush: true,
      });

      window.location.assign(resolved.target);
    } catch (joinError) {
      if (controller.signal.aborted) return;
      setRoomsNotice(
        joinError instanceof Error
          ? joinError.message
          : 'Не удалось войти в комнату.',
      );
      setJoiningRoomId(null);
      window.setTimeout(() => setRoomsNotice(''), 4_000);
    } finally {
      entryBusyRef.current = false;
      if (entryRequestRef.current === controller) entryRequestRef.current = null;
      if (!controller.signal.aborted) setJoiningRoomId(null);
    }
  }

  async function joinInvite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (joinPending || entryBusyRef.current) return;

    setInviteError('');
    const raw = inviteInput.trim();
    const directTarget = validInviteUrl(raw);

    if (directTarget) {
      window.location.assign(directTarget);
      return;
    }

    const code = normalizeWatchPartyCode(raw);
    if (!code) {
      setInviteError('Вставь invite-ссылку или шестизначный код комнаты.');
      return;
    }

    if (!user?.id) {
      setInviteError('Войди в AnimeBox, чтобы войти по коду комнаты.');
      return;
    }

    entryBusyRef.current = true;
    const controller = new AbortController();
    entryRequestRef.current = controller;
    setJoinPending(true);
    try {
      const resolved = await resolveRoomTarget({ code }, controller.signal);
      trackProductClientEvent('watch_party_code_joined', {
        source: 'watch_together_hub',
        path: '/watch-together',
        entityType: 'watch_party_room',
        entityId: resolved.room.roomId,
        metadata: {
          room_code: code,
          episode: resolved.room.episode,
        },
        flush: true,
      });
      window.location.assign(resolved.target);
    } catch (joinError) {
      if (controller.signal.aborted) return;
      setInviteError(
        joinError instanceof Error
          ? joinError.message
          : 'Не удалось войти по коду комнаты.',
      );
    } finally {
      entryBusyRef.current = false;
      if (entryRequestRef.current === controller) entryRequestRef.current = null;
      if (!controller.signal.aborted) setJoinPending(false);
    }
  }

  const selectedVisibility = VISIBILITY_OPTIONS.find(([value]) => value === visibility);
  const showRoomTabs = rooms.length > 3;
  const showRoomsSection = (roomsLoading && rooms.length === 0) || rooms.length > 0 || Boolean(roomsError);

  return (
    <main className={styles.v2Page} data-dock={selected ? 'open' : undefined}>
      <header className={styles.v2Head}>
        <div className={styles.v2HeadCopy}>
          <h1>Смотри аниме вместе с друзьями</h1>
          <p>Выбери тайтл — и получи ссылку для друзей. Пауза и перемотка синхронны, есть чат.</p>
        </div>

        <form className={styles.v2Join} onSubmit={joinInvite}>
          <label htmlFor="wt-invite">Есть ссылка или код?</label>
          <div className={styles.v2JoinRow}>
            <input
              id="wt-invite"
              aria-label="Ссылка или код комнаты"
              aria-describedby={inviteError ? 'room-invite-error' : undefined}
              aria-invalid={Boolean(inviteError)}
              maxLength={2048}
              value={inviteInput}
              onChange={(event) => setInviteInput(event.target.value)}
              placeholder="Код ABC234 или ссылка"
              autoComplete="off"
              autoCapitalize="characters"
              enterKeyHint="go"
            />
            <button type="submit" disabled={joinPending || !inviteInput.trim()}>
              {joinPending ? 'Ищем…' : 'Войти'}
            </button>
          </div>
          {inviteError && (
            <span id="room-invite-error" role="alert" className={styles.v2Error}>{inviteError}</span>
          )}
          {lastRoom && (
            <a className={styles.v2Resume} href={lastRoom}>
              Вернуться в последнюю комнату <Icon name="chevron" />
            </a>
          )}
        </form>
      </header>

      <section id="create-room" className={styles.v2Pick} aria-labelledby="wt-pick-title">
        <div className={styles.v2PickTop}>
          <h2 id="wt-pick-title">Что будем смотреть?</h2>
          <label className={styles.v2Search}>
            <Icon name="search" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Название аниме"
              autoComplete="off"
              enterKeyHint="search"
              aria-label="Поиск аниме для совместного просмотра"
            />
            {query && (
              <button type="button" onClick={() => setQuery('')} aria-label="Очистить поиск">×</button>
            )}
          </label>
        </div>

        {intent && intent.titleQuery !== intent.normalized && (
          <div className={styles.v2Intent}>
            Ищем: <strong>{intent.titleQuery}</strong>
            {intent.seasonNumber ? <span>сезон {intent.seasonNumber}</span> : null}
            {intent.partNumber ? <span>часть {intent.partNumber}</span> : null}
            {intent.episodeNumber ? <span>серия {intent.episodeNumber}</span> : null}
          </div>
        )}

        {loading ? (
          <div className={styles.v2Grid} aria-busy="true" aria-label="Загружаем тайтлы">
            {Array.from({ length: 8 }, (_, index) => (
              <span className={styles.v2Skeleton} key={index} />
            ))}
          </div>
        ) : error ? (
          <div className={styles.v2Empty}>{error}</div>
        ) : results.length ? (
          <div className={styles.v2Grid}>
            {results.map((anime) => {
              const title = getAnimeTitle(anime);
              const active = selected?.id === anime.id;

              return (
                <button
                  type="button"
                  className={styles.v2Card}
                  data-active={active ? 'true' : undefined}
                  aria-pressed={active}
                  key={anime.id}
                  onClick={() => chooseAnime(anime)}
                >
                  <span className={styles.v2Poster}>
                    <AnimeImage
                      image={anime.coverImage}
                      alt={title}
                      englishName={anime.title?.english || anime.title?.romaji}
                    />
                    <b>★ {formatAnimeScore(anime) ?? '—'}</b>
                    {active && <i aria-hidden="true">✓</i>}
                  </span>
                  <strong>{title}</strong>
                  <small>{anime.episodesAired || anime.episodes || '?'} эп.</small>
                </button>
              );
            })}
          </div>
        ) : (
          <div className={styles.v2Empty}>Ничего не нашли. Попробуй написать название короче.</div>
        )}

        <Link className={styles.v2More} href="/search">Весь каталог →</Link>
      </section>

      {selected && (
        <aside className={styles.v2Dock} aria-label="Настройки комнаты">
          <div className={styles.v2DockHead}>
            <span className={styles.v2DockPoster}>
              <AnimeImage
                image={selected.coverImage}
                alt=""
                englishName={selected.title?.english || selected.title?.romaji}
              />
            </span>
            <div className={styles.v2DockTitle}>
              <strong>{getAnimeTitle(selected)}</strong>
              <small>Серия {episode} из {episodeLimit(selected)}</small>
            </div>
            <button
              type="button"
              className={styles.v2DockClose}
              onClick={() => setSelected(null)}
              aria-label="Убрать выбор"
            >
              ×
            </button>
          </div>

          <div className={styles.v2DockBody}>
            <div className={styles.v2Stepper} role="group" aria-label="Серия">
              <button
                type="button"
                disabled={episode <= 1}
                onClick={() => setEpisode((current) => Math.max(1, current - 1))}
                aria-label="Предыдущая серия"
              >−</button>
              <input
                type="number"
                inputMode="numeric"
                min={1}
                max={episodeLimit(selected)}
                value={episode}
                aria-label="Номер серии"
                onChange={(event) => setEpisode(safeEpisode(Number(event.target.value), selected))}
              />
              <button
                type="button"
                disabled={episode >= episodeLimit(selected)}
                onClick={() => setEpisode((current) => Math.min(episodeLimit(selected), current + 1))}
                aria-label="Следующая серия"
              >+</button>
            </div>

            <div className={styles.v2Segment} role="radiogroup" aria-label="Кто может найти комнату">
              {VISIBILITY_OPTIONS.map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  role="radio"
                  aria-checked={visibility === value}
                  data-active={visibility === value}
                  onClick={() => setVisibility(value)}
                >
                  {label}
                </button>
              ))}
            </div>

            {!authLoading && !user?.id ? (
              <Link className={styles.v2Create} href={LOGIN_HREF}>
                Войти и создать комнату
              </Link>
            ) : (
              <button
                type="button"
                className={styles.v2Create}
                disabled={creatingRoom || authLoading}
                onClick={() => void createRoom()}
              >
                {creatingRoom ? 'Создаём…' : authLoading ? 'Проверяем вход…' : 'Создать комнату'}
              </button>
            )}
          </div>

          <p className={styles.v2Hint}>{selectedVisibility?.[2]}</p>
          {createError && <div className={styles.v2Error} role="alert">{createError}</div>}

          <details className={styles.v2Themes} data-component="premiumThemePicker">
            <summary>
              Оформление комнаты
              {roomTheme !== 'default' && <em>{WATCH_PARTY_THEME_META[roomTheme].label}</em>}
            </summary>

            <div className={styles.v2ThemeGrid}>
              {WATCH_PARTY_THEMES.map((theme) => {
                const meta = WATCH_PARTY_THEME_META[theme];
                const locked = meta.premium && !premiumRoomThemes;

                return (
                  <button
                    key={theme}
                    type="button"
                    data-theme={theme}
                    data-active={roomTheme === theme}
                    data-locked={locked || undefined}
                    disabled={premiumStateLoading || locked}
                    title={meta.description}
                    onClick={() => {
                      setRoomTheme(theme);
                      if (theme !== 'default') {
                        trackProductClientEvent(
                          'premium_watch_party_theme_selected',
                          {
                            source: 'watch_together_hub',
                            path: '/watch-together',
                            entityType: 'watch_party_theme',
                            entityId: theme,
                          },
                        );
                      }
                    }}
                  >
                    <i style={{ '--room-theme-accent': meta.accent } as CSSProperties} />
                    {meta.label}
                    {locked && <b aria-hidden="true">✦</b>}
                  </button>
                );
              })}
            </div>

            {!premiumStateLoading && !premiumRoomThemes && (
              <Link className={styles.v2Link} href="/premium">Больше тем — в AnimeBox Premium →</Link>
            )}
          </details>
        </aside>
      )}

      {showRoomsSection && (
        <section id="public-rooms" className={styles.v2Rooms} aria-labelledby="public-rooms-title">
          <div className={styles.v2RoomsTop}>
            <h2 id="public-rooms-title">
              Сейчас смотрят вместе
              {viewerCount > 0 && <span>{viewerCount}</span>}
            </h2>
            {showRoomTabs && (
              <div className={styles.v2Tabs} role="group" aria-label="Сортировка комнат">
                {([
                  ['popular', 'Популярные'],
                  ['recent', 'Новые'],
                  ['available', 'Есть места'],
                ] as const).map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    aria-pressed={roomSort === value}
                    data-active={roomSort === value}
                    onClick={() => setRoomSort(value)}
                  >
                    {label}
                  </button>
                ))}
              </div>
            )}
          </div>

          {roomsNotice && <div className={styles.v2Notice} role="status">{roomsNotice}</div>}

          {roomsLoading && rooms.length === 0 ? (
            <div className={styles.v2RoomList} aria-busy="true">
              {Array.from({ length: 3 }, (_, index) => (
                <span className={styles.v2RoomSkeleton} key={index} />
              ))}
            </div>
          ) : roomsError && rooms.length === 0 ? (
            <div className={styles.v2Empty}>
              {roomsError}{' '}
              <button type="button" className={styles.v2Link} onClick={() => void loadPublicRooms(true)}>
                Повторить
              </button>
            </div>
          ) : (
            <div className={styles.v2RoomList}>
              {visibleRooms.map((room) => (
                <article
                  className={styles.v2Room}
                  data-full={room.isFull ? 'true' : undefined}
                  key={room.roomId}
                >
                  <span className={styles.v2RoomPoster}>
                    {room.coverUrl ? (
                      // Public room artwork can come from AniList/Shikimori/CDN hosts outside Next Image's allowlist.
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={room.coverUrl} alt="" loading="lazy" />
                    ) : (
                      <span>AB</span>
                    )}
                  </span>

                  <div className={styles.v2RoomCopy}>
                    <h3>{room.animeTitle}</h3>
                    <p>Серия {room.episode} · {room.host.username}</p>
                    <p className={styles.v2RoomMeta}>
                      <span data-status={room.status}>
                        <i aria-hidden="true" />
                        {roomStatusLabel(room.status)}
                      </span>
                      <span>{room.participantCount}/{room.maxParticipants}</span>
                      <span>{roomAgeLabel(room.createdAt)}</span>
                    </p>
                  </div>

                  <div className={styles.v2RoomActions}>
                    {room.isFull ? (
                      <span className={styles.v2Full}>Заполнена</span>
                    ) : (
                      <button
                        type="button"
                        className={styles.v2JoinBtn}
                        onClick={() => void joinPublicRoom(room)}
                        disabled={joiningRoomId !== null}
                      >
                        {joiningRoomId === room.roomId ? 'Подключаем…' : 'Войти'}
                      </button>
                    )}
                    <button
                      type="button"
                      className={styles.v2Kebab}
                      onClick={() => void reportRoom(room.roomId)}
                      aria-label="Пожаловаться на комнату"
                      title="Пожаловаться"
                    >
                      ···
                    </button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      )}

      <TelegramPromoCard placement="watch_together" />

      <section className={styles.v2Seo} aria-labelledby="watch-together-guide">
        <h2 id="watch-together-guide">Как смотреть аниме вместе с другом онлайн</h2>
        <p>
          Watch Together в AnimeBox создан для совместного просмотра аниме через интернет.
          Выберите тайтл и серию, создайте комнату и отправьте ссылку друзьям —
          участники смогут смотреть одну серию вместе, даже находясь на расстоянии.
        </p>
        <ol>
          <li><strong>Выберите аниме.</strong> Найдите нужный тайтл в каталоге AnimeBox и укажите серию для совместного просмотра.</li>
          <li><strong>Создайте комнату.</strong> AnimeBox создаст Watch Together комнату выбранной видимости и подготовит invite-ссылку.</li>
          <li><strong>Пригласите друзей.</strong> Отправьте ссылку другу и смотрите аниме синхронно с общим управлением и чатом.</li>
        </ol>
        <h3>Смотреть аниме вместе, даже если вы далеко</h3>
        <p>
          Совместный просмотр не требует находиться рядом. Комната работает через интернет:
          можно запустить аниме вдвоём или собрать друзей и продолжить просмотр с разных устройств.
        </p>
        <h3>Смотреть видео вместе с другом — без лишней настройки</h3>
        <p>
          Если речь об аниме из каталога AnimeBox, отдельный сервис не нужен. Watch Together
          объединяет выбор серии, приватное приглашение, синхронное управление и чат в одном месте.
        </p>

        <h2>Вопросы о Watch Together</h2>
        <div className={styles.v2Faq}>
          <details>
            <summary>Как смотреть аниме вместе с другом онлайн?</summary>
            <p>Откройте Watch Together, выберите аниме и серию, создайте комнату и отправьте друзьям invite-ссылку или откройте её в публичном lobby.</p>
          </details>
          <details>
            <summary>Можно ли смотреть аниме вместе на расстоянии?</summary>
            <p>Да. Комната работает через интернет, поэтому участники могут смотреть одну серию вместе, находясь в разных местах.</p>
          </details>
          <details>
            <summary>Синхронизируются ли пауза и перемотка?</summary>
            <p>Watch Together синхронизирует управление просмотром между участниками комнаты: воспроизведение, паузу и перемотку.</p>
          </details>
          <details>
            <summary>Сколько человек может смотреть вместе?</summary>
            <p>Одна комната AnimeBox Watch Together рассчитана максимум на 50 участников. Видео каждый зритель получает напрямую от плеера, а AnimeBox синхронизирует только лёгкие события комнаты.</p>
          </details>
          <details>
            <summary>Нужен ли отдельный сервис, чтобы смотреть видео вместе с другом?</summary>
            <p>Для аниме из каталога AnimeBox отдельный сервис не нужен: выберите тайтл в Watch Together и создайте комнату.</p>
          </details>
        </div>
      </section>
    </main>
  );
}
