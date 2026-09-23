import { adminClient } from '@/lib/community-server';
import { SITE_URL } from '@/lib/seo-config';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const PAGE_SIZE = 1000;
const MAX_VIDEO_URLS = 50_000;

function xml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

function httpsUrl(value: unknown) {
  if (typeof value !== 'string' || !value.trim()) return null;

  try {
    const url = new URL(value);
    return url.protocol === 'https:' ? url.toString() : null;
  } catch {
    return null;
  }
}

function durationSeconds(value: unknown) {
  const ms = Number(value);
  if (!Number.isFinite(ms) || ms < 1_000 || ms > 28_800_000) return null;
  return Math.max(1, Math.round(ms / 1000));
}

type VideoRow = {
  anime_id: number | string;
  episode_number: number;
  slug: string;
  first_available_at: string | null;
  last_confirmed_at: string | null;
  thumbnail_url: string | null;
  anime_title: string | null;
  duration_ms: number | null;
  video_content_url: string | null;
  video_player_url: string | null;
};

async function loadRows() {
  const rows: VideoRow[] = [];
  const admin = adminClient();

  for (let from = 0; from < MAX_VIDEO_URLS; from += PAGE_SIZE) {
    const to = Math.min(MAX_VIDEO_URLS - 1, from + PAGE_SIZE - 1);

    const { data, error } = await admin
      .from('seo_video_episode_index')
      .select(
        'anime_id,episode_number,slug,first_available_at,last_confirmed_at,thumbnail_url,anime_title,duration_ms,video_content_url,video_player_url',
      )
      .order('last_confirmed_at', { ascending: false })
      .range(from, to);

    if (error) throw error;

    const page = (data ?? []) as VideoRow[];
    rows.push(...page);

    if (page.length < PAGE_SIZE) break;
  }

  return rows.slice(0, MAX_VIDEO_URLS);
}

export async function GET() {
  try {
    const rows = await loadRows();
    const entries: string[] = [];

    for (const row of rows) {
      const animeId = Number(row.anime_id);
      const episode = Number(row.episode_number);
      const slug = typeof row.slug === 'string' ? row.slug.trim() : '';
      const thumbnail = httpsUrl(row.thumbnail_url);
      const contentLoc = httpsUrl(row.video_content_url);
      const playerLoc = httpsUrl(row.video_player_url);

      if (
        !Number.isSafeInteger(animeId) ||
        animeId <= 0 ||
        !Number.isSafeInteger(episode) ||
        episode <= 0 ||
        !slug ||
        !thumbnail ||
        (!contentLoc && !playerLoc)
      ) {
        continue;
      }

      const title =
        typeof row.anime_title === 'string' && row.anime_title.trim()
          ? row.anime_title.trim()
          : `Аниме ${animeId}`;
      const watchUrl =
        `${SITE_URL}/anime/${encodeURIComponent(slug)}/episode/${episode}`;
      const publishedAt = row.first_available_at
        ? new Date(row.first_available_at)
        : null;
      const lastModified = row.last_confirmed_at
        ? new Date(row.last_confirmed_at)
        : null;
      const seconds = durationSeconds(row.duration_ms);

      entries.push(`
  <url>
    <loc>${xml(watchUrl)}</loc>
    <video:video>
      <video:thumbnail_loc>${xml(thumbnail)}</video:thumbnail_loc>
      <video:title>${xml(`${title} — ${episode} серия`)}</video:title>
      <video:description>${xml(
        `Смотреть ${episode} серию аниме «${title}» онлайн на AnimeBox.`,
      )}</video:description>
      ${
        contentLoc
          ? `<video:content_loc>${xml(contentLoc)}</video:content_loc>`
          : `<video:player_loc allow_embed="yes">${xml(playerLoc!)}</video:player_loc>`
      }
      ${seconds ? `<video:duration>${seconds}</video:duration>` : ''}
      ${
        publishedAt && Number.isFinite(publishedAt.getTime())
          ? `<video:publication_date>${publishedAt.toISOString()}</video:publication_date>`
          : ''
      }
      <video:live>no</video:live>
    </video:video>
    ${
      lastModified && Number.isFinite(lastModified.getTime())
        ? `<lastmod>${lastModified.toISOString()}</lastmod>`
        : ''
    }
  </url>`);
    }

    const body = `<?xml version="1.0" encoding="UTF-8"?>
<urlset
  xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
  xmlns:video="http://www.google.com/schemas/sitemap-video/1.1">
${entries.join('\n')}
</urlset>`;

    return new Response(body, {
      headers: {
        'Content-Type': 'application/xml; charset=utf-8',
        'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=3600',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (error) {
    console.error('[video-sitemap] generation failed:', error);

    return new Response(
      '<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:video="http://www.google.com/schemas/sitemap-video/1.1"></urlset>',
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
