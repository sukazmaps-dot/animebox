# Patch 18.6.1 — Release Consolidation / Zero Broken Deploys

## Objective

Turn the current linear chain

`main → 18.5.6 Production Readiness → 18.5.6.2 Release Recovery → 18.6 Watch Together Reliability`

into one canonical release candidate that can be verified once and merged into
`main` without rebuilding intermediate patch commits or guessing which branch
contains the complete product state.

The patch intentionally adds no user-facing feature. Its output is a safer
release process.

## Baseline

- Production base: `main` at Patch 18.5.5.5.
- Consolidated source: `patch-18-6-watch-together-reliability-final`.
- The source is a strict descendant of `main`: no behind commits and no
  divergent history.
- Node runtime contract: `22.x`.
- Working `patch-*` branches must not create Vercel deployments.
- Release `preview-*` branches must build automatically.

## Required changes

### 1. Canonical release branch

Create `patch-18-6-1-release-consolidation` from the exact Patch 18.6 head.
Do not cherry-pick or recreate the previous 18.5.6/18.5.6.2/18.6 changes.

The branch must remain a strict fast-forward descendant of `main`.

### 2. One release PR

The only release PR for this chain must target `main`.

That PR is the source of truth for:
- TypeScript;
- targeted ESLint;
- retention regression tests;
- full `npm run build`;
- all prebuild regression gates.

Older stacked PRs remain historical implementation branches and must not be
merged independently once the canonical release PR exists.

### 3. Early release-invariant gate

Add `scripts/release-consolidation-check.mjs` and run it as the first prebuild
gate.

It must fail closed when:
- Node is not pinned to 22.x;
- a prebuild command references a missing npm script;
- the prebuild chain contains duplicate gates;
- Vercel no longer blocks `patch-*` branches;
- Vercel cannot build `preview-*` or `main`;
- the configured ignore command changes unexpectedly;
- GitHub's release workflow loses Node 22, TypeScript, ESLint, retention, or
  production-build coverage;
- deployment documentation drifts from executable behavior.

### 4. Deterministic Vercel preview policy

Keep automatic Git deployments disabled for `patch-*`.

Change the ignored-build gate so that:
- `main` always builds;
- every `preview-*` branch builds automatically;
- explicit `[preview]`, `[deploy]`, `[vercel]` commit markers remain an
  escape hatch;
- `ANIMEBOX_FORCE_VERCEL_BUILD=1` remains an emergency override;
- missing Git metadata fails safe by building.

A release must no longer require a dummy/no-op commit merely to make Vercel
notice the preview.

### 5. Preview identity

The preview branch must be created only after the GitHub quality gate is green
and must point to the exact green release head SHA.

No code edits are allowed directly on the preview branch.

### 6. Production identity

After browser smoke passes, `main` must receive the exact tested release tree.
If release code changes after preview, the preview is invalid and must be
recreated from the new head.

## Verification matrix

### Static pipeline gate
- `npm run release-consolidation:check`

### Compiler / lint
- Node 22
- `npm ci`
- `npx tsc --noEmit`
- targeted ESLint from `.github/workflows/animebox-quality.yml`

### Regression
- `node tests/retention.cjs`
- all scripts in `prebuild`
- especially:
  - production readiness;
  - release recovery;
  - media reliability;
  - home hydration/discovery;
  - Watch Together stability;
  - opening-skip safety;
  - catalog integrity;
  - security boundaries.

### Build
- `npm run build`
- no TypeScript/build errors;
- no missing environment crash during static generation;
- no gate silently skipped.

### Preview smoke
Desktop + mobile:
1. Home.
2. Catalog/search.
3. Anime page.
4. Episode/player.
5. Continue watching.
6. Recommendations.
7. Login/profile.
8. Watch Together host + guest.
9. Public rooms.
10. Image delivery/fallback.
11. Password/auth redirects.
12. No console-blocking hydration/runtime regression.

## Acceptance criteria

Patch 18.6.1 is complete only when:
- one PR to `main` represents the entire 18.5.6 → 18.6 chain;
- its GitHub quality gate is green;
- a `preview-18-6-1-*` branch is built by Vercel without a marker commit;
- browser smoke passes on the exact preview SHA;
- the exact tested tree is ready to merge to `main`;
- no SQL migration is introduced by this consolidation patch.

## Rollback

If production fails after merge:
1. do not patch production blindly;
2. identify the last known-good production deployment;
3. roll back deployment;
4. create a new patch branch from current `main`;
5. reproduce the failure under the same release gate before redeploying.
