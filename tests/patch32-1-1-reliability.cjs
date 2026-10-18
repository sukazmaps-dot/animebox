/* Regression guard for Patch 32.1.1.
 * The existing poster-source-reliability test exercises the real batched
 * Supabase enrichment and image fallback; this checks all consumer paths
 * and executes the actual heartbeat backoff policy.
 */
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const ts = require('typescript');

const read = path => readFileSync(path, 'utf8');

const recommendations = read('app/api/recommendations/route.ts');
assert.match(recommendations, /import \{ enrichAnimePosterSources \} from '@\/lib\/anime-poster-metadata-server'/);
assert.match(recommendations, /await enrichAnimePosterSources\(availability\.items\)/);
assert.match(recommendations, /items: posterItems/);
assert.match(recommendations, /const hasMore = result\.items\.length > 0 && page < MAX_PAGE/,
  'pagination remains based on candidates, not poster lookups');

const discovery = read('app/api/discovery/route.ts');
assert.match(discovery, /await enrichAnimePosterSources\(ranked\.slice\(0, limit\)\)/,
  'enrich only visible ranked results, not the large candidate pool');
assert.match(discovery, /items: visibleItems/);
assert.match(discovery, /rankSmartDiscoveryCandidates\(candidates, intent, \{ seed, strict: true \}\)/);

const related = read('components/RelatedAnime.tsx');
assert.match(related, /await enrichAnimePosterSources\(availability\.items\.slice\(0, 12\)\)/);
assert.match(related, /const ranked = uniqueWithoutCurrent/,
  'poster enrichment must follow established taxonomy/ranking');

const guard = read('app/api/social/presence/route.ts');
assert.match(guard, /enforceIpAndUserRateLimit\(request, user\.id/,
  'authenticated presence must preserve global IP + user rate limits');

const heartbeat = read('components/social/SocialPresenceHeartbeat.tsx');
assert.match(heartbeat, /Date\.now\(\) < nextAllowedAt/);
assert.match(heartbeat, /presenceRetryDelayMs\(\s*failures, response\.headers\.get\('Retry-After'\)/);
assert.match(heartbeat, /AbortSignal\.timeout\(5_000\)/);
assert.match(heartbeat, /window\.setInterval/);
assert.match(heartbeat, /if \(response\.ok\) \{\s*failures = 0;\s*nextAllowedAt = 0;/);

const moduleObject = { exports: {} };
const transpiled = ts.transpileModule(
  read('lib/social-presence-retry.ts'),
  { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } },
).outputText;
new Function('module', 'exports', transpiled)(moduleObject, moduleObject.exports);
const delay = moduleObject.exports.presenceRetryDelayMs;
assert.equal(delay(1, null), 60_000);
assert.equal(delay(2, null), 120_000);
assert.equal(delay(3, null), 240_000);
assert.equal(delay(10, null), 300_000);
assert.equal(delay(1, '180'), 180_000, 'respect server Retry-After');
assert.equal(delay(1, 'NaN'), 60_000, 'invalid Retry-After must not bypass cooldown');
assert.equal(delay(1, '-1'), 60_000);
assert.equal(delay(1, '9999999'), 300_000, 'untrusted server header bounded');
assert.equal(delay(NaN, null), 60_000);

console.log('PASS 32.1.1: all recommendation surfaces, safe global guard, capped presence cooldown');
