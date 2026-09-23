import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const failures = [];

function read(path) {
  const full = join(root, path);
  if (!existsSync(full)) {
    failures.push(`${path}: required file is missing.`);
    return '';
  }
  return readFileSync(full, 'utf8');
}

const proxy = read('proxy.ts');
const nextConfig = read('next.config.ts');

const proxyChecks = [
  ['production origin lock', "process.env.VERCEL_ENV === 'production'"],
  ['canonical AnimeBox host', "'youranimebox.com'"],
  ['direct-origin rejection', 'не принимает прямые запросы'],
  ['optional edge origin secret', 'ANIMEBOX_EDGE_ORIGIN_SECRET'],
  ['cross-origin write guard', "sec-fetch-site') === 'cross-site'"],
  ['API body cap', 'MAX_API_CONTENT_LENGTH'],
  ['request correlation id', 'x-animebox-request-id'],
];

for (const [label, needle] of proxyChecks) {
  if (!proxy.includes(needle)) {
    failures.push(`proxy.ts: missing ${label}.`);
  }
}

const headerChecks = [
  ['HSTS', 'Strict-Transport-Security'],
  ['nosniff', 'X-Content-Type-Options'],
  ['referrer policy', 'Referrer-Policy'],
  ['permissions policy', 'Permissions-Policy'],
];

for (const [label, needle] of headerChecks) {
  if (!nextConfig.includes(needle)) {
    failures.push(`next.config.ts: missing ${label}.`);
  }
}

if (failures.length) {
  console.error('\n[AnimeBox Edge Shield] Check failed:\n');
  for (const failure of failures) console.error(` - ${failure}`);
  console.error('');
  process.exit(1);
}

console.log('[AnimeBox Edge Shield] Static checks passed.');
