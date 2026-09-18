'use client';

import Link from 'next/link';
import Image from 'next/image';
import { useEffect, useRef, useState } from 'react';

import { useAuthState } from '@/components/AuthStateProvider';
import AnimeBoxStar from './AnimeBoxStar';
import BoostySupport from './BoostySupport';

import {
  MONETIZATION_ENABLED,
  SUPPORT_STAR_PACKS,
  SUPPORT_URL,
  TELEGRAM_STARS_ENABLED,
  type SupportStarAmount,
} from '@/lib/monetization';

type InvoiceResponse = {
  ok?: boolean;
  invoiceUrl?: string;
  error?: string;
};

type InvoiceStatus =
  | 'paid'
  | 'cancelled'
  | 'failed'
  | 'pending';

type DonatePayClaim = {
  id: string;
  status: 'pending' | 'claimed' | 'expired' | 'cancelled';
  createdAt: string;
  expiresAt: string;
  claimedAt: string | null;
  transaction: null | {
    id: string;
    amount: number;
    currency: string;
    paidAt: string | null;
  };
};

type DonatePayClaimResponse = {
  ok?: boolean;
  configured?: boolean;
  claim?: DonatePayClaim | null;
  claimCode?: string;
  supportUrl?: string;
  syncError?: string | null;
  error?: string;
};

function statusText(status: InvoiceStatus | '') {
  switch (status) {
    case 'paid':
      return 'Спасибо 💜 Telegram подтвердил оплату. Статус обновится после обработки платежа.';
    case 'pending':
      return 'Платёж обрабатывается Telegram…';
    case 'failed':
      return 'Платёж не прошёл. Попробуй ещё раз.';
    case 'cancelled':
      return 'Платёж отменён.';
    default:
      return '';
  }
}

export function SupportAnimeBoxCard() {
  if (!MONETIZATION_ENABLED) return null;

  return (
    <div className="panel support-animebox-card">
      <span className="support-animebox-card__eyebrow">ПОДДЕРЖАТЬ ANIMEBOX</span>
      <Image
        src="/brand/illustrations/support-stars.webp"
        width={360}
        height={240}
        alt=""
        aria-hidden="true"
        className="support-animebox-card__art"
        unoptimized
      />
      <h2>Помоги проекту расти</h2>
      <p>
        Серверы, домен и новые функции требуют ресурсов. Любая поддержка помогает развивать AnimeBox дальше.
      </p>
      <Link className="btn btn--primary" href="/support">
        Поддержать проект
      </Link>
    </div>
  );
}

