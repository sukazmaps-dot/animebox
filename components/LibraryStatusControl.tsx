'use client';

import { useEffect, useState } from 'react';

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
  const [status, setStatus] = useState<LibraryStatus | ''>(
    initialStatus ?? '',
  );
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);

  useEffect(() => {
    setConfirmRemove(false);
  }, [animeId]);

  useEffect(() => {
    if (initialStatus) return;

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
  }, [animeId, initialStatus]);

  async function save(value: LibraryStatus) {
    if (busy || value === status) return;

    setBusy(true);
    setMessage('');
    setConfirmRemove(false);

    try {
      await communityRequest('library', {
        animeId,
        status: value,
      });

      setStatus(value);
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

  return (
    <section className={compact ? 'community-library-control is-compact' : 'community-library-control'}>
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
