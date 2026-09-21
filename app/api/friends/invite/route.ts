import { assertAcceptedFriendship } from '@/lib/friends-server';
import { createSocialNotification } from '@/lib/social-notifications-server';
import {
  ApiError,
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
