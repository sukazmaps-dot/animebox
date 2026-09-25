import 'server-only';

import { adminClient } from '@/lib/community-server';

type RestrictionRow = {
  anime_id: number | string;
  scope: 'title' | 'season' | 'episode' | 'provider';
  episode: number | null;
};

export type CopyrightEpisodeRef = {
  animeId: number;
  episode: number;
};

const BATCH_SIZE = 150;

function positiveInteger(value: unknown) {
  const number = Number(value);
  return Number.isSafeInteger(number) && number > 0 ? number : null;
}

function key(animeId: number, episode: number) {
  return `${animeId}:${episode}`;
}

/**
 * Provider-only restrictions are intentionally ignored: another provider may
 * still be allowed to serve the same episode.
 *
 * The SEO index has no season dimension, so a season-wide restriction is
 * treated conservatively as suppressing all episode SEO for that AnimeBox id.
 */
export async function getCopyrightRestrictedEpisodeKeys(
  entries: CopyrightEpisodeRef[],
): Promise<Set<string>> {
  const normalized = entries
    .map((entry) => ({
      animeId: positiveInteger(entry.animeId),
      episode: positiveInteger(entry.episode),
    }))
    .filter(
      (entry): entry is { animeId: number; episode: number } =>
        entry.animeId != null && entry.episode != null,
    );

  if (!normalized.length) return new Set();

  const animeIds = [...new Set(normalized.map((entry) => entry.animeId))];
  const restrictions: RestrictionRow[] = [];

  try {
    const admin = adminClient();

    for (let offset = 0; offset < animeIds.length; offset += BATCH_SIZE) {
      const chunk = animeIds.slice(offset, offset + BATCH_SIZE);
      const { data, error } = await admin
        .from('copyright_restrictions')
        .select('anime_id,scope,episode')
        .in('anime_id', chunk)
        .eq('active', true)
        .in('scope', ['title', 'season', 'episode']);

      if (error) {
        const message = error.message || '';
        if (/copyright_restrictions|schema cache|relation/i.test(message)) {
          return new Set();
        }
        throw error;
      }

      restrictions.push(...((data ?? []) as RestrictionRow[]));
    }
  } catch (error) {
    console.error('[Copyright SEO] restriction lookup failed', error);
    return new Set();
  }

  const byAnime = new Map<number, RestrictionRow[]>();

  for (const row of restrictions) {
    const animeId = positiveInteger(row.anime_id);
    if (animeId == null) continue;
    const rows = byAnime.get(animeId) ?? [];
    rows.push(row);
    byAnime.set(animeId, rows);
  }

  const blocked = new Set<string>();

  for (const entry of normalized) {
    const rows = byAnime.get(entry.animeId) ?? [];
    const restricted = rows.some((row) => {
      if (row.scope === 'title' || row.scope === 'season') return true;
      return row.scope === 'episode' && row.episode === entry.episode;
    });

    if (restricted) blocked.add(key(entry.animeId, entry.episode));
  }

  return blocked;
}

export function copyrightEpisodeKey(animeId: number, episode: number) {
  return key(animeId, episode);
}
