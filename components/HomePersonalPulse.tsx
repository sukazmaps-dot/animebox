'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';

import { useAuthState } from '@/components/AuthStateProvider';
import type { CommunityProfile } from '@/lib/community-client';
import {
  getCommunityProfileCached,
  peekCommunityProfile,
} from '@/lib/community-profile-cache';

export default function HomePersonalPulse() {
  const { user, loading } = useAuthState();
  const [profile, setProfile] = useState<CommunityProfile | null>(
    () => peekCommunityProfile(user?.id),
  );

  useEffect(() => {
    if (loading || !user?.id) {
      if (!user?.id) setProfile(null);
      return;
    }

    let active = true;

    const timer = window.setTimeout(() => {
      void getCommunityProfileCached(user.id)
        .then((data) => {
          if (active) setProfile(data);
        })
        .catch(() => undefined);
    }, 2200);

    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [loading, user?.id]);

  const dailyDone = useMemo(
    () =>
      profile?.challenges.daily.filter((item) => Boolean(item.completedAt)).length ??
      0,
    [profile],
  );

  if (!user) return null;

  if (!profile) {
    return (
      <section
        className="home-pulse home-pulse--placeholder"
        aria-hidden="true"
      >
        <span className="home-pulse__placeholder-line is-wide" />
        <span className="home-pulse__placeholder-line" />
        <span className="home-pulse__placeholder-line" />
        <span className="home-pulse__placeholder-line" />
      </section>
    );
  }

  const dailyTotal = profile.challenges.daily.length;
  const streak = profile.challenges.streak.current;
  const level = profile.progression.level;
  const rank = profile.progression.rank;

  return (
    <section className="home-pulse" aria-label="Твой прогресс AnimeBox">
      <div className="home-pulse__identity">
        <span className="home-pulse__rail" aria-hidden="true" />
        <div>
          <span>Твой AnimeBox</span>
          <strong>LV.{level} · {rank}</strong>
        </div>
      </div>

      <div className="home-pulse__metric">
        <span>Серия</span>
        <strong>{streak > 0 ? `🔥 ${streak} дн.` : 'Начни сегодня'}</strong>
      </div>

      <div className="home-pulse__metric">
        <span>Сегодня</span>
        <strong>{dailyDone} / {dailyTotal} заданий</strong>
      </div>

      <div className="home-pulse__metric home-pulse__metric--watch">
        <span>Подтверждено</span>
        <strong>{profile.stats.episodes.toLocaleString('ru-RU')} серий</strong>
      </div>

      <Link href="/challenges" className="home-pulse__link">
        Прогресс
        <span aria-hidden="true">→</span>
      </Link>
    </section>
  );
}
