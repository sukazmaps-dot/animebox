import fs from 'node:fs';

const read = (path) =>
  fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

const showcase = read('components/profile/ProfileWidgetsShowcase.tsx');
const css = read('app/patch17-4-2-2-public-profile-grid.css');

const failures = [];

if (!showcase.includes("genres: 'Слепок вкуса'")) {
  failures.push('taste widget title is not using the new public copy');
}

if (
  !showcase.includes("item.key === 'watching' || item.key === 'activity'") ||
  !showcase.includes("item.key === 'ratings' || item.key === 'genres'")
) {
  failures.push('profile widgets are no longer split into activity/insight columns');
}

if (
  !showcase.includes('profile-widgets-layout__columns') ||
  !showcase.includes('data-column="activity"') ||
  !showcase.includes('data-column="insights"')
) {
  failures.push('semantic profile widget column wrappers are missing');
}

if (
  !css.includes('grid-template-columns: repeat(2, minmax(0, 1fr))') ||
  !css.includes(".profile-widget[data-widget='genres']")
) {
  failures.push('desktop two-column profile layout contract is missing');
}

if (
  !css.includes('#7c3aed') ||
  !css.includes('#6366f1') ||
  !css.includes('#a78bfa')
) {
  failures.push('taste snapshot gradient bars are missing');
}

if (
  !css.includes('text-shadow:') ||
  !css.includes('.profile-widget__watching-row:hover .profile-widget__arrow')
) {
  failures.push('rating glow or watching arrow interaction regressed');
}

if (
  !css.includes('@media (max-width: 900px)') ||
  !css.includes('grid-template-columns: 1fr')
) {
  failures.push('mobile/tablet profile widget collapse is missing');
}

if (failures.length) {
  console.error('[AnimeBox Profile Grid] Check failed:');
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log('[AnimeBox Profile Grid] semantic columns and visual balance passed.');
