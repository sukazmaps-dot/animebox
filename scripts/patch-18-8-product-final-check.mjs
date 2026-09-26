import fs from 'node:fs';

const read = (path) =>
  fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

const migration = read('supabase/migrations/20260926211000_product_final_leaderboard_rewards_v1.sql');
const temporaryFramesMigration = read('supabase/migrations/20260926215500_temporary_leaderboard_frames_v2.sql');
const progressionFramesMigration = read('supabase/migrations/20260927001500_progression_frame_selection_v1.sql');
const rewards = read('lib/leaderboard-rewards.ts');
const rewardServer = read('lib/leaderboard-rewards-server.ts');
const seasons = read('lib/leaderboard-seasons-server.ts');
const rewardApi = read('app/api/community/leaderboard-rewards/route.ts');
const leaderboardApi = read('app/api/community/leaderboard/route.ts');
const leaderboard = read('components/LeaderboardClient.tsx');
const leaderboardCss = read('components/Leaderboard.module.css');
const claimModal = read('components/leaderboard/SeasonRewardClaimModal.tsx');
const frame = read('components/leaderboard/SeasonFramePreview.tsx');
const frameCss = read('components/leaderboard/SeasonFramePreview.module.css');
const championFrame = read('public/brand/frames/league/league-champion-animated.svg');
const eliteFrame = read('public/brand/frames/league/league-elite.svg');
const podiumFrame = read('public/brand/frames/league/league-podium.svg');
const top10Frame = read('public/brand/frames/league/league-top10.svg');
const deferred = read('components/DeferredAppEnhancements.tsx');
const editor = read('components/profile/ProfileEditorClient.tsx');
const directEditor = read('components/profile/ProfileDirectEditSurface.tsx');
const directEditorCss = read('components/profile/ProfileDirectEditSurface.module.css');
const editorCss = read('app/profile-editor-v13.css');
const icon = read('components/Icon.tsx');
const rewardsPanel = read('components/profile/ProfileRewardsPanel.tsx');
const publicProfile = read('lib/public-profile-server.ts');
const avatarFrame = read('components/profile/UserAvatarWithFrame.tsx');
const profileFrameOverlay = read('components/profile/ProfileFrameOverlay.tsx');
const levelViewerStatic = read('public/brand/frames/level/static/viewer.svg');
const levelExplorerStatic = read('public/brand/frames/level/static/explorer.svg');
const levelMarathonerStatic = read('public/brand/frames/level/static/marathoner.svg');
const levelCollectorStatic = read('public/brand/frames/level/static/collector.svg');
const levelVeteranStatic = read('public/brand/frames/level/static/veteran.svg');
const levelLegendStatic = read('public/brand/frames/level/static/legend.svg');
const levelMasterStatic = read('public/brand/frames/level/static/master.svg');
const levelViewerPremium = read('public/brand/frames/level/premium/viewer-animated.svg');
const levelExplorerPremium = read('public/brand/frames/level/premium/explorer-animated.svg');
const levelMarathonerPremium = read('public/brand/frames/level/premium/marathoner-animated.svg');
const levelCollectorPremium = read('public/brand/frames/level/premium/collector-animated.svg');
const levelVeteranPremium = read('public/brand/frames/level/premium/veteran-animated.svg');
const levelLegendPremium = read('public/brand/frames/level/premium/legend-animated.svg');
const levelMasterPremium = read('public/brand/frames/level/premium/master-animated.svg');
const progression = read('lib/progression.ts');
const achievementsClient = read('components/AchievementsClient.tsx');
const adminCommunity = read('app/api/admin/community/route.ts');
const profilePreviewServer = read('lib/profile-preview-server.ts');
const profilePreview = read('components/profile/ProfilePreview.tsx');
const profilePreviewCss = read('components/profile/ProfilePreview.module.css');
const trackerRoute = read('app/api/community/tracker/route.ts');
const trackerClient = read('lib/tracker-client.ts');
const vercel = JSON.parse(read('vercel.json'));
const pkg = JSON.parse(read('package.json'));
const trackerLayout = read('app/list/layout.tsx');
const trackerCompactCss = read('app/tracker-library-compact.css');

const failures = [];

