import { userClient, response, failure, positiveInteger, readBody, ensureAnime, ApiError } from '@/lib/community-server';
export async function POST(request: Request) {
  try {
    const { client } = await userClient();
    const body = await readBody(request);
    const id = positiveInteger(body.animeId);
    if (!['watching','planned','completed','dropped'].includes(String(body.status))) throw new ApiError(400, 'Неизвестный статус.');
    await ensureAnime(id);
    const { error } = await client.rpc('set_library_status', { p_anime: id, p_status: body.status });
    if (error) throw error;
    return response({ saved: true });
  } catch (error) { return failure(error); }
}
