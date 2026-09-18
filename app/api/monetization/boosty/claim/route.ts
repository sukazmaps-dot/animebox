import { ApiError, adminClient, failure, readBody, response, userClient } from '@/lib/community-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function boostyUrl() {
  return process.env.NEXT_PUBLIC_BOOSTY_URL?.trim() || '';
}

function publicClaim(row: Record<string, unknown> | null) {
  if (!row) return null;
  return {
    id: String(row.id),
    boostyName: String(row.boosty_name ?? ''),
    amount: Number(row.amount ?? 0),
    currency: String(row.currency ?? 'RUB'),
    note: typeof row.note === 'string' ? row.note : null,
    status: String(row.status ?? 'pending'),
    transactionId: typeof row.transaction_id === 'string' ? row.transaction_id : null,
    createdAt: String(row.created_at ?? ''),
    resolvedAt: typeof row.resolved_at === 'string' ? row.resolved_at : null,
    adminNote: typeof row.admin_note === 'string' ? row.admin_note : null,
  };
}

export async function GET() {
  try {
    const { user } = await userClient();
    const admin = adminClient();
    const { data, error } = await admin
      .from('boosty_claim_requests')
      .select('id,boosty_name,amount,currency,note,status,transaction_id,created_at,resolved_at,admin_note')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(5);
    if (error) throw error;

    return response({
      ok: true,
      configured: Boolean(boostyUrl()),
      supportUrl: boostyUrl() || null,
      claims: (data ?? []).map((row) => publicClaim(row as unknown as Record<string, unknown>)),
    });
  } catch (error) {
    return failure(error);
  }
}

export async function POST(request: Request) {
  try {
    const { user } = await userClient();
    const body = await readBody(request);
    const url = boostyUrl();
    if (!url) throw new ApiError(503, 'Boosty пока не настроен.');

    const boostyName = typeof body.boostyName === 'string' ? body.boostyName.trim().slice(0, 80) : '';
    const amount = Number(body.amount);
    const currency = typeof body.currency === 'string' ? body.currency.trim().toUpperCase().slice(0, 12) : 'RUB';
    const note = typeof body.note === 'string' ? body.note.trim().slice(0, 500) : '';

    if (boostyName.length < 2) throw new ApiError(400, 'Укажи имя, с которым платил на Boosty.');
    if (!Number.isFinite(amount) || amount <= 0 || amount > 10_000_000) {
      throw new ApiError(400, 'Укажи корректную сумму.');
    }
    if (!/^[A-Z]{2,12}$/.test(currency)) throw new ApiError(400, 'Некорректная валюта.');

    const admin = adminClient();
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { count, error: countError } = await admin
      .from('boosty_claim_requests')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .gte('created_at', since);
    if (countError) throw countError;
    if ((count ?? 0) >= 5) throw new ApiError(429, 'Слишком много заявок за сутки. Попробуй позже.');

    const now = new Date().toISOString();
    const { error: cancelError } = await admin
      .from('boosty_claim_requests')
      .update({ status: 'cancelled', resolved_at: now })
      .eq('user_id', user.id)
      .eq('status', 'pending');
    if (cancelError) throw cancelError;

    const { data, error } = await admin
      .from('boosty_claim_requests')
      .insert({
        user_id: user.id,
        boosty_name: boostyName,
        amount,
        currency,
        note: note || null,
      })
      .select('id,boosty_name,amount,currency,note,status,transaction_id,created_at,resolved_at,admin_note')
      .single();
    if (error) throw error;

    return response({
      ok: true,
      configured: true,
      supportUrl: url,
      claim: publicClaim(data as unknown as Record<string, unknown>),
    });
  } catch (error) {
    return failure(error);
  }
}
