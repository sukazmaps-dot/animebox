import type { ProfileProgression } from '@/lib/progression';
import { progressionEvolutionState } from '@/lib/progression-milestones';

import EvolutionFrame from './EvolutionFrame';
import PrestigeEmblem from './PrestigeEmblem';
import styles from './Progression.module.css';

export default function ProgressionStatus({
  progression,
  premium = false,
}: {
  progression: ProfileProgression;
  premium?: boolean;
}) {
  const evolution = progressionEvolutionState(progression, premium);

  return (
    <section className={styles.status} aria-label="Прогресс AnimeBox">
      <EvolutionFrame
        level={progression.level}
        frameStage={evolution.frameStage}
        prestigeTier={evolution.prestigeTier}
        premium={evolution.premiumEvolutionEnabled}
      />

      <div className={styles.copy}>
        <span className={styles.eyebrow}>ANIMEBOX PROGRESSION</span>
        <h3>LVL {progression.level} · {progression.rank}</h3>
        <p>
          {evolution.nextMilestone
            ? `До «${evolution.nextMilestone.title}» — уровень ${evolution.nextMilestone.level}.`
            : 'Максимальная ступень достигнута. Prestige не сбрасывает XP.'}
        </p>
        <div className={styles.progress} aria-hidden="true">
          <span style={{ width: `${progression.progressPct}%` }} />
        </div>
      </div>

      <div className={styles.metrics}>
        <strong>{progression.totalXp.toLocaleString('ru-RU')} XP</strong>
        <span>{progression.xpToNext > 0 ? `${progression.xpToNext.toLocaleString('ru-RU')} XP до следующего уровня` : 'MAX LEVEL'}</span>
        <PrestigeEmblem tier={evolution.prestigeTier} />
      </div>
    </section>
  );
}
