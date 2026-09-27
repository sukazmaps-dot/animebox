import { createSupabaseAdmin } from '@/lib/supabase/admin';
import { SITE_URL } from '@/lib/seo-config';
import {
  copyrightEpisodeKey,
  getCopyrightRestrictedEpisodeKeys,
} from '@/lib/copyright-seo-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const RECENT_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_ANIME = 2_500;
const MAX_EPISODES = 7_500;

function xml(value: string) {
  return value
    .replace(/[\\u0000-\\u0008\\u000B\\u000C\\u000E-\\u001F\\u007F]/g, '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

function validDate(value: unknown): string | null {
  if (typeof value !== 'string' || !value) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null;
}

function imageTag(value: unknown) {
  if (typeof value !== 'string' || !value.trim()) return '';

  try {
    const url = new URL(value);
    if (url.protocol !== 'https:') return '';
    return '<image:image><image:loc>' + xml(url.toString()) + '</image:loc></image:image>';
  } catch {
    return '';
  }
}

async function loadRecentAnime(cutoff: string) {
  const { data, error } = await createSupabaseAdmin()
    .from('seo_anime_index')
    .select('anime_id,slug,image_url,last_content_change_at')
    .eq('indexable', true)
    .gte('last_content_change_at', cutoff)
    .order('last_content_change_at', { ascending: false })
    .limit(MAX_ANIME);

  if (error) throw error;
  return data ?? [];
}

async function loadRecentEpisodes(cutoff: string) {
  const admin = createSupabaseAdmin();

  const primary = await admin
    .from('seo_episode_index')
    .select(
      'anime_id,episode_number,slug,thumbnail_url,first_available_at,last_content_change_at',
    )
    .eq('indexable', true)
    .gte('last_content_change_at', cutoff)
    .order('last_content_change_at', { ascending: false })
    .limit(MAX_EPISODES);

  if (!primary.error) {
    return (primary.data ?? []).map((row) => ({
      ...row,
      content_changed_at: row.last_content_change_at,
    }));
  }

  const fallback = await admin
    .from('seo_episode_index')
    .select(
      'anime_id,episode_number,slug,thumbnail_url,first_available_at',
    )
    .eq('indexable', true)
    .gte('first_available_at', cutoff)
    .order('first_available_at', { ascending: false })
    .limit(MAX_EPISODES);

  if (fallback.error) throw fallback.error;

  return (fallback.data ?? []).map((row) => ({
    ...row,
    content_changed_at: row.first_available_at,
  }));
}

export async function GET() {
  try {
    const cutoff = new Date(Date.now() - RECENT_WINDOW_MS).toISOString();
    const [animeRows, episodeRows] = await Promise.all([
      loadRecentAnime(cutoff),
      loadRecentEpisodes(cutoff),
    ]);

    const restrictedKeys = await getCopyrightRestrictedEpisodeKeys(
      episodeRows.flatMap((row) => {
        const animeId = Number(row.anime_id);
        const episode = Number(row.episode_number);

        return Number.isSafeInteger(animeId) &&
          animeId > 0 &&
          Number.isSafeInteger(episode) &&
          episode > 0
          ? [{ animeId, episode }]
          : [];
      }),
    );

    const entries: string[] = [];
    const seen = new Set<string>();

    for (const row of animeRows) {
      const slug = typeof row.slug === 'string' ? row.slug.trim() : '';
      const lastmod = validDate(row.last_content_change_at);
      if (!slug || !lastmod) continue;

      const url = SITE_URL + '/anime/' + encodeURIComponent(slug);
      if (seen.has(url)) continue;
      seen.add(url);

      entries.push(
        '<url><loc>' + xml(url) + '</loc><lastmod>' + lastmod + '</lastmod>' +
          imageTag(row.image_url) + '</url>',
      );
    }

    for (const row of episodeRows) {
      const animeId = Number(row.anime_id);
      const episode = Number(row.episode_number);
      const slug = typeof row.slug === 'string' ? row.slug.trim() : '';
      const lastmod = validDate(row.content_changed_at);

      if (
        !Number.isSafeInteger(animeId) ||
        animeId <= 0 ||
        !Number.isSafeInteger(episode) ||
        episode <= 0 ||
        !slug ||
        !lastmod ||
        restrictedKeys.has(copyrightEpisodeKey(animeId, episode))
      ) {
        continue;
      }

      const url =
        SITE_URL + '/anime/' + encodeURIComponent(slug) + '/episode/' + episode;
      if (seen.has(url)) continue;
      seen.add(url);

      entries.push(
        '<url><loc>' + xml(url) + '</loc><lastmod>' + lastmod + '</lastmod>' +
          imageTag(row.thumbnail_url) + '</url>',
      );
    }

    const body =
      '<?xml version="1.0" encoding="UTF-8"?>\n' +
      '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" ' +
      'xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">\n' +
      entries.join('\n') +
      '\n</urlset>';

    return new Response(body, {
      headers: {
        'Content-Type': 'application/xml; charset=utf-8',
        'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=1800',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (error) {
    console.error('[recent-sitemap] generation failed:', error);

    return new Response(
      '<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"></urlset>',
      {
        status: 503,
        headers: {
          'Content-Type': 'application/xml; charset=utf-8',
          'Cache-Control': 'no-store',
        },
      },
    );
  }
}
