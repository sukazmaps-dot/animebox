import 'server-only';

import { adminClient, ensureAnime } from '@/lib/community-server';
import { canonicalEpisodePlayerUrl } from '@/lib/episode-timeline-server';
import {
  copyrightEpisodeKey,
  getCopyrightRestrictedEpisodeKeys,
} from '@/lib/copyright-seo-server';
import type { Anime } from '@/types/anime';
import type { EpisodeAvailabilityResponse } from '@/types/episode-availability';

export type SeoEpisodeIndexEntry = {
  animeId: number;
  episode: number;
  slug: string;
  firstAvailableAt: string;
  lastConfirmedAt: string;
  thumbnailUrl: string | null;
  provider: string;
};

const CHUNK_SIZE = 200;
const SEO_CONFIRM_TTL_MS = 6 * 60 * 60 * 1000;
const PLAYER_VERIFY_TTL_MS = 24 * 60 * 60 * 1000;

function isOlderThan(value: unknown, nowMs: number, ttlMs: number) {
  if (typeof value !== 'string' || !value) return true;
  const parsed = Date.parse(value);
  return !Number.isFinite(parsed) || nowMs - parsed >= ttlMs;
}

function thumbnailFor(anime: Anime) {
  return (
    anime.bannerImage ||
    anime.coverImage?.extraLarge ||
    anime.coverImage?.large ||
    anime.coverImage?.medium ||
    null
  );
}

function providerFor(availability: EpisodeAvailabilityResponse) {
  const names = availability.providers
    .filter((provider) => provider.status === 'available' && provider.episodes.length > 0)
    .map((provider) => provider.name);

  return names.length ? names.join('+') : 'confirmed';
}

function uniqueEpisodes(values: number[]) {
  return [...new Set(values)]
    .filter((value) => Number.isSafeInteger(value) && value > 0 && value <= 10_000)
    .sort((a, b) => a - b);
}

