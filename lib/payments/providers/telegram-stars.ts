import 'server-only';

import {
  recordPaymentTransaction,
  updatePaymentTransactionByExternalId,
} from '@/lib/payments/service';

export async function recordTelegramStarsPayment({
  userId,
  telegramId,
  amount,
  telegramPaymentChargeId,
  providerPaymentChargeId,
  legacyStarPaymentId,
  createdAt,
  source,
}: {
  userId?: string | null;
  telegramId: number;
  amount: number;
  telegramPaymentChargeId: string;
  providerPaymentChargeId?: string | null;
  legacyStarPaymentId?: string | null;
  createdAt?: string | null;
  source: 'telegram_webhook' | 'reconciliation' | 'migration';
}) {
  const paidAt = createdAt ?? new Date().toISOString();

  return recordPaymentTransaction({
    userId: userId ?? null,
    provider: 'telegram_stars',
    productCode: 'sponsor_support',
    externalId: telegramPaymentChargeId,
    externalUserId: String(telegramId),
    status: 'paid',
    amount,
    currency: 'XTR',
    providerStatus: 'confirmed',
    providerCreatedAt: paidAt,
    paidAt,
    metadata: {
      telegram_id: telegramId,
      provider_payment_charge_id: providerPaymentChargeId ?? null,
      legacy_star_payment_id: legacyStarPaymentId ?? null,
    },
    eventType: source === 'reconciliation' ? 'payment.recovered' : 'payment.paid',
    eventDetails: { source, amount, telegram_id: telegramId },
  });
}

export async function markTelegramStarsPaymentRefunded({
  telegramPaymentChargeId,
  refundedAt,
  source,
}: {
  telegramPaymentChargeId: string;
  refundedAt: string;
  source: 'admin' | 'reconciliation';
}) {
  return updatePaymentTransactionByExternalId({
    provider: 'telegram_stars',
    externalId: telegramPaymentChargeId,
    status: 'refunded',
    providerStatus: 'refunded',
    refundedAt,
    eventType: 'payment.refunded',
    eventDetails: { source },
  });
}
