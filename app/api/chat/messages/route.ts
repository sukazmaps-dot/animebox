import { adminRoleFor, assertCanComment, writeAdminAudit } from '@/lib/admin-server';
import { getChatMessagesPage } from '@/lib/chat-server';
import {
  ApiError,
  adminClient,
  readBody,
  response,
  userClient,
} from '@/lib/community-server';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function sanitizePlainText(value: string) {
  return value
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .replace(/\r\n?/g, '\n')
    .trim();
}

function chatFailure(error: unknown) {
  if (error instanceof ApiError) return response({ error: error.message }, error.status);
  const message =
    typeof error === 'object' && error && 'message' in error
      ? String(error.message)
      : String(error);

  if (/CHAT_RATE_FAST/.test(message)) {
    return response({ error: 'Слишком быстро. Подожди пару секунд.' }, 429);
  }
  if (/CHAT_RATE_BURST/.test(message)) {
    return response({ error: 'Слишком много сообщений подряд. Немного подожди.' }, 429);
  }
  if (/CHAT_DUPLICATE/.test(message)) {
    return response({ error: 'Не отправляй одно и то же сообщение несколько раз.' }, 429);
  }
  if (/CHAT_RESTRICTED/.test(message)) {
    return response({ error: 'Возможность писать в общий чат временно ограничена.' }, 403);
  }
  if (/CHAT_INVALID_REPLY|CHAT_INVALID_BODY/.test(message)) {
    return response({ error: 'Проверь текст сообщения или ответ.' }, 400);
  }

  console.error('[Chat API]', error);
  return response({ error: 'Чат временно недоступен.' }, 503);
}

export async function GET(request: Request) {
  try {
    const params = new URL(request.url).searchParams;
    const page = await getChatMessagesPage({ cursor: params.get('cursor') });
    return response(page);
  } catch (error) {
    return chatFailure(error);
  }
}

export async function POST(request: Request) {
  try {
    const { client, user } = await userClient();
    try {
      await assertCanComment(user.id);
    } catch (moderationError) {
      if (moderationError instanceof ApiError && moderationError.status === 403) {
        throw new ApiError(403, 'Возможность писать в общий чат временно ограничена.');
      }
      throw moderationError;
    }
    const body = await readBody(request);

    if (
      typeof body.body !== 'string' ||
      typeof body.requestId !== 'string' ||
      !UUID.test(body.requestId) ||
      (body.replyTo !== null && body.replyTo !== undefined &&
        (typeof body.replyTo !== 'string' || !UUID.test(body.replyTo)))
    ) {
      throw new ApiError(400, 'Некорректные параметры сообщения.');
    }

    const cleanBody = sanitizePlainText(body.body);
    const length = [...cleanBody].length;
    const lines = cleanBody.split('\n').length;

    if (!cleanBody || length > 500 || lines > 8) {
      throw new ApiError(400, 'Сообщение должно быть от 1 до 500 символов и не более 8 строк.');
    }

    const { data, error } = await client.rpc('create_chat_message', {
      p_body: cleanBody,
      p_reply: body.replyTo ?? null,
      p_request: body.requestId,
    });

    if (error) throw error;

    return response(
      {
        id: String(data),
        createdAt: new Date().toISOString(),
      },
      201,
    );
  } catch (error) {
    return chatFailure(error);
  }
}

export async function DELETE(request: Request) {
  try {
    const { client, user } = await userClient();
    const body = await readBody(request);

    if (typeof body.id !== 'string' || !UUID.test(body.id)) {
      throw new ApiError(400, 'Некорректное сообщение.');
    }

    const role = adminRoleFor(user.id);

    if (role) {
      const admin = adminClient();
      const { data: existing, error: lookupError } = await admin
        .from('chat_messages')
        .select('id,user_id,deleted_at')
        .eq('id', body.id)
        .maybeSingle();

      if (lookupError) throw lookupError;
      if (!existing) throw new ApiError(404, 'Сообщение не найдено.');

      if (!existing.deleted_at) {
        const { error: deleteError } = await admin
          .from('chat_messages')
          .update({ body: 'Сообщение удалено.', deleted_at: new Date().toISOString() })
          .eq('id', body.id);
        if (deleteError) throw deleteError;

        if (existing.user_id !== user.id) {
          await writeAdminAudit({
            actorId: user.id,
            actorRole: role,
            action: 'chat_message_delete',
            targetType: 'chat_message',
            targetId: body.id,
            details: { authorId: existing.user_id },
          });
        }
      }

      return response({ success: true });
    }

    const { error } = await client.rpc('delete_chat_message', { p_id: body.id });
    if (error) throw error;
    return response({ success: true });
  } catch (error) {
    return chatFailure(error);
  }
}
