import { defineCloudflareConfig } from '@opennextjs/cloudflare';
import r2IncrementalCache from '@opennextjs/cloudflare/overrides/incremental-cache/r2-incremental-cache';
import { groups } from './cloudflare/route-groups.mjs';
import routes from './cloudflare/split-routes.json';
const config = defineCloudflareConfig({ incrementalCache: r2IncrementalCache });
config.functions = Object.fromEntries(groups.map(group => [group.name, {
  ...config.default,
  routes: routes[group.name as keyof typeof routes] as `app/${string}/page`[],
  patterns: group.prefixes.map(prefix => prefix + '/*'),
}]));
export default config;
