import 'server-only';

import { recordPaymentTransaction } from '@/lib/payments/service';
import type { PremiumPlanId } from '@/lib/premium';

export async function recordPremiumTelegramStarsPayment({
  userId,
  telegramId,
  plan,
  amount,
  durationDays,
  telegramPaymentChargeId,
  providerPaymentChargeId,
  createdAt,
}: {
  userId: string;
  telegramId: number;
  plan: PremiumPlanId;
  amount: number;
  durationDays: number;
  telegramPaymentChargeId: string;
  providerPaymentChargeId?: string | null;
  createdAt?: string | null;
}) {
  const paidAt = createdAt ?? new Date().toISOString();
  const productCode = plan === 'yearly' ? 'premium_yearly' : 'premium_monthly';

  return recordPaymentTransaction({
    userId,
    provider: 'telegram_stars',
    productCode,
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
      premium_plan: plan,
      duration_days: durationDays,
    },
    eventType: 'payment.paid',
    eventDetails: {
      source: 'telegram_webhook',
      product: productCode,
      plan,
      amount,
      duration_days: durationDays,
      telegram_id: telegramId,
    },
  });
}
