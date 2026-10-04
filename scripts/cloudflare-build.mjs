import { applySplitTraceFix } from './cloudflare-adapter-compat.mjs';
import { spawnSync } from 'node:child_process';
const env = { ...process.env, ANIMEBOX_RUNTIME: 'cloudflare', NEXT_PRIVATE_STANDALONE: 'true', NEXT_PRIVATE_OUTPUT_TRACE_ROOT: process.cwd() };
function run(file, args = []) {
  const child = spawnSync(process.execPath, [file, ...args], { env, stdio: 'inherit' });
  if (child.status !== 0) throw new Error('Build step failed: ' + file);
}
const restore = applySplitTraceFix();
try {
if (!process.argv.includes('--skip-next')) {
  const prebuild = spawnSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['run', 'build'], { env, stdio: 'inherit', shell: process.platform === 'win32' });
  if (prebuild.status !== 0) throw new Error('Next build failed');
}
run('scripts/cloudflare-route-manifest.mjs');
run('scripts/cloudflare-worker-configs.mjs');
run('node_modules/@opennextjs/cloudflare/dist/cli/index.js', ['build', '--skipNextBuild']);
run('scripts/cloudflare-bundle-groups.mjs');
run('scripts/cloudflare-size-check.mjs');

} finally { restore(); }
