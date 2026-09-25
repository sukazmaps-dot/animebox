export type WatchProgress = {
  animeId: number;
  episode: number;
  currentTime: number;
  duration: number;
  updatedAt: number;
  /**
   * Local crash-resume scope. Old records without this field are treated as
   * guest progress for backwards compatibility.
   */
  viewerKey?: string;
};

const STORAGE_KEY = 'anime-tracker-watch-progress';
const MAX_PROGRESS_ITEMS = 80;
const MAX_PROGRESS_AGE_MS = 120 * 24 * 60 * 60 * 1000;
const GUEST_VIEWER_KEY = 'guest';

function finiteNonNegative(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function viewerKey(viewerId?: string | null) {
  const normalized = typeof viewerId === 'string' ? viewerId.trim() : '';
  return normalized ? `user:${normalized}` : GUEST_VIEWER_KEY;
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
    viewerKey:
      typeof record.viewerKey === 'string' && record.viewerKey.trim()
        ? record.viewerKey
        : GUEST_VIEWER_KEY,
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

export function resumeStartThresholdSeconds(durationSeconds: number) {
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) return 10;
  return Math.min(10, Math.max(3, durationSeconds * 0.04));
}

export function resumeEndGuardSeconds(durationSeconds: number) {
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) return 20;
  return Math.min(20, Math.max(6, durationSeconds * 0.04));
}

export function isUsableResumePosition(
  currentTime: number,
  duration: number,
) {
  if (!Number.isFinite(currentTime) || currentTime < 0) return false;

  const minimum = resumeStartThresholdSeconds(duration);
  if (currentTime < minimum) return false;

  if (!Number.isFinite(duration) || duration <= 0) return true;
  return duration - currentTime > resumeEndGuardSeconds(duration);
}

export function getLatestWatchProgress(
  animeId: number,
  viewerId?: string | null,
): WatchProgress | null {
  const key = viewerKey(viewerId);
  return (
    readProgress().find(
      (item) => item.animeId === animeId && (item.viewerKey ?? GUEST_VIEWER_KEY) === key,
    ) ?? null
  );
}

export function hasResumePosition(progress: WatchProgress | null): progress is WatchProgress {
  return Boolean(
    progress &&
      isUsableResumePosition(progress.currentTime, progress.duration),
  );
}

export function getWatchProgress(
  animeId: number,
  episode: number,
  viewerId?: string | null,
): WatchProgress | null {
  const key = viewerKey(viewerId);
  const progress = readProgress();

  return (
    progress.find(
      (item) =>
        item.animeId === animeId &&
        item.episode === episode &&
        (item.viewerKey ?? GUEST_VIEWER_KEY) === key,
    ) || null
  );
}

export function saveWatchProgress(
  animeId: number,
  episode: number,
  currentTime: number,
  duration: number,
  viewerId?: string | null,
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
  const key = viewerKey(viewerId);

  const item: WatchProgress = {
    animeId: Math.floor(animeId),
    episode: Math.floor(episode),
    currentTime,
    duration: Number.isFinite(duration) && duration > 0 ? duration : 0,
    updatedAt: Date.now(),
    viewerKey: key,
  };

  const next = [
    item,
    ...progress.filter(
      (saved) =>
        !(
          saved.animeId === item.animeId &&
          saved.episode === item.episode &&
          (saved.viewerKey ?? GUEST_VIEWER_KEY) === key
        ),
    ),
  ];

  writeProgress(next);
}

export function removeWatchProgress(
  animeId: number,
  episode: number,
  viewerId?: string | null,
) {
  const progress = readProgress();
  const key = viewerKey(viewerId);

  const next = progress.filter(
    (item) =>
      !(
        item.animeId === animeId &&
        item.episode === episode &&
        (item.viewerKey ?? GUEST_VIEWER_KEY) === key
      ),
  );

  writeProgress(next);
}
