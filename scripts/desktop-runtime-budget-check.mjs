import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const failures = [];

const scheduleRuntime = read('components/home/HomeScheduleRuntimeProvider.tsx');
const scheduleData = read('components/home/useHomeScheduleData.ts');
const scheduleRoute = read('app/api/schedule/route.ts');
const scrollRow = read('components/ui/ScrollRow.tsx');
const smartFeed = read('components/SmartRecommendationFeed.tsx');
const deferredMount = read('components/DeferredMount.tsx');
const hero = read('components/HomeHeroCarousel.tsx');

for (const forbidden of [
  'desktopTimer',
  'window.setTimeout(start, 700)',
  'fallbackTimer = window.setTimeout(start, 8_000)',
]) {
  if (scheduleRuntime.includes(forbidden) || scheduleData.includes(forbidden)) {
    failures.push(`full home schedule regained eager desktop wake-up: ${forbidden}`);
  }
}

for (const required of [
  "limit: '60'",
  "rootMargin: '700px 0px'",
  "setUpcomingScheduleLoading(false)",
  'scheduleWindowItems',
]) {
  if (!scheduleData.includes(required)) {
    failures.push(`bounded home schedule window missing: ${required}`);
  }
}

for (const required of [
  'requestedLimit',
  'items.length < requestedLimit',
  'requestedLimit ?? undefined',
]) {
  if (!scheduleRoute.includes(required)) {
    failures.push(`schedule endpoint limit contract missing: ${required}`);
  }
}

for (const required of [
  'endReachedRequiresInteraction?: boolean',
  'endInteractionUnlockedRef.current',
  'onPointerDown={unlockEndReached}',
  'onWheel={unlockEndReached}',
]) {
  if (!scrollRow.includes(required)) {
    failures.push(`ScrollRow interaction gate missing: ${required}`);
  }
}

if (!smartFeed.includes('endReachedRequiresInteraction')) {
  failures.push('Smart Feed does not require real interaction before pagination.');
}

if (
  /setTimeout\(\(\) => \{[\s\S]{0,250}prefetchCandidatePage[\s\S]{0,250}5_000/.test(
    smartFeed,
  )
) {
  failures.push('Smart Feed regained the 5s mount-time recommendation prefetch.');
}

if (deferredMount.includes('12_000')) {
  failures.push('DeferredMount regained the 12s mass wake-up timer.');
}

for (const required of [
  'parallaxFrameRef',
  'window.requestAnimationFrame(() => {',
  'parallaxRectRef.current',
]) {
  if (!hero.includes(required)) {
    failures.push(`Hero parallax RAF guard missing: ${required}`);
  }
}

if (
  hero.includes(
    "const rect = event.currentTarget.getBoundingClientRect();",
  )
) {
  failures.push('Hero pointermove regained a synchronous geometry read per event.');
}

if (failures.length) {
  console.error('[AnimeBox Desktop Runtime Budget] Check failed:');
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log(
  '[AnimeBox Desktop Runtime Budget] background work remains bounded and interaction-gated.',
);
