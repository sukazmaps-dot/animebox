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

  const { error } = await supabase
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
        provider_payment_charge_id:
          providerPaymentChargeId || null,
      },
      {
        onConflict: 'telegram_payment_charge_id',
        ignoreDuplicates: true,
      },
    );

  if (error) {
    throw error;
  }

  return {
    userId: profile?.id ?? null,
  };
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

  const { error } = await supabase
    .from('payment_support_requests')
    .insert({
      telegram_id: telegramId,
      chat_id: chatId,
      message,
      status: 'open',
    });

  if (error) {
    throw error;
  }
}
