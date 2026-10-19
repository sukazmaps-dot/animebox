'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'animebox-css-inventory-'));
const script = path.resolve(__dirname, '../scripts/css-inventory.cjs');
function write(file, value) {
  const dest = path.join(fixture, file);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, value);
}
function run() {
  return spawnSync(process.execPath,
    [script, '--root=' + fixture, '--check', '--report'], { encoding: 'utf8' });
}

try {
  write('app/layout.tsx', "import './globals.css';\nimport './shared.css';\n");
  write('app/globals.css', ':root { --brand: violet; }\n.card { color: red !important; }\n');
  write('app/shared.css', '@media (max-width: 600px) { .card { color: blue; } }\n');
  write('components/Card.tsx',
    "import styles from './Card.module.css';\nexport default function Card(){ return styles.card }\n");
  write('components/Card.module.css', '.card { display: block; }');
  write('app/unreferenced.css', '.hidden { color: black; }');

  let result = run();
  assert.equal(result.status, 0, result.stdout + result.stderr);
  const report = JSON.parse(fs.readFileSync(
    path.join(fixture, 'artifacts/css-inventory/inventory.json'), 'utf8'));
  assert.equal(report.counts.cssFiles, 4);
  assert.equal(report.counts.cssModules, 1);
  assert.equal(report.counts.rootCssImports, 2);
  assert.equal(report.counts.important, 1);
  assert.equal(report.counts.selectorOverlapCandidates, 1);
  assert(report.overlaps.some((item) => item.selector === '.card' && item.fileCount === 2));
  assert(report.withoutStaticImport.includes('app/unreferenced.css'));
  assert.deepEqual(report.files.find((item) =>
    item.path === 'components/Card.module.css').importers, ['components/Card.tsx']);

  write('components/Broken.tsx', "import './missing.css';\n");
  result = run();
  assert.notEqual(result.status, 0, 'An unresolved local import must fail');
  assert(result.stderr.includes('Missing import: components/Broken.tsx'));
  fs.unlinkSync(path.join(fixture, 'components/Broken.tsx'));

  write('app/shared.css', '.broken { color: ;');
  result = run();
  assert.notEqual(result.status, 0, 'Invalid CSS must fail');
  assert(result.stderr.includes('Invalid CSS:'));
  console.log('PASS CSS inventory: import mapping, CSS rules, overlaps, warnings, invalid references');
} finally {
  fs.rmSync(fixture, { recursive: true, force: true });
}
