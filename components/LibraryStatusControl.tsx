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
}: {
  animeId: number;
  initialStatus?: LibraryStatus;
}) {
  const [status, setStatus] = useState<LibraryStatus | ''>(
    initialStatus ?? '',
  );
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (initialStatus) {
      setStatus(initialStatus);
      return;
    }

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

  return (
    <section className="community-library-control">
      <div className="community-library-control__top">
        <div className="community-library-control__info">
          <div className="community-library-control__icon" aria-hidden="true">
            <img src="/brand/brand-mark.png" alt="" />
          </div>

          <div>
            <span className="community-library-control__eyebrow">
              Личная библиотека
            </span>
            <h2>В моей библиотеке</h2>
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

      <div className="community-library-control__footer">
        <p>
          Статус «Просмотрено» не отмечает серии автоматически.
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
