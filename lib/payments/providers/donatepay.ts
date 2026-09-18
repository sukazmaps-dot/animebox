import 'server-only';

const DEFAULT_BASE_URL = 'https://donatepay.ru/api/v1';
const DEFAULT_CURRENCY = 'RUB';

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
  const number = typeof value === 'number' ? value : Number(String(value ?? '').replace(',', '.'));
  return Number.isFinite(number) ? number : null;
}

function text(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function lower(value: unknown) {
  return String(value ?? '').trim().toLowerCase();
}

function isSuccess(value: unknown) {
  if (value == null || value === '') return true;
  if (typeof value === 'number') return value === 0;
  return lower(value) === 'success';
}

function isDonation(value: unknown) {
  if (value == null || value === '') return true;
  if (typeof value === 'number') return value === 0;
  return lower(value) === 'donation';
}

function parseDonatePayDate(value: unknown): string | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    const ms = value < 10_000_000_000 ? value * 1000 : value;
    const date = new Date(ms);
    return Number.isFinite(date.getTime()) ? date.toISOString() : null;
  }

  if (typeof value === 'string') {
    const raw = value.trim();
    if (!raw) return null;

    const numeric = Number(raw);
    if (/^\d+(?:\.\d+)?$/.test(raw) && Number.isFinite(numeric)) {
      return parseDonatePayDate(numeric);
    }

    const ms = Date.parse(raw);
    return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
  }

  const record = asRecord(value);
  if (!record) return null;

  for (const key of ['date', 'created_at', 'createdAt', 'timestamp', 'time']) {
    const parsed = parseDonatePayDate(record[key]);
    if (parsed) return parsed;
  }

  return null;
}

function extractTransactionRows(payload: unknown): unknown[] {
  if (Array.isArray(payload)) return payload;

  const root = asRecord(payload);
  if (!root) return [];

  const rootStatus = lower(root.status);
  if (rootStatus && rootStatus !== 'success') {
    const message = text(root.message) || text(root.error) || 'DonatePay API returned an error payload.';
    throw new Error(`DonatePay API: ${message}`);
  }

  for (const key of ['data', 'transactions', 'items', 'rows', 'result']) {
    const value = root[key];
    if (Array.isArray(value)) return value;

    const nested = asRecord(value);
    if (!nested) continue;

    for (const nestedKey of ['data', 'transactions', 'items', 'rows', 'result']) {
      const rows = nested[nestedKey];
      if (Array.isArray(rows)) return rows;
    }

    // Some DonatePay-compatible responses can return a single transaction object.
    if (nested.id != null && (nested.sum != null || nested.amount != null)) {
      return [nested];
    }
  }

  if (root.id != null && (root.sum != null || root.amount != null)) {
    return [root];
  }

  const count = asNumber(root.count);
  if (count === 0) return [];

  return [];
}

function normalizeTransaction(value: unknown): DonatePayTransaction | null {
  const row = asRecord(value);
  if (!row || !isSuccess(row.status) || !isDonation(row.type)) return null;

  const id = row.id == null ? '' : String(row.id).trim();
  const vars = asRecord(row.vars);
  const amount = asNumber(row.sum ?? row.amount ?? vars?.sum ?? vars?.amount);
  const currency = (
    text(row.currency) ??
    text(vars?.currency) ??
    process.env.DONATEPAY_DEFAULT_CURRENCY?.trim() ??
    DEFAULT_CURRENCY
  ).toUpperCase();
  const createdAt =
    parseDonatePayDate(row.created_at) ??
    parseDonatePayDate(row.createdAt) ??
    parseDonatePayDate(vars?.created_at) ??
    parseDonatePayDate(vars?.date);

  if (!id || amount == null || amount <= 0 || !currency || !createdAt) {
    return null;
  }

  return {
    id,
    amount,
    currency,
    donorName: text(vars?.name) ?? text(vars?.username) ?? text(row.what) ?? text(row.name),
    comment:
      text(vars?.comment) ??
      text(vars?.message) ??
      text(row.comment) ??
      text(row.message),
    paymentSystem: text(vars?.payment_system) ?? text(row.payment_system),
    commission: asNumber(row.commission),
    toCash: asNumber(row.to_cash),
    toPay: asNumber(row.to_pay),
    createdAt,
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
  // DonatePay documents these values in lowercase. Uppercase values can return
  // a successful HTTP response with a non-transaction payload.
  url.searchParams.set('type', 'donation');
  url.searchParams.set('status', 'success');
  if (after && /^\d+$/.test(after)) url.searchParams.set('after', after);

  const response = await fetch(url, {
    method: 'GET',
    headers: { Accept: 'application/json' },
    cache: 'no-store',
    signal: AbortSignal.timeout(12_000),
  });

  if (!response.ok) {
    // Never include response/request URLs in errors: access_token is a query
    // parameter and must not leak into logs.
    throw new DonatePayApiError(
      response.status === 429
        ? 'DonatePay rate limit reached. Try again later.'
        : `DonatePay API returned HTTP ${response.status}.`,
      response.status,
    );
  }

  const payload = (await response.json()) as unknown;
  const rows = extractTransactionRows(payload);

  const transactions = rows
    .map(normalizeTransaction)
    .filter((item): item is DonatePayTransaction => Boolean(item));

  if (rows.length > 0 && transactions.length === 0) {
    throw new Error('DonatePay returned transactions, but AnimeBox could not normalize them.');
  }

  return transactions;
}
