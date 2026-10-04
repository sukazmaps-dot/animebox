import fs from 'node:fs';

const read = (path) =>
  fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

const failures = [];
const rails = read('lib/recommendation-rails.ts');
const feed = read('components/SmartRecommendationFeed.tsx');
const discovery = read('components/home/HomeDiscoverySection.tsx');
const shell = read('components/home/HomePageShell.tsx');
const docs = read('docs/PATCH-22-DISCOVERY-RECOMMENDATIONS-3.md');

for (const [label, source, needle] of [
  ['composition version', rails, "HOME_COMPOSITION_VERSION = '22.8-home-v1'"],
  ['session rail id', rails, "| 'session_intent'"],
  ['session confidence gate', rails, 'item.sessionIntentConfidence >= 0.16'],
  ['session score gate', rails, 'item.sessionIntentScore >= 0.14'],
  ['session rail source', rails, "source: 'smart_feed_session_intent'"],
  ['mood-aware top match priority', rails, "if (rail.id === 'top_match') {"],
  ['active mood priority', rails, "return options.mood === 'any' ? 60 : 0"],
  ['schedule insertion helper', rails, 'getHomeScheduleInsertionIndex'],
  ['single-runtime interleave slot', feed, 'midFeedSlot?: ReactNode'],
  ['schedule slot marker', feed, 'data-home-composition-slot="personal-schedule"'],
  ['schedule insertion helper usage', feed, 'getHomeScheduleInsertionIndex(rails)'],
  ['home schedule before discovery', discovery, '<HomePersonalScheduleSection />'],
  ['legacy standalone schedule removed', shell, '<HomeDiscoverySection />\n\n              <HomeShortcuts />'],
  ['phase L docs', docs, 'Status: **implemented / under CI**'],
]) {
  if (!source.includes(needle)) {
    failures.push(`${label}: missing ${needle}`);
  }
}

const moodWeight = rails.indexOf("if (rail.id === 'mood_lane')");
const topWeight = rails.indexOf("if (rail.id === 'top_match')");
const sessionWeight = rails.indexOf("if (rail.id === 'session_intent')");
const storyWeight = rails.indexOf("if (rail.id === 'story_continues')");
if (
  !(
    moodWeight >= 0 &&
    topWeight > moodWeight &&
    sessionWeight > topWeight &&
    storyWeight > sessionWeight
  )
) {
  failures.push(
    'adaptive rail priority contract is not Mood(active) -> Top Match -> Session -> Story',
  );
}

if (shell.includes('<HomePersonalScheduleSection />')) {
  failures.push('HomePageShell still mounts a second standalone personal schedule');
}

if (failures.length) {
  console.error('[AnimeBox Patch 22 Phase L] Home composition check failed:');
  for (const failure of failures) console.error(` - ${failure}`);
  process.exit(1);
}

console.log(
  '[AnimeBox Patch 22 Phase L] single-runtime personalized Home composition passed.',
);
