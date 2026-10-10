/* eslint-disable @typescript-eslint/no-require-imports -- Executable route harness with isolated dependencies. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
function compile(path, imports = {}) {
  const mod = { exports: {} };
  const code = ts.transpileModule(fs.readFileSync(path, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  new Function('require','exports','module',code)(name => { if (!(name in imports)) throw new Error(name); return imports[name]; },mod.exports,mod);
  return mod.exports;
}
const { diagnoseTelegramWebhook } = compile('lib/telegram/webhook-health.ts');
const token = '1234:SECRET_TOKEN'; const secret = 'WEBHOOK_SECRET';
const now = Date.now(); let calls = 0;
const fetchImpl = async (url, options) => { calls++; assert.ok(String(url).endsWith('/getWebhookInfo')); assert.equal(options.redirect, 'error');
  return Response.json({ ok: true, result: { url: 'https://youranimebox.com/api/telegram/webhook', pending_update_count: 0 } }); };
let owner = false, permitted = true, diagnosisCalls = 0;
class ApiError extends Error { constructor(status,message) { super(message); this.status = status; } }
const route = compile('app/api/admin/telegram/health/route.ts', {
  '@/lib/admin-server': { requireAdmin: async roles => { assert.deepEqual(roles,['owner']); if (!owner) throw new ApiError(403,'forbidden'); return { user: { id: 'verified-owner' } }; } },
  '@/lib/api-rate-limit': { consumeRateLimit: async key => { assert.equal(key,'telegram-health:verified-owner'); return permitted; } },
  '@/lib/community-server': { ApiError, failure: error => Response.json({ error: error.message }, { status: error.status }) },
  '@/lib/env/server': { optionalServerSecret: name => name === 'TELEGRAM_BOT_TOKEN' ? token : secret },
  '@/lib/telegram/webhook-health': { diagnoseTelegramWebhook: async args => { diagnosisCalls++; return diagnoseTelegramWebhook({ ...args, fetchImpl, now }); } },
});
(async () => {
  const ready = await diagnoseTelegramWebhook({token,secret,fetchImpl,now});
  assert.equal(ready.state,'ready'); assert.equal(ready.secretRegistrationVerified,false);
  assert.ok(!JSON.stringify(ready).includes(token) && !JSON.stringify(ready).includes(secret));
  calls=0; assert.equal((await diagnoseTelegramWebhook({ token:null,secret,fetchImpl,now })).state,'misconfigured'); assert.equal(calls,0);
  for (const [result,reason] of [
    [{url:'https://old.example/?secret='+token,pending_update_count:0},'webhook_url_mismatch'],
    [{url:'https://youranimebox.com/api/telegram/webhook',pending_update_count:0,last_error_date:Math.floor(now/1000),last_error_message:'403 '+token},'recent_delivery_error'],
    [{url:'https://youranimebox.com/api/telegram/webhook',pending_update_count:150},'update_backlog'],
  ]) {
    const health=await diagnoseTelegramWebhook({ token,secret,now,fetchImpl:async()=>Response.json({ok:true,result}) });
    assert.equal(health.reason,reason); assert.ok(!JSON.stringify(health).includes(token));
  }
  const historical = await diagnoseTelegramWebhook({token,secret,now,fetchImpl:async()=>Response.json({ok:true,result:{url:'https://youranimebox.com/api/telegram/webhook',pending_update_count:0,last_error_date:Math.floor(now/1000)-86400,last_error_message:'TLS error'}})});
  assert.equal(historical.state,'ready'); assert.equal(historical.lastErrorCategory,'tls_error');
  assert.equal((await diagnoseTelegramWebhook({token,secret,fetchImpl:async()=>{throw new Error(token);}})).state,'unavailable');
  assert.equal((await route.GET()).status,403); assert.equal(diagnosisCalls,0);
  owner=true; permitted=false; assert.equal((await route.GET()).status,429); assert.equal(diagnosisCalls,0);
  permitted=true; const response=await route.GET(); assert.equal(response.status,200); assert.equal(response.headers.get('cache-control'),'private, no-store');
  assert.equal(diagnosisCalls,1);
  const animeRows = [{ anime_id:12345,slug:'unique-journey-12345',image_url:'https://s4.anilist.co/unique-12345.jpg?v=1&size=2',last_content_change_at:new Date(now).toISOString() }];
  const episodeRows = [{ anime_id:12345,episode_number:12,slug:'unique-journey-12345',thumbnail_url:'https://s4.anilist.co/unique-12345.jpg',last_content_change_at:new Date(now).toISOString() }];
  const sitemap=compile('app/sitemap-recent.xml/route.ts', {
    '@/lib/supabase/admin': { createSupabaseAdmin: () => ({ from: table => { const builder={ select:()=>builder,eq:()=>builder,gte:()=>builder,order:()=>builder,limit:async()=>({data:table==='seo_anime_index'?animeRows:episodeRows,error:null})};return builder;} }) },
    '@/lib/seo-config': { SITE_URL:'https://youranimebox.com' },
    '@/lib/copyright-seo-server': { copyrightEpisodeKey:(id,ep)=>`${id}:${ep}`,getCopyrightRestrictedEpisodeKeys:async()=>new Set() },
  });
  const xml = await (await sitemap.GET()).text();
  assert.ok(xml.includes('<loc>https://youranimebox.com/anime/unique-journey-12345</loc>'));
  assert.ok(xml.includes('<loc>https://youranimebox.com/anime/unique-journey-12345/episode/12</loc>'));
  assert.ok(xml.includes('https://s4.anilist.co/unique-12345.jpg?v=1&amp;size=2'));
  for (const match of xml.matchAll(/<(?:image:)?loc>(.*?)<\/(?:image:)?loc>/g)) assert.equal(new URL(match[1].replaceAll('&amp;','&')).protocol,'https:');
  console.log('Owner Telegram diagnostics: authorization, rate limits, secret redaction and states passed; recent sitemap preserves schemes, letters, digits and XML escaping.');
})().catch(error=>{console.error(error);process.exitCode=1;});
