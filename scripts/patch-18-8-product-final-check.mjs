import fs from 'node:fs';

const read = (path) =>
  fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

const migration = read('supabase/migrations/20260926211000_product_final_leaderboard_rewards_v1.sql');
const temporaryFramesMigration = read('supabase/migrations/20260926215500_temporary_leaderboard_frames_v2.sql');
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
const editorCss = read('app/profile-editor-v13.css');
const icon = read('components/Icon.tsx');
const rewardsPanel = read('components/profile/ProfileRewardsPanel.tsx');
const publicProfile = read('lib/public-profile-server.ts');
const avatarFrame = read('components/profile/UserAvatarWithFrame.tsx');
const profilePreviewServer = read('lib/profile-preview-server.ts');
const profilePreview = read('components/profile/ProfilePreview.tsx');
const profilePreviewCss = read('components/profile/ProfilePreview.module.css');
const vercel = JSON.parse(read('vercel.json'));
const pkg = JSON.parse(read('package.json'));

const failures = [];

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

need('Profile Studio 2.0', editor, [
  "type EditorTab = 'profile' | 'appearance' | 'showcase' | 'rewards' | 'style'",
  'PROFILE STUDIO',
  '<ProfileRewardsPanel',
  'profile-editor-v18__savebar',
  'Есть несохранённые изменения',
]);


need('Profile Studio icon contract', icon, [
  "'image'",
  "'grid'",
  'ImageIcon',
  'SquaresFourIcon',
  'const Glyph = icons[name] ?? InfoIcon',
]);

for (const iconName of ['image', 'grid']) {
  if (!editor.includes(`<Icon name="${iconName}"`)) {
    failures.push(`Profile Studio missing expected ${iconName} navigation icon`);
  }
}

need('Profile Studio responsive CSS', editorCss, [
  'Patch 18.8 — Profile Studio 2.0',
  '.profile-editor-v18__rail',
  '.profile-editor-v18__savebar',
  '@media (max-width: 560px)',
]);

need('profile rewards panel', rewardsPanel, [
  'Награды и сезонные рамки',
  'Забрать приз',
  'Рамки League',
  'недельные действуют 7 дней, месячные — 30 дней',
  'Действует до',
  'Прошлые сезоны',
  "action: 'select_frame'",
]);

need('public profile frame', publicProfile, [
  'getSelectedSeasonFrame',
  'seasonFrameKey',
]);


need('mini-profile seasonal frame', profilePreviewServer, [
  'getSelectedSeasonFrame',
  'seasonFrameKey',
]);
need('mini-profile seasonal frame UI', profilePreview, [
  'SeasonFrameOverlay',
  'data.seasonFrameKey',
  'avatarShellSeason',
]);
need('mini-profile seasonal frame layout', profilePreviewCss, [
  '.avatarShellSeason',
  '.seasonFrameOverlay',
]);

need('avatar frame composition', avatarFrame, [
  'SeasonFrameOverlay',
  'seasonFrameKey',
  'hasSeasonFrame',
  'visibleIdentityFrameSrc',
  "hasSeasonFrame ? null : frameSrc",
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
  '[AnimeBox 18.8 Product Final] Profile Studio 2.0, weekly/monthly rewards, temporary SVG frames, idempotent claim and retention UI invariants passed.',
);
