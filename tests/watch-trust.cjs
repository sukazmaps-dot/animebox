const ts = require('typescript');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

const code = ts.transpileModule(
  fs.readFileSync(path.join(__dirname, '../lib/watch-trust.ts'), 'utf8'),
  { compilerOptions: { module: ts.ModuleKind.CommonJS } },
).outputText;

const target = { exports: {} };
new Function('exports', 'module', code)(target.exports, target);

const {
  assessWatchTrust,
  emptyWatchTrustMetrics,
  minimumCompletionDemandMs,
  WATCH_TRUST_VERSION,
} = target.exports;

assert.equal(WATCH_TRUST_VERSION, 'watch-trust-v1');

const normal = assessWatchTrust({
  ...emptyWatchTrustMetrics(),
  heartbeatCount: 18,
  acceptedHeartbeatCount: 17,
  acceptedMs: 330_000,
  sessionWallMs: 350_000,
  recentSessions60m: 2,
});
assert.equal(normal.state, 'normal');
assert.equal(normal.rewardEligible, true);

const honestDoubleSpeed = assessWatchTrust({
  ...emptyWatchTrustMetrics(),
  heartbeatCount: 18,
  acceptedHeartbeatCount: 18,
  acceleratedHeartbeatCount: 17,
  acceptedMs: 350_000,
  sessionWallMs: 370_000,
  recentSessions60m: 2,
});
assert.equal(
  honestDoubleSpeed.state,
  'normal',
  'legitimate 2x playback alone must not become suspicious',
);
assert.equal(honestDoubleSpeed.rewardEligible, true);

const suspiciousSeeks = assessWatchTrust({
  ...emptyWatchTrustMetrics(),
  heartbeatCount: 10,
  acceptedHeartbeatCount: 6,
  seekForwardCount: 3,
  tooSoonCount: 1,
  acceptedMs: 110_000,
  sessionWallMs: 220_000,
});
assert.equal(suspiciousSeeks.state, 'suspicious');
assert.equal(
  suspiciousSeeks.rewardEligible,
  true,
  'suspicious heuristics are observable but must not auto-punish users',
);

const blatantFarm = assessWatchTrust({
  ...emptyWatchTrustMetrics(),
  heartbeatCount: 14,
  acceptedHeartbeatCount: 4,
  acceleratedHeartbeatCount: 4,
  seekForwardCount: 8,
  tooSoonCount: 2,
  acceptedMs: 70_000,
  sessionWallMs: 280_000,
});
assert.equal(blatantFarm.state, 'high_risk');
assert.equal(blatantFarm.rewardEligible, false);

const impossibleClock = assessWatchTrust({
  ...emptyWatchTrustMetrics(),
  heartbeatCount: 10,
  acceptedHeartbeatCount: 10,
  acceptedMs: 240_000,
  sessionWallMs: 180_000,
});
assert.equal(impossibleClock.state, 'high_risk');
assert.equal(impossibleClock.rewardEligible, false);
assert.ok(
  impossibleClock.signals.some(
    (signal) => signal.code === 'accepted_time_over_wall_clock',
  ),
);

const churnPlusCompletionPressure = assessWatchTrust({
  ...emptyWatchTrustMetrics(),
  heartbeatCount: 20,
  acceptedHeartbeatCount: 20,
  acceptedMs: 380_000,
  sessionWallMs: 400_000,
  recentSessions60m: 25,
  recentCompletions60m: 10,
  completionDemandMs60m: 91 * 60_000,
});
assert.equal(churnPlusCompletionPressure.state, 'high_risk');
assert.equal(churnPlusCompletionPressure.rewardEligible, false);

assert.equal(minimumCompletionDemandMs(1_440_000), 504_000);
assert.equal(minimumCompletionDemandMs(90_000), 45_000);
assert.equal(minimumCompletionDemandMs(null), 0);

console.log('PASS: AnimeBox watch trust scorer and reward quarantine');
