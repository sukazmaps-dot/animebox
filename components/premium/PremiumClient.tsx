'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

import { useAuthState } from '@/components/AuthStateProvider';
import { clearPremiumMeCache, getPremiumMe, type PremiumMe } from '@/lib/entitlements-client';
import type { PremiumCatalogPlan, PremiumPlanId } from '@/lib/premium';

type PremiumCatalogResponse = { plans: PremiumCatalogPlan[] };
type InvoiceResponse = { ok?: boolean; invoiceUrl?: string; error?: string };

const BENEFITS = [
  ['Без рекламы', 'Рекламные блоки AnimeBox отключаются на всём сайте.'],
  ['Premium badge', 'Отдельный Premium-статус в своём и публичном профиле.'],
  ['Profile Studio', 'Выбор безопасных готовых тем оформления без произвольного CSS.'],
  ['Premium themes', 'Violet Nebula, Midnight и Sakura Night для профиля.'],
  ['Публичное оформление', 'Выбранная тема видна другим пользователям AnimeBox.'],
  ['Накопление срока', 'Новая покупка продлевает уже активный Premium, а не сжигает остаток.'],
] as const;

export default function PremiumClient() {
  const { user, loading: authLoading } = useAuthState();
  const [data, setData] = useState<PremiumMe | null>(null);
  const [loading, setLoading] = useState(Boolean(user?.id));
  const [error, setError] = useState('');
  const [plans, setPlans] = useState<PremiumCatalogPlan[]>([]);
  const [buying, setBuying] = useState<PremiumPlanId | ''>('');
  const [paymentStatus, setPaymentStatus] = useState('');

  useEffect(() => {
    let active = true;

    void fetch('/api/premium/catalog', { cache: 'no-store' })
      .then(async (response) => {
        const payload = (await response.json()) as PremiumCatalogResponse;
        if (!response.ok) throw new Error('Не удалось загрузить тарифы');
        if (active) setPlans(payload.plans ?? []);
      })
      .catch((requestError) => {
        if (active) {
          setError(
            requestError instanceof Error
              ? requestError.message
              : 'Не удалось загрузить тарифы',
          );
        }
      });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!user?.id) {
      setData(null);
      setLoading(false);
      return;
    }

    let active = true;
    setLoading(true);
    void getPremiumMe({ force: true })
      .then((payload) => {
        if (active) setData(payload);
      })
      .catch((requestError) => {
        if (active) setError(requestError instanceof Error ? requestError.message : 'Не удалось загрузить Premium');
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [user?.id]);

  async function buyPremium(plan: PremiumPlanId) {
    if (!user?.id || buying) return;

    setBuying(plan);
    setError('');
    setPaymentStatus('');

    try {
      const tg = window.Telegram?.WebApp;
      const initData = tg?.initData?.trim() || '';

      const response = await fetch('/api/premium/stars/invoice', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({ plan, initData }),
        cache: 'no-store',
      });

      const payload = (await response.json()) as InvoiceResponse;

      if (!response.ok || !payload.ok || !payload.invoiceUrl) {
        throw new Error(
          payload.error === 'plan_not_available'
            ? 'Этот Premium-тариф пока не включён.'
            : 'Не удалось открыть оплату Premium.',
        );
      }

      const refreshAfterPayment = async () => {
        setPaymentStatus('Оплата подтверждена. Активируем Premium…');
        clearPremiumMeCache();

        for (let attempt = 0; attempt < 8; attempt += 1) {
          await new Promise((resolve) => window.setTimeout(resolve, 1250));
          try {
            const next = await getPremiumMe({ force: true });
            setData(next);
            if (next.premium) {
              setPaymentStatus('Premium активирован ✓');
              window.dispatchEvent(new Event('animebox:entitlements-changed'));
              return;
            }
          } catch {
            // Webhook may still be processing. Retry a few times.
          }
        }

        setPaymentStatus(
          'Платёж подтверждён. Если Premium ещё не появился, обнови страницу через несколько секунд.',
        );
      };

      if (tg?.initData?.trim() && tg.openInvoice) {
        tg.openInvoice(payload.invoiceUrl, (status) => {
          if (status === 'paid') {
            void refreshAfterPayment();
          } else if (status === 'cancelled') {
            setPaymentStatus('Оплата отменена.');
          } else if (status === 'failed') {
            setPaymentStatus('Telegram не смог завершить оплату.');
          }
        });
      } else {
        window.location.assign(payload.invoiceUrl);
      }
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : 'Не удалось открыть оплату Premium.',
      );
    } finally {
      setBuying('');
    }
  }

  const subscription = data?.subscription;
  const endDate = subscription
    ? new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(subscription.endsAt))
    : null;

  return (
    <main className="premium-page">
      <section className="premium-hero">
        <div className="premium-hero__copy">
          <span className="premium-eyebrow">ANIMEBOX PREMIUM</span>
          <h1>Больше персонализации.<br />Меньше отвлекающего.</h1>
          <p>
            Premium — отдельный продукт AnimeBox: без рекламы, с расширенным оформлением профиля и будущими premium-функциями. Он не заменяет и не смешивается со спонсорством.
          </p>

          {!authLoading && !user && (
            <Link className="premium-cta premium-cta--primary" href="/login">
              Войти в AnimeBox
            </Link>
          )}

          {user && loading && <div className="premium-status">Проверяем Premium…</div>}

          {user && !loading && data?.premium && subscription && (
            <div className="premium-status premium-status--active">
              <div>
                <span>PREMIUM ACTIVE</span>
                <strong>Premium активен</strong>
              </div>
              <small>До {endDate}</small>
            </div>
          )}

          {user && !loading && !data?.premium && (
            <div className="premium-status">
              <div>
                <span>PREMIUM READY</span>
                <strong>Аккаунт готов к Premium</strong>
              </div>
              <small>
                {plans.some((plan) => plan.active)
                  ? 'Выбери тариф ниже — доступ активируется после оплаты.'
                  : 'Тарифы пока не открыты для продажи.'}
              </small>
            </div>
          )}

          {error && <p className="premium-error">{error}</p>}
        </div>

        <div className="premium-hero__orb" aria-hidden="true">
          <div className="premium-hero__ring" />
          <div className="premium-hero__core">P</div>
        </div>
      </section>

      <section className="premium-benefits">
        <div className="premium-section-head">
          <span>ЧТО ВХОДИТ</span>
          <h2>Premium entitlements v1</h2>
          <p>Доступ определяется единым entitlement-слоем, а не отдельными проверками по страницам.</p>
        </div>

        <div className="premium-benefits__grid">
          {BENEFITS.map(([title, description]) => (
            <article key={title}>
              <span className="premium-benefits__dot" aria-hidden="true">◆</span>
              <h3>{title}</h3>
              <p>{description}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="premium-plan">
        <div>
          <span className="premium-eyebrow">ТАРИФЫ</span>
          <h2>Выбери срок Premium</h2>
          <p>
            Оплата проходит через Telegram Stars. После подтверждения Telegram
            AnimeBox автоматически активирует доступ на аккаунте.
          </p>

          {paymentStatus && (
            <div className="premium-payment-status" role="status">
              {paymentStatus}
            </div>
          )}
        </div>

        <div className="premium-plan__cards">
          {plans.map((plan) => (
            <article
              key={plan.id}
              className={plan.active ? 'is-active' : 'is-disabled'}
            >
              <span>{plan.id === 'monthly' ? 'MONTHLY' : 'YEARLY'}</span>
              <strong>{plan.label}</strong>

              {plan.active && plan.telegramStarsAmount ? (
                <>
                  <b className="premium-plan__price">
                    ★ {plan.telegramStarsAmount}
                  </b>

                  {user ? (
                    <button
                      type="button"
                      className="premium-cta premium-cta--primary"
                      disabled={Boolean(buying)}
                      onClick={() => void buyPremium(plan.id)}
                    >
                      {buying === plan.id ? 'Открываем…' : 'Выбрать'}
                    </button>
                  ) : (
                    <Link
                      className="premium-cta premium-cta--primary"
                      href="/login"
                    >
                      Войти и купить
                    </Link>
                  )}
                </>
              ) : (
                <small>Тариф пока не открыт для продажи</small>
              )}
            </article>
          ))}
        </div>
      </section>

      {data?.payments?.length ? (
        <section className="premium-history">
          <div className="premium-section-head">
            <span>ИСТОРИЯ</span>
            <h2>Платежи Premium</h2>
          </div>
          <div className="premium-history__list">
            {data.payments.map((payment) => (
              <div key={payment.id} className="premium-history__row">
                <div>
                  <strong>
                    {payment.product_code === 'premium_yearly'
                      ? 'Premium · 12 месяцев'
                      : 'Premium · 1 месяц'}
                  </strong>
                  <small>
                    {new Date(payment.paid_at || payment.created_at).toLocaleString('ru-RU')}
                  </small>
                </div>
                <span>
                  {Number(payment.amount).toLocaleString('ru-RU')} {payment.currency}
                </span>
                <b>{payment.status === 'paid' ? 'Оплачено' : payment.status === 'refunded' ? 'Возврат' : payment.status}</b>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <section className="premium-note">
        <div>
          <strong>Спонсорство остаётся отдельным.</strong>
          <p>Накопительные Stars-tier и Premium больше не являются одной сущностью. Существующие спонсорские ad-free преимущества сохранены через compatibility layer.</p>
        </div>
        <Link href="/support">Поддержать AnimeBox →</Link>
      </section>
    </main>
  );
}
