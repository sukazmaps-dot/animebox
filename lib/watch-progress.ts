export type WatchProgress = {
  animeId: number;
  episode: number;
  currentTime: number;
  duration: number;
  updatedAt: number;
};

const STORAGE_KEY = 'anime-tracker-watch-progress';

function readProgress(): WatchProgress[] {
  if (typeof window === 'undefined') {
    return [];
  }

  try {
    const raw = localStorage.getItem(STORAGE_KEY);

    if (!raw) {
      return [];
    }

    const parsed = JSON.parse(raw);

    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed;
  } catch {
    return [];
  }
}

function writeProgress(progress: WatchProgress[]) {
  if (typeof window === 'undefined') {
    return;
  }

  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify(progress)
  );
}

export function getWatchProgress(
  animeId: number,
  episode: number
): WatchProgress | null {
  const progress = readProgress();

  return (
    progress.find(
      (item) =>
        item.animeId === animeId &&
        item.episode === episode
    ) || null
  );
}

export function saveWatchProgress(
  animeId: number,
  episode: number,
  currentTime: number,
  duration: number
) {
  const progress = readProgress();

  const item: WatchProgress = {
    animeId,
    episode,
    currentTime,
    duration,
    updatedAt: Date.now(),
  };

  const existingIndex = progress.findIndex(
    (saved) =>
      saved.animeId === animeId &&
      saved.episode === episode
  );

  if (existingIndex === -1) {
    progress.push(item);
  } else {
    progress[existingIndex] = item;
  }

  writeProgress(progress);
}

export function removeWatchProgress(
  animeId: number,
  episode: number
) {
  const progress = readProgress();

  const next = progress.filter(
    (item) =>
      !(
        item.animeId === animeId &&
        item.episode === episode
      )
  );

  writeProgress(next);
}