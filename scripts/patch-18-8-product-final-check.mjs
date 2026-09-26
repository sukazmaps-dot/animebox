import fs from 'node:fs';

const read = (path) =>
  fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

const migration = read('supabase/migrations/20260926211000_product_final_leaderboard_rewards_v1.sql');
const temporaryFramesMigration = read('supabase/migrations/20260926215500_temporary_leaderboard_frames_v2.sql');
const progressionFramesMigration = read('supabase/migrations/20260927001500_progression_frame_selection_v1.sql');
const premiumIdentityMigration = read('supabase/migrations/20260926221958_premium_profile_identity_v1.sql');
const premiumThemePresetsMigration = read('supabase/migrations/20260926223142_premium_profile_identity_theme_presets_v2.sql');
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
const lv10Static = read('public/brand/frames/milestone/free/lv10-forbidden-relic.svg');
const lv25Static = read('public/brand/frames/milestone/free/lv25-flame-arc.svg');
const lv50Static = read('public/brand/frames/milestone/free/lv50-crimson-sigil.svg');
const lv75Static = read('public/brand/frames/milestone/free/lv75-menacing-manga.svg');
const lv100Static = read('public/brand/frames/milestone/free/lv100-absolute-prestige.svg');
const lv10Premium = read('public/brand/frames/milestone/premium/lv10-forbidden-relic-premium.svg');
const lv25Premium = read('public/brand/frames/milestone/premium/lv25-flame-arc-premium.svg');
const lv50Premium = read('public/brand/frames/milestone/premium/lv50-crimson-sigil-premium.svg');
const lv75Premium = read('public/brand/frames/milestone/premium/lv75-menacing-manga-premium.svg');
const lv100Premium = read('public/brand/frames/milestone/premium/lv100-absolute-prestige-premium.svg');
const progression = read('lib/progression.ts');
const premiumStudioClient = read('components/premium/PremiumStudioClient.tsx');
const premiumStudioCore = read('lib/premium-studio.ts');
const premiumEditorApi = read('app/api/profile/editor/route.ts');
const premiumAtmosphere = read('components/premium/PremiumProfileAtmosphere.tsx');
const premiumIdentityCss = read('app/premium-profile-v14.css');
const premiumCropEditor = read('components/premium/PremiumMediaCropEditor.tsx');
const adaptivePalette = read('lib/adaptive-profile-theme-client.ts');
const publicProfilePage = read('app/profile/[id]/page.tsx');
const ownProfilePage = read('app/profile/page.tsx');
const legacyPremiumStudioApi = read('app/api/premium/studio/route.ts');
const rootLayout = read('app/layout.tsx');
const profileLayout = read('app/profile/layout.tsx');
const premiumUploadRoute = read('app/api/profile/media/upload-url/route.ts');
const premiumPublishServer = read('lib/profile-media-publish-server.ts');
const achievementsClient = read('components/AchievementsClient.tsx');
const adminCommunity = read('app/api/admin/community/route.ts');
const profilePreviewServer = read('lib/profile-preview-server.ts');
const profilePreview = read('components/profile/ProfilePreview.tsx');
const profilePreviewCss = read('components/profile/ProfilePreview.module.css');
const premiumStudioLivePreview = read('components/premium/PremiumStudioLivePreview.tsx');
const globalChat = read('components/chat/GlobalChatV11Client.tsx');
const watchPartyPanel = read('components/watch-party/WatchPartyPanel.tsx');
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

need('mini-profile Premium identity payload', profilePreviewServer, [
  'atmosphereEffect',
  'atmosphereIntensity',
  'motionMode',
  'entranceEffect',
  'nicknameEffect',
  'heroStyle',
  'surfaceStyle',
]);
need('mini-profile unified frame UI', profilePreview, [
  'ProfileFrameOverlay',
  'data.profileFrameKey',
  'avatarShellSeason',
]);

need('mini-profile Premium identity payload UI', profilePreview, [
  'PremiumProfileAtmosphere',
  'atmosphereEffect',
  'atmosphereIntensity',
  'motionMode',
  'entranceEffect',
  'nicknameEffect',
  'heroStyle',
  'surfaceStyle',
  'data-motion',
  'data-entrance',
  'data-hero',
  'data-surface',
  'styles.nickname',
]);

need('mini-profile Premium identity styles', profilePreviewCss, [
  'Patch 18.9.2 — Premium Identity inside shared mini-profile',
  '.atmosphere',
  "[data-effect='embers']",
  "[data-effect='sakura']",
  "[data-effect='stardust']",
  ".nickname[data-effect='shimmer']",
  "[data-entrance='bloom']",
  '.avatarShellSeason[data-premium=',
  '@media (prefers-reduced-motion: reduce)',
]);

need('global chat mini profiles', globalChat, [
  "import ProfilePreview from '@/components/profile/ProfilePreview'",
  '<ProfilePreview',
  'className={styles.avatarWrap}',
  'className={styles.username}',
  'className={styles.mention}',
]);