need('tracker compact route scope', trackerLayout, [
  "import '../community.css'",
  "import '../tracker-library-compact.css'",
]);
need('tracker compact visual containment', trackerCompactCss, [
  '.tracker-card__controls .episode-library-compact',
  '.tracker-card__controls .episode-library-compact__status-icon img',
  '.tracker-card__controls .episode-library-compact__chevron',
  '.tracker-card__controls .episode-library-compact__menu',
  'position: absolute',
  'width: 16px',
  'overflow: visible !important',
  '.tracker-card:focus-within',
  'z-index: 40',
  'z-index: 160',
]);


function need(label, source, needles) {
  for (const needle of needles) {
    if (!source.includes(needle)) failures.push(`${label} missing: ${needle}`);
  }
}

need('reward migration', migration, [
  'create table if not exists public.leaderboard_season_rewards',
  'unique (season_id, user_id)',
  'create table if not exists public.profile_cosmetic_unlocks',
  'create table if not exists public.profile_cosmetic_preferences',
  'create or replace function public.claim_leaderboard_reward',
  'for update',
  "reward_row.status = 'claimed'",
  'premium_ends_at := base_ends_at + make_interval',
  'on conflict (user_id, cosmetic_key) do nothing',
  "grant execute on function public.claim_leaderboard_reward(uuid) to authenticated",
]);


if (migration.includes("'leaderboard_reward:'") || temporaryFramesMigration.includes("'leaderboard_reward:'")) {
  failures.push('leaderboard reward Premium must not forge payment transaction ids');
}

need('temporary frame migration', temporaryFramesMigration, [
  'add column if not exists expires_at timestamptz',
  "when 'month' then interval '30 days'",
  "else interval '7 days'",
  'frame_expires_at := now_ts + make_interval(days => frame_days)',
  'on conflict (user_id, cosmetic_key) do update',
  'profile_cosmetic_unlocks.expires_at',
]);
need('reward tiers', rewards, [
  'WEEKLY_REWARD_TIERS',
  'MONTHLY_REWARD_TIERS',
  'frameDays: 7',
  'frameDays: 30',
  "premiumDays: 7",
  "premiumDays: 3",
  "premiumDays: 1",
  "'league-champion'",
  "'league-elite'",
  "'league-podium'",
  "'league-top10'",
  'currentLeaderboardWeekUtc',
  'currentLeaderboardMonthUtc',
  "return 'Рамка чемпиона'",
]);

need('reward materialization', rewardServer, [
  'materializeLeaderboardSeasonRewards',
  ".lte('place', 10)",
  "status: 'pending'",
  "onConflict: 'season_id,user_id'",
  'listActiveSeasonFrameUnlocks',
  ".gt('expires_at', now)",
  'getSelectedSeasonFrame',
  'selectSeasonFrame',
  'sendTelegramMessage',
  'buttonText: \'Забрать приз\'',
]);

need('season finalization', seasons, [
  'materializeLeaderboardSeasonRewards',
  "period.periodType === 'week' || period.periodType === 'month'",
]);

need('reward API', rewardApi, [
  "action === 'claim'",
  "'claim_leaderboard_reward'",
  'reconcilePremiumForUser',
  "action === 'select_frame'",
  'SEASON_FRAME_LOCKED',
  "scope: 'leaderboard_rewards_user'",
]);

need('leaderboard season payload', leaderboardApi, [
  'currentLeaderboardWeekUtc',
  'currentLeaderboardMonthUtc',
  'WEEKLY_REWARD_TIERS',
  'MONTHLY_REWARD_TIERS',
  'getSelectedSeasonFrames',
  'seasonFrameKey',
]);

need('leaderboard retention UI', leaderboard, [
  "period === 'month' ? 'МЕСЯЦ' : 'НЕДЕЛЯ'",
  'ДО КОНЦА СЕЗОНА',
  'До Топ-10:',
  'Текущая награда:',
  '<SeasonFrameOverlay',
]);

need('leaderboard reward styles', leaderboardCss, [
  '.seasonPanel',
  '.seasonCountdown',
  '.rewardTiers',
  '.seasonMe',
]);

need('claim modal', claimModal, [
  "reward.periodType === 'month' ? 'МЕСЯЦ' : 'НЕДЕЛЯ'",
  'Рамка временная',
  'Забрать приз',
  'Награда получена',
  'animebox:leaderboard-reward-claimed',
]);

