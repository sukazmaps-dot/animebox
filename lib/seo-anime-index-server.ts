import 'server-only';

import { createHash } from 'node:crypto';

import {
  animeSeoQualityScore,
  getAnimeSeoIdentity,
} from '@/lib/anime-seo';
import { stableAnimeSlug } from '@/lib/anime-url';
import { ANIME_SITEMAP_SHARDS } from '@/lib/seo-config';
import type { SeoAnimeSourceEntry } from '@/lib/seo-anilist';
import { createSupabaseAdmin } from '@/lib/supabase/admin';
import type { Anime } from '@/types/anime';

const WRITE_CHUNK = 160;
const STALE_TITLE_MS = 14 * 24 * 60 * 60 * 1_000;
const STALE_EPISODE_MS = 7 * 24 * 60 * 60 * 1_000;

export type SeoAnimeIndexEntry = {
  animeId: number;
  slug: string;
  title: string;
  imageUrl: string | null;
  status: string | null;
  lastContentChangeAt: string;
};

export type SeoIndexHealth = {
  available: boolean;
  animeIndexable: number;
  animeNoindex: number;
  animeStale: number;
  episodeIndexable: number;
  episodeStale: number;
  videoEntries: number;
  lastAnimeVerifiedAt: string | null;
};

type ExistingSeoRow = {
  anime_id: number | string;
  content_fingerprint: string;
  last_content_change_at: string;
  source_shard: number | null;
};

