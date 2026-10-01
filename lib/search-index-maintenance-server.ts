import 'server-only';

import { createSupabaseAdmin } from '@/lib/supabase/admin';

export type SearchIndexCoverageSnapshot = {
  migrationReady: boolean;
  searchDocuments: number | null;
  richDocuments: number | null;
  catalogDocuments: number | null;
  coveragePct: number | null;
  richCoveragePct: number | null;
  latestIndexedAt: string | null;
  latestCatalogSyncAt: string | null;
};

export type SearchIndexRepairResult = {
  ok: boolean;
  migrationRequired: boolean;
  processed: number;
  before: SearchIndexCoverageSnapshot;
  after: SearchIndexCoverageSnapshot;
};

function percentage(part: number | null, total: number | null) {
  if (part == null || total == null || total <= 0) return null;
  return Math.round((part / total) * 10_000) / 100;
}

function schemaMissing(message: string) {
  return /catalog_metadata_version|catalog_updated_at|repair_anime_search_documents_v1|schema cache|does not exist|could not find the function/i.test(
    message,
  );
}

function dateValue(value: unknown) {
  return typeof value === 'string' && Number.isFinite(Date.parse(value))
    ? value
    : null;
}

export async function getSearchIndexCoverageSnapshot():
Promise<SearchIndexCoverageSnapshot> {
  const admin = createSupabaseAdmin();

  const [
    searchCountResult,
    catalogCountResult,
    richCountResult,
    latestIndexResult,
    latestCatalogSyncResult,
  ] = await Promise.all([
    admin
      .from('anime_search_documents')
      .select('*', { count: 'exact', head: true }),
    admin
      .from('anime_catalog')
      .select('*', { count: 'exact', head: true }),
    admin
      .from('anime_search_documents')
      .select('*', { count: 'exact', head: true })
      .gte('catalog_metadata_version', 1)
      .or(
        'format.not.is.null,start_year.not.is.null,total_episodes.not.is.null',
      ),
    admin
      .from('anime_search_documents')
      .select('updated_at')
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    admin
      .from('anime_search_documents')
      .select('catalog_updated_at')
      .not('catalog_updated_at', 'is', null)
      .order('catalog_updated_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const searchDocuments = searchCountResult.error
    ? null
    : searchCountResult.count ?? 0;
  const catalogDocuments = catalogCountResult.error
    ? null
    : catalogCountResult.count ?? 0;

  const richSchemaMissing =
    Boolean(richCountResult.error && schemaMissing(richCountResult.error.message)) ||
    Boolean(
      latestCatalogSyncResult.error &&
      schemaMissing(latestCatalogSyncResult.error.message),
    );

  const richDocuments =
    richSchemaMissing || richCountResult.error
      ? null
      : richCountResult.count ?? 0;

  const latestIndexData =
    !latestIndexResult.error &&
    latestIndexResult.data &&
    typeof latestIndexResult.data === 'object'
      ? (latestIndexResult.data as { updated_at?: unknown })
      : null;

  const latestCatalogSyncData =
    !latestCatalogSyncResult.error &&
    latestCatalogSyncResult.data &&
    typeof latestCatalogSyncResult.data === 'object'
      ? (latestCatalogSyncResult.data as {
          catalog_updated_at?: unknown;
        })
      : null;

  return {
    migrationReady: !richSchemaMissing,
    searchDocuments,
    richDocuments,
    catalogDocuments,
    coveragePct: percentage(searchDocuments, catalogDocuments),
    richCoveragePct: percentage(richDocuments, catalogDocuments),
    latestIndexedAt: dateValue(latestIndexData?.updated_at),
    latestCatalogSyncAt: dateValue(
      latestCatalogSyncData?.catalog_updated_at,
    ),
  };
}

export async function repairSearchIndexCoverage(
  limit = 500,
): Promise<SearchIndexRepairResult> {
  const safeLimit = Math.min(
    2_000,
    Math.max(1, Math.round(limit)),
  );
  const before = await getSearchIndexCoverageSnapshot();
  const admin = createSupabaseAdmin();

  const { data, error } = await admin.rpc(
    'repair_anime_search_documents_v1',
    {
      p_limit: safeLimit,
    },
  );

  if (error) {
    if (schemaMissing(error.message)) {
      return {
        ok: false,
        migrationRequired: true,
        processed: 0,
        before,
        after: before,
      };
    }

    throw error;
  }

  const processed = Math.max(0, Math.trunc(Number(data ?? 0)) || 0);
  const after = await getSearchIndexCoverageSnapshot();

  return {
    ok: true,
    migrationRequired: false,
    processed,
    before,
    after,
  };
}