need('SVG frame assets', frame, [
  'FRAME_ASSET_BY_KEY',
  '/brand/frames/league/league-champion-animated.svg',
  '/brand/frames/league/league-elite.svg',
  '/brand/frames/league/league-podium.svg',
  '/brand/frames/league/league-top10.svg',
  'SeasonFrameOverlay',
  'data-season-frame',
]);
need('frame asset layout', frameCss, [
  '.frameAsset',
  '--league-frame-avatar-size',
  "league-champion",
  "league-elite",
  "league-podium",
  "league-top10",
  '@media (prefers-reduced-motion:reduce)',
]);

for (const [label, source] of [
  ['Champion SVG', championFrame],
  ['Elite SVG', eliteFrame],
  ['Podium SVG', podiumFrame],
  ['Top 10 SVG', top10Frame],
]) {
  need(label, source, [
    '<svg',
    'viewBox="0 0 512 512"',
  ]);
}

need('Champion manga-energy animation', championFrame, [
  'glyphFloat1',
  'glyphFloat2',
  'glyphFloat3',
  'ringShine',
  '@media (prefers-reduced-motion: reduce)',
]);

if (frame.includes('seasonMark') || frame.includes('>S<')) {
  failures.push('season frame still renders the obsolete S marker');
}

need('deferred result modal', deferred, [
  'SeasonRewardClaimModal',
  'LEADERBOARD_REWARD_DELAY_MS',
]);

need('Profile Studio direct edit', editor, [
  "type EditorTab = 'profile' | 'showcase' | 'rewards' | 'style'",
  'PROFILE STUDIO',
  '<ProfileDirectEditSurface',
  '<ProfileRewardsPanel',
  'profile-editor-v19__direct-tab',
  'profile-editor-v18__savebar',
  'Есть несохранённые изменения',
]);

need('Profile Studio direct-edit surface', directEditor, [
  'DIRECT EDIT',
  'FRAME INVENTORY',
  'Твои рамки',
  'Активна только одна рамка',
  'Premium оживляет LVL-рамки',
  "action: 'select_frame'",
  '<ProfileFrameOverlay',
]);

need('Profile Studio mobile inspector', directEditorCss, [
  '.workspace',
  '.inspector',
  '@media (max-width: 620px)',
  'position: sticky',
  '58dvh',
]);


need('Profile Studio icon contract', icon, [
  "'image'",
  "'grid'",
  'ImageIcon',
  'SquaresFourIcon',
  'const Glyph = icons[name] ?? InfoIcon',
]);

if (!editor.includes('<Icon name="grid"')) {
  failures.push('Profile Studio missing expected grid navigation icon');
}
if (!directEditor.includes('<Icon name="image"')) {
  failures.push('Profile Studio direct editor missing image controls');
}

need('Profile Studio responsive CSS', editorCss, [
  'Patch 18.8 — Profile Studio 2.0',
  '.profile-editor-v18__rail',
  '.profile-editor-v18__savebar',
  '.profile-editor-v19__direct-tab',
  '@media (max-width: 560px)',
]);

need('profile rewards panel', rewardsPanel, [
  'Награды AnimeBox League',
  'Забрать приз',
  'Рамки League в инвентаре',
  'Открыть Frame Inventory',
  'Прошлые сезоны',
]);

if (rewardsPanel.includes("action: 'select_frame'")) {
  failures.push('profile rewards panel must not duplicate frame selection UI');
}

need('public profile frame', publicProfile, [
  'getSelectedProfileFrame',
  'profileFrameKey',
]);


need('mini-profile unified frame', profilePreviewServer, [
  'getSelectedProfileFrame',
  'profileFrameKey',
]);
need('mini-profile unified frame UI', profilePreview, [
  'ProfileFrameOverlay',
  'data.profileFrameKey',
  'avatarShellSeason',
]);
need('mini-profile seasonal frame layout', profilePreviewCss, [
  '.avatarShellSeason',
  'position: relative;',
  'isolation: isolate;',
  '.seasonFrameOverlay',
]);


