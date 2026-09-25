import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (file) =>
  fs.readFileSync(path.join(root, file), 'utf8');

const failures = [];
const shell = read('components/home/HomePageShell.tsx');
const feedRuntime = read(
  'components/home/HomeFeedRuntimeProvider.tsx',
);
const recommendationRuntime = read(
  'components/home/useHomeRecommendationRuntime.ts',
);
const discovery = read(
  'components/home/HomeDiscoverySection.tsx',
);
const personal = read(
  'components/home/HomePersonalRetentionSections.tsx',
);

const progressBlock =
  feedRuntime.match(
    /const progress = useMemo\(\(\) => \{[\s\S]*?\}, \[hydrated, historyRevision\]\);/,
  )?.[0] ?? '';

if (!progressBlock) {
  failures.push(
    'Home progress memo must depend on hydrated + historyRevision.',
  );
}

if (!progressBlock.includes('if (!hydrated) return {};')) {
  failures.push(
    'Home progress must not read localStorage during SSR/first hydration pass.',
  );
}

const guardIndex =
  progressBlock.indexOf('if (!hydrated) return {};');
const progressReadIndex =
  progressBlock.indexOf('return readAnimeProgressMap();');

if (
  guardIndex < 0 ||
  progressReadIndex < 0 ||
  progressReadIndex < guardIndex
) {
  failures.push(
    'readAnimeProgressMap() runs before the hydration guard.',
  );
}

const recommendationEffect =
  recommendationRuntime.match(
    /useEffect\(\(\) => \{[\s\S]*?import\('@\/lib\/recommendations'\)[\s\S]*?\}, \[[\s\S]*?tasteRevision,[\s\S]*?\]\);/,
  )?.[0] ?? '';

if (
  !recommendationEffect.includes('if (!hydrated) return;') ||
  !recommendationEffect.includes(
    'getPersonalizedRecommendations',
  ) ||
  !recommendationEffect.includes('requestIdleCallback')
) {
  failures.push(
    'Personalized recommendations must stay post-hydration and idle-loaded.',
  );
}

if (
  !discovery.includes('<HomeContinueWatching') ||
  !discovery.includes('className="home-discovery-flow"') ||
  !personal.includes(
    'export function HomePersonalScheduleSection',
  )
) {
  failures.push(
    'Home hierarchy islands lost continue/discovery/personal schedule ownership.',
  );
}

const discoveryIndex =
  shell.indexOf('<HomeDiscoverySection />');
const personalScheduleIndex =
  shell.indexOf('<HomePersonalScheduleSection />');
const globalScheduleIndex =
  shell.indexOf('<HomeScheduleSection />');
const retentionIndex =
  shell.indexOf('<HomeRetentionSections />');
const utilityIndex =
  shell.indexOf('<div className="home-utility-grid">');
const railIndex =
  shell.indexOf('<HomeRightRail />');

if (
  !(
    discoveryIndex >= 0 &&
    personalScheduleIndex > discoveryIndex
  )
) {
  failures.push(
    'Home hierarchy must stay recommendations → personal schedule.',
  );
}

if (
  !(
    globalScheduleIndex >= 0 &&
    retentionIndex > globalScheduleIndex &&
    utilityIndex > retentionIndex &&
    railIndex > utilityIndex
  )
) {
  failures.push(
    'Schedule/retention/utility/right-rail order regressed.',
  );
}

if (shell.includes("'use client'")) {
  failures.push(
    'HomePageShell must remain a Server Component.',
  );
}

if (failures.length) {
  console.error('[AnimeBox Home Hydration] Check failed:');
  failures.forEach((failure) =>
    console.error(`- ${failure}`),
  );
  process.exit(1);
}

console.log(
  '[AnimeBox Home Hydration] server shell / client island invariants passed.',
);
