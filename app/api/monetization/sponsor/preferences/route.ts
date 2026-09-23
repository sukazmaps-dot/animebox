import {
  ApiError,
  adminClient,
  failure,
  readBody,
  response,
  userClient,
} from '@/lib/community-server';
import {
  allowedSponsorFrames,
  allowedSponsorNameStyles,
  allowedSponsorThemes,
  normalizeSponsorPreferences,
  resolveSponsorTier,
  type SponsorFrame,
  type SponsorNameStyle,
  type SponsorProfileTheme,
} from '@/lib/sponsor';
import {
  getSponsorPreferences,
  sponsorBenefitsPayload,
} from '@/lib/sponsor-benefits-server';
import { getSponsorTotal } from '@/lib/sponsor-server';

import { enforceIpAndUserRateLimit } from '@/lib/api-rate-limit';

function stringField(value: unknown, max = 40) {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

export async function GET() {
  try {
    const { user } = await userClient();
    const totalStars = await getSponsorTotal(user.id);
    const tier = resolveSponsorTier(totalStars);
    const preferences = await getSponsorPreferences(user.id, totalStars);

    return response({
      totalStars,
      tier,
      preferences,
      benefits: sponsorBenefitsPayload(tier),
    });
  } catch (error) {
    return failure(error);
  }
}

export async function PUT(request: Request) {
  try {
    const { user } = await userClient();
    const limited = await enforceIpAndUserRateLimit(request, user.id, {
      ip: { scope: 'sponsor_prefs_write_ip', limit: 90, windowSeconds: 60 },
      user: { scope: 'sponsor_prefs_write_user', limit: 60, windowSeconds: 60 },
    });
    if (limited) return limited;
    const body = await readBody(request);
    const totalStars = await getSponsorTotal(user.id);
    const tier = resolveSponsorTier(totalStars);

    const selectedFrame = stringField(body.selectedFrame) as SponsorFrame;
    const nameStyle = stringField(body.nameStyle) as SponsorNameStyle;
    const profileTheme = stringField(body.profileTheme) as SponsorProfileTheme;

    if (!allowedSponsorFrames(tier).includes(selectedFrame)) {
      throw new ApiError(403, 'Эта рамка пока не открыта для твоего уровня.');
    }
    if (!allowedSponsorNameStyles(tier).includes(nameStyle)) {
      throw new ApiError(403, 'Этот стиль ника пока не открыт для твоего уровня.');
    }
    if (!allowedSponsorThemes(tier).includes(profileTheme)) {
      throw new ApiError(403, 'Эта тема профиля пока не открыта для твоего уровня.');
    }

    const preferences = normalizeSponsorPreferences(
      {
        selectedFrame,
        nameStyle,
        profileTheme,
        badgeVisible: body.badgeVisible !== false,
        wallVisible: body.wallVisible === true,
        showStarAmount: body.showStarAmount !== false,
      },
      tier,
    );

    const admin = adminClient();
    const { error } = await admin.from('sponsor_preferences').upsert(
      {
        user_id: user.id,
        selected_frame: preferences.selectedFrame,
        name_style: preferences.nameStyle,
        profile_theme: preferences.profileTheme,
        badge_visible: preferences.badgeVisible,
        wall_visible: preferences.wallVisible,
        show_star_amount: preferences.showStarAmount,
      },
      { onConflict: 'user_id' },
    );
    if (error) throw error;

    return response({
      ok: true,
      totalStars,
      tier,
      preferences,
      benefits: sponsorBenefitsPayload(tier),
    });
  } catch (error) {
    return failure(error);
  }
}
