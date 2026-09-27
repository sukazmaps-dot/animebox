'use client';

import { useEffect, useState } from 'react';

import AnimeBoxLoader from '@/components/ui/AnimeBoxLoader';
import type { ProfileProgression } from '@/lib/progression';
import type { ProgressionMilestoneDefinition } from '@/lib/progression-milestones';

import ProgressionMilestoneCard from './ProgressionMilestoneCard';
import ProgressionStatus from './ProgressionStatus';
import styles from './Progression.module.css';

type Payload = {
  progression?: ProfileProgression;
  milestones?: Array<ProgressionMilestoneDefinition & { unlocked: boolean }>;
  premium?: boolean;
  error?: string;
};

export default function ProgressionOverview() {
  const [data, setData] = useState<Payload | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;

    void fetch('/api/community/progression/status', { cache: 'no-store' })
      .then(async (response) => {
        const payload = (await response.json()) as Payload;
        if (!response.ok) throw new Error(payload.error || 'Не удалось загрузить прогрессию.');
        if (active) setData(payload);
      })
      .catch((requestError) => {
        if (active) {
          setError(
            requestError instanceof Error
              ? requestError.message
              : 'Не удалось загрузить прогрессию.',
          );
        }
      });

    return () => {
      active = false;
    };
  }, []);

  if (error) {
    return <div className={styles.state} role="alert">{error}</div>;
  }

  if (!data?.progression) {
    return (
      <div className={styles.state}>
        <AnimeBoxLoader label="Загружаем прогрессию…" size={42} />
      </div>
    );
  }

  return (
    <section className={styles.root}>
      <ProgressionStatus progression={data.progression} premium={Boolean(data.premium)} />

      <div className={styles.grid}>
        {(data.milestones ?? []).map((milestone) => (
          <ProgressionMilestoneCard
            key={milestone.level}
            milestone={milestone}
            currentLevel={data.progression!.level}
            premium={Boolean(data.premium)}
          />
        ))}
      </div>

      <p className={styles.note}>
        XP одинаков для обычных и Premium-пользователей. Premium влияет только на
        <span className={styles.premiumNote}> визуальную эволюцию</span> рамки, glow и motion.
        Prestige I открывается на LVL 100 без сброса прогресса.
      </p>
    </section>
  );
}
