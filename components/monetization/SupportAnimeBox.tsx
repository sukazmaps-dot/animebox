'use client';

import Link from 'next/link';
import Image from 'next/image';
import { useState } from 'react';

import AnimeBoxStar from './AnimeBoxStar';

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
  const [loadingAmount, setLoadingAmount] =
    useState<SupportStarAmount | null>(null);
  const [invoiceStatus, setInvoiceStatus] =
    useState<InvoiceStatus | ''>('');
  const [errorText, setErrorText] = useState('');

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

      <section className="support-box__section support-box__section--web support-box__web-only">
          <div>
            <span>Обычная веб-версия</span>
            <strong>Поддержать через DonatePay</strong>
            <p>
              В браузере можно использовать текущую страницу поддержки AnimeBox.
            </p>
          </div>

          <a
            className="btn btn--ghost support-box__donatepay"
            href={SUPPORT_URL}
            target="_blank"
            rel="noreferrer"
          >
            Открыть DonatePay ↗
          </a>
        </section>

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
