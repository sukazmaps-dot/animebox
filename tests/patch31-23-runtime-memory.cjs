const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

function loadMemoryModule(memoryUsage, uptime) {
  const source = read('lib/process-memory.ts');
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
    },
  }).outputText;
  const context = {
    exports: {},
    process: {
      memoryUsage: () => memoryUsage,
      uptime: () => uptime,
    },
    Date,
    Number,
    Math,
  };
  vm.runInNewContext(compiled, context, { filename: 'lib/process-memory.ts' });
  return context.exports.getProcessMemorySnapshot();
}

const snapshot = loadMemoryModule({
  rss: 512_000_000,
  heapTotal: 160_000_000,
  heapUsed: 92_000_000,
  external: 48_000_000,
  arrayBuffers: 32_000_000,
}, 3_661.9);

assert.deepEqual(JSON.parse(JSON.stringify(snapshot)), {
  sampledAt: snapshot.sampledAt,
  uptimeSeconds: 3_661,
  rssBytes: 512_000_000,
  heapTotalBytes: 160_000_000,
  heapUsedBytes: 92_000_000,
  externalBytes: 48_000_000,
  arrayBuffersBytes: 32_000_000,
});
assert.match(snapshot.sampledAt, /^\\d{4}-\\d{2}-\\d{2}T/);

const sanitized = loadMemoryModule({
  rss: Number.NaN,
  heapTotal: -1,
  heapUsed: 0,
  external: Number.POSITIVE_INFINITY,
  arrayBuffers: undefined,
}, -10);
assert.equal(sanitized.rssBytes, 0);
assert.equal(sanitized.heapTotalBytes, 0);
assert.equal(sanitized.externalBytes, 0);
assert.equal(sanitized.arrayBuffersBytes, 0);
assert.equal(sanitized.uptimeSeconds, 0);

const types = read('lib/system-health.ts');
const server = read('lib/system-health-server.ts');
const route = read('app/api/admin/system-health/route.ts');
const dashboard = read('components/admin/SystemHealthDashboard.tsx');
const packageJson = JSON.parse(read('package.json'));
const workflow = read('.github/workflows/animebox-quality.yml');

assert.match(types, /processMemory:\\s*SystemProcessMemoryHealth/);
assert.match(server, /import \\{ getProcessMemorySnapshot \\} from '@\\/lib\\/process-memory';/);
const snapshotStart = server.indexOf('export async function getSystemHealthSnapshot()');
const memorySample = server.indexOf('const processMemory = getProcessMemorySnapshot();', snapshotStart);
const adminInit = server.indexOf('const admin = createSupabaseAdmin();', snapshotStart);
assert.ok(snapshotStart >= 0 && memorySample > snapshotStart && adminInit > memorySample,
  'memory must be sampled before diagnostics issue DB queries');
assert.match(server, /\\n    processMemory,/);
assert.match(route, /requireAdmin\\(\\['owner', 'admin'\\]\\)/);
assert.match(route, /Cache-Control': 'private, no-store'/);

for (const label of ['RSS процесса', 'Heap used / total', 'External', 'ArrayBuffers']) {
  assert.ok(dashboard.includes(label), 'dashboard must render ' + label);
}
assert.ok(dashboard.includes('ArrayBuffers уже входят в External'));
assert.equal(packageJson.scripts['patch31-23:check'], 'node tests/patch31-23-runtime-memory.cjs');
assert.ok(packageJson.scripts.prebuild.includes('npm run patch31-23:check'));
assert.ok(workflow.includes('npm run patch31-23:check'));
assert.ok(workflow.includes('lib/process-memory.ts'));

console.log('PASS Patch 31.23: Node process memory snapshot, finite-value guards, early sampling, private admin route and dashboard wiring.');
