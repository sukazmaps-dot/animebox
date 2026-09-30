import fs from 'node:fs';
import ts from 'typescript';

const read = (path) =>
  fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

const failures = [];
const explainability = read('lib/recommendation-explainability.ts');
const recommendations = read('lib/recommendations.ts');
const ranking = read('lib/recommendation-ranking-config.ts');
const personalization = read('lib/personalization.ts');
const card = read('components/SmartRecommendationCard.tsx');
const productClient = read('lib/product-events-client.ts');
const docs = read('docs/PATCH-22-DISCOVERY-RECOMMENDATIONS-3.md');

for (const [label, source, needle] of [
  ['explainability version', explainability, "RECOMMENDATION_EXPLAINABILITY_VERSION = '22.5-explain-v1'"],
  ['algorithm version', personalization, "RECOMMENDATION_ALGORITHM_VERSION = '22.6-v1'"],
  ['ranking version', ranking, "RECOMMENDATION_RANKING_VERSION = '22.6-v1'"],
  ['scored explanation builder', explainability, 'buildRecommendationExplanations'],
  ['weighted component reader', explainability, 'ranking.components[component]'],
  ['positive-only component evidence', explainability, 'Math.max(0, finite(ranking.components[component]))'],
  ['contribution share', explainability, 'contributionShare'],
  ['liked reference reason', explainability, 'который тебе понравился'],
  ['completed reason', explainability, 'Ты чаще досматриваешь'],
  ['length reason', explainability, 'Похожая длина — около'],
  ['franchise reason', explainability, 'Продолжение истории, которую ты уже смотрел'],
  ['exploration bridge', explainability, 'За пределами привычного'],
  ['hidden gem reason', explainability, 'Скрытая находка'],
  ['recommendations use engine', recommendations, 'buildRecommendationExplanations({'],
  ['specific liked-title evidence', recommendations, 'findLikedReferenceTitle'],
  ['strong named-title overlap gate', recommendations, 'if (overlap < 2 && affinity < 0.6) continue'],
  ['display studio label', recommendations, 'studioDisplayName(anime)'],
  ['display format label', recommendations, 'explanationFormatLabel(anime.format ?? anime.kind)'],
  ['reason from primary evidence', recommendations, 'reason: explainability.primary.text'],
  ['reason list from evidence', recommendations, 'reasons: explainability.items.map'],
  ['structured explanation payload', recommendations, 'explanations: explainability.items'],
  ['explanation version payload', recommendations, 'explanationVersion: explainability.version'],
  ['source from evidence', recommendations, 'const source = explainability.source'],
  ['card explanation key', card, 'data-explanation-key={primaryExplanation?.key}'],
  ['card explanation component', card, 'data-explanation-component={'],
  ['event explanation version', personalization, 'explanationVersion?: string'],
  ['event explanation key', personalization, 'explanationKey?: RecommendationExplanationKey'],
  ['telemetry explanation version', personalization, 'explanation_version: event.explanationVersion ?? null'],
  ['telemetry explanation key', personalization, 'explanation_key: event.explanationKey ?? null'],
  ['telemetry explanation contribution', personalization, 'explanation_contribution:'],
  ['playback explanation state', productClient, 'explanationVersion?: string | null'],
  ['playback explanation metadata', productClient, 'explanation_components:'],
  ['phase I docs', docs, '# 12. Phase I — Explainability 2.0'],
]) {
  if (!source.includes(needle)) {
    failures.push(`${label}: missing ${needle}`);
  }
}

if (recommendations.includes('function chooseReason(')) {
  failures.push('legacy chooseReason heuristic still bypasses the scored explainability engine');
}

if (recommendations.includes('reasons.push(')) {
  failures.push('ad-hoc reason pushes still bypass the explainability contract');
}

