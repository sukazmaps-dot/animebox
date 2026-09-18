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
  isRecurring = false,
  isFirstRecurring = false,
  subscriptionExpirationDate = null,
}: {
  userId: string;
  telegramId: number;
  plan: PremiumPlanId;
  amount: number;
  durationDays: number;
  telegramPaymentChargeId: string;
  providerPaymentChargeId?: string | null;
  createdAt?: string | null;
  isRecurring?: boolean;
  isFirstRecurring?: boolean;
  subscriptionExpirationDate?: number | null;
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
    providerStatus: isRecurring
      ? isFirstRecurring
        ? 'recurring_first'
        : 'recurring_renewal'
      : 'confirmed',
    providerCreatedAt: paidAt,
    paidAt,
    metadata: {
      telegram_id: telegramId,
      provider_payment_charge_id: providerPaymentChargeId ?? null,
      premium_plan: plan,
      duration_days: durationDays,
      is_recurring: isRecurring,
      is_first_recurring: isFirstRecurring,
      subscription_expiration_date: subscriptionExpirationDate,
    },
    eventType:
      isRecurring && !isFirstRecurring
        ? 'subscription.renewed'
        : 'payment.paid',
    eventDetails: {
      source: 'telegram_webhook',
      product: productCode,
      plan,
      amount,
      duration_days: durationDays,
      telegram_id: telegramId,
      is_recurring: isRecurring,
      is_first_recurring: isFirstRecurring,
      subscription_expiration_date: subscriptionExpirationDate,
    },
  });
}
