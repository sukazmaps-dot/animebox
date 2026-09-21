import { assertAcceptedFriendship } from '@/lib/friends-server';
import { createSocialNotification } from '@/lib/social-notifications-server';
import {
  ApiError,
  adminClient,
  failure,
  readBody,
  response,
  userClient,
} from '@/lib/community-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function validInviteUrl(value: string, requestUrl: string) {
  try {
    const url = new URL(value);
    const requestOrigin = new URL(requestUrl).origin;
    const production =
      url.protocol === 'https:' &&
      (url.hostname === 'youranimebox.com' || url.hostname === 'www.youranimebox.com');

    if (url.origin !== requestOrigin && !production) return null;
    if (!/^\/watch-together\/[^/]+\/episode\/\d+$/u.test(url.pathname)) return null;
    if (!url.searchParams.get('party')) return null;

    const hash = new URLSearchParams(url.hash.replace(/^#/, ''));
    if (!hash.get('partyKey')) return null;

    return url.toString();
  } catch {
    return null;
  }
}

export async function POST(request: Request) {
  try {
    const { user } = await userClient();
    const body = await readBody(request);

    const friendId = typeof body.friendId === 'string' ? body.friendId.trim() : '';
    const rawInviteUrl = typeof body.inviteUrl === 'string' ? body.inviteUrl.trim() : '';
    const inviteUrl = validInviteUrl(rawInviteUrl, request.url);

    if (!inviteUrl) throw new ApiError(400, 'Некорректная ссылка на комнату.');

    await assertAcceptedFriendship(user.id, friendId);

    const admin = adminClient();
    const thirtySecondsAgo = new Date(Date.now() - 30_000).toISOString();
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();

    const [recentForFriend, hourly] = await Promise.all([
      admin
        .from('social_notifications')
        .select('id', { count: 'exact', head: true })
        .eq('actor_id', user.id)
        .eq('user_id', friendId)
        .eq('type', 'watch_party_invite')
        .gte('created_at', thirtySecondsAgo),
      admin
        .from('social_notifications')
        .select('id', { count: 'exact', head: true })
        .eq('actor_id', user.id)
        .eq('type', 'watch_party_invite')
        .gte('created_at', oneHourAgo),
    ]);

    if (recentForFriend.error) throw recentForFriend.error;
    if (hourly.error) throw hourly.error;

    if ((recentForFriend.count ?? 0) > 0) {
      throw new ApiError(429, 'Подожди немного перед повторным приглашением этого друга.');
    }
    if ((hourly.count ?? 0) >= 20) {
      throw new ApiError(429, 'Слишком много приглашений за час. Попробуй позже.');
    }

    await createSocialNotification({
      userId: friendId,
      actorId: user.id,
      type: 'watch_party_invite',
      payload: {
        inviteUrl,
        animeTitle:
          typeof body.animeTitle === 'string'
            ? body.animeTitle.trim().slice(0, 180)
            : '',
        episode:
          Number.isSafeInteger(Number(body.episode))
            ? Number(body.episode)
            : null,
      },
    });

    return response({ ok: true }, 201);
  } catch (error) {
    return failure(error);
  }
}
