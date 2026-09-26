const allow = process.env.ANIMEBOX_LOAD_TEST_ALLOW === '1';
const baseUrl = (process.env.ANIMEBOX_LOAD_TEST_BASE_URL || '')
  .trim()
  .replace(/\/$/, '');

if (!allow) {
  console.error(
    '[AnimeBox Load Drill] Refusing to run. Set ANIMEBOX_LOAD_TEST_ALLOW=1 explicitly.',
  );
  process.exit(2);
}

if (!/^https?:\/\//i.test(baseUrl)) {
  console.error(
    '[AnimeBox Load Drill] Set ANIMEBOX_LOAD_TEST_BASE_URL to a preview/staging URL.',
  );
  process.exit(2);
}

const target = new URL(baseUrl);
const productionHost = 'youranimebox.com';

if (
  target.hostname === productionHost &&
  process.env.ANIMEBOX_LOAD_TEST_PRODUCTION !== 'I_UNDERSTAND'
) {
  console.error(
    '[AnimeBox Load Drill] Production target requires ANIMEBOX_LOAD_TEST_PRODUCTION=I_UNDERSTAND.',
  );
  process.exit(2);
}

const phases = [100, 250, 500, 750, 1000];
const concurrency = Math.max(
  1,
  Math.min(40, Number(process.env.ANIMEBOX_LOAD_TEST_CONCURRENCY || 24)),
);

const routes = [
  { path: '/', weight: 28 },
  { path: '/catalog', weight: 24 },
  { path: '/api/recommendations?limit=10&page=1', weight: 22 },
  { path: '/api/watch-party/rooms?limit=5', weight: 10 },
  { path: '/sitemap-index.xml', weight: 6 },
  { path: '/api/discovery?q=уютное%20аниме&limit=10', weight: 10 },
];

const routePool = routes.flatMap((route) =>
  Array.from({ length: route.weight }, () => route.path),
);

function percentile(values, p) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil((p / 100) * sorted.length) - 1),
  );
  return Math.round(sorted[index] * 100) / 100;
}

function routeFor(index) {
  // Deterministic selection makes phase comparisons reproducible.
  return routePool[(index * 37 + 11) % routePool.length];
}

async function requestOne(index) {
  const path = routeFor(index);
  const url = new URL(path, baseUrl);
  const started = performance.now();

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        Accept: path.startsWith('/api/')
          ? 'application/json'
          : 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'User-Agent': 'AnimeBox-Readiness-Drill/18.7',
      },
      redirect: 'follow',
      signal: AbortSignal.timeout(15_000),
    });

    // Drain the body so connection reuse/real response work is measured.
    await response.arrayBuffer();

    return {
      path,
      status: response.status,
      durationMs: performance.now() - started,
      degraded: response.headers.get('x-animebox-degraded'),
      ok: response.status < 500,
    };
  } catch (error) {
    return {
      path,
      status: 0,
      durationMs: performance.now() - started,
      degraded: null,
      ok: false,
      error: error instanceof Error ? error.name : 'unknown_error',
    };
  }
}

async function runPhase(total) {
  const startedAt = performance.now();
  const results = new Array(total);
  let cursor = 0;

  async function worker() {
    while (true) {
      const index = cursor;
      cursor += 1;
      if (index >= total) return;
      results[index] = await requestOne(index);
    }
  }

  await Promise.all(
    Array.from(
      { length: Math.min(concurrency, total) },
      () => worker(),
    ),
  );

  const elapsedMs = performance.now() - startedAt;
  const durations = results.map((item) => item.durationMs);
  const statusCounts = {};
  const routeStats = {};
  let failures = 0;
  let degraded = 0;

  for (const item of results) {
    statusCounts[item.status] = (statusCounts[item.status] || 0) + 1;
    if (!item.ok) failures += 1;
    if (item.degraded) degraded += 1;

    const current = routeStats[item.path] || {
      requests: 0,
      failures: 0,
      durations: [],
    };
    current.requests += 1;
    if (!item.ok) current.failures += 1;
    current.durations.push(item.durationMs);
    routeStats[item.path] = current;
  }

  const routesSummary = Object.fromEntries(
    Object.entries(routeStats).map(([path, value]) => [
      path,
      {
        requests: value.requests,
        failures: value.failures,
        p95Ms: percentile(value.durations, 95),
      },
    ]),
  );

  return {
    total,
    concurrency,
    elapsedMs: Math.round(elapsedMs),
    throughputRps:
      Math.round((total / Math.max(elapsedMs / 1000, 0.001)) * 100) / 100,
    failures,
    errorRatePct: Math.round((failures / total) * 10_000) / 100,
    degradedResponses: degraded,
    p50Ms: percentile(durations, 50),
    p95Ms: percentile(durations, 95),
    p99Ms: percentile(durations, 99),
    statusCounts,
    routes: routesSummary,
  };
}

console.log(
  JSON.stringify(
    {
      target: baseUrl,
      concurrency,
      phases,
      warning:
        target.hostname === productionHost
          ? 'PRODUCTION TARGET'
          : 'preview/staging target',
    },
    null,
    2,
  ),
);

const report = [];
for (const total of phases) {
  const result = await runPhase(total);
  report.push(result);
  console.log(JSON.stringify(result, null, 2));

  if (result.errorRatePct >= 5) {
    console.error(
      `[AnimeBox Load Drill] Stopping after ${total}: error rate ${result.errorRatePct}% >= 5%.`,
    );
    break;
  }

  // Do not stack phases back-to-back against the target.
  await new Promise((resolve) => setTimeout(resolve, 2_000));
}

const failed = report.some(
  (phase) => phase.errorRatePct >= 5 || (phase.p95Ms ?? 0) >= 5_000,
);

console.log(
  JSON.stringify(
    {
      ok: !failed,
      target: baseUrl,
      phases: report,
    },
    null,
    2,
  ),
);

process.exitCode = failed ? 1 : 0;
