/* eslint-disable @typescript-eslint/no-require-imports -- Node harness compiles route handlers with mocked dependencies. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
function compile(path, imports = {}) {
  const mod = { exports: {} };
  const code = ts.transpileModule(fs.readFileSync(path, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  new Function('require', 'exports', 'module', code)(name => {
    if (!(name in imports)) throw new Error(`Unexpected import: ${name}`);
    return imports[name];
  }, mod.exports, mod);
  return mod.exports;
}
const saved = { NODE_ENV: process.env.NODE_ENV, VERCEL_ENV: process.env.VERCEL_ENV };
const policy = compile('lib/browser-request-origin.ts');
const origin = compile('lib/auth-callback-origin.ts', {
  '@/lib/browser-request-origin': policy, '@/lib/seo-config': { SITE_URL: 'https://youranimebox.com' },
});
const delivery = compile('lib/media-delivery.ts');
const images = compile('lib/image-service.ts', { '@/lib/media-delivery': delivery });
const aniListPoster = 'https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/1.jpg';
const shikiPoster = 'https://shikimori.io/system/animes/original/1.jpg';
const shikiPreview = 'https://shikimori.io/system/animes/preview/1.jpg';
for (const sources of [[aniListPoster, shikiPoster], [shikiPoster, shikiPreview]]) {
  const chain = images.buildImageCandidateChain(sources, { preset: 'card' });
  assert.ok(chain.includes('/api/image?' + new URLSearchParams({ url: sources[1] })));
  assert.ok(!chain.includes(shikiPoster) && !chain.includes(shikiPreview), 'secondary Shikimori must also stay server-side');
}
let session = true, user = true, username = 'existing', exchanged = [], verified = [];
const client = { auth: {
  exchangeCodeForSession: async code => { exchanged.push(code); return { data: { session }, error: session ? null : { code: 'failed' } }; },
  verifyOtp: async args => { verified.push(args); return { data: { session }, error: null }; },
  getUser: async () => ({ data: { user: user ? { id: 'authenticated-user' } : null } }),
}, from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { username } }) }) }) }) };
const route = compile('app/auth/callback/route.ts', {
  'next/server': { NextResponse: { redirect: url => new Response(null, { status: 307, headers: { Location: url.href } }) } },
  '@/lib/browser-navigation': compile('lib/browser-navigation.ts'),
  '@/lib/auth-callback-origin': origin, '@/lib/supabase/server': { createClient: async () => client },
});
async function callback(query, expected, url = 'http://localhost:8080') {
  const result = await route.GET(new Request(`${url}/auth/callback?${query}`, { headers: {
    host: 'youranimebox.com', 'x-forwarded-host': 'evil.example', 'x-forwarded-proto': 'https',
  } }));
  assert.equal(result.status, 307);
  assert.equal(result.headers.get('location'), expected);
  assert.equal(result.headers.get('cache-control'), 'private, no-store');
  assert.equal(result.headers.get('cdn-cache-control'), 'no-store');
}
(async () => {
  const headerRules = await compile('next.config.ts').default.headers();
  const callbackRule = headerRules.find(rule => rule.source === '/auth/callback');
  assert.ok(headerRules.indexOf(callbackRule) > headerRules.findIndex(rule => rule.source === '/auth/:path*'));
  assert.equal(callbackRule.headers.find(header => header.key === 'Cache-Control').value, 'private, no-store');
  process.env.NODE_ENV = 'production'; delete process.env.VERCEL_ENV;
  await callback('code=pkce&next=%2Flist%3Fstatus%3Dwatching', 'https://youranimebox.com/list?status=watching');
  assert.deepEqual(exchanged, ['pkce']);
  await callback('code=pkce&next=%2F%2Fevil.example', 'https://youranimebox.com/profile');
  await callback('code=pkce&next=%2F%5Cevil.example', 'https://youranimebox.com/profile');
  username = null;
  await callback('code=pkce&next=%2Flist', 'https://youranimebox.com/onboarding?next=%2Flist');
  await callback('code=pkce&intent=recovery', 'https://youranimebox.com/auth/update-password');
  await callback('token_hash=otp&type=recovery', 'https://youranimebox.com/auth/update-password');
  assert.deepEqual(verified, [{ token_hash: 'otp', type: 'recovery' }]);
  await callback('', 'https://youranimebox.com/login?error=google-auth');
  await callback('intent=recovery', 'https://youranimebox.com/auth/update-password?error=invalid_recovery');
  const oldError = console.error; console.error = () => {};
  try { session = false; await callback('code=bad', 'https://youranimebox.com/login?error=google-auth');
    await callback('code=bad&intent=recovery', 'https://youranimebox.com/auth/update-password?error=invalid_recovery');
  } finally { session = true; console.error = oldError; }
  user = false; await callback('code=pkce', 'https://youranimebox.com/login?error=google-auth'); user = true;
  username = 'existing'; process.env.VERCEL_ENV = 'preview';
  await callback('code=pkce', 'https://preview.example/profile', 'https://preview.example');
  delete process.env.VERCEL_ENV; process.env.NODE_ENV = 'development';
  await callback('code=pkce', 'http://localhost:3000/profile', 'http://localhost:3000');
  console.log('Auth callback: Railway origin, forged headers, recovery, onboarding, failures, no-store and preview passed.');
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => {
  for (const [key, value] of Object.entries(saved)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});
