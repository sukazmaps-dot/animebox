'use client';

import Image from 'next/image';
import {
  type ReactNode,
  useCallback,
  useEffect,
  useState,
} from 'react';

type GateState =
  | 'detecting'
  | 'checking'
  | 'allowed'
  | 'blocked';

const CHANNEL_URL_FALLBACK = 'https://t.me/YourAnimeBox';

type GateResponse = {
  ok?: boolean;
  subscribed?: boolean;
  memberStatus?: string;
  channelUrl?: string;
  error?: string;
};

function getTelegramMiniApp(): TelegramWebApp | null {
  if (typeof window === 'undefined') {
    return null;
  }

  const telegram = window.Telegram?.WebApp;
  const initData = telegram?.initData?.trim();
  const telegramId = telegram?.initDataUnsafe?.user?.id;

  // The Telegram SDK is loaded on the normal website too, therefore the
  // existence of window.Telegram/WebApp alone MUST NOT activate the gate.
  // A real Mini App launch must contain signed initData and a Telegram user.
  if (
    !telegram ||
    !initData ||
    !Number.isSafeInteger(telegramId) ||
    Number(telegramId) <= 0
  ) {
    return null;
  }

  return telegram;
}

function gateErrorText(code?: string) {
  switch (code) {
    case 'expired':
      return 'Сессия Telegram устарела. Закрой Mini App и открой его заново.';

    case 'invalid_hash':
    case 'missing_hash':
    case 'invalid_user':
    case 'missing_user':
      return 'Не удалось подтвердить запуск через Telegram.';

    case 'telegram_membership_not_configured':
      return 'Проверка подписки временно не настроена.';

    case 'telegram_membership_check_failed':
      return 'Telegram пока не смог проверить подписку. Попробуй ещё раз.';

    default:
      return 'Не удалось проверить подписку. Попробуй ещё раз.';
  }
}

export default function TelegramSubscriptionGate({
  children,
}: {
  children: ReactNode;
}) {
  // Important: detecting does NOT lock the regular website.
  // Only a confirmed Telegram Mini App launch can switch to checking/blocked.
  const [state, setState] = useState<GateState>('detecting');
  const [channelUrl, setChannelUrl] = useState(CHANNEL_URL_FALLBACK);
  const [checkingAgain, setCheckingAgain] = useState(false);

  const checkMembership = useCallback(async (isRetry = false) => {
    const telegram = getTelegramMiniApp();

    // youranimebox.com opened in Chrome/Safari/normal Telegram browser:
    // no subscription gate at all.
    if (!telegram) {
      document.documentElement.dataset.telegramSubscribed = 'not-applicable';
      setCheckingAgain(false);
      setState('allowed');
      return;
    }

    if (isRetry) {
      setCheckingAgain(true);
    } else {
      setState('checking');
    }

    try {
      const response = await fetch('/api/telegram/subscription-check', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({
          initData: telegram.initData,
        }),
        cache: 'no-store',
      });

      const data = (await response.json()) as GateResponse;

      if (data.channelUrl) {
        setChannelUrl(data.channelUrl);
      }

      if (!response.ok || !data.ok) {
        console.error('[Telegram subscription gate]', {
          status: response.status,
          error: data.error,
          message: gateErrorText(data.error),
        });

        // Inside a real Mini App we fail closed: access remains gated.
        setState('blocked');
        return;
      }

      if (data.subscribed) {
        document.documentElement.dataset.telegramSubscribed = 'true';
        setState('allowed');
        return;
      }

      document.documentElement.dataset.telegramSubscribed = 'false';
      setState('blocked');
    } catch (error) {
      console.error('[Telegram subscription gate]', error);

      // Only a real Mini App reaches this branch.
      setState('blocked');
    } finally {
      setCheckingAgain(false);
    }
  }, []);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      void checkMembership(false);
    });

    return () => {
      window.cancelAnimationFrame(frame);
    };
  }, [checkMembership]);

  useEffect(() => {
    const telegram = getTelegramMiniApp();

    if (!telegram) {
      return;
    }

    const recheckAfterReturn = () => {
      if (state === 'blocked') {
        void checkMembership(true);
      }
    };

    telegram.onEvent?.('activated', recheckAfterReturn);

    return () => {
      telegram.offEvent?.('activated', recheckAfterReturn);
    };
  }, [checkMembership, state]);

  function openChannel() {
    if (!channelUrl) {
      return;
    }

    const telegram = getTelegramMiniApp();

    if (telegram?.openTelegramLink) {
      telegram.openTelegramLink(channelUrl);
      return;
    }

    window.open(channelUrl, '_blank', 'noopener,noreferrer');
  }

  // Detecting is intentionally not locked. This prevents the normal website
  // from ever being covered by the Telegram gate during hydration.
  const locked = state === 'checking' || state === 'blocked';

  return (
    <div className="telegram-subscription-gate">
      <div
        className={
          locked
            ? 'telegram-subscription-gate__content is-locked'
            : 'telegram-subscription-gate__content'
        }
        inert={locked ? true : undefined}
        aria-hidden={locked ? true : undefined}
      >
        {children}
      </div>

      {locked && (
        <div
          className="telegram-subscription-gate__overlay"
          role="dialog"
          aria-modal="true"
          aria-label="Подписка на канал AnimeBox"
        >
          <div className="telegram-subscription-gate__glow" />

          <div className="telegram-subscription-gate__card">
            <div className="telegram-subscription-gate__logo">
              <Image
                src="/brand/favicon.png"
                alt="AnimeBox"
                width={58}
                height={58}
                priority
              />
            </div>

            {state === 'checking' ? (
              <>
                <div className="telegram-subscription-gate__spinner" />
                <h1>Проверяем подписку</h1>
                <p>
                  Ещё секунду — AnimeBox проверяет доступ через Telegram.
                </p>
              </>
            ) : (
              <>
                <span className="telegram-subscription-gate__eyebrow">
                  ANIMEBOX MINI APP
                </span>
                <h1>Подписка на канал обязательна</h1>
                <p>
                  Чтобы пользоваться AnimeBox и ботом, подпишись на наш
                  Telegram-канал. После подписки вернись сюда и нажми
                  «Я подписался».
                </p>

                <div className="telegram-subscription-gate__actions">
                  <button
                    type="button"
                    className="telegram-subscription-gate__primary"
                    onClick={openChannel}
                    disabled={!channelUrl}
                  >
                    Подписаться на канал
                  </button>

                  <button
                    type="button"
                    className="telegram-subscription-gate__secondary"
                    onClick={() => void checkMembership(true)}
                    disabled={checkingAgain}
                  >
                    {checkingAgain ? 'Проверяем…' : 'Я подписался'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
