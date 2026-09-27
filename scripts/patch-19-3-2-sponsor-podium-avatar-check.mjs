import fs from 'node:fs';

const component = fs.readFileSync(
  'components/monetization/SponsorLeaderboard.tsx',
  'utf8',
);
const css = fs.readFileSync(
  'components/monetization/SponsorLeaderboard.module.css',
  'utf8',
);

for (const needle of [
  'data-podium-avatar-stage',
  'data-podium-rank={entry.rank}',
  'data-podium-rank-seal',
]) {
  if (!component.includes(needle)) {
    throw new Error(`Patch 19.3.2 podium markup invariant missing: ${needle}`);
  }
}

for (const needle of [
  '--podium-avatar-size:96px',
  'display:flex',
  'align-items:center',
  'justify-content:center',
  'width:var(--podium-avatar-size)',
  'height:var(--podium-avatar-size)',
  "podiumCard[data-rank='1'] .podiumAvatar",
  '--podium-avatar-size:118px',
  '--podium-avatar-size:124px',
  '--podium-avatar-size:112px',
]) {
  if (!css.includes(needle)) {
    throw new Error(`Patch 19.3.2 avatar stage invariant missing: ${needle}`);
  }
}

for (const needle of [
  'flex:0 0 100%!important',
  'width:100%!important',
  'height:100%!important',
  'transform-origin:50% 50%!important',
  'overflow:visible!important',
]) {
  if (!css.includes(needle)) {
    throw new Error(`Patch 19.3.2 frame centering invariant missing: ${needle}`);
  }
}

for (const needle of [
  'left:50%',
  'right:auto',
  'bottom:0',
  'z-index:30',
  'transform:translateX(-50%)',
  'pointer-events:none',
]) {
  if (!css.includes(needle)) {
    throw new Error(`Patch 19.3.2 rank seal invariant missing: ${needle}`);
  }
}

if (css.includes('right:-2px')) {
  throw new Error('Patch 19.3.2 legacy right-anchored rank seal returned.');
}

if (css.includes(".podiumCard[data-rank='1'] .avatarFrame{\n  width:118px!important;")) {
  throw new Error('Patch 19.3.2 frame size must be owned by the parent stage.');
}

console.log('Patch 19.3.2 sponsor podium avatar geometry invariants OK');
