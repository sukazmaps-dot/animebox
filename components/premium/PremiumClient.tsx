'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import Icon from '@/components/Icon';

import { useAuthState } from '@/components/AuthStateProvider';
import BoostyPremiumBridge from '@/components/premium/BoostyPremiumBridge';
import PremiumAiHeroArt from '@/components/premium/PremiumAiHeroArt';
import { clearPremiumMeCache, getPremiumMe, type PremiumMe } from '@/lib/entitlements-client';
import type { PremiumCatalogPlan, PremiumPlanId } from '@/lib/premium';
import { trackMonetizationClientEvent } from '@/lib/monetization-events-client';

type PremiumCatalogResponse = { plans: PremiumCatalogPlan[] };
type InvoiceResponse = { ok?: boolean; invoiceUrl?: string; error?: string };


function premiumSourceLabel(source: PremiumMe['lifecycle']['source']) {
  if (source === 'telegram_stars') return 'Telegram Stars';
  if (source === 'boosty') return 'Boosty';
  if (source === 'manual') return 'AnimeBox · manual';
  if (source === 'mixed') return 'Несколько источников';
  return 'AnimeBox Premium';
}

function premiumSourceChip(source: PremiumMe['lifecycle']['sources'][number]) {
  if (source === 'telegram_stars') return 'Stars';
  if (source === 'boosty') return 'Boosty';
  if (source === 'manual') return 'Manual';
  return 'Other';
}

const BENEFITS = [
  {
    icon: 'spark' as const,
    title: '+20% XP',
    description: 'Больше XP за обычную подтверждённую активность просмотра.',
  },
  {
    icon: 'star' as const,
    title: 'Анимированные аватары и баннеры',
    description: 'Добавляй движение профилю: Premium открывает анимированные аватары, баннеры и расширенное визуальное оформление.',
  },
  {
    icon: 'crown' as const,
    title: 'Premium badge',
    description: 'Отдельный Premium-статус в своём и публичном профиле.',
  },
  {
    icon: 'user' as const,
    title: 'Premium Studio',
    description: 'Своя палитра: фон, accent, текст, glow и стиль рамки.',
  },
  {
    icon: 'play' as const,
    title: 'Тема плеера',
    description: 'Accent и Primary можно синхронизировать с оболочкой AnimeBox Player.',
  },
  {
    icon: 'heart' as const,
    title: 'Поддержка AnimeBox',
    description: 'Premium помогает оплачивать инфраструктуру и развивать новые функции.',
  },
] as const;

