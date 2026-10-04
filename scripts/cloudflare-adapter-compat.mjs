import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
const require = createRequire(import.meta.url);
// 1.20.8 scans all OG traces, including routes excluded from a split function.
// Scope that scan to routes actually present in the current function.
export function applySplitTraceFix() {
  const dist = resolve(dirname(require.resolve('@opennextjs/cloudflare')), '..');
  const version = JSON.parse(readFileSync(resolve(dist, '../package.json'), 'utf8')).version;
  if (version !== '1.20.8') throw new Error('Revalidate adapter compatibility before changing its version');
  const file = resolve(dist, 'cli/build/patches/ast/patch-vercel-og-library.js');
  const original = readFileSync(file, 'utf8');
  const anchor = '        // Look for the Node version of the traced @vercel/og files';
  if (!original.includes(anchor)) throw new Error('Adapter OG implementation changed');
  const guard = `        const splitName = buildOpts.splitFunctionName ?? "default";
        const scopedRouteName = path.relative(path.join(appBuildOutputPath, ".next/server"), traceInfoPath).split(path.sep).join("/").replace(/\\.js\\.nft\\.json$/, "");
        const splitFunctions = buildOpts.config.functions ?? {};
        const assignedTo = Object.entries(splitFunctions).find(([, fn]) => fn.routes.includes(scopedRouteName))?.[0] ?? "default";
        if (assignedTo !== splitName) continue;
`;
  writeFileSync(file, original.replace(anchor, guard + anchor));
  const bundler = resolve(dist, 'cli/build/bundle-server.js');
  const bundleOriginal = readFileSync(bundler, 'utf8');
  const hook = '    copyPackageCliFiles(packageDistDir, buildOpts);';
  if (!bundleOriginal.includes(hook)) throw new Error('Adapter bundler implementation changed');
  const helper = new URL('./cloudflare-prune-manifests.mjs', import.meta.url).href;
  writeFileSync(bundler, bundleOriginal.replace(hook,
    `    const { pruneManifests } = await import(${JSON.stringify(helper)});\n    pruneManifests(buildOpts, buildOpts.splitFunctionName ?? "default");\n` + hook));
  const backups = new Map([[file, original], [bundler, bundleOriginal]]);
  // traverseFiles uses platform separators. Normalize before subtracting
  // explicitly assigned routes, otherwise Windows traces every route into default.
  const splitter = resolve(dist, 'cli/build/open-next/createServerBundle.js');
  const splitterOriginal = readFileSync(splitter, 'utf8');
  const routeExpression = 'relativePath.replace(/\\.js$/, "")';
  if (!splitterOriginal.includes(routeExpression)) {
    writeFileSync(file, original); writeFileSync(bundler, bundleOriginal);
    throw new Error('Adapter route splitter implementation changed');
  }
  backups.set(splitter, splitterOriginal);
  writeFileSync(splitter, splitterOriginal.replaceAll(routeExpression,
    'relativePath.split(path.sep).join("/").replace(/\\.js$/, "")'));

  function walk(dir) { return readdirSync(dir, {withFileTypes:true}).flatMap(e => e.isDirectory() ? walk(resolve(dir,e.name)) : [resolve(dir,e.name)]); }
  for (const target of walk(resolve(dist, 'cli/build'))) {
    if (!target.endsWith('.js')) continue;
    const before = readFileSync(target,'utf8');
    const after = before.replaceAll('"server-functions/default"', '"server-functions/" + (buildOpts.splitFunctionName ?? "default")').replaceAll('"server-functions", "default"', '"server-functions", buildOpts.splitFunctionName ?? "default"');
    if (after !== before) { if (!backups.has(target)) backups.set(target,before); writeFileSync(target,after); }
  }
  return () => { for (const [target, contents] of backups) writeFileSync(target, contents); };
}
