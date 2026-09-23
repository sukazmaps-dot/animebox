import 'server-only';

import { adminClient, ensureAnime } from '@/lib/community-server';
import { canonicalEpisodePlayerUrl } from '@/lib/episode-timeline-server';
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

  const episodes = uniqueEpisodes(availability.episodes);
  if (!episodes.length) return;

  const slug = typeof anime.slug === 'string' ? anime.slug.trim() : '';
  if (!slug) return;

  const admin = adminClient();
  const now = new Date().toISOString();

  // Keep the timeline table's FK target present before we opportunistically
  // seed stable player URLs for Google video discovery.
  await ensureAnime(anime.id);

  const kodikPlayerBase =
    availability.providers.find(
      (provider) =>
        provider.name === 'kodik' &&
        provider.status === 'available' &&
        typeof provider.playerUrl === 'string' &&
        provider.playerUrl.trim(),
    )?.playerUrl ?? null;
  const thumbnailUrl = thumbnailFor(anime);
  const provider = providerFor(availability);

  for (let offset = 0; offset < episodes.length; offset += CHUNK_SIZE) {
    const chunk = episodes.slice(offset, offset + CHUNK_SIZE);

    const { data: existing, error: existingError } = await admin
      .from('seo_episode_index')
      .select('episode_number,first_available_at')
      .eq('anime_id', anime.id)
      .in('episode_number', chunk);

    if (existingError) throw existingError;

    const firstAvailable = new Map<number, string>();
    for (const row of existing ?? []) {
      const episode = Number(row.episode_number);
      if (!Number.isSafeInteger(episode)) continue;
      if (typeof row.first_available_at === 'string' && row.first_available_at) {
        firstAvailable.set(episode, row.first_available_at);
      }
    }

    const rows = chunk.map((episode) => ({
      anime_id: anime.id,
      episode_number: episode,
      slug,
      first_available_at: firstAvailable.get(episode) ?? now,
      last_confirmed_at: now,
      thumbnail_url: thumbnailUrl,
      provider,
      indexable: true,
    }));

    const { error } = await admin
      .from('seo_episode_index')
      .upsert(rows, { onConflict: 'anime_id,episode_number' });

    if (error) throw error;

    if (kodikPlayerBase) {
      const timelineRows = chunk.flatMap((episode) => {
        const playerUrl = canonicalEpisodePlayerUrl(kodikPlayerBase, episode);
        return playerUrl
          ? [{
              anime_id: anime.id,
              episode_number: episode,
              video_player_url: playerUrl,
              video_verified_at: now,
              updated_at: now,
            }]
          : [];
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
