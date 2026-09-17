const ACHIEVEMENT_ICON_BY_CODE: Record<string, string> = {
  first_comment: '/brand/achievements/comments.svg',
  shonen_10: '/brand/achievements/anime-collector.svg',
  episodes_100: '/brand/achievements/marathon.svg',
  first_episode: '/brand/achievements/first-episode.svg',
  first_completed: '/brand/achievements/first-completed.svg',
  anime_collector: '/brand/achievements/anime-collector.svg',
  episodes_stack: '/brand/achievements/episodes-stack.svg',
  comments: '/brand/achievements/comments.svg',
  marathon: '/brand/achievements/marathon.svg',
};

export function achievementIcon(code: string, fallback?: string | null) {
  const normalized = code.trim().toLowerCase();
  const exact = ACHIEVEMENT_ICON_BY_CODE[normalized];
  if (exact) return exact;

  if (normalized.includes('comment')) return '/brand/achievements/comments.svg';
  if (normalized.includes('completed')) return '/brand/achievements/first-completed.svg';
  if (normalized.includes('collector') || normalized.includes('shonen')) {
    return '/brand/achievements/anime-collector.svg';
  }
  if (normalized.includes('marathon')) return '/brand/achievements/marathon.svg';
  if (normalized.includes('episode')) {
    return normalized.includes('first')
      ? '/brand/achievements/first-episode.svg'
      : '/brand/achievements/episodes-stack.svg';
  }

  return fallback || '/brand/achievements/episodes-stack.svg';
}
