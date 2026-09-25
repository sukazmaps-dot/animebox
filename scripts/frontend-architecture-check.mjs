import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const exists = (file) => fs.existsSync(path.join(root, file));

const failures = [];
const rootLayout = read('app/layout.tsx');
const homePage = read('app/page.tsx');
const profileLayout = read('app/profile/layout.tsx');
const animeLayout = read('app/anime/[slug]/layout.tsx');
const watchTogetherLayout = read('app/watch-together/layout.tsx');
const homeShell = read('components/home/HomePageShell.tsx');
const homeFeedRuntime = read(
  'components/home/HomeFeedRuntimeProvider.tsx',
);
const homeScheduleRuntime = read(
  'components/home/HomeScheduleRuntimeProvider.tsx',
);

const rootCssImports = [
  ...rootLayout.matchAll(/import '\.\/([^']+\.css)';/g),
].map((match) => `app/${match[1]}`);

const rootCssBytes = rootCssImports.reduce((sum, file) => {
  const full = path.join(root, file);
  return sum + (fs.existsSync(full) ? fs.statSync(full).size : 0);
}, 0);

if (rootCssImports.length > 79) {
  failures.push(
    `root layout CSS import budget regressed: ${rootCssImports.length} > 79`,
  );
}

if (rootCssBytes > 880_000) {
  failures.push(
    `root layout CSS source budget regressed: ${rootCssBytes} > 880000 bytes`,
  );
}

for (const forbidden of [
  "import './patch17-6-watch-platform.css';",
  "import './patch17-4-2-2-public-profile-grid.css';",
  "import './patch16-6-5-profile-studio-gate.css';",
  "import './patch16-6-5-profile-studio.css';",
  "import './patch17-6-player-runtime.css';",
  "import './patch17-6-home-recommendation-actions.css';",
]) {
  if (rootLayout.includes(forbidden)) {
    failures.push(`root layout still owns route-specific stylesheet: ${forbidden}`);
  }
}

for (const [label, source, needle] of [
  [
    'home recommendation actions',
    homePage,
    "import './patch17-6-home-recommendation-actions.css';",
  ],
  [
    'profile studio styles',
    profileLayout,
    "import '../patch16-6-5-profile-studio.css';",
  ],
  [
    'public profile grid styles',
    profileLayout,
    "import '../patch17-4-2-2-public-profile-grid.css';",
  ],
  [
    'anime player runtime styles',
    animeLayout,
    "import '../../patch17-6-player-runtime.css';",
  ],
  [
    'watch-together player runtime styles',
    watchTogetherLayout,
    "import '../patch17-6-player-runtime.css';",
  ],
  [
    'global Telegram gate-only split',
    rootLayout,
    "import './patch16-6-5-telegram-gate-brand.css';",
  ],
]) {
  if (!source.includes(needle)) {
    failures.push(`${label}: missing ${needle}`);
  }
}

for (const legacy of [
  'app/patch17-6-watch-platform.css',
  'app/patch16-6-5-profile-studio-gate.css',
]) {
  if (exists(legacy)) {
    failures.push(`legacy mixed stylesheet still exists: ${legacy}`);
  }
}

if (exists('components/HomePageClient.tsx')) {
  failures.push(
    'legacy HomePageClient monolith must not return; Home is server shell + client islands',
  );
}

if (!homePage.includes("import HomePageShell from '@/components/home/HomePageShell';")) {
  failures.push('app/page.tsx must render the server-owned HomePageShell');
}

if (homeShell.includes("'use client'")) {
  failures.push('HomePageShell must remain a Server Component');
}

const shellLines = homeShell.split('\n').length;
const feedRuntimeLines = homeFeedRuntime.split('\n').length;
const scheduleRuntimeLines = homeScheduleRuntime.split('\n').length;

if (shellLines > 180) {
  failures.push(`HomePageShell server budget regressed: ${shellLines} > 180 lines`);
}

if (feedRuntimeLines > 800) {
  failures.push(
    `Home feed runtime island regressed into a monolith: ${feedRuntimeLines} > 800 lines`,
  );
}

if (scheduleRuntimeLines > 560) {
  failures.push(
    `Home schedule runtime island regressed into a monolith: ${scheduleRuntimeLines} > 560 lines`,
  );
}

for (const needle of [
  '<HomeHeroSection />',
  '<HomeDiscoverySection />',
  '<HomeCatalogSections />',
  '<HomeScheduleSection />',
  '<HomeRightRail />',
]) {
  if (!homeShell.includes(needle)) {
    failures.push(`HomePageShell missing client island boundary: ${needle}`);
  }
}

if (failures.length) {
  console.error('[AnimeBox Frontend Architecture] Check failed:');
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log(
  `PASS: root CSS boundaries hold at ${rootCssImports.length} imports / ${rootCssBytes} bytes`,
);
