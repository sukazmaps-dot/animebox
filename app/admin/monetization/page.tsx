'use client';

import Link from 'next/link';
import { FormEvent, useEffect, useMemo, useState } from 'react';

import SponsorBadge from '@/components/monetization/SponsorBadge';
import type { SponsorTier } from '@/lib/sponsor';

type Payment = {
  id: string;
  user_id: string | null;
  telegram_id: number;
  amount: number;
  created_at: string;
  status: 'confirmed' | 'refunded' | 'disputed' | 'reconciliation_error';
  reconciliation_status: 'pending' | 'verified' | 'not_found' | 'mismatch' | 'refunded' | 'error';
  refunded_at: string | null;
  refund_reason: string | null;
  reconciliation_error: string | null;
  admin_note: string | null;
  telegram_payment_charge_id: string;
};

type Sponsor = {
  account_key: string;
  user_id: string | null;
  total_stars: number;
  manual_stars?: number;
  sponsor_tier: SponsorTier | null;
};

type Adjustment = {
  id: string;
  user_id: string;
  stars_delta: number;
  reason: string;
  voided_at: string | null;
  created_at: string;
};

type Data = {
  metrics: {
    total_stars: number;
    payment_count: number;
    sponsors: number;
    supporter: number;
    premium: number;
    patron: number;
    manual_stars?: number;
  };
  analytics: null | {
    stars_today: number;
    stars_7d: number;
    stars_30d: number;
    payments_30d: number;
    avg_payment_30d: number;
    refunds_30d: number;
    unique_payers_30d: number;
    repeat_payers_30d: number;
  };
  payments: Payment[];
  sponsors: Sponsor[];
  profiles: { id: string; username: string | null; telegram_id: number | null }[];
  notes: { user_id: string; note: string; updated_at: string }[];
  adjustments: Adjustment[];
  telegramBalance: number | null;
  canAdjust: boolean;
  hasMore: boolean;
};

