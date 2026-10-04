import { runWithCloudflareRequestContext } from '../../.open-next/cloudflare/init.js';
import { handler } from '../../.open-next/server-functions/pages_admin/handler.mjs';
export default { async fetch(request, env, ctx) {
  return runWithCloudflareRequestContext(request, env, ctx, () => handler(request, env, ctx, request.signal));
}};
