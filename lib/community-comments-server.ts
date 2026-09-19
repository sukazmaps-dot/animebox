import 'server-only';

import { unstable_cache } from 'next/cache';

import { adminClient, ApiError } from '@/lib/community-server';
import { publicIdentityRoleFor } from '@/lib/identity-server';
import { getSponsorStatuses } from '@/lib/sponsor-server';
import { resolveProfileAppearance } from '@/lib/profile-appearance';
import { studioSettingsFromRow } from '@/lib/premium-studio';
import type {
  CommunityComment,
  CommunityCommentsPage,
} from '@/types/community-comments';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 40;

type CommentRow = Omit<CommunityComment, 'author'>;

type Cursor = {
  time: string;
  id: string;
};

function parseCursor(value?: string | null): Cursor | null {
  if (!value) return null;

  try {
    if (value.length > 500) throw new Error('cursor too long');

    const parsed = JSON.parse(
      Buffer.from(value, 'base64url').toString('utf8'),
    ) as Partial<Cursor>;

    if (
      typeof parsed.time !== 'string' ||
      !/^\d{4}-\d{2}-\d{2}T[\d:.]+(?:Z|\+00:00)$/.test(parsed.time) ||
      !Number.isFinite(Date.parse(parsed.time)) ||
      typeof parsed.id !== 'string' ||
      !UUID.test(parsed.id)
    ) {
      throw new Error('invalid cursor');
    }

    return {
      time: parsed.time,
      id: parsed.id,
    };
  } catch {
    throw new ApiError(400, 'Некорректный курсор.');
  }
}

