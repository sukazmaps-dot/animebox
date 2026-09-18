export type PaymentStatus =
  | 'pending'
  | 'paid'
  | 'failed'
  | 'cancelled'
  | 'partially_refunded'
  | 'refunded';

export type PaymentProvider = 'telegram_stars' | 'donatepay' | 'admin' | (string & {});

export type RecordPaymentTransactionInput = {
  userId?: string | null;
  provider: PaymentProvider;
  productCode: string;
  externalId: string;
  externalUserId?: string | null;
  status: PaymentStatus;
  amount: number;
  currency: string;
  providerStatus?: string | null;
  providerCreatedAt?: string | null;
  paidAt?: string | null;
  refundedAt?: string | null;
  metadata?: Record<string, unknown>;
  eventType?: string;
  eventDetails?: Record<string, unknown>;
};
