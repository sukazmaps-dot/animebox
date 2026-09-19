import { adminClient, response } from '@/lib/community-server';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const admin = adminClient();
    const settings = await admin
      .from('chat_settings')
      .select('slow_mode_seconds,pinned_message_id')
      .eq('id', 1)
      .maybeSingle();
    if (settings.error) throw settings.error;

    let pinnedMessage = null;
    if (settings.data?.pinned_message_id) {
      const message = await admin
        .from('chat_messages')
        .select('id,user_id,body,created_at,deleted_at')
        .eq('id', settings.data.pinned_message_id)
        .maybeSingle();
      if (message.error) throw message.error;

      if (message.data && !message.data.deleted_at) {
        const profile = await admin.from('profiles').select('username').eq('id', message.data.user_id).maybeSingle();
        pinnedMessage = {
          id: message.data.id,
          body: message.data.body,
          userId: message.data.user_id,
          username: profile.data?.username?.trim() || 'AnimeBox',
          createdAt: message.data.created_at,
        };
      }
    }

    return response({
      slowModeSeconds: Number(settings.data?.slow_mode_seconds ?? 0),
      pinnedMessage,
    });
  } catch (error) {
    console.error('[Chat settings]', error);
    return response({ slowModeSeconds: 0, pinnedMessage: null });
  }
}
