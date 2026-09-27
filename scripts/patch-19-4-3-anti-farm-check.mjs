import fs from 'node:fs';

const trust = fs.readFileSync('lib/watch-trust.ts', 'utf8');
const trustServer = fs.readFileSync('lib/watch-trust-server.ts', 'utf8');
const watchRoute = fs.readFileSync('app/api/watch/route.ts', 'utf8');
const leaderboard = fs.readFileSync('app/api/community/leaderboard/route.ts', 'utf8');
const rewards = fs.readFileSync('lib/leaderboard-rewards-server.ts', 'utf8');

const failures = [];

if (
  !trust.includes("export type WatchTrustState = 'normal' | 'suspicious' | 'high_risk'") ||
  !trust.includes('rewardEligible: state !== \'high_risk\'') ||
  !trust.includes('accepted_time_over_wall_clock') ||
  !trust.includes('accelerated_with_rejections')
) {
  failures.push('pure trust scorer contract is incomplete');
}

if (
  !trustServer.includes("eventName: 'watch_trust_assessed'") ||
  !trustServer.includes("phase: input.phase") ||
  !trustServer.includes('getHighRiskUsersFromTrustEvents')
) {
  failures.push('trust telemetry/server assessment contract is incomplete');
}

if (
  !watchRoute.includes("phase: 'completion'") ||
  !watchRoute.includes("phase: 'session_end'") ||
  !watchRoute.includes('if (trust.rewardEligible)') ||
  !watchRoute.includes('competitive completion rewards quarantined') ||
  !watchRoute.includes('competitive session rewards quarantined')
) {
  failures.push('watch reward quarantine is not enforced');
}

if (
  !leaderboard.includes('getHighRiskUsersFromTrustEvents') ||
  !leaderboard.includes('const trustedRows = rows.filter') ||
  !leaderboard.includes('rank: index + 1')
) {
  failures.push('live leaderboard trust filter is missing');
}

if (
  !rewards.includes('getHighRiskUsersFromTrustEvents') ||
  !rewards.includes('const eligibleEntries =') ||
  !rewards.includes('quarantined: highRiskUsers.size')
) {
  failures.push('season reward trust quarantine is missing');
}

if (failures.length) {
  console.error('Patch 19.4.3 Anti-Farm Trust Engine check failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log('PASS: Patch 19.4.3 Anti-Farm Trust Engine integration');
