import 'server-only';

import { adminClient } from '@/lib/community-server';
import {
  DEFAULT_PROFILE_WIDGET_LAYOUT,
  PROFILE_WIDGET_KEYS,
  type ProfileActivityItem,
  type ProfileFavoriteAnimeItem,
  type ProfileGenreItem,
  type ProfileRatingItem,
  type ProfileWatchingItem,
  type ProfileWidgetKey,
  type ProfileWidgetLayoutItem,
  type ProfileWidgetsData,
} from '@/types/profile-widgets';

type WidgetRow = {
  key?: unknown;
  position?: unknown;
  visible?: unknown;
};

function normalizeLayout(rows: WidgetRow[] | null | undefined): ProfileWidgetLayoutItem[] {
  const byKey = new Map<ProfileWidgetKey, ProfileWidgetLayoutItem>();

  for (const row of rows ?? []) {
    const key = String(row.key || '') as ProfileWidgetKey;
    if (!PROFILE_WIDGET_KEYS.includes(key)) continue;

    const position = Number(row.position);
    byKey.set(key, {
      key,
      position: Number.isFinite(position) ? Math.max(0, Math.trunc(position)) : 99,
      visible: row.visible !== false,
    });
  }

  for (const fallback of DEFAULT_PROFILE_WIDGET_LAYOUT) {
    if (!byKey.has(fallback.key)) {
      byKey.set(fallback.key, { ...fallback });
    }
  }

  return [...byKey.values()].sort((a, b) => a.position - b.position);
}

function objectValue(value: unknown) {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function arrayValue<T>(value: unknown) {
  return Array.isArray(value) ? value as T[] : [];
}

export async function getProfileWidgetsData(userId: string): Promise<ProfileWidgetsData> {
  const { data, error } = await adminClient().rpc(
    'profile_identity_bundle',
    { p_user_id: userId },
  );

  if (error) throw error;

  const bundle = objectValue(data);
  const ratingSummary = objectValue(bundle.ratingSummary);
  const count = Number(ratingSummary.count);
  const average =
    ratingSummary.average == null
      ? null
      : Number(ratingSummary.average);

  return {
    layout: normalizeLayout(arrayValue<WidgetRow>(bundle.layout)),
    favorites: arrayValue<ProfileFavoriteAnimeItem>(bundle.favorites),
    watching: arrayValue<ProfileWatchingItem>(bundle.watching),
    ratings: arrayValue<ProfileRatingItem>(bundle.ratings),
    genres: arrayValue<ProfileGenreItem>(bundle.genres),
    activity: arrayValue<ProfileActivityItem>(bundle.activity),
    ratingSummary: {
      count: Number.isFinite(count) ? Math.max(0, Math.trunc(count)) : 0,
      average: average != null && Number.isFinite(average) ? average : null,
    },
  };
}
