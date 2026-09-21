import { ApiError, adminClient, failure, readBody, response } from '@/lib/community-server';
import { requireAdmin, writeAdminAudit } from '@/lib/admin-server';

export const dynamic = 'force-dynamic';

const PUBLIC_BUCKET = 'profile-media';
const QUARANTINE_BUCKET = 'profile-media-quarantine';

async function signedReviewMedia(groupId: string) {
  const admin = adminClient();
  const { data, error } = await admin
    .from('profile_media_moderation')
    .select('id,variant,quarantine_path,mime_type,animated,reason,categories,category_scores')
    .eq('review_group_id', groupId)
    .eq('status', 'review')
    .order('variant', { ascending: true });

  if (error) throw error;

  return Promise.all(
    (data ?? []).map(async (item) => {
      let signedUrl: string | null = null;
      if (item.quarantine_path) {
        const signed = await admin.storage
          .from(QUARANTINE_BUCKET)
          .createSignedUrl(item.quarantine_path, 15 * 60);
        signedUrl = signed.data?.signedUrl ?? null;
      }
      return { ...item, signedUrl };
    }),
  );
}

async function loadGroup(groupId: string) {
  const admin = adminClient();
  const { data, error } = await admin
    .from('profile_media_review_groups')
    .select('id,user_id,scope,kind,status,apply_payload,created_at')
    .eq('id', groupId)
    .single();

  if (error || !data) throw new ApiError(404, 'Заявка на проверку не найдена.');
  return data;
}

async function rejectGroup(groupId: string, actorId: string, actorRole: 'owner' | 'admin' | 'moderator') {
  const admin = adminClient();
  const group = await loadGroup(groupId);

  const { data: media, error: mediaError } = await admin
    .from('profile_media_moderation')
    .select('id,quarantine_path')
    .eq('review_group_id', groupId)
    .eq('status', 'review');
  if (mediaError) throw mediaError;

  const quarantinePaths = (media ?? [])
    .map((item) => item.quarantine_path)
    .filter((path): path is string => Boolean(path));

  if (quarantinePaths.length) {
    const { error } = await admin.storage.from(QUARANTINE_BUCKET).remove(quarantinePaths);
    if (error) console.error('[ProfileMediaReview] reject cleanup:', error);
  }

  const now = new Date().toISOString();
  const { error: rowsError } = await admin
    .from('profile_media_moderation')
    .update({ status: 'rejected', automation_state: 'done', reviewed_by: actorId, reviewed_at: now, updated_at: now })
    .eq('review_group_id', groupId)
    .eq('status', 'review');
  if (rowsError) throw rowsError;

  const { error: groupError } = await admin
    .from('profile_media_review_groups')
    .update({ status: 'rejected', reviewed_by: actorId, reviewed_at: now, updated_at: now })
    .eq('id', groupId);
  if (groupError) throw groupError;

  await writeAdminAudit({
    actorId,
    actorRole,
    action: 'profile_media_reject',
    targetType: 'profile_media_review',
    targetId: groupId,
    details: { userId: group.user_id, scope: group.scope, kind: group.kind },
  });
}

