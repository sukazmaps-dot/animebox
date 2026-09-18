import 'server-only';

const DEFAULT_BASE_URL = 'https://donatepay.ru/api/v1';

export type DonatePayTransaction = {
  id: string;
  amount: number;
  currency: string;
  donorName: string | null;
  comment: string | null;
  paymentSystem: string | null;
  commission: number | null;
  toCash: number | null;
  toPay: number | null;
  createdAt: string;
};

export class DonatePayApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'DonatePayApiError';
    this.status = status;
  }
}

export function isDonatePayConfigured() {
  return Boolean(process.env.DONATEPAY_API_TOKEN?.trim());
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asNumber(value: unknown) {
  const number = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(number) ? number : null;
}

function text(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function isSuccess(value: unknown) {
  if (typeof value === 'number') return value === 0;
  return String(value ?? '').toLowerCase() === 'success';
}

function isDonation(value: unknown) {
  if (typeof value === 'number') return value === 0;
  return String(value ?? '').toLowerCase() === 'donation';
}

function normalizeTransaction(value: unknown): DonatePayTransaction | null {
  const row = asRecord(value);
  if (!row || !isSuccess(row.status) || !isDonation(row.type)) return null;

  const id = row.id == null ? '' : String(row.id).trim();
  const amount = asNumber(row.sum);
  const currency = text(row.currency)?.toUpperCase() ?? '';
  const created = text(row.created_at);
  const createdMs = created ? Date.parse(created) : Number.NaN;

  if (!id || amount == null || amount <= 0 || !currency || !Number.isFinite(createdMs)) {
    return null;
  }

  const vars = asRecord(row.vars);

  return {
    id,
    amount,
    currency,
    donorName: text(vars?.name) ?? text(row.what),
    comment: text(vars?.comment) ?? text(row.comment),
    paymentSystem: text(vars?.payment_system),
    commission: asNumber(row.commission),
    toCash: asNumber(row.to_cash),
    toPay: asNumber(row.to_pay),
    createdAt: new Date(createdMs).toISOString(),
  };
}

export async function fetchDonatePayTransactions({
  after,
  limit = 100,
}: {
  after?: string | null;
  limit?: number;
} = {}) {
  const token = process.env.DONATEPAY_API_TOKEN?.trim();
  if (!token) throw new Error('DONATEPAY_API_TOKEN is not configured.');

  const base = (process.env.DONATEPAY_API_BASE_URL?.trim() || DEFAULT_BASE_URL).replace(/\/$/, '');
  const url = new URL(`${base}/transactions`);
  url.searchParams.set('access_token', token);
  url.searchParams.set('limit', String(Math.min(100, Math.max(1, limit))));
  url.searchParams.set('order', after ? 'ASC' : 'DESC');
  url.searchParams.set('type', 'Donation');
  url.searchParams.set('status', 'Success');
  if (after && /^\d+$/.test(after)) url.searchParams.set('after', after);

  const response = await fetch(url, {
    method: 'GET',
    headers: { Accept: 'application/json' },
    cache: 'no-store',
    signal: AbortSignal.timeout(12_000),
  });

  if (!response.ok) {
    // Do not include response/request URLs in errors: access_token is a query
    // parameter and must never leak into logs.
    throw new DonatePayApiError(
      response.status === 429
        ? 'DonatePay rate limit reached. Try again later.'
        : `DonatePay API returned HTTP ${response.status}.`,
      response.status,
    );
  }

  const payload = (await response.json()) as { data?: unknown };
  if (!Array.isArray(payload.data)) {
    throw new Error('DonatePay API returned an unexpected transactions payload.');
  }

  return payload.data
    .map(normalizeTransaction)
    .filter((item): item is DonatePayTransaction => Boolean(item));
}