need('Watch Together shared mini profiles', watchPartyPanel, [
  "import ProfilePreview from '@/components/profile/ProfilePreview'",
  'className={styles.chatAvatar}',
  'className={styles.chatAuthorLink}',
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
  'MAX_LEVEL = 100',
  'milestone-lv10-forbidden-relic',
  'milestone-lv100-absolute-prestige',
  'MILESTONE_AVATAR_SCALE',
  "'milestone-lv10-forbidden-relic': 0.52",
  "'milestone-lv25-flame-arc': 0.54",
  "'milestone-lv50-crimson-sigil': 0.56",
  "'milestone-lv75-menacing-manga': 0.52",
  "'milestone-lv100-absolute-prestige': 0.56",
  'levelFrameAvatarScale',
]);

need('level frame renderer', profileFrameOverlay, [
  'ProfileFrameOverlay',
  'isSeasonFrameKey',
  'isLevelFrameKey',
  "data-premium",
]);

need('original milestone frame assets', profileFrameOverlay, [
  'STATIC_LEVEL_FRAME_ASSETS',
  'PREMIUM_LEVEL_FRAME_ASSETS',
  '/brand/frames/milestone/free/lv10-forbidden-relic.svg',
  '/brand/frames/milestone/premium/lv100-absolute-prestige-premium.svg',
  'levelFrameAsset',
]);

for (const [label, source] of [
  ['LVL 10 Forbidden Relic', lv10Static],
  ['LVL 25 Flame Arc', lv25Static],
  ['LVL 50 Crimson Sigil', lv50Static],
  ['LVL 75 Menacing Manga', lv75Static],
  ['LVL 100 Absolute Prestige', lv100Static],
]) {
  need(`milestone frame asset ${label}`, source, ['<svg', 'viewBox="0 0 512 512"']);
  if (source.includes('@keyframes')) {
    failures.push(`free milestone frame ${label} must stay static`);
  }
}

