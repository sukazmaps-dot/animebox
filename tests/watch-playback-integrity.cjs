const ts = require('typescript');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

const code = ts.transpileModule(
  fs.readFileSync(path.join(__dirname, '../lib/watch-playback-integrity.ts'), 'utf8'),
  { compilerOptions: { module: ts.ModuleKind.CommonJS } },
).outputText;

const target = { exports: {} };
new Function('exports', 'module', code)(target.exports, target);

const {
  MAX_SUPPORTED_PLAYBACK_RATE,
  PLAYBACK_RATE_TOLERANCE,
  maxPlausiblePlaybackAdvanceMs,
  inspectPlaybackAdvance,
  acceptedRealWatchMs,
} = target.exports;

assert.equal(MAX_SUPPORTED_PLAYBACK_RATE, 2);
assert.equal(PLAYBACK_RATE_TOLERANCE, 0.25);

const normal = inspectPlaybackAdvance({
  wallDeltaMs: 20_000,
  mediaAdvanceMs: 20_000,
});
assert.equal(normal.plausible, true, '1x playback must remain valid');
assert.equal(normal.accelerated, false, '1x playback must not be marked accelerated');
assert.equal(acceptedRealWatchMs(20_000), 20_000);

const doubleSpeed = inspectPlaybackAdvance({
  wallDeltaMs: 20_000,
  mediaAdvanceMs: 40_000,
});
assert.equal(doubleSpeed.plausible, true, '2x playback must remain valid');
assert.equal(doubleSpeed.accelerated, true, '2x playback should be observable as accelerated');
assert.equal(doubleSpeed.inferredRate, 2);
assert.equal(
  acceptedRealWatchMs(20_000),
  20_000,
  '2x playback must never double wall-clock watch-time',
);

const halfSpeed = inspectPlaybackAdvance({
  wallDeltaMs: 20_000,
  mediaAdvanceMs: 10_000,
});
assert.equal(halfSpeed.plausible, true, '0.5x playback must remain valid');
assert.equal(
  acceptedRealWatchMs(20_000),
  20_000,
  'slow playback still earns the real active wall-clock time',
);

assert.equal(maxPlausiblePlaybackAdvanceMs(20_000), 46_500);

const impossible = inspectPlaybackAdvance({
  wallDeltaMs: 20_000,
  mediaAdvanceMs: 47_000,
});
assert.equal(
  impossible.plausible,
  false,
  'timeline advances beyond the 2x+tolerance envelope must be rejected',
);

assert.equal(
  acceptedRealWatchMs(45_000),
  20_000,
  'one delayed heartbeat cannot mint more than the accepted-time cap',
);

console.log('PASS: playback-rate integrity, 2x neutrality and impossible-delta rejection');
