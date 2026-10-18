import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(path, 'utf8');
const shell = read('components/home/HomePageShell.tsx');
const home = read('app/page.tsx');
const hero = read('components/HomeHeroCarousel.tsx');
const rails = read('components/HomeAnimeRail.tsx');
const catalogue = read('components/home/HomeCatalogSections.tsx');
const runtime = read('components/home/HomeFeedRuntimeProvider.tsx');
const social = read('components/home/HomeWatchTogetherSection.tsx');
const lobby = read('components/home/HomeWatchTogetherLobby.tsx');
const styles = read('app/patch30-0-home-streaming.css');
const socials = read('components/home/HomeWatchTogetherSection.module.css');
const media = read('lib/media-delivery.ts');
const next = read('next.config.ts');

function ordered(markers, source = shell) {
  let previous = -1;
  for (const marker of markers) {
    const index = source.indexOf(marker);
    assert(index > previous, 'Lost/incorrect order: ' + marker);
    previous = index;
  }
}

// Patch 32.0.1 editorial reordering: schedule now precedes discovery, and
// community chat precedes secondary retention. Preserve strict relative order
// and the original server-shell invariant instead of disabling this gate.
ordered([
  '<HomeHeroSection />',
  '<HomeGuestPrompt />',
  '<HomeContinueSection />',
  '<HomeScheduleSection />',
  '<HomeDiscoverySection />',
  '<HomeCatalogSections />',
  '<HomeWatchTogetherSection />',
  '<HomeDeferredChat />',
  '<HomeRetentionSections />',
  '<HomeDeferredSupport />',
]);
assert(!shell.includes("'use client'"), 'Server shell cannot become a client island');
assert(shell.includes('data-home-layout="cinematic"'), 'Home 32 scope missing');
assert(shell.includes("import styles from './HomePageShell.module.css'"), 'Home CSS module owner missing');
assert(home.includes('revalidate = 900'), 'Home ISR contract changed');
assert(next.includes('unoptimized: true'), 'Global Image optimizer quota contract changed');

assert.equal((hero.match(/<Image\s/g) ?? []).length, 1, 'Hero must use exactly one image');
assert.equal((hero.match(/^\s*<picture(?:\s[^>]*)?>\s*$/gm) ?? []).length, 1, 'One picture for desktop/mobile');
for (const needle of [
  'buildAnimeBoxMediaCandidates(', 'buildAnimeBoxMediaSrcSet(',
  "buildAnimeBoxMediaDefaultVariant(", 'media="(max-width: 768px)"',
  'media="(min-width: 769px)"', 'loading="eager"',
  "fetchPriority={firstSlide", 'priority={false}',
  'Math.min(current + 1, mobileAttempts.length)',
  'Math.min(current + 1, backdropAttempts.length)',
  'proxyImageUrl(src)',
  "window.matchMedia('(max-width: 768px)').matches",
]) {
  assert(hero.includes(needle), 'Hero missing performance/recovery contract: ' + needle);
}
assert(!hero.includes('home-hero-carousel__mobile-keyart-image'),
  'Secondary mobile Image should not silently be reintroduced');
assert(hero.includes('<HomeHeroPagination'), 'Existing paging must remain');
assert(hero.includes("import('@/lib/recommendations')"),
  'Hero recommendation engine must remain dynamically imported');

assert(catalogue.includes("import HomeAnimeRail"), 'Catalogue not using the rail');
assert.equal((catalogue.match(/<HomeAnimeRail/g) ?? []).length, 2, 'Exactly two rails');
assert.equal((catalogue.match(/watchedEpisodes={personalEpisodeByAnime}/g) ?? []).length,
  2, 'Both rails must use existing progress map');
assert(!catalogue.includes('<AnimeCard'), 'No duplicate grid card path');
assert(rails.includes('watchedEpisodes?: ReadonlyMap<number, number>'),
  'Rail optional progress contract lost');
assert(rails.includes('watchedEpisode={watchedEpisodes?.get(anime.id) ?? null}'),
  'Progress no longer reaches AnimeCard');
assert(rails.includes('window.requestAnimationFrame(() =>'),
  'Rail scroll handler no longer frame bounded');
assert(rails.includes('window.cancelAnimationFrame(scrollFrame)'),
  'Rail scroll frame leaks after unmount');
assert(rails.includes("window.removeEventListener('resize', onResize)"),
  'Rail resize listener not cleaned up');
assert(rails.includes('resizeObserver?.disconnect()'),
  'Rail observer not cleaned up');
assert(runtime.includes('const personalEpisodeByAnime = useMemo'),
  'Original progress computation removed');

assert(social.includes('<HomeWatchTogetherDeferred />'),
  'Room lobby must remain deferred');
assert(lobby.includes('stopPolling()') && lobby.includes('document.hidden'),
  'Visibility lifecycle missing');
assert(lobby.includes('intent: \'watch_party\''),
  'Guest room join permission lost');
assert(socials.includes('.empty'), 'Social empty row removed');
assert(socials.includes(':global(html[data-animebox-theme="light"])'),
  'Social light theme missing');

assert(styles.includes('@media (max-width: 768px)'),
  'Mobile art/rail layout missing');
assert(styles.includes('width: 100% !important') && styles.includes('height: 100% !important') &&
  styles.includes('--hero-mobile-position'), 'Mobile full-bleed art geometry missing');
assert(styles.includes('scroll-snap-type: x proximity'),
  'Touch rail snapping missing');
assert(styles.includes('prefers-reduced-motion: reduce'),
  'Reduced motion guard missing');
assert(styles.includes('--ab-ui-text') && styles.includes('--ab-ui-surface'),
  'Theme tokens missing');
assert(!/(^|\n)\s*\.anime-card\s*\{/m.test(styles),
  'Unscoped global card style forbidden');
assert(media.includes("export function buildAnimeBoxMediaSrcSet"),
  'Cloudflare image pipeline changed');

console.log('[Patch 30.0] PASS: homepage order, responsive hero, rails, progress, safety and styles');
