import { createClient } from '@/lib/supabase/server';
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
import { getSponsorStatuses } from '@/lib/sponsor-server';
import { assertCanComment } from '@/lib/admin-server';
import { publicIdentityRoleFor } from '@/lib/identity-server';

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type CommentRow = {
  id: string;
  user_id: string | null;
  parent_id: string | null;
  body: string;
  is_spoiler: boolean;
  depth: number;
  created_at: string;
  deleted_at: string | null;
};

function sanitizePlainText(value: string) {
  return value
    // Comments are plain text. React escapes them when rendered; here we only
    // strip control characters and normalize newlines before persistence.
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .replace(/\r\n?/g, '\n')
    .trim();
}

async function enrichAuthors(comments: CommentRow[]) {
  const ids = [...new Set(comments.map((item) => item.user_id).filter((id): id is string => Boolean(id)))];
  if (!ids.length) return comments.map((item) => ({ ...item, author: null }));

  try {
    const admin = adminClient();
    const [profilesResult, ogResult, sponsorByUser] = await Promise.all([
      admin
        .from('profiles')
        .select('id,username,avatar_path')
        .in('id', ids),
      admin
        .from('og_members')
        .select('user_id,og_number')
        .in('user_id', ids),
      getSponsorStatuses(ids),
    ]);

    if (profilesResult.error) throw profilesResult.error;
    if (ogResult.error) {
      // Comments still work before/without the optional OG migration.
      console.error('Comment OG enrichment:', ogResult.error);
    }

    const ogByUser = new Map<string, number>();
    for (const row of ogResult.error ? [] : ogResult.data ?? []) {
      if (typeof row.og_number === 'number') {
        ogByUser.set(row.user_id, row.og_number);
      }
    }

    const authors = new Map(
      (profilesResult.data ?? []).map((profile) => {
        const avatarUrl = profile.avatar_path
          ? admin.storage.from('profile-media').getPublicUrl(profile.avatar_path).data.publicUrl
          : null;

        return [
          profile.id,
          {
            username: typeof profile.username === 'string' ? profile.username.trim() || null : null,
            avatarUrl,
            ogNumber: ogByUser.get(profile.id) ?? null,
            sponsor: sponsorByUser.get(profile.id) ?? null,
            role: publicIdentityRoleFor(profile.id),
          },
        ] as const;
      }),
    );

    return comments.map((item) => ({
      ...item,
      author: item.user_id ? authors.get(item.user_id) ?? null : null,
    }));
  } catch (error) {
    // Author decoration is optional. Comments should remain readable even if
    // profile-media or the service-role key is temporarily unavailable.
    console.error('Comment author enrichment:', error);
    return comments.map((item) => ({ ...item, author: null }));
  }
}

export async function GET(request: Request) {
  try {
    const params = new URL(request.url).searchParams;
    const id = positiveInteger(Number(params.get('animeId')));
    const parent = params.get('parent');
    const cursor = params.get('cursor');
    let before: { time: string; id: string } | null = null;

    if (parent && !uuid.test(parent)) throw new ApiError(400, 'Некорректная ветка.');

    if (cursor) {
      try {
        if (cursor.length > 500) throw new Error();
        const parsed = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
        if (
          typeof parsed.time !== 'string' ||
          !/^\d{4}-\d{2}-\d{2}T[\d:.]+(?:Z|\+00:00)$/.test(parsed.time) ||
          !Number.isFinite(Date.parse(parsed.time)) ||
          typeof parsed.id !== 'string' ||
          !uuid.test(parsed.id)
        ) {
          throw new Error();
        }
        before = parsed;
      } catch {
        throw new ApiError(400, 'Некорректный курсор.');
      }
    }

    const client = await createClient();

    let query = client
      .from('comments')
      .select('id,user_id,parent_id,body,is_spoiler,depth,created_at,deleted_at')
      .eq('anime_id', id);

    query = parent ? query.eq('parent_id', parent) : query.is('parent_id', null);
    if (before) {
      query = query.or(`created_at.lt.${before.time},and(created_at.eq.${before.time},id.lt.${before.id})`);
    }

    const currentResult = await query
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .limit(21);

    let data: CommentRow[] = [];

    if (!currentResult.error) {
      data = (currentResult.data ?? []) as CommentRow[];
    } else if (/deleted_at|column/i.test(currentResult.error.message)) {
      // Backward compatibility: the site still loads comments if migration
      // 002 has not been applied to Supabase yet.
      let legacyQuery = client
        .from('comments')
        .select('id,user_id,parent_id,body,is_spoiler,depth,created_at')
        .eq('anime_id', id);

      legacyQuery = parent
        ? legacyQuery.eq('parent_id', parent)
        : legacyQuery.is('parent_id', null);

      if (before) {
        legacyQuery = legacyQuery.or(
          `created_at.lt.${before.time},and(created_at.eq.${before.time},id.lt.${before.id})`,
        );
      }

      const legacyResult = await legacyQuery
        .order('created_at', { ascending: false })
        .order('id', { ascending: false })
        .limit(21);

      if (legacyResult.error) throw legacyResult.error;

      data = (legacyResult.data ?? []).map((item) => ({
        ...item,
        deleted_at: item.body === 'Комментарий удалён.' ? item.created_at : null,
      }));
    } else {
      throw currentResult.error;
    }

    const comments = data.slice(0, 20);
    const decorated = await enrichAuthors(comments);
    const last = comments[comments.length - 1];

    return response({
      comments: decorated,
      nextCursor:
        (data?.length ?? 0) > 20 && last
          ? Buffer.from(JSON.stringify({ time: last.created_at, id: last.id })).toString('base64url')
          : null,
    });
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
    return response({ id: data }, 201);
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
