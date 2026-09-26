# AnimeBox Deployment Pipeline

## Why this exists

Vercel Git Integration creates a Preview deployment for every pushed commit.
AnimeBox patches are intentionally developed through multiple small commits and
the project has a large prebuild regression suite. Building every intermediate
commit caused:

- expected failures while a patch was only half-applied;
- noisy red deployment history;
- repeated execution of the entire regression suite;
- Vercel build-rate-limit exhaustion before the release-ready commit.

## Release-only Vercel gate

`vercel.json` uses:

`node scripts/vercel-ignore-build.mjs`

Vercel's Ignored Build Step convention is:

- exit 0 → skip deployment;
- exit 1 → continue build.

AnimeBox builds when one of these is true:

1. branch is `main`;
2. commit message contains `[preview]`, `[deploy]` or `[vercel]`;
3. `ANIMEBOX_FORCE_VERCEL_BUILD=1`;
4. Git branch metadata is unexpectedly unavailable (fail-safe build).

Every other feature-branch commit is skipped.

## Working patch workflow

1. Create one feature branch.
2. Make implementation commits without release markers.
3. Run static/source/database audits while developing.
4. When the patch is internally complete, create one final no-op commit:
   `[preview] Patch X — release candidate`
5. Vercel runs the full prebuild + Next production build exactly once.
6. Fix any real release-gate failure, then create another `[preview]` commit.
7. Merge only after a successful Preview.
8. The merge commit on `main` always deploys production automatically.

## Commit batching

When several files belong to one logical change, prefer one Git tree/commit
instead of one commit per file. This keeps history coherent and prevents CI
churn on systems other than Vercel too.

## What remains blocking

Skipping intermediate Preview deployments does NOT weaken the final release
gate. Production and explicit release-candidate previews still run the full
AnimeBox prebuild regression chain and Next.js production build.
