import { ApiError, adminClient, failure, response } from '@/lib/community-server';
import { requireAdmin, writeAdminAudit } from '@/lib/admin-server';
import { getMyStarBalance, refundStarPayment } from '@/lib/telegram-stars';
import { reconcileStarPayments } from '@/lib/star-reconciliation';

const PAGE_SIZE = 25;

export async function GET(request: Request) {
  try {
    await requireAdmin(['owner', 'admin']);

    const page = Number(new URL(request.url).searchParams.get('page') ?? 1);
    if (!Number.isInteger(page) || page < 1 || page > 10000) {
      throw new ApiError(400, 'Некорректная страница.');
    }

    const admin = adminClient();
    const from = (page - 1) * PAGE_SIZE;
    const to = page * PAGE_SIZE - 1;

    const [metrics, payments, sponsors] = await Promise.all([
      admin.from('sponsor_metrics_v2').select('*').single(),
      admin
        .from('star_payments')
        .select(
          'id,user_id,telegram_id,amount,created_at,status,reconciliation_status,telegram_verified_at,refunded_at,refund_reason,reconciliation_error,admin_note,telegram_payment_charge_id',
          { count: 'exact' },
        )
        .order('created_at', { ascending: false })
        .order('id', { ascending: false })
        .range(from, to),
      admin
        .from('sponsor_directory_v2')
        .select('*', { count: 'exact' })
        .order('total_stars', { ascending: false })
        .order('account_key')
        .range(from, to),
    ]);

    for (const result of [metrics, payments, sponsors]) {
      if (result.error) throw result.error;
    }

    const ids = [
      ...new Set(
        [...(payments.data ?? []), ...(sponsors.data ?? [])]
          .map((item) => item.user_id)
          .filter(Boolean),
      ),
    ];

    const profiles = ids.length
      ? await admin.from('profiles').select('id,username').in('id', ids)
      : { data: [], error: null };
    if (profiles.error) throw profiles.error;

    let telegramBalance: number | null = null;
    const botToken = process.env.TELEGRAM_BOT_TOKEN?.trim();
    if (botToken) {
      try {
        telegramBalance = (await getMyStarBalance(botToken)).amount;
      } catch (error) {
        console.error('[Admin monetization] balance fetch failed', error);
      }
    }

    return response({
      metrics: metrics.data,
      payments: payments.data,
      sponsors: sponsors.data,
      profiles: profiles.data,
      telegramBalance,
      page,
      hasMore: page * PAGE_SIZE < Math.max(payments.count ?? 0, sponsors.count ?? 0),
    });
  } catch (error) {
    return failure(error);
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      action?: string;
      paymentId?: string;
      reason?: string;
      note?: string;
    };

    const action = body.action?.trim();
    if (!action) throw new ApiError(400, 'Не указано действие.');

    const admin = adminClient();

    if (action === 'reconcile') {
      const { user, role } = await requireAdmin(['owner', 'admin']);
      const botToken = process.env.TELEGRAM_BOT_TOKEN?.trim();
      if (!botToken) throw new ApiError(500, 'TELEGRAM_BOT_TOKEN не настроен.');

      const result = await reconcileStarPayments({ botToken, transactionLimit: 100 });
      await writeAdminAudit({
        actorId: user.id,
        actorRole: role,
        action: 'stars.reconcile',
        targetType: 'monetization',
        details: result,
      });
      return response({ ok: true, result });
    }

    const paymentId = body.paymentId?.trim();
    if (!paymentId) throw new ApiError(400, 'Не указан платёж.');

    if (action === 'note') {
      const { user, role } = await requireAdmin(['owner', 'admin']);
      const note = (body.note ?? '').trim().slice(0, 1000);
      const { error } = await admin
        .from('star_payments')
        .update({ admin_note: note || null })
        .eq('id', paymentId);
      if (error) throw error;
      await admin.from('star_payment_events').insert({
        payment_id: paymentId,
        event_type: 'admin_note_updated',
        actor_user_id: user.id,
        details: { note },
      });
      await writeAdminAudit({
        actorId: user.id,
        actorRole: role,
        action: 'stars.note',
        targetType: 'star_payment',
        targetId: paymentId,
        details: { note },
      });
      return response({ ok: true });
    }

    if (action === 'refund') {
      const { user, role } = await requireAdmin(['owner']);
      const botToken = process.env.TELEGRAM_BOT_TOKEN?.trim();
      if (!botToken) throw new ApiError(500, 'TELEGRAM_BOT_TOKEN не настроен.');

      const { data: payment, error } = await admin
        .from('star_payments')
        .select('id,telegram_id,amount,status,telegram_payment_charge_id')
        .eq('id', paymentId)
        .single();
      if (error) throw error;
      if (payment.status === 'refunded') throw new ApiError(409, 'Платёж уже возвращён.');
      if (payment.status !== 'confirmed') {
        throw new ApiError(409, 'Возврат доступен только для подтверждённого платежа.');
      }

      const reason = (body.reason ?? '').trim().slice(0, 500) || 'Возврат администратором';
      await admin.from('star_payment_events').insert({
        payment_id: payment.id,
        event_type: 'refund_requested',
        actor_user_id: user.id,
        details: { reason, amount: payment.amount },
      });

      try {
        await refundStarPayment({
          botToken,
          userId: Number(payment.telegram_id),
          telegramPaymentChargeId: payment.telegram_payment_charge_id,
        });
      } catch (refundError) {
        await admin.from('star_payment_events').insert({
          payment_id: payment.id,
          event_type: 'refund_failed',
          actor_user_id: user.id,
          details: {
            reason,
            error: refundError instanceof Error ? refundError.message : 'unknown_error',
          },
        });
        throw refundError;
      }

      const now = new Date().toISOString();
      const { error: updateError } = await admin
        .from('star_payments')
        .update({
          status: 'refunded',
          reconciliation_status: 'refunded',
          refunded_at: now,
          refund_reason: reason,
          reconciliation_error: null,
          telegram_verified_at: now,
        })
        .eq('id', payment.id);
      if (updateError) throw updateError;

      await admin.from('star_payment_events').insert({
        payment_id: payment.id,
        event_type: 'refund_completed',
        actor_user_id: user.id,
        details: { reason, amount: payment.amount },
      });
      await writeAdminAudit({
        actorId: user.id,
        actorRole: role,
        action: 'stars.refund',
        targetType: 'star_payment',
        targetId: payment.id,
        reason,
        details: { amount: payment.amount, telegram_id: payment.telegram_id },
      });

      return response({ ok: true });
    }

    throw new ApiError(400, 'Неизвестное действие.');
  } catch (error) {
    return failure(error);
  }
}
