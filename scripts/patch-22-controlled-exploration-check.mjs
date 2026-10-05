import fs from 'node:fs';
import ts from 'typescript';

const read = (path) =>
  fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

const failures = [];
const exploration = read('lib/recommendation-exploration.ts');
const diversity = read('lib/recommendation-diversity.ts');
const recommendations = read('lib/recommendations.ts');
const ranking = read('lib/recommendation-ranking-config.ts');
const rails = read('lib/recommendation-rails.ts');
const route = read('app/api/recommendations/route.ts');
const anilist = read('lib/anilist.ts');
const personalization = read('lib/personalization.ts');
const card = read('components/SmartRecommendationCard.tsx');
const taste = read('app/api/recommendations/taste/route.ts');

for (const [label, source, needle] of [
  ['algorithm version', personalization, "RECOMMENDATION_ALGORITHM_VERSION = '22.6-v1'"],
  ['ranking version', ranking, "RECOMMENDATION_RANKING_VERSION = '22.6-v1'"],
  ['exploration policy', exploration, 'buildRecommendationExplorationPolicy'],
  ['hidden gem scorer', exploration, 'hiddenGemScore'],
  ['popularity correction', exploration, 'recommendationPopularityBias'],
  ['dynamic mix confidence', diversity, 'tasteConfidence?: number | null'],
  ['dynamic class targets', diversity, 'classTargets'],
  ['adjacent class', diversity, "'adjacent'"],
  ['novelty ranking signal', ranking, 'novelty: 0.08'],
  ['hidden gem ranking signal', ranking, 'hiddenGem: 0.11'],
  ['popularity bias ranking signal', ranking, 'popularityBias: 0.07'],
  ['hidden gem rail id', rails, "'hidden_gems'"],
  ['hidden gem rail title', rails, "title: 'Скрытые находки'"],
  ['explicit explore class rail', rails, "item.explorationClass === 'explore'"],
  ['hidden gem candidate source', route, "return 'hidden_gem'"],
  ['bounded hidden gem page', route, 'const hiddenGemPage = 2 + ((page * 3 + bucket) % 18)'],
  ['candidate cache v8', route, 'animebox-recommendation-candidates-v12-dense-source-pages'],
  ['AniList popularity metadata', anilist, 'popularity'],
  ['AniList favourites metadata', anilist, 'favourites'],
  ['recommendation novelty output', recommendations, 'noveltyScore: exploration.noveltyScore'],
  ['recommendation hidden-gem output', recommendations, 'hiddenGemScore: exploration.hiddenGemScore'],
  ['five-percent graph floor', taste, '0.05,'],
  ['telemetry class', personalization, 'exploration_class: event.explorationClass ?? null'],
  ['telemetry hidden gem', personalization, 'hidden_gem_score: event.hiddenGemScore ?? null'],
  ['card exploration context', card, 'explorationClass,'],
]) {
  if (!source.includes(needle)) {
    failures.push(`${label}: missing ${needle}`);
  }
}

if (!failures.length) {
  try {
    const compiled = ts.transpileModule(exploration, {
      compilerOptions: {
        module: ts.ModuleKind.ESNext,
        target: ts.ScriptTarget.ES2022,
      },
    }).outputText;

    const runtime = await import(
      `data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`
    );

    const cold = runtime.buildRecommendationExplorationPolicy({
      confidence: 0,
      explorationRate: 0.2,
    });
    if (
      Math.abs(cold.safeShare - 0.5) > 0.001 ||
      Math.abs(cold.adjacentShare - 0.3) > 0.001 ||
      Math.abs(cold.exploreShare - 0.2) > 0.001
    ) {
      failures.push('cold-start 50/30/20 exploration mix regressed');
    }

    const confident = runtime.buildRecommendationExplorationPolicy({
      confidence: 1,
      explorationRate: 0.05,
    });
    if (
      Math.abs(confident.safeShare - 0.75) > 0.001 ||
      Math.abs(confident.adjacentShare - 0.2) > 0.001 ||
      Math.abs(confident.exploreShare - 0.05) > 0.001
    ) {
      failures.push('high-confidence 75/20/5 exploration mix regressed');
    }

    const anime = (popularity, score = 8.4) => ({
      id: Math.max(1, popularity),
      title: { english: 'Candidate' },
      genres: ['Drama'],
      popularity,
      score,
    });

    const gem = runtime.scoreRecommendationExploration({
      anime: anime(6_000, 8.6),
      tasteAffinity: 0.56,
      completedAffinity: 0.42,
      studioAffinity: 0.15,
      formatAffinity: 0.3,
      eraAffinity: 0.2,
      negativeAffinity: 0.05,
      fatigueScore: 0.08,
      franchiseContinuation: false,
    });
    if (gem.hiddenGemScore < 0.58 || gem.popularityBand !== 'niche') {
      failures.push('qualified niche high-match title did not become a hidden gem');
    }

    const blockbuster = runtime.scoreRecommendationExploration({
      anime: anime(300_000, 8.8),
      tasteAffinity: 0.58,
      completedAffinity: 0.5,
      studioAffinity: 0.4,
      formatAffinity: 0.3,
      eraAffinity: 0.3,
      negativeAffinity: 0,
      fatigueScore: 0,
      franchiseContinuation: false,
    });
    if (blockbuster.hiddenGemScore !== 0 || blockbuster.popularityBias < 0.5) {
      failures.push('blockbuster popularity correction / hidden-gem exclusion regressed');
    }

    const weak = runtime.scoreRecommendationExploration({
      anime: anime(4_000, 5.5),
      tasteAffinity: 0.5,
      completedAffinity: 0.4,
      studioAffinity: 0.2,
      formatAffinity: 0.2,
      eraAffinity: 0.2,
      negativeAffinity: 0,
      fatigueScore: 0,
      franchiseContinuation: false,
    });
    if (weak.hiddenGemScore !== 0) {
      failures.push('low-quality title escaped the hidden-gem quality floor');
    }

    const sequel = runtime.scoreRecommendationExploration({
      anime: anime(9_000, 8.2),
      tasteAffinity: 0,
      completedAffinity: 0,
      studioAffinity: 0,
      formatAffinity: 0,
      eraAffinity: 0,
      negativeAffinity: 0,
      fatigueScore: 0,
      franchiseContinuation: true,
    });
    if (sequel.className !== 'safe' || sequel.hiddenGemScore !== 0) {
      failures.push('franchise continuation leaked into exploration/hidden gems');
    }
  } catch (error) {
    failures.push(
      `exploration runtime matrix failed: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
}

if (failures.length) {
  console.error('[AnimeBox Patch 22 Phase F] Controlled exploration check failed:');
  for (const failure of failures) console.error(` - ${failure}`);
  process.exit(1);
}

console.log(
  '[AnimeBox Patch 22 Phase F] 50/30/20→75/20/5 mix, hidden-gem quality floor, popularity correction, rails and telemetry passed.',
);
