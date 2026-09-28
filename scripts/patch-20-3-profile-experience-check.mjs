import fs from 'node:fs';

function read(path) {
  return fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
}

function mustInclude(text, needle, label) {
  if (!text.includes(needle)) {
    throw new Error(`[Patch 20.3] Missing ${label}: ${needle}`);
  }
}

function mustNotInclude(text, needle, label) {
  if (text.includes(needle)) {
    throw new Error(`[Patch 20.3] Forbidden ${label}: ${needle}`);
  }
}

const preview = read('components/profile/ProfilePreview.tsx');
mustInclude(preview, 'Профиль AnimeBox', 'localized mini-profile kicker');
mustInclude(preview, '{data.progression.level} уровень', 'localized progression label');
mustInclude(preview, 'width={88}', 'mini-profile intrinsic avatar size');
mustNotInclude(preview, '<span className={styles.premiumBadge}>Premium</span>', 'duplicate Premium badge');

const previewCss = read('components/profile/ProfilePreview.module.css');
mustInclude(previewCss, 'flex: 0 0 88px', 'desktop mini-profile avatar');
mustInclude(previewCss, 'flex-basis: 132px', 'framed mini-profile canvas');
mustInclude(previewCss, 'flex-basis: 118px', 'mobile framed mini-profile canvas');
mustNotInclude(previewCss, "avatarShellSeason[data-milestone-frame='true'] .avatarMedia", 'legacy milestone aperture shrink');
mustInclude(previewCss, "html[data-animebox-theme='light'] .card", 'mini-profile light theme');

const frameOverlayCss = read('components/profile/ProfileFrameOverlay.module.css');
mustInclude(frameOverlayCss, 'width: 88px !important', 'desktop milestone avatar parity');
mustInclude(frameOverlayCss, 'width: 80px !important', 'mobile milestone avatar parity');
mustInclude(frameOverlayCss, 'inset: -22px !important', 'desktop milestone frame overflow');
mustInclude(frameOverlayCss, 'inset: -19px !important', 'mobile milestone frame overflow');
mustNotInclude(frameOverlayCss, 'width: 64px !important', 'legacy desktop milestone shrink');
mustNotInclude(frameOverlayCss, 'width: 62px !important', 'legacy mobile milestone shrink');

mustInclude(previewCss, ".card[data-layout='cinema']", 'mini-profile cinema layout parity');
mustInclude(previewCss, ".card[data-layout='collector']", 'mini-profile collector layout parity');
mustInclude(previewCss, ".card[data-layout='minimal']", 'mini-profile minimal layout parity');
mustInclude(previewCss, '@media (prefers-reduced-motion: reduce)', 'mini-profile reduced motion');

const experienceCss = read('app/patch20-3-profile-experience.css');
mustInclude(experienceCss, '.profile-v2 .profile-v2__name-row', 'long username wrapping');
mustInclude(experienceCss, "@media (min-width: 1800px)", 'large-screen profile scaling');
mustInclude(experienceCss, "data-premium-layout='cinema'", 'cinema layout parity');
mustInclude(experienceCss, "data-premium-layout='collector'", 'collector layout parity');
mustInclude(experienceCss, "data-premium-layout='minimal'", 'minimal layout parity');
mustInclude(experienceCss, "html[data-animebox-theme='light'] .profile-v2__hero", 'profile light theme');
mustInclude(experienceCss, '@media (prefers-reduced-motion: reduce)', 'profile reduced motion');

const profileLayout = read('app/profile/layout.tsx');
mustInclude(profileLayout, "import '../patch20-3-profile-experience.css';", 'route-scoped Patch 20.3 CSS');

const premiumLayout = read('app/premium/layout.tsx');
mustInclude(premiumLayout, "import '../patch20-3-profile-experience.css';", 'Premium route Patch 20.3 CSS');
mustInclude(experienceCss, "html[data-animebox-theme='light'] .premium-stats-v2", 'Premium stats light theme');
mustInclude(experienceCss, "html[data-animebox-theme='light'] .premium-year-v2", 'Year review light theme');

const widgetEditor = read('components/profile/ProfileWidgetEditor.tsx');
mustInclude(widgetEditor, "data-density={selected.length > 6 ? 'extended' : 'normal'}", '12-slot Showcase density switch');
mustInclude(experienceCss, ".profile-widgets-editor__selected[data-density='extended']", '12-slot Showcase compact grid');

