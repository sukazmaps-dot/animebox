import 'server-only';

import { adminClient } from '@/lib/community-server';

export type CopyrightRestrictionScope =
  | 'title'
  | 'season'
  | 'episode'
  | 'provider';

export type PlaybackRestriction = {
  id: string;
  caseId: string;
  scope: CopyrightRestrictionScope;
  reason: string | null;
};

type RestrictionRow = {
  id: string;
  case_id: string;
  scope: CopyrightRestrictionScope;
  season: number | null;
  episode: number | null;
  provider: string | null;
  reason: string | null;
};

function normalizedProvider(value: string | null | undefined) {
  return value?.trim().toLocaleLowerCase('en-US') || '';
}

function copyrightSchemaMissing(message: string) {
  return /copyright_(cases|restrictions|case_urls|actions)|schema cache|relation/i.test(message);
}

export async function getPlaybackRestriction(input: {
  animeId: number;
  season?: number | null;
  episode?: number | null;
  provider?: string | null;
}): Promise<PlaybackRestriction | null> {
  if (!Number.isSafeInteger(input.animeId) || input.animeId <= 0) return null;

  try {
    const { data, error } = await adminClient()
      .from('copyright_restrictions')
      .select('id,case_id,scope,season,episode,provider,reason')
      .eq('anime_id', input.animeId)
      .eq('active', true)
      .limit(100);

    if (error) {
      if (copyrightSchemaMissing(error.message)) return null;
      throw error;
    }

    const season =
      Number.isSafeInteger(input.season) && Number(input.season) > 0
        ? Number(input.season)
        : null;
    const episode =
      Number.isSafeInteger(input.episode) && Number(input.episode) > 0
        ? Number(input.episode)
        : null;
    const provider = normalizedProvider(input.provider);

    const row = ((data ?? []) as RestrictionRow[]).find((item) => {
      if (item.scope === 'title') return true;
      if (item.scope === 'season') {
        return season != null && item.season === season;
      }
      if (item.scope === 'episode') {
        return episode != null && item.episode === episode;
      }
      if (item.scope === 'provider') {
        if (!provider || normalizedProvider(item.provider) !== provider) return false;
        if (item.season != null && item.season !== season) return false;
        if (item.episode != null && item.episode !== episode) return false;
        return true;
      }
      return false;
    });

    return row
      ? {
          id: row.id,
          caseId: row.case_id,
          scope: row.scope,
          reason: row.reason,
        }
      : null;
  } catch (error) {
    console.error('[Copyright] restriction lookup failed', error);
    return null;
  }
}

export const COPYRIGHT_RESTRICTED_MESSAGE =
  'Доступ к этому источнику ограничен по обращению правообладателя.';
