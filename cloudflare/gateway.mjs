import { runWithCloudflareRequestContext } from '../.open-next/cloudflare/init.js';
import { handler as middlewareHandler } from '../.open-next/middleware/handler.mjs';
import { runScheduled } from './cron.mjs';
import { selectGroup, bindingFor } from './route-groups.mjs';
export { DOQueueHandler } from '../.open-next/.build/durable-objects/queue.js';
export { DOShardedTagCache } from '../.open-next/.build/durable-objects/sharded-tag-cache.js';
export { BucketCachePurge } from '../.open-next/.build/durable-objects/bucket-cache-purge.js';
export default {
  scheduled(controller, env) { return runScheduled(controller, env); },
  async fetch(request, env, ctx) {
    return runWithCloudflareRequestContext(request, env, ctx, async () => {
      const routed = await middlewareHandler(request, env, ctx);
      if (routed instanceof Response) return routed;
      const name = selectGroup(new URL(routed.url).pathname);
      const server = env[bindingFor(name)];
      if (!server) return new Response('Server binding unavailable', { status: 503 });
      return server.fetch(routed, { redirect: 'manual' });
    });
  },
};
