import fs from 'node:fs';
import ts from 'typescript';

const read = (path) =>
  fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

const failures = [];
const exposure = read('lib/recommendation-exposure.ts');
const ranking = read('lib/recommendation-ranking-config.ts');
const recommendations = read('lib/recommendations.ts');
const personalization = read('lib/personalization.ts');
const card = read('components/SmartRecommendationCard.tsx');
const contract = read('docs/PATCH-22-DISCOVERY-RECOMMENDATIONS-3.md');

for (const [label, source, needle] of [
  ['Patch 22 contract', contract, 'Phase A — Exposure / Fatigue Foundation'],
  ['algorithm version', personalization, "RECOMMENDATION_ALGORITHM_VERSION = '22.2-v1'"],
  ['ranking version', ranking, "RECOMMENDATION_RANKING_VERSION = '22.2-v1'"],
  ['fatigue ranking weight', ranking, 'exposureFatigue: 0.38'],
  ['fatigue score component', ranking, 'exposureFatigue:'],
  ['exposure model', exposure, 'buildRecommendationExposureMap'],
  ['exposure half-life', exposure, 'halfLifeDays: 6'],
  ['first impression allowance', exposure, 'firstImpressionAllowance: 1'],
  ['recommendation exposure map', recommendations, 'buildRecommendationExposureMap('],
  ['O(1) candidate lookup', recommendations, 'recommendationExposureSignals('],
  ['ranking fatigue signal', recommendations, 'exposureFatigue: exposure.fatigue'],
  ['ranked fatigue diagnostics', recommendations, 'fatigueScore: exposure.fatigue'],
  ['card fatigue attribution', card, 'fatigueScore,'],
  ['server fatigue metadata', personalization, 'fatigue_score: event.fatigueScore ?? null'],
  ['7d exposure metadata', personalization, 'exposure_count_7d: event.exposureCount7d ?? null'],
  ['30d exposure metadata', personalization, 'exposure_count_30d: event.exposureCount30d ?? null'],
]) {
  if (!source.includes(needle)) {
    failures.push(`${label}: missing ${needle}`);
  }
}

if (
  recommendations.includes(
    'buildRecommendationExposureMap(readRecommendationEvents',
  )
) {
  failures.push(
    'exposure map is rebuilt from storage inside the per-candidate scoring path',
  );
}

if (!failures.length) {
  try {
    const compiled = ts.transpileModule(exposure, {
      compilerOptions: {
        module: ts.ModuleKind.ESNext,
        target: ts.ScriptTarget.ES2022,
      },
    }).outputText;

    const runtime = await import(
      `data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`,
    );

    const now = 1_900_000_000_000;
    const day = 86_400_000;

    const build = (events) =>
      runtime.buildRecommendationExposureMap(events, now).get(1);

    const first = build([
      { type: 'impression', animeId: 1, createdAt: now - day },
    ]);

    if (!first || first.fatigue !== 0) {
      failures.push(
        `first impression must be free from fatigue, got ${first?.fatigue}`,
      );
    }

    const ignored = build([
      { type: 'impression', animeId: 1, createdAt: now - day * 4 },
      { type: 'impression', animeId: 1, createdAt: now - day * 3 },
      { type: 'impression', animeId: 1, createdAt: now - day * 2 },
      { type: 'impression', animeId: 1, createdAt: now - day },
      { type: 'impression', animeId: 1, createdAt: now - 60_000 },
    ]);

    if (!ignored || ignored.fatigue < 0.35) {
      failures.push(
        `repeated unanswered exposure must create material fatigue, got ${ignored?.fatigue}`,
      );
    }

    const opened = build([
      { type: 'impression', animeId: 1, createdAt: now - day * 3 },
      { type: 'impression', animeId: 1, createdAt: now - day * 2 },
      { type: 'impression', animeId: 1, createdAt: now - day },
      { type: 'open', animeId: 1, createdAt: now - 30_000 },
    ]);

    if (!opened || opened.fatigue >= (ignored?.fatigue ?? 1)) {
      failures.push(
        `a recent open must reduce fatigue: ignored=${ignored?.fatigue}, opened=${opened?.fatigue}`,
      );
    }

    const positive = build([
      { type: 'impression', animeId: 1, createdAt: now - day * 2 },
      { type: 'impression', animeId: 1, createdAt: now - day },
      { type: 'impression', animeId: 1, createdAt: now - 120_000 },
      { type: 'liked', animeId: 1, createdAt: now - 30_000 },
    ]);

    if (!positive || positive.fatigue !== 0) {
      failures.push(
        `positive action after exposure must clear fatigue, got ${positive?.fatigue}`,
      );
    }

    const expired = build([
      { type: 'impression', animeId: 1, createdAt: now - day * 45 },
      { type: 'impression', animeId: 1, createdAt: now - day * 40 },
    ]);

    if (expired != null) {
      failures.push('events older than 30 days must not remain in exposure map');
    }

    if (ignored?.impressions7d !== 5 || ignored?.impressions30d !== 5) {
      failures.push(
        `exposure windows are wrong: 7d=${ignored?.impressions7d}, 30d=${ignored?.impressions30d}`,
      );
    }
  } catch (error) {
    failures.push(
      `exposure runtime matrix failed: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
}

if (failures.length) {
  console.error('[AnimeBox Patch 22 Phase A] Exposure/fatigue check failed:');
  for (const failure of failures) console.error(` - ${failure}`);
  process.exit(1);
}

console.log(
  '[AnimeBox Patch 22 Phase A] Exposure fatigue and attribution invariants passed.',
);
