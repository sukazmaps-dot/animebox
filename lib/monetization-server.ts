import 'server-only';

import { createSupabaseAdmin } from '@/lib/supabase/admin';

export async function recordStarPayment({
  telegramId,
  chatId,
  amount,
  invoicePayload,
  telegramPaymentChargeId,
  providerPaymentChargeId,
}: {
  telegramId: number;
  chatId: number | null;
  amount: number;
  invoicePayload: string;
  telegramPaymentChargeId: string;
  providerPaymentChargeId?: string | null;
}) {
  const supabase = createSupabaseAdmin();

  const { data: profile } = await supabase
    .from('profiles')
    .select('id')
    .eq('telegram_id', telegramId)
    .maybeSingle();

  const { data: inserted, error } = await supabase
    .from('star_payments')
    .upsert(
      {
        user_id: profile?.id ?? null,
        telegram_id: telegramId,
        chat_id: chatId,
        amount,
        currency: 'XTR',
        invoice_payload: invoicePayload,
        telegram_payment_charge_id: telegramPaymentChargeId,
        provider_payment_charge_id: providerPaymentChargeId || null,
        status: 'confirmed',
        reconciliation_status: 'pending',
        reconciliation_error: null,
      },
      {
        onConflict: 'telegram_payment_charge_id',
        ignoreDuplicates: true,
      },
    )
    .select('id')
    .maybeSingle();

  if (error) throw error;

  if (inserted?.id) {
    const { error: eventError } = await supabase.from('star_payment_events').insert({
      payment_id: inserted.id,
      event_type: 'payment_received',
      details: { source: 'telegram_webhook', amount, telegram_id: telegramId },
    });
    if (eventError) {
      console.error('[AnimeBox Stars] failed to record payment event', eventError);
    }
  }

  return { userId: profile?.id ?? null };
}

export async function recordPaymentSupportRequest({
  telegramId,
  chatId,
  message,
}: {
  telegramId: number;
  chatId: number;
  message: string;
}) {
  const supabase = createSupabaseAdmin();

  const { error } = await supabase.from('payment_support_requests').insert({
    telegram_id: telegramId,
    chat_id: chatId,
    message,
    status: 'open',
  });

  if (error) throw error;
}
