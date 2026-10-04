import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { parse } from 'dotenv';
import { groups } from '../cloudflare/route-groups.mjs';
const values = parse(readFileSync('.env.local'));
for(const key of Object.keys(values)) {
 if(key.startsWith('VERCEL') || key.startsWith('CLOUDFLARE') || key.startsWith('CF_') || ['ANIMEBOX_DB_PATH','ANIMEBOX_EDGE_ORIGIN_SECRET','ANIMEBOX_RUNTIME','ANIMEBOX_CRON_ENABLED','NODE_ENV'].includes(key)) delete values[key];
}
if(Object.keys(values).length === 0) throw new Error('No application variables found in .env.local');
for(const name of ['gateway','default',...groups.map(g=>g.name)]) {
 const config = name === 'gateway' ? 'wrangler.jsonc' : `cloudflare/generated/wrangler-${name}.json`;
 const result = spawnSync(process.execPath,['node_modules/wrangler/bin/wrangler.js','secret','bulk','--config',config],{input:JSON.stringify(values),stdio:['pipe','inherit','inherit']});
 if(result.status !== 0) process.exit(result.status ?? 1);
}
