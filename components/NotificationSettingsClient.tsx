'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

import { useAuthState } from '@/components/AuthStateProvider';
import AnimeBoxLoader from '@/components/ui/AnimeBoxLoader';
import { isTelegramMiniAppRuntime } from '@/lib/telegram-auto-login';

type Subscription = {
  anime_id: number;
  anime_slug: string;
  anime_title: string;
  enabled: boolean;
  min_episode: number;
  created_at: string;
  updated_at: string;
};

type SettingsResponse = {
  ok?: boolean;
  telegramLinked?: boolean;
  telegramEnabled?: boolean;
  telegramVerifiedAt?: string | null;
  subscriptions?: Subscription[];
  error?: string;
  message?: string;
};

async function readJson(response: Response): Promise<SettingsResponse> {
  const text = await response.text();
  if (!text) return {};

  try {
    return JSON.parse(text) as SettingsResponse;
  } catch {
    return { ok: false, error: `http_${response.status}` };
  }
}

async function requestTelegramWriteAccess() {
  const telegram = window.Telegram?.WebApp;

  if (!telegram?.initData) return true;
  if (telegram.initDataUnsafe.user?.allows_write_to_pm === true) return true;
  if (typeof telegram.requestWriteAccess !== 'function') return true;

  return await new Promise<boolean>((resolve) => {
    telegram.requestWriteAccess?.((allowed) => resolve(Boolean(allowed)));
  });
}

function errorMessage(data: SettingsResponse) {
  switch (data.error) {
    case 'telegram_not_linked':
      return 'Telegram пока не привязан к этому профилю.';
    case 'telegram_write_access_required':
      return 'Разреши боту AnimeBox отправлять личные сообщения.';
    case 'telegram_not_verified':
      return 'Сначала отправь тестовое сообщение.';
    default:
      return data.message || 'Не удалось обновить настройки.';
  }
}

