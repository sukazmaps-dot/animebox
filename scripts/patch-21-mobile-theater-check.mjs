import fs from 'node:fs';

const read = (path) =>
  fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

const failures = [];
const episode = read('components/AnimeEpisodePage.tsx');
const theaterCss = read('components/watch-party/WatchTogetherTheater.module.css');
const panelCss = read('components/watch-party/WatchPartyPanel.module.css');
const player = read('components/AnimePlayer.tsx');

for (const [label, source, needle] of [
  ['visual viewport resize listener', episode, "window.visualViewport?.addEventListener('resize', syncVisualViewport)"],
  ['visual viewport scroll listener', episode, "window.visualViewport?.addEventListener('scroll', syncVisualViewport)"],
  ['visual viewport height css variable', episode, "'--animebox-wt-viewport-height'"],
  ['visual viewport offset css variable', episode, "'--animebox-wt-viewport-offset-top'"],
  ['visual viewport cleanup', episode, "root.style.removeProperty('--animebox-wt-viewport-height')"],
  ['one-screen mobile viewport', theaterCss, "height: var(--animebox-wt-viewport-height, 100dvh) !important;"],
  ['keyboard-aware player height', theaterCss, "calc(var(--animebox-wt-viewport-height, 100dvh) * 0.46)"],
  ['mobile fixed player row', theaterCss, 'flex: 0 0 var(--wt-mobile-player-height);'],
  ['mobile 16:9 viewport', theaterCss, 'aspect-ratio: 16 / 9 !important;'],
  ['mobile player positive minimum', theaterCss, '156px'],
  ['mobile room shell visible viewport sizing', panelCss, 'var(--animebox-wt-viewport-height, 100dvh)'],
  ['chat input iOS zoom protection', panelCss, 'font-size: 16px;'],
  ['telegram pseudo fullscreen state', player, 'telegramPseudoFullscreen'],
  ['native fullscreen listener', player, "document.addEventListener('fullscreenchange', onFullscreenChange)"],
  ['Telegram viewport refresh', player, "telegram?.onEvent?.('viewportChanged', syncPlayerViewport)"],
]) {
  if (!source.includes(needle)) {
    failures.push(`${label}: missing ${needle}`);
  }
}

if (
  theaterCss.includes(
    '--wt-mobile-player-height: max(\n      190px,\n      calc((100vw - 8px) * 9 / 16)',
  )
) {
  failures.push('mobile player returned to a width-only height formula that ignores the visible keyboard viewport');
}

if (failures.length) {
  console.error('[AnimeBox Patch 21 Phase E] Mobile theater/fullscreen check failed:');
  for (const failure of failures) console.error(` - ${failure}`);
  process.exit(1);
}

console.log(
  '[AnimeBox Patch 21 Phase E] Mobile visual viewport, keyboard and fullscreen invariants passed.',
);
