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
  ['Premium badge', 'Отдельный Premium-статус аккаунта, не смешанный со спонсорским tier.'],
  ['Profile Studio', 'Расширенная персонализация профиля и будущие premium-настройки.'],
  ['Animated avatar', 'Доступ к анимированному оформлению профиля, когда Profile Studio будет открыт.'],
  ['Extra showcases', 'Дополнительные витрины и блоки профиля.'],
  ['Premium themes', 'Расширенные темы оформления AnimeBox-профиля.'],
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
              <small>Checkout подключим отдельным этапом после утверждения цены.</small>
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
          <h2>Monthly и Yearly уже заложены в архитектуру</h2>
          <p>
            Мы не включали продажу с выдуманной ценой. Когда утвердим стоимость и способ оплаты, checkout подключится к уже готовым payment_products → transactions → entitlements.
          </p>
        </div>

        <div className="premium-plan__cards">
          <article>
            <span>MONTHLY</span>
            <strong>1 месяц</strong>
            <small>Цена будет задана отдельно</small>
          </article>
          <article>
            <span>YEARLY</span>
            <strong>12 месяцев</strong>
            <small>Цена будет задана отдельно</small>
          </article>
        </div>
      </section>

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
