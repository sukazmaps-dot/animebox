'use client';

import Link from 'next/link';
import { FormEvent, useEffect, useMemo, useState } from 'react';

import type { PremiumCatalogPlan, PremiumPlanId } from '@/lib/premium';

type Subscription = {
  id: string;
  user_id: string;
  plan: 'monthly' | 'yearly' | 'manual';
  status: 'active' | 'grace_period' | 'expired' | 'cancelled' | 'refunded';
  source: string;
  transaction_id: string | null;
  starts_at: string;
  ends_at: string;
  cancelled_at: string | null;
  auto_renew: boolean;
  auto_renew_cancelled_at: string | null;
  telegram_subscription_charge_id: string | null;
  created_at: string;
};

type Data = {
  now: string;
  subscriptions: Subscription[];
  profiles: { id: string; username: string | null }[];
  matches?: { id: string; username: string | null }[];
  plans: PremiumCatalogPlan[];
  canRefund: boolean;
};

type PlanDraft = { amount: string; active: boolean };
type StatusFilter = 'live' | 'all' | Subscription['status'];
type SourceFilter = 'all' | 'telegram_stars' | 'boosty_telegram' | 'admin' | 'other';

const sourceLabels: Record<string, string> = {
  telegram_stars: 'Telegram Stars',
  boosty_telegram: 'Boosty',
  admin: 'Manual',
};

const statusLabels: Record<Subscription['status'], string> = {
  active: 'Active',
  grace_period: 'Grace',
  expired: 'Expired',
  cancelled: 'Cancelled',
  refunded: 'Refunded',
};

function sourceFilterFor(source: string): SourceFilter {
  if (source === 'telegram_stars' || source === 'boosty_telegram' || source === 'admin') {
    return source;
  }
  return 'other';
}

