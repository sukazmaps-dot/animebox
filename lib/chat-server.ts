import 'server-only';

import { unstable_cache } from 'next/cache';

import { ApiError, adminClient } from '@/lib/community-server';
import { publicIdentityRoleFor } from '@/lib/identity-server';
import { resolvePublicAppearances } from '@/lib/public-avatar-server';
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
    const parsed = JSON.parse(Buffer.from(value, 'base64url').toString('utf8')) as Partial<Cursor>;

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

export async function getChatAuthors(userIds: string[]): Promise<Map<string, ChatAuthor>> {
  const ids = [...new Set(userIds.filter((id) => UUID.test(id)))].slice(0, 60);
  const result = new Map<string, ChatAuthor>();
  if (!ids.length) return result;

  const admin = adminClient();
  const [profilesResult, sponsorByUser] = await Promise.all([
    admin.from('profiles').select('id,username,avatar_path').in('id', ids),
    getSponsorStatuses(ids),
  ]);
  if (profilesResult.error) throw profilesResult.error;

  const profiles = profilesResult.data ?? [];
  const appearanceByUser = await resolvePublicAppearances(
    profiles.map((profile) => ({ id: profile.id, avatar_path: profile.avatar_path })),
  );

  for (const profile of profiles) {
    const appearance = appearanceByUser.get(profile.id);
    result.set(profile.id, {
      id: profile.id,
      username: typeof profile.username === 'string' ? profile.username.trim() || null : null,
      avatarUrl: appearance?.avatarUrl ?? '/default-avatar.webp',
      avatarTransform: appearance?.avatarTransform ?? null,
      sponsor: sponsorByUser.get(profile.id) ?? null,
      role: publicIdentityRoleFor(profile.id),
      premium: appearance?.premiumBadge ?? false,
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
      premium: false,
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
  const pageSize = Math.max(1, Math.min(MAX_LIMIT, Number.isSafeInteger(limit) ? limit : DEFAULT_LIMIT));

  const admin = adminClient();
  let query = admin
    .from('chat_messages')
    .select('id,user_id,body,reply_to,created_at,edited_at,deleted_at,kind');

  if (before) {
    query = query.or(`created_at.lt.${before.time},and(created_at.eq.${before.time},id.lt.${before.id})`);
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
        ? Buffer.from(JSON.stringify({ time: oldest.created_at, id: oldest.id })).toString('base64url')
        : null,
  };
}

export const getCachedHomeChatTeaser = unstable_cache(
  async (): Promise<HomeChatTeaserMessage[]> => {
    try {
      const page = await getChatMessagesPage({ limit: 3 });
      return page.messages
        .filter((message) => message.kind !== 'system')
        .slice(-3)
        .map(({ id, body, created_at, deleted_at, author }) => ({
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
  ['animebox-home-chat-teaser-v1-1'],
  { revalidate: 60 },
);