function positiveInteger(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

function primaryImage(anime: Anime): string | null {
  return (
    anime.bannerImage ||
    anime.coverImage?.extraLarge ||
    anime.coverImage?.large ||
    anime.coverImage?.medium ||
    null
  );
}

function canonicalTitle(anime: Anime) {
  return (
    anime.title?.romaji ||
    anime.title?.english ||
    anime.title?.russian ||
    anime.title?.native ||
    anime.name ||
    `Anime ${anime.id}`
  );
}

function fingerprintAnime(anime: Anime, slug: string) {
  const payload = {
    id: anime.id,
    slug,
    title: anime.title ?? {},
    name: anime.name ?? null,
    russian: anime.russian ?? null,
    description: anime.description ?? null,
    episodes: anime.episodes ?? null,
    status: anime.status ?? null,
    format: anime.format ?? anime.kind ?? null,
    genres: [...(anime.genres ?? [])].sort((a, b) => a.localeCompare(b)),
    startYear: anime.startDate?.year ?? null,
    image: primaryImage(anime),
    catalogEligible: anime.catalogEligible !== false,
  };

  return createHash('sha256')
    .update(JSON.stringify(payload))
    .digest('hex');
}

function sourceEntryToAnime(entry: SeoAnimeSourceEntry): Anime {
  return {
    id: entry.id,
    slug: entry.slug,
    title: entry.title,
    description: entry.description,
    episodes: entry.episodes,
    status: entry.status,
    format: entry.format,
    genres: entry.genres,
    startDate: entry.startDate,
    coverImage: {
      large: entry.image,
      extraLarge: entry.image,
    },
    bannerImage: entry.image,
    catalogEligible: true,
  };
}

async function syncAnimeChunk(
  anime: Anime[],
  sourceShard: number | null,
) {
  const ids = anime
    .map((item) => positiveInteger(item.id))
    .filter((value): value is number => value != null);

  if (!ids.length) {
    return { checked: 0, changed: 0, indexable: 0 };
  }

  const admin = createSupabaseAdmin();
  const { data: existingData, error: existingError } = await admin
    .from('seo_anime_index')
    .select(
      'anime_id,content_fingerprint,last_content_change_at,source_shard',
    )
    .in('anime_id', ids);

  if (existingError) throw existingError;

  const existing = new Map<number, ExistingSeoRow>();
  for (const row of (existingData ?? []) as ExistingSeoRow[]) {
    const animeId = positiveInteger(row.anime_id);
    if (animeId) existing.set(animeId, row);
  }

  const now = new Date().toISOString();
  let changed = 0;
  let indexable = 0;

  const rows = anime.flatMap((item) => {
    const animeId = positiveInteger(item.id);
    if (!animeId) return [];

    const title = canonicalTitle(item);
    const slug =
      item.slug?.trim() || stableAnimeSlug(animeId, title);
    const fingerprint = fingerprintAnime(item, slug);
    const current = existing.get(animeId);
    const didChange =
      !current || current.content_fingerprint !== fingerprint;
    const qualityScore = animeSeoQualityScore(item);
    const canIndex = qualityScore >= 2;

    if (didChange) changed += 1;
    if (canIndex) indexable += 1;

    return [{
      anime_id: animeId,
      slug,
      title: getAnimeSeoIdentity(item).pageHeading,
      image_url: primaryImage(item),
      status: item.status ?? null,
      source_shard:
        sourceShard == null
          ? current?.source_shard ?? -1
          : sourceShard,
      sitemap_shard: animeId % ANIME_SITEMAP_SHARDS,
      quality_score: qualityScore,
      indexable: canIndex,
      content_fingerprint: fingerprint,
      last_content_change_at:
        didChange
          ? now
          : current?.last_content_change_at ?? now,
      last_verified_at: now,
      updated_at: now,
    }];
  });

  if (rows.length) {
    const { error } = await admin
      .from('seo_anime_index')
      .upsert(rows, { onConflict: 'anime_id' });

    if (error) throw error;
  }

  return {
    checked: rows.length,
    changed,
    indexable,
  };
}

export async function syncSeoAnimeSourceEntries(
  entries: SeoAnimeSourceEntry[],
  sourceShard: number,
) {
  if (
    !Number.isInteger(sourceShard) ||
    sourceShard < 0 ||
    sourceShard >= ANIME_SITEMAP_SHARDS
  ) {
    throw new Error('Invalid SEO source shard');
  }

  let checked = 0;
  let changed = 0;
  let indexable = 0;

  for (let offset = 0; offset < entries.length; offset += WRITE_CHUNK) {
    const batch = entries
      .slice(offset, offset + WRITE_CHUNK)
      .map(sourceEntryToAnime);
    const result = await syncAnimeChunk(batch, sourceShard);
    checked += result.checked;
    changed += result.changed;
    indexable += result.indexable;
  }

  return {
    sourceShard,
    checked,
    changed,
    indexable,
  };
}

export async function syncSeoAnimeFromResolvedAnime(anime: Anime) {
  return syncAnimeChunk([anime], null);
}

export async function getSeoAnimeIndexShard(
  shard: number,
): Promise<SeoAnimeIndexEntry[]> {
  if (
    !Number.isInteger(shard) ||
    shard < 0 ||
    shard >= ANIME_SITEMAP_SHARDS
  ) {
    return [];
  }

  const { data, error } = await createSupabaseAdmin()
    .from('seo_anime_index')
    .select(
      'anime_id,slug,title,image_url,status,last_content_change_at',
    )
    .eq('indexable', true)
    .eq('sitemap_shard', shard)
    .order('anime_id', { ascending: true })
    .limit(50_000);

  if (error) throw error;

  return (data ?? []).flatMap((row) => {
    const animeId = positiveInteger(row.anime_id);
    const slug =
      typeof row.slug === 'string' ? row.slug.trim() : '';
    const title =
      typeof row.title === 'string' ? row.title.trim() : '';
    const lastContentChangeAt =
      typeof row.last_content_change_at === 'string'
        ? row.last_content_change_at
        : '';

    if (!animeId || !slug || !title || !lastContentChangeAt) {
      return [];
    }

    return [{
      animeId,
      slug,
      title,
      imageUrl:
        typeof row.image_url === 'string' && row.image_url.trim()
          ? row.image_url
          : null,
      status:
        typeof row.status === 'string' && row.status.trim()
          ? row.status
          : null,
      lastContentChangeAt,
    }];
  });
}

function countOf(result: { count?: number | null; error?: unknown }) {
  return result.error ? 0 : Math.max(0, Number(result.count ?? 0));
}

export async function getSeoIndexHealth(): Promise<SeoIndexHealth> {
  const admin = createSupabaseAdmin();
  const now = Date.now();
  const staleTitleBefore = new Date(now - STALE_TITLE_MS).toISOString();
  const staleEpisodeBefore = new Date(now - STALE_EPISODE_MS).toISOString();

  try {
    const [
      animeIndexable,
      animeNoindex,
      animeStale,
      episodeIndexable,
      episodeStale,
      videoEntries,
      lastVerified,
    ] = await Promise.all([
      admin
        .from('seo_anime_index')
        .select('anime_id', { count: 'exact', head: true })
        .eq('indexable', true),
      admin
        .from('seo_anime_index')
        .select('anime_id', { count: 'exact', head: true })
        .eq('indexable', false),
      admin
        .from('seo_anime_index')
        .select('anime_id', { count: 'exact', head: true })
        .eq('indexable', true)
        .lt('last_verified_at', staleTitleBefore),
      admin
        .from('seo_episode_index')
        .select('anime_id', { count: 'exact', head: true })
        .eq('indexable', true),
      admin
        .from('seo_episode_index')
        .select('anime_id', { count: 'exact', head: true })
        .eq('indexable', true)
        .lt('last_confirmed_at', staleEpisodeBefore),
      admin
        .from('seo_video_episode_index')
        .select('anime_id', { count: 'exact', head: true }),
      admin
        .from('seo_anime_index')
        .select('last_verified_at')
        .order('last_verified_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

    const required = [
      animeIndexable,
      animeNoindex,
      animeStale,
      episodeIndexable,
      episodeStale,
      videoEntries,
    ];

    if (required.some((item) => item.error)) {
      return {
        available: false,
        animeIndexable: 0,
        animeNoindex: 0,
        animeStale: 0,
        episodeIndexable: 0,
        episodeStale: 0,
        videoEntries: 0,
        lastAnimeVerifiedAt: null,
      };
    }

    return {
      available: true,
      animeIndexable: countOf(animeIndexable),
      animeNoindex: countOf(animeNoindex),
      animeStale: countOf(animeStale),
      episodeIndexable: countOf(episodeIndexable),
      episodeStale: countOf(episodeStale),
      videoEntries: countOf(videoEntries),
      lastAnimeVerifiedAt:
        !lastVerified.error &&
        typeof lastVerified.data?.last_verified_at === 'string'
          ? lastVerified.data.last_verified_at
          : null,
    };
  } catch {
    return {
      available: false,
      animeIndexable: 0,
      animeNoindex: 0,
      animeStale: 0,
      episodeIndexable: 0,
      episodeStale: 0,
      videoEntries: 0,
      lastAnimeVerifiedAt: null,
    };
  }
}
