'use client';

import { SeasonFrameOverlay } from '@/components/leaderboard/SeasonFramePreview';
import { isSeasonFrameKey } from '@/lib/leaderboard-rewards';
import { isLevelFrameKey, type LevelFrameKey } from '@/lib/progression';

import styles from './ProfileFrameOverlay.module.css';

const STATIC_LEVEL_FRAME_ASSETS: Record<LevelFrameKey, string> = {
  'milestone-lv10-forbidden-relic': '/brand/frames/milestone/free/lv10-forbidden-relic.svg',
  'milestone-lv25-flame-arc': '/brand/frames/milestone/free/lv25-flame-arc.svg',
  'milestone-lv50-crimson-sigil': '/brand/frames/milestone/free/lv50-crimson-sigil.svg',
  'milestone-lv75-menacing-manga': '/brand/frames/milestone/free/lv75-menacing-manga.svg',
  'milestone-lv100-absolute-prestige': '/brand/frames/milestone/free/lv100-absolute-prestige.svg',
};

const PREMIUM_LEVEL_FRAME_ASSETS: Record<LevelFrameKey, string> = {
  'milestone-lv10-forbidden-relic': '/brand/frames/milestone/premium/lv10-forbidden-relic-premium.svg',
  'milestone-lv25-flame-arc': '/brand/frames/milestone/premium/lv25-flame-arc-premium.svg',
  'milestone-lv50-crimson-sigil': '/brand/frames/milestone/premium/lv50-crimson-sigil-premium.svg',
  'milestone-lv75-menacing-manga': '/brand/frames/milestone/premium/lv75-menacing-manga-premium.svg',
  'milestone-lv100-absolute-prestige': '/brand/frames/milestone/premium/lv100-absolute-prestige-premium.svg',
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
      {/* Original AnimeBox milestone SVG v3.1: free static / Premium animated. */}
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
