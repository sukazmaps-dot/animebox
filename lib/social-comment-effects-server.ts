import 'server-only';

import { adminClient } from '@/lib/community-server';
import { createSocialNotification } from '@/lib/social-notifications-server';
import { trackProductEvents } from '@/lib/product-events-server';

const MENTION_RE = /@([\p{L}\p{N}_.-]{3,24})/gu;

function extractMentions(body: string) {
  const result = new Map<string, string>();

  for (const match of body.matchAll(MENTION_RE)) {
    const username = match[1]?.trim();
    if (!username) continue;
    result.set(username.toLocaleLowerCase('ru-RU'), username);
    if (result.size >= 5) break;
  }

  return [...result.values()];
}

export async function publishEpisodeCommentSocialEffects(input: {
  commentId: string;
  userId: string;
  animeId: number;
  episode: number;
  parentId: string | null;
  body: string;
}) {
  const admin = adminClient();

  const [animeResult, parentResult] = await Promise.all([
    admin
      .from('anime_catalog')
      .select('id,title,slug')
      .eq('id', input.animeId)
      .maybeSingle(),
    input.parentId
      ? admin
          .from('comments')
          .select('id,user_id')
          .eq('id', input.parentId)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);

  if (animeResult.error) throw animeResult.error;
  if (parentResult.error) throw parentResult.error;

  const animeTitle =
    animeResult.data?.title?.trim() || 'аниме';
  const animeSlug =
    animeResult.data?.slug?.trim() || String(input.animeId);
  const href =
    `/anime/${encodeURIComponent(animeSlug)}/episode/${input.episode}#comment-${input.commentId}`;

  const recipients = new Map<
    string,
    'comment_reply' | 'comment_mention'
  >();

  const parentAuthorId = parentResult.data?.user_id;
  if (
    typeof parentAuthorId === 'string' &&
    parentAuthorId !== input.userId
  ) {
    recipients.set(parentAuthorId, 'comment_reply');
  }

  const mentions = extractMentions(input.body);
  if (mentions.length) {
    const mentionProfiles = await Promise.all(
      mentions.map(async (username) => {
        const { data, error } = await admin
          .from('profiles')
          .select('id,username')
          .ilike('username', username)
          .limit(1)
          .maybeSingle();

        if (error) throw error;
        return data;
      }),
    );

    for (const profile of mentionProfiles) {
      if (
        profile?.id &&
        profile.id !== input.userId &&
        !recipients.has(profile.id)
      ) {
        recipients.set(profile.id, 'comment_mention');
      }
    }
  }

  await Promise.all(
    [...recipients.entries()].map(([userId, type]) =>
      createSocialNotification({
        userId,
        actorId: input.userId,
        type,
        payload: {
          commentId: input.commentId,
          animeId: input.animeId,
          animeSlug,
          animeTitle,
          episode: input.episode,
          href,
        },
      }),
    ),
  );

  await trackProductEvents([
    {
      eventName: 'social_comment_created',
      userId: input.userId,
      source: 'episode_comments',
      path: `/anime/${animeSlug}/episode/${input.episode}`,
      entityType: 'episode',
      entityId: `${input.animeId}:${input.episode}`,
      metadata: {
        comment_id: input.commentId,
        parent: Boolean(input.parentId),
        mentions: Math.max(
          0,
          [...recipients.values()].filter(
            (type) => type === 'comment_mention',
          ).length,
        ),
      },
      dedupeKey: `social-comment:${input.commentId}`,
    },
  ]);
}
