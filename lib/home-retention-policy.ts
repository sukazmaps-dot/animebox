/** Home presentation policy; never grants completion or XP. */
export const HOME_LOCAL_RESUME_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
export const HOME_LOCAL_RESUME_FUTURE_SKEW_MS = 60_000;

export function isFreshHomeResume(updatedAt: number, nowMs: number) {
  return Number.isFinite(updatedAt) && updatedAt > 0 &&
    updatedAt <= nowMs + HOME_LOCAL_RESUME_FUTURE_SKEW_MS &&
    nowMs - updatedAt <= HOME_LOCAL_RESUME_MAX_AGE_MS;
}

export function preferLocalHomeResume(input: {
  localUpdatedAt: number;
  localEpisode: number;
  serverUpdatedAt: number;
  serverEpisode: number | null;
  serverMode: 'resume' | 'next' | null;
  nowMs: number;
}) {
  if (!isFreshHomeResume(input.localUpdatedAt, input.nowMs)) return false;
  // An old local position must not resurrect the completed episode.
  if (input.serverMode === 'next' && input.serverEpisode != null &&
      input.localEpisode < input.serverEpisode) return false;
  return input.localUpdatedAt > Math.max(0, input.serverUpdatedAt) + 2_000;
}

export function selectPersonalHomeSchedule<T extends {
  id: number | string; airingAt: number; episode: number | null; timingKind?: 'weekly' | 'planned'; media: { id: number | null };
}>(items: T[], personalIds: Set<number>, nowSeconds: number) {
  const seen = new Set<string>();
  const valid = items.filter((item) => {
    const key = `${item.media.id}:${item.episode}`;
    if (item.media.id==null || item.timingKind || !personalIds.has(item.media.id) || !Number.isFinite(item.airingAt) ||
        item.episode == null || !Number.isInteger(item.episode) || item.episode < 1 ||
        item.airingAt < nowSeconds - 6 * 3600 ||
        item.airingAt > nowSeconds + 72 * 3600 || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  return valid.sort((a, b) => {
    const aReleased = a.airingAt <= nowSeconds;
    const bReleased = b.airingAt <= nowSeconds;
    if (aReleased !== bReleased) return aReleased ? -1 : 1;
    return (aReleased ? b.airingAt - a.airingAt : a.airingAt - b.airingAt) || (a.media.id??0) - (b.media.id??0);
  }).slice(0, 4);
}