async function approveGroup(groupId: string, actorId: string, actorRole: 'owner' | 'admin' | 'moderator') {
  const admin = adminClient();
  const group = await loadGroup(groupId);

  if (group.status !== 'review') {
    throw new ApiError(409, 'Эта заявка уже обработана.');
  }

  const { data: media, error: mediaError } = await admin
    .from('profile_media_moderation')
    .select('id,public_path,quarantine_path,mime_type')
    .eq('review_group_id', groupId)
    .eq('status', 'review');
  if (mediaError) throw mediaError;
  if (!media?.length) throw new ApiError(409, 'В заявке нет файлов для проверки.');

  const copiedPublicPaths: string[] = [];

  try {
    for (const item of media) {
      if (!item.public_path || !item.quarantine_path) {
        throw new ApiError(409, 'Повреждённая заявка на проверку.');
      }

      const downloaded = await admin.storage.from(QUARANTINE_BUCKET).download(item.quarantine_path);
      if (downloaded.error || !downloaded.data) throw downloaded.error || new Error('Quarantine download failed');

      const bytes = Buffer.from(await downloaded.data.arrayBuffer());
      const uploaded = await admin.storage.from(PUBLIC_BUCKET).upload(item.public_path, bytes, {
        contentType: item.mime_type || downloaded.data.type || 'image/webp',
        cacheControl: '31536000',
        upsert: true,
      });
      if (uploaded.error) throw uploaded.error;
      copiedPublicPaths.push(item.public_path);
    }

    const now = new Date().toISOString();

    const rowsResult = await admin
      .from('profile_media_moderation')
      .update({ status: 'approved', reviewed_by: actorId, reviewed_at: now, updated_at: now })
      .eq('review_group_id', groupId)
      .eq('status', 'review');
    if (rowsResult.error) throw rowsResult.error;

    const payload = (group.apply_payload ?? {}) as Record<string, unknown>;
    const expectedPreviousPath = typeof payload.expectedPreviousPath === 'string'
      ? payload.expectedPreviousPath
      : payload.expectedPreviousPath === null
        ? null
        : undefined;

    let stale = false;

    if (group.scope === 'base') {
      const field = group.kind === 'avatar' ? 'avatar_path' : 'banner_path';
      const nextPath = group.kind === 'avatar' ? payload.avatarPath : payload.bannerPath;
      if (typeof nextPath !== 'string') throw new ApiError(409, 'Некорректная заявка профиля.');

      const current = await admin.from('profiles').select(field).eq('id', group.user_id).single();
      if (current.error) throw current.error;
      const currentPath = (current.data as Record<string, unknown>)[field] ?? null;
      stale = expectedPreviousPath !== undefined && currentPath !== expectedPreviousPath;

      if (!stale) {
        const update = await admin.from('profiles').update({ [field]: nextPath }).eq('id', group.user_id);
        if (update.error) throw update.error;
      }
    } else {
      const current = await admin
        .from('premium_profile_settings')
        .select(group.kind === 'avatar' ? 'avatar_path' : 'banner_path')
        .eq('user_id', group.user_id)
        .maybeSingle();
      if (current.error) throw current.error;

      const currentData = current.data as {
        avatar_path?: string | null;
        banner_path?: string | null;
      } | null;

      const currentPath = group.kind === 'avatar'
        ? (currentData?.avatar_path ?? null)
        : (currentData?.banner_path ?? null);
      stale = expectedPreviousPath !== undefined && currentPath !== expectedPreviousPath;

      if (!stale) {
        const patch = group.kind === 'avatar'
          ? {
              avatar_path: payload.avatarPath ?? null,
              avatar_static_path: payload.avatarStaticPath ?? null,
              avatar_position_x: payload.avatarPositionX ?? 50,
              avatar_position_y: payload.avatarPositionY ?? 50,
              avatar_zoom: payload.avatarZoom ?? 1,
              updated_at: now,
            }
          : {
              banner_path: payload.bannerPath ?? null,
              banner_static_path: payload.bannerStaticPath ?? null,
              banner_position_x: payload.bannerPositionX ?? 50,
              banner_position_y: payload.bannerPositionY ?? 50,
              banner_zoom: payload.bannerZoom ?? 1,
              updated_at: now,
            };

        const update = await admin
          .from('premium_profile_settings')
          .upsert({ user_id: group.user_id, ...patch }, { onConflict: 'user_id' });
        if (update.error) throw update.error;
      }
    }

    const groupResult = await admin
      .from('profile_media_review_groups')
      .update({
        status: stale ? 'stale' : 'approved',
        automation_state: 'done',
        reviewed_by: actorId,
        reviewed_at: now,
        updated_at: now,
      })
      .eq('id', groupId);
    if (groupResult.error) throw groupResult.error;

    const quarantinePaths = media
      .map((item) => item.quarantine_path)
      .filter((path): path is string => Boolean(path));
    if (quarantinePaths.length) {
      const cleanup = await admin.storage.from(QUARANTINE_BUCKET).remove(quarantinePaths);
      if (cleanup.error) console.error('[ProfileMediaReview] quarantine cleanup:', cleanup.error);
    }

    await writeAdminAudit({
      actorId,
      actorRole,
      action: stale ? 'profile_media_approve_stale' : 'profile_media_approve',
      targetType: 'profile_media_review',
      targetId: groupId,
      details: { userId: group.user_id, scope: group.scope, kind: group.kind, stale },
    });

    return { stale };
  } catch (error) {
    if (copiedPublicPaths.length) {
      const cleanup = await admin.storage.from(PUBLIC_BUCKET).remove(copiedPublicPaths);
      if (cleanup.error) console.error('[ProfileMediaReview] rollback cleanup:', cleanup.error);
    }
    throw error;
  }
}

export async function GET() {
  try {
    await requireAdmin();
    const admin = adminClient();

    const { data, error } = await admin
      .from('profile_media_review_groups')
      .select('id,user_id,scope,kind,status,apply_payload,created_at')
      .eq('status', 'review')
      .order('created_at', { ascending: true })
      .limit(100);
    if (error) throw error;

    const userIds = [...new Set((data ?? []).map((item) => String(item.user_id)))];
    const profiles = userIds.length
      ? await admin.from('profiles').select('id,username').in('id', userIds)
      : { data: [], error: null };
    if (profiles.error) throw profiles.error;

    const usernameById = new Map((profiles.data ?? []).map((item) => [item.id, item.username]));

    const groups = await Promise.all(
      (data ?? []).map(async (group) => ({
        ...group,
        username: usernameById.get(group.user_id) || 'Пользователь',
        media: await signedReviewMedia(group.id),
      })),
    );

    return response({ groups });
  } catch (error) {
    return failure(error);
  }
}

export async function POST(request: Request) {
  try {
    const { user, role } = await requireAdmin();
    const body = await readBody(request);
    const groupId = typeof body.groupId === 'string' ? body.groupId.trim() : '';
    const action = body.action;

    if (!/^[0-9a-f-]{36}$/i.test(groupId)) throw new ApiError(400, 'Некорректная заявка.');
    if (action !== 'approve' && action !== 'reject') throw new ApiError(400, 'Неизвестное действие.');

    if (action === 'approve') {
      const result = await approveGroup(groupId, user.id, role);
      return response({ ok: true, ...result });
    }

    await rejectGroup(groupId, user.id, role);
    return response({ ok: true, stale: false });
  } catch (error) {
    return failure(error);
  }
}