if (!failures.length) {
  try {
    const compiled = ts.transpileModule(explainability, {
      compilerOptions: {
        module: ts.ModuleKind.ESNext,
        target: ts.ScriptTarget.ES2022,
      },
    }).outputText;

    const runtime = await import(
      `data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`
    );

    const componentNames = [
      'genre',
      'tasteGraphPositive',
      'completedAffinity',
      'studioAffinity',
      'formatAffinity',
      'eraAffinity',
      'statusAffinity',
      'tasteGraphNegative',
      'metadataNegativeAffinity',
      'sessionNegativeAffinity',
      'sessionIntent',
      'completionLikelihood',
      'franchiseContinuation',
      'novelty',
      'hiddenGem',
      'popularityBias',
      'seasonalFreshness',
      'episodeLength',
      'episodeLengthNegative',
      'mood',
      'communityQuality',
      'shortFinished',
      'engagementPositive',
      'engagementNegative',
      'exposureFatigue',
      'discovery',
      'ongoing',
      'duplicateTitle',
    ];

    const makeRanking = (overrides = {}) => ({
      version: '22.6-v1',
      total: 1,
      components: Object.fromEntries(
        componentNames.map((name) => [name, overrides[name] ?? 0]),
      ),
    });

    const baseInput = {
      ranking: makeRanking({ discovery: 0.02 }),
      tasteMatches: [],
      completedMatches: [],
      likedReferenceTitle: null,
      moodLabel: null,
      studio: null,
      format: null,
      eraBucket: null,
      preferredEpisodeCount: null,
      completionRate: 0,
      bingeScore: 0,
      finished: false,
      episodeCount: null,
      sessionIntentScore: 0,
      sessionIntentConfidence: 0,
      franchiseContinuation: false,
      explorationClass: 'safe',
      hiddenGemScore: 0,
      popularityBand: 'unknown',
      seasonRelation: 'older',
      seasonalScore: 0,
      engagementScore: 0,
      communityQuality: 0,
    };

    const franchise = runtime.buildRecommendationExplanations({
      ...baseInput,
      ranking: makeRanking({
        franchiseContinuation: 0.24,
        genre: 0.12,
        discovery: 0.02,
      }),
      franchiseContinuation: true,
      tasteMatches: ['Action'],
    });

    if (
      franchise.primary.key !== 'franchise_continuation' ||
      franchise.source !== 'franchise' ||
      !franchise.primary.components.includes('franchiseContinuation')
    ) {
      failures.push('strong continuation evidence did not become the primary franchise explanation');
    }

    const fakeFranchise = runtime.buildRecommendationExplanations({
      ...baseInput,
      franchiseContinuation: true,
      ranking: makeRanking({ genre: 0.12, discovery: 0.02 }),
      tasteMatches: ['Drama'],
    });

    if (fakeFranchise.items.some((item) => item.key === 'franchise_continuation')) {
      failures.push('franchise copy appeared without a positive franchise ranking component');
    }

    const liked = runtime.buildRecommendationExplanations({
      ...baseInput,
      ranking: makeRanking({ tasteGraphPositive: 0.18, discovery: 0.02 }),
      tasteMatches: ['Thriller'],
      likedReferenceTitle: 'Monster',
    });

    if (
      liked.primary.key !== 'liked_reference' ||
      !liked.primary.text.includes('Monster') ||
      liked.source !== 'taste_graph'
    ) {
      failures.push('explicit liked-title reference is not grounded in positive taste contribution');
    }

    const fakeLiked = runtime.buildRecommendationExplanations({
      ...baseInput,
      likedReferenceTitle: 'Monster',
      ranking: makeRanking({ discovery: 0.02 }),
    });

    if (fakeLiked.items.some((item) => item.key === 'liked_reference')) {
      failures.push('liked-reference copy appeared without taste contribution');
    }

    const length = runtime.buildRecommendationExplanations({
      ...baseInput,
      ranking: makeRanking({ episodeLength: 0.07, discovery: 0.02 }),
      preferredEpisodeCount: 12,
      episodeCount: 13,
    });

    if (
      length.primary.key !== 'episode_length' ||
      !length.primary.text.includes('12')
    ) {
      failures.push('episode-length reason is not tied to the episodeLength component');
    }

    const fakeLength = runtime.buildRecommendationExplanations({
      ...baseInput,
      preferredEpisodeCount: 12,
      ranking: makeRanking({ discovery: 0.02 }),
    });

    if (fakeLength.items.some((item) => item.key === 'episode_length')) {
      failures.push('length reason appeared when ranking gave length zero contribution');
    }

    const seasonal = runtime.buildRecommendationExplanations({
      ...baseInput,
      ranking: makeRanking({ seasonalFreshness: 0.08, discovery: 0.02 }),
      seasonRelation: 'current',
      seasonalScore: 0.7,
    });

    if (seasonal.primary.key !== 'seasonal_match') {
      failures.push('current-season scored evidence did not produce a seasonal explanation');
    }

    const fakeSeasonal = runtime.buildRecommendationExplanations({
      ...baseInput,
      seasonRelation: 'current',
      seasonalScore: 0.8,
      ranking: makeRanking({ discovery: 0.02 }),
    });

    if (fakeSeasonal.items.some((item) => item.key === 'seasonal_match')) {
      failures.push('seasonal copy appeared without seasonal ranking contribution');
    }

    const hiddenGem = runtime.buildRecommendationExplanations({
      ...baseInput,
      ranking: makeRanking({ hiddenGem: 0.08, tasteGraphPositive: 0.04, discovery: 0.02 }),
      hiddenGemScore: 0.72,
      popularityBand: 'niche',
    });

    if (!hiddenGem.items.some((item) => item.key === 'hidden_gem')) {
      failures.push('qualified hidden-gem contribution has no explainable reason');
    }

    const exploration = runtime.buildRecommendationExplanations({
      ...baseInput,
      ranking: makeRanking({ novelty: 0.05, episodeLength: 0.04, discovery: 0.02 }),
      explorationClass: 'explore',
      preferredEpisodeCount: 12,
    });

    const bridge = exploration.items.find((item) => item.key === 'exploration_bridge');
    if (
      !bridge ||
      !bridge.components.includes('novelty') ||
      !bridge.components.includes('episodeLength') ||
      !bridge.text.includes('длиной')
    ) {
      failures.push('exploration bridge does not cite the actual familiar length component');
    }

    const negativeOnly = runtime.buildRecommendationExplanations({
      ...baseInput,
      ranking: makeRanking({
        tasteGraphNegative: -0.32,
        metadataNegativeAffinity: -0.16,
        episodeLengthNegative: -0.18,
        discovery: 0.02,
      }),
      tasteMatches: ['Action'],
      preferredEpisodeCount: 12,
    });

    if (
      negativeOnly.items.some((item) =>
        ['taste_genres', 'episode_length', 'studio_affinity'].includes(item.key)
      )
    ) {
      failures.push('negative ranking components leaked into positive user-facing explanations');
    }

    const many = runtime.buildRecommendationExplanations({
      ...baseInput,
      ranking: makeRanking({
        franchiseContinuation: 0.24,
        genre: 0.2,
        mood: 0.15,
        studioAffinity: 0.06,
        communityQuality: 0.08,
        discovery: 0.02,
      }),
      franchiseContinuation: true,
      tasteMatches: ['Drama'],
      moodLabel: 'Сильные эмоции',
      studio: 'Madhouse',
      communityQuality: 0.9,
    });

    if (many.items.length > 3) {
      failures.push('explainability returned more than three bounded reasons');
    }

    for (let index = 1; index < many.items.length; index += 1) {
      if (many.items[index].contribution > many.items[index - 1].contribution) {
        failures.push('reasons are no longer ordered by actual positive contribution');
        break;
      }
    }

    if (
      many.items.some(
        (item) =>
          item.contribution <= 0 ||
          item.contributionShare < 0 ||
          item.contributionShare > 1,
      )
    ) {
      failures.push('explanation contribution/share escaped bounded positive evidence');
    }
  } catch (error) {
    failures.push(
      `explainability runtime matrix failed: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
}

if (failures.length) {
  console.error('[AnimeBox Patch 22 Phase I] Explainability 2.0 check failed:');
  for (const failure of failures) console.error(` - ${failure}`);
  process.exit(1);
}

console.log(
  '[AnimeBox Patch 22 Phase I] scored reasons, anti-hallucination gates, source attribution and playback telemetry passed.',
);
