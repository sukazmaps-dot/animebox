import fs from 'node:fs';

const read = (path) =>
  fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

const leaderboard = read('components/LeaderboardClient.tsx');
const leaderboardCss = read('components/Leaderboard.module.css');
const editor = read('components/profile/ProfileEditorClient.tsx');
const editorCss = read('app/profile-editor-v13.css');
const directEditor = read('components/profile/ProfileDirectEditSurface.tsx');
const directEditorCss = read('components/profile/ProfileDirectEditSurface.module.css');

const failures = [];

if (leaderboard.includes('styles.rankGhost')) {
  failures.push('podium giant background rank number returned');
}

if (leaderboard.includes('styles.rankTitle')) {
  failures.push('duplicated podium rank title returned');
}

if (
  !leaderboardCss.includes(
    'grid-template-columns: 44px minmax(0, 1fr) 96px 122px 32px !important',
  )
) {
  failures.push('leaderboard desktop row grid is no longer fixed');
}

if (
  !leaderboard.includes('className={styles.cardProfileAction}') ||
  !leaderboardCss.includes('.cardProfileAction,')
) {
  failures.push('podium profile action lost the shared secondary-button treatment');
}

if (
  !editor.includes('<ProfileDirectEditSurface') ||
  editor.includes("switchTab('appearance')")
) {
  failures.push('profile editor must use one direct Profile + Appearance surface');
}

if (
  !directEditor.includes('onOpenPremium') ||
  !directEditor.includes('Анимированный баннер и Premium-палитра') ||
  !directEditor.includes('Premium добавляет анимацию к уровневым рамкам')
) {
  failures.push('direct profile editor lost contextual Premium entry points');
}

if (
  !directEditor.includes('Изменить аватар') ||
  !directEditor.includes('Изменить баннер')
) {
  failures.push('profile media actions are no longer using concise direct-edit copy');
}

if (
  !editor.includes('profile-editor-v13__save-state') ||
  !editor.includes('✓</span> Изменения сохранены')
) {
  failures.push('clean profile editor state is no longer a passive save status');
}

if (
  !directEditor.includes('ПРОФИЛЬ') ||
  !directEditor.includes('КОЛЛЕКЦИЯ РАМОК') ||
  !directEditor.includes('Всё для профиля — в одном месте.')
) {
  failures.push('direct-edit guidance or frame inventory disappeared');
}

if (
  !directEditorCss.includes('.field input:focus') ||
  !directEditorCss.includes('.profileCard') ||
  !directEditorCss.includes('.frameRule') ||
  !editorCss.includes('.profile-editor-v19__direct-tab')
) {
  failures.push('direct profile editor precision/focus/layout styles are incomplete');
}

if (failures.length) {
  console.error('[AnimeBox Precision 17.4.2.1] Check failed:');
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log(
  '[AnimeBox Precision 17.4.2.1] leaderboard and profile editor invariants passed.',
);
