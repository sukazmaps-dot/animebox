import styles from './Progression.module.css';

export default function PrestigeEmblem({
  tier,
  className = '',
}: {
  tier: number;
  className?: string;
}) {
  if (tier < 1) return null;

  return (
    <span className={`${styles.prestige} ${className}`.trim()}>
      <span aria-hidden="true">✦</span>
      Prestige I
    </span>
  );
}
