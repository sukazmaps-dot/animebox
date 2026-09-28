import fs from 'node:fs';

function read(path) {
  return fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
}

function mustInclude(text, needle, label) {
  if (!text.includes(needle)) {
    throw new Error(`[Patch 20.4] Missing ${label}: ${needle}`);
  }
}

function mustNotInclude(text, needle, label) {
  if (text.includes(needle)) {
    throw new Error(`[Patch 20.4] Forbidden ${label}: ${needle}`);
  }
}

const theaterCss = read('components/watch-party/WatchTogetherTheater.module.css');
const player = read('components/AnimePlayer.tsx');

mustInclude(
  theaterCss,
  '@media (max-width: 768px) and (orientation: portrait)',
  'portrait mobile player breakpoint',
);
mustInclude(
  theaterCss,
  'grid-template-rows: auto auto;',
  'mobile theater rows driven by intrinsic content',
);
mustInclude(
  theaterCss,
  'container-type: inline-size;',
  'stage without block-size containment',
);
mustInclude(
  theaterCss,
  'aspect-ratio: 16 / 9 !important;',
  'mobile 16:9 player viewport',
);
mustInclude(
  theaterCss,
  'height: auto !important;',
  'mobile automatic player height',
);
mustInclude(
  theaterCss,
  'min-height: clamp(190px, calc((100vw - 26px) * 9 / 16), 280px);',
  'mobile player positive height guard',
);
mustInclude(
  theaterCss,
  'grid-template-columns: repeat(2, minmax(0, 1fr));',
  'episode navigation directly below player',
);

mustNotInclude(
  player,
  "watch-together-player-root h-full min-h-0",
  'indefinite WT root h-full dependency',
);
mustNotInclude(
  player,
  "watch-together-player-mount h-full min-h-0",
  'indefinite WT mount h-full dependency',
);
mustInclude(
  player,
  "watch-together-player-root min-h-0",
  'WT root class contract',
);
mustInclude(
  player,
  "watch-together-player-mount min-h-0",
  'WT mount class contract',
);

console.log(
  'Patch 20.4 Watch Together mobile player geometry checks passed.',
);
