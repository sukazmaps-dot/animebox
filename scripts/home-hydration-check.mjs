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
const continueSection = read('components/home/HomeContinueSection.tsx');

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
  !continueSection.includes('<HomeContinueWatching items={continueWatchingItems} />') ||
  !continueSection.includes('useHomeFeedRuntime()') ||
  discovery.includes('<HomeContinueWatching') ||
  !discovery.includes('className="home-discovery-flow"') ||
  !personal.includes(
    'export function HomePersonalScheduleSection',
  )
) {
  failures.push(
    'Home hierarchy must own a single resume shelf, discovery flow and personal schedule.',
  );
}

const heroIndex = shell.indexOf('<HomeHeroSection />');
const resumeIndex = shell.indexOf('<HomeContinueSection />');
const socialIndex = shell.indexOf('<HomeWatchTogetherSection />');
const homeDiscoveryIndex = shell.indexOf('<HomeDiscoverySection />');
const catalogueIndex = shell.indexOf('<HomeCatalogSections />');
if (
  !(heroIndex >= 0 && resumeIndex > heroIndex &&
    homeDiscoveryIndex > resumeIndex && catalogueIndex > homeDiscoveryIndex &&
    socialIndex > catalogueIndex)
) {
  failures.push('Streaming-first Hero/resume/discovery/catalogue/Watch Together order regressed.');
}

const discoveryIndex =
  shell.indexOf('<HomeDiscoverySection />');
const personalScheduleIndex =
  discovery.indexOf('<HomePersonalScheduleSection />');
const globalScheduleIndex =
  shell.indexOf('<HomeScheduleSection />');
const retentionIndex =
  shell.indexOf('<HomeRetentionSections />');
const utilityIndex =
  shell.indexOf('<div className={styles.support}>');
const chatIndex = shell.indexOf('<HomeDeferredChat />');

if (
  !(
    discoveryIndex >= 0 &&
    personalScheduleIndex >= 0 &&
    !shell.includes('<HomePersonalScheduleSection />')
  )
) {
  failures.push(
    'Home hierarchy must keep personal schedule inside the single discovery surface before recommendations.',
  );
}

if (
  !(
    globalScheduleIndex >= 0 &&
    retentionIndex > globalScheduleIndex &&
    chatIndex > retentionIndex &&
    utilityIndex > chatIndex &&
    !shell.includes('<HomeRightRail />')
  )
) {
  failures.push(
    'Schedule/retention/community/support order or removed duplicate right rail regressed.',
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
