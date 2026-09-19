import type { Entitlements } from '@/lib/payments/entitlements';

type PremiumSubscriptionClient = {
  id: string;
  userId: string;
  plan: 'monthly' | 'yearly' | 'manual';
  status: 'active' | 'grace_period' | 'expired' | 'cancelled' | 'refunded';
  source: string;
  transactionId: string | null;
  startsAt: string;
  endsAt: string;
  cancelledAt: string | null;
  autoRenew: boolean;
  autoRenewCancelledAt: string | null;
  telegramSubscriptionChargeId: string | null;
};

type PremiumLifecycleSource = 'telegram_stars' | 'boosty' | 'manual' | 'mixed' | 'other';

type PremiumLifecycleClient = {
  active: boolean;
  state: 'inactive' | 'active' | 'grace_period';
  source: PremiumLifecycleSource;
  sources: Exclude<PremiumLifecycleSource, 'mixed'>[];
  subscription: PremiumSubscriptionClient | null;
  subscriptions: PremiumSubscriptionClient[];
  startsAt: string | null;
  endsAt: string | null;
  graceUntil: string | null;
  autoRenew: boolean;
};

export type PremiumMe = {
  premium: boolean;
  lifecycle: PremiumLifecycleClient;
  subscription: PremiumSubscriptionClient | null;
  recurringSubscription: (PremiumSubscriptionClient & { plan: 'monthly' }) | null;
  entitlements: Entitlements;
  payments: Array<{
    id: string;
    provider: string;
    product_code: 'premium_monthly' | 'premium_yearly' | string;
    status: string;
    amount: number;
    currency: string;
    paid_at: string | null;
    refunded_at: string | null;
    created_at: string;
  }>;
};

let cached: { data: PremiumMe; expiresAt: number } | null = null;
let inflight: Promise<PremiumMe> | null = null;
const TTL_MS = 45_000;

export function peekPremiumMe() {
  return cached && cached.expiresAt > Date.now() ? cached.data : null;
}

export async function getPremiumMe(options: { force?: boolean } = {}) {
  if (!options.force) {
    const current = peekPremiumMe();
    if (current) return current;
    if (inflight) return inflight;
  }

  inflight = fetch('/api/premium/me', { cache: 'no-store' })
    .then(async (response) => {
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Не удалось загрузить Premium');
      cached = { data: payload as PremiumMe, expiresAt: Date.now() + TTL_MS };
      return payload as PremiumMe;
    })
    .finally(() => {
      inflight = null;
    });

  return inflight;
}

export function clearPremiumMeCache() {
  cached = null;
}