export default function NotificationSettingsClient() {
  const {
    user,
    loading: authLoading,
    telegramMiniApp,
    telegramAutoLoginDisabled,
  } = useAuthState();

  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [telegramLinked, setTelegramLinked] = useState(false);
  const [telegramEnabled, setTelegramEnabled] = useState(false);
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [message, setMessage] = useState('');

  useEffect(() => {
    let active = true;
    const controller = new AbortController();

    const inTelegram = telegramMiniApp || isTelegramMiniAppRuntime();
    const waitingForTelegramAuth =
      inTelegram && !telegramAutoLoginDisabled && !user;

    if (authLoading || waitingForTelegramAuth) {
      const timer = window.setTimeout(() => {
        if (!active) return;
        setLoading(true);
        setMessage('');
      }, 0);

      return () => {
        active = false;
        controller.abort();
        window.clearTimeout(timer);
      };
    }

    if (!user) {
      window.location.replace('/login?next=%2Fnotifications');

      return () => {
        active = false;
        controller.abort();
      };
    }

    async function loadSettings() {
      try {
        setLoading(true);
        setMessage('');

        const response = await fetch('/api/notifications/settings', {
          cache: 'no-store',
          signal: controller.signal,
        });

        if (response.status === 401) {
          // The provider already says we have a user. A transient 401 can occur
          // while the Telegram-created browser session is finishing its cookie
          // sync, so do not bounce the Mini App to /login immediately.
          if (isTelegramMiniAppRuntime()) {
            throw new Error('Сессия Telegram ещё синхронизируется. Попробуй ещё раз.');
          }

          window.location.replace('/login?next=%2Fnotifications');
          return;
        }

        const data = await readJson(response);

        if (!response.ok || !data.ok) {
          throw new Error(errorMessage(data));
        }

        if (!active) return;

        setTelegramLinked(Boolean(data.telegramLinked));
        setTelegramEnabled(Boolean(data.telegramEnabled));
        setSubscriptions(data.subscriptions ?? []);
      } catch (error) {
        if (!active || (error as Error).name === 'AbortError') return;

        setMessage(
          error instanceof Error ? error.message : 'Не удалось загрузить настройки.',
        );
      } finally {
        if (active) setLoading(false);
      }
    }

    const timer = window.setTimeout(() => {
      void loadSettings();
    }, 0);

    return () => {
      active = false;
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [
    authLoading,
    telegramAutoLoginDisabled,
    telegramMiniApp,
    user,
  ]);

  async function toggleGlobal() {
    if (busy || !telegramLinked) return;
    setBusy(true);
    setMessage('');

    try {
      const next = !telegramEnabled;

      if (next) {
        const allowed = await requestTelegramWriteAccess();

        if (!allowed) {
          setMessage('Telegram не дал разрешение на сообщения от бота.');
          return;
        }
      }

      const response = await fetch('/api/notifications/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        cache: 'no-store',
        body: JSON.stringify({ telegramEnabled: next }),
      });
      const data = await readJson(response);

      if (!response.ok || !data.ok) throw new Error(errorMessage(data));

      setTelegramEnabled(next);
      setMessage(next ? 'Telegram-уведомления включены.' : 'Все Telegram-уведомления приостановлены.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Не удалось обновить настройку.');
    } finally {
      setBusy(false);
    }
  }

  async function disableSubscription(animeId: number) {
    if (busy) return;
    setBusy(true);
    setMessage('');

    try {
      const response = await fetch('/api/notifications/subscription', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        cache: 'no-store',
        body: JSON.stringify({ animeId, enabled: false }),
      });
      const data = await readJson(response);

      if (!response.ok || !data.ok) throw new Error(errorMessage(data));

      setSubscriptions((current) =>
        current.map((item) =>
          item.anime_id === animeId ? { ...item, enabled: false } : item,
        ),
      );
      setMessage('Подписка выключена.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Не удалось выключить подписку.');
    } finally {
      setBusy(false);
    }
  }

  const activeSubscriptions = subscriptions.filter((item) => item.enabled);

  if (loading) {
    return (
      <div className="notifications-page__loading">
        <AnimeBoxLoader label="Загружаем уведомления…" size={48} />
      </div>
    );
  }

  return (
    <div className="notifications-page__content">
      <section className="notifications-hero">
        <div>
          <span className="notifications-hero__eyebrow">ANIMEBOX × TELEGRAM</span>
          <h1>Уведомления о новых сериях</h1>
          <p>
            Подпишись на конкретный тайтл — AnimeBox напишет тебе в Telegram,
            когда по расписанию выйдет следующая серия.
          </p>
        </div>

        <div className="notifications-hero__status">
          <span className={telegramLinked ? 'is-online' : ''} />
          {telegramLinked ? 'Telegram подключён' : 'Telegram не подключён'}
        </div>
      </section>

      <section className="notifications-card">
        <div className="notifications-card__head">
          <div>
            <span>Канал доставки</span>
            <h2>Telegram</h2>
          </div>

          <button
            type="button"
            className={telegramEnabled ? 'notification-master is-enabled' : 'notification-master'}
            disabled={busy || !telegramLinked}
            onClick={() => void toggleGlobal()}
          >
            {telegramEnabled ? 'Включено' : 'Выключено'}
          </button>
        </div>

        {!telegramLinked && (
          <div className="notifications-empty">
            <p>Сначала привяжи Telegram к AnimeBox.</p>
            <a
              href="https://t.me/YourAnimeBoxBot?startapp"
              target="_blank"
              rel="noreferrer"
            >
              Открыть Telegram Mini App
            </a>
          </div>
        )}
      </section>

      <section className="notifications-card">
        <div className="notifications-card__head">
          <div>
            <span>Подписки</span>
            <h2>Тайтлы</h2>
          </div>
          <b>{activeSubscriptions.length}</b>
        </div>

        {subscriptions.length === 0 ? (
          <div className="notifications-empty">
            <img className="notifications-empty__art" src="/brand/illustrations/empty-notifications.webp" alt="" aria-hidden="true" />
            <p>Пока нет подписок. Открой аниме и нажми «Уведомлять о сериях».</p>
            <Link href="/search">Открыть каталог</Link>
          </div>
        ) : (
          <div className="notifications-list">
            {subscriptions.map((item) => (
              <article
                key={item.anime_id}
                className={item.enabled ? 'notifications-list__item' : 'notifications-list__item is-disabled'}
              >
                <div>
                  <Link href={`/anime/${item.anime_slug}`}>{item.anime_title}</Link>
                  <span>
                    {item.enabled
                      ? `Следим начиная с ${item.min_episode} серии`
                      : 'Уведомления выключены'}
                  </span>
                </div>

                {item.enabled && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void disableSubscription(item.anime_id)}
                  >
                    Выключить
                  </button>
                )}
              </article>
            ))}
          </div>
        )}
      </section>

      {message && <div className="notifications-page__message" role="status">{message}</div>}
    </div>
  );
}
