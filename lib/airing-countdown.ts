export type AiringCountdownSnapshot =
  | { state: 'countdown'; label: string }
  | { state: 'elapsed'; label: 'Время выхода прошло' };

/** Formats AniList nextAiringEpisode.airingAt (Unix seconds). */
export function getAiringCountdown(airingAt: number, nowMs: number): AiringCountdownSnapshot | null {
  if (!Number.isSafeInteger(airingAt) || airingAt <= 0 || !Number.isFinite(nowMs)) return null;
  const remainingSeconds = Math.ceil((airingAt * 1000 - nowMs) / 1000);
  if (remainingSeconds <= 0) return { state: 'elapsed', label: 'Время выхода прошло' };
  const days = Math.floor(remainingSeconds / 86400);
  const hours = Math.floor((remainingSeconds % 86400) / 3600);
  const minutes = Math.floor((remainingSeconds % 3600) / 60);
  const seconds = remainingSeconds % 60;
  if (days > 0) return { state: 'countdown', label: days + ' д ' + hours + ' ч' };
  if (hours > 0) return { state: 'countdown', label: hours + ' ч ' + minutes + ' мин ' + seconds + ' сек' };
  if (minutes > 0) return { state: 'countdown', label: seconds > 0 ? minutes + ' мин ' + seconds + ' сек' : minutes + ' мин' };
  return { state: 'countdown', label: seconds + ' сек' };
