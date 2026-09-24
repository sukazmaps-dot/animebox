import fs from 'node:fs';

const read = (path) =>
  fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

const leaderboard = read('components/LeaderboardClient.tsx');
const leaderboardCss = read('components/Leaderboard.module.css');
const editor = read('components/profile/ProfileEditorClient.tsx');
const editorCss = read('app/profile-editor-v13.css');

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

const openStyleCount = editor.match(/Открыть Стиль/g)?.length ?? 0;
if (openStyleCount !== 1) {
  failures.push(
    `profile editor must expose exactly one explicit "Открыть Стиль" CTA, got ${openStyleCount}`,
  );
}

if (
  editor.includes('Сменить и подогнать') ||
  editor.includes('Выбрать и кадрировать')
) {
  failures.push('profile media actions are no longer using the unified "Изменить" copy');
}

if (
  !editor.includes('profile-editor-v13__save-state') ||
  !editor.includes('✓</span> Изменения сохранены')
) {
  failures.push('clean profile editor state is no longer a passive save status');
}

if (
  !editor.includes('profile-editor-v13__inline-hint') ||
  editor.includes('profile-editor-v13__hint-card')
) {
  failures.push('profile editor hint reverted to a heavy standalone card');
}

if (
  !editor.includes('profile-editor-v13__media-meta') ||
  !editorCss.includes('.profile-editor-v13__field:focus-within > span small') ||
  !editorCss.includes('.profile-editor-v13__preview-note')
) {
  failures.push('profile editor precision metadata/focus/preview styles are incomplete');
}

if (failures.length) {
  console.error('[AnimeBox Precision 17.4.2.1] Check failed:');
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log(
  '[AnimeBox Precision 17.4.2.1] leaderboard and profile editor invariants passed.',
);
