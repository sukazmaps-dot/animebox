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
const antiAi = read('app/patch14-1-1-anti-ai-design.css');

const foundationNeedle = "import './patch14-1-visual-foundation.css';";
const antiAiNeedle = "import './patch14-1-1-anti-ai-design.css';";

if (!layout.includes(foundationNeedle)) {
  failures.push('layout.tsx: Visual Foundation stylesheet is not imported.');
}

if (!layout.includes(antiAiNeedle)) {
  failures.push('layout.tsx: Anti-AI stylesheet is not imported.');
}

const lastPatchImport = layout.lastIndexOf("import './");
const foundationImport = layout.indexOf(foundationNeedle);
const antiAiImport = layout.indexOf(antiAiNeedle);

if (foundationImport < 0 || antiAiImport < foundationImport) {
  failures.push('layout.tsx: Anti-AI layer must load after Visual Foundation.');
}

if (antiAiImport < 0 || antiAiImport !== lastPatchImport) {
  failures.push('layout.tsx: Anti-AI visual layer must remain the last global CSS import.');
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

for (const [label, needle] of [
  ['shortcut de-cardification', '.home-shortcuts'],
  ['activation de-cardification', '.home-activation-v2'],
  ['retention editorial rail', '.home-retention'],
  ['mood tool grammar', '.mood-chip'],
  ['anime-card shine removal', '.anime-card__shine'],
  ['dashboard-label normalization', 'text-transform: none !important'],
]) {
  if (!antiAi.includes(needle)) {
    failures.push(`Anti-AI layer: missing ${label}.`);
  }
}

if (failures.length) {
  console.error('\n[AnimeBox Visual Foundation] Check failed:\n');
  for (const failure of failures) console.error(` - ${failure}`);
  console.error('');
  process.exit(1);
}

console.log('[AnimeBox Visual Foundation] Foundation + anti-AI invariants passed.');
