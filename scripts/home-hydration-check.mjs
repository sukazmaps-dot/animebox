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

if (failures.length) {
  console.error('[AnimeBox Home Hydration] Check failed:');
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log('[AnimeBox Home Hydration] SSR/client hydration invariants passed.');
