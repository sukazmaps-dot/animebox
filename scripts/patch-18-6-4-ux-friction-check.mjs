import fs from 'node:fs';

const read = (path) =>
  fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

const navbar = read('components/Navbar.tsx');
const animeCard = read('components/AnimeCard.tsx');
const smartCard = read('components/SmartRecommendationCard.tsx');
const animeLoading = read('app/anime/[slug]/loading.tsx');
const episodePage = read('components/AnimeEpisodePage.tsx');
const actionCss = read('app/patch17-6-home-recommendation-actions.css');
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
  'prefetch={true}',
]);

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
  '"plan plan plan"',
  '"like watched dismiss"',
  'border-top: 1px solid rgba(151, 160, 188, .10)',
  '.home-page .smart-card__plan-icon',
  'background: transparent !important',
]);
if (
  actionCss.indexOf('"plan plan plan"') >
  actionCss.indexOf('"like watched dismiss"')
) {
  failures.push('“В список” must appear before secondary recommendation feedback controls');
}

if (
  episodePage.includes(
    'Прогресс сохраняется автоматически. Переход между соседними сериями',
  )
) {
  failures.push('player page still repeats the progress/navigation explanation below video');
}
need('player clutter reduction', episodePage, [
  'episode-seo-context--compact',
  'aria-label="Навигация по серии"',
  'Серия {episodeNumber}',
  '<strong>{title}</strong>',
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
