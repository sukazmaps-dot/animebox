'use client';

import { type FormEvent, useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import Image from 'next/image';
import Link from 'next/link';

import AnimeImage from '@/components/AnimeImage';
import Icon from '@/components/Icon';
import AnimeBoxLoader from '@/components/ui/AnimeBoxLoader';
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
import {
  publicRoomStatusLabel,
  type PublicWatchPartyRoom,
  type WatchPartyVisibility,
} from '@/lib/watch-party-directory';
import { trackProductClientEvent } from '@/lib/product-events-client';

import styles from './WatchTogetherHub.module.css';

const LAST_ROOM_KEY = 'animebox:watch-together:last-room:v1';

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
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Anime[]>([]);
  const [selected, setSelected] = useState<Anime | null>(null);
  const [episode, setEpisode] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [inviteInput, setInviteInput] = useState('');
  const [inviteError, setInviteError] = useState('');
  const [visibility, setVisibility] = useState<WatchPartyVisibility>('public');
  const [publicRooms, setPublicRooms] = useState<PublicWatchPartyRoom[]>([]);
  const [publicRoomsLoading, setPublicRoomsLoading] = useState(true);
  const [publicRoomsError, setPublicRoomsError] = useState('');
  const [joiningRoomId, setJoiningRoomId] = useState('');
  const [creatingRoom, setCreatingRoom] = useState(false);
  const [roomCreateError, setRoomCreateError] = useState('');
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

  useEffect(() => {
    let active = true;
    const controller = new AbortController();

    async function loadPublicRooms() {
      try {
        const response = await fetch('/api/watch-party/rooms', {
          cache: 'no-store',
          signal: controller.signal,
          headers: { Accept: 'application/json' },
        });
        const payload = (await response.json()) as {
          rooms?: PublicWatchPartyRoom[];
          error?: string;
        };
        if (!response.ok) throw new Error(payload.error || 'public_rooms_failed');
        if (!active) return;
        setPublicRooms(Array.isArray(payload.rooms) ? payload.rooms : []);
        setPublicRoomsError('');
      } catch (loadError) {
        if (!active || controller.signal.aborted) return;
        setPublicRoomsError(
          loadError instanceof Error && loadError.message !== 'public_rooms_failed'
            ? loadError.message
            : 'Не удалось обновить открытые комнаты.',
        );
      } finally {
        if (active) setPublicRoomsLoading(false);
      }
    }

    void loadPublicRooms();
    const timer = window.setInterval(() => void loadPublicRooms(), 15_000);

    trackProductClientEvent('watch_party_hub_view', {
      source: 'watch_together',
      path: '/watch-together',
      entityType: 'surface',
      entityId: 'watch_together_hub',
    });

    return () => {
      active = false;
      controller.abort();
      window.clearInterval(timer);
    };
  }, []);

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

    setCreatingRoom(true);
    setRoomCreateError('');

    const selectedEpisode = safeEpisode(episode, selected);
    const invite = createWatchPartyInvite();
    const slug = selected.slug || String(selected.id);
    const title = getAnimeTitle(selected);
    const coverUrl =
      selected.coverImage?.extraLarge ||
      selected.coverImage?.large ||
      selected.coverImage?.medium ||
      selected.image?.original ||
      selected.image?.large ||
      selected.image?.medium ||
      null;

    try {
      const registerResponse = await fetch('/api/watch-party/rooms', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        cache: 'no-store',
        body: JSON.stringify({
          roomId: invite.roomId,
          joinSecret: invite.secret,
          animeId: selected.id,
          animeSlug: slug,
          animeTitle: title,
          coverUrl,
          episode: selectedEpisode,
          visibility,
          language: 'ru',
        }),
      });

      const registerPayload = (await registerResponse.json()) as {
        ok?: boolean;
        error?: string;
      };

      if (!registerResponse.ok || !registerPayload.ok) {
        if (registerResponse.status === 401) {
          window.location.replace('/login?next=%2Fwatch-together');
          return;
        }
        throw new Error(registerPayload.error || 'Не удалось создать комнату.');
      }

      trackProductClientEvent('watch_party_room_created', {
        source: 'watch_together',
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
    } catch (createError) {
      setCreatingRoom(false);
      setRoomCreateError(
        createError instanceof Error
          ? createError.message
          : 'Не удалось создать комнату.',
      );
      return;
    }

    try {
      sessionStorage.setItem(watchPartyHostSessionKey(invite.roomId), invite.secret);
      claimWatchPartyHostTab(invite);
    } catch {
      claimWatchPartyHostTab(invite);
    }

    const target = watchPartyTheaterPath(slug, selectedEpisode);
    const roomUrl = buildWatchPartyUrl(invite, target);

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

    window.location.replace(roomUrl);
  }

  async function joinPublicRoom(room: PublicWatchPartyRoom) {
    if (joiningRoomId) return;
    setJoiningRoomId(room.id);
    setPublicRoomsError('');

    try {
      const response = await fetch('/api/watch-party/rooms/join', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        cache: 'no-store',
        body: JSON.stringify({ roomId: room.id }),
      });
      const payload = (await response.json()) as {
        ok?: boolean;
        roomUrl?: string;
        error?: string;
      };

      if (!response.ok || !payload.ok || !payload.roomUrl) {
        if (response.status === 401) {
          window.location.replace('/login?next=%2Fwatch-together');
          return;
        }
        throw new Error(payload.error || 'Не удалось войти в комнату.');
      }

      trackProductClientEvent('watch_party_public_room_join', {
        source: 'watch_together_lobby',
        path: '/watch-together',
        entityType: 'watch_party_room',
        entityId: room.id,
        metadata: {
          anime_id: room.animeId,
          episode: room.episode,
          participants: room.participantCount,
        },
        flush: true,
      });

      window.location.replace(payload.roomUrl);
    } catch (joinError) {
      setJoiningRoomId('');
      setPublicRoomsError(
        joinError instanceof Error
          ? joinError.message
          : 'Не удалось войти в комнату.',
      );
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

    window.location.replace(target);
  }

  return (
    <main className={styles.page}>
      <section className={styles.hero}>
        <div className={styles.heroGlow} aria-hidden="true" />
        <div className={styles.heroCopy}>
          <span className={styles.eyebrow}>WATCH TOGETHER</span>
          <h1>Смотри аниме вместе</h1>
          <p>
            Создай комнату для друзей или зайди в открытую. Синхронный просмотр,
            живой чат и общий ритм серии — прямо внутри AnimeBox.
          </p>
          <div className={styles.features}>
            <span><i />до 8 участников</span>
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

      <section className={styles.publicLobby} aria-labelledby="public-watch-party-title">
        <div className={styles.sectionHead}>
          <div>
            <span>LIVE · ОТКРЫТЫЕ КОМНАТЫ</span>
            <h2 id="public-watch-party-title">К кому присоединиться?</h2>
            <p>Живые комнаты AnimeBox. Список обновляется автоматически.</p>
          </div>
          <span className={styles.liveCount}>
            {publicRooms.length ? `${publicRooms.length} live` : 'тишина'}
          </span>
        </div>

        {publicRoomsLoading ? (
          <div className={styles.publicRoomsLoading}>
            <AnimeBoxLoader label="Ищем живые комнаты…" size={40} />
          </div>
        ) : publicRooms.length ? (
          <div className={styles.publicRooms}>
            {publicRooms.map((room) => (
              <article className={styles.publicRoom} key={room.id}>
                <div className={styles.publicRoomPoster}>
                  {room.coverUrl ? (
                    <Image
                      src={room.coverUrl}
                      alt=""
                      fill
                      sizes="90px"
                      unoptimized
                    />
                  ) : (
                    <span>{room.animeTitle.slice(0, 1)}</span>
                  )}
                  <b>{room.status === 'watching' ? 'LIVE' : publicRoomStatusLabel(room.status)}</b>
                </div>

                <div className={styles.publicRoomBody}>
                  <div>
                    <span className={styles.publicRoomCode}>#{room.roomCode}</span>
                    <h3>{room.animeTitle}</h3>
                    <p>
                      Серия {room.episode} · host {room.hostName}
                    </p>
                  </div>

                  <div className={styles.publicRoomMeta}>
                    <span>👥 {room.participantCount}/{room.maxParticipants}</span>
                    <span>{publicRoomStatusLabel(room.status)}</span>
                  </div>

                  <button
                    type="button"
                    disabled={
                      joiningRoomId === room.id ||
                      room.participantCount >= room.maxParticipants
                    }
                    onClick={() => void joinPublicRoom(room)}
                  >
                    {room.participantCount >= room.maxParticipants
                      ? 'Комната заполнена'
                      : joiningRoomId === room.id
                        ? 'Подключаем…'
                        : 'Присоединиться'}
                  </button>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className={styles.publicRoomsEmpty}>
            <strong>Пока нет открытых комнат</strong>
            <span>Создай первую — она появится здесь почти сразу.</span>
          </div>
        )}

        {publicRoomsError && <p className={styles.error}>{publicRoomsError}</p>}
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

        <div className={styles.roomControls}>
          <div className={styles.visibilityControl}>
            <span>Кто увидит комнату</span>
            <div>
              {([
                ['public', 'Открытая', 'Видна всем во «Вместе»'],
                ['unlisted', 'По ссылке', 'Только по invite-ссылке'],
                ['private', 'Приватная', 'Не показывается в lobby'],
              ] as const).map(([value, label, hint]) => (
                <button
                  type="button"
                  key={value}
                  data-active={visibility === value ? 'true' : undefined}
                  onClick={() => setVisibility(value)}
                  disabled={!selected || creatingRoom}
                >
                  <strong>{label}</strong>
                  <small>{hint}</small>
                </button>
              ))}
            </div>
          </div>

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
              <strong>{creatingRoom ? 'Создаём…' : 'Создать комнату'}</strong>
              <small>
                {visibility === 'public'
                  ? 'появится в открытом lobby'
                  : visibility === 'unlisted'
                    ? 'вход только по ссылке'
                    : 'приватный режим'}
              </small>
            </span>
            <Icon name="chevron" />
          </button>
        </div>
        {roomCreateError && <p className={styles.error}>{roomCreateError}</p>}
      </section>
      <section className={styles.seoContent} aria-labelledby="watch-together-guide">
        <div className={styles.seoIntro}>
          <span>СОВМЕСТНЫЙ ПРОСМОТР</span>
          <h2 id="watch-together-guide">Как смотреть аниме вместе с другом онлайн</h2>
          <p>
            Watch Together в AnimeBox создан для совместного просмотра аниме через интернет.
            Выберите тайтл и серию, создайте приватную комнату и отправьте ссылку другу —
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
            <p>AnimeBox создаст приватную Watch Together комнату и подготовит invite-ссылку.</p>
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
              <p>Откройте Watch Together, выберите аниме и серию, создайте приватную комнату и отправьте другу invite-ссылку.</p>
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
              <p>Одна комната AnimeBox Watch Together рассчитана максимум на 8 участников.</p>
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