export default function MonetizationAdmin() {
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState('');
  const [page, setPage] = useState(1);
  const [refresh, setRefresh] = useState(0);
  const [loading, setLoading] = useState(true);
  const [actionId, setActionId] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [activeQuery, setActiveQuery] = useState('');

  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/admin/monetization?page=${page}&q=${encodeURIComponent(activeQuery)}`, {
      cache: 'no-store',
      signal: controller.signal,
    })
      .then(async (response) => {
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || 'Нет доступа');
        setData(payload);
      })
      .catch((requestError) => {
        if (!controller.signal.aborted) {
          setError(requestError.message);
          setData(null);
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [page, refresh, activeQuery]);

  const profilesById = useMemo(
    () => new Map((data?.profiles ?? []).map((profile) => [profile.id, profile])),
    [data?.profiles],
  );
  const notesById = useMemo(
    () => new Map((data?.notes ?? []).map((note) => [note.user_id, note.note])),
    [data?.notes],
  );

  const name = (id: string | null) =>
    id ? profilesById.get(id)?.username || id : 'Telegram · без привязки';

  const profileLink = (id: string | null) =>
    id ? (
      <Link className="sponsor-v2-profile-link" href={`/profile/${id}`}>
        {name(id)} <span aria-hidden="true">↗</span>
      </Link>
    ) : (
      <span className="sponsor-v2-unlinked">{name(id)}</span>
    );

  async function runAction(payload: Record<string, unknown>, key: string) {
    setActionId(key);
    setError('');
    try {
      const response = await fetch('/api/admin/monetization', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || 'Действие не выполнено');
      setRefresh((value) => value + 1);
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : 'Действие не выполнено');
    } finally {
      setActionId(null);
    }
  }

  function submitSearch(event: FormEvent) {
    event.preventDefault();
    setPage(1);
    setActiveQuery(query.trim());
  }

  function adjust(sponsor: Sponsor) {
    if (!sponsor.user_id) return;
    const raw = window.prompt('Корректировка Stars. Например: 25 или -25', '25');
    if (!raw) return;
    const delta = Number(raw);
    if (!Number.isInteger(delta) || delta === 0) return;
    const reason = window.prompt('Причина корректировки:', 'Ручная корректировка владельцем') ?? '';
    if (reason.trim().length < 3) return;
    void runAction({ action: 'manual_adjustment', userId: sponsor.user_id, starsDelta: delta, reason }, `adjust:${sponsor.user_id}`);
  }

  function editSponsorNote(sponsor: Sponsor) {
    if (!sponsor.user_id) return;
    const note = window.prompt('Внутренняя заметка о спонсоре:', notesById.get(sponsor.user_id) ?? '') ?? '';
    void runAction({ action: 'sponsor_note', userId: sponsor.user_id, note }, `sponsor-note:${sponsor.user_id}`);
  }

  function refund(payment: Payment) {
    if (!window.confirm(`Вернуть ${payment.amount} Stars пользователю? Это реальный возврат через Telegram.`)) return;
    const reason = window.prompt('Причина возврата:', 'Возврат администратором') ?? '';
    if (!reason.trim()) return;
    void runAction({ action: 'refund', paymentId: payment.id, reason }, `refund:${payment.id}`);
  }

  function editPaymentNote(payment: Payment) {
    const note = window.prompt('Заметка к платежу:', payment.admin_note ?? '') ?? '';
    void runAction({ action: 'note', paymentId: payment.id, note }, `payment-note:${payment.id}`);
  }

  return (
    <main className="sponsor-v2-admin sponsor-v3-admin">
      <div className="sponsor-v25-head">
        <div>
          <span>STAGE 2.5 V3</span>
          <h1>Монетизация AnimeBox</h1>
          <p>Спонсоры, Stars, корректировки, аналитика и возвраты.</p>
        </div>
        <div className="sponsor-v25-actions">
          <button disabled={loading || actionId === 'reconcile'} onClick={() => void runAction({ action: 'reconcile' }, 'reconcile')}>
            {actionId === 'reconcile' ? 'Сверяем…' : '↻ Сверить Telegram'}
          </button>
          <button disabled={loading} onClick={() => setRefresh((value) => value + 1)}>Обновить</button>
        </div>
      </div>

      <form className="sponsor-v3-admin-search" onSubmit={submitSearch}>
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Ник, UUID или Telegram ID" />
        <button type="submit">Найти</button>
        {activeQuery && <button type="button" onClick={() => { setQuery(''); setActiveQuery(''); setPage(1); }}>Сбросить</button>}
      </form>

      {loading && <p role="status">Загрузка…</p>}
      {error && <p className="sponsor-v25-error" role="alert">{error}</p>}

      {data && (
        <>
          <div className="sponsor-v2-metrics sponsor-v25-metrics">
            <div>Учтено Stars<strong>{Number(data.metrics.total_stars).toLocaleString('ru-RU')}</strong></div>
            <div>Баланс Telegram<strong>{data.telegramBalance == null ? '—' : data.telegramBalance.toLocaleString('ru-RU')}</strong></div>
            <div>Спонсоров<strong>{data.metrics.sponsors}</strong></div>
            <div>Платежей<strong>{data.metrics.payment_count}</strong></div>
          </div>

          {data.analytics && (
            <section className="sponsor-v3-analytics">
              <h2>Аналитика · 30 дней</h2>
              <div>
                <article><span>Сегодня</span><strong>{data.analytics.stars_today} ★</strong></article>
                <article><span>7 дней</span><strong>{data.analytics.stars_7d} ★</strong></article>
                <article><span>30 дней</span><strong>{data.analytics.stars_30d} ★</strong></article>
                <article><span>Средний платёж</span><strong>{Number(data.analytics.avg_payment_30d).toFixed(1)} ★</strong></article>
                <article><span>Плательщиков</span><strong>{data.analytics.unique_payers_30d}</strong></article>
                <article><span>Повторных</span><strong>{data.analytics.repeat_payers_30d}</strong></article>
                <article><span>Возвратов</span><strong>{data.analytics.refunds_30d}</strong></article>
              </div>
            </section>
          )}

          <h2>Спонсоры</h2>
          <div className="sponsor-v2-table sponsor-v3-sponsor-table">
            <table>
              <thead><tr><th>Пользователь</th><th>Всего</th><th>Ручное</th><th>Уровень</th><th>Заметка</th><th>Действия</th></tr></thead>
              <tbody>
                {data.sponsors.map((sponsor) => (
                  <tr key={sponsor.account_key}>
                    <td>{profileLink(sponsor.user_id)}</td>
                    <td>{sponsor.total_stars} ★</td>
                    <td>{sponsor.manual_stars ? `${sponsor.manual_stars > 0 ? '+' : ''}${sponsor.manual_stars}` : '—'}</td>
                    <td>{sponsor.sponsor_tier ? <SponsorBadge tier={sponsor.sponsor_tier} /> : '—'}</td>
                    <td>{sponsor.user_id ? notesById.get(sponsor.user_id) || '—' : '—'}</td>
                    <td><div className="sponsor-v25-row-actions">
                      <button disabled={!sponsor.user_id || Boolean(actionId)} onClick={() => editSponsorNote(sponsor)}>Заметка</button>
                      {data.canAdjust && <button disabled={!sponsor.user_id || Boolean(actionId)} onClick={() => adjust(sponsor)}>± Stars</button>}
                    </div></td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!data.sponsors.length && <p>Ничего не найдено.</p>}
          </div>

          {data.adjustments.length > 0 && (
            <>
              <h2>Ручные корректировки</h2>
              <div className="sponsor-v2-table">
                <table>
                  <thead><tr><th>Дата</th><th>Пользователь</th><th>Stars</th><th>Причина</th><th>Статус</th><th /></tr></thead>
                  <tbody>{data.adjustments.map((item) => (
                    <tr key={item.id}>
                      <td>{new Date(item.created_at).toLocaleString('ru-RU')}</td>
                      <td>{profileLink(item.user_id)}</td>
                      <td>{item.stars_delta > 0 ? '+' : ''}{item.stars_delta}</td>
                      <td>{item.reason}</td>
                      <td>{item.voided_at ? 'Отменена' : 'Активна'}</td>
                      <td>{data.canAdjust && !item.voided_at && <button disabled={Boolean(actionId)} onClick={() => void runAction({ action: 'void_adjustment', adjustmentId: item.id }, `void:${item.id}`)}>Отменить</button>}</td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
            </>
          )}

          <h2>Платежи</h2>
          <div className="sponsor-v2-table sponsor-v25-table">
            <table>
              <thead><tr><th>Дата</th><th>Пользователь</th><th>Stars</th><th>Платёж</th><th>Сверка</th><th>Заметка</th><th>Действия</th></tr></thead>
              <tbody>
                {data.payments.map((payment) => (
                  <tr key={payment.id}>
                    <td>{new Date(payment.created_at).toLocaleString('ru-RU')}</td>
                    <td>{profileLink(payment.user_id)}</td>
                    <td>{payment.status === 'refunded' ? '−' : '+'}{payment.amount}</td>
                    <td><span className="sponsor-v25-status" data-status={payment.status}>{payment.status}</span></td>
                    <td><span className="sponsor-v25-status" data-status={payment.reconciliation_status}>{payment.reconciliation_status}</span>{payment.reconciliation_error && <small className="sponsor-v25-error-text">{payment.reconciliation_error}</small>}</td>
                    <td>{payment.admin_note || '—'}</td>
                    <td><div className="sponsor-v25-row-actions">
                      <button disabled={Boolean(actionId)} onClick={() => editPaymentNote(payment)}>Заметка</button>
                      <button className="is-danger" disabled={Boolean(actionId) || payment.status !== 'confirmed' || !data.canAdjust} onClick={() => refund(payment)}>{actionId === `refund:${payment.id}` ? 'Возврат…' : 'Вернуть ★'}</button>
                    </div></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="sponsor-v2-pager">
            <button disabled={page === 1 || loading} onClick={() => setPage((value) => value - 1)}>← Назад</button>
            <span>Страница {page}</span>
            <button disabled={!data.hasMore || loading} onClick={() => setPage((value) => value + 1)}>Дальше →</button>
          </div>
        </>
      )}
    </main>
  );
}
