import { adminClient, failure, response, userClient } from '@/lib/community-server';

export async function GET() {
  try {
    const { user } = await userClient();
    const admin = adminClient();

    const { data: unlocks, error: unlockError } = await admin
      .from('user_episode_events')
      .select('event_id,unlocked_at')
      .eq('user_id', user.id)
      .order('unlocked_at', { ascending: false })
      .limit(300);

    if (unlockError) throw unlockError;
    const ids = (unlocks ?? []).map((row) => row.event_id);
    if (!ids.length) return response({ events: [] });

    const { data: events, error: eventsError } = await admin
      .from('episode_events')
      .select('id,anime_id,episode_number,event_key,kind,title,description,rarity,image_url')
      .in('id', ids)
      .eq('status', 'approved');

    if (eventsError) throw eventsError;

    const unlockedAt = new Map(
      (unlocks ?? []).map((row) => [String(row.event_id), String(row.unlocked_at)]),
    );

    return response({
      events: (events ?? [])
        .map((event) => ({
          id: event.id,
          animeId: Number(event.anime_id),
          episode: Number(event.episode_number),
          eventKey: event.event_key,
          kind: event.kind,
          title: event.title,
          description: event.description,
          rarity: event.rarity,
          imageUrl: event.image_url,
          unlockedAt: unlockedAt.get(String(event.id)) ?? new Date(0).toISOString(),
        }))
        .sort((a, b) => Date.parse(b.unlockedAt) - Date.parse(a.unlockedAt)),
    });
  } catch (error) {
    return failure(error);
  }
}
