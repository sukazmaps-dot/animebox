'use client';

import { useEffect, useMemo, useState } from 'react';

import { communityRequest } from '@/lib/community-client';
import { getAnimes, isAbortError } from '@/lib/anime-client';
import { getAnimeTitle } from '@/lib/anime-display';
import type { Anime } from '@/types/anime';
import {
  PROFILE_WIDGET_KEYS,
  type ProfileWidgetKey,
  type ProfileWidgetLayoutItem,
  type ProfileWidgetsData,
} from '@/types/profile-widgets';

import { PROFILE_WIDGET_TITLES } from './ProfileWidgetsShowcase';

type SaveResponse = {
  ok: boolean;
  widgets: ProfileWidgetsData;
};

function animePoster(anime: Anime) {
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

function normalizeLayout(layout: ProfileWidgetLayoutItem[]) {
  const byKey = new Map(layout.map((item) => [item.key, item] as const));

  return PROFILE_WIDGET_KEYS
    .map((key, fallbackPosition) => {
      const current = byKey.get(key);
      return current
        ? { ...current }
        : { key, position: fallbackPosition, visible: true };
    })
    .sort((a, b) => a.position - b.position)
    .map((item, position) => ({ ...item, position }));
}

export default function ProfileWidgetEditor({
  data,
  onSaved,
}: {
  data: ProfileWidgetsData;
  onSaved: (widgets: ProfileWidgetsData) => void;
}) {
  const [open, setOpen] = useState(false);
  const [layout, setLayout] = useState(() => normalizeLayout(data.layout));
  const [favoriteIds, setFavoriteIds] = useState(() => data.favorites.map((item) => item.animeId));
  const [knownTitles, setKnownTitles] = useState<Record<number, { title: string; posterUrl: string | null }>>(
    () => Object.fromEntries(data.favorites.map((item) => [
      item.animeId,
      { title: item.title, posterUrl: item.posterUrl },
    ])),
  );
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Anime[]>([]);
  const [searching, setSearching] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (!open) return;

    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setSearching(true);

      void getAnimes(
        {
          search: query.trim() || undefined,
          page: 1,
          limit: query.trim() ? 10 : 8,
          order: 'ranked',
        },
        { signal: controller.signal },
      )
        .then((anime) => {
          if (!controller.signal.aborted) setResults(anime);
        })
        .catch((error) => {
          if (!isAbortError(error) && !controller.signal.aborted) {
            setResults([]);
          }
        })
        .finally(() => {
          if (!controller.signal.aborted) setSearching(false);
        });
    }, query.trim() ? 280 : 0);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [open, query]);

  const selected = useMemo(
    () => favoriteIds.map((animeId) => ({
      animeId,
      ...(knownTitles[animeId] ?? {
        title: `Аниме #${animeId}`,
        posterUrl: null,
      }),
    })),
    [favoriteIds, knownTitles],
  );

  function openEditor() {
    setLayout(normalizeLayout(data.layout));
    setFavoriteIds(data.favorites.map((item) => item.animeId));
    setKnownTitles((current) => ({
      ...current,
      ...Object.fromEntries(data.favorites.map((item) => [
        item.animeId,
        { title: item.title, posterUrl: item.posterUrl },
      ])),
    }));
    setQuery('');
    setResults([]);
    setMessage('');
    setOpen(true);
  }

  function moveWidget(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= layout.length) return;

    setLayout((current) => {
      const next = [...current];
      [next[index], next[target]] = [next[target], next[index]];
      return next.map((item, position) => ({ ...item, position }));
    });
  }

  function toggleWidget(key: ProfileWidgetKey) {
    setLayout((current) =>
      current.map((item) =>
        item.key === key ? { ...item, visible: !item.visible } : item,
      ),
    );
  }

  function addFavorite(anime: Anime) {
    const animeId = Number(anime.id);
    if (!Number.isSafeInteger(animeId) || animeId < 1) return;

    if (favoriteIds.includes(animeId)) {
      setFavoriteIds((current) => current.filter((id) => id !== animeId));
      return;
    }

    if (favoriteIds.length >= 6) {
      setMessage('Можно закрепить максимум 6 любимых аниме.');
      return;
    }

    setKnownTitles((current) => ({
      ...current,
      [animeId]: {
        title: getAnimeTitle(anime),
        posterUrl: animePoster(anime),
      },
    }));
    setFavoriteIds((current) => [...current, animeId]);
    setMessage('');
  }

  async function save() {
    if (saving) return;

    setSaving(true);
    setMessage('');

    try {
      await communityRequest<SaveResponse>('profile-widgets', {
        action: 'save_layout',
        layout: layout.map(({ key, visible }) => ({ key, visible })),
      });

      const result = await communityRequest<SaveResponse>('profile-widgets', {
        action: 'set_favorites',
        animeIds: favoriteIds,
      });

      onSaved(result.widgets);
      setMessage('Профиль обновлён.');
      window.dispatchEvent(new Event('animebox:profile-widgets-updated'));

      window.setTimeout(() => {
        setOpen(false);
        setMessage('');
      }, 650);
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : 'Не удалось сохранить виджеты.',
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <button
        type="button"
        className="profile-widgets-edit-button"
        onClick={openEditor}
      >
        Настроить витрину
      </button>

      {open && (
        <div
          className="profile-widgets-editor"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !saving) setOpen(false);
          }}
        >
          <section
            className="profile-widgets-editor__dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="profile-widgets-editor-title"
          >
            <div className="profile-widgets-editor__top">
              <div>
                <span>PROFILE IDENTITY</span>
                <h2 id="profile-widgets-editor-title">Настрой профиль под себя</h2>
                <p>
                  Выбери, что показывать другим пользователям, расставь блоки и закрепи любимые аниме.
                </p>
              </div>
              <button
                type="button"
                className="profile-widgets-editor__close"
                disabled={saving}
                onClick={() => setOpen(false)}
                aria-label="Закрыть"
              >
                ×
              </button>
            </div>

            <div className="profile-widgets-editor__section">
              <div className="profile-widgets-editor__section-head">
                <div>
                  <strong>Порядок виджетов</strong>
                  <small>Скрытые блоки останутся доступными для повторного включения.</small>
                </div>
              </div>

              <div className="profile-widgets-editor__layout">
                {layout.map((item, index) => (
                  <div
                    className="profile-widgets-editor__layout-row"
                    data-visible={item.visible ? 'true' : 'false'}
                    key={item.key}
                  >
                    <span className="profile-widgets-editor__order">
                      {String(index + 1).padStart(2, '0')}
                    </span>
                    <strong>{PROFILE_WIDGET_TITLES[item.key]}</strong>
                    <div className="profile-widgets-editor__row-actions">
                      <button
                        type="button"
                        disabled={index === 0}
                        onClick={() => moveWidget(index, -1)}
                        aria-label="Поднять выше"
                      >
                        ↑
                      </button>
                      <button
                        type="button"
                        disabled={index === layout.length - 1}
                        onClick={() => moveWidget(index, 1)}
                        aria-label="Опустить ниже"
                      >
                        ↓
                      </button>
                      <button
                        type="button"
                        className="profile-widgets-editor__visibility"
                        data-on={item.visible ? 'true' : 'false'}
                        onClick={() => toggleWidget(item.key)}
                      >
                        {item.visible ? 'Показывать' : 'Скрыто'}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="profile-widgets-editor__section">
              <div className="profile-widgets-editor__section-head">
                <div>
                  <strong>Любимые аниме</strong>
                  <small>{favoriteIds.length}/6 закреплено · порядок сохраняется слева направо</small>
                </div>
              </div>

              {selected.length > 0 && (
                <div className="profile-widgets-editor__selected">
                  {selected.map((item, index) => (
                    <button
                      type="button"
                      key={item.animeId}
                      onClick={() =>
                        setFavoriteIds((current) => current.filter((id) => id !== item.animeId))
                      }
                      title="Убрать из любимых"
                    >
                      <span className="profile-widgets-editor__selected-poster">
                        {item.posterUrl ? <img src={item.posterUrl} alt="" /> : <i />}
                      </span>
                      <span>
                        <small>#{index + 1}</small>
                        <strong>{item.title}</strong>
                      </span>
                      <b aria-hidden="true">×</b>
                    </button>
                  ))}
                </div>
              )}

              <label className="profile-widgets-editor__search">
                <span aria-hidden="true">⌕</span>
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Найти аниме для витрины"
                  autoComplete="off"
                />
                {query && (
                  <button type="button" onClick={() => setQuery('')} aria-label="Очистить поиск">
                    ×
                  </button>
                )}
              </label>

              <div className="profile-widgets-editor__results">
                {searching ? (
                  <div className="profile-widgets-editor__loading">Ищем тайтлы…</div>
                ) : (
                  results.map((anime) => {
                    const animeId = Number(anime.id);
                    const active = favoriteIds.includes(animeId);
                    const poster = animePoster(anime);

                    return (
                      <button
                        type="button"
                        className="profile-widgets-editor__result"
                        data-active={active ? 'true' : 'false'}
                        key={anime.id}
                        onClick={() => addFavorite(anime)}
                      >
                        <span className="profile-widgets-editor__result-poster">
                          {poster ? <img src={poster} alt="" /> : <i />}
                        </span>
                        <span>
                          <strong>{getAnimeTitle(anime)}</strong>
                          <small>{active ? 'В любимых' : 'Добавить в витрину'}</small>
                        </span>
                        <b>{active ? '✓' : '+'}</b>
                      </button>
                    );
                  })
                )}
              </div>
            </div>

            {message && (
              <div className="profile-widgets-editor__message" role="status">
                {message}
              </div>
            )}

            <div className="profile-widgets-editor__actions">
              <button
                type="button"
                className="is-secondary"
                disabled={saving}
                onClick={() => setOpen(false)}
              >
                Отмена
              </button>
              <button
                type="button"
                className="is-primary"
                disabled={saving}
                onClick={() => void save()}
              >
                {saving ? 'Сохраняем…' : 'Сохранить профиль'}
              </button>
            </div>
          </section>
        </div>
      )}
    </>
  );
}
