/** Presentation only: durations are derived from existing schedule timestamps. */
export function formatHomeScheduleCountdown(airingAtSeconds: number, nowMs: number): string {
  if (!Number.isFinite(airingAtSeconds) || !Number.isFinite(nowMs)) return 'Время уточняется';
  const minutes = Math.max(0, Math.ceil((airingAtSeconds * 1000 - nowMs) / 60_000));
  if (minutes <= 0) return 'Вышло';
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor((minutes % 1440) / 60);
  const mins = minutes % 60;
  if (days > 0) return `через ${days} дн. ${hours} ч`;
  if (hours > 0) return `через ${hours} ч ${mins} мин`;
  return `через ${mins} мин`;
}
