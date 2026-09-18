import { adminClient, failure, response, userClient } from '@/lib/community-server';
import {
  makeSponsorStatus,
  resolveSponsorTier,
} from '@/lib/sponsor';
import {
  getSponsorPreferences,
  sponsorBenefitsPayload,
} from '@/lib/sponsor-benefits-server';
import { getSponsorTotal } from '@/lib/sponsor-server';
import { publicIdentityRoleFor } from '@/lib/identity-server';

export async function GET(request: Request) {
  try {
    const { user } = await userClient();
    const admin = adminClient();
    const page = Math.max(
      1,
      Math.min(10000, Number(new URL(request.url).searchParams.get('page')) || 1),
    );
    if (!Number.isInteger(page)) return response({ error: 'Некорректная страница' }, 400);

    const { data: profile, error: profileError } = await admin
      .from('profiles')
      .select('telegram_id')
      .eq('id', user.id)
      .maybeSingle();
    if (profileError) throw profileError;

    let telegramId: string | null = null;
    if (profile?.telegram_id && /^\d+$/.test(String(profile.telegram_id))) {
      const { count, error } = await admin
        .from('profiles')
        .select('id', { count: 'exact', head: true })
        .eq('telegram_id', profile.telegram_id);
      if (error) throw error;
      if (count === 1) telegramId = String(profile.telegram_id);
    }

    let query = admin
      .from('star_payments')
      .select('id,amount,created_at,status,refunded_at,refund_reason', { count: 'exact' });
    query = telegramId
      ? query.or(`user_id.eq.${user.id},and(user_id.is.null,telegram_id.eq.${telegramId})`)
      : query.eq('user_id', user.id);

    const [paymentsResult, totalStars, donationsResult] = await Promise.all([
      query
        .order('created_at', { ascending: false })
        .order('id', { ascending: false })
        .range((page - 1) * 20, page * 20 - 1),
      getSponsorTotal(user.id),
      admin
        .from('payment_transactions')
        .select('id,provider,amount,currency,status,paid_at,refunded_at,created_at,metadata')
        .eq('user_id', user.id)
        .in('provider', ['donatepay', 'boosty'])
        .in('status', ['paid', 'refunded'])
        .order('created_at', { ascending: false })
        .limit(20),
    ]);

    if (paymentsResult.error) throw paymentsResult.error;
    if (donationsResult.error) throw donationsResult.error;

    const tier = resolveSponsorTier(totalStars);
    const preferences = await getSponsorPreferences(user.id, totalStars);
    const cosmetics = {
      selectedFrame: preferences.selectedFrame,
      nameStyle: preferences.nameStyle,
      profileTheme: preferences.profileTheme,
      badgeVisible: preferences.badgeVisible,
    };

    const donations = (donationsResult.data ?? []).map((item) => {
      const metadata = item.metadata && typeof item.metadata === 'object'
        ? (item.metadata as Record<string, unknown>)
        : null;
      const comment = typeof metadata?.comment === 'string'
        ? metadata.comment.replace(/\bABX-[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}\b/gi, '').trim()
        : null;

      return {
        id: item.id,
        provider: item.provider,
        amount: Number(item.amount),
        currency: item.currency,
        status: item.status,
        paid_at: item.paid_at,
        refunded_at: item.refunded_at,
        created_at: item.created_at,
        comment: comment || null,
      };
    });

    return response({
      sponsor: makeSponsorStatus(totalStars, cosmetics),
      role: publicIdentityRoleFor(user.id),
      totalStars,
      payments: paymentsResult.data ?? [],
      donations,
      page,
      hasMore: page * 20 < (paymentsResult.count ?? 0),
      telegramLinked: Boolean(telegramId),
      preferences,
      benefits: sponsorBenefitsPayload(tier),
    });
  } catch (error) {
    return failure(error);
  }
}
