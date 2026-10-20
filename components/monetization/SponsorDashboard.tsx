'use client';

import { useCallback, useEffect, useState, type Dispatch, type SetStateAction } from 'react';
import Link from 'next/link';

import { useAuthState } from '@/components/AuthStateProvider';
import SponsorBadge from './SponsorBadge';
import AnimeBoxStar from './AnimeBoxStar';
import SponsorProgressBar from './SponsorProgressBar';
import { SPONSOR_META } from '@/lib/sponsor';
import styles from './SponsorHistory.module.css';
import {
  getSponsorMe,
  invalidateSponsorMe,
  peekSponsorMe,
  type SponsorMeData,
} from '@/lib/sponsor-me-client';

const STATUS_LABEL: Record<string, string> = {
  confirmed: 'Подтверждено',
  refunded: 'Возвращено',
  disputed: 'Спорный платёж',
  reconciliation_error: 'Нужна проверка',
  paid: 'Подтверждено',
};

export default function SponsorDashboard({ history = false }: { history?: boolean }) {
  const { user } = useAuthState();
  const initial = peekSponsorMe(user?.id, 1);
  const [data, setData] = useState<SponsorMeData | null>(initial);
  const [error, setError] = useState('');
  const [guest, setGuest] = useState(false);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(!initial);
  const [refresh, setRefresh] = useState(0);

  const reload = useCallback(() => {
    invalidateSponsorMe(user?.id);
    setRefresh((value) => value + 1);
  }, [user?.id]);

  useEffect(() => {
    window.addEventListener('animebox:support-paid', reload);
    window.addEventListener('animebox:sponsor-preferences-changed', reload);
    return () => {
      window.removeEventListener('animebox:support-paid', reload);
      window.removeEventListener('animebox:sponsor-preferences-changed', reload);
    };
  }, [reload]);

  useEffect(() => {
    let active = true;
    if (!user?.id) {
      queueMicrotask(() => {
        if (!active) return;
        setGuest(true);
        setData(null);
        setLoading(false);
      });
      return () => {
        active = false;
      };
    }

    const cached = page === 1 ? peekSponsorMe(user.id, 1) : null;

    queueMicrotask(() => {
      if (!active) return;
      setData(cached);
      setLoading(!cached);
      setError('');
    });

    void getSponsorMe(user.id, page, { force: refresh > 0 })
      .then((nextData) => {
        if (!active) return;
        setGuest(false);
        setData(nextData);
      })
      .catch((nextError) => {
        if (!active) return;
        if ((nextError as Error & { status?: number }).status === 401) {
          setGuest(true);
          setData(null);
          return;
        }
        setError(
          nextError instanceof Error
            ? nextError.message
            : 'Не удалось загрузить поддержку',
        );
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [page, refresh, user?.id]);

  return <SponsorDashboardView history={history} data={data} loading={loading}
    error={error} guest={guest} page={page} reload={reload} setPage={setPage} />;
}

/** Presentation shared by the live dashboard and isolated layout previews.
 * All account requests, cache invalidation and paging state stay above. */
export function SponsorDashboardView({ history = false, data, loading = false, error = '', guest = false, page = 1, reload, setPage }: {
  history?: boolean;
  data: SponsorMeData | null;
  loading?: boolean;
  error?: string;
  guest?: boolean;
  page?: number;
  reload?: () => void;
  setPage?: Dispatch<SetStateAction<number>>;
}) {
  const next = [25, 100, 250].find((value) => value > (data?.totalStars ?? 0));
  const emptyHistory = history && data && !data.payments.length && !data.donations?.length;
  const firstSupport = emptyHistory && page === 1 && !data.hasMore && data.totalStars === 0;

  return (
    <section className={history ? styles.panel : 'sponsor-v2-panel'} aria-busy={loading} data-support-history={history ? 'true' : undefined}>
      <div className={history ? styles.heading : 'sponsor-v2-heading'}>
        <div>
          <span className={history ? styles.eyebrow : 'sponsor-v2-eyebrow'}>ТВОЙ ВКЛАД</span>
          <h2>{history ? 'История поддержки' : 'Твой путь спонсора'}</h2>
        </div>
        <div className={history ? styles.actions : 'sponsor-v3-dashboard-actions'} role="group" aria-label="Разделы поддержки и обновление прогресса">
          {data?.sponsor && <Link className={history ? undefined : 'btn btn--ghost'} href="/settings/sponsor">Оформление</Link>}
          {history
            ? <Link href="/support">Поддержка</Link>
            : <Link className="btn btn--ghost" href="/support/history">История</Link>}
          <Link className={history ? undefined : 'btn btn--ghost'} href="/supporters">Спонсоры</Link>
          <button className={history ? undefined : 'btn btn--ghost'} type="button" onClick={reload} disabled={loading}>
            Обновить
          </button>
        </div>
      </div>

      {loading && !data && <p role="status">Загружаем прогресс…</p>}
      {error && (
        <p role="alert">
          {error} <button onClick={reload}>Повторить</button>
        </p>
      )}
      {guest && (
        <p>
          <Link href="/profile">Войди в аккаунт</Link>, чтобы видеть свой прогресс и историю поддержки.
        </p>
      )}

      {data && (
        <>
          <div className={history ? styles.total : 'sponsor-v2-total'}>
            <strong>
              {data.totalStars.toLocaleString('ru-RU')}{' '}
              <AnimeBoxStar size={30} className="animebox-star-icon--pulse" />
            </strong>
            {data.sponsor && <SponsorBadge tier={data.sponsor.tier} />}
          </div>

          {data.sponsor && (
            <div className="sponsor-v3-benefit-chips sponsor-v3-benefit-chips--dashboard">
              <span data-active={data.benefits.adFree}>Без рекламы {data.benefits.adFree ? '✓' : '🔒'}</span>
              <span>{Math.max(0, data.benefits.frames.length - 2)} рамок</span>
              <span>{data.benefits.themes.length} тем профиля</span>
            </div>
          )}

          {!firstSupport && (next ? (
            <p className={history ? styles.next : 'sponsor-v2-next'}>
              До уровня{' '}
              <strong>
                {SPONSOR_META[next === 25 ? 'supporter' : next === 100 ? 'premium' : 'patron'].label}
              </strong>{' '}
              осталось
              <span className={history ? styles.amount : 'sponsor-v2-next__amount'}>
                {next - data.totalStars}{' '}
                <AnimeBoxStar size={20} className="animebox-star-icon--pulse" />
              </span>
            </p>
          ) : (
            <p className={history ? styles.next : 'sponsor-v2-next sponsor-v2-next--complete'}>
              Высший уровень открыт{' '}
              <AnimeBoxStar size={20} className="animebox-star-icon--pulse" /> Спасибо за поддержку AnimeBox!
            </p>
          ))}

          {!firstSupport && <SponsorProgressBar
            current={next ? data.totalStars : 250}
            target={next ?? 250}
            label="Прогресс спонсорства"
          />}

          {!data.telegramLinked && (
            <p className={history ? styles.note : 'sponsor-v2-note'}>
              Для автоматического получения статуса привяжи Telegram к своему аккаунту в профиле. Stars учитываются по аккаунту плательщика в Telegram.
            </p>
          )}

          {history && (
            <>
              {emptyHistory && <div className={styles.empty} data-support-empty="true">
                <strong>{page === 1 ? 'История пока пустая' : 'На этой странице пока нет платежей'}</strong>
                <p>Здесь появятся твои Telegram Stars и привязанные донаты картой.</p>
                <Link href="/support">Поддержать AnimeBox →</Link>
              </div>}
              {data.payments.length > 0 && <div className={styles.historyBlock}>
                <div className={styles.historyTitle}>
                  <strong>Telegram Stars</strong>
                  <span>Влияют на уровни спонсорства</span>
                </div>

                <ul className={styles.historyList}>
                    {data.payments.map((payment) => (
                      <li key={payment.id} data-status={payment.status}>
                        <div>
                          <time dateTime={payment.created_at}>
                            {new Date(payment.created_at).toLocaleString('ru-RU')}
                          </time>
                          <small>{STATUS_LABEL[payment.status] ?? payment.status}</small>
                          {payment.refund_reason && <small>{payment.refund_reason}</small>}
                        </div>
                        <strong>
                          {payment.status === 'refunded' ? '−' : '+'}{payment.amount}{' '}
                          <AnimeBoxStar size={20} />
                        </strong>
                      </li>
                    ))}
                  </ul>

              </div>}

              {Boolean(data.donations?.length) && <div className={styles.historyBlock}>
                <div className={styles.historyTitle}>
                  <strong>Донаты картой</strong>
                  <span>Учитываются отдельно от Stars</span>
                </div>

                <ul className={styles.historyList}>
                    {data.donations?.map((donation) => (
                      <li key={donation.id} data-status={donation.status}>
                        <div>
                          <time dateTime={donation.paid_at ?? donation.created_at}>
                            {new Date(donation.paid_at ?? donation.created_at).toLocaleString('ru-RU')}
                          </time>
                          <small>{STATUS_LABEL[donation.status] ?? donation.status} · {donation.provider === 'boosty' ? 'Boosty' : donation.provider === 'donatepay' ? 'DonatePay' : donation.provider}</small>
                          {donation.comment && <small>{donation.comment}</small>}
                        </div>
                        <strong>
                          {donation.status === 'refunded' ? '−' : '+'}
                          {Number(donation.amount).toLocaleString('ru-RU', { maximumFractionDigits: 4 })} {donation.currency}
                        </strong>
                      </li>
                    ))}
                  </ul>

              </div>}

              {(page > 1 || data.hasMore) && <div className={styles.pager}>
                <button
                  disabled={page === 1 || loading}
                  onClick={() => setPage?.((value) => value - 1)}
                >
                  ← Назад
                </button>
                <span>Страница {page}</span>
                <button
                  disabled={!data.hasMore || loading}
                  onClick={() => setPage?.((value) => value + 1)}
                >
                  Дальше →
                </button>
              </div>}
            </>
          )}
        </>
      )}

      {history ? <details className={styles.rules}>
        <summary>Как учитывается поддержка</summary>
        <p>Уровни накопительные: учитываются подтверждённые Telegram Stars и одобренные ручные корректировки. Донаты картой сохраняются отдельно и не конвертируются в Stars.</p>
      </details> : <p className="sponsor-v2-note">
        Уровни накопительные. В них учитываются подтверждённые Telegram Stars и одобренные ручные корректировки. Донаты в обычной валюте сохраняются отдельно и не конвертируются в Stars.
      </p>}
    </section>
  );
}
