'use client';

import { type FormEvent, useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import Link from 'next/link';

import AnimeImage from '@/components/AnimeImage';
import Icon from '@/components/Icon';
import AnimeBoxLoader from '@/components/ui/AnimeBoxLoader';
import { useAuthState } from '@/components/AuthStateProvider';
import { trackProductClientEvent } from '@/lib/product-events-client';
import { getAnimes, isAbortError } from '@/lib/anime-client';
import { getAnimeOriginalTitle, getAnimeTitle } from '@/lib/anime-display';
import { parseAnimeSearchIntent } from '@/lib/search-intent';
import {
  buildWatchPartyUrl,
  claimWatchPartyHostTab,
  createWatchPartyInvite,
  isWatchPartyRoomId,
  isWatchPartySecret,
  watchPartyHostSessionKey,
  watchPartyTheaterPath,
} from '@/lib/watch-party';
import type { Anime } from '@/types/anime';

import styles from './WatchTogetherHub.module.css';

const LAST_ROOM_KEY = 'animebox:watch-together:last-room:v1';

type PublicWatchPartyRoom = {
  roomId: string;
  joinSecret: string;
  roomCode: string;
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

type RoomVisibility = 'public' | 'unlisted' | 'private';
type RoomSort = 'popular' | 'recent' | 'available';

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
  try {
    const url = new URL(value, window.location.origin);
    const ownHost = url.origin === window.location.origin;
    const productionHost = url.protocol === 'https:' && ['youranimebox.com', 'www.youranimebox.com'].includes(url.hostname);
    const pathMatch = /^\/watch-together\/[^/]+\/episode\/\d+$/u.test(url.pathname);
    const roomId = url.searchParams.get('party');
    const hash = new URLSearchParams(url.hash.replace(/^#/, ''));
    const secret = hash.get('partyKey');

    return (ownHost || productionHost) && pathMatch && isWatchPartyRoomId(roomId) && isWatchPartySecret(secret)
      ? url.toString()
      : null;
  } catch {
    return null;
  }
}

export default function WatchTogetherHub() {
  const { user } = useAuthState();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Anime[]>([]);
  const [selected, setSelected] = useState<Anime | null>(null);
  const [episode, setEpisode] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [inviteInput, setInviteInput] = useState('');
  const [inviteError, setInviteError] = useState('');
  const [visibility, setVisibility] = useState<RoomVisibility>('unlisted');
  const [rooms, setRooms] = useState<PublicWatchPartyRoom[]>([]);
  const [roomsLoading, setRoomsLoading] = useState(true);
  const [roomsError, setRoomsError] = useState('');
  const [roomsNotice, setRoomsNotice] = useState('');
  const [roomSearch, setRoomSearch] = useState('');
  const [roomSort, setRoomSort] = useState<RoomSort>('popular');
  const [lastRoomsRefreshAt, setLastRoomsRefreshAt] = useState<number | null>(null);
  const [createError, setCreateError] = useState('');
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

  const intent = useMemo(
    () => (query.trim() ? parseAnimeSearchIntent(query.trim()) : null),
    [query],
  );

  const visibleRooms = useMemo(() => {
    const needle = roomSearch.trim().toLocaleLowerCase('ru-RU');
    const filtered = rooms.filter((room) => {
      if (roomSort === 'available' && room.isFull) return false;
      if (!needle) return true;
      return [
        room.animeTitle,
        room.host.username,
        room.roomCode,
        String(room.episode),
      ].some((value) => value.toLocaleLowerCase('ru-RU').includes(needle));
    });

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
  }, [roomSearch, roomSort, rooms]);

  const roomStats = useMemo(() => ({
    rooms: rooms.length,
    viewers: rooms.reduce((sum, room) => sum + room.participantCount, 0),
    available: rooms.filter((room) => !room.isFull).length,
  }), [rooms]);

  const loadPublicRooms = useCallback(async () => {
    setRoomsLoading(true);
    try {
      const response = await fetch('/api/watch-party/rooms?limit=30', {
        cache: 'no-store',
        headers: { Accept: 'application/json' },
      });
      const payload = (await response.json()) as PublicRoomsResponse;
      if (!response.ok) throw new Error(payload.error || 'rooms_failed');
      setRooms(payload.rooms ?? []);
      setRoomsError('');
      setLastRoomsRefreshAt(Date.now());
    } catch {
      setRoomsError('Не удалось обновить список открытых комнат.');
    } finally {
      setRoomsLoading(false);
    }
  }, []);

  useEffect(() => {
    const initialTimer = window.setTimeout(() => {
      void loadPublicRooms();
    }, 0);
    const timer = window.setInterval(() => {
      void loadPublicRooms();
    }, 15_000);

    return () => {
      window.clearTimeout(initialTimer);
      window.clearInterval(timer);
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
    if (!selected || creatingRoom) return;

    if (!user?.id) {
      setCreateError('Войди в AnimeBox, чтобы создать комнату.');
      return;
    }

    setCreatingRoom(true);
    setCreateError('');

    const selectedEpisode = safeEpisode(episode, selected);
    const invite = createWatchPartyInvite();
    const slug = selected.slug || String(selected.id);
    const target = watchPartyTheaterPath(slug, selectedEpisode);
    const roomUrl = buildWatchPartyUrl(invite, target);

    try {
      const response = await fetch('/api/watch-party/rooms', {
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
          language: 'ru',
        }),
        cache: 'no-store',
      });

      const payload = (await response.json()) as { error?: string };
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

      try {
        await navigator.clipboard.writeText(roomUrl);
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
        },
        flush: true,
      });

      window.location.assign(roomUrl);
    } catch (error) {
      setCreateError(
        error instanceof Error ? error.message : 'Не удалось создать комнату.',
      );
      setCreatingRoom(false);
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

  function joinInvite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setInviteError('');

    const target = validInviteUrl(inviteInput.trim());
    if (!target) {
      setInviteError('Вставь полную ссылку AnimeBox Watch Together из приглашения друга.');
      return;
    }

    window.location.assign(target);
  }

  return (
    <main className={styles.page}>
      <section className={styles.hero}>
        <div className={styles.heroGlow} aria-hidden="true" />
        <div className={styles.heroCopy}>
          <span className={styles.eyebrow}>WATCH TOGETHER</span>
          <h1>Смотри аниме вместе с друзьями</h1>
          <p>
            Найди тайтл, выбери серию и создай комнату. Смотри
            синхронно, общайся в чате и приглашай друзей по ссылке.
          </p>
          <div className={styles.features}>
            <span><i />до 50 участников</span>
            <span><i />чат комнаты</span>
            <span><i />синхронное управление</span>
          </div>
        </div>

        <form className={styles.joinCard} onSubmit={joinInvite}>
          <span className={styles.joinEyebrow}>Уже пригласили?</span>
          <strong>Войти по ссылке друга</strong>
          <p>Вставь invite-ссылку — AnimeBox сразу откроет нужную комнату.</p>
          <div className={styles.joinInput}>
            <input
              value={inviteInput}
              onChange={(event) => setInviteInput(event.target.value)}
              placeholder="https://youranimebox.com/watch-together/..."
              autoComplete="off"
            />
            <button type="submit">Войти</button>
          </div>
          {inviteError && <span className={styles.error}>{inviteError}</span>}
          {lastRoom && (
            <a className={styles.resume} href={lastRoom}>
              Вернуться в последнюю комнату <Icon name="chevron" />
            </a>
          )}
        </form>
      </section>

      <section className={styles.publicRooms} aria-labelledby="public-rooms-title">
        <div className={styles.publicRoomsTop}>
          <div className={styles.sectionHead}>
            <div>
              <span>ОТКРЫТЫЕ КОМНАТЫ · LIVE</span>
              <h2 id="public-rooms-title">Сейчас смотрят вместе</h2>
            </div>
            <button
              type="button"
              className={styles.refreshButton}
              onClick={() => void loadPublicRooms()}
              disabled={roomsLoading}
            >
              {roomsLoading ? 'Обновляем…' : 'Обновить'}
            </button>
          </div>

          <div className={styles.lobbyStats} aria-label="Статистика открытых комнат">
            <div>
              <strong>{roomStats.rooms}</strong>
              <span>живых комнат</span>
            </div>
            <div>
              <strong>{roomStats.viewers}</strong>
              <span>смотрят сейчас</span>
            </div>
            <div>
              <strong>{roomStats.available}</strong>
              <span>можно войти</span>
            </div>
            <small>
              {lastRoomsRefreshAt
                ? `обновлено ${new Date(lastRoomsRefreshAt).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}`
                : 'live-список обновляется автоматически'}
            </small>
          </div>
        </div>

        <div className={styles.lobbyToolbar}>
          <div className={styles.lobbyTabs} role="tablist" aria-label="Сортировка комнат">
            {([
              ['popular', 'Популярные'],
              ['recent', 'Новые'],
              ['available', 'Есть места'],
            ] as const).map(([value, label]) => (
              <button
                key={value}
                type="button"
                role="tab"
                aria-selected={roomSort === value}
                data-active={roomSort === value}
                onClick={() => setRoomSort(value)}
              >
                {label}
              </button>
            ))}
          </div>

          <label className={styles.roomSearch}>
            <Icon name="search" />
            <input
              value={roomSearch}
              onChange={(event) => setRoomSearch(event.target.value)}
              placeholder="Аниме, host или код комнаты"
              autoComplete="off"
              aria-label="Поиск открытой комнаты"
            />
            {roomSearch && (
              <button
                type="button"
                onClick={() => setRoomSearch('')}
                aria-label="Очистить поиск комнат"
              >
                ×
              </button>
            )}
          </label>
        </div>

        {roomsNotice && <div className={styles.lobbyNotice}>{roomsNotice}</div>}

        {roomsLoading && rooms.length === 0 ? (
          <div className={styles.loading}>
            <AnimeBoxLoader label="Ищем живые комнаты…" size={38} />
          </div>
        ) : roomsError && rooms.length === 0 ? (
          <div className={styles.empty}>{roomsError}</div>
        ) : rooms.length === 0 ? (
          <div className={styles.publicEmpty}>
            <strong>Пока тихо</strong>
            <span>Создай первую открытую комнату — она появится здесь автоматически.</span>
          </div>
        ) : visibleRooms.length === 0 ? (
          <div className={styles.publicEmpty}>
            <strong>Под этот фильтр комнат нет</strong>
            <span>Сбрось поиск или переключись на другую подборку.</span>
          </div>
        ) : (
          <div className={styles.publicRoomGrid}>
            {visibleRooms.map((room) => {
              const invite = {
                roomId: room.roomId,
                secret: room.joinSecret,
              };
              const href = buildWatchPartyUrl(
                invite,
                watchPartyTheaterPath(room.animeSlug, room.episode),
              );
              const occupancy = Math.min(
                100,
                Math.round((room.participantCount / Math.max(1, room.maxParticipants)) * 100),
              );

              return (
                <article
                  className={styles.publicRoomCard}
                  data-full={room.isFull ? 'true' : undefined}
                  key={room.roomId}
                >
                  <div className={styles.publicRoomPoster}>
                    {room.coverUrl ? (
                      // Public room artwork can come from AniList/Shikimori/CDN
                      // hosts that are not part of Next Image's static allowlist.
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={room.coverUrl} alt="" loading="lazy" />
                    ) : (
                      <span>AB</span>
                    )}
                    <span className={styles.liveBadge}>
                      <i />
                      LIVE
                    </span>
                    <b>{room.participantCount}/{room.maxParticipants}</b>
                  </div>

                  <div className={styles.publicRoomCopy}>
                    <div className={styles.roomMetaTop}>
                      <span className={styles.roomStatus} data-status={room.status}>
                        {roomStatusLabel(room.status)}
                      </span>
                      <span>{roomAgeLabel(room.createdAt)}</span>
                    </div>

                    <h3>{room.animeTitle}</h3>
                    <p className={styles.roomEpisode}>Серия {room.episode}</p>

                    <div className={styles.roomHostLine}>
                      <span className={styles.roomHostAvatar}>
                        {room.host.username.trim().slice(0, 1).toUpperCase() || '?'}
                      </span>
                      <span>
                        <small>HOST</small>
                        <strong>{room.host.username}</strong>
                      </span>
                    </div>

                    <div className={styles.occupancy}>
                      <div>
                        <span style={{ width: `${occupancy}%` }} />
                      </div>
                      <small>
                        {room.isFull
                          ? 'Комната заполнена'
                          : `Свободно ${room.maxParticipants - room.participantCount} мест`}
                      </small>
                    </div>

                    <div className={styles.roomDetails}>
                      <span>{room.language.toUpperCase()}</span>
                      <span>Код {room.roomCode}</span>
                    </div>

                    <div className={styles.publicRoomActions}>
                      {room.isFull ? (
                        <span className={styles.fullRoomButton}>Заполнена</span>
                      ) : (
                        <a
                          href={href}
                          onClick={() => {
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
                              },
                              flush: true,
                            });
                          }}
                        >
                          Присоединиться
                          <Icon name="chevron" />
                        </a>
                      )}
                      <button
                        type="button"
                        onClick={() => void reportRoom(room.roomId)}
                        aria-label="Пожаловаться на комнату"
                        title="Пожаловаться"
                      >
                        ···
                      </button>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      <section className={styles.builder}>
        <div className={styles.sectionHead}>
          <div>
            <span>1 · ВЫБЕРИ АНИМЕ</span>
            <h2>Что будем смотреть?</h2>
          </div>
          <Link href="/search">Открыть полный каталог →</Link>
        </div>

        <div className={styles.searchBox}>
          <Icon name="search" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Например: Джоджо 5 сезон, One Piece, тщкфпфьш..."
            autoComplete="off"
            aria-label="Поиск аниме для совместного просмотра"
          />
          {query && (
            <button type="button" onClick={() => setQuery('')} aria-label="Очистить поиск">×</button>
          )}
        </div>

        {intent && intent.titleQuery !== intent.normalized && (
          <div className={styles.intent}>
            AnimeBox понял: <strong>{intent.titleQuery}</strong>
            {intent.seasonNumber ? <span>сезон {intent.seasonNumber}</span> : null}
            {intent.partNumber ? <span>часть {intent.partNumber}</span> : null}
            {intent.episodeNumber ? <span>серия {intent.episodeNumber}</span> : null}
          </div>
        )}

        {loading ? (
          <div className={styles.loading}>
            <AnimeBoxLoader label="Ищем подходящие тайтлы…" size={42} />
          </div>
        ) : error ? (
          <div className={styles.empty}>{error}</div>
        ) : results.length ? (
          <div className={styles.results}>
            {results.map((anime) => {
              const title = getAnimeTitle(anime);
              const originalTitle = getAnimeOriginalTitle(anime);
              const active = selected?.id === anime.id;

              return (
                <button
                  type="button"
                  className={styles.animeCard}
                  data-active={active ? 'true' : undefined}
                  key={anime.id}
                  onClick={() => chooseAnime(anime)}
                >
                  <span className={styles.poster}>
                    <AnimeImage
                      image={anime.coverImage}
                      alt={title}
                      englishName={anime.title?.english || anime.title?.romaji}
                    />
                    <b>★ {anime.score ?? anime.averageScore ?? '—'}</b>
                  </span>
                  <span className={styles.cardCopy}>
                    <strong>{title}</strong>
                    {originalTitle && <small>{originalTitle}</small>}
                    <em>{anime.episodesAired || anime.episodes || '?'} эп.</em>
                  </span>
                  <span className={styles.check}>{active ? '✓' : '+'}</span>
                </button>
              );
            })}
          </div>
        ) : (
          <div className={styles.empty}>Ничего не нашли. Попробуй написать название немного короче.</div>
        )}
      </section>

      <section className={styles.roomBuilder} data-ready={selected ? 'true' : undefined}>
        <div className={styles.roomInfo}>
          <span>2 · СОЗДАЙ КОМНАТУ</span>
          <h2>{selected ? getAnimeTitle(selected) : 'Сначала выбери аниме'}</h2>
          <p>
            {selected
              ? 'Выбери серию. После создания комнаты invite-ссылка автоматически скопируется, если браузер разрешит доступ к буферу.'
              : 'После выбора тайтла здесь появятся настройки комнаты.'}
          </p>
        </div>

        <div className={styles.visibilityPicker}>
          <span>Кто может найти комнату</span>
          <div>
            {([
              ['public', 'Открытая', 'Видна всем в разделе «Вместе»'],
              ['unlisted', 'По ссылке', 'Не показывается в общем списке'],
              ['private', 'Приватная', 'Только по приглашению'],
            ] as const).map(([value, label, hint]) => (
              <button
                key={value}
                type="button"
                data-active={visibility === value}
                onClick={() => setVisibility(value)}
              >
                <strong>{label}</strong>
                <small>{hint}</small>
              </button>
            ))}
          </div>
        </div>

        <div className={styles.roomControls}>
          <label>
            <span>Серия</span>
            <div className={styles.episodeControl}>
              <button
                type="button"
                disabled={!selected || episode <= 1}
                onClick={() => setEpisode((current) => Math.max(1, current - 1))}
              >−</button>
              <input
                type="number"
                min={1}
                max={episodeLimit(selected)}
                value={episode}
                disabled={!selected}
                onChange={(event) => setEpisode(safeEpisode(Number(event.target.value), selected))}
              />
              <button
                type="button"
                disabled={!selected || episode >= episodeLimit(selected)}
                onClick={() => setEpisode((current) => Math.min(episodeLimit(selected), current + 1))}
              >+</button>
            </div>
            <small>{selected ? `доступно до ${episodeLimit(selected)} серии` : '—'}</small>
          </label>

          <button
            type="button"
            className={styles.createButton}
            disabled={!selected || creatingRoom}
            onClick={() => void createRoom()}
          >
            <Icon name="users" />
            <span>
              <strong>{creatingRoom ? 'Создаём комнату…' : 'Создать комнату'}</strong>
              <small>{visibility === 'public' ? 'появится в открытом lobby' : 'и пригласить друга'}</small>
            </span>
            <Icon name="chevron" />
          </button>
        </div>
        {createError && <div className={styles.error}>{createError}</div>}
      </section>
      <section className={styles.seoContent} aria-labelledby="watch-together-guide">
        <div className={styles.seoIntro}>
          <span>СОВМЕСТНЫЙ ПРОСМОТР</span>
          <h2 id="watch-together-guide">Как смотреть аниме вместе с другом онлайн</h2>
          <p>
            Watch Together в AnimeBox создан для совместного просмотра аниме через интернет.
            Выберите тайтл и серию, создайте комнату и отправьте ссылку друзьям —
            участники смогут смотреть одну серию вместе, даже находясь на расстоянии.
          </p>
        </div>

        <div className={styles.stepGrid}>
          <article>
            <b>01</b>
            <h3>Выберите аниме</h3>
            <p>Найдите нужный тайтл в каталоге AnimeBox и укажите серию для совместного просмотра.</p>
          </article>
          <article>
            <b>02</b>
            <h3>Создайте комнату</h3>
            <p>AnimeBox создаст Watch Together комнату выбранной видимости и подготовит invite-ссылку.</p>
          </article>
          <article>
            <b>03</b>
            <h3>Пригласите друзей</h3>
            <p>Отправьте ссылку другу и смотрите аниме синхронно с общим управлением и чатом.</p>
          </article>
        </div>

        <div className={styles.seoSplit}>
          <article>
            <h2>Смотреть аниме вместе, даже если вы далеко</h2>
            <p>
              Совместный просмотр не требует находиться рядом. Комната работает через интернет:
              можно запустить аниме вдвоём или собрать друзей и продолжить просмотр с разных устройств.
            </p>
          </article>
          <article>
            <h2>Смотреть видео вместе с другом — без лишней настройки</h2>
            <p>
              Если речь об аниме из каталога AnimeBox, отдельный сервис не нужен. Watch Together
              объединяет выбор серии, приватное приглашение, синхронное управление и чат в одном месте.
            </p>
          </article>
        </div>

        <div className={styles.faq}>
          <span>FAQ</span>
          <h2>Вопросы о Watch Together</h2>
          <div className={styles.faqList}>
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
        </div>
      </section>

    </main>
  );
}
