import { ApiError, adminClient, failure, readBody, response } from '@/lib/community-server';
import { requireAdmin, requireAdminMutation, writeAdminAudit } from '@/lib/admin-server';
import { getMyStarBalance, refundStarPayment } from '@/lib/telegram-stars';
import { reconcileStarPayments } from '@/lib/star-reconciliation';
import { isDonatePayConfigured } from '@/lib/payments/providers/donatepay';
import { syncDonatePayTransactions } from '@/lib/payments/sync-donatepay';
import { markTelegramStarsPaymentRefunded } from '@/lib/payments/providers/telegram-stars';
import {
  claimMonetizationOperation,
  finishMonetizationOperation,
  setPaymentIntegrityStatus,
  type PaymentIntegrityStatus,
} from '@/lib/monetization-reliability';

const PAGE_SIZE = 25;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function missingRelation(error: { code?: string } | null | undefined) {
  return error?.code === '42P01' || error?.code === 'PGRST205';
}

function missingColumn(error: { code?: string } | null | undefined) {
  return error?.code === '42703' || error?.code === 'PGRST204';
}

export async function GET(request: Request) {
  try {
    const { role } = await requireAdmin(['owner', 'admin']);
    const url = new URL(request.url);
    const page = Number(url.searchParams.get('page') ?? 1);
    const q = (url.searchParams.get('q') ?? '').trim().slice(0, 120);
    if (!Number.isInteger(page) || page < 1 || page > 10000) {
      throw new ApiError(400, 'Некорректная страница.');
    }

    const admin = adminClient();
    const from = (page - 1) * PAGE_SIZE;
    const to = page * PAGE_SIZE - 1;

    let matchedProfiles: { id: string; username: string | null; telegram_id: number | null }[] = [];
    if (q) {
      if (UUID_RE.test(q)) {
        const result = await admin.from('profiles').select('id,username,telegram_id').eq('id', q).limit(20);
        if (result.error) throw result.error;
        matchedProfiles = result.data ?? [];
      } else {
        const byName = await admin.from('profiles').select('id,username,telegram_id').ilike('username', `%${q}%`).limit(20);
        if (byName.error) throw byName.error;
        matchedProfiles = byName.data ?? [];
        if (/^\d{4,20}$/.test(q)) {
          const byTelegram = await admin.from('profiles').select('id,username,telegram_id').eq('telegram_id', Number(q)).limit(20);
          if (byTelegram.error) throw byTelegram.error;
          const map = new Map([...matchedProfiles, ...(byTelegram.data ?? [])].map((item) => [item.id, item]));
          matchedProfiles = [...map.values()];
        }
      }
    }

    let metrics = await admin.from('sponsor_metrics_v3').select('*').single();
    if (metrics.error && missingRelation(metrics.error)) {
      metrics = await admin.from('sponsor_metrics_v2').select('*').single();
    }
    if (metrics.error) throw metrics.error;

    const analyticsResult = await admin.from('sponsor_analytics_v3').select('*').single();
    const analytics = analyticsResult.error && missingRelation(analyticsResult.error)
      ? null
      : analyticsResult.error
        ? (() => { throw analyticsResult.error; })()
        : analyticsResult.data;

    let paymentsQuery = admin
      .from('star_payments')
      .select(
        'id,user_id,telegram_id,amount,created_at,status,reconciliation_status,telegram_verified_at,refunded_at,refund_reason,reconciliation_error,admin_note,telegram_payment_charge_id',
        { count: 'exact' },
      )
      .order('created_at', { ascending: false })
      .order('id', { ascending: false });

    let sponsorQuery = admin
      .from('sponsor_directory_v3')
      .select('*', { count: 'exact' })
      .order('total_stars', { ascending: false })
      .order('account_key');

    let unifiedQuery = admin
      .from('payment_transactions')
      .select(
        'id,user_id,provider,product_code,external_id,external_user_id,status,amount,currency,provider_status,provider_created_at,paid_at,refunded_at,metadata,created_at,integrity_status,integrity_note,reviewed_at,reviewed_by',
        { count: 'exact' },
      )
      .is('archived_at', null)
      .order('created_at', { ascending: false })
      .order('id', { ascending: false });

    if (q) {
      const ids = matchedProfiles.map((item) => item.id);
      if (ids.length) {
        paymentsQuery = paymentsQuery.in('user_id', ids);
        sponsorQuery = sponsorQuery.in('user_id', ids);
        unifiedQuery = unifiedQuery.in('user_id', ids);
      } else if (/^\d{4,20}$/.test(q)) {
        paymentsQuery = paymentsQuery.eq('telegram_id', Number(q));
        sponsorQuery = sponsorQuery.eq('account_key', `t:${q}`);
        unifiedQuery = unifiedQuery.eq('external_user_id', q);
      } else {
        return response({
          metrics: metrics.data,
          analytics,
          payments: [],
          unifiedPayments: [],
          sponsors: [],
          profiles: [],
          notes: [],
          adjustments: [],
          telegramBalance: null,
          donatePayConfigured: isDonatePayConfigured(),
          donatePaySync: null,
          page,
          q,
          hasMore: false,
          canAdjust: role === 'owner',
        });
      }
    }

    let sponsors = await sponsorQuery.range(from, to);
    if (sponsors.error && missingRelation(sponsors.error)) {
      let fallback = admin
        .from('sponsor_directory_v2')
        .select('*', { count: 'exact' })
        .order('total_stars', { ascending: false })
        .order('account_key');
      if (q && matchedProfiles.length) fallback = fallback.in('user_id', matchedProfiles.map((item) => item.id));
      sponsors = await fallback.range(from, to);
    }
    if (sponsors.error) throw sponsors.error;

    const payments = await paymentsQuery.range(from, to);
    if (payments.error) throw payments.error;

    let unifiedResult = await unifiedQuery.range(from, to);
    if (unifiedResult.error && missingColumn(unifiedResult.error)) {
      let fallbackUnifiedQuery = admin
        .from('payment_transactions')
        .select(
          'id,user_id,provider,product_code,external_id,external_user_id,status,amount,currency,provider_status,provider_created_at,paid_at,refunded_at,metadata,created_at',
          { count: 'exact' },
        )
        .is('archived_at', null)
        .order('created_at', { ascending: false })
        .order('id', { ascending: false });
      if (q) {
        const ids = matchedProfiles.map((item) => item.id);
        if (ids.length) fallbackUnifiedQuery = fallbackUnifiedQuery.in('user_id', ids);
        else if (/^\d{4,20}$/.test(q)) fallbackUnifiedQuery = fallbackUnifiedQuery.eq('external_user_id', q);
      }
      unifiedResult = (await fallbackUnifiedQuery.range(from, to)) as unknown as typeof unifiedResult;
    }

    const unifiedPayments = unifiedResult.error && missingRelation(unifiedResult.error)
      ? []
      : unifiedResult.error
        ? (() => { throw unifiedResult.error; })()
        : (unifiedResult.data ?? []).map((item) => ({
            ...item,
            integrity_status: 'integrity_status' in item ? item.integrity_status : 'ok',
            integrity_note: 'integrity_note' in item ? item.integrity_note : null,
            reviewed_at: 'reviewed_at' in item ? item.reviewed_at : null,
            reviewed_by: 'reviewed_by' in item ? item.reviewed_by : null,
          }));
    const unifiedCount = unifiedResult.error && missingRelation(unifiedResult.error)
      ? 0
      : unifiedResult.count ?? 0;

    const ids = [
      ...new Set(
        [...(payments.data ?? []), ...(sponsors.data ?? []), ...unifiedPayments, ...matchedProfiles]
          .map((item) => ('id' in item && 'username' in item ? item.id : item.user_id))
          .filter((value): value is string => Boolean(value)),
      ),
    ];

    const profiles = ids.length
      ? await admin.from('profiles').select('id,username,telegram_id').in('id', ids)
      : { data: [], error: null };
    if (profiles.error) throw profiles.error;

    const [notesResult, adjustmentsResult] = ids.length
      ? await Promise.all([
          admin.from('sponsor_admin_notes').select('user_id,note,updated_at').in('user_id', ids),
          admin
            .from('sponsor_manual_adjustments')
            .select('id,user_id,stars_delta,reason,actor_user_id,voided_at,created_at')
            .in('user_id', ids)
            .order('created_at', { ascending: false })
            .limit(100),
        ])
      : [{ data: [], error: null }, { data: [], error: null }];

    if (notesResult.error && !missingRelation(notesResult.error)) throw notesResult.error;
    if (adjustmentsResult.error && !missingRelation(adjustmentsResult.error)) throw adjustmentsResult.error;

    let telegramBalance: number | null = null;
    const botToken = process.env.TELEGRAM_BOT_TOKEN?.trim();
    if (botToken) {
      try {
        telegramBalance = (await getMyStarBalance(botToken)).amount;
      } catch (error) {
        console.error('[Admin monetization] balance fetch failed', error);
      }
    }

    const donatePayStateResult = await admin
      .from('payment_provider_sync_state')
      .select('cursor,last_synced_at,last_error,metadata')
      .eq('provider', 'donatepay')
      .maybeSingle();
    const donatePaySync = donatePayStateResult.error && missingRelation(donatePayStateResult.error)
      ? null
      : donatePayStateResult.error
        ? (() => { throw donatePayStateResult.error; })()
        : donatePayStateResult.data;

    return response({
      metrics: metrics.data,
      analytics,
      payments: payments.data,
      unifiedPayments,
      sponsors: sponsors.data,
      profiles: profiles.data,
      notes: notesResult.data ?? [],
      adjustments: adjustmentsResult.data ?? [],
      telegramBalance,
      donatePayConfigured: isDonatePayConfigured(),
      donatePaySync,
      page,
      q,
      hasMore: page * PAGE_SIZE < Math.max(payments.count ?? 0, sponsors.count ?? 0, unifiedCount),
      canAdjust: role === 'owner',
    });
  } catch (error) {
    return failure(error);
  }
}

