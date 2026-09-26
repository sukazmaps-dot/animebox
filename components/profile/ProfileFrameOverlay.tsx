'use client';

import { SeasonFrameOverlay } from '@/components/leaderboard/SeasonFramePreview';
import { isSeasonFrameKey } from '@/lib/leaderboard-rewards';
import { isLevelFrameKey, type LevelFrameKey } from '@/lib/progression';

import styles from './ProfileFrameOverlay.module.css';

const STATIC_LEVEL_FRAME_ASSETS: Record<LevelFrameKey, string> = {
  'level-viewer': '/brand/frames/level/static/viewer.svg',
  'level-explorer': '/brand/frames/level/static/explorer.svg',
  'level-marathoner': '/brand/frames/level/static/marathoner.svg',
  'level-collector': '/brand/frames/level/static/collector.svg',
  'level-veteran': '/brand/frames/level/static/veteran.svg',
  'level-legend': '/brand/frames/level/static/legend.svg',
  'level-master': '/brand/frames/level/static/master.svg',
};

const PREMIUM_LEVEL_FRAME_ASSETS: Record<LevelFrameKey, string> = {
  'level-viewer': '/brand/frames/level/premium/viewer-animated.svg',
  'level-explorer': '/brand/frames/level/premium/explorer-animated.svg',
  'level-marathoner': '/brand/frames/level/premium/marathoner-animated.svg',
  'level-collector': '/brand/frames/level/premium/collector-animated.svg',
  'level-veteran': '/brand/frames/level/premium/veteran-animated.svg',
  'level-legend': '/brand/frames/level/premium/legend-animated.svg',
  'level-master': '/brand/frames/level/premium/master-animated.svg',
};

export function levelFrameAsset(frameKey: LevelFrameKey, premium = false) {
  return premium
    ? PREMIUM_LEVEL_FRAME_ASSETS[frameKey]
    : STATIC_LEVEL_FRAME_ASSETS[frameKey];
}

export default function ProfileFrameOverlay({
  frameKey,
  premium = false,
  className = '',
}: {
  frameKey?: string | null;
  premium?: boolean;
  className?: string;
}) {
  if (!frameKey) return null;

  if (isSeasonFrameKey(frameKey)) {
    return <SeasonFrameOverlay frameKey={frameKey} className={className} />;
  }

  if (!isLevelFrameKey(frameKey)) return null;

  const asset = levelFrameAsset(frameKey, premium);

  return (
    <span
      className={`${styles.levelFrame} ${className}`.trim()}
      data-level-frame={frameKey}
      data-premium={premium ? 'true' : 'false'}
      aria-hidden="true"
    >
      {/* Native SVG assets: static for free users, animated for Premium. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        className={styles.levelFrameAsset}
        src={asset}
        alt=""
        decoding="async"
        draggable={false}
      />
    </span>
  );
}
