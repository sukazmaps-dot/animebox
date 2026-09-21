'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';

import { useAuthState } from '@/components/AuthStateProvider';
import AnimeBoxLoader from '@/components/ui/AnimeBoxLoader';
import { trackProductClientEvent } from '@/lib/product-events-client';
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

type NotificationHealth = {
  status: 'unknown' | 'ok' | 'degraded' | 'failed';
  lastRunAt: string | null;
  lastSuccessAt: string | null;
  lastErrorAt: string | null;
  checked: number;
  matched: number;
  sent: number;
  failed: number;
  skipped: number;
  playerAvailable: number;
  waitingForPlayer: number;
  availabilityUnknown: number;
  durationMs: number;
  lastErrorCode: string | null;
};

type LastDelivery = {
  status: string;
  sentAt: string | null;
  attemptedAt: string | null;
  errorCode: string | null;
  animeId: number;
  episode: number;
};

type InboxItem = {
  id: number;
  animeId: number;
  animeTitle: string;
  animeSlug: string;
  episode: number;
  sentAt: string;
  readAt: string | null;
};

type InboxGroup = {
  animeId: number;
  animeTitle: string;
  animeSlug: string;
  latestEpisode: number;
  latestSentAt: string;
  ids: number[];
  episodes: number[];
  unread: number;
};

