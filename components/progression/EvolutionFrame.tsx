import {
  evolutionFrameAsset,
  progressionMilestoneAsset,
  type EvolutionFrameStage,
  type PrestigeTier,
} from '@/lib/progression-milestones';

import styles from './Progression.module.css';

export default function EvolutionFrame({
  level,
  frameStage,
  prestigeTier = 0,
  premium = false,
  className = '',
}: {
  level: number;
  frameStage: EvolutionFrameStage;
  prestigeTier?: PrestigeTier;
  premium?: boolean;
  className?: string;
}) {
  const milestoneAsset =
    level === 10 || level === 25 || level === 50 || level === 75 || level === 100
      ? progressionMilestoneAsset(level, premium)
      : null;
  const asset = milestoneAsset ?? evolutionFrameAsset(frameStage, prestigeTier);

  return (
    <span
      className={`${styles.frame} ${className}`.trim()}
      data-stage={frameStage}
      data-prestige={prestigeTier}
      data-premium={premium ? 'true' : 'false'}
      aria-hidden="true"
    >
      <span className={styles.frameCore}>{level}</span>
      {asset && <img src={asset} alt="" draggable={false} />}
    </span>
  );
}
