import { getCachedHomeChatTeaser } from '@/lib/chat-server';

export async function GET() {
  const messages = await getCachedHomeChatTeaser();
  return Response.json(
    { messages },
    {
      headers: {
        'Cache-Control': 'public, max-age=30, s-maxage=60, stale-while-revalidate=300',
      },
    },
  );
}
