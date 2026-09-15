import { userClient, response, failure, positiveInteger, readBody, ensureAnime, ApiError } from '@/lib/community-server';
export async function GET(request: Request) {
  try {
    const id = positiveInteger(Number(new URL(request.url).searchParams.get('animeId')));
    const { client } = await userClient();
    const { data, error } = await client.rpc('my_completed_episodes', { p_anime: id });
    if (error) throw error;
    return response({ episodes: data });
  } catch (error) { return failure(error); }
}
export async function POST(request: Request) {
  try {
    const { client } = await userClient();
    const body = await readBody(request);
    const id = positiveInteger(body.animeId);
    const episode = positiveInteger(body.episode);
    if (typeof body.completed !== 'boolean' || !['manual', 'player'].includes(String(body.source))) throw new ApiError(400, 'Укажи завершение и источник отметки.');
    await ensureAnime(id);
    const { error } = await client.rpc('record_episode', { p_anime: id, p_episode: episode, p_completed: body.completed, p_source: body.source });
    if (error) throw error;
    return response({ saved: true });
  } catch (error) { return failure(error); }
}