export async function syncSeoEpisodeIndex(
  anime: Anime,
  availability: EpisodeAvailabilityResponse,
): Promise<void> {
  if (availability.status !== 'available') return;

  const candidateEpisodes = uniqueEpisodes(availability.episodes);
  if (!candidateEpisodes.length) return;

  const restrictedKeys = await getCopyrightRestrictedEpisodeKeys(
    candidateEpisodes.map((episode) => ({
      animeId: anime.id,
      episode,
    })),
  );
  const episodes = candidateEpisodes.filter(
    (episode) => !restrictedKeys.has(copyrightEpisodeKey(anime.id, episode)),
  );
  if (!episodes.length) return;

  const slug = typeof anime.slug === 'string' ? anime.slug.trim() : '';
  if (!slug) return;

  const admin = adminClient();
  const nowMs = Date.now();
  const now = new Date(nowMs).toISOString();

  const kodikPlayerBase =
    availability.providers.find(
      (provider) =>
        provider.name === 'kodik' &&
        provider.status === 'available' &&
        typeof provider.playerUrl === 'string' &&
        provider.playerUrl.trim(),
    )?.playerUrl ?? null;
  if (kodikPlayerBase) {
    // Keep the timeline table's FK target present before we opportunistically
    // seed stable player URLs for Google video discovery.
    await ensureAnime(anime.id);
  }

  const thumbnailUrl = thumbnailFor(anime);
  const provider = providerFor(availability);

  for (let offset = 0; offset < episodes.length; offset += CHUNK_SIZE) {
    const chunk = episodes.slice(offset, offset + CHUNK_SIZE);

    const { data: existing, error: existingError } = await admin
      .from('seo_episode_index')
      .select(
        'episode_number,first_available_at,last_confirmed_at,slug,thumbnail_url,provider,indexable',
      )
      .eq('anime_id', anime.id)
      .in('episode_number', chunk);

    if (existingError) throw existingError;

    const existingByEpisode = new Map<
      number,
      {
        first_available_at?: string | null;
        last_confirmed_at?: string | null;
        slug?: string | null;
        thumbnail_url?: string | null;
        provider?: string | null;
        indexable?: boolean | null;
      }
    >();

    for (const row of existing ?? []) {
      const episode = Number(row.episode_number);
      if (!Number.isSafeInteger(episode)) continue;
      existingByEpisode.set(episode, row);
    }

    const rows = chunk.flatMap((episode) => {
      const current = existingByEpisode.get(episode);
      const metadataChanged =
        !current ||
        current.slug !== slug ||
        (current.thumbnail_url ?? null) !== thumbnailUrl ||
        current.provider !== provider ||
        current.indexable !== true;
      const confirmationStale =
        !current ||
        isOlderThan(current.last_confirmed_at, nowMs, SEO_CONFIRM_TTL_MS);

      if (!metadataChanged && !confirmationStale) return [];

      return [{
        anime_id: anime.id,
        episode_number: episode,
        slug,
        first_available_at:
          typeof current?.first_available_at === 'string' && current.first_available_at
            ? current.first_available_at
            : now,
        last_confirmed_at: now,
        thumbnail_url: thumbnailUrl,
        provider,
        indexable: true,
      }];
    });

    if (rows.length) {
      const { error } = await admin
        .from('seo_episode_index')
        .upsert(rows, { onConflict: 'anime_id,episode_number' });

      if (error) throw error;
    }

    if (kodikPlayerBase) {
      const { data: existingTimeline, error: timelineReadError } = await admin
        .from('episode_timeline_meta')
        .select('episode_number,video_player_url,video_verified_at')
        .eq('anime_id', anime.id)
        .in('episode_number', chunk);

      if (timelineReadError) {
        console.warn('[episode-seo] player URL read failed:', timelineReadError);
      } else {
        const timelineByEpisode = new Map(
          (existingTimeline ?? []).map((row) => [Number(row.episode_number), row] as const),
        );

        const timelineRows = chunk.flatMap((episode) => {
          const playerUrl = canonicalEpisodePlayerUrl(kodikPlayerBase, episode);
          if (!playerUrl) return [];

          const current = timelineByEpisode.get(episode);
          const urlChanged = current?.video_player_url !== playerUrl;
          const verificationStale =
            !current ||
            isOlderThan(
              current.video_verified_at,
              nowMs,
              PLAYER_VERIFY_TTL_MS,
            );

          if (!urlChanged && !verificationStale) return [];

          return [{
            anime_id: anime.id,
            episode_number: episode,
            video_player_url: playerUrl,
            video_verified_at: now,
            updated_at: now,
          }];
        });

        if (timelineRows.length) {
          const { error: timelineError } = await admin
            .from('episode_timeline_meta')
            .upsert(timelineRows, { onConflict: 'anime_id,episode_number' });

          if (timelineError) {
            console.warn('[episode-seo] player URL seed failed:', timelineError);
          }
        }
      }
    }
  }
}

export async function getSeoEpisodeIndexEntry(
  animeId: number,
  episode: number,
): Promise<SeoEpisodeIndexEntry | null> {
  if (
    !Number.isSafeInteger(animeId) ||
    animeId <= 0 ||
    !Number.isSafeInteger(episode) ||
    episode <= 0
  ) {
    return null;
  }

  const { data, error } = await adminClient()
    .from('seo_episode_index')
    .select(
      'anime_id,episode_number,slug,first_available_at,last_confirmed_at,thumbnail_url,provider',
    )
    .eq('anime_id', animeId)
    .eq('episode_number', episode)
    .eq('indexable', true)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  return {
    animeId: Number(data.anime_id),
    episode: Number(data.episode_number),
    slug: String(data.slug),
    firstAvailableAt: String(data.first_available_at),
    lastConfirmedAt: String(data.last_confirmed_at),
    thumbnailUrl:
      typeof data.thumbnail_url === 'string' ? data.thumbnail_url : null,
    provider: typeof data.provider === 'string' ? data.provider : 'confirmed',
  };
}
