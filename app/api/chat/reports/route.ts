import { ApiError, adminClient, readBody, response, userClient } from '@/lib/community-server';
import type { ChatReportReason } from '@/types/chat';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const REASONS: ChatReportReason[] = ['spam', 'abuse', 'nsfw', 'spoiler', 'scam', 'other'];

export async function POST(request: Request) {
  try {
    const { user } = await userClient();
    const body = await readBody(request);
    const messageId = typeof body.messageId === 'string' ? body.messageId : '';
    const reason = typeof body.reason === 'string' ? body.reason as ChatReportReason : null;
    const details = typeof body.details === 'string' ? body.details.trim().slice(0, 300) : '';

    if (!UUID.test(messageId) || !reason || !REASONS.includes(reason)) {
      throw new ApiError(400, 'Некорректная жалоба.');
    }

    const admin = adminClient();
    const recentReports = await admin
      .from('chat_reports')
      .select('*', { count: 'exact', head: true })
      .eq('reporter_id', user.id)
      .gte('created_at', new Date(Date.now() - 3_600_000).toISOString());
    if (recentReports.error) throw recentReports.error;
    if ((recentReports.count ?? 0) >= 10) throw new ApiError(429, 'Слишком много жалоб. Попробуй позже.');

    const message = await admin
      .from('chat_messages')
      .select('id,user_id,deleted_at')
      .eq('id', messageId)
      .maybeSingle();
    if (message.error) throw message.error;
    if (!message.data || message.data.deleted_at) throw new ApiError(404, 'Сообщение уже недоступно.');
    if (message.data.user_id === user.id) throw new ApiError(400, 'Нельзя пожаловаться на собственное сообщение.');

    const inserted = await admin.from('chat_reports').insert({
      message_id: messageId,
      reporter_id: user.id,
      reason,
      details: details || null,
    });

    if (inserted.error?.code === '23505') throw new ApiError(409, 'Ты уже отправлял жалобу на это сообщение.');
    if (inserted.error) throw inserted.error;

    return response({ ok: true }, 201);
  } catch (error) {
    if (error instanceof ApiError) return response({ error: error.message }, error.status);
    console.error('[Chat report]', error);
    return response({ error: 'Не удалось отправить жалобу.' }, 503);
  }
}
