'use client';

import { useEffect, useState } from 'react';

export type BoostyBridgePayload = {
  ok?: boolean;
  configured: boolean;
  boostyUrl: string | null;
  telegramLinked: boolean;
  telegramId: string | null;
  state:
    | 'not_configured'
    | 'telegram_not_linked'
    | 'not_member'
    | 'active'
    | 'grace_period'
    | 'error';
  memberStatus: string | null;
  subscriptionId: string | null;
  lastVerifiedAt: string | null;
  lastSuccessAt: string | null;
  graceUntil: string | null;
  lastError: string | null;
  error?: string;
};

const BOOSTY_TELEGRAM_SETTINGS = 'https://boosty.to/app/settings/external-apps';
const ANIMEBOX_TELEGRAM = 'https://t.me/YourAnimeBoxBot?startapp';

function formatDate(value: string | null) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

export default function BoostyPremiumBridge({
  authenticated,
  onPremiumChanged,
}: {
  authenticated: boolean;
  onPremiumChanged?: () => void | Promise<void>;
}) {
  const [data, setData] = useState<BoostyBridgePayload | null>(null);
  const publicBoostyUrl = data?.boostyUrl || process.env.NEXT_PUBLIC_BOOSTY_URL?.trim() || null;
  const [loading, setLoading] = useState(authenticated);
  const [checking, setChecking] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (!authenticated) {
      setLoading(false);
      setData(null);
      return;
    }

    let active = true;
    setLoading(true);
    void fetch('/api/premium/boosty', { cache: 'no-store' })
      .then(async (response) => {
        const payload = (await response.json()) as BoostyBridgePayload;
        if (!response.ok) throw new Error(payload.error || 'Не удалось загрузить Boosty Premium');
        if (active) setData(payload);
      })
      .catch((error) => {
        if (active) setMessage(error instanceof Error ? error.message : 'Не удалось загрузить Boosty Premium');
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [authenticated]);

  async function verify() {
    if (!authenticated || checking) return;
    setChecking(true);
    setMessage('');

    try {
      const response = await fetch('/api/premium/boosty', {
        method: 'POST',
        headers: { Accept: 'application/json' },
        cache: 'no-store',
      });
      const payload = (await response.json()) as BoostyBridgePayload;
      if (!response.ok) throw new Error(payload.error || 'Не удалось проверить Boosty');
      setData(payload);

      if (payload.state === 'active') {
        setMessage('Boosty подтверждён — Premium активирован ✓');
        await onPremiumChanged?.();
      } else if (payload.state === 'grace_period') {
        setMessage('Доступ в Premium-группу не найден. Включён короткий grace period.');
        await onPremiumChanged?.();
      } else if (payload.state === 'not_member') {
        setMessage('Ты пока не найден в Premium-группе. Привяжи Telegram к Boosty и вступи в группу.');
      } else if (payload.state === 'error') {
        setMessage('Telegram временно не ответил. Текущий Premium не снимается мгновенно — попробуй позже.');
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Не удалось проверить Boosty');
    } finally {
      setChecking(false);
    }
  }

  const lastCheck = formatDate(data?.lastVerifiedAt ?? null);
  const graceUntil = formatDate(data?.graceUntil ?? null);

  return (
    <section className="boosty-premium-v18">
      <div className="boosty-premium-v18__head">
        <div>
          <span>BOOSTY × ANIMEBOX</span>
          <h2>Premium через Boosty</h2>
          <p>
            Boosty управляет доступом к закрытой Telegram-группе, а AnimeBox проверяет
            привязанный Telegram и автоматически включает Premium.
          </p>
        </div>
        <div className={`boosty-premium-v18__state is-${data?.state ?? 'idle'}`}>
          {loading
            ? 'Проверяем…'
            : data?.state === 'active'
              ? 'Premium подтверждён'
              : data?.state === 'grace_period'
                ? 'Grace period'
                : data?.state === 'error'
                  ? 'Ошибка проверки'
                  : 'Не подтверждён'}
        </div>
      </div>

      <div className="boosty-premium-v18__steps">
        <article>
          <b>1</b>
          <div>
            <strong>Оформи Premium на Boosty</strong>
            <small>Используй уровень, который привязан к закрытой Premium-группе.</small>
          </div>
          {publicBoostyUrl ? (
            <a href={publicBoostyUrl} target="_blank" rel="noreferrer">Открыть Boosty ↗</a>
          ) : (
            <span className="is-muted">URL Boosty не настроен</span>
          )}
        </article>

        <article>
          <b>2</b>
          <div>
            <strong>Свяжи Boosty с Telegram</strong>
            <small>Boosty-бот выдаст приглашение в закрытую группу для твоего уровня.</small>
          </div>
          <a href={BOOSTY_TELEGRAM_SETTINGS} target="_blank" rel="noreferrer">Подключить Telegram ↗</a>
        </article>

        <article>
          <b>3</b>
          <div>
            <strong>Свяжи тот же Telegram с AnimeBox</strong>
            <small>
              {data?.telegramLinked
                ? 'Telegram уже привязан к этому аккаунту AnimeBox.'
                : 'Без этого AnimeBox не узнает, какого участника группы проверять.'}
            </small>
          </div>
          {data?.telegramLinked ? (
            <span className="is-ok">Подключён ✓</span>
          ) : authenticated ? (
            <a href={ANIMEBOX_TELEGRAM} target="_blank" rel="noreferrer">Открыть AnimeBox Bot ↗</a>
          ) : (
            <a href="/login?next=/premium">Сначала войти →</a>
          )}
        </article>
      </div>

      <div className="boosty-premium-v18__verify">
        <div>
          <strong>
            {data?.state === 'active'
              ? 'Связка работает'
              : 'Готов к проверке?'}
          </strong>
          <small>
            {lastCheck ? `Последняя проверка: ${lastCheck}. ` : ''}
            {data?.state === 'grace_period' && graceUntil ? `Льготный доступ до ${graceUntil}.` : ''}
            {data?.state === 'active' ? ` Telegram: ${data.memberStatus ?? 'member'}.` : ''}
          </small>
        </div>

        <button
          type="button"
          disabled={!authenticated || loading || checking || !data?.configured || !data?.telegramLinked}
          onClick={() => void verify()}
        >
          {checking ? 'Проверяем…' : data?.state === 'active' ? 'Проверить снова' : 'Проверить подписку'}
        </button>
      </div>

      {!authenticated && (
        <div className="boosty-premium-v18__notice">Войди в AnimeBox, чтобы привязать Boosty Premium к аккаунту.</div>
      )}
      {data && !data.configured && (
        <div className="boosty-premium-v18__notice is-warning">Boosty Premium Bridge ещё не настроен на сервере.</div>
      )}
      {message && <div className="boosty-premium-v18__notice" role="status">{message}</div>}
    </section>
  );
}
