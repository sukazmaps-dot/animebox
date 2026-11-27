import { getCachedHomeChatTeaser } from '@/lib/chat-server';
import { publicApiCacheHeaders } from '@/lib/edge-cache-policy';

export async function GET() {
  const messages = await getCachedHomeChatTeaser();
  return Response.json(
    { messages },
    {
      headers: publicApiCacheHeaders({
        browserSeconds: 30,
        edgeSeconds: 60,
        staleWhileRevalidateSeconds: 300,
      }),
    },
  );
}
