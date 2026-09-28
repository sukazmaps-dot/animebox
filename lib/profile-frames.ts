import {
  isSeasonFrameKey,
  seasonFrameLabel,
  type SeasonFrameKey,
} from '@/lib/leaderboard-rewards';
import {
  isLevelFrameKey,
  levelFrameLabel,
  type LevelFrameKey,
} from '@/lib/progression';

export type ProfileFrameKey = SeasonFrameKey | LevelFrameKey;
export type ProfileFrameKind = 'league' | 'level';

export function isProfileFrameKey(value: unknown): value is ProfileFrameKey {
  return isSeasonFrameKey(value) || isLevelFrameKey(value);
}

export function profileFrameKind(key: ProfileFrameKey): ProfileFrameKind {
  return isSeasonFrameKey(key) ? 'league' : 'level';
}

export function profileFrameLabel(key: ProfileFrameKey) {
  return isSeasonFrameKey(key)
    ? seasonFrameLabel(key)
    : `Уровневая рамка «${levelFrameLabel(key)}»`;
}


const COMPACT_PROFILE_FRAME_ASSETS: Record<ProfileFrameKey, string> = {
  'league-champion': '/brand/frames/league/league-champion-static.svg',
  'league-elite': '/brand/frames/league/league-elite.svg',
  'league-podium': '/brand/frames/league/league-podium.svg',
  'league-top10': '/brand/frames/league/league-top10.svg',
  'milestone-lv10-forbidden-relic': '/brand/frames/milestone/free/lv10-forbidden-relic.svg',
  'milestone-lv25-flame-arc': '/brand/frames/milestone/free/lv25-flame-arc.svg',
  'milestone-lv50-crimson-sigil': '/brand/frames/milestone/free/lv50-crimson-sigil.svg',
  'milestone-lv75-menacing-manga': '/brand/frames/milestone/free/lv75-menacing-manga.svg',
  'milestone-lv100-absolute-prestige': '/brand/frames/milestone/free/lv100-absolute-prestige.svg',
};

/**
 * Static, lightweight frame asset for dense social surfaces such as comments.
 *
 * Do not use animated Premium assets here: comment lists can contain dozens of
 * avatars at once, so one static SVG per frame key keeps paint/composite work
 * bounded while preserving the user's selected identity.
 */
export function compactProfileFrameAsset(
  value: unknown,
): string | null {
  return isProfileFrameKey(value)
    ? COMPACT_PROFILE_FRAME_ASSETS[value]
    : null;
}
