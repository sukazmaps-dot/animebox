import fs from 'node:fs';
import ts from 'typescript';

const read = (path) =>
  fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

const failures = [];
const policy = read('lib/auth-identity-policy.ts');
const migration = read(
  'supabase/migrations/20260928174000_patch21_username_safety_v1.sql',
);
const profileModal = read('components/ProfileEditModal.tsx');
const profileEditor = read('app/api/profile/editor/route.ts');
const onboarding = read('app/onboarding/page.tsx');
const telegramWeb = read('app/api/auth/telegram/route.ts');
const telegramMini = read('app/api/telegram/register/route.ts');
const leaderboard = read('app/api/community/leaderboard/route.ts');
const hall = read('app/api/community/hall-of-fame/route.ts');

for (const [label, source, needle] of [
  ['client profanity predicate', policy, 'isProhibitedUsername'],
  ['separator/confusable normalization', policy, 'usernameModerationKey'],
  ['generated account fallback', policy, 'generatedUsernameOrFallback'],
  ['public display fallback', policy, 'publicUsernameOrFallback'],
  ['database moderation function', migration, 'animebox_username_is_prohibited'],
  ['database rejection code', migration, 'USERNAME_PROHIBITED'],
  ['database profile cleanup', migration, 'update public.profiles'],
  ['archived leaderboard cleanup', migration, 'update public.leaderboard_season_entries'],
  ['legacy profile editor validation', profileModal, 'usernamePolicyError(cleanUsername)'],
  ['profile API moderation mapping', profileEditor, 'USERNAME_PROHIBITED'],
  ['onboarding moderation mapping', onboarding, 'USERNAME_PROHIBITED'],
  ['Telegram Web generated fallback', telegramWeb, 'generatedUsernameOrFallback'],
  ['Telegram Mini App generated fallback', telegramMini, 'generatedUsernameOrFallback'],
  ['live leaderboard output shield', leaderboard, 'publicUsernameOrFallback(row.username, row.user_id)'],
  ['hall-of-fame output shield', hall, 'publicUsernameOrFallback('],
]) {
  if (!source.includes(needle)) {
    failures.push(`${label}: missing ${needle}`);
  }
}

if (!failures.length) {
  try {
    const compiled = ts.transpileModule(policy, {
      compilerOptions: {
        module: ts.ModuleKind.ESNext,
        target: ts.ScriptTarget.ES2022,
      },
    }).outputText;

    const runtime = await import(
      `data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`,
    );

    const unsafeCases = [
      'Хуесос Педофайлов',
      'х у е с о с',
      'xуeсос',
      'пиздец',
      'блядь',
      'педофил228',
    ];

    for (const value of unsafeCases) {
      if (!runtime.isProhibitedUsername(value)) {
        failures.push(`unsafe username was accepted: ${value}`);
      }
      if (!runtime.usernamePolicyError(value)) {
        failures.push(`unsafe username has no validation error: ${value}`);
      }
    }

    const safeCases = [
      'ghoul cat',
      'Yui_Hirasawa',
      'Ху Тао',
      'AnimeFan_1905',
      'NokskiyTwice',
    ];

    for (const value of safeCases) {
      if (runtime.isProhibitedUsername(value)) {
        failures.push(`safe username was rejected: ${value}`);
      }
    }

    const generated = runtime.generatedUsernameOrFallback(
      'Хуесос Педофайлов',
      '123456789',
    );
    if (!generated.startsWith('AnimeFan_') || runtime.isProhibitedUsername(generated)) {
      failures.push(`unsafe generated username did not receive a safe fallback: ${generated}`);
    }

    const publicName = runtime.publicUsernameOrFallback(
      'Хуесос Педофайлов',
      '023e62497bbc49bc',
    );
    if (
      publicName === 'Хуесос Педофайлов' ||
      runtime.isProhibitedUsername(publicName)
    ) {
      failures.push('public display fallback leaked an unsafe username');
    }
  } catch (error) {
    failures.push(
      `username policy runtime matrix failed: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
}

if (failures.length) {
  console.error('[AnimeBox Patch 21] Username safety check failed:');
  for (const failure of failures) console.error(` - ${failure}`);
  process.exit(1);
}

console.log(
  '[AnimeBox Patch 21] Public username validation, DB enforcement and legacy cleanup passed.',
);
