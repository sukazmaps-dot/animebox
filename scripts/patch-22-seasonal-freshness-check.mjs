import fs from 'node:fs';
import ts from 'typescript';

const read = (path) =>
  fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

const failures = [];
const seasonality = read('lib/recommendation-seasonality.ts');
const ranking = read('lib/recommendation-ranking-config.ts');
const recommendations = read('lib/recommendations.ts');
const explainability = read('lib/recommendation-explainability.ts');
const rails = read('lib/recommendation-rails.ts');
const route = read('app/api/recommendations/route.ts');
const types = read('types/recommendations.ts');
const personalization = read('lib/personalization.ts');
const card = read('components/SmartRecommendationCard.tsx');

for (const [label, source, needle] of [
  ['ranking version', ranking, "RECOMMENDATION_RANKING_VERSION = '22.6-v1'"],
  ['algorithm version', personalization, "RECOMMENDATION_ALGORITHM_VERSION = '22.6-v1'"],
  ['seasonality scorer', seasonality, 'scoreRecommendationSeasonality'],
  ['taste gate', seasonality, 'MIN_TASTE_COMPATIBILITY = 0.18'],
  ['freshness multiplied by normalized taste', seasonality, 'freshnessScore *'],
  ['negative seasonal dampening', seasonality, 'negativeMultiplier'],
  ['fatigue seasonal dampening', seasonality, 'fatigueMultiplier'],
  ['seasonal ranking weight', ranking, 'seasonalFreshness: 0.12'],
  ['seasonal rank signal', recommendations, 'seasonalFreshness: seasonality.seasonalScore'],
  ['seasonal reason evidence', explainability, "Из текущего сезона — и совпадает с твоим вкусом"],
  ['seasonal rail id', rails, "'seasonal'"],
  ['seasonal rail title', rails, "title: 'Из этого сезона для тебя'"],
  ['seasonal rail threshold', rails, "item.seasonalScore >= 0.24"],
  ['seasonal candidate source', route, "return 'seasonal'"],
  ['current season context', route, 'getCurrentAnimeSeason()'],
  ['season query', route, 'season,'],
  ['season year query', route, 'year: seasonYear'],
  ['seasonal cache generation', route, 'animebox-recommendation-candidates-v11-saved-metadata'],
  ['seasonal response contract', types, "| 'seasonal'"],
  ['season response metadata', types, 'seasonYear?: number'],
  ['seasonal telemetry score', personalization, 'seasonal_score: event.seasonalScore ?? null'],
  ['seasonal telemetry relation', personalization, 'season_relation: event.seasonRelation ?? null'],
  ['card seasonal context', card, 'seasonalScore,'],
]) {
  if (!source.includes(needle)) failures.push(`${label}: missing ${needle}`);
}

if (!failures.length) {
  try {
    const runtimeSource = seasonality
      .replace(/import type \{ Anime \} from '@\/types\/anime';\n/, '')
      .replace(
        /import \{[\s\S]*?\} from '@\/lib\/catalog-season';\n/,
        `const monthToCatalogSeason = (month) => {
          if (month >= 1 && month <= 3) return 'WINTER';
          if (month >= 4 && month <= 6) return 'SPRING';
          if (month >= 7 && month <= 9) return 'SUMMER';
          if (month >= 10 && month <= 12) return 'FALL';
          return null;
        };
        const getCurrentAnimeSeason = (date = new Date()) => ({
          season: monthToCatalogSeason(date.getMonth() + 1) ?? 'WINTER',
          year: date.getFullYear(),
        });
        `,
      );

    const compiled = ts.transpileModule(runtimeSource, {
      compilerOptions: {
        module: ts.ModuleKind.ESNext,
        target: ts.ScriptTarget.ES2022,
      },
    }).outputText;

    const runtime = await import(
      `data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`
    );

    const now = new Date('2026-09-15T12:00:00Z');
    const anime = (year, month, day = 5) => ({
      id: year * 100 + month,
      title: { english: 'Seasonal Candidate' },
      genres: ['Drama'],
      startDate: { year, month, day },
    });

    const current = runtime.scoreRecommendationSeasonality({
      anime: anime(2026, 7),
      tasteCompatibility: 0.78,
      negativeAffinity: 0.05,
      fatigueScore: 0.05,
      now,
    });
    if (current.relation !== 'current' || current.seasonalScore < 0.45) {
      failures.push('strong current-season taste match did not receive controlled freshness');
    }

    const noTaste = runtime.scoreRecommendationSeasonality({
      anime: anime(2026, 7),
      tasteCompatibility: 0,
      negativeAffinity: 0,
      fatigueScore: 0,
      now,
    });
    if (noTaste.seasonalScore !== 0) {
      failures.push('fresh title received unconditional freshness boost without taste match');
    }

    const previous = runtime.scoreRecommendationSeasonality({
      anime: anime(2026, 4),
      tasteCompatibility: 0.78,
      negativeAffinity: 0,
      fatigueScore: 0,
      now,
    });
    if (previous.relation !== 'previous' || previous.seasonalScore >= current.seasonalScore) {
      failures.push('previous-season decay no longer stays below current-season freshness');
    }

    const old = runtime.scoreRecommendationSeasonality({
      anime: anime(2024, 7),
      tasteCompatibility: 1,
      negativeAffinity: 0,
      fatigueScore: 0,
      now,
    });
    if (old.relation !== 'older' || old.seasonalScore !== 0) {
      failures.push('older catalogue title leaked into seasonal freshness boost');
    }

    const damped = runtime.scoreRecommendationSeasonality({
      anime: anime(2026, 7),
      tasteCompatibility: 0.78,
      negativeAffinity: 0.8,
      fatigueScore: 0.8,
      now,
    });
    if (damped.seasonalScore >= current.seasonalScore * 0.65) {
      failures.push('negative affinity / exposure fatigue no longer damp seasonal freshness');
    }
  } catch (error) {
    failures.push(
      `seasonality runtime matrix failed: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
}

if (failures.length) {
  console.error('[AnimeBox Patch 22 Phase G] Seasonal freshness check failed:');
  for (const failure of failures) console.error(` - ${failure}`);
  process.exit(1);
}

console.log(
  '[AnimeBox Patch 22 Phase G] taste-gated freshness, seasonal candidate source, personalized rail, decay and telemetry passed.',
);
