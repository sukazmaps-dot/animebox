'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

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
  telegram_verified_at: string | null;
  refunded_at: string | null;
  refund_reason: string | null;
  reconciliation_error: string | null;
  admin_note: string | null;
  telegram_payment_charge_id: string;
};

type Data = {
  metrics: {
    total_stars: number;
    payment_count: number;
    sponsors: number;
    supporter: number;
    premium: number;
    patron: number;
  };
  payments: Payment[];
  sponsors: {
    account_key: string;
    user_id: string | null;
    total_stars: number;
    sponsor_tier: SponsorTier | null;
  }[];
  profiles: { id: string; username: string | null }[];
  telegramBalance: number | null;
  hasMore: boolean;
};

export default function MonetizationAdmin() {
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState('');
  const [page, setPage] = useState(1);
  const [refresh, setRefresh] = useState(0);
  const [loading, setLoading] = useState(true);
  const [actionId, setActionId] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/admin/monetization?page=${page}`, {
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
  }, [page, refresh]);

  const name = (id: string | null) =>
    id ? data?.profiles.find((profile) => profile.id === id)?.username || id : 'Telegram · без привязки';

  const profileLink = (id: string | null) =>
    id ? (
      <Link className="sponsor-v2-profile-link" href={`/profile/${id}`} title="Открыть профиль">
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

  function refund(payment: Payment) {
    if (!window.confirm(`Вернуть ${payment.amount} ⭐ пользователю? Это реальный возврат через Telegram.`)) return;
    const reason = window.prompt('Причина возврата:', 'Возврат администратором') ?? '';
    if (!reason.trim()) return;
    void runAction({ action: 'refund', paymentId: payment.id, reason }, `refund:${payment.id}`);
  }

  function editNote(payment: Payment) {
    const note = window.prompt('Заметка администратора:', payment.admin_note ?? '') ?? '';
    void runAction({ action: 'note', paymentId: payment.id, note }, `note:${payment.id}`);
  }

  return (
    <main className="sponsor-v2-admin">
      <div className="sponsor-v25-head">
        <div>
          <span>STAGE 2.5.1</span>
          <h1>Монетизация AnimeBox</h1>
          <p>Платежи Stars, сверка с Telegram и возвраты.</p>
        </div>
        <div className="sponsor-v25-actions">
          <button disabled={loading || actionId === 'reconcile'} onClick={() => void runAction({ action: 'reconcile' }, 'reconcile')}>
            {actionId === 'reconcile' ? 'Сверяем…' : '↻ Сверить Telegram'}
          </button>
          <button disabled={loading} onClick={() => setRefresh((value) => value + 1)}>Обновить</button>
        </div>
      </div>

      {loading && <p role="status">Загрузка…</p>}
      {error && <p className="sponsor-v25-error" role="alert">{error}</p>}

      {data && (
        <>
          <p className="sponsor-v2-note">Полученные Stars — не сумма вывода в деньгах. Возвращённые платежи не входят в Sponsor tier.</p>
          <div className="sponsor-v2-metrics sponsor-v25-metrics">
            <div>Получено<strong>{Number(data.metrics.total_stars).toLocaleString('ru-RU')} ⭐</strong></div>
            <div>Баланс Telegram<strong>{data.telegramBalance == null ? '—' : `${data.telegramBalance} ⭐`}</strong></div>
            <div>Спонсоров<strong>{data.metrics.sponsors}</strong></div>
            <div>Платежей<strong>{data.metrics.payment_count}</strong></div>
          </div>

          <h2>Распределение по уровням</h2>
          <p>Спонсор: {data.metrics.supporter} · Premium: {data.metrics.premium} · Меценат: {data.metrics.patron}</p>

          <h2>Кто поддержал</h2>
          <div className="sponsor-v2-table">
            <table>
              <thead><tr><th>Пользователь</th><th>Всего</th><th>Уровень</th></tr></thead>
              <tbody>
                {data.sponsors.map((sponsor) => (
                  <tr key={sponsor.account_key}>
                    <td>{profileLink(sponsor.user_id)}</td>
                    <td>{sponsor.total_stars} ⭐</td>
                    <td>{sponsor.sponsor_tier ? <SponsorBadge tier={sponsor.sponsor_tier} /> : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!data.sponsors.length && <p>Пока нет спонсоров.</p>}
          </div>

          <h2>Платежи · сначала новые</h2>
          <div className="sponsor-v2-table sponsor-v25-table">
            <table>
              <thead>
                <tr>
                  <th>Дата</th><th>Пользователь</th><th>Stars</th><th>Платёж</th><th>Сверка</th><th>Заметка</th><th>Действия</th>
                </tr>
              </thead>
              <tbody>
                {data.payments.map((payment) => (
                  <tr key={payment.id}>
                    <td>{new Date(payment.created_at).toLocaleString('ru-RU')}</td>
                    <td>{profileLink(payment.user_id)}</td>
                    <td>{payment.status === 'refunded' ? '−' : '+'}{payment.amount} ⭐</td>
                    <td><span className="sponsor-v25-status" data-status={payment.status}>{payment.status}</span></td>
                    <td>
                      <span className="sponsor-v25-status" data-status={payment.reconciliation_status}>{payment.reconciliation_status}</span>
                      {payment.reconciliation_error && <small className="sponsor-v25-error-text">{payment.reconciliation_error}</small>}
                    </td>
                    <td>{payment.admin_note || '—'}</td>
                    <td>
                      <div className="sponsor-v25-row-actions">
                        <button disabled={Boolean(actionId)} onClick={() => editNote(payment)}>Заметка</button>
                        <button className="is-danger" disabled={Boolean(actionId) || payment.status !== 'confirmed'} onClick={() => refund(payment)}>
                          {actionId === `refund:${payment.id}` ? 'Возврат…' : 'Вернуть ⭐'}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!data.payments.length && <p>Пока нет платежей.</p>}
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
