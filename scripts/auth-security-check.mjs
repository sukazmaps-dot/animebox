import fs from 'node:fs';

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

const login = read('app/login/page.tsx');
const register = read('app/register/page.tsx');
const modal = read('components/AuthModalProvider.tsx');
const route = read('app/api/auth/email/route.ts');
const profileRoute = read('app/api/profile/editor/route.ts');
const migration = read('supabase/migrations/20260924160000_auth_security_username_reservations_v1.sql');

const failures = [];

for (const [label, source] of [
  ['login page', login],
  ['register page', register],
  ['auth modal', modal],
]) {
  if (/\.auth\.(?:signUp|signInWithPassword)\s*\(/.test(source)) {
    failures.push(`${label} bypasses the AnimeBox email auth guard`);
  }
}

if (!route.includes('auth_email_login_ip') || !route.includes('auth_email_signup_ip')) {
  failures.push('email auth route is missing IP rate limits');
}
if (!route.includes('auth_email_login_identity') || !route.includes('auth_email_signup_identity')) {
  failures.push('email auth route is missing per-email rate limits');
}
if (!route.includes('usernamePolicyError')) {
  failures.push('email auth route is missing reserved username validation');
}
if (!profileRoute.includes('usernamePolicyError')) {
  failures.push('profile editor API is missing reserved username validation');
}
if (!migration.includes('profiles_username_policy') || !migration.includes('USERNAME_RESERVED')) {
  failures.push('database reserved username trigger is missing');
}

if (failures.length) {
  console.error('Auth security invariant failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log('Auth security invariants passed.');
