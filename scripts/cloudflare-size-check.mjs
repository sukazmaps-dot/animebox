import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { groups } from '../cloudflare/route-groups.mjs';
const names = ['default', ...groups.map(group => group.name), 'gateway'];
const limit = 3 * 1024;
const result = [];
for (const name of names) {
  const config = name === 'gateway' ? 'wrangler.jsonc' : `cloudflare/generated/wrangler-${name}.json`;
  const outdir = resolve(`.cloudflare-bundles/${name}`);
  mkdirSync(outdir, { recursive: true });
  const child = spawnSync(process.execPath, ['node_modules/wrangler/bin/wrangler.js', 'deploy', '--dry-run', '--config', config, '--outdir', outdir], { encoding: 'utf8', env: { ...process.env, OPEN_NEXT_DEPLOY: 'true' } });
  const output = child.stdout + child.stderr;
  writeFileSync(outdir + '/dry-run.log', output);
  const match = output.match(/gzip:\s*([\d.]+) KiB/);
  if (child.status !== 0 || !match) {
    console.error(name + ': dry-run failed\n' + output); process.exit(1);
  }
  const gzipKiB = Number(match[1]);
  result.push({ name, gzipKiB, freeLimitKiB: limit, passed: gzipKiB <= limit });
  console.log(name + ': ' + gzipKiB + ' KiB / ' + limit + ' KiB ' + (gzipKiB <= limit ? 'PASS' : 'OVER LIMIT'));
}
writeFileSync('cloudflare/size-report.json', JSON.stringify(result, null, 2) + '\n');
if (result.some(row => !row.passed)) process.exitCode = 1;
