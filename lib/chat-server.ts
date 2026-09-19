import 'server-only';

import { unstable_cache } from 'next/cache';

import { ApiError, adminClient } from '@/lib/community-server';
import { publicIdentityRoleFor } from '@/lib/identity-server';
import { resolveProfileAppearance } from '@/lib/profile-appearance';
import { studioSettingsFromRow } from '@/lib/premium-studio';
import { getSponsorStatuses } from '@/lib/sponsor-server';
import {
  CHAT_REACTIONS,
  type ChatAuthor,
  type ChatMessage,
  type ChatMessagesPage,
  type ChatReaction,
  type HomeChatTeaserMessage,
} from '@/types/chat';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DEFAULT_LIMIT = 40;
const MAX_LIMIT = 60;

type MessageRow = Omit<ChatMessage, 'author' | 'reactions'>;
type Cursor = { time: string; id: string };

function parseCursor(value?: string | null): Cursor | null {
  if (!value) return null;

  try {
    if (value.length > 500) throw new Error('cursor too long');
    const parsed = JSON.parse(
      Buffer.from(value, 'base64url').toString('utf8'),
    ) as Partial<Cursor>;

    if (
      typeof parsed.time !== 'string' ||
      !Number.isFinite(Date.parse(parsed.time)) ||
      typeof parsed.id !== 'string' ||
      !UUID.test(parsed.id)
    ) {
      throw new Error('invalid cursor');
    }

    return { time: parsed.time, id: parsed.id };
  } catch {
    throw new ApiError(400, 'Некорректный курсор чата.');
  }
}

function storagePublicUrl(
  admin: ReturnType<typeof adminClient>,
  path: string | null | undefined,
) {
  if (!path) return null;
  return admin.storage.from('profile-media').getPublicUrl(path).data.publicUrl;
}

export async function getChatAuthors(userIds: string[]): Promise<Map<string, ChatAuthor>> {
  const ids = [...new Set(userIds.filter((id) => UUID.test(id)))].slice(0, 60);
  const result = new Map<string, ChatAuthor>();
  if (!ids.length) return result;

  const admin = adminClient();
  const nowIso = new Date().toISOString();

  const [profilesResult, sponsorByUser, premiumSettingsResult, entitlementsResult] =
    await Promise.all([
      admin.from('profiles').select('id,username,avatar_path').in('id', ids),
      getSponsorStatuses(ids),
      admin
        .from('premium_profile_settings')
        .select('user_id,avatar_path,avatar_static_path,avatar_position_x,avatar_position_y,avatar_zoom')
        .in('user_id', ids),
      admin
        .from('user_entitlements')
        .select('user_id,entitlement')
        .in('user_id', ids)
        .eq('active', true)
        .lte('starts_at', nowIso)
        .or(`expires_at.is.null,expires_at.gt.${nowIso}`)
        .in('entitlement', ['premiumBadge', 'profileStudio', 'premiumThemes']),
    ]);

  if (profilesResult.error) throw profilesResult.error;

  const premiumSettingsByUser = new Map(
    (premiumSettingsResult.error ? [] : premiumSettingsResult.data ?? []).map((row) => [
      String(row.user_id),
      row as Record<string, unknown>,
    ] as const),
  );

  const entitlementsByUser = new Map<string, Set<string>>();
  for (const row of entitlementsResult.error ? [] : entitlementsResult.data ?? []) {
    const userId = String(row.user_id);
    const current = entitlementsByUser.get(userId) ?? new Set<string>();
    current.add(String(row.entitlement));
    entitlementsByUser.set(userId, current);
  }

  for (const profile of profilesResult.data ?? []) {
    const premiumRow = premiumSettingsByUser.get(profile.id) ?? null;
    const entitlements = entitlementsByUser.get(profile.id) ?? new Set<string>();
    const premium = entitlements.has('premiumBadge');
    const studioActive = entitlements.has('profileStudio') && entitlements.has('premiumThemes');
    const appearance = resolveProfileAppearance({
      baseAvatarPath: profile.avatar_path,
      baseBannerPath: null,
      premiumStudio: premiumRow ? studioSettingsFromRow(premiumRow) : null,
      premiumActive: studioActive,
    });

    result.set(profile.id, {
      id: profile.id,
      username:
        typeof profile.username === 'string' ? profile.username.trim() || null : null,
      avatarUrl: storagePublicUrl(admin, appearance.avatarPath),
      avatarTransform: appearance.avatarTransform,
      sponsor: sponsorByUser.get(profile.id) ?? null,
      role: publicIdentityRoleFor(profile.id),
      premium,
    });
  }

  for (const id of ids) {
    if (result.has(id)) continue;
    result.set(id, {
      id,
      username: null,
      avatarUrl: null,
      avatarTransform: null,
      sponsor: sponsorByUser.get(id) ?? null,
      role: publicIdentityRoleFor(id),
      premium: entitlementsByUser.get(id)?.has('premiumBadge') ?? false,
    });
  }

  return result;
}