export default function PremiumClient() {
  const { user } = useAuthState();
  const [data, setData] = useState<PremiumMe | null>(null);
  const [loading, setLoading] = useState(Boolean(user?.id));
  const [error, setError] = useState('');
  const [plans, setPlans] = useState<PremiumCatalogPlan[]>([]);
  const [buying, setBuying] = useState<PremiumPlanId | ''>('');
  const [paymentStatus, setPaymentStatus] = useState('');
  const [managingSubscription, setManagingSubscription] = useState(false);
  const pageViewTracked = useRef(false);

  useEffect(() => {
    if (pageViewTracked.current) return;
    pageViewTracked.current = true;
    trackMonetizationClientEvent('premium_page_view', {
      source: 'premium_page',
      metadata: { authenticated: Boolean(user?.id) },
    });
  }, [user?.id]);

  async function refreshPremiumState() {
    if (!user?.id) return;
    clearPremiumMeCache();
    const next = await getPremiumMe({ force: true });
    setData(next);
    window.dispatchEvent(new Event('animebox:entitlements-changed'));
  }

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
    if (!user?.id) return;

    let active = true;

    const loadPremium = async () => {
      if (active) setLoading(true);

      try {
        const payload = await getPremiumMe({ force: true });
        if (active) setData(payload);
      } catch (requestError) {
        if (active) {
          setError(
            requestError instanceof Error
              ? requestError.message
              : 'Не удалось загрузить Premium',
          );
        }
      } finally {
        if (active) setLoading(false);
      }
    };

    void loadPremium();

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
            : payload.error === 'recurring_already_exists'
              ? 'Месячная подписка уже оформлена. Управлять автопродлением можно выше.'
              : payload.error === 'cancel_recurring_first'
                ? 'Сначала отключи автопродление месячной подписки, чтобы не платить за два тарифа одновременно.'
                : 'Не удалось открыть оплату Premium.',
        );
      }

      const selectedPlan = plans.find((item) => item.id === plan);
      trackMonetizationClientEvent('premium_checkout_started', {
        source: 'telegram_stars',
        entityId: plan,
        value: selectedPlan?.telegramStarsAmount ?? undefined,
        currency: 'XTR',
        metadata: {
          plan,
          billing_mode: selectedPlan?.billingMode ?? null,
        },
        flush: true,
      });

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

  async function manageRecurringSubscription(action: 'cancel' | 'resume') {
    if (!user?.id || managingSubscription) return;

    setManagingSubscription(true);
    setError('');
    setPaymentStatus('');

    try {
      const response = await fetch('/api/premium/subscription', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({ action }),
        cache: 'no-store',
      });

      const payload = await response.json();

      if (!response.ok || !payload.ok) {
        throw new Error('Не удалось изменить автопродление.');
      }

      await refreshPremiumState();

      setPaymentStatus(
        action === 'cancel'
          ? 'Автопродление отключено. Premium останется активным до конца оплаченного периода.'
          : 'Автопродление снова включено.',
      );
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : 'Не удалось изменить автопродление.',
      );
    } finally {
      setManagingSubscription(false);
    }
  }

  const lifecycle = data?.lifecycle;
  const subscription = lifecycle?.subscription ?? data?.subscription;
  const recurringSubscription = data?.recurringSubscription;
  const yearlyBlockedByRecurring = Boolean(recurringSubscription?.autoRenew);
  const endDate = lifecycle?.endsAt
    ? new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(lifecycle.endsAt))
    : subscription
      ? new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(subscription.endsAt))
      : null;

  return (
    <main className="premium-page">
      <section className="premium-hero">
        <div className="premium-hero__copy">
          <span className="premium-eyebrow">ANIMEBOX PREMIUM · STAR MODE</span>
          <h1>Твой AnimeBox.<br />Только ярче.</h1>
          <p className="premium-hero__lead">
            Premium объединяет глубокую персонализацию профиля, +20% XP к активности,
            расширенные комнаты для Watch Together и поддержку развития платформы.
          </p>

          <div className="premium-hero__chips" aria-label="Главные возможности Premium">
            <span>+20% XP</span>
            <span>Выделенные Full-HD потоки</span>
            <span>Premium Studio</span>
          </div>

          <div className="premium-hero__actions">
            {user && data?.premium ? (
              <Link className="premium-cta premium-cta--primary" href="/profile/edit?tab=premium">
                Открыть Premium Studio
              </Link>
            ) : (
              <a className="premium-cta premium-cta--primary h-11" href="#premium-plans">
                Выбрать Premium
              </a>
            )}
            <a className="premium-cta premium-cta--secondary h-11" href="#premium-benefits">
              Смотреть возможности
            </a>
          </div>

          {user && loading && <div className="premium-status premium-status--loading" role="status"><span className="animebox-loader" aria-hidden="true" />Проверяем Premium…</div>}

          {user && !loading && data?.premium && subscription && lifecycle && (
            <div
              className={`premium-status premium-status--active ${lifecycle.state === 'grace_period' ? 'premium-status--grace' : ''}`}
            >
              <div>
                <span>{lifecycle.state === 'grace_period' ? 'PREMIUM GRACE' : 'PREMIUM ACTIVE'}</span>
                <strong>
                  {lifecycle.state === 'grace_period'
                    ? 'Premium временно сохранён'
                    : 'Premium активен'}
                </strong>
              </div>
              <small>{endDate ? `${lifecycle.state === 'grace_period' ? 'Grace до' : 'Доступ до'} ${endDate}` : 'Доступ активен'}</small>

              <div className="premium-status__lifecycle">
                <span>
                  Источник
                  <b>{premiumSourceLabel(lifecycle.source)}</b>
                </span>
                <span>
                  Состояние
                  <b>{lifecycle.state === 'grace_period' ? 'Grace period' : 'Active'}</b>
                </span>
                {lifecycle.sources.length > 1 && (
                  <span className="premium-status__sources">
                    Защита от пересечений
                    <b>{lifecycle.sources.map(premiumSourceChip).join(' + ')}</b>
                  </span>
                )}
              </div>

              {recurringSubscription?.telegramSubscriptionChargeId && (
                <div className="premium-status__renewal">
                  <span>
                    {recurringSubscription.autoRenew
                      ? 'Месячное автопродление Stars: включено'
                      : 'Месячное автопродление Stars: отключено'}
                  </span>

                  <button
                    type="button"
                    disabled={managingSubscription}
                    onClick={() =>
                      void manageRecurringSubscription(
                        recurringSubscription.autoRenew ? 'cancel' : 'resume',
                      )
                    }
                  >
                    {managingSubscription
                      ? 'Сохраняем…'
                      : recurringSubscription.autoRenew
                        ? 'Отключить автопродление'
                        : 'Включить снова'}
                  </button>
                </div>
              )}
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

        <PremiumAiHeroArt />
      </section>

      <section className="premium-benefits" id="premium-benefits">
        <div className="premium-section-head">
          <span className="tracking-wider text-xs uppercase text-violet-300/60">ЧТО ВХОДИТ</span>
          <h2>Premium возможности</h2>
          <p>Оформляй профиль под себя и получай больше от просмотра.</p>
        </div>

        <div className="premium-benefits__grid">
          {BENEFITS.map((benefit) => (
            <article
              key={benefit.title}
              className="bg-slate-900/40 backdrop-blur-md border border-slate-800/60"
            >
              <span className="premium-benefits__icon" aria-hidden="true">
                <Icon name={benefit.icon} size={20} weight="regular" />
              </span>
              <h3>{benefit.title}</h3>
              <p>{benefit.description}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="premium-support-story">
        <div className="premium-support-story__copy">
          <span className="premium-eyebrow">СДЕЛАНО ДЛЯ ANIMEBOX</span>
          <h2>Premium даёт бонусы тебе и помогает платформе расти.</h2>
          <p>
            Поддержка идёт на инфраструктуру, новые функции и развитие AnimeBox.
            Premium остаётся отдельным продуктом от спонсорских Stars-tier: здесь ты
            получаешь возможности аккаунта, а спонсорство показывает вклад в проект.
          </p>
        </div>
        <div className="premium-support-story__mark">
          <span>WITH LOVE · ANIMEBOX</span>
          <strong>Поддержка без pay-to-win.</strong>
          <small>Никаких преимуществ в рейтингах или доступе к чужому контенту — только персонализация, удобство и развитие сервиса.</small>
        </div>
      </section>

      <section className="premium-plan" id="premium-plans">
        <div>
          <span className="premium-eyebrow">ТАРИФЫ</span>
          <h2>Выбери срок Premium</h2>
          <p>
            Оплата проходит через Telegram Stars. После подтверждения Telegram
            AnimeBox автоматически активирует доступ на аккаунте.
          </p>
          <div className="premium-plan__disclaimer">
            <Icon name="info" size={17} weight="regular" />
            <span>
              Premium развивает AnimeBox
            </span>
          </div>
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
              <small className="premium-plan__billing">
                {plan.billingMode === 'recurring'
                  ? 'Автопродление каждые 30 дней'
                  : 'Разовая оплата за 365 дней'}
              </small>

              {plan.active && plan.telegramStarsAmount ? (
                <>
                  <b className="premium-plan__price">
                    ★ {plan.telegramStarsAmount}
                  </b>

                  {user ? (
                    <button
                      type="button"
                      className="premium-cta premium-cta--primary"
                      disabled={
                        Boolean(buying) ||
                        (plan.id === 'yearly' && yearlyBlockedByRecurring)
                      }
                      onClick={() => void buyPremium(plan.id)}
                    >
                      {buying === plan.id
                        ? 'Открываем…'
                        : plan.id === 'yearly' && yearlyBlockedByRecurring
                          ? 'Сначала отключи месячную'
                          : plan.billingMode === 'recurring'
                            ? 'Подписаться'
                            : 'Купить на год'}
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

      <BoostyPremiumBridge
        authenticated={Boolean(user?.id)}
        onPremiumChanged={refreshPremiumState}
      />

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
          <p>Накопительные Stars-tier и Premium остаются отдельными системами: спонсорство показывает вклад в проект, а Premium открывает дополнительные возможности аккаунта.</p>
        </div>
        <Link href="/support">Поддержать AnimeBox →</Link>
      </section>

      <section className="premium-final-cta">
        <div className="premium-final-cta__copy">
          <span>STAR MODE</span>
          <h2>{data?.premium ? 'Premium уже с тобой.' : 'Сделай AnimeBox ещё больше своим.'}</h2>
          <p>
            {data?.premium
              ? 'Настрой профиль, цвета и Premium-медиа в Studio.'
              : 'Выбери удобный срок Premium и поддержи дальнейшее развитие AnimeBox.'}
          </p>
        </div>
        {data?.premium ? (
          <Link className="premium-cta premium-cta--primary" href="/profile/edit?tab=premium">
            Открыть Studio
          </Link>
        ) : user ? (
          <a className="premium-cta premium-cta--primary h-11" href="#premium-plans">
            Выбрать тариф
          </a>
        ) : (
          <Link className="premium-cta premium-cta--primary" href="/login">
            Войти и выбрать Premium
          </Link>
        )}
      </section>
    </main>
  );
}
