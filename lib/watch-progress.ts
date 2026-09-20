export type WatchProgress = {
  animeId: number;
  episode: number;
  currentTime: number;
  duration: number;
  updatedAt: number;
};

const STORAGE_KEY = 'anime-tracker-watch-progress';
const MAX_PROGRESS_ITEMS = 80;
const MAX_PROGRESS_AGE_MS = 120 * 24 * 60 * 60 * 1000;

function finiteNonNegative(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function normalizeProgress(value: unknown): WatchProgress | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;

  const record = value as Record<string, unknown>;
  const animeId = finiteNonNegative(record.animeId);
  const episode = finiteNonNegative(record.episode);
  const currentTime = finiteNonNegative(record.currentTime);
  const duration = finiteNonNegative(record.duration);
  const updatedAt = finiteNonNegative(record.updatedAt);

  if (
    animeId == null ||
    animeId <= 0 ||
    episode == null ||
    episode < 1 ||
    currentTime == null ||
    duration == null ||
    updatedAt == null
  ) {
    return null;
  }

  return {
    animeId: Math.floor(animeId),
    episode: Math.floor(episode),
    currentTime,
    duration,
    updatedAt,
  };
}

function readProgress(): WatchProgress[] {
  if (typeof window === 'undefined') {
    return [];
  }

  try {
    const raw = localStorage.getItem(STORAGE_KEY);

    if (!raw) {
      return [];
    }

    const parsed: unknown = JSON.parse(raw);

    if (!Array.isArray(parsed)) {
      return [];
    }

    const cutoff = Date.now() - MAX_PROGRESS_AGE_MS;

    return parsed
      .map(normalizeProgress)
      .filter((item): item is WatchProgress => item !== null && item.updatedAt >= cutoff)
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, MAX_PROGRESS_ITEMS);
  } catch {
    return [];
  }
}

function writeProgress(progress: WatchProgress[]) {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(
        progress
          .sort((a, b) => b.updatedAt - a.updatedAt)
          .slice(0, MAX_PROGRESS_ITEMS),
      ),
    );
  } catch {
    // localStorage may be unavailable in private/restricted WebViews.
  }
}

export function getWatchProgress(
  animeId: number,
  episode: number,
): WatchProgress | null {
  const progress = readProgress();

  return (
    progress.find(
      (item) =>
        item.animeId === animeId &&
        item.episode === episode,
    ) || null
  );
}

export function saveWatchProgress(
  animeId: number,
  episode: number,
  currentTime: number,
  duration: number,
) {
  if (
    !Number.isFinite(animeId) ||
    animeId <= 0 ||
    !Number.isFinite(episode) ||
    episode < 1 ||
    !Number.isFinite(currentTime) ||
    currentTime < 0
  ) {
    return;
  }

  const progress = readProgress();

  const item: WatchProgress = {
    animeId: Math.floor(animeId),
    episode: Math.floor(episode),
    currentTime,
    duration: Number.isFinite(duration) && duration > 0 ? duration : 0,
    updatedAt: Date.now(),
  };

  const next = [
    item,
    ...progress.filter(
      (saved) =>
        !(
          saved.animeId === item.animeId &&
          saved.episode === item.episode
        ),
    ),
  ];

  writeProgress(next);
}

export function removeWatchProgress(
  animeId: number,
  episode: number,
) {
  const progress = readProgress();

  const next = progress.filter(
    (item) =>
      !(
        item.animeId === animeId &&
        item.episode === episode
      ),
  );

  writeProgress(next);
}
