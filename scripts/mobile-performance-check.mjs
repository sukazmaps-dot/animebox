import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

const failures = [];

const sw = read('public/animebox-sw.js');
const bridge = read('components/OfflineCacheBridge.tsx');
const deferred = read('components/DeferredMount.tsx');
const home = read('components/HomePageClient.tsx');
const feed = read('lib/home-feed-server.ts');
const card = read('components/AnimeCard.tsx');
const layout = read('app/layout.tsx');
const nextConfig = read('next.config.ts');
const css = read('app/patch16-6-1-mobile-performance.css');

for (const [label, source, needle] of [
  ['service worker navigation exclusion', sw, "request.mode === 'navigate'"],
  ['service worker HTML exclusion', sw, "accept.includes('text/html')"],
  ['service worker public anime cache', sw, "'/api/anime'"],
  ['service worker public schedule cache', sw, "'/api/schedule'"],
  ['bounded image cache', sw, 'IMAGE_CACHE, 140'],
  ['bounded public data cache', sw, 'DATA_CACHE, 36'],
  ['localhost SW exclusion', bridge, "window.location.hostname === 'localhost'"],
  ['post-load SW registration', bridge, "window.addEventListener('load', register"],
  ['deferred IntersectionObserver', deferred, 'new IntersectionObserver'],
  ['save-data aware deferred margin', deferred, 'connection?.saveData'],
  ['home deferred recommendations', home, 'home-deferred--recommendations'],
  ['home deferred chat', home, 'home-deferred--chat'],
  ['home deferred telegram', home, 'home-deferred--telegram'],
  ['home server feed mobile budget', feed, 'limit: 12'],
  ['landscape-aware anime image sizes', card, '(orientation: landscape) and (max-height: 600px) 18vw'],
  ['performance stylesheet import', layout, "import './patch16-6-1-mobile-performance.css';"],
  ['service worker no-store header', nextConfig, "source: '/animebox-sw.js'"],
  ['coarse pointer GPU reduction', css, '@media (hover: none) and (pointer: coarse)'],
  ['reduced data contract', css, '@media (prefers-reduced-data: reduce)'],
]) {
  if (!source.includes(needle)) {
    failures.push(`${label}: missing ${needle}`);
  }
}

for (const forbidden of [
  "'/api/watch/recent'",
  "'/api/profile'",
  "'/api/auth'",
  "'/api/community'",
]) {
  if (sw.includes(forbidden)) {
    failures.push(`service worker must not cache private endpoint prefix ${forbidden}`);
  }
}

const performanceImport = "import './patch16-6-1-mobile-performance.css';";
const responsiveImport = "import './patch16-6-responsive-layout.css';";

if (layout.indexOf(performanceImport) < layout.indexOf(responsiveImport)) {
  failures.push('mobile performance layer must load after responsive foundation');
}

if (
  !sw.includes("request.destination === 'document'") ||
  !sw.includes("url.origin !== self.location.origin")
) {
  failures.push('service worker must stay same-origin and document-safe');
}

if (failures.length) {
  console.error('[AnimeBox Mobile Performance] Check failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log('PASS: mobile payload, deferred rendering, bounded offline cache and image budget');
