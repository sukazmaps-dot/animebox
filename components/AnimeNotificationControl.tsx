'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { telegramMiniAppUrl } from '@/lib/telegram-links';

type SubscriptionResponse = {
  ok?: boolean;
  enabled?: boolean;
  telegramLinked?: boolean;
  telegramReady?: boolean;
  animeFinished?: boolean;
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
    case 'anime_finished':
      return 'Тайтл уже завершён — новых серий по расписанию не ожидается.';
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
  isFinished = false,
  variant = 'card',
}: {
  animeId: number;
  animeSlug: string;
  animeTitle: string;
  episodesAired: number | null;
  isFinished?: boolean;
  variant?: 'card' | 'compact';
}) {
  const compact = variant === 'compact';
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [authenticated, setAuthenticated] = useState(true);
  const [telegramLinked, setTelegramLinked] = useState(false);
  const [telegramReady, setTelegramReady] = useState(false);
  const [finished, setFinished] = useState(isFinished);
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
        setFinished(Boolean(data.animeFinished ?? isFinished));
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
  }, [animeId, isFinished]);

  async function toggle() {
    if (busy) return;

    if (!authenticated) {
      router.push('/login');
      return;
    }

    if (finished && !enabled) {
      setMessage('Тайтл завершён — новых серий по расписанию не ожидается.');
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
    <section
      className={
        compact
          ? 'anime-notification-control is-compact'
          : 'anime-notification-control'
      }
    >
      <div className="anime-notification-control__art" aria-hidden="true">
        <Image
          src="/brand/illustrations/empty-notifications.webp"
          alt=""
          width={190}
          height={150}
          sizes={compact ? '72px' : '(max-width: 700px) 96px, 150px'}
        />
      </div>

      <div className="anime-notification-control__copy">
        <div className="anime-notification-control__eyebrow-row">
          <span className="anime-notification-control__eyebrow">Telegram</span>
          {enabled && (
            <span className="anime-notification-control__status">Активно</span>
          )}
        </div>

        <h2>{compact ? 'Не пропускай новые серии' : 'Новые серии без пропусков'}</h2>
        <p>
          {finished && !enabled
            ? 'Тайтл уже завершён. Для него больше не нужно ждать новые серии.'
            : 'AnimeBox пришлёт сообщение, когда серия реально появится в плеере.'}
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
          disabled={loading || busy || (finished && !enabled)}
          aria-pressed={enabled}
          onClick={() => void toggle()}
        >
          {loading
            ? 'Проверяем…'
            : busy
              ? 'Сохраняем…'
              : !authenticated
                ? 'Войти для уведомлений'
                : finished && !enabled
                  ? 'Тайтл завершён'
                  : !telegramLinked
                    ? 'Подключить Telegram'
                    : enabled
                      ? 'Уведомления включены'
                      : 'Отслеживать новые серии'}
        </button>

        {authenticated && telegramLinked && (
          <Link href="/notifications">Настроить</Link>
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
