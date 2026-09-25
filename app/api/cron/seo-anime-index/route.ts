import { getSeoAnimeSourceShard } from '@/lib/seo-anilist';
import { syncSeoAnimeSourceEntries } from '@/lib/seo-anime-index-server';
import { ANIME_SITEMAP_SHARDS } from '@/lib/seo-config';
import { isCronAuthorized } from '@/lib/server-request-auth';
import { createSystemJobObserver } from '@/lib/system-observability-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const SOURCE_SHARDS_PER_RUN = 7;
const DAY_MS = 24 * 60 * 60 * 1_000;

function scheduledSourceShards(now = Date.now()) {
  const groups = Math.ceil(ANIME_SITEMAP_SHARDS / SOURCE_SHARDS_PER_RUN);
  const utcDay = Math.floor(now / DAY_MS);
  const group = utcDay % groups;
  const start = group * SOURCE_SHARDS_PER_RUN;

  return Array.from(
    {
      length: Math.min(
        SOURCE_SHARDS_PER_RUN,
        ANIME_SITEMAP_SHARDS - start,
      ),
    },
    (_, index) => start + index,
  );
}

function requestedShard(
  request: Request,
): number | null | 'invalid' {
  const value = new URL(request.url).searchParams.get('sourceShard');
  if (value == null || value === '') return null;

  const shard = Number(value);
  return Number.isInteger(shard) &&
    shard >= 0 &&
    shard < ANIME_SITEMAP_SHARDS
    ? shard
    : 'invalid';
}

async function run(request: Request) {
  if (!isCronAuthorized(request)) {
    return Response.json(
      { ok: false, error: 'unauthorized' },
      { status: 401, headers: { 'Cache-Control': 'no-store' } },
    );
  }

  const observer = createSystemJobObserver('seo-anime-index', {
    service: 'cron',
  });
  const manualShard = requestedShard(request);

  if (manualShard === 'invalid') {
    return Response.json(
      { ok: false, error: 'invalid_source_shard' },
      { status: 400, headers: { 'Cache-Control': 'no-store' } },
    );
  }

  const shards = manualShard == null
    ? scheduledSourceShards()
    : [manualShard];

  try {
    const results = [];

    // Deliberately sequential: one registry job must never become an AniList
    // burst. Each source shard is one bounded GraphQL request containing ten
    // aliased pages and is already protected by the upstream circuit breaker.
    for (const shard of shards) {
      const entries = await getSeoAnimeSourceShard(shard);
      const synced = await syncSeoAnimeSourceEntries(entries, shard);
      results.push(synced);
    }

    const totals = results.reduce(
      (sum, item) => ({
        checked: sum.checked + item.checked,
        changed: sum.changed + item.changed,
        indexable: sum.indexable + item.indexable,
      }),
      { checked: 0, changed: 0, indexable: 0 },
    );

    await observer.success({
      sourceShards: shards,
      ...totals,
    });

    return Response.json(
      {
        ok: true,
        sourceShards: shards,
        ...totals,
        results,
      },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    console.error('[SEO anime index cron]', error);
    await observer.failed(error, { sourceShards: shards });

    return Response.json(
      {
        ok: false,
        error: 'seo_anime_index_refresh_failed',
        sourceShards: shards,
      },
      { status: 500, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}

export async function GET(request: Request) {
  return run(request);
}

export async function POST(request: Request) {
  return run(request);
}
