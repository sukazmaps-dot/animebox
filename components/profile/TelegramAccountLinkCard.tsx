'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import Icon from '@/components/Icon';

import styles from './TelegramAccountLinkCard.module.css';

type StatusPayload = {
  ok?: boolean;
  linked?: boolean;
  pending?: boolean;
  canUnlink?: boolean;
  displayName?: string | null;
  error?: string;
};

type StartPayload = StatusPayload & {
  deepLink?: string | null;
  expiresAt?: string | null;
};

function errorText(value?: string) {
  if (!value) return 'Не удалось выполнить запрос.';

  if (value.includes('Telegram нельзя отвязать')) return value;

  switch (value) {
    case 'profile_not_found':
      return 'Профиль AnimeBox не найден.';
    default:
      return value;
  }
}

export default function TelegramAccountLinkCard() {
  const [status, setStatus] = useState<StatusPayload | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const pollingRef = useRef<number | null>(null);

  const loadStatus = useCallback(async () => {
    const response = await fetch('/api/telegram/account-link', {
      cache: 'no-store',
      headers: { Accept: 'application/json' },
    });

    const payload = (await response.json()) as StatusPayload;

    if (!response.ok || !payload.ok) {
      throw new Error(payload.error || 'Не удалось проверить Telegram.');
    }

    setStatus(payload);

    if (payload.linked && pollingRef.current != null) {
      window.clearInterval(pollingRef.current);
      pollingRef.current = null;
    }

    return payload;
  }, []);

  useEffect(() => {
    let active = true;

    void loadStatus().catch((loadError) => {
      if (!active) return;
      setError(loadError instanceof Error ? loadError.message : 'Не удалось проверить Telegram.');
    });

    const onFocus = () => {
      if (!active) return;
      void loadStatus().catch(() => {});
    };

    window.addEventListener('focus', onFocus);

    return () => {
      active = false;
      window.removeEventListener('focus', onFocus);
      if (pollingRef.current != null) {
        window.clearInterval(pollingRef.current);
      }
    };
  }, [loadStatus]);

  async function startLink() {
    if (busy) return;

    const popup = window.open('', '_blank');
    setBusy(true);
    setError('');

    try {
      const response = await fetch('/api/telegram/account-link', {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
        body: '{}',
        cache: 'no-store',
      });

      const payload = (await response.json()) as StartPayload;

      if (!response.ok || !payload.ok) {
        throw new Error(payload.error || 'Не удалось создать ссылку привязки.');
      }

      setStatus((current) => ({
        ...current,
        ...payload,
        pending: !payload.linked,
      }));

      if (payload.linked) {
        popup?.close();
        return;
      }

      if (!payload.deepLink) {
        throw new Error('AnimeBox не получил ссылку Telegram.');
      }

      if (popup) {
        popup.opener = null;
        popup.location.href = payload.deepLink;
      } else {
        window.location.href = payload.deepLink;
      }

      if (pollingRef.current != null) {
        window.clearInterval(pollingRef.current);
      }

      pollingRef.current = window.setInterval(() => {
        if (document.visibilityState === 'visible') {
          void loadStatus().catch(() => {});
        }
      }, 2500);
    } catch (requestError) {
      popup?.close();
      setError(
        errorText(
          requestError instanceof Error
            ? requestError.message
            : 'Не удалось создать ссылку привязки.',
        ),
      );
    } finally {
      setBusy(false);
    }
  }

  async function unlink() {
    if (busy) return;
    if (!window.confirm('Отвязать Telegram от этого AnimeBox-аккаунта?')) return;

    setBusy(true);
    setError('');

    try {
      const response = await fetch('/api/telegram/account-link', {
        method: 'DELETE',
        headers: { Accept: 'application/json' },
        cache: 'no-store',
      });

      const payload = (await response.json()) as StatusPayload;

      if (!response.ok || !payload.ok) {
        throw new Error(payload.error || 'Не удалось отвязать Telegram.');
      }

      setStatus({
        ok: true,
        linked: false,
        pending: false,
        canUnlink: false,
        displayName: null,
      });
    } catch (requestError) {
      setError(
        errorText(
          requestError instanceof Error
            ? requestError.message
            : 'Не удалось отвязать Telegram.',
        ),
      );
    } finally {
      setBusy(false);
    }
  }

  const linked = Boolean(status?.linked);

  return (
    <div className={styles.card}>
      <div className={styles.header}>
        <span className={styles.icon} aria-hidden="true">
          <Icon name="telegram" size={20} />
        </span>

        <div className={styles.copy}>
          <strong>Telegram</strong>
          <span>
            {linked
              ? status?.displayName
                ? `Подключён ${status.displayName}`
                : 'Telegram подключён к этому аккаунту'
              : 'Привяжи Telegram для Mini App, уведомлений и входа без создания второго аккаунта.'}
          </span>
        </div>

        <span
          className={`${styles.status} ${linked ? styles.statusLinked : ''}`}
        >
          {linked ? 'Подключён' : status?.pending ? 'Ожидаем' : 'Не подключён'}
        </span>
      </div>

      <div className={styles.actions}>
        {!linked && (
          <button
            type="button"
            className={styles.button}
            disabled={busy}
            onClick={() => void startLink()}
          >
            {busy ? 'Создаём ссылку…' : 'Привязать Telegram'}
          </button>
        )}

        {!linked && status?.pending && (
          <button
            type="button"
            className={`${styles.button} ${styles.secondary}`}
            disabled={busy}
            onClick={() => void loadStatus().catch((value) => setError(errorText(value instanceof Error ? value.message : '')))}
          >
            Проверить статус
          </button>
        )}

        {linked && status?.canUnlink && (
          <button
            type="button"
            className={`${styles.button} ${styles.danger}`}
            disabled={busy}
            onClick={() => void unlink()}
          >
            Отвязать
          </button>
        )}
      </div>

      {!linked && status?.pending && (
        <p className={styles.note}>
          Ссылка действует 5 минут. Нажми «Start» в @YourAnimeBoxBot — после подтверждения AnimeBox обновит статус автоматически.
        </p>
      )}

      {linked && !status?.canUnlink && (
        <p className={styles.note}>
          Этот аккаунт создан через Telegram, поэтому отключить его без другого способа входа нельзя.
        </p>
      )}

      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
