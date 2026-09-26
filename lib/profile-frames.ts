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
