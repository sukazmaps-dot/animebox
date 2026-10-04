import { Miniflare, convertV4MiniflareOptions } from 'miniflare';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
import { parse } from 'dotenv';
import { groups } from '../cloudflare/route-groups.mjs';
const secrets = parse(readFileSync('.env.local'));
for (const name of Object.keys(secrets)) if (name.startsWith('VERCEL') || ['ANIMEBOX_DB_PATH','ANIMEBOX_EDGE_ORIGIN_SECRET'].includes(name)) delete secrets[name];
const names = ['gateway', 'default', ...groups.map(g => g.name)];
const workers = names.map(name => {
 const config = JSON.parse(readFileSync(name === 'gateway' ? 'wrangler.jsonc' : `cloudflare/generated/wrangler-${name}.json`));
 const directory = resolve('.cloudflare-bundles', name);
 const main = readdirSync(directory).find(file => file.endsWith('.js') || file.endsWith('.mjs'));
 return { name: config.name, modulesRoot:directory, modules:[{type:'ESModule',path:resolve(directory,main)},...readdirSync(directory).filter(f=>/\.(wasm|bin)$/.test(f)).map(f=>({path:resolve(directory,f),type:f.endsWith('.wasm')?'CompiledWasm':'Data'}))],
 compatibilityDate:config.compatibility_date,compatibilityFlags:config.compatibility_flags,
 bindings:{...secrets,...config.vars},serviceBindings:Object.fromEntries(config.services.map(s=>[s.binding,s.service])),
 r2Buckets:{NEXT_INC_CACHE_R2_BUCKET:'animebox-next-cache'},
 ...(name === 'gateway' ? {assets:{directory:resolve('.open-next/assets'),binding:'ASSETS'}} : {}) };
});
const mf = new Miniflare(convertV4MiniflareOptions({workers}));
try {
 const gateway = await mf.getWorker('animebox');
 for (const [path, expected] of [['/api/watch-party/health',200],['/login',200],['/api/admin/users',401],['/api/profile/editor',401],['/api/auth/email',405]]) {
  const response = await gateway.fetch('https://youranimebox.com'+path);
  const body = await response.text();
  console.log(path+': '+response.status+' ('+body.length+' characters)');
  assert.equal(response.status,expected);
  if(path === '/api/watch-party/health') { assert.equal(JSON.parse(body).ok,true); assert.ok(response.headers.get('cache-control')?.includes('no-store')); }
 }
 const denied = await gateway.fetch('https://youranimebox.com/api/profile/editor',{method:'POST',headers:{origin:'https://untrusted.example','content-type':'application/json'},body:'{}'});
 assert.equal(denied.status,403); await denied.text(); console.log('Untrusted mutation origin: 403');
} finally { await mf.dispose(); }
