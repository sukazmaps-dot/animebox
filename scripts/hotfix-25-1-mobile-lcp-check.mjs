import fs from 'node:fs';

const failures = [];
const read = (path) => fs.readFileSync(path, 'utf8');
const need = (source, needle, label) => {
  if (!source.includes(needle)) failures.push(label);
};
const forbid = (source, needle, label) => {
  if (source.includes(needle)) failures.push(label);
};

const media = read('lib/media-delivery.ts');
const warmup = read('lib/media-warmup-client.ts');
const mood = read('components/HomeMoodPicker.tsx');

need(
  media,
  "const PRODUCTION_MEDIA_ORIGIN = 'https://media.youranimebox.com';",
  'production media edge fallback is missing',
);
need(
  media,
  "process.env.NODE_ENV === 'production'",
  'media fallback is not production-scoped',
);
need(
  media,
  'PRODUCTION_MEDIA_ORIGIN',
  'media edge fallback is not returned by getPrimaryMediaOrigin',
);

need(
  warmup,
  'viewportWidth <= 768',
  'mobile-specific media warmup budget is missing',
);
need(
  warmup,
  "return '220px 120px 460px 120px';",
  'mobile poster warmup still reaches too far below the fold',
);
forbid(
  warmup,
  "return '700px 900px 1600px 900px';",
  'legacy 1600px eager poster overscan returned',
);

need(
  mood,
  'const [artUnlocked, setArtUnlocked] = useState(false);',
  'mood artwork is not interaction-gated',
);
need(
  mood,
  "data-mood-art={artUnlocked ? 'ready' : 'deferred'}",
  'mood artwork defer state is not observable',
);
need(
  mood,
  'onPointerDown={unlockArt}',
  'touch interaction does not release mood artwork',
);
need(
  mood,
  'onFocusCapture={unlockArt}',
  'keyboard interaction does not release mood artwork',
);
need(
  mood,
  'fetchPriority="low"',
  'deferred mood artwork does not remain low priority',
);
need(
  mood,
  'MOOD_FALLBACK_GLYPHS',
  'mood picker has no zero-network initial icon fallback',
);
forbid(
  mood,
  "from 'next/image'",
  'mood picker still sends oversized unoptimized next/image assets during initial rendering',
);

if (failures.length) {
  console.error('\n[AnimeBox Hotfix 25.1 Mobile LCP] Check failed:\n');
  failures.forEach((failure) => console.error(` - ${failure}`));
  console.error('');
  process.exit(1);
}

console.log('[AnimeBox Hotfix 25.1 Mobile LCP] media edge, warmup and mood-art invariants passed.');
