// Pinned to @opennextjs/cloudflare 1.20.8: its final bundler currently targets
// server-functions/default. Apply that exact bundler to each traced group.
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { readFileSync } from 'node:fs';
import { groups } from '../cloudflare/route-groups.mjs';
const require = createRequire(import.meta.url);
const adapterDist = resolve(dirname(require.resolve('@opennextjs/cloudflare')), '..');
const version = JSON.parse(readFileSync(resolve(adapterDist, '../package.json'), 'utf8')).version;
if (version !== '1.20.8') throw new Error('Revalidate the split bundler before changing adapter version');
const { compileConfig, getNormalizedOptions } = await import(pathToFileURL(resolve(adapterDist, 'cli/commands/utils/utils.js')));
const { bundleServer } = await import(pathToFileURL(resolve(adapterDist, 'cli/build/bundle-server.js')));
const { config, buildDir } = await compileConfig('open-next.config.ts');
const options = getNormalizedOptions(config, buildDir);
for (const { name } of groups) {
  await bundleServer({ ...options, splitFunctionName: name }, { minify: true });
}
console.log('All server groups bundled for workerd');
