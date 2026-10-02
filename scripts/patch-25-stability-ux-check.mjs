import fs from 'node:fs';

const failures = [];
const read = (path) => fs.readFileSync(path, 'utf8');
const mustInclude = (source, needle, label) => {
  if (!source.includes(needle)) failures.push(label);
};
const mustExclude = (source, needle, label) => {
  if (source.includes(needle)) failures.push(label);
};

const rail = read('components/ui/HorizontalNavRail.tsx');
const quick = read('components/EpisodeQuickSelector.tsx');
const runtime = read('components/home/useHomeRecommendationRuntime.ts');
const discovery = read('components/home/HomeDiscoverySection.tsx');
const search = read('components/SearchCatalogClient.tsx');
const feed = read('components/SmartRecommendationFeed.tsx');

mustExclude(
  rail,
  'active.scrollIntoView(',
  'HorizontalNavRail may move the document viewport during active-item centering',
);
mustInclude(
  rail,
  'track.scrollTo({',
  'HorizontalNavRail must center active items inside its own scroll container',
);
mustInclude(
  rail,
  'maxScrollLeft',
  'HorizontalNavRail must clamp horizontal centering',
);

mustExclude(
  quick,
  'currentRef.current?.scrollIntoView(',
  'EpisodeQuickSelector must not use document-level scrolling to reveal the current episode',
);
mustInclude(
  quick,
  'const gridRef = useRef<HTMLDivElement | null>(null);',
  'EpisodeQuickSelector internal grid ref is missing',
);
mustInclude(
  quick,
  'grid.scrollTo({',
  'EpisodeQuickSelector must reposition only its internal episode grid',
);
mustInclude(
  quick,
  "current?.focus({ preventScroll: true })",
  'EpisodeQuickSelector focus must remain scroll-safe',
);

mustInclude(
  runtime,
  'pendingMoodRef',
  'mood persistence ownership guard is missing',
);
mustInclude(
  runtime,
  'moodPersistenceSequenceRef',
  'mood persistence sequence guard is missing',
);
mustInclude(
  runtime,
  'persistedMood !== pendingMood.mood',
  'stale taste refresh can overwrite an in-flight mood selection',
);
mustInclude(
  runtime,
  'moodRef.current = nextMood',
  'selected mood ref is not updated synchronously',
);
mustInclude(
  discovery,
  'mood={recommendationMood}',
  'rendered recommendation feed must stay bound to ranked mood, not optimistic selected mood',
);

mustInclude(
  search,
  'const SEARCH_DEBOUNCE_MS = 90',
  'instant-search debounce regressed',
);
mustInclude(
  search,
  'getInstantAnimeSearch(',
  'local-first instant search lane is missing',
);
mustInclude(
  search,
  'requestSequenceRef',
  'search request ownership guard is missing',
);
mustInclude(
  feed,
  'stable',
  'recommendation feed no longer exposes stable ordering safeguards',
);

if (failures.length) {
  console.error('\n[AnimeBox Patch 25 Stability & UX] Check failed:\n');
  for (const failure of failures) console.error(` - ${failure}`);
  console.error('');
  process.exit(1);
}

console.log('[AnimeBox Patch 25 Stability & UX] Static invariants passed.');
