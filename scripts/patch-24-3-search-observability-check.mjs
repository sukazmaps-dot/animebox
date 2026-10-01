import fs from 'node:fs';

const failures = [];
const read = (path) =>
  fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

const catalog = read('components/SearchCatalogClient.tsx');
const suggestions = read('components/SearchSuggestions.tsx');
const instantApi = read('app/api/search/instant/route.ts');
const instantClient = read('lib/instant-search-client.ts');
const eventNames = read('lib/product-event-names.ts');
const server = read('lib/search-performance-server.ts');
const api = read('app/api/admin/search-performance/route.ts');
const dashboard = read('components/admin/SearchPerformanceDashboard.tsx');
const adminPage = read('app/admin/page.tsx');

const must = (source, needle, label) => {
  if (!source.includes(needle)) failures.push(`${label}: missing ${needle}`);
};

for (const event of [
  'search_first_result',
  'search_enrichment_ready',
  'search_suggestion_ready',
]) {
  must(eventNames, `'${event}'`, `event contract ${event}`);
}

must(catalog, 'searchTimingRef', 'active search timer');
must(catalog, 'startSearchTiming(searchTimingRef, next)', 'live-input timer start');
must(catalog, "source: 'instant'", 'instant first-result telemetry');
must(catalog, "source: 'authoritative'", 'authoritative first-result telemetry');
must(catalog, "source: 'discovery'", 'discovery first-result telemetry');
must(catalog, "trackProductClientEvent('search_first_result'", 'first result event');
must(catalog, "trackProductClientEvent('search_enrichment_ready'", 'enrichment event');
must(catalog, 'delta_from_first_ms', 'first-to-enrichment delta');
must(catalog, 'requestId !== requestSequenceRef.current', 'stale response guard');

must(suggestions, "trackProductClientEvent('search_suggestion_ready'", 'suggestion timing event');
must(suggestions, 'requestId !== requestRef.current', 'suggestion stale response guard');
must(suggestions, 'latency_ms', 'suggestion latency');

must(instantClient, "clientCacheStatus?: 'memory' | 'network'", 'instant cache status');
must(instantClient, "clientCacheStatus: 'memory'", 'memory cache instrumentation');
must(instantClient, "clientCacheStatus: 'network'", 'network instrumentation');
must(instantClient, 'clientElapsedMs', 'instant delivery timing');

must(instantApi, "'Server-Timing'", 'instant server timing header');
must(instantApi, 'animebox_search_local', 'server timing metric name');

must(server, "event_name', [", 'search event aggregation');
must(server, 'p95Ms', 'latency percentile aggregation');
must(server, 'coveragePct', 'search index coverage');
must(server, "status: snapshotStatus", 'search health status');

must(api, "requireAdmin(['owner', 'admin'])", 'admin boundary');
must(api, 'getSearchPerformanceSnapshot', 'admin snapshot API');

must(dashboard, 'First result p95', 'first result dashboard KPI');
must(dashboard, 'Instant API p95', 'instant API dashboard KPI');
must(dashboard, 'Coverage', 'index coverage dashboard');
must(adminPage, 'href="/admin/search-performance"', 'admin dashboard navigation');

const timingOnlyBlocks = [
  catalog.slice(
    catalog.indexOf("trackProductClientEvent('search_first_result'"),
    catalog.indexOf("trackProductClientEvent('search_enrichment_ready'"),
  ),
  suggestions.slice(
    suggestions.indexOf("trackProductClientEvent('search_suggestion_ready'"),
    suggestions.indexOf('setItems(next)'),
  ),
].join('\n');

if (/query\s*:/i.test(timingOnlyBlocks)) {
  failures.push('latency telemetry block appears to include raw query metadata');
}

if (failures.length) {
  console.error('[AnimeBox Patch 24.3 Search Observability] check failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(
  '[AnimeBox Patch 24.3 Search Observability] first-result, enrichment, suggestions, index coverage and admin diagnostics passed.',
);
