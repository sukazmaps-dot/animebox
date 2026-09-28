import fs from 'node:fs';

function read(path) {
  return fs.readFileSync(path, 'utf8');
}

const failures = [];
const need = (label, source, needles) => {
  for (const needle of needles) {
    if (!source.includes(needle)) {
      failures.push(`${label}: missing ${needle}`);
    }
  }
};
const reject = (label, source, needles) => {
  for (const needle of needles) {
    if (source.includes(needle)) {
      failures.push(`${label}: forbidden ${needle}`);
    }
  }
};

const rewards = read('lib/leaderboard-rewards-server.ts');
const frames = read('lib/profile-frames.ts');
const communityServer = read('lib/community-comments-server.ts');
const episodeApi = read('app/api/comments/route.ts');
const communityTypes = read('types/community-comments.ts');
const animeComments = read('components/AnimeComments.tsx');
const episodeComments = read('components/EpisodeComments.tsx');
const renderer = read('components/identity/CommentAvatarFrame.tsx');
const rendererCss = read('components/identity/CommentAvatarFrame.module.css');
const staticChampion = read('public/brand/frames/league/league-champion-static.svg');

need('batch frame resolver', rewards, [
  'export async function getSelectedProfileFrames',
  ".from('profile_cosmetic_preferences')",
  ".from('profile_cosmetic_unlocks')",
  ".from('user_progression')",
  ".in('user_id', ids)",
  'return result;',
]);

need('compact frame asset policy', frames, [
  'COMPACT_PROFILE_FRAME_ASSETS',
  '/brand/frames/league/league-champion-static.svg',
  '/brand/frames/milestone/free/lv100-absolute-prestige.svg',
  'compactProfileFrameAsset',
]);

need('title comment enrichment', communityServer, [
  'getSelectedProfileFrames(ids)',
  'profileFrameKey: frameByUser.get(profile.id) ?? null',
]);

need('episode comment enrichment', episodeApi, [
  'getSelectedProfileFrames(userIds)',
  'profileFrameKey:',
  'frameByUser.get(comment.user_id) ?? null',
  'getSelectedProfileFrames([profile.id])',
]);

need('public comment identity contract', communityTypes, [
  'profileFrameKey: ProfileFrameKey | null',
]);

need('title comment frame UI', animeComments, [
  'CommentAvatarFrameShell',
  'frameKey={comment.author?.profileFrameKey}',
]);

need('episode comment frame UI', episodeComments, [
  'CommentAvatarFrameShell',
  'frameKey={comment.author?.profileFrameKey}',
  'profileFrameKey: ProfileFrameKey | null',
]);

need('lightweight renderer', renderer, [
  'compactProfileFrameAsset',
  'loading="lazy"',
  'decoding="async"',
  'fetchPriority="low"',
  'data-comment-profile-frame',
]);

reject('lightweight renderer', renderer, [
  'useEffect(',
  'useState(',
  'requestAnimationFrame(',
]);

need('compact geometry', rendererCss, [
  'contain: layout style',
  'pointer-events: none',
  'isolation: isolate',
]);

reject('static champion frame', staticChampion, [
  '@keyframes',
  'animation:',
]);

for (const [label, source] of [
  ['title comment server', communityServer],
  ['episode comment API', episodeApi],
]) {
  if (/getSelectedProfileFrame\s*\(/.test(source)) {
    failures.push(`${label}: per-user getSelectedProfileFrame call would reintroduce N+1 queries`);
  }
}

if (failures.length) {
  console.error('[AnimeBox Patch 20.6 Comment Identity] Check failed:');
  for (const failure of failures) console.error(` - ${failure}`);
  process.exit(1);
}

console.log('[AnimeBox Patch 20.6 Comment Identity] Check passed.');
