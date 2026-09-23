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
const foundation = read('app/patch14-1-visual-foundation.css');

const importNeedle = "import './patch14-1-visual-foundation.css';";
if (!layout.includes(importNeedle)) {
  failures.push('layout.tsx: Visual Foundation stylesheet is not imported.');
}

const lastPatchImport = layout.lastIndexOf("import './");
const foundationImport = layout.indexOf(importNeedle);
if (foundationImport < 0 || foundationImport !== lastPatchImport) {
  failures.push('layout.tsx: Visual Foundation must remain the last global CSS import.');
}

for (const [label, needle] of [
  ['ink base', '--ab-ink-0:'],
  ['surface scale', '--ab-surface-1:'],
  ['porcelain text', '--ab-porcelain:'],
  ['iris accent', '--ab-iris:'],
  ['ember signal', '--ab-ember:'],
  ['semantic border', '--ab-line:'],
  ['focus visible state', ':focus-visible'],
  ['reduced motion support', '@media (prefers-reduced-motion: reduce)'],
  ['mobile safe-area left', 'env(safe-area-inset-left)'],
  ['mobile safe-area right', 'env(safe-area-inset-right)'],
]) {
  if (!foundation.includes(needle)) {
    failures.push(`Visual Foundation: missing ${label}.`);
  }
}

if (!foundation.includes('.anime-card')) {
  failures.push('Visual Foundation: media-card grammar is missing.');
}

if (!foundation.includes('.episode-seo-context')) {
  failures.push('Visual Foundation: watch-page surface grammar is missing.');
}

if (failures.length) {
  console.error('\n[AnimeBox Visual Foundation] Check failed:\n');
  for (const failure of failures) console.error(` - ${failure}`);
  console.error('');
  process.exit(1);
}

console.log('[AnimeBox Visual Foundation] Static invariants passed.');