async function enrichAuthors(
  comments: CommentRow[],
): Promise<CommunityComment[]> {
  const ids = [
    ...new Set(
      comments
        .map((item) => item.user_id)
        .filter((id): id is string => Boolean(id)),
    ),
  ];

  if (!ids.length) {
    return comments.map((item) => ({ ...item, author: null }));
  }

  try {
    const admin = adminClient();
    const nowIso = new Date().toISOString();
    const [
      profilesResult,
      ogResult,
      sponsorByUser,
      premiumSettingsResult,
      premiumSubscriptionsResult,
    ] = await Promise.all([
      admin
        .from('profiles')
        .select('id,username,avatar_path')
        .in('id', ids),
      admin
        .from('og_members')
        .select('user_id,og_number')
        .in('user_id', ids),
      getSponsorStatuses(ids),
      admin
        .from('premium_profile_settings')
        .select('user_id,avatar_path,avatar_static_path,avatar_position_x,avatar_position_y,avatar_zoom')
        .in('user_id', ids),
      admin
        .from('premium_subscriptions')
        .select('user_id')
        .in('user_id', ids)
        .in('status', ['active', 'grace_period'])
        .gt('ends_at', nowIso),
    ]);

    if (profilesResult.error) throw profilesResult.error;
    if (ogResult.error) {
      // OG is optional. Public comments must remain readable before/without
      // that migration.
      console.error('Comment OG enrichment:', ogResult.error);
    }
    if (premiumSettingsResult.error) {
      console.error('Comment Premium settings enrichment:', premiumSettingsResult.error);
    }
    if (premiumSubscriptionsResult.error) {
      console.error('Comment Premium status enrichment:', premiumSubscriptionsResult.error);
    }

    const premiumSettingsByUser = new Map(
      (premiumSettingsResult.error ? [] : premiumSettingsResult.data ?? []).map((row) => [
        String(row.user_id),
        row as Record<string, unknown>,
      ] as const),
    );
    const premiumActiveUsers = new Set(
      (premiumSubscriptionsResult.error ? [] : premiumSubscriptionsResult.data ?? []).map((row) =>
        String(row.user_id),
      ),
    );

    const ogByUser = new Map<string, number>();
    for (const row of ogResult.error ? [] : ogResult.data ?? []) {
      if (typeof row.og_number === 'number') {
        ogByUser.set(row.user_id, row.og_number);
      }
    }

    const authors = new Map(
      (profilesResult.data ?? []).map((profile) => {
        const premiumRow = premiumSettingsByUser.get(profile.id) ?? null;
        const appearance = resolveProfileAppearance({
          baseAvatarPath: profile.avatar_path,
          baseBannerPath: null,
          premiumStudio: premiumRow ? studioSettingsFromRow(premiumRow) : null,
          premiumActive: premiumActiveUsers.has(profile.id),
        });
        const avatarUrl = appearance.avatarPath
          ? admin.storage
              .from('profile-media')
              .getPublicUrl(appearance.avatarPath).data.publicUrl
          : null;

        return [
          profile.id,
          {
            username:
              typeof profile.username === 'string'
                ? profile.username.trim() || null
                : null,
            avatarUrl,
            avatarTransform: appearance.avatarTransform,
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
    // Decoration is optional. The UGC body should still be server-renderable
    // if profile media or sponsor metadata is temporarily unavailable.
    console.error('Comment author enrichment:', error);
    return comments.map((item) => ({ ...item, author: null }));
  }
}

export async function getPublicCommentsPage({
  animeId,
  parentId = null,
  cursor = null,
  limit = DEFAULT_LIMIT,
}: {
  animeId: number;
  parentId?: string | null;
  cursor?: string | null;
  limit?: number;
}): Promise<CommunityCommentsPage> {
  if (!Number.isSafeInteger(animeId) || animeId <= 0) {
    throw new ApiError(400, 'Некорректный идентификатор аниме.');
  }

  if (parentId && !UUID.test(parentId)) {
    throw new ApiError(400, 'Некорректная ветка.');
  }

  const before = parseCursor(cursor);
  const pageSize = Math.max(
    1,
    Math.min(MAX_LIMIT, Number.isSafeInteger(limit) ? limit : DEFAULT_LIMIT),
  );

  const admin = adminClient();
  let query = admin
    .from('comments')
    .select('id,user_id,parent_id,body,is_spoiler,depth,created_at,deleted_at')
    .eq('anime_id', animeId);

  query = parentId
    ? query.eq('parent_id', parentId)
    : query.is('parent_id', null);

  if (before) {
    query = query.or(
      `created_at.lt.${before.time},and(created_at.eq.${before.time},id.lt.${before.id})`,
    );
  }

  const currentResult = await query
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(pageSize + 1);

  let data: CommentRow[] = [];

  if (!currentResult.error) {
    data = (currentResult.data ?? []) as CommentRow[];
  } else if (/deleted_at|column/i.test(currentResult.error.message)) {
    // Backward compatibility for databases where soft-delete migration has
    // not landed yet.
    let legacyQuery = admin
      .from('comments')
      .select('id,user_id,parent_id,body,is_spoiler,depth,created_at')
      .eq('anime_id', animeId);

    legacyQuery = parentId
      ? legacyQuery.eq('parent_id', parentId)
      : legacyQuery.is('parent_id', null);

    if (before) {
      legacyQuery = legacyQuery.or(
        `created_at.lt.${before.time},and(created_at.eq.${before.time},id.lt.${before.id})`,
      );
    }

    const legacyResult = await legacyQuery
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .limit(pageSize + 1);

    if (legacyResult.error) throw legacyResult.error;

    data = (legacyResult.data ?? []).map((item) => ({
      ...item,
      deleted_at:
        item.body === 'Комментарий удалён.' ? item.created_at : null,
    }));
  } else {
    throw currentResult.error;
  }

  const comments = data.slice(0, pageSize);
  const decorated = await enrichAuthors(comments);
  const last = comments[comments.length - 1];

  return {
    comments: decorated,
    nextCursor:
      data.length > pageSize && last
        ? Buffer.from(
            JSON.stringify({ time: last.created_at, id: last.id }),
          ).toString('base64url')
        : null,
  };
}

/**
 * First public comment page used in the title SSR HTML. A short cache keeps
 * database work low while the client refreshes immediately after hydration,
 * so humans still see newly posted comments without waiting for revalidation.
 */
export const getCachedTopLevelComments = unstable_cache(
  async (animeId: number) =>
    getPublicCommentsPage({
      animeId,
      parentId: null,
      limit: DEFAULT_LIMIT,
    }),
  ['animebox-title-comments-ssr-v1'],
  { revalidate: 60 },
);
