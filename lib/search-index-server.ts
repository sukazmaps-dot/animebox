import 'server-only';

import { createSupabaseAdmin } from '@/lib/supabase/admin';
import { getAnimesByIdsWithShikimori } from '@/lib/combined-anime';
import {
  buildSearchQueryVariants,
  normalizeSearchText,
} from '@/lib/smart-search';
import type { Anime } from '@/types/anime';
import {createPublicResultCache} from '@/lib/public-result-cache';

export type LocalAnimeSearchHit = {
  animeId: number;
  score: number;
  title: string | null;
  slug: string | null;
  posterUrl: string | null;
  genres: string[];
  matchedText: string | null;
  matchKind: string | null;
};

export type LocalAnimeSuggestion = LocalAnimeSearchHit & {
  title: string;
};

export function localAnimeSearchHitToAnime(
  hit: LocalAnimeSearchHit,
): Anime {
  const title = hit.title?.trim() || `Anime ${hit.animeId}`;
  const poster = hit.posterUrl?.trim() || null;

  return {
    id: hit.animeId,
    slug: hit.slug?.trim() || undefined,
    name: title,
    russian: title,
    title: {
      russian: title,
      romaji: title,
      english: null,
      native: null,
    },
    genres: hit.genres,
    coverImage: poster
      ? {
          extraLarge: poster,
          large: poster,
          medium: poster,
        }
      : null,
    catalogEligible: true,
  };
}

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

function mapSearchRow(row: Record<string, unknown>): LocalAnimeSearchHit | null {
  const animeId = Number(row.anime_id);
  if (!Number.isSafeInteger(animeId) || animeId <= 0) return null;

  return {
    animeId,
    score: Number(row.similarity_score ?? 0),
    title:
      typeof row.title === 'string' && row.title.trim()
        ? row.title.trim()
        : null,
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
          .filter((value): value is string => typeof value === 'string')
          .slice(0, 6)
      : [],
    matchedText:
      typeof row.matched_text === 'string' && row.matched_text.trim()
        ? row.matched_text.trim()
        : null,
    matchKind:
      typeof row.match_kind === 'string' && row.match_kind.trim()
        ? row.match_kind.trim()
        : null,
  };
}

const cachedLexicalSearch = createPublicResultCache<LocalAnimeSearchHit[]>({
  ttlMs: 30_000, maxEntries: 128, cacheWhen: rows => rows.length > 0,
});

async function runLexicalSearch(query: string, matchCount: number) {
  // Nearby preview/main limits share a pool, then each caller slices its page.
  const poolSize = Math.min(40, Math.ceil(matchCount / 10) * 10);
  return cachedLexicalSearch(JSON.stringify([query, poolSize]), () => loadLexicalSearch(query, poolSize));
}

async function loadLexicalSearch(
  query: string,
  matchCount: number,
): Promise<LocalAnimeSearchHit[]> {
  const admin = createSupabaseAdmin();

  const args = {
    query_text: query,
    match_count: matchCount,
  };
  let v2 = await admin.rpc('search_anime_hybrid_lexical_v4', args);
  if (v2.error && /schema cache|does not exist|could not find the function/i.test(v2.error.message)) {
    v2 = await admin.rpc('search_anime_hybrid_lexical_v2', args);
  }

  if (!v2.error) {
    const rows = (v2.data ?? []) as Array<Record<string, unknown>>;
    return rows
      .map((row) => mapSearchRow(row))
      .filter((row): row is LocalAnimeSearchHit => Boolean(row));
  }

  if (!/schema cache|does not exist|could not find the function/i.test(v2.error.message)) {
    console.warn('[Search index] lexical RPC failed:', v2.error.message);
    return [];
  }

  // Safe rollout fallback while the application and DB migration propagate.
  const legacy = await admin.rpc('search_anime_lexical', {
    query_text: query,
    match_count: matchCount,
  });

  if (legacy.error) {
    console.warn('[Search index] legacy lexical RPC failed:', legacy.error.message);
    return [];
  }

  const rows = (legacy.data ?? []) as Array<Record<string, unknown>>;
  return rows
    .map((row) => mapSearchRow(row))
    .filter((row): row is LocalAnimeSearchHit => Boolean(row));
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
  const hits = await searchLocalAnimeIndex(
    query,
    Math.min(20, Math.max(6, limit * 2)),
  );

  return hits
    .filter((hit): hit is LocalAnimeSearchHit & { title: string } =>
      Boolean(hit.title),
    )
    .slice(0, limit)
    .map((hit) => ({ ...hit, title: hit.title }));
}

export async function searchLocalAnimeIndex(
  query: string,
  limit = 12,
): Promise<LocalAnimeSearchHit[]> {
  const normalized = normalizeSearchText(query);
  if (normalized.length < 2) return [];

  const variants = buildSearchQueryVariants(query).slice(0, 3);
  if (!variants.length) return [];

  const matchCount = Math.min(40, Math.max(8, limit * 2));
  const merged = new Map<number, LocalAnimeSearchHit>();

  const mergeRows = (rows: LocalAnimeSearchHit[]) => {
    for (const row of rows) {
      const previous = merged.get(row.animeId);
      if (previous && previous.score >= row.score) continue;
      merged.set(row.animeId, row);
    }
  };

  // Healthy exact/prefix searches should pay for one Supabase RPC only.
  // Keyboard-layout/transliteration variants are fallback work and are run
  // concurrently only when the primary query is too sparse or uncertain.
  const primary = await runLexicalSearch(variants[0]!, matchCount);
  mergeRows(primary);

  const strongPrimary =
    primary.length >= Math.min(limit, 6) &&
    Number(primary[0]?.score ?? 0) >= 0.56;

  if (!strongPrimary && variants.length > 1) {
    const fallbackBatches = await Promise.all(
      variants
        .slice(1)
        .map((variant) => runLexicalSearch(variant, matchCount)),
    );

    for (const rows of fallbackBatches) {
      mergeRows(rows);
    }
  }

  return [...merged.values()]
    .sort((a, b) => b.score - a.score || a.animeId - b.animeId)
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
