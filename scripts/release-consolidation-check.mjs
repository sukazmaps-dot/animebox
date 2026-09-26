import fs from 'node:fs';

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

const pkg = JSON.parse(read('package.json'));
const vercel = JSON.parse(read('vercel.json'));
const workflow = read('.github/workflows/animebox-quality.yml');
const ignoreBuild = read('scripts/vercel-ignore-build.mjs');
const pipeline = read('DEPLOYMENT-PIPELINE.md');

const failures = [];
const scripts = pkg.scripts ?? {};
const prebuild = typeof scripts.prebuild === 'string' ? scripts.prebuild : '';

if (pkg.engines?.node !== '22.x') {
  failures.push('package.json must pin Node 22.x');
}

if (scripts['release-consolidation:check'] !== 'node scripts/release-consolidation-check.mjs') {
  failures.push('release-consolidation:check script is missing or changed');
}

if (!prebuild.startsWith('npm run release-consolidation:check && ')) {
  failures.push('prebuild must run release-consolidation:check before expensive gates');
}

const prebuildRuns = [...prebuild.matchAll(/\bnpm run ([\w:.-]+)/g)].map((match) => match[1]);
for (const scriptName of prebuildRuns) {
  if (typeof scripts[scriptName] !== 'string') {
    failures.push(`prebuild references missing npm script: ${scriptName}`);
  }
}

const duplicates = prebuildRuns.filter((name, index) => prebuildRuns.indexOf(name) !== index);
if (duplicates.length) {
  failures.push(`prebuild contains duplicate gates: ${[...new Set(duplicates)].join(', ')}`);
}

const deploymentEnabled = vercel.git?.deploymentEnabled;
if (
  !deploymentEnabled ||
  typeof deploymentEnabled !== 'object' ||
  deploymentEnabled['patch-*'] !== false
) {
  failures.push('Vercel must disable automatic deployments for patch-* working branches');
}

if (deploymentEnabled?.['preview-*'] === false) {
  failures.push('preview-* branches must remain deployable');
}

if (vercel.ignoreCommand !== 'node scripts/vercel-ignore-build.mjs') {
  failures.push('vercel.json must use the repository release-only ignoreCommand');
}

if (
  !ignoreBuild.includes("const isProductionBranch = ref === 'main'") ||
  !ignoreBuild.includes("const isPreviewBranch = /^preview-/i.test(ref)") ||
  !ignoreBuild.includes('isPreviewBranch ||') ||
  !ignoreBuild.includes("process.exit(shouldBuild ? 1 : 0)")
) {
  failures.push('Vercel ignore gate does not guarantee main + preview-* builds');
}

if (
  !workflow.includes('pull_request:') ||
  !workflow.includes('      - main') ||
  !workflow.includes('node-version: 22') ||
  !workflow.includes('npm ci') ||
  !workflow.includes('npm run release-consolidation:check') ||
  !workflow.includes('npx tsc --noEmit') ||
  !workflow.includes('npx eslint') ||
  !workflow.includes('node tests/retention.cjs') ||
  !workflow.includes('npm run build')
) {
  failures.push('AnimeBox Quality Gate no longer covers the canonical Node 22 release path');
}

if (
  !pipeline.includes('create `preview-X` from the exact green patch head') ||
  !pipeline.includes('no marker/no-op commit is required')
) {
  failures.push('deployment documentation is out of sync with preview branch behavior');
}

if (failures.length) {
  console.error('[AnimeBox Release Consolidation] Check failed:');
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log(
  `[AnimeBox Release Consolidation] release pipeline invariants passed (${prebuildRuns.length} prebuild gates, Node ${pkg.engines.node}).`,
);
