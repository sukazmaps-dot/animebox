import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { selectGroup, groups, bindingFor } from '../cloudflare/route-groups.mjs';
import { runScheduled } from '../cloudflare/cron.mjs';
const cases = {
  '/': 'default', '/search': 'default', '/api/admin/users': 'api_admin',
  '/api/administer': 'api_other', '/api/cron/premium-lifecycle': 'api_admin',
  '/api/watch-party/rooms': 'api_watch', '/api/search?q=a': 'api_catalog',
  '/api/profiles/123': 'api_social', '/api/auth/telegram': 'api_other',
  '/admin/analytics': 'pages_admin', '/profile/edit': 'pages_account',
  '/anime/naruto-20/episode/1': 'pages_watch',
  '/anime/naruto-20/opengraph-image': 'social_images',
  '/anime/naruto-20/twitter-image/123': 'social_images',
};
for (const [url, expected] of Object.entries(cases)) assert.equal(selectGroup(new URL(url, 'https://example.com').pathname), expected);
const actual = JSON.parse(readFileSync('.next/server/app-paths-manifest.json', 'utf8'));
const assignment = JSON.parse(readFileSync('cloudflare/split-routes.json', 'utf8'));
const all = Object.values(assignment).flat();
assert.equal(new Set(all).size, all.length, 'No route assigned twice');
for (const [path, module] of Object.entries(actual)) {
  const group = selectGroup(path.replace(/\/(page|route)$/, ''));
  if (group !== 'default') assert.ok(assignment[group].includes(module.replace(/\.js$/, '')), 'Missing compiled metadata or route: ' + path);
}
assert.equal(new Set(groups.map(g => bindingFor(g.name))).size, groups.length);
let invoked = 0;
const env = { ANIMEBOX_CRON_ENABLED: 'false', WORKER_SELF_REFERENCE: { fetch() { invoked++; } } };
await runScheduled({ cron: '47 3 * * *' }, env);
assert.equal(invoked, 0, 'Test cron must not write');
const enabled = { ANIMEBOX_CRON_ENABLED: 'true', CRON_SECRET: 'test-only-secret', WORKER_SELF_REFERENCE: { async fetch(request) {
  assert.equal(request.headers.get('authorization'), 'Bearer test-only-secret');
  assert.equal(new URL(request.url).pathname, '/api/cron/premium-lifecycle');
  return new Response('ok');
} } };
await runScheduled({ cron: '47 3 * * *' }, enabled);
await assert.rejects(runScheduled({ cron: '47 3 * * *' }, { ...enabled, CRON_SECRET: '' }));
console.log('PASS: route boundaries, compiled metadata coverage, unique assignments, disabled cron and signed cron');