const showcase = read('components/profile/ProfileWidgetsShowcase.tsx');
mustInclude(showcase, 'АНИМЕ-ПРОФИЛЬ', 'localized showcase eyebrow');
mustInclude(showcase, 'Профиль вкуса ещё формируется', 'humanized taste empty state');
mustNotInclude(showcase, 'PROFILE IDENTITY', 'legacy English showcase label');
mustNotInclude(showcase, 'Anime DNA', 'legacy English taste label');

const directEditor = read('components/profile/ProfileDirectEditSurface.tsx');
mustInclude(directEditor, 'styles.nameValue', 'long username wrapper');
mustInclude(directEditor, 'styles.editGlyph', 'separate username edit affordance');

const directEditorCss = read('components/profile/ProfileDirectEditSurface.module.css');
mustInclude(directEditorCss, '.nameValue {', 'username overflow protection');
mustInclude(directEditorCss, '@media (min-width: 1800px)', 'large-screen editor scaling');
mustInclude(directEditorCss, ":global(html[data-animebox-theme='light']) .profileCard", 'editor light theme');
mustInclude(directEditorCss, '.nameButton:focus-visible', 'editor keyboard focus');

const avatarWithFrame = read('components/profile/UserAvatarWithFrame.tsx');
mustInclude(avatarWithFrame, 'preferStatic?: boolean', 'static avatar render contract');
mustInclude(avatarWithFrame, 'const displayedSrc = preferStatic && mobileSrc ? mobileSrc : src;', 'static avatar selection');

const ownProfile = read('app/profile/page.tsx');
mustInclude(ownProfile, 'Premium · Расширенная статистика', 'localized Premium stats CTA');
mustInclude(ownProfile, "preferStatic={premiumIdentityActive && appearance.premiumStudio?.motionMode === 'off'}", 'own profile motion-off avatar parity');

const publicProfile = read('app/profile/[id]/page.tsx');
mustInclude(publicProfile, "preferStatic={premiumIdentityActive && profile.premiumStudio?.motionMode === 'off'}", 'public profile motion-off avatar parity');

const studioClient = read('components/premium/PremiumStudioClient.tsx');
mustInclude(studioClient, "settings.motionMode === 'off'", 'Studio static media preview parity');
mustInclude(studioClient, 'previewUsername?: string', 'Studio live username contract');
mustInclude(studioClient, 'fallbackAvatarUrl?: string | null', 'Studio avatar fallback contract');
mustInclude(studioClient, 'fallbackBannerUrl?: string | null', 'Studio banner fallback contract');
mustInclude(studioClient, 'username={effectiveUsername}', 'Studio live identity preview');

const studioPreview = read('components/premium/PremiumStudioLivePreview.tsx');
mustInclude(studioPreview, "username = 'Твой профиль'", 'preview username fallback');
mustInclude(studioPreview, 'username?: string', 'preview username prop');
mustInclude(studioPreview, 'bio?: string', 'preview bio prop');
mustInclude(studioPreview, 'premium-studio-v23__preview-meta', 'real-profile preview metadata');
mustNotInclude(studioPreview, 'Продолжить просмотр', 'fake continue-watching preview block');
mustNotInclude(studioPreview, '29ч', 'fake profile stats in Studio hero');
mustInclude(studioPreview, 'ProfileFrameOverlay', 'Studio selected frame renderer');
mustInclude(studioPreview, 'profileFrameKey?: string | null', 'Studio frame preview contract');

mustInclude(studioClient, 'previewFrameKey', 'Studio selected frame state');
mustInclude(studioClient, "animebox:profile-cosmetic-changed", 'Studio frame live sync');
mustInclude(studioClient, 'profileFrameKey={previewFrameKey}', 'Studio selected frame preview');

mustInclude(experienceCss, '.premium-studio-v23__preview-avatar-frame-shell', 'Studio frame preview geometry');
mustInclude(experienceCss, 'inset: -18px !important', 'Studio frame outer canvas');

const editorClient = read('components/profile/ProfileEditorClient.tsx');
mustInclude(editorClient, 'previewUsername={username}', 'editor live username preview');
mustInclude(editorClient, 'previewBio={bio}', 'editor live bio preview');
mustInclude(editorClient, 'fallbackAvatarUrl={resolvedAvatarPreview}', 'editor avatar preview fallback');
mustInclude(editorClient, 'fallbackBannerUrl={resolvedBannerPreview}', 'editor banner preview fallback');

console.log('Patch 20.3 Profile Experience checks passed.');
