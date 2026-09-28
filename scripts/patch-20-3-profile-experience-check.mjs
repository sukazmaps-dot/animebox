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
mustInclude(previewCss, "avatarShellSeason[data-milestone-frame='true']", 'milestone frame geometry');
mustInclude(previewCss, 'flex-basis: 118px', 'mobile framed mini-profile canvas');
mustInclude(previewCss, "html[data-animebox-theme='light'] .card", 'mini-profile light theme');
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

const ownProfile = read('app/profile/page.tsx');
mustInclude(ownProfile, 'Premium · Расширенная статистика', 'localized Premium stats CTA');

console.log('Patch 20.3 Profile Experience checks passed.');
