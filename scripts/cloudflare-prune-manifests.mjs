import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
export function pruneManifests(options, name = 'default') {
  const assigned = options.config.functions ?? {};
  const owner = route => Object.entries(assigned).find(([, fn]) => fn.routes.includes(route))?.[0] ?? 'default';
  const base = resolve(options.outputDir, 'server-functions/' + name + '/.next/server');
  const file = resolve(base, 'app-paths-manifest.json');
  if (!existsSync(file)) return;
  const source = JSON.parse(readFileSync(file, 'utf8'));
  const filtered = Object.fromEntries(Object.entries(source).filter(([key, value]) => owner(value.replace(/\.js$/, '')) === name || /\/_not-found\/page$|\/_global-error\/page$/.test(key)));
  writeFileSync(file, JSON.stringify(filtered));
}
