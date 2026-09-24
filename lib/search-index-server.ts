import 'server-only';

import { createSupabaseAdmin } from '@/lib/supabase/admin';
import { getAnimesByIdsWithShikimori } from '@/lib/combined-anime';
import {
  buildSearchQueryVariants,
  normalizeSearchText,
} from '@/lib/smart-search';
import type { Anime } from '@/types/anime';

export type LocalAnimeSearchHit = {
  animeId: number;
  score: number;
};

export type LocalAnimeSuggestion = LocalAnimeSearchHit & {
  title: string;
  slug: string | null;
  posterUrl: string | null;
  genres: string[];
};

function uniqueStrings(values: Array<string | null | undefined>) {
  const result: string[] = [];
  const seen = new Set<string>();

  for (const value of values) {
    const clean = value?.trim();
    if (!clean) continue;
    const key = normalizeSearchText(clean);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    result.push(clean);
  }

  return result;
}

export async function indexAnimeSearchDocuments(items: Anime[]) {
  if (!items.length) return;

  const admin = createSupabaseAdmin();
  const payload = items.slice(0, 50).map((anime) => {
    const aliases = uniqueStrings([
      anime.title?.russian,
      anime.russian,
      anime.title?.english,
      anime.title?.romaji,
      anime.title?.native,
      anime.name,
      ...(anime.synonyms ?? []),
    ]);
    const genres = uniqueStrings(anime.genres ?? []);
    const tags = uniqueStrings(
      Array.isArray(anime.tags)
        ? anime.tags.filter((tag): tag is string => typeof tag === 'string')
        : [],
    );
    const title =
      anime.title?.russian?.trim() ||
      anime.russian?.trim() ||
      anime.title?.english?.trim() ||
      anime.title?.romaji?.trim() ||
      anime.name?.trim() ||
      `Anime ${anime.id}`;
    const description =
      typeof anime.description === 'string'
        ? anime.description.replace(/\s+/g, ' ').trim().slice(0, 4000)
        : null;

    return {
      anime_id: anime.id,
      slug: anime.slug?.trim() || null,
      title,
      aliases,
      description,
      genres,
      tags,
      poster_url:
        anime.coverImage?.extraLarge ||
        anime.coverImage?.large ||
        anime.coverImage?.medium ||
        anime.image?.large ||
        anime.image?.medium ||
        null,
      search_text: normalizeSearchText(
        [title, ...aliases, ...genres, ...tags, description ?? ''].join(' '),
      ).slice(0, 12_000),
      updated_at: new Date().toISOString(),
    };
  });

  const { error } = await admin
    .from('anime_search_documents')
    .upsert(payload, { onConflict: 'anime_id' });

  if (error) {
    console.warn('[Search index] upsert failed:', error.message);
  }
}

export async function searchLocalAnimeSuggestions(
  query: string,
  limit = 6,
): Promise<LocalAnimeSuggestion[]> {
  const normalized = normalizeSearchText(query);
  if (normalized.length < 2) return [];

  const admin = createSupabaseAdmin();
  const merged = new Map<number, LocalAnimeSuggestion>();

  for (const variant of buildSearchQueryVariants(query).slice(0, 3)) {
    const { data, error } = await admin.rpc('search_anime_lexical', {
      query_text: variant,
      match_count: Math.min(20, Math.max(6, limit * 2)),
    });

    if (error) {
      console.warn('[Search index] suggestion RPC failed:', error.message);
      break;
    }

    for (const row of data ?? []) {
      const animeId = Number(row.anime_id);
      const score = Number(row.similarity_score ?? 0);
      if (!Number.isSafeInteger(animeId) || animeId <= 0) continue;

      const previous = merged.get(animeId);
      if (previous && previous.score >= score) continue;

      merged.set(animeId, {
        animeId,
        score,
        title: String(row.title ?? `Anime ${animeId}`),
        slug:
          typeof row.slug === 'string' && row.slug.trim()
            ? row.slug.trim()
            : null,
        posterUrl:
          typeof row.poster_url === 'string' && row.poster_url.trim()
            ? row.poster_url.trim()
            : null,
        genres: Array.isArray(row.genres)
          ? row.genres
              .filter((value: unknown): value is string => typeof value === 'string')
              .slice(0, 3)
          : [],
      });
    }
  }

  return [...merged.values()]
    .sort((a, b) => b.score - a.score || a.animeId - b.animeId)
    .slice(0, limit);
}

export async function searchLocalAnimeIndex(
  query: string,
  limit = 12,
): Promise<LocalAnimeSearchHit[]> {
  const normalized = normalizeSearchText(query);
  if (normalized.length < 2) return [];

  const admin = createSupabaseAdmin();
  const merged = new Map<number, number>();

  for (const variant of buildSearchQueryVariants(query).slice(0, 3)) {
    const { data, error } = await admin.rpc('search_anime_lexical', {
      query_text: variant,
      match_count: Math.min(30, Math.max(6, limit * 2)),
    });

    if (error) {
      console.warn('[Search index] lexical RPC failed:', error.message);
      break;
    }

    for (const row of data ?? []) {
      const animeId = Number(row.anime_id);
      const score = Number(row.similarity_score ?? 0);
      if (!Number.isSafeInteger(animeId) || animeId <= 0) continue;
      merged.set(animeId, Math.max(merged.get(animeId) ?? 0, score));
    }
  }

  return [...merged.entries()]
    .map(([animeId, score]) => ({ animeId, score }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

export async function hydrateLocalAnimeHits(
  hits: LocalAnimeSearchHit[],
  signal?: AbortSignal,
) {
  if (!hits.length) return [] as Anime[];

  const anime = await getAnimesByIdsWithShikimori(
    hits.map((hit) => hit.animeId),
    { signal },
  );
  const scoreById = new Map(hits.map((hit) => [hit.animeId, hit.score]));

  return anime
    .map((item, index) => ({
      item,
      index,
      score: scoreById.get(item.id) ?? 0,
    }))
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map(({ item }) => item);
}
