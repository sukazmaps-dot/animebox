import {
  existsSync,
  readFileSync,
  readdirSync,
  statSync,
} from 'node:fs';
import { extname, join, relative } from 'node:path';

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

const nextConfig = read('next.config.ts');
const proxy = read('proxy.ts');
const gateway = read('infra/ru-gateway/proxy-common.conf.example');
const pkg = JSON.parse(read('package.json'));

for (const [label, needle] of [
  ['CSP header key', "key: 'Content-Security-Policy'"],
  ['CSP frame-ancestors deny', 'value: "frame-ancestors \'none\';"'],
  ['X-Frame-Options header key', "key: 'X-Frame-Options'"],
  ['X-Frame-Options DENY', "value: 'DENY'"],
  ['global security header application', "{ source: '/:path*', headers: securityHeaders }"],
]) {
  if (!nextConfig.includes(needle)) {
    failures.push(`next.config.ts missing ${label}.`);
  }
}

if (/frame-ancestors\s+['"]?self/i.test(nextConfig)) {
  failures.push(
    "next.config.ts weakened frame-ancestors to 'self'; AnimeBox has no page-framing use case.",
  );
}

if (/X-Frame-Options[\s\S]{0,160}(?:SAMEORIGIN|ALLOW-FROM)/i.test(nextConfig)) {
  failures.push('next.config.ts weakened X-Frame-Options below DENY.');
}

for (const [label, needle] of [
  ['unsafe mutation set', 'const UNSAFE_METHODS = new Set(['],
  ['POST guard', "'POST'"],
  ['PUT guard', "'PUT'"],
  ['PATCH guard', "'PATCH'"],
  ['DELETE guard', "'DELETE'"],
  ['Origin verification', 'allowedBrowserOrigin(request, origin)'],
  ['Sec-Fetch-Site cross-site rejection', "request.headers.get('sec-fetch-site') === 'cross-site'"],
  ['TRACE rejection', "'TRACE'"],
  ['TRACK rejection', "'TRACK'"],
  ['CONNECT rejection', "'CONNECT'"],
]) {
  if (!proxy.includes(needle)) {
    failures.push(`proxy.ts missing ${label}.`);
  }
}

for (const forbidden of [
  'proxy_hide_header Content-Security-Policy',
  'proxy_hide_header X-Frame-Options',
]) {
  if (gateway.includes(forbidden)) {
    failures.push(
      `RU gateway strips anti-framing protection: ${forbidden}.`,
    );
  }
}

const codeExtensions = new Set(['.ts', '.tsx', '.js', '.jsx']);
const roots = ['app', 'components'];
const sameOriginFrameFindings = [];

function scan(dir) {
  if (!existsSync(dir)) return;

  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    const stats = statSync(full);

    if (stats.isDirectory()) {
      scan(full);
      continue;
    }

    if (!codeExtensions.has(extname(name))) continue;

    const source = readFileSync(full, 'utf8');
    const path = relative(root, full).replaceAll('\\', '/');

    const staticSameOriginFrame =
      /<iframe[\s\S]{0,600}?src\s*=\s*(?:["']\/|\{\s*["']\/|\{\s*`\/)/m;
    const scriptedSameOriginFrame =
      /iframe\.src\s*=\s*(?:window\.)?location\.origin/m;

    if (
      staticSameOriginFrame.test(source) ||
      scriptedSameOriginFrame.test(source)
    ) {
      sameOriginFrameFindings.push(path);
    }
  }
}

for (const dir of roots) scan(join(root, dir));

if (sameOriginFrameFindings.length) {
  failures.push(
    `DENY policy conflicts with same-origin iframe usage: ${sameOriginFrameFindings.join(', ')}.`,
  );
}

if (
  pkg.scripts?.['patch18-6-5:check'] !==
  'node scripts/patch-18-6-5-clickjacking-check.mjs'
) {
  failures.push('package.json is missing patch18-6-5:check.');
}

if (
  pkg.scripts?.['security:clickjacking:smoke'] !==
  'node scripts/clickjacking-header-smoke.mjs'
) {
  failures.push('package.json is missing security:clickjacking:smoke.');
}

if (
  !String(pkg.scripts?.prebuild ?? '').includes(
    'npm run patch18-6-5:check',
  )
) {
  failures.push('prebuild does not execute patch18-6-5:check.');
}

if (failures.length) {
  console.error('\n[AnimeBox 18.6.5 Clickjacking] Check failed:\n');
  failures.forEach((failure) => console.error(` - ${failure}`));
  console.error('');
  process.exit(1);
}

console.log(
  '[AnimeBox 18.6.5 Clickjacking] DENY/frame-ancestors, browser mutation boundaries, gateway forwarding and iframe compatibility passed.',
);
