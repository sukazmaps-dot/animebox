import fs from 'node:fs';
import ts from 'typescript';

const read = (path) =>
  fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

const failures = [];
const diversity = read('lib/recommendation-diversity.ts');
const recommendations = read('lib/recommendations.ts');
const ranking = read('lib/recommendation-ranking-config.ts');
const personalization = read('lib/personalization.ts');
const feed = read('components/SmartRecommendationFeed.tsx');
const card = read('components/SmartRecommendationCard.tsx');
const productClient = read('lib/product-events-client.ts');
const docs = read('docs/PATCH-22-DISCOVERY-RECOMMENDATIONS-3.md');

for (const [label, source, needle] of [
  ['diversity version', diversity, "RECOMMENDATION_DIVERSITY_VERSION = '22.6-diversity-v3'"],
  ['algorithm version', personalization, "RECOMMENDATION_ALGORITHM_VERSION = '22.6-v1'"],
  ['ranking version', ranking, "RECOMMENDATION_RANKING_VERSION = '22.6-v1'"],
  ['bounded candidate window', diversity, 'candidateWindowMultiplier: 6'],
  ['top relevance lock', diversity, 'lockTopResult: true'],
  ['relevance floor', diversity, 'function relevanceFloor('],
  ['relevance anchor hoisted per pass', diversity, 'const anchorScore = remaining.reduce('],
  ['family cap', diversity, 'maxFamilyPerFeed: 1'],
  ['genre concentration', diversity, 'genreConcentrationPenalty'],
  ['studio repetition', diversity, 'studioRepeatPenalty'],
  ['studio concentration', diversity, 'studioConcentrationPenalty'],
  ['format repetition', diversity, 'formatRepeatPenalty'],
  ['era repetition', diversity, 'eraRepeatPenalty'],
  ['source repetition', diversity, 'sourceRepeatPenalty'],
  ['popularity repetition', diversity, 'popularityRepeatPenalty'],
  ['confidence share targets', diversity, 'recommendationDiversityShareTargets'],
  ['strict concentration pass', diversity, 'strictConcentration: true'],
  ['relaxed concentration pass', diversity, 'strictConcentration: false'],
  ['diagnostic original rank', diversity, 'originalRank: originalRank.get'],
  ['diagnostic reranked rank', diversity, 'rerankedRank'],
  ['diagnostic total penalty', diversity, 'totalPenalty'],
  ['recommendation diversity output', recommendations, 'diversity: null'],
  ['loaded-pool rerank', feed, 'merged.map(({ anime }) => anime)'],
  ['loaded-pool full limit', feed, 'limit: merged.length'],
  ['card diversity version', card, 'data-diversity-version={diversity?.version}'],
  ['event diversity telemetry', personalization, 'diversity_version: event.diversityVersion ?? null'],
  ['event original rank telemetry', personalization, 'diversity_original_rank: event.diversityOriginalRank ?? null'],
  ['playback diversity attribution', productClient, 'diversity_reranked_rank: parsed.diversityRerankedRank ?? null'],
  ['phase J docs', docs, '# 13. Phase J — Diversity Reranker 3.0'],
]) {
  if (!source.includes(needle)) {
    failures.push(`${label}: missing ${needle}`);
  }
}

if (diversity.includes('Math.max(...remaining.map')) {
  failures.push('relevance anchor regressed to O(n²) work inside each candidate evaluation');
}

