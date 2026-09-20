import {
  adminClient,
  userClient,
  response,
  failure,
  positiveInteger,
  readBody,
  ensureAnime,
  ApiError,
} from '@/lib/community-server';
import { getPublicCommentsPage } from '@/lib/community-comments-server';
import { assertCanComment } from '@/lib/admin-server';
import { syncUserProgression } from '@/lib/progression-server';

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function sanitizePlainText(value: string) {
  return value
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .replace(/\r\n?/g, '\n')
    .trim();
}

export async function GET(request: Request) {
  try {
    const params = new URL(request.url).searchParams;
    const animeId = positiveInteger(Number(params.get('animeId')));
    const parentId = params.get('parent');
    const cursor = params.get('cursor');

    const page = await getPublicCommentsPage({
      animeId,
      parentId,
      cursor,
    });

    return response(page);
  } catch (error) {
    return failure(error);
  }
}

export async function POST(request: Request) {
  try {
    const { client, user } = await userClient();
    await assertCanComment(user.id);
    const body = await readBody(request);
    const id = positiveInteger(body.animeId);

    if (typeof body.body !== 'string') {
      throw new ApiError(400, 'Комментарий должен содержать текст.');
    }

    const cleanBody = sanitizePlainText(body.body);

    if (
      !cleanBody ||
      [...cleanBody].length > 4000 ||
      typeof body.isSpoiler !== 'boolean' ||
      typeof body.requestId !== 'string' ||
      !uuid.test(body.requestId) ||
      (body.parentId !== null && (typeof body.parentId !== 'string' || !uuid.test(body.parentId)))
    ) {
      throw new ApiError(400, 'Проверь текст и параметры комментария.');
    }

    await ensureAnime(id);

    const { data, error } = await client.rpc('create_comment', {
      p_anime: id,
      p_body: cleanBody,
      p_spoiler: body.isSpoiler,
      p_parent: body.parentId,
      p_request: body.requestId,
    });

    if (error) throw error;

    let progressionUpdated = false;

    try {
      const progression = await syncUserProgression({
        userId: user.id,
        eventKey: `comment:${String(data)}`,
        reason: 'comment_created',
      });
      progressionUpdated = Number(progression?.earned_now ?? 0) > 0;
    } catch (progressionError) {
      console.error('[comments] progression sync failed:', progressionError);
    }

    return response({ id: data, progressionUpdated }, 201);
  } catch (error) {
    return failure(error);
  }
}

export async function DELETE(request: Request) {
  try {
    const { client, user } = await userClient();
    const body = await readBody(request);

    if (typeof body.id !== 'string' || !uuid.test(body.id)) {
      throw new ApiError(400, 'Некорректный комментарий.');
    }

    const rpc = await client.rpc('delete_comment', { p_id: body.id });
    if (!rpc.error) return response({ success: true });

    // Backward-compatible fallback for a database where migration 002 has not
    // been applied yet. Ownership is checked with the authenticated user and
    // the service role only performs the final soft-delete update.
    if (/delete_comment|function|schema cache/i.test(rpc.error.message)) {
      const admin = adminClient();
      const { data: existing, error: lookupError } = await admin
        .from('comments')
        .select('user_id')
        .eq('id', body.id)
        .maybeSingle();

      if (lookupError) throw lookupError;
      if (!existing) throw new ApiError(404, 'Комментарий не найден.');
      if (existing.user_id !== user.id) throw new ApiError(403, 'Можно удалить только свой комментарий.');

      const { error: updateError } = await admin
        .from('comments')
        .update({ body: 'Комментарий удалён.', is_spoiler: false })
        .eq('id', body.id);

      if (updateError) throw updateError;
      return response({ success: true, legacySchema: true });
    }

    throw rpc.error;
  } catch (error) {
    return failure(error);
  }
}
