import fs from 'node:fs';
import ts from 'typescript';

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const failures = [];
const need = (label, source, needles) => {
  for (const needle of needles) {
    if (!source.includes(needle)) failures.push(`${label} missing: ${needle}`);
  }
};

const orchestrator = read('lib/player-source-orchestrator.ts');
const episode = read('components/AnimeEpisodePage.tsx');
const player = read('components/AnimePlayer.tsx');
const quick = read('components/EpisodeQuickSelector.tsx');
const library = read('components/LibraryStatusControl.tsx');
const google = read('components/GoogleAuthButton.tsx');
const mediaWorker = read('infra/cloudflare/media-worker.js');
const imageProxy = read('app/api/image/route.ts');
const css = read('app/patch14-5-episode-identity.css');
const loadDrill = read('scripts/production-readiness-load-drill.mjs');
const pkg = JSON.parse(read('package.json'));

need('orchestrator budget shield', orchestrator, [
  'ORCHESTRATOR_MIN_ATTEMPT_BUDGET_MS = 900',
  'remainingPlayerDiscoveryBudgetMs',
  'boundedProviderAttemptTimeoutMs',
  'ORCHESTRATOR_ATTEMPT_SAFETY_MARGIN_MS',
]);
need('episode attempt shield', episode, [
  'attemptedProviders.has(provider)',
  "reason: 'provider_already_attempted'",
  'remainingPlayerDiscoveryBudgetMs({',
  'boundedProviderAttemptTimeoutMs({',
  'showEpisodeNavigation={false}',
  "nextLabel={atLastKnownEpisode && seasonRoute.next ? 'След. сезон' : 'Следующая серия'}",
]);
need('player duplicate-nav switch', player, [
  'showEpisodeNavigation?: boolean',
  'showEpisodeNavigation = true',
  '{showEpisodeNavigation && (',
]);
need('unified episode nav', quick, [
  'episode-quick-nav__center',
  "prevLabel = 'Пред.'",
  "nextLabel = 'Следующая серия'",
  'openFullEpisodeBrowser',
  "behavior: reducedMotion ? 'auto' : 'smooth'",
  "window.history.replaceState(null, '', '#episode-browser')",
  'Все серии',
]);
need('unified episode nav css', css, [
  'Patch 18.7 — Unified episode navigation',
  'Patch 18.7 — Episode navigation polish',
  '.episode-quick-nav__center',
  '.episode-quick-nav__next',
  '.episode-quick-nav__previous:disabled',
  'height: 44px !important',
  'margin-inline: 6px',
  '#episode-browser',
  'scroll-margin-top: 86px',
  'Patch 18.7b — Responsive compact episode navigation + centered guest copy',
  'width: min(100%, 960px) !important',
  'grid-template-rows: 40px 20px !important',
  'justify-self: center !important',
  'grid-template-columns: 30px minmax(0, 1fr) 30px !important',
  'Patch 18.7c — Desktop episode navigation scale polish',
  'max-width: 1040px !important',
  'max-width: 1160px !important',
  'max-width: 1240px !important',
  'max-width: 1320px !important',
  'height: 46px !important',
]);
need('library guest auth', library, [
  'useAuthModal',
  'useAuthState',
  'Чтобы пользоваться библиотекой',
  'Войти / зарегистрироваться',
  "intent: 'tracker'",
]);
need('google official light surface', google, [
  "theme: 'outline'",
  "background: '#fff'",
]);
if (google.includes("theme: 'filled_black'")) {
  failures.push('Google Sign-In still requests the split dark button theme');
}
need('media graceful fallback', mediaWorker, [
  'sourceFallbackResponse',
  "status: 307",
  "'source-fallback-redirect'",
]);
need('same-origin image fallback', imageProxy, [
  'NextResponse.redirect(sourceUrl',
  "'proxy-v2-source-fallback'",
]);
need('scale drill', loadDrill, [
  'const phases = [100, 250, 500, 750, 1000]',
  "AnimeBox-Readiness-Drill/18.7",
  "ANIMEBOX_LOAD_TEST_PRODUCTION !== 'I_UNDERSTAND'",
  'p50Ms:',
  'p95Ms:',
  'p99Ms:',
]);

if (pkg.scripts?.['patch18-7:check'] !== 'node scripts/patch-18-7-core-final-check.mjs') {
  failures.push('package.json is missing patch18-7:check');
}
if (!String(pkg.scripts?.prebuild ?? '').includes('npm run patch18-7:check')) {
  failures.push('prebuild does not execute patch18-7:check');
}

if (!failures.length) {
  try {
    const compiled = ts.transpileModule(orchestrator, {
      compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
    }).outputText;
    const runtime = await import(
      `data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`
    );
    const remaining = runtime.remainingPlayerDiscoveryBudgetMs({
      discoveryStartedAtMs: 1_000,
      discoveryBudgetMs: 18_500,
      nowMs: 17_000,
    });
    if (remaining !== 2_500) failures.push(`remaining discovery budget expected 2500, got ${remaining}`);
    const bounded = runtime.boundedProviderAttemptTimeoutMs({
      recommendedTimeoutMs: 7_000,
      remainingBudgetMs: 2_500,
    });
    if (bounded !== 2_320) failures.push(`bounded provider timeout expected 2320, got ${bounded}`);
    const exhausted = runtime.boundedProviderAttemptTimeoutMs({
      recommendedTimeoutMs: 7_000,
      remainingBudgetMs: 800,
    });
    if (exhausted !== 0) failures.push(`exhausted provider timeout expected 0, got ${exhausted}`);
  } catch (error) {
    failures.push(`18.7 orchestrator runtime matrix failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

if (failures.length) {
  console.error('\n[AnimeBox 18.7 Core Final] Check failed:\n');
  for (const failure of failures) console.error(` - ${failure}`);
  console.error('');
  process.exit(1);
}

console.log('[AnimeBox 18.7 Core Final] bounded player discovery, single episode navigation, guest library auth, Google surface, media fallback and scale drill invariants passed.');
