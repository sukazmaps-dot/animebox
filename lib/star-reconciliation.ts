import 'server-only';

import { adminClient } from '@/lib/community-server';
import {
  getMyStarBalance,
  getStarTransactions,
  parseSupportPayload,
  type TelegramStarPartnerUser,
  type TelegramStarTransaction,
} from '@/lib/telegram-stars';
import {
  markTelegramStarsPaymentRefunded,
  recordTelegramStarsPayment,
} from '@/lib/payments/providers/telegram-stars';

type PaymentRow = {
  id: string;
  user_id: string | null;
  telegram_id: number;
  amount: number;
  invoice_payload: string;
  telegram_payment_charge_id: string;
  status: string;
  created_at: string;
};

function userPartner(value: TelegramStarTransaction['source'] | TelegramStarTransaction['receiver']) {
  if (!value || value.type !== 'user') return null;
  return value as TelegramStarPartnerUser;
}

async function addEvent(
  paymentId: string,
  eventType: string,
  details: Record<string, unknown> = {},
  actorUserId?: string | null,
) {
  const { error } = await adminClient().from('star_payment_events').insert({
    payment_id: paymentId,
    event_type: eventType,
    actor_user_id: actorUserId ?? null,
    details,
  });
  if (error) console.error('[Stars reconcile] event insert failed', error);
}

async function resolveAnimeBoxUserId(telegramId: number) {
  const { data, error } = await adminClient()
    .from('profiles')
    .select('id')
    .eq('telegram_id', telegramId)
    .limit(2);
  if (error) throw error;
  return data?.length === 1 ? data[0].id : null;
}

