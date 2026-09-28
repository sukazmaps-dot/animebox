import fs from 'node:fs';

function read(path) {
  return fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
}

function mustInclude(text, needle, label) {
  if (!text.includes(needle)) {
    throw new Error(`[Patch 20.2] Missing ${label}: ${needle}`);
  }
}

function mustNotInclude(text, needle, label) {
  if (text.includes(needle)) {
    throw new Error(`[Patch 20.2] Forbidden legacy claim in ${label}: ${needle}`);
  }
}

const entitlements = read('lib/payments/entitlements.ts');
for (const key of [
  'profileScene',
  'animatedAvatar',
  'animatedBanner',
  'extraShowcases',
  'profileLayouts',
  'advancedStats',
  'extendedHistory',
  'watchPartyThemes',
  'watchPartyReactions',
  'earlyAccess',
]) {
  mustInclude(entitlements, `'${key}'`, 'Premium entitlement contract');
}

const premiumServer = read('lib/premium-server.ts');
mustInclude(
  premiumServer,
  'PREMIUM_FEATURE_ENTITLEMENTS',
  'central Premium entitlement grant',
);

const studio = read('lib/premium-studio.ts');
for (const scene of ['aurora', 'sakura', 'embers', 'stardust', 'midnight']) {
  mustInclude(studio, `'${scene}'`, 'Premium Scene presets');
}
mustInclude(studio, 'profileLayout', 'Profile Scene layout state');
mustInclude(studio, 'premiumSceneContextSettings', 'context intensity renderer');

const editorRoute = read('app/api/profile/editor/route.ts');
mustInclude(editorRoute, "'profile_layout'", 'Profile editor DB projection');
mustInclude(editorRoute, 'isPremiumProfileLayout', 'server-side layout validation');

const studioClient = read('components/premium/PremiumStudioClient.tsx');
mustInclude(studioClient, 'PREMIUM_SCENE_PRESETS', 'Studio Scene selector');
mustInclude(studioClient, "['profile', 'Профиль']", 'profile preview mode');
mustInclude(studioClient, "['mini', 'Мини']", 'mini-profile preview mode');
mustInclude(studioClient, "['comment', 'Комментарий']", 'comment preview mode');
mustInclude(studioClient, "['watch-party', 'Комната']", 'Watch Together preview mode');

const premiumPage = read('components/premium/PremiumClient.tsx');
mustInclude(premiumPage, 'Profile Scene', 'Premium 2.0 landing positioning');
mustInclude(premiumPage, 'IDENTITY MODE', 'Premium 2.0 identity positioning');
mustNotInclude(premiumPage, '+20% XP', 'Premium landing');
mustNotInclude(premiumPage, 'Выделенные Full-HD', 'Premium landing');

const migration = read('supabase/migrations/20260928090000_patch20_2_premium_scene_v2.sql');
mustInclude(migration, 'profile_layout', 'Premium Scene schema');
mustInclude(migration, 'premium_cosmetics', 'cosmetic catalog schema');
mustInclude(migration, 'premium_profile_showcase_slots', 'showcase schema');
mustInclude(migration, 'enable row level security', 'Premium 2.0 RLS');
mustInclude(migration, 'advancedStats', 'existing Premium capability backfill');

const previewServer = read('lib/profile-preview-server.ts');
mustInclude(previewServer, "premiumSceneContextSettings(appearance.premiumStudio, 'mini')", 'mini-profile Scene scaling');
mustInclude(previewServer, 'profileLayout', 'mini-profile Scene layout');

const publicAvatar = read('lib/public-avatar-server.ts');
mustInclude(publicAvatar, 'profileScene', 'public Scene entitlement');
mustInclude(publicAvatar, 'animatedBanner', 'animated banner entitlement');
mustInclude(publicAvatar, 'profile_layout', 'public Scene layout projection');

const publicProfile = read('app/profile/[id]/page.tsx');
mustInclude(publicProfile, 'data-premium-layout', 'public Premium layout rendering');

const statsApi = read('app/api/premium/stats/route.ts');
mustInclude(statsApi, 'entitlements.advancedStats', 'server-side Advanced Stats entitlement');
mustInclude(statsApi, "getTrustedProgressionMetrics(user.id)", 'trusted Premium statistics');

const statsClient = read('components/premium/PremiumStatsClient.tsx');
mustInclude(statsClient, 'ADVANCED STATS', 'Advanced Stats product surface');
mustInclude(statsClient, 'ИСТОРИЯ+', 'Premium History+ surface');

console.log('Patch 20.2 Premium 2.0 contract checks passed.');
