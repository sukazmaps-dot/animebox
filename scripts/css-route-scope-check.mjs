import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const failures = [];

function findMatchingBrace(css, openIndex) {
  let depth = 0;
  let quote = null;
  let inComment = false;

  for (let i = openIndex; i < css.length; i += 1) {
    const ch = css[i];
    const next = css[i + 1];

    if (inComment) {
      if (ch === '*' && next === '/') {
        inComment = false;
        i += 1;
      }
      continue;
    }

    if (!quote && ch === '/' && next === '*') {
      inComment = true;
      i += 1;
      continue;
    }

    if (quote) {
      if (ch === '\\') {
        i += 1;
        continue;
      }

      if (ch === quote) quote = null;
      continue;
    }

    if (ch === '"' || ch === "'") {
      quote = ch;
      continue;
    }

    if (ch === '{') depth += 1;

    if (ch === '}') {
      depth -= 1;
      if (depth === 0) return i;
    }
  }

  return -1;
}

function extractMatching(css, needles) {
  let out = '';
  let cursor = 0;

  while (cursor < css.length) {
    while (cursor < css.length && /\s/.test(css[cursor])) cursor += 1;
    if (cursor >= css.length) break;

    if (css.startsWith('/*', cursor)) {
      const end = css.indexOf('*/', cursor + 2);
      cursor = end >= 0 ? end + 2 : css.length;
      continue;
    }

    const open = css.indexOf('{', cursor);
    if (open < 0) break;

    const semicolon = css.indexOf(';', cursor);
    if (semicolon >= 0 && semicolon < open) {
      cursor = semicolon + 1;
      continue;
    }

    const prelude = css.slice(cursor, open).trim();
    const close = findMatchingBrace(css, open);
    if (close < 0) break;

    const body = css.slice(open + 1, close);

    if (/^@(media|supports|container|layer|document)\b/i.test(prelude)) {
      const inner = extractMatching(body, needles);
      if (inner.trim()) {
        out += `${prelude} {\n${inner.trim()}\n}\n\n`;
      }
    } else if (needles.some((needle) => prelude.includes(needle))) {
      out += `${prelude} {\n${body.trim()}\n}\n\n`;
    }

    cursor = close + 1;
  }

  return out.trim() ? `${out.trim()}\n` : '';
}

function normalizeCss(value) {
  return value
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\s+/g, ' ')
    .replace(/\s*([{}:;,>+~])\s*/g, '$1')
    .trim();
}

function ensureReplayContains({
  label,
  replayPath,
  sources,
  needles,
}) {
  const replay = normalizeCss(read(replayPath));

  for (const sourcePath of sources) {
    const extracted = extractMatching(read(sourcePath), needles);
    if (!extracted.trim()) continue;

    const normalized = normalizeCss(extracted);
    if (!replay.includes(normalized)) {
      failures.push(
        `${label}: ${replayPath} is stale against ${sourcePath}`,
      );
    }
  }
}

const rootLayout = read('app/layout.tsx');
const profileLayout = read('app/profile/layout.tsx');
const animeLayout = read('app/anime/[slug]/layout.tsx');

for (const forbidden of [
  "import './patch16-5-profile-widgets.css';",
  "import './patch14-5-episode-identity.css';",
  "import './patch16-6-8-star-rating-light-polish.css';",
]) {
  if (rootLayout.includes(forbidden)) {
    failures.push(`root layout owns route-only CSS: ${forbidden}`);
  }
}

const profileOrder = [
  "import '../patch16-5-profile-widgets.css';",
  "import '../patch18-4-6-profile-widgets-cascade.css';",
  "import '../premium.css';",
];

let lastProfileIndex = -1;
for (const needle of profileOrder) {
  const index = profileLayout.indexOf(needle);
  if (index < 0) {
    failures.push(`profile route missing ${needle}`);
    continue;
  }

  if (index <= lastProfileIndex) {
    failures.push(
      'profile widget cascade order changed: base/replay must precede modern route CSS',
    );
  }

  lastProfileIndex = index;
}

const animeOrder = [
  "import '../../patch14-5-episode-identity.css';",
  "import '../../patch18-4-6-episode-cascade.css';",
  "import '../../patch16-6-8-star-rating-light-polish.css';",
  "import '../../patch18-4-6-rating-cascade.css';",
  "import '../../patch17-6-player-runtime.css';",
];

let lastAnimeIndex = -1;
for (const needle of animeOrder) {
  const index = animeLayout.indexOf(needle);
  if (index < 0) {
    failures.push(`anime route missing ${needle}`);
    continue;
  }

  if (index <= lastAnimeIndex) {
    failures.push(
      'anime route cascade order changed: episode → rating → player runtime must stay stable',
    );
  }

  lastAnimeIndex = index;
}

ensureReplayContains({
  label: 'profile widget replay',
  replayPath: 'app/patch18-4-6-profile-widgets-cascade.css',
  sources: [
    'app/patch16-6-responsive-layout.css',
    'app/patch16-6-1-mobile-performance.css',
    'app/patch16-6-2-readability-2k-density.css',
  ],
  needles: ['profile-widget', 'profile-widgets'],
});

ensureReplayContains({
  label: 'episode replay',
  replayPath: 'app/patch18-4-6-episode-cascade.css',
  sources: [
    'app/patch15-title-accent.css',
    'app/patch16-6-6-home-desktop-stability.css',
    'app/patch16-6-7-light-surfaces.css',
  ],
  needles: ['episode-list', 'detail__episodes'],
});

ensureReplayContains({
  label: 'rating replay',
  replayPath: 'app/patch18-4-6-rating-cascade.css',
  sources: ['app/patch17-4-2-ui-precision.css'],
  needles: ['anime-rating-control'],
});

if (failures.length) {
  console.error('[AnimeBox CSS Route Scope] Check failed:');
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log(
  '[AnimeBox CSS Route Scope] route ownership and cascade replay are current.',
);
