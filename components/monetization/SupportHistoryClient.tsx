'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

type HistoryItem = {
  id: string;
  provider: string;
  product_code: string;
  status: string;
  amount: number | string;
  currency: string;
  provider_status: string | null;
  paid_at: string | null;
  refunded_at: string | null;
  created_at: string;
  integrity_status: 'ok' | 'needs_review' | 'disputed' | 'reconciliation_error';
  integrity_note: string | null;
};

type Payload = {
  items: HistoryItem[];
  page: number;
  hasMore: boolean;
  error?: string;
};

const PRODUCT_LABELS: Record<string, string> = {
  sponsor_support: 'Поддержка AnimeBox',
  donation_once: 'Разовая поддержка',
  premium_monthly: 'AnimeBox Premium · месяц',
  premium_yearly: 'AnimeBox Premium · год',
  gift_premium_month: 'Premium в подарок',
};

const STATUS_LABELS: Record<string, string> = {
  pending: 'Ожидает',
  paid: 'Оплачен',
  failed: 'Ошибка',
  cancelled: 'Отменён',
  partially_refunded: 'Частичный возврат',
  refunded: 'Возвращён',
};

const INTEGRITY_LABELS: Record<HistoryItem['integrity_status'], string> = {
  ok: 'Проверен',
  needs_review: 'На проверке',
  disputed: 'Спорный',
  reconciliation_error: 'Ошибка сверки',
};

function formatAmount(item: HistoryItem) {
  const amount = Number(item.amount);
  const value = Number.isFinite(amount)
    ? amount.toLocaleString('ru-RU', { maximumFractionDigits: 4 })
    : String(item.amount);
  return item.currency === 'XTR' ? `${value} ★` : `${value} ${item.currency}`;
}

export default function SupportHistoryClient() {
  const [items, setItems] = useState<HistoryItem[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    queueMicrotask(() => {
      if (!active) return;
      setLoading(true);
      setError('');
    });

    fetch(`/api/monetization/history?page=${page}`, {
      cache: 'no-store',
      signal: controller.signal,
    })
      .then(async (res) => {
        const payload = (await res.json()) as Payload;
        if (!res.ok) throw new Error(payload.error || 'Не удалось загрузить историю.');
        setItems(payload.items);
        setHasMore(payload.hasMore);
      })
      .catch((loadError) => {
        if (!controller.signal.aborted) {
          setError(loadError instanceof Error ? loadError.message : 'Ошибка загрузки.');
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [page]);

  if (loading) {
    return <section className="support-history-card"><p role="status">Загружаем платежи…</p></section>;
  }

  if (error) {
    return (
      <section className="support-history-card">
        <p role="alert">{error}</p>
        <Link href="/support">Вернуться к поддержке</Link>
      </section>
    );
  }

  return (
    <section className="support-history-card">
      {!items.length ? (
        <div className="support-history-empty">
          <strong>История пока пустая</strong>
          <p>Здесь появятся Telegram Stars, Premium и другие подтверждённые платежи AnimeBox.</p>
          <Link href="/support">Поддержать AnimeBox →</Link>
        </div>
      ) : (
        <div className="support-history-list">
          {items.map((item) => (
            <article key={item.id} className="support-history-item">
              <div>
                <span className="support-history-provider">{item.provider.replaceAll('_', ' ')}</span>
                <strong>{PRODUCT_LABELS[item.product_code] ?? item.product_code}</strong>
                <small>{new Date(item.paid_at || item.created_at).toLocaleString('ru-RU')}</small>
              </div>
              <div className="support-history-meta">
                <strong>{formatAmount(item)}</strong>
                <span className="support-history-status" data-status={item.status}>
                  {STATUS_LABELS[item.status] ?? item.status}
                </span>
                {item.integrity_status !== 'ok' && (
                  <span className="support-history-integrity" data-status={item.integrity_status} title={item.integrity_note || undefined}>
                    {INTEGRITY_LABELS[item.integrity_status]}
                  </span>
                )}
              </div>
            </article>
          ))}
        </div>
      )}

      {(page > 1 || hasMore) && (
        <div className="support-history-pager">
          <button type="button" disabled={page === 1} onClick={() => setPage((value) => Math.max(1, value - 1))}>← Назад</button>
          <span>Страница {page}</span>
          <button type="button" disabled={!hasMore} onClick={() => setPage((value) => value + 1)}>Дальше →</button>
        </div>
      )}
    </section>
  );
}
