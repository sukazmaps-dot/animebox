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

if (failures.length) {
  console.error('[AnimeBox Frontend Architecture] Check failed:');
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log(
  `PASS: root CSS boundaries hold at ${rootCssImports.length} imports / ${rootCssBytes} bytes`,
);
