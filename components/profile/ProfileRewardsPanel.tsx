'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

import AnimeBoxLoader from '@/components/ui/AnimeBoxLoader';
import SeasonFramePreview from '@/components/leaderboard/SeasonFramePreview';
import styles from './ProfileRewardsPanel.module.css';

type Reward = {
  id: string;
  periodKey: string;
  startsAt: string;
  endsAt: string;
  periodType: 'week' | 'month';
  place: number;
  premiumDays: number;
  cosmeticKey: string | null;
  status: 'pending' | 'claimed';
  claimedAt: string | null;
};

type Frame = { key: string; label: string; expiresAt: string };

type Payload = {
  ok?: boolean;
  rewards?: Reward[];
  pending?: Reward[];
  unlockedFrames?: Frame[];
  selectedFrame?: string | null;
  premiumUntil?: string | null;
  error?: string;
};

function periodLabel(periodType: Reward['periodType']) {
  return periodType === 'month' ? 'месяца' : 'недели';
}

function rewardTitle(reward: Reward) {
  const suffix = periodLabel(reward.periodType);
  if (reward.place === 1) return `Чемпион ${suffix} · 1 место`;
  if (reward.place === 2) return `Серебряный призёр ${suffix} · 2 место`;
  if (reward.place === 3) return `Бронзовый призёр ${suffix} · 3 место`;
  return `Топ-10 ${suffix} · ${reward.place} место`;
}

function rewardSubtitle(reward: Reward) {
  const frameDays = reward.periodType === 'month' ? 30 : 7;
  if (reward.premiumDays > 0) {
    return `${reward.premiumDays} ${reward.premiumDays === 1 ? 'день' : reward.premiumDays < 5 ? 'дня' : 'дней'} Premium + рамка на ${frameDays} дней`;
  }
  return `Сезонная рамка на ${frameDays} дней`;
}

