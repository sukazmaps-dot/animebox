import { SITE_URL } from '@/lib/seo-config';

const RECENT_CONFIRMATION_MS = 7 * 24 * 60 * 60 * 1000;

function validDateMs(value?: string | null): number | null {
  if (!value) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function safeSeoHttpsUrl(value?: string | null): string | null {
  if (!value) return null;

  try {
    const url = new URL(value);
    return url.protocol === 'https:' ? url.toString() : null;
  } catch {
    return null;
  }
}

export function isCanonicalAnimeBoxUrl(value?: string | null): boolean {
  if (!value) return false;

  try {
    const candidate = new URL(value);
    const site = new URL(SITE_URL);

    return (
      candidate.protocol === 'https:' &&
      candidate.origin === site.origin &&
      !candidate.search &&
      !candidate.hash
    );
  } catch {
    return false;
  }
}

export type EpisodeSeoQualityInput = {
  confirmed: boolean;
  canonicalUrl: string;
  title: string;
  thumbnailUrl?: string | null;
  lastConfirmedAt?: string | null;
  contentUrl?: string | null;
  embedUrl?: string | null;
};

export function episodeSeoQualityScore(
  input: EpisodeSeoQualityInput,
): number {
  if (!input.confirmed) return 0;

  let score = 2;

  if (isCanonicalAnimeBoxUrl(input.canonicalUrl)) score += 2;
  if (input.title.trim().length >= 2) score += 1;
  if (safeSeoHttpsUrl(input.thumbnailUrl)) score += 1;

  const confirmedAt = validDateMs(input.lastConfirmedAt);
  if (
    confirmedAt != null &&
    Date.now() - confirmedAt <= RECENT_CONFIRMATION_MS
  ) {
    score += 1;
  }

  if (
    safeSeoHttpsUrl(input.contentUrl) ||
    safeSeoHttpsUrl(input.embedUrl)
  ) {
    score += 1;
  }

  return score;
}

export function isEpisodeSeoQualityReady(
  input: EpisodeSeoQualityInput,
): boolean {
  return episodeSeoQualityScore(input) >= 5;
}

export type VideoSeoQualityInput = {
  thumbnailUrl?: string | null;
  uploadDate?: string | null;
  durationMs?: number | null;
  contentUrl?: string | null;
  embedUrl?: string | null;
};

export function videoSeoCompletenessScore(
  input: VideoSeoQualityInput,
): number {
  let score = 0;

  if (safeSeoHttpsUrl(input.thumbnailUrl)) score += 2;
  if (validDateMs(input.uploadDate) != null) score += 2;

  if (
    typeof input.durationMs === 'number' &&
    Number.isFinite(input.durationMs) &&
    input.durationMs >= 1_000 &&
    input.durationMs <= 28_800_000
  ) {
    score += 1;
  }

  if (safeSeoHttpsUrl(input.contentUrl)) score += 2;
  else if (safeSeoHttpsUrl(input.embedUrl)) score += 1;

  return score;
}

export function isVideoSeoQualityReady(
  input: VideoSeoQualityInput,
): boolean {
  return (
    videoSeoCompletenessScore(input) >= 5 &&
    Boolean(
      safeSeoHttpsUrl(input.contentUrl) ||
      safeSeoHttpsUrl(input.embedUrl),
    )
  );
}
