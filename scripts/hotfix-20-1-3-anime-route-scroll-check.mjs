import fs from 'node:fs';

const layout = fs.readFileSync('app/anime/[slug]/layout.tsx', 'utf8');
const reset = fs.readFileSync('components/AnimeRouteScrollReset.tsx', 'utf8');

const failures = [];

if (
  !layout.includes("AnimeRouteScrollReset") ||
  !layout.includes("<AnimeRouteScrollReset />")
) {
  failures.push('anime title layout does not mount the route scroll reset');
}

if (
  !reset.includes("useLayoutEffect") ||
  !reset.includes("usePathname") ||
  !reset.includes("window.scrollTo") ||
  !reset.includes("top: 0") ||
  !reset.includes("window.requestAnimationFrame(reset)") ||
  !reset.includes("window.location.hash")
) {
  failures.push('route scroll reset contract is incomplete');
}

if (
  reset.includes("addEventListener('scroll'") ||
  reset.includes('history.scrollRestoration')
) {
  failures.push('scroll reset must not add a persistent scroll listener or disable browser restoration globally');
}

if (failures.length) {
  console.error('[AnimeBox Hotfix 20.1.3] Check failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(
  'PASS: Hotfix 20.1.3 resets fresh anime detail navigations without persistent scroll listeners',
);
