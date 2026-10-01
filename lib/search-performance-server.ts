import 'server-only';

import {
  getSearchIndexCoverageSnapshot,
} from '@/lib/search-index-maintenance-server';
import type {
  SearchLatencySummary,
  SearchPerformanceSnapshot,
} from '@/lib/search-performance';
import { createSupabaseAdmin } from '@/lib/supabase/admin';

type ProductRow = {
  event_name?: unknown;
  metadata?: unknown;
  created_at?: unknown;
};

function finiteNumber(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function metadataOf(value: unknown) {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function percentile(values: number[], fraction: number) {
  if (!values.length) return null;

  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil(sorted.length * fraction) - 1),
  );

  return Math.round(sorted[index]!);
}

function summarize(values: number[]): SearchLatencySummary {
  const bounded = values
    .filter((value) => Number.isFinite(value) && value >= 0)
    .map((value) => Math.min(120_000, value));

  return {
    samples: bounded.length,
    p50Ms: percentile(bounded, 0.5),
    p75Ms: percentile(bounded, 0.75),
    p95Ms: percentile(bounded, 0.95),
    maxMs: bounded.length ? Math.round(Math.max(...bounded)) : null,
  };
}

function percentage(part: number, total: number) {
  if (total <= 0) return null;
  return Math.round((part / total) * 10_000) / 100;
}

function average(values: number[]) {
  if (!values.length) return null;

  return (
    Math.round(
      (values.reduce((sum, value) => sum + value, 0) /
        values.length) *
        100,
    ) / 100
  );
}

function snapshotStatus(input: {
  firstResultP95: number | null;
  coveragePct: number | null;
  richCoveragePct: number | null;
  migrationReady: boolean;
}) {
  if (
    (input.firstResultP95 != null && input.firstResultP95 > 1_500) ||
    (input.coveragePct != null && input.coveragePct < 70) ||
    (input.richCoveragePct != null && input.richCoveragePct < 70)
  ) {
    return 'critical' as const;
  }

  if (
    !input.migrationReady ||
    (input.firstResultP95 != null && input.firstResultP95 > 700) ||
    (input.coveragePct != null && input.coveragePct < 90) ||
    (input.richCoveragePct != null && input.richCoveragePct < 90)
  ) {
    return 'warning' as const;
  }

  return 'healthy' as const;
}

export async function getSearchPerformanceSnapshot(
  periodHours = 24,
): Promise<SearchPerformanceSnapshot> {
  const safePeriodHours = Math.min(
    24 * 7,
    Math.max(1, Math.round(periodHours)),
  );
  const admin = createSupabaseAdmin();
  const since = new Date(
    Date.now() - safePeriodHours * 60 * 60 * 1000,
  ).toISOString();

  const [eventsResult, index] = await Promise.all([
    admin
      .from('product_events')
      .select('event_name,metadata,created_at')
      .in('event_name', [
        'search_first_result',
        'search_enrichment_ready',
        'search_suggestion_ready',
      ])
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .limit(5_000),
    getSearchIndexCoverageSnapshot(),
  ]);

  if (eventsResult.error) throw eventsResult.error;

  const rows = (eventsResult.data ?? []) as ProductRow[];
  const firstLatencies: number[] = [];
  const enrichmentLatencies: number[] = [];
  const suggestionLatencies: number[] = [];
  const instantServerLatencies: number[] = [];
  const instantDeliveryLatencies: number[] = [];
  const instantRichShares: number[] = [];
  let instant = 0;
  let authoritative = 0;
  let discovery = 0;
  let memory = 0;
  let network = 0;

  for (const row of rows) {
    const eventName =
      typeof row.event_name === 'string' ? row.event_name : '';
    const metadata = metadataOf(row.metadata);
    const latency = finiteNumber(metadata.latency_ms);

    if (eventName === 'search_first_result') {
      if (latency != null) firstLatencies.push(latency);

      if (metadata.result_source === 'instant') {
        instant += 1;

        const serverMs = finiteNumber(metadata.server_ms);
        const deliveryMs = finiteNumber(metadata.delivery_ms);
        const richShare = finiteNumber(metadata.rich_card_share_pct);

        if (serverMs != null) {
          instantServerLatencies.push(serverMs);
        }

        if (deliveryMs != null) {
          instantDeliveryLatencies.push(deliveryMs);
        }

        if (
          richShare != null &&
          richShare >= 0 &&
          richShare <= 100
        ) {
          instantRichShares.push(richShare);
        }
      } else if (metadata.result_source === 'authoritative') {
        authoritative += 1;
      } else if (metadata.result_source === 'discovery') {
        discovery += 1;
      }

      if (metadata.cache_status === 'memory') memory += 1;
      if (metadata.cache_status === 'network') network += 1;
      continue;
    }

    if (eventName === 'search_enrichment_ready') {
      if (latency != null) enrichmentLatencies.push(latency);
      continue;
    }

    if (
      eventName === 'search_suggestion_ready' &&
      latency != null
    ) {
      suggestionLatencies.push(latency);
    }
  }

  const firstResult = summarize(firstLatencies);
  const firstSourceTotal = instant + authoritative + discovery;
  const cacheTotal = memory + network;

  return {
    generatedAt: new Date().toISOString(),
    periodHours: safePeriodHours,
    status: snapshotStatus({
      firstResultP95: firstResult.p95Ms,
      coveragePct: index.coveragePct,
      richCoveragePct: index.richCoveragePct,
      migrationReady: index.migrationReady,
    }),
    firstResult,
    enrichment: summarize(enrichmentLatencies),
    suggestions: summarize(suggestionLatencies),
    instantServer: summarize(instantServerLatencies),
    instantDelivery: summarize(instantDeliveryLatencies),
    firstResultSources: {
      instant,
      authoritative,
      discovery,
      instantSharePct: percentage(instant, firstSourceTotal),
    },
    instantCache: {
      memory,
      network,
      memorySharePct: percentage(memory, cacheTotal),
    },
    instantRichCards: {
      samples: instantRichShares.length,
      averageSharePct: average(instantRichShares),
    },
    index: {
      migrationReady: index.migrationReady,
      searchDocuments: index.searchDocuments,
      richDocuments: index.richDocuments,
      catalogDocuments: index.catalogDocuments,
      coveragePct: index.coveragePct,
      richCoveragePct: index.richCoveragePct,
      latestIndexedAt: index.latestIndexedAt,
      latestCatalogSyncAt: index.latestCatalogSyncAt,
    },
    latestSampleAt:
      typeof rows[0]?.created_at === 'string'
        ? rows[0].created_at
        : null,
  };
}
