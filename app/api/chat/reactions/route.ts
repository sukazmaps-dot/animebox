import { CHAT_REACTIONS, type ChatReaction } from '@/types/chat';
import { ApiError, readBody, response, userClient } from '@/lib/community-server';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(request: Request) {
  try {
    const { client } = await userClient();
    const body = await readBody(request);

    if (
      typeof body.messageId !== 'string' ||
      !UUID.test(body.messageId) ||
      typeof body.reaction !== 'string' ||
      !CHAT_REACTIONS.includes(body.reaction as ChatReaction)
    ) {
      throw new ApiError(400, 'Некорректная реакция.');
    }

    const { data, error } = await client.rpc('toggle_chat_reaction', {
      p_message: body.messageId,
      p_reaction: body.reaction,
    });
    if (error) throw error;
    return response({ active: Boolean(data) });
  } catch (error) {
    if (error instanceof ApiError) return response({ error: error.message }, error.status);
    const message = typeof error === 'object' && error && 'message' in error ? String(error.message) : String(error);
    if (/CHAT_REACTION_RATE/.test(message)) return response({ error: 'Слишком много реакций подряд.' }, 429);
    if (/CHAT_RESTRICTED/.test(message)) return response({ error: 'Для аккаунта временно ограничены действия в чате.' }, 403);
    console.error('[Chat reaction]', error);
    return response({ error: 'Не удалось изменить реакцию.' }, 503);
  }
}