export default function SupportAnimeBox() {
  const { user } = useAuthState();
  const [loadingAmount, setLoadingAmount] =
    useState<SupportStarAmount | null>(null);
  const [invoiceStatus, setInvoiceStatus] =
    useState<InvoiceStatus | ''>('');
  const [errorText, setErrorText] = useState('');

  const [donatePayConfigured, setDonatePayConfigured] = useState<boolean | null>(null);
  const [claim, setClaim] = useState<DonatePayClaim | null>(null);
  const [claimCode, setClaimCode] = useState('');
  const [claimBusy, setClaimBusy] = useState(false);
  const [claimError, setClaimError] = useState('');
  const [copied, setCopied] = useState(false);
  const claimedEventRef = useRef<string | null>(null);

  useEffect(() => {
    if (!user?.id) {
      setClaim(null);
      setClaimCode('');
      setDonatePayConfigured(null);
      return;
    }

    let active = true;

    void fetch('/api/monetization/donatepay/claim?sync=1', {
      cache: 'no-store',
    })
      .then(async (response) => {
        const payload = (await response.json()) as DonatePayClaimResponse;
        if (!response.ok) throw new Error(payload.error || 'Не удалось проверить DonatePay');
        if (!active) return;
        setDonatePayConfigured(payload.configured ?? false);
        setClaim(payload.claim ?? null);
      })
      .catch((error) => {
        if (!active) return;
        setClaimError(error instanceof Error ? error.message : 'Не удалось проверить DonatePay');
      });

    return () => {
      active = false;
    };
  }, [user?.id]);

  useEffect(() => {
    if (!user?.id || claim?.status !== 'pending') return;

    let active = true;

    const poll = async () => {
      try {
        const response = await fetch('/api/monetization/donatepay/claim?sync=1', {
          cache: 'no-store',
        });
        const payload = (await response.json()) as DonatePayClaimResponse;
        if (!response.ok) throw new Error(payload.error || 'Не удалось проверить донат');
        if (!active) return;
        setDonatePayConfigured(payload.configured ?? false);
        setClaim(payload.claim ?? null);
        if (payload.syncError) setClaimError(payload.syncError);
      } catch (error) {
        if (!active) return;
        setClaimError(error instanceof Error ? error.message : 'Не удалось проверить донат');
      }
    };

    const interval = window.setInterval(() => {
      if (document.visibilityState === 'visible') void poll();
    }, 25_000);

    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, [claim?.status, user?.id]);

  useEffect(() => {
    if (claim?.status !== 'claimed') return;
    if (claimedEventRef.current === claim.id) return;
    claimedEventRef.current = claim.id;
    window.dispatchEvent(new Event('animebox:support-paid'));
  }, [claim]);

  if (!MONETIZATION_ENABLED) {
    return (
      <div className="support-box support-box--disabled">
        <strong>Поддержка временно отключена</strong>
        <p>Монетизация AnimeBox сейчас недоступна.</p>
      </div>
    );
  }

  async function payWithStars(amount: SupportStarAmount) {
    if (!TELEGRAM_STARS_ENABLED || loadingAmount !== null) {
      return;
    }

    setLoadingAmount(amount);
    setInvoiceStatus('');
    setErrorText('');

    try {
      const tg = window.Telegram?.WebApp;
      const initData = tg?.initData?.trim() || '';

      const response = await fetch('/api/monetization/stars/invoice', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({
          amount,
          initData,
        }),
        cache: 'no-store',
      });

      const data = (await response.json()) as InvoiceResponse;

      if (!response.ok || !data.ok || !data.invoiceUrl) {
        throw new Error(data.error || 'invoice_failed');
      }

      if (tg?.initData?.trim() && tg.openInvoice) {
        tg.openInvoice(
          data.invoiceUrl,
          (status) => {
            setInvoiceStatus(status);
            if (status === 'paid') window.dispatchEvent(new Event('animebox:support-paid'));
          },
        );
      } else {
        window.location.assign(data.invoiceUrl);
      }
    } catch (error) {
      console.error('[AnimeBox Stars] payment UI:', error);
      setErrorText(
        'Не удалось открыть оплату Telegram Stars. Попробуй ещё раз чуть позже.',
      );
    } finally {
      setLoadingAmount(null);
    }
  }

  async function createDonatePayClaim() {
    if (!user?.id || claimBusy) return;

    setClaimBusy(true);
    setClaimError('');
    setCopied(false);

    try {
      const response = await fetch('/api/monetization/donatepay/claim', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({ action: 'create' }),
        cache: 'no-store',
      });
      const payload = (await response.json()) as DonatePayClaimResponse;
      if (!response.ok || !payload.ok || !payload.claimCode || !payload.claim) {
        throw new Error(payload.error || 'Не удалось создать код привязки');
      }
      setDonatePayConfigured(payload.configured ?? true);
      setClaimCode(payload.claimCode);
      setClaim(payload.claim);
    } catch (error) {
      setClaimError(error instanceof Error ? error.message : 'Не удалось создать код привязки');
    } finally {
      setClaimBusy(false);
    }
  }

  async function checkDonatePayClaim() {
    if (!user?.id || claimBusy) return;
    setClaimBusy(true);
    setClaimError('');

    try {
      const response = await fetch('/api/monetization/donatepay/claim?sync=1', {
        cache: 'no-store',
      });
      const payload = (await response.json()) as DonatePayClaimResponse;
      if (!response.ok) throw new Error(payload.error || 'Не удалось проверить донат');
      setDonatePayConfigured(payload.configured ?? false);
      setClaim(payload.claim ?? null);
      if (payload.syncError) setClaimError(payload.syncError);
    } catch (error) {
      setClaimError(error instanceof Error ? error.message : 'Не удалось проверить донат');
    } finally {
      setClaimBusy(false);
    }
  }

  async function copyClaimCode() {
    if (!claimCode) return;
    try {
      await navigator.clipboard.writeText(claimCode);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setClaimError('Не удалось скопировать код. Выдели его вручную.');
    }
  }

  const claimExpired = claim?.status === 'expired' || claim?.status === 'cancelled';

  return (
    <div className="support-box">
      <div className="support-box__intro">
        <span className="support-box__eyebrow">ANIMEBOX SUPPORT</span>
        <h2>Поддержать развитие AnimeBox</h2>
        <p>
          Поддержка добровольная. Telegram Stars открывают накопительные уровни спонсорства и оформление профиля. Средства идут на инфраструктуру и развитие проекта.
        </p>
      </div>

      {TELEGRAM_STARS_ENABLED && (
        <section className="support-box__section">
          <div className="support-box__section-head">
            <div>
              <span className="animebox-star-value"><AnimeBoxStar size={20} /> Telegram Stars</span>
              <strong>Поддержка внутри Telegram</strong>
            </div>
            <span className="support-box__badge">XTR</span>
          </div>

          <div className="support-stars-grid">
            {SUPPORT_STAR_PACKS.map((pack) => (
              <button
                key={pack.amount}
                type="button"
                className="support-star-pack"
                disabled={loadingAmount !== null}
                onClick={() => void payWithStars(pack.amount)}
              >
                <span className="support-star-pack__amount"><AnimeBoxStar size={30} /> {pack.amount}</span>
                <strong>{pack.title}</strong>
                <small>{pack.description}</small>
                <span className="support-star-pack__action">
                  {loadingAmount === pack.amount
                    ? 'Открываем…'
                    : 'Поддержать'}
                </span>
              </button>
            ))}
          </div>
        </section>
      )}

      <section className="support-box__section support-box__section--web support-box__web-only support-donatepay-claim">
        <div className="support-donatepay-claim__copy">
          <span>БАНКОВСКАЯ КАРТА · DONATEPAY</span>
          <strong>Разовый донат с привязкой к AnimeBox</strong>
          <p>
            AnimeBox не получает данные карты. Оплата проходит на стороне DonatePay, а специальный одноразовый код связывает успешный донат с твоим профилем.
          </p>

          {!user?.id && (
            <div className="support-donatepay-claim__notice">
              <Link href="/login">Войди в AnimeBox</Link>, чтобы донат автоматически появился в истории твоего профиля.
            </div>
          )}

          {user?.id && donatePayConfigured === false && (
            <div className="support-donatepay-claim__notice is-error">
              DonatePay временно не настроен на сервере AnimeBox.
            </div>
          )}

          {user?.id && donatePayConfigured !== false && (
            <div className="support-donatepay-claim__flow">
              {claim?.status === 'claimed' && claim.transaction ? (
                <div className="support-donatepay-claim__success" role="status">
                  <strong>✓ Донат привязан к твоему AnimeBox</strong>
                  <span>
                    {Number(claim.transaction.amount).toLocaleString('ru-RU', { maximumFractionDigits: 4 })} {claim.transaction.currency}
                  </span>
                </div>
              ) : (
                <>
                  <div className="support-donatepay-claim__steps">
                    <span><b>1</b> Получи одноразовый код.</span>
                    <span><b>2</b> Вставь его в поле сообщения / комментария DonatePay.</span>
                    <span><b>3</b> Оплати — AnimeBox сам найдёт транзакцию и привяжет её.</span>
                  </div>

                  {claimCode && claim?.status === 'pending' ? (
                    <div className="support-donatepay-claim__codebox">
                      <small>Твой код</small>
                      <code>{claimCode}</code>
                      <button type="button" onClick={() => void copyClaimCode()}>
                        {copied ? 'Скопировано ✓' : 'Скопировать'}
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      className="btn btn--ghost"
                      disabled={claimBusy}
                      onClick={() => void createDonatePayClaim()}
                    >
                      {claimBusy ? 'Создаём…' : claimExpired || claim?.status === 'pending' ? 'Создать новый код' : 'Получить код привязки'}
                    </button>
                  )}

                  {claim?.status === 'pending' && !claimCode && (
                    <small className="support-donatepay-claim__muted">
                      Есть активная попытка привязки. Если код потерян, создай новый — старый станет недействительным.
                    </small>
                  )}

                  {claim?.status === 'pending' && (
                    <small className="support-donatepay-claim__muted">
                      Код действует до {new Date(claim.expiresAt).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}. Проверка выполняется автоматически примерно раз в 25 секунд, пока эта страница открыта.
                    </small>
                  )}
                </>
              )}

              <div className="support-donatepay-claim__actions">
                <a
                  className="btn btn--ghost support-box__donatepay"
                  href={SUPPORT_URL}
                  target="_blank"
                  rel="noreferrer"
                >
                  Открыть DonatePay ↗
                </a>
                {claim?.status === 'pending' && (
                  <button
                    className="btn btn--ghost"
                    type="button"
                    disabled={claimBusy}
                    onClick={() => void checkDonatePayClaim()}
                  >
                    {claimBusy ? 'Проверяем…' : 'Проверить донат'}
                  </button>
                )}
              </div>
            </div>
          )}

          {claimError && (
            <div className="support-donatepay-claim__notice is-error" role="alert">
              {claimError}
            </div>
          )}

          <small className="support-donatepay-claim__muted">
            Донаты в обычной валюте учитываются отдельно от Telegram Stars и не конвертируются в Stars.
          </small>
        </div>
      </section>

      <BoostySupport />

      {(invoiceStatus || errorText) && (
        <div
          className={`support-box__status ${errorText ? 'is-error' : ''}`}
          role="status"
        >
          {errorText || statusText(invoiceStatus)}
        </div>
      )}

      <div className="support-box__footer">
        <span>Платёж добровольный.</span>
        <Link href="/terms">Условия поддержки</Link>
      </div>
    </div>
  );
}
