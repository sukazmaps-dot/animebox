import { failure, response, userClient } from '@/lib/community-server';
import { createSupabaseAdmin } from '@/lib/supabase/admin';

const PAGE_SIZE = 30;

function missingColumn(error: { code?: string } | null | undefined) {
  return error?.code === '42703' || error?.code === 'PGRST204';
}

function missingRelation(error: { code?: string } | null | undefined) {
  return error?.code === '42P01' || error?.code === 'PGRST205';
}

export async function GET(request: Request) {
  try {
    const { user } = await userClient();
    const url = new URL(request.url);
    const page = Number(url.searchParams.get('page') ?? 1);
    if (!Number.isInteger(page) || page < 1 || page > 10000) {
      return response({ error: 'Некорректная страница.' }, 400);
    }

    const admin = createSupabaseAdmin();
    const from = (page - 1) * PAGE_SIZE;
    const to = page * PAGE_SIZE - 1;

    const baseSelect =
      'id,provider,product_code,status,amount,currency,provider_status,paid_at,refunded_at,created_at';
    const reliabilitySelect = `${baseSelect},integrity_status,integrity_note`;

    let result = await admin
      .from('payment_transactions')
      .select(reliabilitySelect, { count: 'exact' })
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .range(from, to);

    if (result.error && missingColumn(result.error)) {
      result = (await admin
        .from('payment_transactions')
        .select(baseSelect, { count: 'exact' })
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .range(from, to)) as unknown as typeof result;
    }

    if (result.error && missingRelation(result.error)) {
      const legacy = await admin
        .from('star_payments')
        .select('id,amount,status,created_at,refunded_at', { count: 'exact' })
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .range(from, to);
      if (legacy.error) throw legacy.error;

      return response({
        items: (legacy.data ?? []).map((row) => ({
          id: row.id,
          provider: 'telegram_stars',
          product_code: 'sponsor_support',
          status: row.status === 'confirmed' ? 'paid' : row.status,
          amount: row.amount,
          currency: 'XTR',
          provider_status: row.status,
          paid_at: row.created_at,
          refunded_at: row.refunded_at,
          created_at: row.created_at,
          integrity_status: row.status === 'reconciliation_error' ? 'reconciliation_error' : 'ok',
          integrity_note: null,
        })),
        page,
        hasMore: page * PAGE_SIZE < (legacy.count ?? 0),
      });
    }

    if (result.error) throw result.error;

    return response({
      items: (result.data ?? []).map((row) => ({
        ...row,
        integrity_status: 'integrity_status' in row ? row.integrity_status : 'ok',
        integrity_note: 'integrity_note' in row ? row.integrity_note : null,
      })),
      page,
      hasMore: page * PAGE_SIZE < (result.count ?? 0),
    });
  } catch (error) {
    return failure(error);
  }
}
