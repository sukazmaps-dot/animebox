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

    const [{ data: payments, error, count }, totalStars] = await Promise.all([
      query
        .order('created_at', { ascending: false })
        .order('id', { ascending: false })
        .range((page - 1) * 20, page * 20 - 1),
      getSponsorTotal(user.id),
    ]);
    if (error) throw error;

    const tier = resolveSponsorTier(totalStars);
    const preferences = await getSponsorPreferences(user.id, totalStars);
    const cosmetics = {
      selectedFrame: preferences.selectedFrame,
      nameStyle: preferences.nameStyle,
      profileTheme: preferences.profileTheme,
      badgeVisible: preferences.badgeVisible,
    };

    return response({
      sponsor: makeSponsorStatus(totalStars, cosmetics),
      role: publicIdentityRoleFor(user.id),
      totalStars,
      payments: payments ?? [],
      page,
      hasMore: page * 20 < (count ?? 0),
      telegramLinked: Boolean(telegramId),
      preferences,
      benefits: sponsorBenefitsPayload(tier),
    });
  } catch (error) {
    return failure(error);
  }
}
