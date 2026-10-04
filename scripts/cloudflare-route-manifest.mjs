import { readFileSync, writeFileSync } from 'node:fs';
import { groups, selectGroup } from '../cloudflare/route-groups.mjs';
const assignments = Object.fromEntries(groups.map(group => [group.name, []]));
const manifest = JSON.parse(readFileSync('.next/server/app-paths-manifest.json', 'utf8'));
for (const [route, output] of Object.entries(manifest)) {
  const pathname = route.replaceAll('\\', '/').replace(/\/(page|route)$/, '').replace(/\([^/]+\)\//g, '');
  const group = selectGroup(pathname);
  if (group !== 'default') assignments[group].push(output.replaceAll('\\', '/').replace(/\.js$/, ''));
}
writeFileSync('cloudflare/split-routes.json', JSON.stringify(assignments, null, 2) + '\n');
console.log('Generated all actual Next routes, including dynamic metadata: ' + Object.keys(manifest).length);
