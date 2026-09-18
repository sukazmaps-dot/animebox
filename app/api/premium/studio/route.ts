import {
  ApiError,
  adminClient,
  failure,
  readBody,
  response,
  userClient,
} from '@/lib/community-server';
import { getEffectiveUserEntitlements } from '@/lib/entitlements-server';
import {
  isPremiumProfileTheme,
  type PremiumProfileTheme,
} from '@/lib/premium-studio';

export const dynamic = 'force-dynamic';

async function requireProfileStudio(userId: string) {
  const entitlements = await getEffectiveUserEntitlements(userId);

  if (!entitlements.profileStudio || !entitlements.premiumThemes) {
    throw new ApiError(403, 'Profile Studio доступна только с AnimeBox Premium.');
  }

  return entitlements;
}

export async function GET() {
  try {
    const { user } = await userClient();
    const entitlements = await getEffectiveUserEntitlements(user.id);
    const admin = adminClient();

    const { data, error } = await admin
      .from('premium_profile_settings')
      .select('theme')
      .eq('user_id', user.id)
      .maybeSingle();

    if (error) throw error;

    return response({
      allowed: Boolean(entitlements.profileStudio && entitlements.premiumThemes),
      theme: (data?.theme ?? 'default') as PremiumProfileTheme,
      entitlements,
    });
  } catch (error) {
    return failure(error);
  }
}

export async function POST(request: Request) {
  try {
    const { user } = await userClient();
    await requireProfileStudio(user.id);

    const body = await readBody(request);
    const theme = typeof body.theme === 'string' ? body.theme.trim() : '';

    if (!isPremiumProfileTheme(theme)) {
      throw new ApiError(400, 'Неизвестная тема Profile Studio.');
    }

    const { error } = await adminClient()
      .from('premium_profile_settings')
      .upsert(
        {
          user_id: user.id,
          theme,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id' },
      );

    if (error) throw error;

    return response({ ok: true, theme });
  } catch (error) {
    return failure(error);
  }
}
