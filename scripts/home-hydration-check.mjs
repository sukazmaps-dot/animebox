import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

const failures = [];
const home = read('components/HomePageClient.tsx');

const progressBlock = home.match(
  /const progress = useMemo\(\(\) => \{[\s\S]*?\}, \[hydrated, historyRevision\]\);/,
)?.[0] ?? '';

if (!progressBlock) {
  failures.push('Home progress memo must depend on hydrated + historyRevision.');
}

if (!progressBlock.includes('if (!hydrated) return {};')) {
  failures.push('Home progress must not read localStorage during SSR/first hydration pass.');
}

if (
  progressBlock.includes('readAnimeProgressMap()') &&
  progressBlock.indexOf('readAnimeProgressMap()') <
    progressBlock.indexOf('if (!hydrated) return {};')
) {
  failures.push('readAnimeProgressMap() runs before the hydration guard.');
}

const recommendationsBlock = home.match(
  /const smartRecommendations = useMemo\(\(\) => \{[\s\S]*?\}, \[[\s\S]*?\]\);/,
)?.[0] ?? '';

if (
  !recommendationsBlock.includes('if (!hydrated) return [];') ||
  !recommendationsBlock.includes('getPersonalizedRecommendations')
) {
  failures.push('Personalized recommendations lost their hydration guard.');
}


const continueIndex = home.indexOf('<HomeContinueWatching');
const discoveryIndex = home.indexOf('className="home-discovery-flow"');
const personalScheduleIndex = home.indexOf('{personalScheduleItems.length > 0 && (');
const globalScheduleIndex = home.indexOf(
  '<section ref={scheduleSectionRef} className="section schedule">',
);
const retentionIndex = home.indexOf(
  '{(hasWatchHistory || serverContinue.length > 0) && (',
);
const mainUtilityIndex = home.indexOf(
  '<div className="home-utility-grid">',
);
const asideIndex = home.indexOf('<aside className="right-rail">');

if (
  !(
    continueIndex >= 0 &&
    discoveryIndex > continueIndex &&
    personalScheduleIndex > discoveryIndex
  )
) {
  failures.push(
    'Home hierarchy must stay Continue Watching → recommendations → personal schedule.',
  );
}

if (
  !(
    globalScheduleIndex >= 0 &&
    retentionIndex > globalScheduleIndex &&
    mainUtilityIndex > retentionIndex &&
    mainUtilityIndex < asideIndex
  )
) {
  failures.push(
    'Informational/utility surfaces must remain at the bottom of the main column.',
  );
}

if (
  asideIndex >= 0 &&
  home.slice(asideIndex).includes('<div className="home-utility-grid">')
) {
  failures.push('Right rail must not duplicate the bottom utility cards.');
}

if (failures.length) {
  console.error('[AnimeBox Home Hydration] Check failed:');
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log('[AnimeBox Home Hydration] SSR/client hydration invariants passed.');