export default function PremiumAdminPanel() {
  const [data, setData] = useState<Data | null>(null);
  const [query, setQuery] = useState('');
  const [matches, setMatches] = useState<{ id: string; username: string | null }[]>([]);
  const [selectedUser, setSelectedUser] = useState('');
  const [days, setDays] = useState('30');
  const [reason, setReason] = useState('Ручной Premium grant');
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [refresh, setRefresh] = useState(0);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('live');
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>('all');
  const [planDrafts, setPlanDrafts] = useState<Record<PremiumPlanId, PlanDraft>>({
    monthly: { amount: '', active: false },
    yearly: { amount: '', active: false },
  });

  async function load() {
    const response = await fetch('/api/admin/premium', { cache: 'no-store' });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || 'Не удалось загрузить Premium');
    const next = payload as Data;
    setData(next);
    setPlanDrafts((current) => {
      const result = { ...current };
      for (const plan of next.plans ?? []) {
        result[plan.id] = {
          amount: plan.telegramStarsAmount ? String(plan.telegramStarsAmount) : '',
          active: plan.active,
        };
      }
      return result;
    });
  }

  useEffect(() => {
    let active = true;
    void load().catch((requestError) => {
      if (active) {
        setError(
          requestError instanceof Error ? requestError.message : 'Не удалось загрузить Premium',
        );
      }
    });
    return () => {
      active = false;
    };
  }, [refresh]);

  const profileMap = useMemo(
    () => new Map((data?.profiles ?? []).map((profile) => [profile.id, profile.username || profile.id])),
    [data?.profiles],
  );

  const now = Date.parse(data?.now ?? new Date().toISOString());
  const visibleSubscriptions = useMemo(() => {
    return (data?.subscriptions ?? []).filter((subscription) => {
      const isLive =
        ['active', 'grace_period'].includes(subscription.status) &&
        Date.parse(subscription.ends_at) > now;
      const statusMatches =
        statusFilter === 'all'
          ? true
          : statusFilter === 'live'
            ? isLive
            : subscription.status === statusFilter;
      const sourceMatches =
        sourceFilter === 'all' || sourceFilterFor(subscription.source) === sourceFilter;
      return statusMatches && sourceMatches;
    });
  }, [data?.subscriptions, now, sourceFilter, statusFilter]);

  const liveCount = (data?.subscriptions ?? []).filter(
    (subscription) =>
      ['active', 'grace_period'].includes(subscription.status) &&
      Date.parse(subscription.ends_at) > now,
  ).length;
  const graceCount = (data?.subscriptions ?? []).filter(
    (subscription) =>
      subscription.status === 'grace_period' && Date.parse(subscription.ends_at) > now,
  ).length;

  async function search(event: FormEvent) {
    event.preventDefault();
    const q = query.trim();
    if (!q) return;
    setBusy('search');
    setError('');
    try {
      const response = await fetch(`/api/admin/premium?q=${encodeURIComponent(q)}`, { cache: 'no-store' });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Поиск не выполнен');
      setMatches(payload.matches ?? []);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Поиск не выполнен');
    } finally {
      setBusy('');
    }
  }

  async function configurePlan(planId: PremiumPlanId) {
    const draft = planDrafts[planId];
    setBusy(`plan:${planId}`);
    setError('');

    try {
      const response = await fetch('/api/admin/premium', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'configure_plan',
          planId,
          telegramStarsAmount: draft.amount.trim() || null,
          active: draft.active,
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Не удалось сохранить тариф');
      setRefresh((value) => value + 1);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Не удалось сохранить тариф');
    } finally {
      setBusy('');
    }
  }

  async function grant() {
    if (!selectedUser) return;
    setBusy('grant');
    setError('');
    try {
      const response = await fetch('/api/admin/premium', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'grant',
          userId: selectedUser,
          days: Number(days),
          reason,
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Premium не выдан');
      setRefresh((value) => value + 1);
      setMatches([]);
      setSelectedUser('');
      window.dispatchEvent(new Event('animebox:entitlements-changed'));
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Premium не выдан');
    } finally {
      setBusy('');
    }
  }

  async function recheck(subscription: Subscription) {
    setBusy(`recheck:${subscription.id}`);
    setError('');
    try {
      const response = await fetch('/api/admin/premium', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'recheck', subscriptionId: subscription.id }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Не удалось перепроверить Premium');
      setRefresh((value) => value + 1);
      window.dispatchEvent(new Event('animebox:entitlements-changed'));
    } catch (requestError) {
      setError(
        requestError instanceof Error ? requestError.message : 'Не удалось перепроверить Premium',
      );
    } finally {
      setBusy('');
    }
  }

  async function extend(subscription: Subscription, extensionDays: number) {
    setBusy(`extend:${subscription.id}`);
    setError('');
    try {
      const response = await fetch('/api/admin/premium', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'extend',
          subscriptionId: subscription.id,
          days: extensionDays,
          reason: `Подарочное продление +${extensionDays} дней`,
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Premium не продлён');
      setRefresh((value) => value + 1);
      window.dispatchEvent(new Event('animebox:entitlements-changed'));
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Premium не продлён');
    } finally {
      setBusy('');
    }
  }

  async function refundPremium(subscription: Subscription) {
    if (!subscription.transaction_id || subscription.source !== 'telegram_stars') return;

    const note = window.prompt('Причина возврата Premium:', 'Возврат AnimeBox Premium') ?? '';
    if (!note.trim()) return;

    setBusy(`refund:${subscription.id}`);
    setError('');

    try {
      const response = await fetch('/api/admin/premium', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'refund',
          transactionId: subscription.transaction_id,
          reason: note,
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Не удалось вернуть Premium-платёж');
      setRefresh((value) => value + 1);
      window.dispatchEvent(new Event('animebox:entitlements-changed'));
    } catch (requestError) {
      setError(
        requestError instanceof Error ? requestError.message : 'Не удалось вернуть Premium-платёж',
      );
    } finally {
      setBusy('');
    }
  }

  async function revoke(subscription: Subscription) {
    const note = window.prompt('Причина отключения Premium:', 'Ручное отключение администратором') ?? '';
    if (!note.trim()) return;
    setBusy(`revoke:${subscription.id}`);
    setError('');
    try {
      const response = await fetch('/api/admin/premium', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'revoke', subscriptionId: subscription.id, reason: note }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Premium не отключён');
      setRefresh((value) => value + 1);
      window.dispatchEvent(new Event('animebox:entitlements-changed'));
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Premium не отключён');
    } finally {
      setBusy('');
    }
  }

  return (
    <section className="premium-admin premium-admin--v20">
      <div className="premium-admin__head">
        <div>
          <span>PREMIUM V20</span>
          <h2>Premium lifecycle</h2>
          <p>Stars, Boosty и manual-доступ теперь сходятся в единый entitlement lifecycle.</p>
        </div>
        <Link href="/premium">Открыть Premium →</Link>
      </div>

      <div className="premium-admin-v20__summary">
        <article><span>LIVE</span><strong>{liveCount}</strong><small>активных источников</small></article>
        <article><span>GRACE</span><strong>{graceCount}</strong><small>ожидают перепроверки</small></article>
        <article><span>RECENT</span><strong>{data?.subscriptions.length ?? 0}</strong><small>записей загружено</small></article>
      </div>

      <div className="premium-admin__plans">
        {(data?.plans ?? []).map((plan) => {
          const draft = planDrafts[plan.id];
          return (
            <article key={plan.id}>
              <div>
                <span>{plan.id === 'monthly' ? 'MONTHLY' : 'YEARLY'}</span>
                <strong>{plan.label}</strong>
                <small>
                  {plan.billingMode === 'recurring'
                    ? 'Автопродление каждые 30 дней'
                    : `${plan.durationDays} дней · разовая оплата`}
                </small>
              </div>

              <label>
                <span>Цена, Stars</span>
                <input
                  type="number"
                  min="1"
                  max={plan.id === 'monthly' ? 10000 : 100000}
                  value={draft.amount}
                  onChange={(event) =>
                    setPlanDrafts((current) => ({
                      ...current,
                      [plan.id]: { ...current[plan.id], amount: event.target.value },
                    }))
                  }
                  placeholder="Цена"
                />
              </label>

              <label className="premium-admin__toggle">
                <input
                  type="checkbox"
                  checked={draft.active}
                  onChange={(event) =>
                    setPlanDrafts((current) => ({
                      ...current,
                      [plan.id]: { ...current[plan.id], active: event.target.checked },
                    }))
                  }
                />
                <span>Продажа включена</span>
              </label>

              <button
                type="button"
                disabled={busy === `plan:${plan.id}`}
                onClick={() => void configurePlan(plan.id)}
              >
                {busy === `plan:${plan.id}` ? 'Сохраняем…' : 'Сохранить тариф'}
              </button>
            </article>
          );
        })}
      </div>

      <div className="premium-admin__divider" />

      <form className="premium-admin__search" onSubmit={search}>
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Ник или UUID пользователя" />
        <button type="submit" disabled={busy === 'search'}>{busy === 'search' ? 'Ищем…' : 'Найти'}</button>
      </form>

      {matches.length > 0 && (
        <div className="premium-admin__matches">
          {matches.map((profile) => (
            <button
              key={profile.id}
              type="button"
              data-selected={selectedUser === profile.id}
              onClick={() => setSelectedUser(profile.id)}
            >
              <strong>{profile.username || 'Без ника'}</strong>
              <small>{profile.id}</small>
            </button>
          ))}
        </div>
      )}

      {selectedUser && (
        <div className="premium-admin__grant">
          <label>
            <span>Срок, дней</span>
            <input type="number" min="1" max="3660" value={days} onChange={(event) => setDays(event.target.value)} />
          </label>
          <label>
            <span>Причина</span>
            <input value={reason} onChange={(event) => setReason(event.target.value)} maxLength={500} />
          </label>
          <button type="button" disabled={busy === 'grant'} onClick={() => void grant()}>
            {busy === 'grant' ? 'Выдаём…' : 'Выдать Premium'}
          </button>
        </div>
      )}

      <div className="premium-admin-v20__filters" aria-label="Фильтры Premium">
        <div>
          {(['live', 'active', 'grace_period', 'expired', 'cancelled', 'refunded', 'all'] as StatusFilter[]).map((value) => (
            <button
              type="button"
              key={value}
              className={statusFilter === value ? 'is-active' : ''}
              onClick={() => setStatusFilter(value)}
            >
              {value === 'live' ? 'Live' : value === 'all' ? 'Все' : statusLabels[value as Subscription['status']]}
            </button>
          ))}
        </div>
        <div>
          {(['all', 'telegram_stars', 'boosty_telegram', 'admin', 'other'] as SourceFilter[]).map((value) => (
            <button
              type="button"
              key={value}
              className={sourceFilter === value ? 'is-active' : ''}
              onClick={() => setSourceFilter(value)}
            >
              {value === 'all' ? 'Все источники' : value === 'other' ? 'Другие' : sourceLabels[value]}
            </button>
          ))}
        </div>
      </div>

      {error && <p className="sponsor-v25-error" role="alert">{error}</p>}

      <div className="sponsor-v2-table sponsor-v25-table premium-admin-v20__table">
        <table>
          <thead><tr><th>Пользователь</th><th>План</th><th>Источник</th><th>До</th><th>Продление</th><th>Статус</th><th /></tr></thead>
          <tbody>
            {visibleSubscriptions.map((subscription) => {
              const isLive =
                ['active', 'grace_period'].includes(subscription.status) &&
                Date.parse(subscription.ends_at) > now;

              return (
                <tr key={subscription.id}>
                  <td>
                    <Link className="sponsor-v2-profile-link" href={`/profile/${subscription.user_id}`}>
                      {profileMap.get(subscription.user_id) || subscription.user_id} <span aria-hidden="true">↗</span>
                    </Link>
                  </td>
                  <td>{subscription.plan}</td>
                  <td>{sourceLabels[subscription.source] || subscription.source}</td>
                  <td>{new Date(subscription.ends_at).toLocaleString('ru-RU')}</td>
                  <td>
                    {subscription.plan === 'monthly' && subscription.source === 'telegram_stars'
                      ? subscription.auto_renew ? 'Авто' : 'Отключено'
                      : '—'}
                  </td>
                  <td><span className="sponsor-v25-status" data-status={subscription.status}>{statusLabels[subscription.status]}</span></td>
                  <td>
                    <div className="premium-admin__row-actions">
                      <button
                        type="button"
                        disabled={Boolean(busy)}
                        onClick={() => void recheck(subscription)}
                      >
                        {busy === `recheck:${subscription.id}` ? 'Проверяем…' : 'Recheck'}
                      </button>

                      <button
                        type="button"
                        disabled={Boolean(busy)}
                        onClick={() => void extend(subscription, 30)}
                        title="Добавит отдельный manual-доступ и не изменит платёж Boosty/Stars"
                      >
                        {busy === `extend:${subscription.id}` ? 'Продлеваем…' : '+30 дней'}
                      </button>

                      {isLive && (
                        <button
                          type="button"
                          className="is-danger"
                          disabled={Boolean(busy)}
                          onClick={() => void revoke(subscription)}
                        >
                          {busy === `revoke:${subscription.id}` ? 'Отключаем…' : 'Отключить'}
                        </button>
                      )}

                      {data?.canRefund &&
                        subscription.source === 'telegram_stars' &&
                        subscription.transaction_id &&
                        subscription.status !== 'refunded' && (
                          <button
                            type="button"
                            disabled={Boolean(busy)}
                            onClick={() => void refundPremium(subscription)}
                          >
                            {busy === `refund:${subscription.id}` ? 'Возвращаем…' : 'Вернуть Stars'}
                          </button>
                        )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {!visibleSubscriptions.length && <p>По этим фильтрам Premium-подписок нет.</p>}
      </div>
    </section>
  );
}
