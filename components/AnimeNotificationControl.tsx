'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { telegramMiniAppUrl } from '@/lib/telegram-links';

type SubscriptionResponse = {
  ok?: boolean;
  enabled?: boolean;
  telegramLinked?: boolean;
  telegramReady?: boolean;
  error?: string;
  message?: string;
};

async function readJson(response: Response): Promise<SubscriptionResponse> {
  const text = await response.text();
  if (!text) return {};

  try {
    return JSON.parse(text) as SubscriptionResponse;
  } catch {
    return {
      ok: false,
      error: `http_${response.status}`,
      message: 'Сервер вернул некорректный ответ.',
    };
  }
}

function humanizeError(code?: string, message?: string) {
  if (message && code !== 'telegram_write_access_required') return message;

  switch (code) {
    case 'auth_required':
      return 'Войди в AnimeBox, чтобы включить уведомления.';
    case 'telegram_not_linked':
      return 'Сначала привяжи Telegram к AnimeBox.';
    case 'telegram_write_access_required':
      return 'Разреши боту AnimeBox отправлять сообщения в Telegram.';
    case 'telegram_not_configured':
      return 'Telegram-уведомления временно не настроены.';
    default:
      return message || 'Не удалось изменить уведомления.';
  }
}

async function requestTelegramWriteAccess() {
  const telegram = window.Telegram?.WebApp;

  if (!telegram?.initData) return true;

  if (telegram.initDataUnsafe.user?.allows_write_to_pm === true) {
    return true;
  }

  if (typeof telegram.requestWriteAccess !== 'function') {
    return true;
  }

  return await new Promise<boolean>((resolve) => {
    telegram.requestWriteAccess?.((allowed) => resolve(Boolean(allowed)));
  });
}

export default function AnimeNotificationControl({
  animeId,
  animeSlug,
  animeTitle,
  episodesAired,
}: {
  animeId: number;
  animeSlug: string;
  animeTitle: string;
  episodesAired: number | null;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [authenticated, setAuthenticated] = useState(true);
  const [telegramLinked, setTelegramLinked] = useState(false);
  const [telegramReady, setTelegramReady] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    const controller = new AbortController();

    async function load() {
      try {
        const response = await fetch(
          `/api/notifications/subscription?animeId=${encodeURIComponent(String(animeId))}`,
          {
            cache: 'no-store',
            signal: controller.signal,
          },
        );

        const data = await readJson(response);

        if (response.status === 401) {
          setAuthenticated(false);
          return;
        }

        if (!response.ok || !data.ok) {
          setMessage(humanizeError(data.error, data.message));
          return;
        }

        setAuthenticated(true);
        setTelegramLinked(Boolean(data.telegramLinked));
        setTelegramReady(Boolean(data.telegramReady));
        setEnabled(Boolean(data.enabled));
      } catch (error) {
        if ((error as Error).name !== 'AbortError') {
          setMessage('Не удалось проверить уведомления.');
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }

    void load();

    return () => controller.abort();
  }, [animeId]);

  async function toggle() {
    if (busy) return;

    if (!authenticated) {
      router.push('/login');
      return;
    }

    if (!telegramLinked) {
      window.open(
        telegramMiniAppUrl('notifications'),
        '_blank',
        'noopener,noreferrer',
      );
      return;
    }

    setBusy(true);
    setMessage('');

    try {
      const nextEnabled = !enabled;

      if (nextEnabled) {
        const allowed = await requestTelegramWriteAccess();

        if (!allowed) {
          setMessage('Без разрешения Telegram бот не сможет присылать новые серии.');
          return;
        }
      }

      const response = await fetch('/api/notifications/subscription', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        cache: 'no-store',
        body: JSON.stringify({
          animeId,
          animeSlug,
          animeTitle,
          episodesAired: episodesAired ?? 0,
          enabled: nextEnabled,
        }),
      });

      const data = await readJson(response);

      if (!response.ok || !data.ok) {
        throw new Error(humanizeError(data.error, data.message));
      }

      setEnabled(nextEnabled);

      if (nextEnabled) {
        setTelegramReady(true);
        setMessage('Готово. Новая серия придёт в Telegram.');
      } else {
        setMessage('Уведомления для этого тайтла выключены.');
      }
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : 'Не удалось изменить уведомления.',
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="anime-notification-control">
      <div className="anime-notification-control__copy">
        <span className="anime-notification-control__eyebrow">
          Telegram
        </span>
        <h2>Новые серии без пропусков</h2>
        <p>
          AnimeBox пришлёт сообщение, когда по расписанию выйдет следующая
          серия этого тайтла.
        </p>
      </div>

      <div className="anime-notification-control__actions">
        <button
          type="button"
          className={
            enabled
              ? 'anime-notification-control__button is-enabled'
              : 'anime-notification-control__button'
          }
          disabled={loading || busy}
          aria-pressed={enabled}
          onClick={() => void toggle()}
        >
          {loading
            ? 'Проверяем…'
            : busy
              ? 'Сохраняем…'
              : !authenticated
                ? 'Войти для уведомлений'
                : !telegramLinked
                  ? 'Подключить Telegram'
                  : enabled
                    ? '🔔 Уведомления включены'
                    : '🔕 Уведомлять о сериях'}
        </button>

        {authenticated && telegramLinked && (
          <Link href="/notifications">Настройки</Link>
        )}
      </div>

      {message && (
        <div
          className={
            telegramReady || enabled
              ? 'anime-notification-control__message is-ok'
              : 'anime-notification-control__message'
          }
          role="status"
        >
          {message}
        </div>
      )}
    </section>
  );
}