function formatExpiry(value: string) {
  return new Intl.DateTimeFormat('ru-RU', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(new Date(value));
}

export default function ProfileRewardsPanel() {
  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [selecting, setSelecting] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setError('');
    const response = await fetch('/api/community/leaderboard-rewards', { cache: 'no-store' });
    const payload = await response.json() as Payload;
    if (!response.ok) throw new Error(payload.error || 'Не удалось загрузить награды.');
    setData(payload);
  }, []);

  useEffect(() => {
    let active = true;
    queueMicrotask(() => {
      if (!active) return;
      void load()
        .catch((loadError) => {
          if (active) setError(loadError instanceof Error ? loadError.message : 'Не удалось загрузить награды.');
        })
        .finally(() => {
          if (active) setLoading(false);
        });
    });
    return () => { active = false; };
  }, [load]);

  const unlockedByKey = useMemo(
    () => new Map((data?.unlockedFrames ?? []).map((frame) => [frame.key, frame])),
    [data?.unlockedFrames],
  );

  async function claim(reward: Reward) {
    if (busyId) return;
    setBusyId(reward.id);
    setError('');
    setMessage('');
    try {
      const response = await fetch('/api/community/leaderboard-rewards', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'claim', rewardId: reward.id }),
        cache: 'no-store',
      });
      const payload = await response.json() as Payload;
      if (!response.ok) throw new Error(payload.error || 'Не удалось забрать награду.');
      setData(payload);
      setMessage('Награда получена ✓');
      window.dispatchEvent(new Event('animebox:entitlements-changed'));
      window.dispatchEvent(new Event('animebox:leaderboard-reward-claimed'));
    } catch (claimError) {
      setError(claimError instanceof Error ? claimError.message : 'Не удалось забрать награду.');
    } finally {
      setBusyId(null);
    }
  }

  async function selectFrame(frameKey: string | null) {
    if (selecting) return;
    setSelecting(frameKey ?? 'none');
    setError('');
    setMessage('');
    try {
      const response = await fetch('/api/community/leaderboard-rewards', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'select_frame', frameKey }),
        cache: 'no-store',
      });
      const payload = await response.json() as Payload;
      if (!response.ok) throw new Error(payload.error || 'Не удалось выбрать рамку.');
      setData((current) => current ? { ...current, selectedFrame: payload.selectedFrame ?? null } : current);
      setMessage(frameKey ? 'Рамка выбрана ✓' : 'Сезонная рамка отключена.');
      window.dispatchEvent(new Event('animebox:profile-cosmetic-changed'));
    } catch (selectError) {
      setError(selectError instanceof Error ? selectError.message : 'Не удалось выбрать рамку.');
    } finally {
      setSelecting(null);
    }
  }

  if (loading) {
    return <div className={styles.state}><AnimeBoxLoader label="Загружаем награды…" size={46} /></div>;
  }

  if (error && !data) {
    return <div className={`${styles.state} ${styles.error}`} role="alert">{error}</div>;
  }

  const rewards = data?.rewards ?? [];
  const unlocked = data?.unlockedFrames ?? [];

  return (
    <div className={styles.root}>
      <section className={styles.intro}>
        <div>
          <span>ANIMEBOX LEAGUE</span>
          <h2>Награды и сезонные рамки</h2>
          <p>Рамки — временный статус League: недельные действуют 7 дней, месячные — 30 дней. Результаты навсегда остаются в истории аккаунта.</p>
        </div>
        <div className={styles.summary}>
          <strong>{rewards.length}</strong>
          <span>сезонных результатов</span>
        </div>
      </section>

      {data?.pending?.length ? (
        <section className={styles.pending}>
          <div><span>ЕСТЬ НЕПОЛУЧЕННЫЙ ПРИЗ</span><strong>Итоги сезона уже зафиксированы</strong></div>
          {data.pending.map((reward) => (
            <button key={reward.id} type="button" disabled={Boolean(busyId)} onClick={() => void claim(reward)}>
              {busyId === reward.id ? 'Выдаём…' : 'Забрать приз'}
            </button>
          ))}
        </section>
      ) : null}

      <section className={styles.frames}>
        <div className={styles.sectionHeading}>
          <div><span>АКТИВНЫЕ НАГРАДЫ</span><h3>Рамки League</h3></div>
          {data?.selectedFrame && <button type="button" disabled={Boolean(selecting)} onClick={() => void selectFrame(null)}>Снять рамку</button>}
        </div>

        {unlocked.length ? (
          <div className={styles.frameGrid}>
            {unlocked.map((frame) => {
              const selected = data?.selectedFrame === frame.key;
              return (
                <button
                  type="button"
                  key={frame.key}
                  className={selected ? styles.selectedFrame : ''}
                  disabled={Boolean(selecting)}
                  onClick={() => void selectFrame(frame.key)}
                >
                  <SeasonFramePreview frameKey={frame.key} />
                  <span><strong>{frame.label}</strong><small>{selected ? `Используется · до ${formatExpiry(frame.expiresAt)}` : `Действует до ${formatExpiry(frame.expiresAt)}`}</small></span>
                </button>
              );
            })}
          </div>
        ) : (
          <div className={styles.empty}>Попади в Топ-10 недели или месяца — временная рамка появится здесь после получения награды.</div>
        )}
      </section>

      <section className={styles.history}>
        <div className={styles.sectionHeading}><div><span>ИСТОРИЯ</span><h3>Прошлые сезоны</h3></div></div>
        {rewards.length ? (
          <div className={styles.historyList}>
            {rewards.map((reward) => {
              const frame = reward.cosmeticKey ? unlockedByKey.get(reward.cosmeticKey) : null;
              return (
                <article key={reward.id}>
                  <SeasonFramePreview frameKey={reward.cosmeticKey} place={reward.place} compact />
                  <div>
                    <strong>{rewardTitle(reward)}</strong>
                    <span>{rewardSubtitle(reward)}</span>
                    <small>{new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(reward.endsAt))}{frame ? ` · ${frame.label} до ${formatExpiry(frame.expiresAt)}` : ''}</small>
                  </div>
                  <b data-status={reward.status}>{reward.status === 'claimed' ? 'Получено ✓' : 'Ожидает'}</b>
                </article>
              );
            })}
          </div>
        ) : (
          <div className={styles.empty}>Завершённых сезонов с наградами пока нет.</div>
        )}
      </section>

      {(message || error) && <p className={error ? styles.errorText : styles.message} role={error ? 'alert' : 'status'}>{error || message}</p>}
    </div>
  );
}