export async function reconcileStarPayments({
  botToken,
  transactionLimit = 100,
}: {
  botToken: string;
  transactionLimit?: number;
}) {
  const admin = adminClient();
  const [history, balance] = await Promise.all([
    getStarTransactions(botToken, { limit: transactionLimit }),
    getMyStarBalance(botToken),
  ]);

  const txById = new Map<string, TelegramStarTransaction[]>();
  for (const tx of history.transactions ?? []) {
    const bucket = txById.get(tx.id) ?? [];
    bucket.push(tx);
    txById.set(tx.id, bucket);
  }

  const { data: payments, error: paymentsError } = await admin
    .from('star_payments')
    .select(
      'id,user_id,telegram_id,amount,invoice_payload,telegram_payment_charge_id,status,created_at',
    )
    .order('created_at', { ascending: false })
    .limit(transactionLimit);
  if (paymentsError) throw paymentsError;

  let verified = 0;
  let refunded = 0;
  let mismatched = 0;
  let notFound = 0;
  let recovered = 0;

  for (const payment of (payments ?? []) as PaymentRow[]) {
    const matches = txById.get(payment.telegram_payment_charge_id) ?? [];
    const outgoingRefund = matches.find((tx) => userPartner(tx.receiver));
    const incoming = matches.find((tx) => {
      const source = userPartner(tx.source);
      return source?.transaction_type === 'invoice_payment';
    });

    if (outgoingRefund) {
      const refundedAt = new Date(outgoingRefund.date * 1000).toISOString();
      if (payment.status !== 'refunded') {
        const { error } = await admin
          .from('star_payments')
          .update({
            status: 'refunded',
            reconciliation_status: 'refunded',
            refunded_at: refundedAt,
            telegram_verified_at: new Date().toISOString(),
            reconciliation_error: null,
          })
          .eq('id', payment.id);
        if (error) throw error;
        await addEvent(payment.id, 'refund_completed', { source: 'reconciliation' });
      }

      await markTelegramStarsPaymentRefunded({
        telegramPaymentChargeId: payment.telegram_payment_charge_id,
        refundedAt,
        source: 'reconciliation',
      });

      refunded += 1;
      continue;
    }

    if (!incoming) {
      const { error } = await admin
        .from('star_payments')
        .update({
          reconciliation_status: 'not_found',
          reconciliation_error:
            'Транзакция не найдена в текущем окне getStarTransactions; статус платежа не изменён.',
        })
        .eq('id', payment.id);
      if (error) throw error;
      await addEvent(payment.id, 'reconciliation_not_found');
      notFound += 1;
      continue;
    }

    const source = userPartner(incoming.source);
    const telegramUserId = Number(source?.user?.id ?? 0);
    const payload = source?.invoice_payload ?? payment.invoice_payload;
    const parsed = parseSupportPayload(payload);
    const exactMatch =
      incoming.amount === payment.amount &&
      telegramUserId === Number(payment.telegram_id) &&
      (!parsed || parsed.amount === payment.amount);

    if (!exactMatch) {
      const { error } = await admin
        .from('star_payments')
        .update({
          status: 'reconciliation_error',
          reconciliation_status: 'mismatch',
          reconciliation_error: `Telegram mismatch: amount=${incoming.amount}, user=${telegramUserId}`,
          telegram_verified_at: new Date().toISOString(),
        })
        .eq('id', payment.id);
      if (error) throw error;
      await addEvent(payment.id, 'reconciliation_mismatch', {
        telegram_amount: incoming.amount,
        telegram_user_id: telegramUserId,
      });
      mismatched += 1;
      continue;
    }

    const { error } = await admin
      .from('star_payments')
      .update({
        status: 'confirmed',
        reconciliation_status: 'verified',
        reconciliation_error: null,
        telegram_verified_at: new Date().toISOString(),
      })
      .eq('id', payment.id);
    if (error) throw error;
    await addEvent(payment.id, 'telegram_verified', { source: 'getStarTransactions' });
    await recordTelegramStarsPayment({
      userId: payment.user_id,
      telegramId: payment.telegram_id,
      amount: payment.amount,
      telegramPaymentChargeId: payment.telegram_payment_charge_id,
      legacyStarPaymentId: payment.id,
      createdAt: payment.created_at,
      source: 'reconciliation',
    });
    verified += 1;
  }

  const knownIds = new Set((payments ?? []).map((row) => row.telegram_payment_charge_id));
  for (const tx of history.transactions ?? []) {
    if (knownIds.has(tx.id)) continue;
    const source = userPartner(tx.source);
    if (!source || source.transaction_type !== 'invoice_payment') continue;

    const telegramId = Number(source.user?.id ?? 0);
    const parsed = parseSupportPayload(source.invoice_payload);
    if (!parsed || telegramId <= 0 || tx.amount !== parsed.amount) continue;

    const userId = await resolveAnimeBoxUserId(telegramId);
    const { data: recoveredPayment, error } = await admin
      .from('star_payments')
      .upsert(
        {
          user_id: userId,
          telegram_id: telegramId,
          chat_id: telegramId,
          amount: tx.amount,
          currency: 'XTR',
          invoice_payload: source.invoice_payload,
          telegram_payment_charge_id: tx.id,
          provider_payment_charge_id: null,
          status: 'confirmed',
          reconciliation_status: 'verified',
          telegram_verified_at: new Date().toISOString(),
          reconciliation_error: null,
          created_at: new Date(tx.date * 1000).toISOString(),
        },
        { onConflict: 'telegram_payment_charge_id', ignoreDuplicates: true },
      )
      .select('id')
      .maybeSingle();
    if (error) throw error;
    if (recoveredPayment?.id) {
      await addEvent(recoveredPayment.id, 'payment_recovered', {
        source: 'getStarTransactions',
      });
      await recordTelegramStarsPayment({
        userId,
        telegramId,
        amount: tx.amount,
        telegramPaymentChargeId: tx.id,
        legacyStarPaymentId: recoveredPayment.id,
        createdAt: new Date(tx.date * 1000).toISOString(),
        source: 'reconciliation',
      });
      recovered += 1;
    }
  }

  return {
    balance,
    scannedTransactions: history.transactions?.length ?? 0,
    verified,
    refunded,
    mismatched,
    notFound,
    recovered,
  };
}
