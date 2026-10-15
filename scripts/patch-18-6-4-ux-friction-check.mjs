import fs from 'node:fs';

const read = (path) =>
  fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

const navbar = read('components/Navbar.tsx');
const animeCard = read('components/AnimeCard.tsx');
const smartCard = read('components/SmartRecommendationCard.tsx');
const animeLoading = read('app/anime/[slug]/loading.tsx');
const episodePage = read('components/AnimeEpisodePage.tsx');
const actionCss = read('app/patch30-1-home-visual.css');
const telegramBridge = read('components/TelegramMiniAppBridge.tsx');
const telegramGate = read('components/TelegramSubscriptionGate.tsx');
const pkg = JSON.parse(read('package.json'));

const failures = [];

const need = (label, source, needles) => {
  for (const needle of needles) {
    if (!source.includes(needle)) {
      failures.push(`${label} missing: ${needle}`);
    }
  }
};

if (navbar.includes('Умный поиск:')) {
  failures.push('navbar still exposes the marketing label “Умный поиск”');
}
need('search wording', navbar, [
  'placeholder="Найди аниме по названию..."',
  'aria-label="Поиск аниме"',
]);

need('anime card navigation', animeCard, [
  'href={animeHref(anime)}',
  'prefetch={true}',
]);

need('recommendation navigation', smartCard, [
  'className="smart-card__poster-link"',
  'className="smart-card__title"',
  'prefetch={false}',
]);
// 30.1 deliberately stops speculative full-page loads on recommendation rails.
if ((smartCard.match(/prefetch={false}/g) ?? []).length !== 2 || smartCard.includes('prefetch={true}')) {
  failures.push('both recommendation links must avoid speculative full-page prefetch');
}

if (
  animeLoading.includes('AnimeBoxLoader') ||
  animeLoading.includes('ANIMEBOX CINEMA')
) {
  failures.push('anime route still uses the detached full-screen cinema loader');
}
need('anime route continuity skeleton', animeLoading, [
  'anime-detail-v4__hero-shell',
  'md:grid-cols-[230px_minmax(0,1fr)]',
  'aspect-[2/3]',
  'aria-busy="true"',
  'motion-reduce:animate-none',
]);

need('recommendation action footer', actionCss, [
  'grid-template-columns: minmax(0, 1fr) 44px',
  '"plan dismiss"',
  'min-height: 44px !important',
  '.smart-card__dialog-quick-actions',
  'background: transparent !important',
]);
if (
  smartCard.indexOf('className={planClassName}') >
  smartCard.indexOf('onClick={openFeedbackMenu}')
) {
  failures.push('“В список” must appear before the secondary recommendation menu');
}

if (
  episodePage.includes(
    'Прогресс сохраняется автоматически. Переход между соседними сериями',
  )
) {
  failures.push('player page still repeats the progress/navigation explanation below video');
}
need('player clutter reduction', episodePage, [
  '<EpisodeQuickSelector',
  'episode-page__identity-compact',
  'id="episode-browser"',
]);

need('telegram mini app safety contract', telegramBridge, [
  'Telegram',
]);
need('telegram gate safety contract', telegramGate, [
  'hasTelegramMiniAppLaunchParams',
  'logoFailed',
  "'activated'",
  "setState('blocked')",
]);

if (
  pkg.scripts?.['patch18-6-4:check'] !==
  'node scripts/patch-18-6-4-ux-friction-check.mjs'
) {
  failures.push('package.json is missing patch18-6-4:check');
}
if (
  !String(pkg.scripts?.prebuild ?? '').includes('npm run patch18-6-4:check')
) {
  failures.push('prebuild does not execute patch18-6-4:check');
}

if (failures.length) {
  console.error('\n[AnimeBox 18.6.4 UX Friction] Check failed:\n');
  failures.forEach((failure) => console.error(` - ${failure}`));
  console.error('');
  process.exit(1);
}

console.log(
  '[AnimeBox 18.6.4 UX Friction] search wording, card actions, route continuity, player density and Telegram safety invariants passed.',
);
