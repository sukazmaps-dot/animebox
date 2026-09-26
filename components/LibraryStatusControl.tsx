'use client';

import { useEffect, useRef, useState } from 'react';

import { useAuthModal } from '@/components/AuthModalProvider';
import { useAuthState } from '@/components/AuthStateProvider';
import {
  communityRequest,
  statusLabels,
  type LibraryStatus,
  type CommunityProfile,
} from '@/lib/community-client';

const statusIcons: Record<LibraryStatus, string> = {
  watching: '/brand/icons/watching.svg',
  planned: '/brand/icons/planned.svg',
  completed: '/brand/icons/completed.svg',
  dropped: '/brand/icons/dropped.svg',
};

export default function LibraryStatusControl({
  animeId,
  initialStatus,
  variant = 'default',
  onRemoved,
}: {
  animeId: number;
  initialStatus?: LibraryStatus;
  variant?: 'default' | 'compact';
  onRemoved?: () => void;
}) {
  const compact = variant === 'compact';
  const { user, loading: authLoading } = useAuthState();
  const { openAuth } = useAuthModal();
  const guest = !authLoading && !user;
  const [status, setStatus] = useState<LibraryStatus | ''>(
    initialStatus ?? '',
  );
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [statusMenuOpen, setStatusMenuOpen] = useState(false);
  const compactRootRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    setConfirmRemove(false);
    setStatusMenuOpen(false);
  }, [animeId]);

  useEffect(() => {
    if (!compact || !statusMenuOpen) return;

    const onPointerDown = (event: PointerEvent) => {
      const root = compactRootRef.current;
      if (root && !root.contains(event.target as Node)) {
        setStatusMenuOpen(false);
      }
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setStatusMenuOpen(false);
    };

    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);

    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [compact, statusMenuOpen]);

  useEffect(() => {
    if (initialStatus || authLoading || !user) return;

    let active = true;

    communityRequest<CommunityProfile>('profile')
      .then((data) => {
        if (!active) return;

        setStatus(
          data.library.find((item) => item.anime_id === animeId)?.status ?? '',
        );
      })
      .catch(() => {});

    return () => {
      active = false;
    };
  }, [animeId, authLoading, initialStatus, user]);

  useEffect(() => {
    if (authLoading || user) return;
    setStatus('');
    setMessage('');
    setConfirmRemove(false);
    setStatusMenuOpen(false);
  }, [authLoading, user]);

  async function save(value: LibraryStatus) {
    if (busy) return;

    if (value === status) {
      setStatusMenuOpen(false);
      setConfirmRemove(false);
      return;
    }

    setBusy(true);
    setMessage('');
    setConfirmRemove(false);

    try {
      await communityRequest('library', {
        animeId,
        status: value,
      });

      setStatus(value);
      setStatusMenuOpen(false);
      window.dispatchEvent(new Event('library-updated'));
      setMessage('Сохранено');
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : 'Не удалось сохранить статус',
      );
    } finally {
      setBusy(false);
    }
  }

  async function removeFromTracker() {
    if (busy || !status) return;

    setBusy(true);
    setMessage('');

    try {
      await communityRequest<{ removed: boolean; progressPreserved: boolean }>(
        'library',
        { animeId },
        'DELETE',
      );

      setStatus('');
      setConfirmRemove(false);
      setStatusMenuOpen(false);
      onRemoved?.();
      window.dispatchEvent(
        new CustomEvent('library-updated', {
          detail: { animeId, action: 'removed' },
        }),
      );
      setMessage('Удалено из трекера. Прогресс просмотра сохранён.');
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : 'Не удалось удалить аниме из трекера',
      );
    } finally {
      setBusy(false);
    }
  }

  if (compact && guest) {
    return (
      <section
        ref={compactRootRef}
        className="episode-library-compact episode-library-compact--guest"
        data-status="guest"
      >
        <button
          type="button"
          className="episode-library-compact__trigger episode-library-compact__trigger--guest"
          aria-label="Войти или зарегистрироваться, чтобы пользоваться библиотекой"
          onClick={() =>
            openAuth({
              mode: 'register',
              intent: 'tracker',
              title: 'Сохраняй аниме в своей библиотеке',
            })
          }
        >
          <span
            className="episode-library-compact__status-icon episode-library-compact__status-icon--guest"
            aria-hidden="true"
          >
            <svg viewBox="0 0 20 20" fill="none">
              <path d="M6.75 8V6.5a3.25 3.25 0 0 1 6.5 0V8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              <rect x="5" y="8" width="10" height="8" rx="2" stroke="currentColor" strokeWidth="1.5" />
            </svg>
          </span>

          <span className="episode-library-compact__trigger-copy">
            <small>Чтобы пользоваться библиотекой</small>
            <strong>Войти / зарегистрироваться</strong>
          </span>

          <svg
            className="episode-library-compact__guest-arrow"
            viewBox="0 0 20 20"
            fill="none"
            aria-hidden="true"
          >
            <path d="M7 4.5 12.5 10 7 15.5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </section>
    );
  }

  if (compact) {
    return (
      <section
        ref={compactRootRef}
        className="episode-library-compact"
        data-status={status || 'empty'}
      >
        <div className="episode-library-compact__picker">
          <button
            type="button"
            className="episode-library-compact__trigger"
            disabled={busy}
            aria-haspopup="menu"
            aria-expanded={statusMenuOpen}
            aria-label="Статус аниме в библиотеке"
            onClick={() => setStatusMenuOpen((current) => !current)}
          >
            <span
              className="episode-library-compact__status-icon"
              data-status={status || 'empty'}
              aria-hidden="true"
            >
              {status ? (
                <img src={statusIcons[status]} alt="" />
              ) : (
                <span>+</span>
              )}
            </span>

            <span className="episode-library-compact__trigger-copy">
              <small>Моя библиотека</small>
              <strong>{status ? statusLabels[status] : 'Добавить в библиотеку'}</strong>
            </span>

            <svg
              className="episode-library-compact__chevron"
              viewBox="0 0 20 20"
              fill="none"
              aria-hidden="true"
            >
              <path
                d="m6.5 8 3.5 3.5L13.5 8"
                stroke="currentColor"
                strokeWidth="1.7"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>

          {statusMenuOpen && (
            <div
              className="episode-library-compact__menu"
              role="menu"
              aria-label="Выбрать статус"
            >
              {Object.entries(statusLabels).map(([value, label]) => {
                const typedValue = value as LibraryStatus;
                const active = status === typedValue;

                return (
                  <button
                    key={value}
                    type="button"
                    role="menuitemradio"
                    aria-checked={active}
                    data-status={typedValue}
                    className={active ? 'is-active' : ''}
                    disabled={busy}
                    onClick={() => void save(typedValue)}
                  >
                    <span className="episode-library-compact__menu-icon" aria-hidden="true">
                      <img src={statusIcons[typedValue]} alt="" />
                    </span>
                    <span>{label}</span>
                    {active && <b aria-hidden="true">✓</b>}
                  </button>
                );
              })}

              {status && (
                <button
                  type="button"
                  role="menuitem"
                  className={
                    confirmRemove
                      ? 'episode-library-compact__remove is-confirm'
                      : 'episode-library-compact__remove'
                  }
                  disabled={busy}
                  onClick={() => {
                    if (!confirmRemove) {
                      setConfirmRemove(true);
                      return;
                    }
                    void removeFromTracker();
                  }}
                >
                  <span className="episode-library-compact__menu-icon" aria-hidden="true">×</span>
                  <span>
                    {confirmRemove
                      ? 'Подтвердить удаление'
                      : 'Убрать из библиотеки'}
                  </span>
                </button>
              )}
            </div>
          )}
        </div>

        {message && (
          <span className="episode-library-compact__message" role="status">{message}</span>
        )}
      </section>
    );
  }

  if (guest) {
    return (
      <section className="community-library-control community-library-control--guest">
        <div className="community-library-control__top">
          <div className="community-library-control__info">
            <div className="community-library-control__icon" aria-hidden="true">
              <img src="/brand/brand-mark.png" alt="" />
            </div>
            <div>
              <span className="community-library-control__eyebrow">Личная библиотека</span>
              <h2>Сохраняй тайтлы в AnimeBox</h2>
            </div>
          </div>
        </div>

        <div className="community-library-guest">
          <p>Чтобы пользоваться библиотекой, войдите или зарегистрируйтесь.</p>
          <button
            type="button"
            className="community-library-guest__action"
            onClick={() =>
              openAuth({
                mode: 'register',
                intent: 'tracker',
                title: 'Сохраняй аниме в своей библиотеке',
              })
            }
          >
            Войти / зарегистрироваться
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="community-library-control">
      <div className="community-library-control__top">
        <div className="community-library-control__info">
          <div className="community-library-control__icon" aria-hidden="true">
            <img src="/brand/brand-mark.png" alt="" />
          </div>

          <div>
            <span className="community-library-control__eyebrow">
              {compact ? 'Трекинг' : 'Личная библиотека'}
            </span>
            <h2>
              {status
                ? (compact ? 'Отслеживать аниме' : 'В моей библиотеке')
                : 'Добавить в библиотеку'}
            </h2>
          </div>
        </div>

        {status && (
          <span
            className="community-library-control__current"
            data-status={status}
          >
            {statusLabels[status]}
          </span>
        )}
      </div>

      <div
        className="community-library-control__statuses"
        role="group"
        aria-label="Статус аниме"
      >
        {Object.entries(statusLabels).map(([value, label]) => {
          const typedValue = value as LibraryStatus;
          const active = status === typedValue;

          return (
            <button
              key={value}
              type="button"
              disabled={busy}
              aria-pressed={active}
              data-status={typedValue}
              className={
                active
                  ? 'community-library-status is-active'
                  : 'community-library-status'
              }
              onClick={() => void save(typedValue)}
            >
              <span className="community-library-status__icon" aria-hidden="true">
                <img src={statusIcons[typedValue]} alt="" />
              </span>
              <span className="community-library-status__label">{label}</span>
            </button>
          );
        })}
      </div>

      {status && (
        <div className="community-library-remove-row">
          {!confirmRemove ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => setConfirmRemove(true)}
              className="community-library-remove"
            >
              <span className="community-library-remove__icon" aria-hidden="true">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                  <path d="M4 7h16M9 7V4h6v3M7 7l1 13h8l1-13M10 11v5M14 11v5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </span>
              <span>Удалить из трекера</span>
            </button>
          ) : (
            <div
              className="community-library-remove-confirm"
              role="group"
              aria-label="Подтверждение удаления из трекера"
            >
              <span className="community-library-remove-confirm__copy">
                Удалить из библиотеки?
              </span>
              <button
                type="button"
                disabled={busy}
                onClick={() => void removeFromTracker()}
                className="community-library-remove-confirm__danger"
              >
                {busy ? 'Удаляем…' : 'Удалить'}
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => setConfirmRemove(false)}
                className="community-library-remove-confirm__cancel"
              >
                Отмена
              </button>
            </div>
          )}

          <span className="community-library-remove__note">
            Прогресс и история просмотра сохранятся.
          </span>
        </div>
      )}

      <div className="community-library-control__footer">
        <p>
          {compact
            ? 'Выбери статус — AnimeBox сохранит тайтл в библиотеке и покажет его в трекере.'
            : 'Статус «Просмотрено» не отмечает серии автоматически.'}
        </p>

        {message && (
          <span className="community-library-control__message" role="status">
            {message}
          </span>
        )}
      </div>
    </section>
  );
}
