import { spawnSync } from 'node:child_process';
import { groups } from '../cloudflare/route-groups.mjs';
function wrangler(args) {
 const result = spawnSync(process.execPath,['node_modules/wrangler/bin/wrangler.js',...args],{stdio:'inherit',env:{...process.env,OPEN_NEXT_DEPLOY:'true'}});
 if(result.status !== 0) process.exit(result.status ?? 1);
}
if(process.argv.includes('--bootstrap')) {
 // Run once for a NEW test worker only: establishes the self-reference target.
 wrangler(['deploy','--config','cloudflare/bootstrap.json']);
} else if(process.argv.includes('--preview')) {
 wrangler(['dev','--config','wrangler.jsonc',...['default',...groups.map(g=>g.name)].flatMap(name=>['--config',`cloudflare/generated/wrangler-${name}.json`])]);
} else {
 const check = spawnSync(process.execPath,['scripts/cloudflare-size-check.mjs'],{stdio:'inherit'});
 if(check.status !== 0) process.exit(check.status ?? 1);
 const cache = spawnSync(process.execPath,['node_modules/@opennextjs/cloudflare/dist/cli/index.js','populateCache','remote','--config','wrangler.jsonc'],{stdio:'inherit',env:{...process.env,OPEN_NEXT_DEPLOY:'true'}});
 if(cache.status !== 0) process.exit(cache.status ?? 1);
 for(const name of ['default',...groups.map(g=>g.name)]) wrangler(['deploy','--config',`cloudflare/generated/wrangler-${name}.json`]);
 wrangler(['deploy','--config','wrangler.jsonc']);
}
