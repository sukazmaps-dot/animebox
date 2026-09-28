import fs from 'node:fs';

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

const login = read('app/login/page.tsx');
const register = read('app/register/page.tsx');
const modal = read('components/AuthModalProvider.tsx');
const route = read('app/api/auth/email/route.ts');
const profileRoute = read('app/api/profile/editor/route.ts');
const migration = read('supabase/migrations/20260924155743_auth_security_username_reservations_v1.sql');
const moderationMigration = read('supabase/migrations/20260929003100_patch21_username_moderation_v1.sql');
const identityPolicy = read('lib/auth-identity-policy.ts');
const leaderboardRoute = read('app/api/community/leaderboard/route.ts');

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
if (
  !identityPolicy.includes('isProhibitedUsername') ||
  !identityPolicy.includes('publicUsernameOrFallback') ||
  !identityPolicy.includes('Ник содержит недопустимое слово')
) {
  failures.push('application username profanity policy is missing');
}
if (
  !moderationMigration.includes('animebox_username_is_prohibited') ||
  !moderationMigration.includes('USERNAME_PROHIBITED') ||
  !moderationMigration.includes('update public.profiles')
) {
  failures.push('database username profanity trigger / legacy cleanup is missing');
}
if (!leaderboardRoute.includes('publicUsernameOrFallback(row.username, row.user_id)')) {
  failures.push('leaderboard does not sanitize legacy public usernames');
}

if (failures.length) {
  console.error('Auth security invariant failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log('Auth security invariants passed.');
