import fs from 'node:fs';

const read = (path) =>
  fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

const component = read('components/AnimeRatingControl.tsx');
const css = read('app/patch17-4-2-ui-precision.css');
const route = read('app/api/community/rating/route.ts');

const failures = [];

if (!component.includes('Array.from({ length: 10 }')) {
  failures.push('rating UI no longer renders ten visible stars');
}

if (
  component.includes('Array.from({ length: 5 }') ||
  component.includes('star-half') ||
  component.includes('/ 2).toFixed')
) {
  failures.push('legacy five-star / half-star presentation remains');
}

if (
  !component.includes('Поставить ${score} из 10') ||
  !component.includes('Твоя оценка: <strong>{formatRatingScore(myScore)} / 10</strong>')
) {
  failures.push('10-point rating copy/ARIA contract is incomplete');
}

if (
  !route.includes('score < 1 || score > 10') ||
  !route.includes('Оценка должна быть от 1 до 10.')
) {
  failures.push('rating API no longer preserves the 1-10 data contract');
}

if (
  !css.includes('grid-template-columns: repeat(10, 34px)') ||
  !css.includes('@media (max-width: 680px)') ||
  !css.includes('repeat(10, minmax(22px, 1fr))')
) {
  failures.push('responsive ten-star layout contract is missing');
}

if (failures.length) {
  console.error('[AnimeBox Rating Scale] Check failed:');
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log('[AnimeBox Rating Scale] 10-star / 10-point invariants passed.');
