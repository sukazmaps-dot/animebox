'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';

import { useAuthState } from '@/components/AuthStateProvider';
import SeasonFramePreview from '@/components/leaderboard/SeasonFramePreview';
import styles from './SeasonRewardClaimModal.module.css';

type Reward = {
  id: string;
  seasonId: string;
  periodKey: string;
  startsAt: string;
  endsAt: string;
  periodType: 'week' | 'month';
  place: number;
  rewardKey: string;
  premiumDays: number;
  cosmeticKey: string | null;
  status: 'pending' | 'claimed';
  createdAt: string;
  claimedAt: string | null;
};

type Payload = {
  ok?: boolean;
  pending?: Reward[];
  premiumUntil?: string | null;
  error?: string;
};

const DISMISS_KEY = 'animebox:leaderboard-reward-dismissed:v1';

function placeLabel(reward: Reward) {
  const suffix = reward.periodType === 'month' ? 'месяца' : 'недели';
  if (reward.place === 1) return `1 место · Чемпион ${suffix}`;
  if (reward.place === 2) return `2 место · Серебряный призёр ${suffix}`;
  if (reward.place === 3) return `3 место · Бронзовый призёр ${suffix}`;
  return `${reward.place} место · Топ-10 ${suffix}`;
}

function rewardLabel(reward: Reward) {
  const frameDays = reward.periodType === 'month' ? 30 : 7;
  if (reward.premiumDays > 0) {
    return `Premium на ${reward.premiumDays} ${reward.premiumDays === 1 ? 'день' : reward.premiumDays < 5 ? 'дня' : 'дней'} + рамка на ${frameDays} дней`;
  }
  return `Сезонная рамка на ${frameDays} дней`;
}

export default function SeasonRewardClaimModal() {
  const { user, loading } = useAuthState();
  const [reward, setReward] = useState<Reward | null>(null);
  const [visible, setVisible] = useState(false);
  const [claiming, setClaiming] = useState(false);
  const [claimed, setClaimed] = useState(false);
  const [premiumUntil, setPremiumUntil] = useState<string | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (loading || !user?.id) return;

    let active = true;
    const controller = new AbortController();

    fetch('/api/community/leaderboard-rewards', {
      cache: 'no-store',
      signal: controller.signal,
    })
      .then(async (response) => {
        if (response.status === 404) return { pending: [] } as Payload;
        const body = await response.json() as Payload;
        if (!response.ok) throw new Error(body.error || 'reward_lookup_failed');
        return body;
      })
      .then((body) => {
        if (!active) return;
        const next = body.pending?.[0] ?? null;
        if (!next) return;

        try {
          if (sessionStorage.getItem(DISMISS_KEY) === next.id) return;
        } catch {
          // Restricted WebViews may deny sessionStorage.
        }

        setReward(next);
        setVisible(true);
      })
      .catch((requestError) => {
        if (!active || requestError?.name === 'AbortError') return;
        console.warn('[Leaderboard reward] lookup failed:', requestError);
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [loading, user?.id]);

  const period = useMemo(() => {
    if (!reward) return '';
    const end = new Date(reward.endsAt);
    return new Intl.DateTimeFormat('ru-RU', {
      day: 'numeric',
      month: 'long',
    }).format(end);
  }, [reward]);

  function dismiss() {
    if (reward) {
      try {
        sessionStorage.setItem(DISMISS_KEY, reward.id);
      } catch {}
    }
    setVisible(false);
  }

  async function claim() {
    if (!reward || claiming || claimed) return;
    setClaiming(true);
    setError('');

    try {
      const response = await fetch('/api/community/leaderboard-rewards', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'claim', rewardId: reward.id }),
        cache: 'no-store',
      });
      const body = await response.json() as Payload;
      if (!response.ok) throw new Error(body.error || 'Не удалось забрать награду.');
      setPremiumUntil(body.premiumUntil ?? null);
      setClaimed(true);
      window.dispatchEvent(new Event('animebox:entitlements-changed'));
      window.dispatchEvent(new Event('animebox:leaderboard-reward-claimed'));
    } catch (claimError) {
      setError(claimError instanceof Error ? claimError.message : 'Не удалось забрать награду.');
    } finally {
      setClaiming(false);
    }
  }

  if (!visible || !reward) return null;

  return (
    <div className={styles.backdrop} role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget && !claiming) dismiss();
    }}>
      <section className={styles.dialog} role="dialog" aria-modal="true" aria-labelledby="season-reward-title">
        <button className={styles.close} type="button" aria-label="Закрыть" onClick={dismiss} disabled={claiming}>×</button>

        <div className={styles.frameStage} aria-hidden="true">
          <SeasonFramePreview frameKey={reward.cosmeticKey} place={reward.place} />
        </div>

        <span className={styles.eyebrow}>ANIMEBOX LEAGUE · {reward.periodType === 'month' ? 'МЕСЯЦ' : 'НЕДЕЛЯ'} ЗАВЕРШЕН{reward.periodType === 'month' ? '' : 'А'}</span>
        <h2 id="season-reward-title">{claimed ? 'Награда получена' : 'Ты в числе лучших'}</h2>
        <p className={styles.place}>{placeLabel(reward)}</p>
        <p className={styles.period}>Итоги {reward.periodType === 'month' ? 'месяца' : 'недели'} до {period}</p>

        <div className={styles.rewardCard}>
          <small>ВАШ ПРИЗ</small>
          <strong>{rewardLabel(reward)}</strong>
          {reward.cosmeticKey && <span>Рамка временная и автоматически исчезнет после срока действия.</span>}
        </div>

        {claimed ? (
          <div className={styles.claimed} role="status">
            <strong>Получено ✓</strong>
            {premiumUntil && (
              <span>
                Premium активен до {new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(premiumUntil))}
              </span>
            )}
          </div>
        ) : (
          <button className={styles.claimButton} type="button" onClick={() => void claim()} disabled={claiming}>
            {claiming ? 'Выдаём награду…' : 'Забрать приз'}
          </button>
        )}

        {error && <p className={styles.error} role="alert">{error}</p>}

        <div className={styles.footer}>
          <Link href="/leaderboard" onClick={dismiss}>Новый сезон уже идёт →</Link>
          <button type="button" onClick={dismiss}>Позже</button>
        </div>
      </section>
    </div>
  );
}
