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
  title: string | null;
  slug: string | null;
  posterUrl: string | null;
  genres: string[];
  studios: string[];
  format: string | null;
  startYear: number | null;
  totalEpisodes: number | null;
  finished: boolean | null;
  catalogMetadataVersion: number;
  matchedText: string | null;
  matchKind: string | null;
};

export type LocalAnimeSuggestion = LocalAnimeSearchHit & {
  title: string;
};

function finitePositiveInteger(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

function optionalYear(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 1940 && parsed <= 2200
    ? parsed
    : null;
}

function optionalBoolean(value: unknown): boolean | null {
  return typeof value === 'boolean' ? value : null;
}

function rowStrings(value: unknown, limit = 12): string[] {
  return Array.isArray(value)
    ? value
        .filter((item): item is string => typeof item === 'string')
        .map((item) => item.trim())
        .filter(Boolean)
        .slice(0, limit)
    : [];
}

export function localAnimeSearchHitHasRichCardMetadata(
  hit: LocalAnimeSearchHit,
) {
  return Boolean(
    hit.catalogMetadataVersion >= 1 ||
      hit.format ||
      hit.startYear ||
      hit.totalEpisodes ||
      hit.studios.length > 0,
  );
}

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
    studios: hit.studios,
    format: hit.format,
    kind: hit.format,
    episodes: hit.totalEpisodes,
    status: hit.finished === true ? 'FINISHED' : null,
    startDate: hit.startYear
      ? {
          year: hit.startYear,
          month: null,
          day: null,
        }
      : null,
    coverImage: poster
      ? {
          extraLarge: poster,
          large: poster,
          medium: poster,
        }
      : null,
    catalogEligible: true,
    localSearchMetadataVersion: hit.catalogMetadataVersion,
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

function animeStudioNames(anime: Anime) {
  const values: unknown[] = Array.isArray(anime.studios)
    ? anime.studios
    : anime.studios &&
        typeof anime.studios === 'object' &&
        Array.isArray((anime.studios as { nodes?: unknown[] }).nodes)
      ? (anime.studios as { nodes: unknown[] }).nodes
      : [];

  return uniqueStrings(
    values.map((value) => {
      if (typeof value === 'string') return value;

      if (value && typeof value === 'object') {
        const row = value as {
          name?: unknown;
          node?: { name?: unknown };
        };

        if (typeof row.name === 'string') return row.name;
        if (typeof row.node?.name === 'string') return row.node.name;
      }

      return null;
    }),
  ).slice(0, 12);
}

function animeFinished(anime: Anime): boolean | null {
  const normalized = String(anime.status ?? '')
    .normalize('NFKC')
    .toLocaleLowerCase('ru-RU')
    .replace(/ё/g, 'е')
    .trim();

  if (
    [
      'finished',
      'finished_airing',
      'released',
      'вышло',
      'завершено',
    ].includes(normalized)
  ) {
    return true;
  }

  if (
    [
      'releasing',
      'ongoing',
      'airing',
      'not_yet_released',
      'upcoming',
      'онгоинг',
      'анонс',
    ].includes(normalized)
  ) {
    return false;
  }

  return null;
}

function mapSearchRow(
  row: Record<string, unknown>,
): LocalAnimeSearchHit | null {
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
    genres: rowStrings(row.genres, 8),
    studios: rowStrings(row.studios, 12),
    format:
      typeof row.format === 'string' && row.format.trim()
        ? row.format.trim()
        : null,
    startYear: optionalYear(row.start_year),
    totalEpisodes: finitePositiveInteger(row.total_episodes),
    finished: optionalBoolean(row.finished),
    catalogMetadataVersion: Math.max(
      0,
      Math.trunc(Number(row.catalog_metadata_version ?? 0)) || 0,
    ),
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

function missingRpc(errorMessage: string) {
  return /schema cache|does not exist|could not find the function/i.test(
    errorMessage,
  );
}

async function rowsFromRpc(
  rpcName:
    | 'search_anime_hybrid_lexical_v3'
    | 'search_anime_hybrid_lexical_v2'
    | 'search_anime_lexical',
  query: string,
  matchCount: number,
) {
  const result = await createSupabaseAdmin().rpc(rpcName, {
    query_text: query,
    match_count: matchCount,
  });

  return {
    error: result.error,
    rows: ((result.data ?? []) as Array<Record<string, unknown>>)
      .map((row) => mapSearchRow(row))
      .filter((row): row is LocalAnimeSearchHit => Boolean(row)),
  };
}

async function runLexicalSearch(
  query: string,
  matchCount: number,
): Promise<LocalAnimeSearchHit[]> {
  const v3 = await rowsFromRpc(
    'search_anime_hybrid_lexical_v3',
    query,
    matchCount,
  );

  if (!v3.error) return v3.rows;

  if (!missingRpc(v3.error.message)) {
    console.warn(
      '[Search index] lexical v3 RPC failed:',
      v3.error.message,
    );
    return [];
  }

  // Staged rollout: application code may reach production a few minutes before
  // the SQL migration. Keep v2.1 fully functional during that window.
  const v2 = await rowsFromRpc(
    'search_anime_hybrid_lexical_v2',
    query,
    matchCount,
  );

  if (!v2.error) return v2.rows;

  if (!missingRpc(v2.error.message)) {
    console.warn(
      '[Search index] lexical v2 RPC failed:',
      v2.error.message,
    );
    return [];
  }

  const legacy = await rowsFromRpc(
    'search_anime_lexical',
    query,
    matchCount,
  );

  if (legacy.error) {
    console.warn(
      '[Search index] legacy lexical RPC failed:',
      legacy.error.message,
    );
    return [];
  }

  return legacy.rows;
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
        ? anime.tags.filter(
            (tag): tag is string => typeof tag === 'string',
          )
        : [],
    );
    const studios = animeStudioNames(anime);
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
    const startYear = optionalYear(anime.startDate?.year);
    const totalEpisodes = finitePositiveInteger(anime.episodes);

    return {
      anime_id: anime.id,
      slug: anime.slug?.trim() || null,
      title,
      aliases,
      description,
      genres,
      tags,
      studios,
      format:
        typeof anime.format === 'string' && anime.format.trim()
          ? anime.format.trim().slice(0, 32)
          : typeof anime.kind === 'string' && anime.kind.trim()
            ? anime.kind.trim().slice(0, 32)
            : null,
      start_year: startYear,
      total_episodes: totalEpisodes,
      finished: animeFinished(anime),
      poster_url:
        anime.coverImage?.extraLarge ||
        anime.coverImage?.large ||
        anime.coverImage?.medium ||
        anime.image?.large ||
        anime.image?.medium ||
        null,
      search_text: normalizeSearchText(
        [
          title,
          ...aliases,
          ...genres,
          ...tags,
          ...studios,
          description ?? '',
        ].join(' '),
      ).slice(0, 12_000),
      updated_at: new Date().toISOString(),
    };
  });

  let write = await admin
    .from('anime_search_documents')
    .upsert(payload, { onConflict: 'anime_id' });

  if (
    write.error &&
    /studios|format|start_year|total_episodes|finished|schema cache/i.test(
      write.error.message,
    )
  ) {
    // Safe pre-migration fallback. Search enrichment is best-effort and must
    // not stop just because the rich-card columns are still propagating.
    const legacyPayload = payload.map(
      ({
        studios: _studios,
        format: _format,
        start_year: _startYear,
        total_episodes: _totalEpisodes,
        finished: _finished,
        ...legacy
      }) => legacy,
    );

    write = await admin
      .from('anime_search_documents')
      .upsert(legacyPayload, { onConflict: 'anime_id' });
  }

  if (write.error) {
    console.warn('[Search index] upsert failed:', write.error.message);
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
    .filter(
      (hit): hit is LocalAnimeSearchHit & { title: string } =>
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
    .sort(
      (a, b) => b.score - a.score || a.animeId - b.animeId,
    )
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
  const scoreById = new Map(
    hits.map((hit) => [hit.animeId, hit.score]),
  );

  return anime
    .map((item, index) => ({
      item,
      index,
      score: scoreById.get(item.id) ?? 0,
    }))
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map(({ item }) => item);
}
