'use client';

import {
  BellRingingIcon,
  CheckCircleIcon,
  GearSixIcon,
} from '@phosphor-icons/react';
import { motion, useReducedMotion } from 'framer-motion';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

import AnimeBoxIconCore from '@/components/ui/AnimeBoxIconCore';
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
  const reducedMotion = useReducedMotion();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [authenticated, setAuthenticated] = useState(true);
  const [telegramLinked, setTelegramLinked] = useState(false);
  const [telegramReady, setTelegramReady] = useState(false);
  const [finished, setFinished] = useState(isFinished);
  const [enabled, setEnabled] = useState(false);
  const [message, setMessage] = useState('');
  const terminalFinished = finished && !enabled;

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

  if (compact) {
    const compactLabel = terminalFinished
      ? 'Тайтл завершён'
      : loading
        ? 'Проверяем уведомления…'
        : busy
          ? 'Сохраняем…'
          : !authenticated
            ? 'Войти для уведомлений'
            : !telegramLinked
              ? 'Подключить Telegram'
              : enabled
                ? 'Уведомления включены'
                : 'Уведомлять о новых сериях';

    return (
      <section className="episode-notification-compact">
        <button
          type="button"
          className={enabled ? 'is-enabled' : ''}
          disabled={loading || busy || terminalFinished}
          aria-pressed={enabled}
          onClick={() => void toggle()}
        >
          <BellRingingIcon size={19} weight={enabled ? 'fill' : 'regular'} aria-hidden="true" />
          <span>{compactLabel}</span>
        </button>

        {authenticated && telegramLinked && !terminalFinished && (
          <Link
            href="/notifications"
            className="episode-notification-compact__settings"
            aria-label="Настроить уведомления"
            title="Настроить уведомления"
          >
            <GearSixIcon size={17} weight="regular" aria-hidden="true" />
          </Link>
        )}

        {message && (
          <span
            className={
              telegramReady || enabled
                ? 'episode-notification-compact__message is-ok'
                : 'episode-notification-compact__message'
            }
            role="status"
          >
            {message}
          </span>
        )}
      </section>
    );
  }

  return (
    <section className="anime-notification-control anime-notification-control--luminous">
      <div className="anime-notification-control__art">
        <AnimeBoxIconCore
          size={compact ? 'compact' : 'default'}
          className="anime-notification-control__icon-core"
        >
          <motion.span
            className="anime-notification-control__bell"
            animate={
              reducedMotion || enabled || finished
                ? undefined
                : { rotate: [-7, 7, -7] }
            }
            transition={{
              duration: 2.4,
              ease: 'easeInOut',
              repeat: Infinity,
            }}
          >
            <BellRingingIcon
              size={compact ? 24 : 28}
              weight={enabled ? 'fill' : 'regular'}
            />
          </motion.span>
        </AnimeBoxIconCore>
      </div>

      <div className="anime-notification-control__copy">
        <div className="anime-notification-control__eyebrow-row">
          <span className="anime-notification-control__eyebrow">Telegram · уведомления</span>
          {enabled && (
            <span className="anime-notification-control__status">
              <CheckCircleIcon size={13} weight="fill" aria-hidden="true" />
              Активно
            </span>
          )}
        </div>

        <h2>
          {terminalFinished
            ? 'Тайтл завершён'
            : compact
              ? 'Не пропускай новые серии'
              : 'Новая серия — сразу в Telegram'}
        </h2>
        <p>
          {terminalFinished
            ? 'Новых серий больше не ожидается.'
            : 'AnimeBox отправит уведомление только когда серия действительно появится в плеере.'}
        </p>
      </div>

      <div className="anime-notification-control__actions">
        {terminalFinished ? (
          <span className="anime-notification-control__finished-status" aria-label="Тайтл завершён">
            <CheckCircleIcon size={15} weight="fill" aria-hidden="true" />
            Завершено
          </span>
        ) : (
          <button
            type="button"
            className={
              enabled
                ? 'ab-action ab-action--secondary anime-notification-control__button is-enabled'
                : 'ab-action ab-action--primary anime-notification-control__button'
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
                      ? 'Уведомления включены'
                      : 'Отслеживать серии'}
          </button>
        )}

        {authenticated && telegramLinked && !terminalFinished && (
          <Link href="/notifications" className="anime-notification-control__settings">
            <GearSixIcon size={17} weight="regular" aria-hidden="true" />
            Настроить
          </Link>
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
