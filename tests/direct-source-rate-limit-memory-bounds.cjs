'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');

function loadRoute() {
  const sourcePath = 'app/api/player/direct-source/route.ts';
  const source = fs.readFileSync(sourcePath, 'utf8');
  const js = ts.transpileModule(source, {
    fileName: sourcePath,
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const imports = {
    'next/server': {
      after: () => {},
      NextResponse: { json: (...args) => Response.json(...args) },
    },
    '@/lib/copyright-server': { COPYRIGHT_RESTRICTED_MESSAGE: 'restricted' },
    '@/lib/player-source-control': {
      claimProviderHalfOpenProbe: async () => ({ allowed: false }),
      getProviderDecision: async () => ({ enabled: false, reason: 'provider_disabled' }),
      recordProviderResult: async () => {},
    },
    '@/lib/direct-player-server': {
      resolveDirectPlayerStreams: async () => ({ streams: [], reason: 'not-used' }),
    },
    '@/lib/request-observability-server': {
      observeApiRoute: (_path, handler) => handler,
    },
  };
  const mod = { exports: {} };
  new Function('require', 'module', 'exports', js)(name => {
    if (Object.prototype.hasOwnProperty.call(imports, name)) return imports[name];
    throw new Error('Unexpected runtime import in test harness: ' + name);
  }, mod, mod.exports);
  return { GET: mod.exports.GET, source };
}

function requestFor(ip) {
  return {
    headers: new Headers({ 'x-forwarded-for': ip }),
    nextUrl: new URL('https://example.test/api/player/direct-source?shikimoriId=1&animeId=1&season=1&episode=1'),
    signal: new AbortController().signal,
  };
}

(async () => {
  const originalNow = Date.now;
  let now = originalNow();
  Date.now = () => now;

  try {
    const { GET, source } = loadRoute();
    const capMatch = source.match(/MAX_REQUEST_BUCKETS\s*=\s*(\d[\d_]*)/);
    assert(capMatch, 'direct-source rate-limit buckets must have an explicit cap');
    const cap = Number(capMatch[1].replaceAll('_', ''));
    assert.equal(cap, 2_000);

    for (let index = 1; index <= cap; index += 1) {
      const response = await GET(requestFor('fixture-ip-' + index));
      assert.equal(response.status, 503, 'active provider is mocked as disabled for allowed test requests');
    }

    const saturated = await GET(requestFor('fixture-ip-overflow'));
    assert.equal(saturated.status, 429, 'a new unique IP must be rejected when all bounded buckets are active');

    for (let attempt = 0; attempt < 39; attempt += 1) {
      assert.equal((await GET(requestFor('fixture-ip-' + cap))).status, 503);
    }
    assert.equal((await GET(requestFor('fixture-ip-' + cap))).status, 429, 'the per-IP 40-request limit is preserved');

    now += 61_000;
    const afterWindow = await GET(requestFor('fixture-ip-after-window'));
    assert.equal(afterWindow.status, 503, 'expired IP buckets are swept and capacity becomes available');

    assert.match(source, /REQUEST_BUCKET_SWEEP_MS\s*=\s*30_000/);
    assert.match(source, /sweepExpiredRequestBuckets\(now\)/);
    console.log('PASS direct-source rate limiter: unique-IP cardinality is capped at 2000, saturation fails closed, existing rate limits hold, and expired buckets release capacity.');
  } finally {
    Date.now = originalNow;
  }
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
