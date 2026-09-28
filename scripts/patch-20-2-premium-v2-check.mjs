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
mustInclude(premiumPage, 'Стиль профиля', 'Premium 2.0 landing positioning');
mustInclude(premiumPage, 'ТВОЙ СТИЛЬ', 'Premium 2.0 identity positioning');
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
mustInclude(statsClient, 'ANIMEBOX PREMIUM · СТАТИСТИКА', 'Advanced Stats product surface');
mustInclude(statsClient, 'ИСТОРИЯ+', 'Premium History+ surface');

const roomThemeContract = read('lib/watch-party-premium.ts');
for (const theme of ['midnight', 'aurora', 'sakura', 'embers', 'cinema']) {
  mustInclude(roomThemeContract, `'${theme}'`, 'Premium Watch Together themes');
}

const roomServer = read('lib/watch-party-rooms-server.ts');
mustInclude(roomServer, 'entitlements.watchPartyThemes', 'server-side room theme entitlement');
mustInclude(roomServer, 'room_theme: roomTheme', 'room theme persistence');

const watchHub = read('components/watch-party/WatchTogetherHub.tsx');
mustInclude(watchHub, 'premiumThemePicker', 'Watch Together Premium theme picker');
mustInclude(watchHub, 'roomTheme', 'Watch Together room theme state');

const watchPanel = read('components/watch-party/WatchPartyPanel.tsx');
mustInclude(watchPanel, 'readWatchPartyThemeFromLocation', 'room theme invite propagation');
mustInclude(watchPanel, 'data-room-theme={roomTheme}', 'room theme social chrome');

mustInclude(migration, 'room_theme', 'Watch Together theme schema');

const studioDemo = read('components/premium/PremiumStudioClient.tsx');
mustInclude(studioDemo, 'ПРЕДПРОСМОТР PREMIUM', 'free Premium Scene demo');
mustInclude(studioDemo, 'Сохранить с Premium', 'contextual Premium demo conversion');

const showcaseApi = read('app/api/community/profile-widgets/route.ts');
mustInclude(showcaseApi, 'extraShowcases', 'Premium Showcase entitlement');
mustInclude(showcaseApi, 'maxFavorites: extraShowcases ? 12 : 6', 'Premium Showcase capacity');

const widgetEditor = read('components/profile/ProfileWidgetEditor.tsx');
mustInclude(widgetEditor, 'maxFavorites', 'Premium Showcase editor capacity');

mustInclude(migration, 'v_max_favorites int := 6', 'database Showcase capacity guard');
mustInclude(migration, "e.entitlement = 'extraShowcases'", 'database Showcase entitlement guard');

const identityApi = read('app/api/watch-party/identities/route.ts');
mustInclude(identityApi, "entitlement', 'watchPartyReactions'", 'reaction entitlement lookup');
mustInclude(identityApi, 'watchPartyReactions: reactionUsers.has(profile.id)', 'reaction entitlement projection');

mustInclude(watchPanel, 'premiumReactionsAllowed', 'Premium reaction UI gate');
mustInclude(watchPanel, 'isPremiumWatchPartyReaction(reaction)', 'host reaction entitlement gate');

const statsContract = read('lib/premium-stats.ts');
mustInclude(statsContract, 'PremiumYearReview', 'Year in Review data contract');

const statsRoute = read('app/api/premium/stats/route.ts');
mustInclude(statsRoute, 'yearHistoryResult', 'Year in Review server history');
mustInclude(statsRoute, 'yearReview: {', 'Year in Review response');

const yearReview = read('components/premium/PremiumYearReviewClient.tsx');
mustInclude(yearReview, 'ИТОГИ ГОДА', 'Year in Review Premium surface');
mustInclude(yearReview, 'подтверждённая', 'Year in Review trusted-history copy');

const userIdentity = read('components/identity/UserIdentity.tsx');
mustInclude(userIdentity, 'premiumSubscriptionVisible', 'unified Premium identity mark');
mustInclude(userIdentity, 'AnimeBox Premium', 'Premium identity accessibility label');

const communityCommentTypes = read('types/community-comments.ts');
mustInclude(communityCommentTypes, 'premium: boolean', 'Premium comment identity contract');

const friendsServer = read('lib/friends-server.ts');
mustInclude(friendsServer, 'premium: appearance?.premiumBadge ?? false', 'Premium friends identity');

const leaderboardApi = read('app/api/community/leaderboard/route.ts');
mustInclude(leaderboardApi, 'premium: appearance?.premiumBadge ?? false', 'Premium leaderboard identity');

const productEventNames = read('lib/product-event-names.ts');
for (const eventName of [
  'premium_scene_saved',
  'premium_stats_view',
  'premium_year_review_view',
  'premium_showcase_saved',
  'premium_watch_party_theme_selected',
  'premium_reaction_used',
]) {
  mustInclude(productEventNames, `'${eventName}'`, 'Premium adoption telemetry');
}

const productAnalyticsServer = read('lib/product-analytics-server.ts');
mustInclude(productAnalyticsServer, 'summarizePremiumSurfaces', 'Premium adoption aggregation');
mustInclude(productAnalyticsServer, 'loadPremiumSurfaceRows', 'Premium adoption event loading');

const productAnalyticsDashboard = read('components/admin/ProductAnalyticsDashboard.tsx');
mustInclude(productAnalyticsDashboard, 'PREMIUM 2.0 · FEATURE ADOPTION', 'Premium adoption admin surface');

const avatarWithFrame = read('components/profile/UserAvatarWithFrame.tsx');
mustInclude(avatarWithFrame, 'h-[108px] w-[108px]', 'mobile framed avatar canvas');
mustInclude(avatarWithFrame, 'sm:h-[152px] sm:w-[152px]', 'desktop framed avatar canvas');

const directProfileCss = read('components/profile/ProfileDirectEditSurface.module.css');
mustInclude(directProfileCss, 'grid-template-columns: 152px minmax(0, 1fr)', 'desktop editor avatar column');
mustInclude(directProfileCss, 'width: 152px', 'desktop editor avatar size');
mustInclude(directProfileCss, 'grid-template-columns: 104px minmax(0, 1fr)', 'mobile editor avatar column');

const globalsCss = read('app/globals.css');
mustNotInclude(globalsCss, '.profile-v2__avatar-wrap\n.profile-avatar-editor__button', 'legacy descendant avatar selector');
mustInclude(globalsCss, '.profile-avatar-editor__button {', 'legacy avatar editor isolation');
mustInclude(globalsCss, 'margin-top: -76px', 'desktop profile avatar overlap');

console.log('Patch 20.2 Premium 2.0 contract checks passed.');
