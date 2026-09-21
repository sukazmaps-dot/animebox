import 'server-only';

import { ApiError, adminClient } from '@/lib/community-server';
import { writeAdminAudit } from '@/lib/admin-server';

const PUBLIC_BUCKET = 'profile-media';
const QUARANTINE_BUCKET = 'profile-media-quarantine';

export type ProfileMediaReviewActor = {
  id: string;
  role: 'owner' | 'admin' | 'moderator';
} | null;

export async function loadProfileMediaReviewGroup(groupId: string) {
  const admin = adminClient();
  const { data, error } = await admin
    .from('profile_media_review_groups')
    .select('id,user_id,scope,kind,status,apply_payload,created_at,automation_state,auto_attempts,next_auto_check_at,last_auto_check_at,auto_last_reason')
    .eq('id', groupId)
    .single();

  if (error || !data) throw new ApiError(404, 'Заявка на проверку не найдена.');
  return data;
}

export async function rejectProfileMediaReviewGroup(
  groupId: string,
  actor: ProfileMediaReviewActor,
) {
  const admin = adminClient();
  const group = await loadProfileMediaReviewGroup(groupId);

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
    .update({
      status: 'rejected',
      reviewed_by: actor?.id ?? null,
      reviewed_at: now,
      updated_at: now,
    })
    .eq('review_group_id', groupId)
    .eq('status', 'review');
  if (rowsError) throw rowsError;

  const { error: groupError } = await admin
    .from('profile_media_review_groups')
    .update({
      status: 'rejected',
      automation_state: 'done',
      reviewed_by: actor?.id ?? null,
      reviewed_at: now,
      updated_at: now,
    })
    .eq('id', groupId);
  if (groupError) throw groupError;

  if (actor) {
    await writeAdminAudit({
      actorId: actor.id,
      actorRole: actor.role,
      action: 'profile_media_reject',
      targetType: 'profile_media_review',
      targetId: groupId,
      details: { userId: group.user_id, scope: group.scope, kind: group.kind },
    });
  }
}

export async function approveProfileMediaReviewGroup(
  groupId: string,
  actor: ProfileMediaReviewActor,
) {
  const admin = adminClient();
  const group = await loadProfileMediaReviewGroup(groupId);

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
      if (downloaded.error || !downloaded.data) {
        throw downloaded.error || new Error('Quarantine download failed');
      }

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
      .update({
        status: 'approved',
        reviewed_by: actor?.id ?? null,
        reviewed_at: now,
        updated_at: now,
      })
      .eq('review_group_id', groupId)
      .eq('status', 'review');
    if (rowsResult.error) throw rowsResult.error;

    const payload = (group.apply_payload ?? {}) as Record<string, unknown>;
    const expectedPreviousPath =
      typeof payload.expectedPreviousPath === 'string'
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

      const currentPath =
        group.kind === 'avatar'
          ? currentData?.avatar_path ?? null
          : currentData?.banner_path ?? null;
      stale = expectedPreviousPath !== undefined && currentPath !== expectedPreviousPath;

      if (!stale) {
        const patch =
          group.kind === 'avatar'
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
        reviewed_by: actor?.id ?? null,
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

    if (actor) {
      await writeAdminAudit({
        actorId: actor.id,
        actorRole: actor.role,
        action: stale ? 'profile_media_approve_stale' : 'profile_media_approve',
        targetType: 'profile_media_review',
        targetId: groupId,
        details: { userId: group.user_id, scope: group.scope, kind: group.kind, stale },
      });
    }

    return { stale };
  } catch (error) {
    if (copiedPublicPaths.length) {
      const cleanup = await admin.storage.from(PUBLIC_BUCKET).remove(copiedPublicPaths);
      if (cleanup.error) console.error('[ProfileMediaReview] rollback cleanup:', cleanup.error);
    }
    throw error;
  }
}