type SettingsResponse = {
  ok?: boolean;
  telegramLinked?: boolean;
  telegramEnabled?: boolean;
  telegramVerifiedAt?: string | null;
  subscriptions?: Subscription[];
  serviceHealth?: NotificationHealth;
  lastDelivery?: LastDelivery | null;
  inbox?: InboxItem[];
  unreadCount?: number;
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

function groupInbox(items: InboxItem[]): InboxGroup[] {
  const groups = new Map<number, InboxGroup>();

  for (const item of items) {
    const existing = groups.get(item.animeId);

    if (!existing) {
      groups.set(item.animeId, {
        animeId: item.animeId,
        animeTitle: item.animeTitle,
        animeSlug: item.animeSlug,
        latestEpisode: item.episode,
        latestSentAt: item.sentAt,
        ids: [item.id],
        episodes: [item.episode],
        unread: item.readAt ? 0 : 1,
      });
      continue;
    }

    existing.ids.push(item.id);
    if (!existing.episodes.includes(item.episode)) {
      existing.episodes.push(item.episode);
    }
    if (!item.readAt) existing.unread += 1;

    if (Date.parse(item.sentAt) > Date.parse(existing.latestSentAt)) {
      existing.latestSentAt = item.sentAt;
      existing.latestEpisode = item.episode;
      existing.animeTitle = item.animeTitle;
      existing.animeSlug = item.animeSlug;
    }
  }

  return [...groups.values()]
    .map((group) => ({
      ...group,
      episodes: group.episodes.sort((a, b) => b - a),
    }))
    .sort(
      (a, b) =>
        Date.parse(b.latestSentAt) - Date.parse(a.latestSentAt),
    );
}

function formatDeliveryDate(value: string) {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return '';

  const date = new Date(timestamp);
  const now = new Date();
  const sameDay =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate();

  return sameDay
    ? date.toLocaleTimeString('ru-RU', {
        hour: '2-digit',
        minute: '2-digit',
      })
    : date.toLocaleDateString('ru-RU', {
        day: '2-digit',
        month: 'short',
      });
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
  const [testing, setTesting] = useState(false);
  const [inboxBusy, setInboxBusy] = useState(false);
  const [telegramLinked, setTelegramLinked] = useState(false);
  const [telegramEnabled, setTelegramEnabled] = useState(false);
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [serviceHealth, setServiceHealth] =
    useState<NotificationHealth | null>(null);
  const [serviceOnline, setServiceOnline] = useState(false);
  const [lastDelivery, setLastDelivery] = useState<LastDelivery | null>(null);
  const [inbox, setInbox] = useState<InboxItem[]>([]);
  const [message, setMessage] = useState('');
  const centerTrackedRef = useRef(false);

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
        const response = await fetch('/api/notifications/settings', {
          cache: 'no-store',
          signal: controller.signal,
        });

        if (response.status === 401) {
          if (isTelegramMiniAppRuntime()) {
            throw new Error(
              'Сессия Telegram ещё синхронизируется. Попробуй ещё раз.',
            );
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
        const nextHealth = data.serviceHealth ?? null;
        setServiceHealth(nextHealth);
        setServiceOnline(
          Boolean(
            nextHealth?.lastRunAt &&
              Number.isFinite(Date.parse(nextHealth.lastRunAt)) &&
              Date.now() - Date.parse(nextHealth.lastRunAt) <
                15 * 60 * 1000 &&
              (nextHealth.status === 'ok' ||
                nextHealth.status === 'degraded'),
          ),
        );
        setLastDelivery(data.lastDelivery ?? null);
        setInbox(data.inbox ?? []);
        setMessage('');

        if (!centerTrackedRef.current) {
          centerTrackedRef.current = true;
          trackProductClientEvent('notification_center_open', {
            source: inTelegram ? 'telegram_mini_app' : 'web',
            path: '/notifications',
            entityType: 'surface',
            entityId: 'notification_center',
            metadata: {
              unread_count: Number(data.unreadCount ?? 0),
              subscriptions: data.subscriptions?.length ?? 0,
            },
          });
        }
      } catch (error) {
        if (!active || (error as Error).name === 'AbortError') return;

        setMessage(
          error instanceof Error
            ? error.message
            : 'Не удалось загрузить настройки.',
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

  const inboxGroups = useMemo(() => groupInbox(inbox), [inbox]);
  const unreadCount = useMemo(
    () => inbox.reduce((sum, item) => sum + (item.readAt ? 0 : 1), 0),
    [inbox],
  );
  const activeSubscriptions = useMemo(
    () => subscriptions.filter((item) => item.enabled),
    [subscriptions],
  );

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
      setMessage(
        next
          ? 'Telegram-уведомления включены.'
          : 'Все Telegram-уведомления приостановлены.',
      );
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : 'Не удалось обновить настройку.',
      );
    } finally {
      setBusy(false);
    }
  }

  async function testTelegram() {
    if (testing || !telegramLinked) return;

    setTesting(true);
    setMessage('');

    try {
      const allowed = await requestTelegramWriteAccess();
      if (!allowed) {
        throw new Error(
          'Telegram не дал разрешение на сообщения от бота.',
        );
      }

      const response = await fetch('/api/notifications/test', {
        method: 'POST',
        cache: 'no-store',
      });
      const data = await readJson(response);

      if (!response.ok || !data.ok) {
        throw new Error(errorMessage(data));
      }

      setTelegramEnabled(true);
      setMessage(
        'Тест отправлен. Проверь личные сообщения от AnimeBox Bot.',
      );
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : 'Не удалось отправить тестовое уведомление.',
      );
    } finally {
      setTesting(false);
    }
  }

  async function toggleSubscription(item: Subscription) {
    if (busy) return;

    const next = !item.enabled;
    setBusy(true);
    setMessage('');

    try {
      if (next) {
        const allowed = await requestTelegramWriteAccess();
        if (!allowed) {
          throw new Error(
            'Telegram не дал разрешение на сообщения от бота.',
          );
        }
      }

      const response = await fetch('/api/notifications/subscription', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        cache: 'no-store',
        body: JSON.stringify(
          next
            ? {
                animeId: item.anime_id,
                enabled: true,
                episodesAired: Math.max(0, item.min_episode - 1),
                animeSlug: item.anime_slug,
                animeTitle: item.anime_title,
              }
            : {
                animeId: item.anime_id,
                enabled: false,
              },
        ),
      });
      const data = await readJson(response);

      if (!response.ok || !data.ok) {
        throw new Error(errorMessage(data));
      }

      setSubscriptions((current) =>
        current.map((subscription) =>
          subscription.anime_id === item.anime_id
            ? { ...subscription, enabled: next }
            : subscription,
        ),
      );
      if (next) setTelegramEnabled(true);

      trackProductClientEvent('notification_subscription_toggle', {
        source: 'notification_center',
        path: '/notifications',
        entityType: 'anime_id',
        entityId: String(item.anime_id),
        metadata: {
          enabled: next,
          min_episode: item.min_episode,
        },
      });

      setMessage(
        next
          ? 'Подписка включена.'
          : 'Подписка выключена.',
      );
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : 'Не удалось обновить подписку.',
      );
    } finally {
      setBusy(false);
    }
  }

  function markInboxOptimistic(ids: number[]) {
    const idSet = new Set(ids);
    const readAt = new Date().toISOString();

    setInbox((current) =>
      current.map((item) =>
        idSet.has(item.id) && !item.readAt
          ? { ...item, readAt }
          : item,
      ),
    );
  }

  async function markInboxRead(ids: number[]) {
    if (!ids.length) return;

    markInboxOptimistic(ids);

    try {
      await fetch('/api/notifications/inbox', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids }),
        cache: 'no-store',
        keepalive: true,
      });
    } catch {
      // Read state is non-critical and can be retried on the next page visit.
    }
  }

  async function markAllRead() {
    if (inboxBusy || unreadCount === 0) return;
    setInboxBusy(true);

    const unreadIds = inbox
      .filter((item) => !item.readAt)
      .map((item) => item.id);

    markInboxOptimistic(unreadIds);

    try {
      const response = await fetch('/api/notifications/inbox', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ all: true }),
        cache: 'no-store',
      });

      if (!response.ok) {
        throw new Error('Не удалось отметить уведомления прочитанными.');
      }
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : 'Не удалось обновить уведомления.',
      );
    } finally {
      setInboxBusy(false);
    }
  }

  if (loading) {
    return (
      <div className="notifications-page__loading">
        <AnimeBoxLoader
          label="Загружаем уведомления…"
          size={48}
        />
      </div>
    );
  }

  return (
    <div className="notifications-page__content">
      <section className="notifications-hero">
        <div>
          <span className="notifications-hero__eyebrow">
            AnimeBox · Notifications
          </span>
          <h1>Центр уведомлений</h1>
          <p>
            Новые серии остаются здесь и одновременно могут приходить
            в Telegram. Открывай нужную серию одним нажатием и управляй
            подписками без повторного поиска тайтла.
          </p>
        </div>

        <div className="notifications-hero__actions">
          <div className="notifications-hero__status">
            <span className={telegramLinked ? 'is-online' : ''} />
            {telegramLinked
              ? 'Telegram подключён'
              : 'Telegram не подключён'}
          </div>
          <div className="notifications-hero__status">
            <span className={serviceOnline ? 'is-online' : ''} />
            {serviceOnline
              ? 'Доставка работает'
              : 'Проверяем доставку'}
          </div>
        </div>
      </section>

      <section className="notifications-card notifications-inbox">
        <div className="notifications-card__head">
          <div>
            <span>Последние события</span>
            <h2>
              Новые серии
              {unreadCount > 0 && (
                <b className="notifications-inbox__count">
                  {unreadCount}
                </b>
              )}
            </h2>
          </div>

          {unreadCount > 0 && (
            <button
              type="button"
              className="notification-master"
              disabled={inboxBusy}
              onClick={() => void markAllRead()}
            >
              {inboxBusy ? 'Сохраняем…' : 'Прочитать все'}
            </button>
          )}
        </div>

        {inboxGroups.length === 0 ? (
          <div className="notifications-empty">
            <Image
              className="notifications-empty__art"
              src="/brand/illustrations/empty-notifications.webp"
              alt=""
              width={128}
              height={128}
              sizes="128px"
              aria-hidden="true"
            />
            <p>
              Здесь появятся серии тайтлов, на которые ты подписан.
            </p>
            <Link href="/search">Найти аниме</Link>
          </div>
        ) : (
          <div className="notifications-inbox__list">
            {inboxGroups.map((group) => (
              <Link
                key={group.animeId}
                href={`/anime/${group.animeSlug}/episode/${group.latestEpisode}`}
                className={
                  group.unread > 0
                    ? 'notifications-inbox__item is-unread'
                    : 'notifications-inbox__item'
                }
                onClick={() => {
                  if (group.unread > 0) {
                    void markInboxRead(group.ids);
                  }
                }}
              >
                <span
                  className="notifications-inbox__marker"
                  aria-hidden="true"
                />
                <div className="notifications-inbox__copy">
                  <strong>{group.animeTitle}</strong>
                  <span>
                    {group.episodes.length > 1
                      ? `Новые серии: ${group.episodes
                          .slice(0, 4)
                          .sort((a, b) => a - b)
                          .join(', ')}`
                      : `Вышла ${group.latestEpisode} серия`}
                  </span>
                </div>
                <time dateTime={group.latestSentAt}>
                  {formatDeliveryDate(group.latestSentAt)}
                </time>
                <span
                  className="notifications-inbox__arrow"
                  aria-hidden="true"
                >
                  →
                </span>
              </Link>
            ))}
          </div>
        )}
      </section>

      <section className="notifications-card">
        <div className="notifications-card__head">
          <div>
            <span>Канал доставки</span>
            <h2>Telegram</h2>
          </div>

          <button
            type="button"
            className={
              telegramEnabled
                ? 'notification-master is-enabled'
                : 'notification-master'
            }
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

        {telegramLinked && (
          <div className="notifications-test-row">
            <div>
              <strong>Проверка доставки</strong>
              <span>
                {lastDelivery?.sentAt
                  ? `Последняя успешная доставка: ${new Date(
                      lastDelivery.sentAt,
                    ).toLocaleString('ru-RU')}`
                  : 'Отправь тест, чтобы убедиться, что бот может писать тебе в личные сообщения.'}
              </span>
              {serviceHealth?.waitingForPlayer ? (
                <span>
                  Сейчас ожидаем появление в плеере:{' '}
                  {serviceHealth.waitingForPlayer}
                </span>
              ) : null}
            </div>

            <button
              type="button"
              className="notification-master"
              disabled={testing || busy}
              onClick={() => void testTelegram()}
            >
              {testing ? 'Отправляем…' : 'Отправить тест'}
            </button>
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
            <Image
              className="notifications-empty__art"
              src="/brand/illustrations/empty-notifications.webp"
              alt=""
              width={128}
              height={128}
              sizes="128px"
              aria-hidden="true"
            />
            <p>
              Пока нет подписок. Открой аниме и нажми
              «Уведомлять о сериях».
            </p>
            <Link href="/search">Открыть каталог</Link>
          </div>
        ) : (
          <div className="notifications-list">
            {subscriptions.map((item) => (
              <article
                key={item.anime_id}
                className={
                  item.enabled
                    ? 'notifications-list__item'
                    : 'notifications-list__item is-disabled'
                }
              >
                <div>
                  <Link href={`/anime/${item.anime_slug}`}>
                    {item.anime_title}
                  </Link>
                  <span>
                    {item.enabled
                      ? `Следим начиная с ${item.min_episode} серии`
                      : 'Уведомления выключены'}
                  </span>
                </div>

                <button
                  type="button"
                  className={item.enabled ? '' : 'is-enable'}
                  disabled={busy}
                  onClick={() => void toggleSubscription(item)}
                >
                  {item.enabled ? 'Выключить' : 'Включить'}
                </button>
              </article>
            ))}
          </div>
        )}
      </section>

      {message && (
        <div
          className="notifications-page__message"
          role="status"
        >
          {message}
        </div>
      )}
    </div>
  );
}