function emptyReactionCounts(): Record<ChatReaction, number> {
  return Object.fromEntries(CHAT_REACTIONS.map((reaction) => [reaction, 0])) as Record<
    ChatReaction,
    number
  >;
}

async function decorateMessages(rows: MessageRow[]): Promise<ChatMessage[]> {
  if (!rows.length) return [];

  const admin = adminClient();
  const ids = rows.map((row) => row.id);
  const userIds = rows.map((row) => row.user_id);

  const [authors, reactionsResult] = await Promise.all([
    getChatAuthors(userIds),
    admin.from('chat_reactions').select('message_id,reaction').in('message_id', ids),
  ]);

  const reactionCounts = new Map<string, Record<ChatReaction, number>>();
  for (const id of ids) reactionCounts.set(id, emptyReactionCounts());

  if (!reactionsResult.error) {
    for (const row of reactionsResult.data ?? []) {
      if (!CHAT_REACTIONS.includes(row.reaction as ChatReaction)) continue;
      const current = reactionCounts.get(row.message_id);
      if (!current) continue;
      current[row.reaction as ChatReaction] += 1;
    }
  }

  return rows.map((row) => ({
    ...row,
    author: authors.get(row.user_id) ?? null,
    reactions: reactionCounts.get(row.id) ?? emptyReactionCounts(),
  }));
}

export async function getChatMessagesPage({
  cursor = null,
  limit = DEFAULT_LIMIT,
}: {
  cursor?: string | null;
  limit?: number;
} = {}): Promise<ChatMessagesPage> {
  const before = parseCursor(cursor);
  const pageSize = Math.max(
    1,
    Math.min(MAX_LIMIT, Number.isSafeInteger(limit) ? limit : DEFAULT_LIMIT),
  );

  const admin = adminClient();
  let query = admin
    .from('chat_messages')
    .select('id,user_id,body,reply_to,created_at,edited_at,deleted_at');

  if (before) {
    query = query.or(
      `created_at.lt.${before.time},and(created_at.eq.${before.time},id.lt.${before.id})`,
    );
  }

  const result = await query
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(pageSize + 1);

  if (result.error) throw result.error;

  const descending = (result.data ?? []) as MessageRow[];
  const pageRows = descending.slice(0, pageSize);
  const oldest = pageRows[pageRows.length - 1];
  const decorated = await decorateMessages([...pageRows].reverse());

  return {
    messages: decorated,
    nextCursor:
      descending.length > pageSize && oldest
        ? Buffer.from(
            JSON.stringify({ time: oldest.created_at, id: oldest.id }),
          ).toString('base64url')
        : null,
  };
}

export const getCachedHomeChatTeaser = unstable_cache(
  async (): Promise<HomeChatTeaserMessage[]> => {
    try {
      const page = await getChatMessagesPage({ limit: 3 });
      return page.messages.map(({ id, body, created_at, deleted_at, author }) => ({
        id,
        body,
        created_at,
        deleted_at,
        author,
      }));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (/chat_messages|chat_reactions|relation|schema cache/i.test(message)) return [];
      console.error('[Chat teaser]', error);
      return [];
    }
  },
  ['animebox-home-chat-teaser-v1'],
  { revalidate: 60 },
);
