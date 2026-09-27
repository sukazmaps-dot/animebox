import type { ProgressionMilestoneDefinition } from '@/lib/progression-milestones';

import EvolutionFrame from './EvolutionFrame';
import styles from './Progression.module.css';

export default function ProgressionMilestoneCard({
  milestone,
  currentLevel,
  premium = false,
}: {
  milestone: ProgressionMilestoneDefinition;
  currentLevel: number;
  premium?: boolean;
}) {
  const unlocked = currentLevel >= milestone.level;
  const current =
    unlocked &&
    !([10, 25, 50, 75, 100] as const).some(
      (level) => level > milestone.level && currentLevel >= level,
    );

  return (
    <article
      className={styles.card}
      data-unlocked={unlocked ? 'true' : 'false'}
      data-current={current ? 'true' : 'false'}
    >
      <EvolutionFrame
        level={milestone.level}
        frameStage={milestone.frameStage}
        prestigeTier={milestone.level === 100 ? 1 : 0}
        premium={premium && unlocked}
        className={`${styles.cardFrame} ${unlocked ? '' : styles.locked}`.trim()}
      />
      <strong>LVL {milestone.level} · {milestone.title}</strong>
      <small>{milestone.subtitle}</small>
      <em>{unlocked ? 'Открыто' : `Откроется на LVL ${milestone.level}`}</em>
    </article>
  );
}
