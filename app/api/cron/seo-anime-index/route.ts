import { getSeoAnimeSourceShard } from '@/lib/seo-anilist';
import { syncSeoAnimeSourceEntries } from '@/lib/seo-anime-index-server';
import {
  getSeoCatalogRepairPageCount,
  repairSeoCatalogPage,
  scheduledSeoCatalogRepairPage,
} from '@/lib/seo-catalog-recovery-server';
import { ANIME_SITEMAP_SHARDS, SITE_URL } from '@/lib/seo-config';
import { submitIndexNowUrls } from '@/lib/indexnow';
import { beginOperationalJob } from '@/lib/operational-job-server';
import { isCronAuthorized, secureServerSecretEqual } from '@/lib/server-request-auth';
import { optionalServerSecret } from '@/lib/env/server';
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

function requestedCatalogRepair(request: Request) {
  const params = new URL(request.url).searchParams;
  const repairValue = params.get('catalogRepair');
  const pageValue = params.get('catalogPage');
  const dryRunValue = params.get('dryRun');
  if (repairValue != null && repairValue !== '1') return { invalid: true };
  if (dryRunValue != null && dryRunValue !== '1') return { invalid: true };
  if (pageValue != null && !/^(?:0|[1-9][0-9]{0,3})$/.test(pageValue))
    return { invalid: true };
  if ((pageValue != null || dryRunValue != null) && repairValue !== '1')
    return { invalid: true };
  return {
    invalid: false,
    manual: repairValue === '1',
    page: pageValue == null ? null : Number(pageValue),
    dryRun: dryRunValue === '1',
  };
}

function isSeoCronAuthorized(request: Request) {
  // Dedicated SEO scheduler credential; the legacy CRON_SECRET remains valid
  // for existing integrations and is never copied into the new scheduler.
  return isCronAuthorized(request) || secureServerSecretEqual(
    optionalServerSecret('SEO_INDEX_CRON_SECRET'),
    request.headers.get('x-seo-cron-secret')?.trim(),
  );
}

async function run(request: Request) {
  if (!isSeoCronAuthorized(request)) {
    return Response.json(
      { ok: false, error: 'unauthorized' },
      { status: 401, headers: { 'Cache-Control': 'no-store' } },
    );
  }

  const observer = createSystemJobObserver('seo-anime-index', {
    service: 'cron',
  });
  const manualShard = requestedShard(request);
  const catalogRepair = requestedCatalogRepair(request);

  if (manualShard === 'invalid' || catalogRepair.invalid ||
      (catalogRepair.manual && manualShard != null)) {
    return Response.json(
      { ok: false, error: 'invalid_seo_index_request' },
      { status: 400, headers: { 'Cache-Control': 'no-store' } },
    );
  }

  const permit = await beginOperationalJob('seo-anime-index', {
    budgetMs: 50_000,
    leaseTtlSeconds: 90,
  });

  if (!permit.allowed) {
    await observer.skipped(permit.reason, { degraded: permit.degraded });
    return Response.json(
      { ok: true, skipped: true, reason: permit.reason },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  }

  const shards = catalogRepair.manual
    ? []
    : manualShard == null ? scheduledSourceShards() : [manualShard];

  try {
    // The local catalogue often contains real titles absent from the bounded
    // AniList SEO source shards. Keep recovery strictly inside this signed cron
    // and the existing distributed job lease; never run it for crawlers.
    let catalogRecovery: Awaited<ReturnType<typeof repairSeoCatalogPage>> | null = null;
    let catalogRecoveryFailed = false;
    const shouldRepair = catalogRepair.manual || manualShard == null;
    if (shouldRepair && !permit.shouldStop(12_000)) {
      try {
        const pageCount = await getSeoCatalogRepairPageCount();
        const page = catalogRepair.page ??
          scheduledSeoCatalogRepairPage(pageCount);
        if (page < pageCount) {
          catalogRecovery = await repairSeoCatalogPage({
            page,
            dryRun: catalogRepair.dryRun,
          });
        }
      } catch (error) {
        // Catalog recovery is best-effort during daily AniList shard refresh.
        // Never starve the existing SEO cron because an optional local
        // backfill read failed. Explicit operator runs must report failure.
        if (catalogRepair.manual) throw error;
        catalogRecoveryFailed = true;
        console.warn('[SEO anime index cron] Local catalog recovery unavailable:', error);
      }
    }

    const results = [];
    let budgetExhausted = false;

    // Sequential by design: SEO can wait for the next run. Playback cannot.
    for (const shard of shards) {
      if (permit.shouldStop(7_000)) {
        budgetExhausted = true;
        break;
      }

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

    const changedUrls = [
      ...new Set(
        [
          ...results.flatMap((item) => item.changedSlugs),
          ...(catalogRecovery?.insertedSlugs ?? []),
        ].map((slug) => `${SITE_URL}/anime/${encodeURIComponent(slug)}`),
      ),
    ];

    const indexNow =
      changedUrls.length > 0 && !permit.shouldStop(5_500)
        ? await submitIndexNowUrls(changedUrls)
        : {
            attempted: 0,
            accepted: changedUrls.length === 0,
            status: null,
            truncated: false,
          };

    const summary = {
      sourceShards: shards,
      catalogRecovery,
      catalogRecoveryFailed,
      completedShards: results.map((item) => item.sourceShard),
      budgetExhausted,
      remainingMs: permit.remainingMs(),
      changedUrls: changedUrls.length,
      indexNow,
      ...totals,
    };

    if (budgetExhausted) {
      await observer.degraded('seo_index_budget_exhausted', summary);
    } else {
      await observer.success(summary);
    }

    return Response.json(
      {
        ok: true,
        degraded: budgetExhausted,
        ...summary,
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
  } finally {
    await permit.release();
  }
}

export async function GET(request: Request) {
  return run(request);
}

export async function POST(request: Request) {
  return run(request);
}
