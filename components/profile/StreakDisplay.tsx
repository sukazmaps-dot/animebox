/* eslint-disable @next/next/no-img-element */
import type { CSSProperties } from 'react';
import {
  streakActiveToday,
  streakDays,
  streakHint,
  streakMilestone,
  streakTier,
  streakTierLabel,
} from '@/lib/streak';

import styles from './StreakDisplay.module.css';

type Variant = 'full' | 'compact' | 'hero';

export default function StreakDisplay({
  current,
  longest,
  lastActiveDate = null,
  todayKey = '',
  variant = 'full',
  className = '',
}: {
  current: number;
  longest: number;
  lastActiveDate?: string | null;
  todayKey?: string | null;
  variant?: Variant;
  className?: string;
}) {
  const tier = streakTier(current);
  const tierLabel = streakTierLabel(current);
  const milestone = streakMilestone(current);
  const activeToday = streakActiveToday(lastActiveDate, todayKey);
  const currentText = current > 0 ? streakDays(current) : 'Серия не начата';
  const recordText = streakDays(longest);

  if (variant === 'compact') {
    return (
      <div
        className={`${styles.root} ${styles.compact} ${className}`.trim()}
        data-tier={tier}
        data-active-today={activeToday ? 'true' : 'false'}
      >
        <span className={styles.compactFlame} aria-hidden="true">
          <img src="/brand/profile/streak-fire.webp" alt="" />
        </span>
        <span className={styles.compactCopy}>
          <small>Серия активности</small>
          <strong>{currentText}</strong>
          <em>Рекорд · {recordText}</em>
        </span>
      </div>
    );
  }

  return (
    <div
      className={`${styles.root} ${variant === 'hero' ? styles.hero : styles.full} ${className}`.trim()}
      data-tier={tier}
      data-active-today={activeToday ? 'true' : 'false'}
    >
      <div className={styles.flameStage} aria-hidden="true">
        <span className={styles.flameAura} />
        <img src="/brand/profile/streak-fire.webp" alt="" />
      </div>

      <div className={styles.main}>
        <div className={styles.heading}>
          <span>Серия активности</span>
          <em>{tierLabel}</em>
        </div>
        <strong className={styles.value}>{currentText}</strong>
        <small className={styles.hint}>
          {streakHint({ current, activeToday })}
        </small>
      </div>

      <div className={styles.record}>
        <span>Личный рекорд</span>
        <strong>{recordText}</strong>
      </div>

      <div className={styles.milestone}>
        <div className={styles.milestoneMeta}>
          <span>
            {current <= 0
              ? 'Первый огонь'
              : `До ${streakDays(milestone.target)}`}
          </span>
          <b>{current} / {milestone.target}</b>
        </div>

        <div
          className={styles.rail}
          role="progressbar"
          aria-label={`Прогресс серии до ${streakDays(milestone.target)}`}
          aria-valuemin={0}
          aria-valuemax={milestone.target}
          aria-valuenow={Math.min(current, milestone.target)}
        >
          <span
            className={styles.railFill}
            style={{ '--streak-progress': `${milestone.percent}%` } as CSSProperties}
          />
        </div>
      </div>
    </div>
  );
}
