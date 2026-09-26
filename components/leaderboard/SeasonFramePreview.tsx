'use client';

import type { SeasonFrameKey } from '@/lib/leaderboard-rewards';

import styles from './SeasonFramePreview.module.css';

const FRAME_ASSET_BY_KEY: Record<SeasonFrameKey, string> = {
  'league-champion': '/brand/frames/league/league-champion-animated.svg',
  'league-elite': '/brand/frames/league/league-elite.svg',
  'league-podium': '/brand/frames/league/league-podium.svg',
  'league-top10': '/brand/frames/league/league-top10.svg',
};

function normalizeFrameKey(
  frameKey?: string | null,
  place?: number | null,
): SeasonFrameKey {
  if (frameKey && frameKey in FRAME_ASSET_BY_KEY) {
    return frameKey as SeasonFrameKey;
  }

  return place === 1
    ? 'league-champion'
    : place === 2
      ? 'league-elite'
      : place === 3
        ? 'league-podium'
        : 'league-top10';
}

function frameAsset(frameKey?: string | null) {
  if (!frameKey || !(frameKey in FRAME_ASSET_BY_KEY)) return null;
  return FRAME_ASSET_BY_KEY[frameKey as SeasonFrameKey];
}

export function SeasonFrameOverlay({
  frameKey,
  className = '',
}: {
  frameKey?: string | null;
  className?: string;
}) {
  const asset = frameAsset(frameKey);
  if (!asset) return null;

  return (
    <span
      className={`${styles.overlayOnly} ${className}`.trim()}
      data-season-frame={frameKey}
      aria-hidden="true"
    >
      {/* League cosmetics are intentionally served as native SVG assets.
          Champion contains its own reduced-motion-aware manga-energy animation. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        className={styles.frameAsset}
        src={asset}
        alt=""
        decoding="async"
        draggable={false}
      />
    </span>
  );
}

export default function SeasonFramePreview({
  frameKey,
  place,
  src = '/default-avatar.webp',
  alt = '',
  compact = false,
}: {
  frameKey?: string | null;
  place?: number | null;
  src?: string;
  alt?: string;
  compact?: boolean;
}) {
  const key = normalizeFrameKey(frameKey, place);

  return (
    <span
      className={`${styles.root} ${compact ? styles.compact : ''}`}
      data-season-frame={key}
    >
      <span className={styles.avatarClip}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt={alt} />
      </span>
      <SeasonFrameOverlay frameKey={key} />
    </span>
  );
}
