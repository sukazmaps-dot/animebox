# AnimeBox Deployment Pipeline

## Problem this fixes

Vercel Git Integration normally creates a Preview deployment for every pushed
commit. AnimeBox patches are developed through many implementation commits and
the project runs a large prebuild regression suite. Building every intermediate
commit caused:

- expected failures while a patch was only half-applied;
- noisy red deployment history;
- repeated execution of the full regression suite;
- build-rate-limit exhaustion before the release-ready commit.

## Branch policy

`vercel.json` now disables Git deployments for every working patch branch:

```json
"git": {
  "deploymentEnabled": {
    "patch-*": false
  }
}
```

Vercel uses minimatch for these branch rules, so all branches such as
`patch-18-5-6-1-recommendation-media-recovery` are excluded before a Preview
build is created.

`main` is not matched and therefore still deploys production normally.

## Release candidate policy

Final Preview builds happen on a separate `preview-*` branch.

The project also uses:

`node scripts/vercel-ignore-build.mjs`

Vercel's Ignored Build Step convention is:

- exit 0 → skip deployment build;
- exit 1 → continue build.

The ignore script allows a build when:

1. branch is `main`;
2. commit message contains `[preview]`, `[deploy]` or `[vercel]`;
3. `ANIMEBOX_FORCE_VERCEL_BUILD=1`;
4. Git metadata is unexpectedly unavailable (fail-safe build).

Therefore a release candidate is created as:

1. finish work on `patch-X`;
2. create `preview-X` from the exact patch head;
3. create one no-op commit with message `[preview] Patch X — release candidate`;
4. Vercel runs the full prebuild + Next production build exactly once;
5. if it passes, merge the tested tree into `main`.

## Commit batching

Several files belonging to one logical change should be written as one Git
tree/commit. Do not create one remote commit per file unless sequencing is
actually required.

This reduces Git noise and protects other CI providers from the same churn.

## Safety

This does **not** weaken the final release gate.

Working patch commits skip Vercel entirely, but:

- explicit `preview-*` release candidates run the full prebuild chain;
- `main` always builds;
- production deploy remains blocked by real build/compiler errors.

The change only removes meaningless builds of knowingly incomplete commits.
