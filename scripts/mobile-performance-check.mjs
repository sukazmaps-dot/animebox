import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

const failures = [];

const sw = read('public/animebox-sw.js');
const bridge = read('components/OfflineCacheBridge.tsx');
const deferred = read('components/DeferredMount.tsx');
const appEnhancements = read('components/DeferredAppEnhancements.tsx');
const metrika = read('components/analytics/DeferredYandexMetrika.tsx');
const discovery = read('components/home/HomeDiscoverySection.tsx');
const retention = read('components/home/HomePersonalRetentionSections.tsx');
const community = read('components/home/HomeDeferredCommunity.tsx');
const hero = read('components/HomeHeroCarousel.tsx');
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
  ['home deferred recommendations', discovery, 'home-deferred--recommendations'],
  ['home deferred retention', retention, 'home-deferred--retention'],
  ['home deferred personal pulse', retention, 'home-deferred--pulse'],
  ['home deferred activation', retention, 'home-deferred--activation'],
  ['home deferred chat', community, 'home-deferred--chat'],
  ['home deferred telegram', community, 'home-deferred--telegram'],
  ['home server feed mobile budget', feed, 'limit: 12'],
  ['landscape-aware anime image sizes', card, '(orientation: landscape) and (max-height: 600px) 18vw'],
  ['performance stylesheet import', layout, "import './patch16-6-1-mobile-performance.css';"],
  ['idle app enhancements', layout, '<DeferredAppEnhancements />'],
  ['requestIdleCallback shell defer', appEnhancements, 'requestIdleCallback'],
  ['staggered presence hydration', appEnhancements, 'PRESENCE_DELAY_MS = 4_500'],
  ['staggered progression hydration', appEnhancements, 'PROGRESSION_DELAY_MS = 8_000'],
  ['welcome chunk session gate', appEnhancements, 'readTelegramWelcomePending'],
  ['Metrika delayed fallback', metrika, 'METRIKA_FALLBACK_DELAY_MS = 30_000'],
  ['Metrika idle install', metrika, 'requestIdleCallback'],
  ['home public CDN cache', nextConfig, "source: '/', headers: homeHeaders"],
  ['home ISR cache lifetime', nextConfig, 's-maxage=900'],
  ['single hero high-priority preload', hero, 'priority={false}'],
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

const htmlRoutesBlock =
  nextConfig.match(/const htmlRoutes = \[[\s\S]*?\];/)?.[0] ?? '';

if (htmlRoutesBlock.includes("'/'")) {
  failures.push('public Home route must not be forced through the no-store HTML route list');
}

if ((hero.match(/fetchPriority=.*high/g) ?? []).length > 1) {
  failures.push('Home hero must have only one high-priority image request');
}

if (
  appEnhancements.includes('const [ready, setReady]') ||
  appEnhancements.includes('if (!ready) return null')
) {
  failures.push('non-critical shell features must not share one early hydration gate');
}

if (
  metrika.includes('window.setTimeout(load, 12_000)') ||
  !metrika.includes('scheduleLoad')
) {
  failures.push('Yandex Metrika must stay outside the initial TBT and interaction handlers');
}


for (const eagerImport of [
  "import ProgressionCelebration from '@/components/ProgressionCelebration'",
  "import TelegramWelcomePromo from '@/components/TelegramWelcomePromo'",
  "import SocialPresenceHeartbeat from '@/components/social/SocialPresenceHeartbeat'",
]) {
  if (layout.includes(eagerImport)) {
    failures.push(`root layout still eagerly hydrates non-critical feature: ${eagerImport}`);
  }
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
