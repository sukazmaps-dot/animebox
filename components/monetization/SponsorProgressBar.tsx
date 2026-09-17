type Props = {
  current: number;
  target: number;
  label?: string;
};

export default function SponsorProgressBar({ current, target, label }: Props) {
  const safeTarget = Math.max(1, target);
  const safeCurrent = Math.max(0, current);
  const percent = Math.min(100, Math.max(0, (safeCurrent / safeTarget) * 100));

  return (
    <div
      className="sponsor-progress"
      role="progressbar"
      aria-label={label ?? 'Прогресс спонсорства'}
      aria-valuemin={0}
      aria-valuemax={safeTarget}
      aria-valuenow={Math.min(safeCurrent, safeTarget)}
    >
      <div className="sponsor-progress__track">
        <div
          className="sponsor-progress__fill"
          style={{ width: `${percent}%` }}
        >
          {percent > 0 && <span className="sponsor-progress__glow" aria-hidden="true" />}
        </div>
      </div>
    </div>
  );
}
