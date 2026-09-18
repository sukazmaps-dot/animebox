export type PremiumPlanId = 'monthly' | 'yearly';

export type PremiumCatalogPlan = {
  id: PremiumPlanId;
  productCode: 'premium_monthly' | 'premium_yearly';
  label: string;
  durationDays: number;
  active: boolean;
  telegramStarsAmount: number | null;
  billingMode: 'recurring' | 'prepaid';
};

export const PREMIUM_PLAN_DEFINITIONS: Record<
  PremiumPlanId,
  {
    productCode: PremiumCatalogPlan['productCode'];
    label: string;
    durationDays: number;
    billingMode: PremiumCatalogPlan['billingMode'];
  }
> = {
  monthly: {
    productCode: 'premium_monthly',
    label: '1 месяц',
    durationDays: 30,
    billingMode: 'recurring',
  },
  yearly: {
    productCode: 'premium_yearly',
    label: '12 месяцев',
    durationDays: 365,
    billingMode: 'prepaid',
  },
};

export function isPremiumPlanId(value: string): value is PremiumPlanId {
  return value === 'monthly' || value === 'yearly';
}
