import fs from 'node:fs';

const read = (path) =>
  fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

const failures = [];
const discovery = read('components/home/HomeDiscoverySection.tsx');
const runtime = read('components/home/useHomeRecommendationRuntime.ts');
const feed = read('components/SmartRecommendationFeed.tsx');
const rails = read('lib/recommendation-rails.ts');
const teaser = read('components/chat/HomeChatTeaser.tsx');
const chatPage = read('app/chat/page.tsx');
const chat = read('components/chat/GlobalChatV11Client.tsx');

for (const [label, source, needle] of [
  ['instant recommendation mount', discovery, 'data-loading-policy="instant-after-ranking"'],
  ['background rerank freeze', runtime, 'recommendationsReady &&'],
  ['ranked mood lock', runtime, 'lastRankedMoodRef.current === mood'],
  ['faster initial rank', runtime, '{ timeout: 650 }'],
  ['stable parent append', feed, 'setRecommendations((current) => mergeUnique(current, unseen))'],
  ['stable pagination append', feed, 'setRecommendations((current) => mergeUnique(current, fresh))'],
  ['latest graph future scoring', feed, 'latestTasteGraphRef.current'],
  ['stable rail order', feed, 'railOrderRef.current'],
  ['candidate warmup', feed, 'prefetchCandidatePage(pointerRef.current, bucket, context)'],
  ['minimum rail density', feed, 'MIN_INITIAL_RAIL_ITEMS = 5'],
  ['sparse preload margin', feed, "SPARSE_RAIL_ROOT_MARGIN = '520px 0px'"],
  ['relaxed bootstrap', feed, 'attempt >= Math.max(0, bootstrapPageHops - 1)'],
  ['no populated skeleton flash', feed, 'rail.items.length === 0 &&'],
  ['stable endless copy', rails, 'не переставляя уже показанные карточки'],
  ['idle Home chat teaser', teaser, 'requestIdleCallback(run, { timeout: 900 })'],
  ['bounded initial chat history', chatPage, 'getChatMessagesPage({ limit: 24 })'],
  ['Realtime first-paint gate', chat, 'realtimeReady'],
  ['Realtime idle timeout', chat, 'timeout: 550'],
]) {
  if (!source.includes(needle)) {
    failures.push(`${label}: missing ${needle}`);
  }
}

if (discovery.includes('<DeferredMount')) {
  failures.push('recommendation surface still has a second DeferredMount gate');
}
if (teaser.includes('6_000')) {
  failures.push('Home chat teaser still uses the old six-second delay');
}

const freshBlock =
  feed.match(/if \(fresh\.length\) \{[\s\S]*?setExhaustedRails/)?.[0] ?? '';
if (freshBlock.includes('getPersonalizedRecommendations(')) {
  failures.push('candidate pagination still reranks the full visible pool');
}

if (failures.length) {
  console.error('[AnimeBox Patch 23.0.1] regression failed:');
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log(
  '[AnimeBox Patch 23.0.1] stable rails, sparse recovery and chat fast boot passed.',
);