if (!failures.length) {
  try {
    const runtimeSource = diversity
      .replace(
        /import type \{ RankedRecommendation \} from '@\/lib\/recommendations';\n/,
        '',
      )
      .replace(
        /import \{[\s\S]*?\} from '@\/lib\/recommendation-exploration';\n/,
        `const buildRecommendationExplorationPolicy = (input = {}) => {
          const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
          const confidence = clamp(Number(input.confidence ?? 0) || 0, 0, 1);
          const confidenceDriven = 0.2 - confidence * 0.15;
          const graphRate = clamp(
            Number.isFinite(Number(input.explorationRate))
              ? Number(input.explorationRate)
              : confidenceDriven,
            0.05,
            0.2,
          );
          const exploreShare = clamp(
            graphRate * 0.65 + confidenceDriven * 0.35,
            0.05,
            0.2,
          );
          const adjacentShare = clamp(0.3 - confidence * 0.1, 0.2, 0.3);
          const safeShare = clamp(1 - adjacentShare - exploreShare, 0.5, 0.75);
          return { confidence, safeShare, adjacentShare, exploreShare };
        };
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

    const item = ({
      id,
      score,
      genres = ['Action'],
      studio = 'Studio A',
      format = 'TV',
      year = 2024,
      source = 'taste_graph',
      popularityBand = 'mainstream',
      family = `family-${id}`,
      className = 'safe',
      matchScore = 90,
      continuation = false,
    }) => ({
      anime: {
        id,
        title: { english: `Title ${id}` },
        genres,
        studios: studio ? [{ name: studio }] : [],
        format,
        startDate: { year, month: 1, day: 1 },
      },
      score,
      franchiseFamilyKey: family,
      franchiseContinuation: continuation,
      explorationClass: className,
      source,
      matchScore,
      popularityBand,
      diversity: null,
    });

    const coldTargets = runtime.recommendationDiversityShareTargets(0);
    const confidentTargets = runtime.recommendationDiversityShareTargets(1);

    if (
      coldTargets.genre >= confidentTargets.genre ||
      coldTargets.studio >= confidentTargets.studio ||
      coldTargets.popularity >= confidentTargets.popularity
    ) {
      failures.push('confidence-aware share targets no longer broaden cold-start feeds');
    }

    const concentrated = [
      item({ id: 1, score: 1 }),
      item({ id: 2, score: 0.99 }),
      item({ id: 3, score: 0.98 }),
      item({ id: 4, score: 0.97 }),
      item({ id: 5, score: 0.96 }),
      item({ id: 6, score: 0.95 }),
      item({
        id: 7,
        score: 0.94,
        genres: ['Drama'],
        studio: 'Studio B',
        format: 'MOVIE',
        year: 2012,
        source: 'watch_history',
        popularityBand: 'niche',
      }),
      item({
        id: 8,
        score: 0.93,
        genres: ['Comedy'],
        studio: 'Studio C',
        format: 'OVA',
        year: 2002,
        source: 'discovery',
        popularityBand: 'mid',
        className: 'adjacent',
      }),
      item({
        id: 9,
        score: 0.92,
        genres: ['Mystery'],
        studio: 'Studio D',
        format: 'ONA',
        year: 1997,
        source: 'taste_mood',
        popularityBand: 'blockbuster',
        className: 'explore',
      }),
    ];

    const diversified = runtime.diversifyRecommendations(concentrated, {
      limit: 6,
      tasteConfidence: 0.2,
      explorationRate: 0.16,
    });

    if (diversified[0]?.anime?.id !== 1) {
      failures.push('top relevance winner was displaced by diversity');
    }

    const firstSixIds = new Set(diversified.map((row) => row.anime.id));
    if (
      !firstSixIds.has(7) &&
      !firstSixIds.has(8) &&
      !firstSixIds.has(9)
    ) {
      failures.push('reranker failed to admit any near-relevance diverse candidate');
    }

    const firstSixStudios = diversified.map(
      (row) => row.anime.studios?.[0]?.name,
    );
    if (new Set(firstSixStudios).size < 2) {
      failures.push('studio repetition still monopolizes the diversified head');
    }

    if (
      diversified.some(
        (row, index) =>
          !row.diversity ||
          row.diversity.version !== '22.6-diversity-v3' ||
          row.diversity.rerankedRank !== index + 1 ||
          row.diversity.totalPenalty < 0 ||
          row.diversity.totalBoost < 0,
      )
    ) {
      failures.push('diversity diagnostics are incomplete or unbounded');
    }

    const relevanceGuard = runtime.diversifyRecommendations(
      [
        item({ id: 20, score: 1, family: 'a' }),
        item({ id: 21, score: 0.97, family: 'b' }),
        item({
          id: 22,
          score: 0.2,
          genres: ['Josei'],
          studio: 'Rare Studio',
          format: 'MOVIE',
          year: 1980,
          source: 'discovery',
          popularityBand: 'niche',
          family: 'c',
          className: 'explore',
        }),
      ],
      {
        limit: 2,
        tasteConfidence: 0,
        explorationRate: 0.2,
      },
    );

    if (relevanceGuard[1]?.anime?.id !== 21) {
      failures.push('diversity promoted a materially weaker title through the relevance floor');
    }

    const familyGuard = runtime.diversifyRecommendations(
      [
        item({ id: 30, score: 1, family: 'saga' }),
        item({ id: 31, score: 0.99, family: 'saga' }),
        item({
          id: 32,
          score: 0.95,
          family: 'other',
          genres: ['Drama'],
          studio: 'Other Studio',
          source: 'watch_history',
        }),
      ],
      {
        limit: 2,
        tasteConfidence: 0.5,
        explorationRate: 0.1,
      },
    );

    if (familyGuard[1]?.anime?.id !== 32) {
      failures.push('franchise concentration cap failed while a relevant alternative existed');
    }

    const scarcity = runtime.diversifyRecommendations(
      [
        item({ id: 40, score: 1, family: 'only-family' }),
        item({ id: 41, score: 0.98, family: 'only-family' }),
        item({ id: 42, score: 0.96, family: 'only-family' }),
      ],
      {
        limit: 3,
        tasteConfidence: 0.8,
        explorationRate: 0.05,
      },
    );

    if (scarcity.length !== 3) {
      failures.push('strict diversity constraints left feed slots empty under candidate scarcity');
    }

    if (!scarcity.slice(1).some((row) => row.diversity?.relaxedConstraints)) {
      failures.push('constraint relaxation is not visible in diversity diagnostics');
    }

    const classMix = runtime.diversifyRecommendations(
      [
        item({ id: 50, score: 1, className: 'safe' }),
        item({ id: 51, score: 0.98, className: 'safe' }),
        item({ id: 52, score: 0.96, className: 'safe' }),
        item({
          id: 53,
          score: 0.94,
          className: 'adjacent',
          genres: ['Drama'],
          studio: 'B',
          source: 'watch_history',
        }),
        item({
          id: 54,
          score: 0.93,
          className: 'explore',
          genres: ['Mystery'],
          studio: 'C',
          source: 'discovery',
          popularityBand: 'niche',
        }),
      ],
      {
        limit: 5,
        tasteConfidence: 0,
        explorationRate: 0.2,
      },
    );

    if (!classMix.some((row) => row.explorationClass === 'explore')) {
      failures.push('controlled exploration class target disappeared during diversity reranking');
    }
  } catch (error) {
    failures.push(
      `diversity runtime matrix failed: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
}

if (failures.length) {
  console.error('[AnimeBox Patch 22 Phase J] Diversity Reranker 3.0 check failed:');
  for (const failure of failures) console.error(` - ${failure}`);
  process.exit(1);
}

console.log(
  '[AnimeBox Patch 22 Phase J] relevance guard, multi-axis concentration, scarcity relaxation, diagnostics and global-pool reranking passed.',
);
