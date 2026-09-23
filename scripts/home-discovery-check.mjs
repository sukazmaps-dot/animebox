import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const failures = [];

function read(path) {
  const full = join(root, path);
  if (!existsSync(full)) {
    failures.push(`${path}: required file is missing.`);
    return '';
  }
  return readFileSync(full, 'utf8');
}

const layout = read('app/layout.tsx');
const home = read('components/HomePageClient.tsx');
const continueWatching = read('components/HomeContinueWatching.tsx');
const css = read('app/patch14-3-home-discovery.css');

const importNeedle = "import './patch14-3-home-discovery.css';";
if (!layout.includes(importNeedle)) {
  failures.push('layout.tsx: Home Discovery stylesheet is not imported.');
}

const homeImport = layout.indexOf(importNeedle);
const mobileShellImport = layout.indexOf("import './patch14-2-mobile-shell.css';");
if (
  homeImport < 0 ||
  mobileShellImport < 0 ||
  homeImport < mobileShellImport
) {
  failures.push('layout.tsx: Home Discovery must load after Mobile Shell.');
}

for (const [label, needle] of [
  ['discovery scene wrapper', 'className="home-discovery-flow"'],
  ['mood control in scene', '<HomeMoodPicker'],
  ['smart feed in scene', 'id="animebox-for-you"'],
]) {
  if (!home.includes(needle)) failures.push(`HomePageClient: missing ${label}.`);
}

if (!continueWatching.includes("'Следующая серия'") || !continueWatching.includes('Эпизод ${Math.max(1, episode)}')) {
  failures.push('HomeContinueWatching: sentence-case episode labels are missing.');
}

for (const [label, needle] of [
  ['editorial discovery scene', '.home-discovery-flow'],
  ['continue shelf de-cardification', '.home-page .continue-smart-card'],
  ['poster-first smart cards', '.home-discovery-flow .smart-card__poster'],
  ['mobile continue peek', 'flex: 0 0 min(86vw, 410px)'],
  ['mobile mood rail', '.home-discovery-flow .mood-picker__options'],
  ['compact mobile hero', 'min-height: 330px !important'],
]) {
  if (!css.includes(needle)) failures.push(`Home Discovery CSS: missing ${label}.`);
}

if (failures.length) {
  console.error('\n[AnimeBox Home & Discovery] Check failed:\n');
  for (const failure of failures) console.error(` - ${failure}`);
  console.error('');
  process.exit(1);
}

console.log('[AnimeBox Home & Discovery] Static invariants passed.');