need('tracker canonical identity', trackerRoute, [
  "anime_catalog!inner(title,slug)",
  'seenAnimeIds',
  'disambiguateDuplicateTitles',
  'trackerQualifierFromSlug',
  'Стадии ',
  'Стадия ',
  'Сезон ',
  'Часть ',
]);

need('tracker cache ambiguity shield', trackerClient, [
  "animebox:tracker:v4:",
  'hasDuplicateVisibleTitles',
  'invalidateTrackerSnapshot(userId)',
  'let /api/community/tracker resolve their stage/season qualifiers instead',
]);

need('avatar frame composition', avatarFrame, [
  'ProfileFrameOverlay',
  'profileFrameKey',
  'hasProfileFrame',
  'visibleIdentityFrameSrc',
  "hasProfileFrame ? null : frameSrc",
]);

need('exclusive frame migration', progressionFramesMigration, [
  'admin_adjustment_xp',
  'active_frame_key',
  'set active_frame_key = season_frame_key',
]);

need('level milestone system', progression, [
  'LEVEL_MILESTONES',
  'LEVEL_FRAME_KEYS',
  'unlockedLevelFrames',
  'xpForLevel',
  'AnimeBox Master',
]);

need('level frame renderer', profileFrameOverlay, [
  'ProfileFrameOverlay',
  'isSeasonFrameKey',
  'isLevelFrameKey',
  "data-premium",
]);

need('native level frame assets', profileFrameOverlay, [
  'STATIC_LEVEL_FRAME_ASSETS',
  'PREMIUM_LEVEL_FRAME_ASSETS',
  '/brand/frames/level/static/viewer.svg',
  '/brand/frames/level/premium/master-animated.svg',
  'levelFrameAsset',
]);

for (const [label, source] of [
  ['viewer static', levelViewerStatic],
  ['explorer static', levelExplorerStatic],
  ['marathoner static', levelMarathonerStatic],
  ['collector static', levelCollectorStatic],
  ['veteran static', levelVeteranStatic],
  ['legend static', levelLegendStatic],
  ['master static', levelMasterStatic],
]) {
  need(`level frame asset ${label}`, source, ['<svg', 'viewBox="0 0 120 120"', 'class="ring outer"']);
}

for (const [label, source] of [
  ['viewer premium', levelViewerPremium],
  ['explorer premium', levelExplorerPremium],
  ['marathoner premium', levelMarathonerPremium],
  ['collector premium', levelCollectorPremium],
  ['veteran premium', levelVeteranPremium],
  ['legend premium', levelLegendPremium],
  ['master premium', levelMasterPremium],
]) {
  need(`premium level frame asset ${label}`, source, ['<svg', '@keyframes', 'prefers-reduced-motion']);
}

if (profileFrameOverlay.includes('<circle className={styles.outer}')) {
  failures.push('level frames regressed to the obsolete universal inline SVG');
}

need('level system UI', achievementsClient, [
  'Как работает LVL',
  'Обычный аккаунт',
  'Та же рамка, но живая',
  'Снять текущую рамку',
  'На аватаре всегда только одна косметическая рамка',
]);

need('admin LVL control', adminCommunity, [
  "action === 'set_user_level'",
  'admin_adjustment_xp',
  'progression_level_set',
  'xpForLevel(level)',
]);

if (
  !vercel.crons?.some(
    (item) =>
      item.path === '/api/cron/leaderboard-seasons' &&
      item.schedule === '8 0 * * 1',
  )
) {
  failures.push('weekly leaderboard season cron is missing');
}

if (
  pkg.scripts?.['patch18-8:check'] !==
  'node scripts/patch-18-8-product-final-check.mjs'
) {
  failures.push('package.json missing patch18-8:check');
}

if (!String(pkg.scripts?.prebuild ?? '').includes('npm run patch18-8:check')) {
  failures.push('prebuild does not execute patch18-8:check');
}

if (failures.length) {
  console.error('\n[AnimeBox 18.8 Product Final] Check failed:\n');
  failures.forEach((failure) => console.error(` - ${failure}`));
  console.error('');
  process.exit(1);
}

console.log(
  '[AnimeBox 18.8 Product Final] Profile Studio 2.0, LVL clarity, exclusive Level/League frames, weekly/monthly rewards and retention UI invariants passed.',
);