for (const [label, source] of [
  ['LVL 10 Forbidden Relic Premium', lv10Premium],
  ['LVL 25 Flame Arc Premium', lv25Premium],
  ['LVL 50 Crimson Sigil Premium', lv50Premium],
  ['LVL 75 Menacing Manga Premium', lv75Premium],
  ['LVL 100 Absolute Prestige Premium', lv100Premium],
]) {
  need(`premium milestone frame asset ${label}`, source, [
    '<svg',
    'viewBox="0 0 512 512"',
    '@keyframes',
    'prefers-reduced-motion',
  ]);
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

need('Premium avatar quality policy', premiumStudioClient, [
  'PREMIUM_AVATAR_RECOMMENDED_BYTES = 4 * 1024 * 1024',
  'MAX_AVATAR_BYTES = 8 * 1024 * 1024',
  'MIN_PREMIUM_AVATAR_DIMENSION = 256',
  'Premium-аватар должен быть не больше 8 МБ.',
  'Premium-аватар должен быть не меньше',
  'Animated WebP / GIF / WebP / PNG / JPG',
  'Тяжёлая анимация',
  'staticWebpFallback',
]);

need('Premium identity migration', premiumIdentityMigration, [
  'atmosphere_effect',
  'atmosphere_intensity',
  'motion_mode',
  'entrance_effect',
  'nickname_effect',
  'hero_style',
  'surface_style',
  "check (atmosphere_effect in ('none','aurora','embers','sakura','stardust'))",
  "check (motion_mode in ('off','soft','live'))",
]);

need('Premium identity theme presets migration', premiumThemePresetsMigration, [
  'premium_profile_settings_theme_check',
  "'crimson'",
  "'ocean'",
  "'gold'",
]);

need('Premium identity settings contract', premiumStudioCore, [
  'PREMIUM_ATMOSPHERE_EFFECTS',
  'PREMIUM_MOTION_MODES',
  'PREMIUM_ENTRANCE_EFFECTS',
  'PREMIUM_NICKNAME_EFFECTS',
  'PREMIUM_HERO_STYLES',
  'PREMIUM_SURFACE_STYLES',
  'atmosphereEffect',
  'atmosphereIntensity',
  'motionMode',
  'entranceEffect',
  'nicknameEffect',
  'heroStyle',
  'surfaceStyle',
  "'crimson'",
  "'ocean'",
  "'gold'",
  '--ab-premium-atmosphere-alpha',
  '--ab-premium-motion-duration-fast',
]);

need('Premium identity API persistence', premiumEditorApi, [
  'atmosphere_effect',
  'atmosphere_intensity',
  'motion_mode',
  'entrance_effect',
  'nickname_effect',
  'hero_style',
  'surface_style',
  'isPremiumAtmosphereEffect',
  'isPremiumMotionMode',
  'DEFAULT_PREMIUM_STUDIO_SETTINGS',
]);

need('Premium atmosphere renderer', premiumAtmosphere, [
  'PremiumProfileAtmosphere',
  "data-effect={effect}",
  "data-motion={motion}",
  'premium-profile-v21__particles',
]);

need('Premium cinematic identity CSS', premiumIdentityCss, [
  '.premium-profile-v21__atmosphere',
  "[data-effect='aurora']",
  "[data-effect='embers']",
  "[data-effect='sakura']",
  "[data-effect='stardust']",
  "[data-premium-hero='cinematic']",
  "[data-premium-surface='glass']",
  ".premium-profile-v21__nickname[data-effect='shimmer']",
  "[data-premium-entrance='bloom']",
  '@media (prefers-reduced-motion: reduce)',
  '.profile-v2__avatar-wrap::before',
]);

need('Persistent Premium Studio preview', premiumIdentityCss, [
  'Patch 18.9.1 — persistent Premium Studio preview',
  '.profile-editor-v13 .premium-studio-v15__hero',
  'display: contents',
  '.profile-editor-v13 .premium-studio-v15__preview-wrap',
  'grid-row: 1 / span 3',
  '.profile-editor-v13 .premium-studio-v15__sticky',
  'position: sticky',
  'max-height: calc(100dvh - 116px)',
  '.profile-editor-v13 .premium-studio-v16__section-nav',
  '.profile-editor-v13 .premium-studio-v15__sections',
]);

need('Mobile Premium Studio preview workflow', premiumIdentityCss, [
  'Patch 18.9.2 — Mobile Premium Studio UX',
  '.premium-studio-v22__preview-fab',
  '.premium-studio-v22__preview-sheet-layer',
  '.premium-studio-v22__preview-sheet',
  'bottom: calc(env(safe-area-inset-bottom) + 82px)',
  '.premium-studio-v21__atmosphere-grid',
  'scroll-snap-type: x mandatory',
  '.premium-studio-v15__segmented',
  '@media (max-width: 767px)',
]);

need('Reusable Premium Studio live preview', premiumStudioLivePreview, [
  'PremiumStudioLivePreview',
  'PremiumProfileAtmosphere',
  'premium-studio-v21__preview',
  'premiumMediaStyle',
]);

need('Mobile Premium preview BottomSheet', premiumStudioClient, [
  'mobilePreviewOpen',
  'premium-studio-v22__preview-fab',
  'premium-studio-v22__preview-sheet-layer',
  '<PremiumStudioLivePreview',
  'createPortal',
  'Продолжить настройку',
]);

need('Premium Studio atmosphere controls', premiumStudioClient, [
  "studioSection === 'atmosphere'",
  'Автоподбор палитры',
  'Атмосфера профиля',
  'PREMIUM_ATMOSPHERE_EFFECTS.map',
  'PREMIUM_MOTION_MODES.map',
  'PREMIUM_NICKNAME_EFFECTS.map',
  'PREMIUM_ENTRANCE_EFFECTS.map',
  'PREMIUM_HERO_STYLES.map',
  'PREMIUM_SURFACE_STYLES.map',
  'Проиграть intro',
  'deriveAdaptiveProfilePalette',
  '<PremiumStudioLivePreview',
]);

need('Adaptive Premium palette', adaptivePalette, [
  'deriveAdaptiveProfilePalette',
  'createImageBitmap',
  'maxSample = 48',
  'resolveReadableTextColor',
]);

need('Live animated media crop', premiumCropEditor, [
  'premium-media-crop__live-image',
  'premiumMediaStyle(value)',
  'GIF и Animated WebP продолжают двигаться',
]);
if (premiumCropEditor.includes('<canvas')) {
  failures.push('Premium media crop preview regressed to canvas and can freeze GIF animation');
}

need('Public Premium identity rendering', publicProfilePage, [
  'PremiumProfileAtmosphere',
  'premiumIdentityActive',
  'premium-profile-v21',
  'data-premium-atmosphere',
  'data-premium-motion',
  'data-premium-entrance',
  'data-premium-hero',
  'data-premium-surface',
  'premium-profile-v21__nickname',
]);

need('Own Premium identity rendering', ownProfilePage, [
  'PremiumProfileAtmosphere',
  'premiumIdentityActive',
  'premium-profile-v21',
  'data-premium-atmosphere',
  'data-premium-motion',
  'data-premium-entrance',
  'data-premium-hero',
  'data-premium-surface',
  'premium-profile-v21__nickname',
]);

need('Legacy Premium read API identity columns', legacyPremiumStudioApi, [
  'atmosphere_effect',
  'atmosphere_intensity',
  'motion_mode',
  'entrance_effect',
  'nickname_effect',
  'hero_style',
  'surface_style',
]);

need('Premium identity stylesheet stays route-scoped', profileLayout, [
  "import '../premium-profile-v14.css';",
]);
if (rootLayout.includes("premium-profile-identity-v21.css")) {
  failures.push('Premium identity CSS must not consume an extra root layout import');
}

need('Premium avatar signed-upload limit', premiumUploadRoute, [
  "return kind === 'avatar' ? 8 * 1024 * 1024 : 6 * 1024 * 1024",
]);

need('Premium avatar publish validation', premiumPublishServer, [
  "return kind === 'avatar' ? 8 * 1024 * 1024 : 6 * 1024 * 1024",
  "minWidth: scope === 'premium' ? 256 : 1",
  "minHeight: scope === 'premium' ? 256 : 1",
  'Premium-аватар должен быть не меньше',
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
  '[AnimeBox 18.9 Premium Identity] Atmosphere Engine, cinematic profile identity, live animated crop, LVL/frame and retention invariants passed.',
);
