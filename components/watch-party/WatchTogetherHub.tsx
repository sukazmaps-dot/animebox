'use client';

import { type FormEvent, useEffect, useMemo, useState, useSyncExternalStore } from 'react';
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
    if (!selected) return;

    const selectedEpisode = safeEpisode(episode, selected);
    const invite = createWatchPartyInvite();
    const slug = selected.slug || String(selected.id);

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

    window.location.assign(roomUrl);
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
            Найди тайтл, выбери серию и создай приватную комнату. Смотри
            синхронно, общайся в чате и приглашай друзей по ссылке.
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
            disabled={!selected}
            onClick={() => void createRoom()}
          >
            <Icon name="users" />
            <span>
              <strong>Создать комнату</strong>
              <small>и пригласить друга</small>
            </span>
            <Icon name="chevron" />
          </button>
        </div>
      </section>
    </main>
  );
}