export async function POST(request: Request) {
  try {
    await requireAdminMutation(request, ['owner', 'admin']);
    const rawBody = await readBody(request);
    const body = rawBody as {
      action?: string;
      paymentId?: string;
      userId?: string;
      adjustmentId?: string;
      starsDelta?: number;
      reason?: string;
      note?: string;
      transactionId?: string;
      integrityStatus?: PaymentIntegrityStatus;
    };

    const action = body.action?.trim();
    if (!action) throw new ApiError(400, 'Не указано действие.');
    const admin = adminClient();

    if (action === 'reconcile') {
      const { user, role } = await requireAdmin(['owner', 'admin']);
      const botToken = process.env.TELEGRAM_BOT_TOKEN?.trim();
      if (!botToken) throw new ApiError(500, 'TELEGRAM_BOT_TOKEN не настроен.');
      const result = await reconcileStarPayments({ botToken, transactionLimit: 100 });
      await writeAdminAudit({ actorId: user.id, actorRole: role, action: 'stars.reconcile', targetType: 'monetization', details: result });
      return response({ ok: true, result });
    }

    if (action === 'sync_donatepay') {
      const { user, role } = await requireAdmin(['owner', 'admin']);
      if (!isDonatePayConfigured()) {
        throw new ApiError(503, 'DONATEPAY_API_TOKEN не настроен.');
      }
      const result = await syncDonatePayTransactions();
      await writeAdminAudit({
        actorId: user.id,
        actorRole: role,
        action: 'payments.donatepay_sync',
        targetType: 'monetization',
        details: result,
      });
      return response({ ok: true, result });
    }

    if (action === 'manual_adjustment') {
      const { user, role } = await requireAdmin(['owner']);
      const userId = body.userId?.trim() ?? '';
      const delta = Number(body.starsDelta);
      const reason = (body.reason ?? '').trim().slice(0, 500);
      if (!UUID_RE.test(userId)) throw new ApiError(400, 'Некорректный пользователь.');
      if (!Number.isInteger(delta) || delta === 0 || Math.abs(delta) > 100000) throw new ApiError(400, 'Корректировка должна быть целым числом от -100000 до 100000, кроме 0.');
      if (reason.length < 3) throw new ApiError(400, 'Укажи причину корректировки.');
      const { data, error } = await admin.from('sponsor_manual_adjustments').insert({ user_id: userId, stars_delta: delta, reason, actor_user_id: user.id }).select('id').single();
      if (error) throw error;
      await writeAdminAudit({ actorId: user.id, actorRole: role, action: 'sponsor.adjust', targetType: 'profile', targetId: userId, reason, details: { delta, adjustment_id: data.id } });
      return response({ ok: true, id: data.id });
    }

    if (action === 'void_adjustment') {
      const { user, role } = await requireAdmin(['owner']);
      const adjustmentId = body.adjustmentId?.trim() ?? '';
      if (!UUID_RE.test(adjustmentId)) throw new ApiError(400, 'Некорректная корректировка.');
      const { data: adjustment, error: lookupError } = await admin.from('sponsor_manual_adjustments').select('id,user_id,stars_delta,reason,voided_at').eq('id', adjustmentId).single();
      if (lookupError) throw lookupError;
      if (adjustment.voided_at) throw new ApiError(409, 'Корректировка уже отменена.');
      const { error } = await admin.from('sponsor_manual_adjustments').update({ voided_at: new Date().toISOString(), voided_by: user.id }).eq('id', adjustmentId).is('voided_at', null);
      if (error) throw error;
      await writeAdminAudit({ actorId: user.id, actorRole: role, action: 'sponsor.adjust_void', targetType: 'profile', targetId: adjustment.user_id, details: { stars_delta: adjustment.stars_delta, adjustment_id: adjustment.id } });
      return response({ ok: true });
    }

    if (action === 'sponsor_note') {
      const { user, role } = await requireAdmin(['owner', 'admin']);
      const userId = body.userId?.trim() ?? '';
      if (!UUID_RE.test(userId)) throw new ApiError(400, 'Некорректный пользователь.');
      const note = (body.note ?? '').trim().slice(0, 3000);
      const { error } = await admin.from('sponsor_admin_notes').upsert({ user_id: userId, note, updated_by: user.id, updated_at: new Date().toISOString() }, { onConflict: 'user_id' });
      if (error) throw error;
      await writeAdminAudit({ actorId: user.id, actorRole: role, action: 'sponsor.note', targetType: 'profile', targetId: userId, details: { note } });
      return response({ ok: true });
    }

    if (action === 'payment_integrity') {
      const { user, role } = await requireAdmin(['owner', 'admin']);
      const transactionId = body.transactionId?.trim() ?? '';
      const integrityStatus = body.integrityStatus;
      const allowed: PaymentIntegrityStatus[] = ['ok', 'needs_review', 'disputed', 'reconciliation_error'];
      if (!UUID_RE.test(transactionId)) throw new ApiError(400, 'Некорректный unified payment.');
      if (!integrityStatus || !allowed.includes(integrityStatus)) {
        throw new ApiError(400, 'Некорректный статус проверки.');
      }
      const note = (body.note ?? '').trim().slice(0, 1000);
      if (integrityStatus !== 'ok' && note.length < 3) {
        throw new ApiError(400, 'Для проблемного платежа укажи причину.');
      }
      const result = await setPaymentIntegrityStatus({
        transactionId,
        status: integrityStatus,
        note,
        actorUserId: user.id,
      });
      await writeAdminAudit({
        actorId: user.id,
        actorRole: role,
        action: 'payment.integrity',
        targetType: 'payment_transaction',
        targetId: transactionId,
        reason: note || undefined,
        details: { integrity_status: integrityStatus, changed: result.changed },
      });
      return response({ ok: true, result });
    }

    const paymentId = body.paymentId?.trim();
    if (!paymentId) throw new ApiError(400, 'Не указан платёж.');

    if (action === 'note') {
      const { user, role } = await requireAdmin(['owner', 'admin']);
      const note = (body.note ?? '').trim().slice(0, 1000);
      const { error } = await admin.from('star_payments').update({ admin_note: note || null }).eq('id', paymentId);
      if (error) throw error;
      await admin.from('star_payment_events').insert({ payment_id: paymentId, event_type: 'admin_note_updated', actor_user_id: user.id, details: { note } });
      await writeAdminAudit({ actorId: user.id, actorRole: role, action: 'stars.note', targetType: 'star_payment', targetId: paymentId, details: { note } });
      return response({ ok: true });
    }

    if (action === 'refund') {
      const { user, role } = await requireAdmin(['owner']);
      const botToken = process.env.TELEGRAM_BOT_TOKEN?.trim();
      if (!botToken) throw new ApiError(500, 'TELEGRAM_BOT_TOKEN не настроен.');
      const { data: payment, error } = await admin.from('star_payments').select('id,telegram_id,amount,status,telegram_payment_charge_id').eq('id', paymentId).single();
      if (error) throw error;
      if (payment.status === 'refunded') throw new ApiError(409, 'Платёж уже возвращён.');
      if (payment.status !== 'confirmed') throw new ApiError(409, 'Возврат доступен только для подтверждённого платежа.');
      const reason = (body.reason ?? '').trim().slice(0, 500) || 'Возврат администратором';
      const operation = await claimMonetizationOperation({
        operationKey: `telegram-stars-refund:${payment.telegram_payment_charge_id}`,
        operationType: 'telegram_stars.refund',
        targetType: 'star_payment',
        targetId: payment.id,
        actorUserId: user.id,
        metadata: { amount: payment.amount, telegram_id: payment.telegram_id, reason },
      });
      if (!operation.claimed) {
        throw new ApiError(409, operation.status === 'completed'
          ? 'Этот возврат уже был выполнен.'
          : 'Возврат уже выполняется другим запросом.');
      }

      await admin.from('star_payment_events').insert({ payment_id: payment.id, event_type: 'refund_requested', actor_user_id: user.id, details: { reason, amount: payment.amount } });
      let providerRefundCompleted = false;
      try {
        await refundStarPayment({ botToken, userId: Number(payment.telegram_id), telegramPaymentChargeId: payment.telegram_payment_charge_id });
        providerRefundCompleted = true;
        const now = new Date().toISOString();

        // The external money-moving action is complete. Lock the operation now,
        // before local bookkeeping, so a transient DB error can never trigger a
        // second provider refund on retry. Reconciliation repairs local state.
        await finishMonetizationOperation({
          id: operation.id,
          status: 'completed',
          metadata: { provider_refund_completed: true, refunded_at: now, reason },
        });

        const { error: updateError } = await admin.from('star_payments').update({ status: 'refunded', reconciliation_status: 'refunded', refunded_at: now, refund_reason: reason, reconciliation_error: null, telegram_verified_at: now }).eq('id', payment.id);
        if (updateError) throw updateError;
        await admin.from('star_payment_events').insert({ payment_id: payment.id, event_type: 'refund_completed', actor_user_id: user.id, details: { reason, amount: payment.amount } });
        await markTelegramStarsPaymentRefunded({
          telegramPaymentChargeId: payment.telegram_payment_charge_id,
          refundedAt: now,
          source: 'admin',
        });
        await writeAdminAudit({ actorId: user.id, actorRole: role, action: 'stars.refund', targetType: 'star_payment', targetId: payment.id, reason, details: { amount: payment.amount, telegram_id: payment.telegram_id } });
        return response({ ok: true });
      } catch (refundError) {
        const message = refundError instanceof Error ? refundError.message : 'unknown_error';
        await admin.from('star_payment_events').insert({ payment_id: payment.id, event_type: providerRefundCompleted ? 'refund_local_sync_failed' : 'refund_failed', actor_user_id: user.id, details: { reason, error: message } });
        await finishMonetizationOperation({
          id: operation.id,
          status: providerRefundCompleted ? 'completed' : 'failed',
          error: message,
          metadata: { reason, provider_refund_completed: providerRefundCompleted, local_sync_failed: providerRefundCompleted },
        });
        throw refundError;
      }
    }

    throw new ApiError(400, 'Неизвестное действие.');
  } catch (error) {
    return failure(error);
  }
}
