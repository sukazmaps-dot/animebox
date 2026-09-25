import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (file) =>
  fs.readFileSync(path.join(root, file), 'utf8');

const failures = [];

const hero = read('components/HomeHeroCarousel.tsx');
const feedRuntime = read(
  'components/home/HomeFeedRuntimeProvider.tsx',
);
const recommendationRuntime = read(
  'components/home/useHomeRecommendationRuntime.ts',
);
const navbar = read('components/Navbar.tsx');

const staticRecommendationImport =
  /import\s*\{[\s\S]*?get(?:Personalized|Recommended)Anime[\s\S]*?\}\s*from\s*['"]@\/lib\/recommendations['"]/;

if (staticRecommendationImport.test(hero)) {
  failures.push(
    'Hero statically imports the recommendation engine into the critical client graph.',
  );
}

if (
  /import\s*\{[\s\S]*?getPersonalizedRecommendations[\s\S]*?\}\s*from\s*['"]@\/lib\/recommendations['"]/.test(
    feedRuntime,
  )
) {
  failures.push(
    'Home feed runtime statically imports the recommendation engine.',
  );
}

for (const [label, source, needle] of [
  [
    'Hero recommendation chunk',
    hero,
    "import('@/lib/recommendations')",
  ],
  [
    'Hero idle recommendation scheduling',
    hero,
    'requestIdleCallback',
  ],
  [
    'Home recommendation chunk',
    recommendationRuntime,
    "import('@/lib/recommendations')",
  ],
  [
    'Home taste-graph chunk',
    recommendationRuntime,
    "import('@/lib/taste-graph')",
  ],
  [
    'Home personalization chunk',
    recommendationRuntime,
    "import('@/lib/personalization')",
  ],
  [
    'Home recommendation idle scheduling',
    recommendationRuntime,
    'requestIdleCallback',
  ],
  [
    'Navbar dynamic search suggestions',
    navbar,
    "() => import('./SearchSuggestions')",
  ],
  [
    'Navbar dynamic membership status',
    navbar,
    "() => import('./SidebarMembership')",
  ],
  [
    'Navbar dynamic social badge',
    navbar,
    "() => import('./SocialNotificationBadge')",
  ],
  [
    'Navbar search query gate',
    navbar,
    'searchValue.trim().length >= 2',
  ],
  [
    'Navbar authenticated membership gate',
    navbar,
    '!authLoading && user ?',
  ],
]) {
  if (!source.includes(needle)) {
    failures.push(`${label}: missing ${needle}`);
  }
}

for (const forbidden of [
  "import SearchSuggestions from './SearchSuggestions'",
  "import SidebarMembership from './SidebarMembership'",
  "import SocialNotificationBadge from './SocialNotificationBadge'",
]) {
  if (navbar.includes(forbidden)) {
    failures.push(
      `Navbar optional chunk regressed to eager import: ${forbidden}`,
    );
  }
}

if (
  /import\s*\{[\s\S]*?readTasteProfile[\s\S]*?\}\s*from\s*['"]@\/lib\/personalization['"]/.test(
    recommendationRuntime,
  ) ||
  /import\s*\{[\s\S]*?setTasteMood[\s\S]*?\}\s*from\s*['"]@\/lib\/personalization['"]/.test(
    recommendationRuntime,
  )
) {
  failures.push(
    'Home feed runtime eagerly imports personalization implementation.',
  );
}

if (
  /import\s*\{[\s\S]*?fetchTasteGraph[\s\S]*?\}\s*from\s*['"]@\/lib\/taste-graph['"]/.test(
    recommendationRuntime,
  )
) {
  failures.push(
    'Home recommendation runtime eagerly imports Taste Graph implementation.',
  );
}

if (failures.length) {
  console.error('[AnimeBox Client Bundle] Check failed:');
  failures.forEach((failure) =>
    console.error(`- ${failure}`),
  );
  process.exit(1);
}

console.log(
  '[AnimeBox Client Bundle] critical Home/Navbar chunks stay lazy and interaction-driven.',
);
