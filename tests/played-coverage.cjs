const ts = require('typescript');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const code = ts.transpileModule(fs.readFileSync(path.join(__dirname, '../lib/played-coverage.ts'), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS },
}).outputText;
const target = { exports: {} };
new Function('exports', 'module', code)(target.exports, target);
const { mergePlayedRanges, coveredSeconds } = target.exports;
let ranges = mergePlayedRanges([], 0, 10);
ranges = mergePlayedRanges(ranges, 20, 30);
assert.equal(coveredSeconds(ranges), 20, 'A seek must leave an unwatched gap');
ranges = mergePlayedRanges(ranges, 0, 10);
assert.equal(coveredSeconds(ranges), 20, 'Replay must not double count');
ranges = mergePlayedRanges(ranges, 8, 22);
assert.equal(coveredSeconds(ranges), 30, 'Overlapping ranges form a union');
assert.equal(coveredSeconds(mergePlayedRanges(ranges, NaN, 40)), 30);
console.log('PASS: played coverage, seek, replay and invalid ranges');
