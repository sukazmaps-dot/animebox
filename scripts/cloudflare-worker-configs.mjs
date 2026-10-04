import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { cronJobs } from '../cloudflare/cron.mjs';
import { groups, bindingFor } from '../cloudflare/route-groups.mjs';
const names = ['default', ...groups.map(group => group.name)];
mkdirSync('cloudflare/generated', { recursive: true });
const common = {
  '$schema': '../../node_modules/wrangler/config-schema.json',
  compatibility_date: '2026-08-27',
  compatibility_flags: ['nodejs_compat', 'global_fetch_strictly_public'],
  minify: true,
  vars: { ANIMEBOX_RUNTIME: 'cloudflare', ANIMEBOX_CRON_ENABLED: 'false' },
  r2_buckets: [{ binding: 'NEXT_INC_CACHE_R2_BUCKET', bucket_name: 'animebox-next-cache' }],
};
for (const name of names) {
  writeFileSync(`cloudflare/generated/${name}.mjs`, `import { runWithCloudflareRequestContext } from '../../.open-next/cloudflare/init.js';\nimport { handler } from '../../.open-next/server-functions/${name}/handler.mjs';\nexport default { async fetch(request, env, ctx) {\n  return runWithCloudflareRequestContext(request, env, ctx, () => handler(request, env, ctx, request.signal));\n}};\n`);
  writeFileSync(`cloudflare/generated/wrangler-${name}.json`, JSON.stringify({
    ...common, name: 'animebox-' + name.replaceAll('_', '-'), main: `${name}.mjs`, workers_dev: false,
    services: [{ binding: 'WORKER_SELF_REFERENCE', service: 'animebox' }],
  }, null, 2) + '\n');
}
const gateway = { ...common, '$schema': 'node_modules/wrangler/config-schema.json', name: 'animebox', main: 'cloudflare/gateway.mjs', workers_dev: true, triggers: { crons: Object.keys(cronJobs) },
  assets: { directory: '.open-next/assets', binding: 'ASSETS' },
  services: [{ binding: 'WORKER_SELF_REFERENCE', service: 'animebox' }, ...names.map(name => ({ binding: bindingFor(name), service: 'animebox-' + name.replaceAll('_', '-') }))],
};
writeFileSync('wrangler.jsonc', JSON.stringify(gateway, null, 2) + '\n');
console.log('Generated ' + names.length + ' server configurations and gateway');
