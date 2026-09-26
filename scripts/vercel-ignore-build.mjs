const ref = (process.env.VERCEL_GIT_COMMIT_REF ?? '').trim();
const message = (process.env.VERCEL_GIT_COMMIT_MESSAGE ?? '').trim();
const forceBuild = process.env.ANIMEBOX_FORCE_VERCEL_BUILD === '1';

const isProductionBranch = ref === 'main';
const isPreviewBranch = /^preview-/i.test(ref);
const hasReleaseMarker = /\[(preview|deploy|vercel)\]/i.test(message);

// Vercel convention:
//   exit 0 -> ignore/skip this deployment
//   exit 1 -> continue with the build
//
// Release candidates use preview-* branches and build automatically. Explicit
// [preview]/[deploy]/[vercel] markers remain an escape hatch for other refs.
// Fail safe when Git metadata is unexpectedly unavailable: build rather than
// accidentally skipping a production deployment.
const shouldBuild =
  forceBuild ||
  !ref ||
  isProductionBranch ||
  isPreviewBranch ||
  hasReleaseMarker;

console.log(
  JSON.stringify(
    {
      animeboxVercelGate: 'release-only-v1',
      ref: ref || null,
      forceBuild,
      isProductionBranch,
      isPreviewBranch,
      hasReleaseMarker,
      decision: shouldBuild ? 'build' : 'skip',
    },
    null,
    2,
  ),
);

process.exit(shouldBuild ? 1 : 0);
