import 'server-only';

import { createSupabaseAdmin } from '@/lib/supabase/admin';

export type TelegramAnimeSubscription = {
  animeId: number;
  animeTitle: string;
  animeSlug: string;
  minEpisode: number;
};

export type TelegramUserSubscriptions = {
  accountLinked: boolean;
  systemNotifications: boolean;
  anime: TelegramAnimeSubscription[];
};

/**
 * Reads the same Supabase tables that the AnimeBox notification UI already
 * uses. If you want a pure mock during local development, return a hardcoded
 * TelegramUserSubscriptions object from this function instead.
 */
export async function getUserSubscriptions(
  telegramId: number,
): Promise<TelegramUserSubscriptions> {
  const admin = createSupabaseAdmin();

  const { data: profile, error: profileError } = await admin
    .from('profiles')
    .select('id')
    .eq('telegram_id', telegramId)
    .maybeSingle();

  if (profileError) throw profileError;

  if (!profile?.id) {
    return {
      accountLinked: false,
      systemNotifications: false,
      anime: [],
    };
  }

  const [settingsResult, subscriptionsResult] =
    await Promise.all([
      admin
        .from('notification_settings')
        .select('telegram_enabled, telegram_verified_at')
        .eq('user_id', profile.id)
        .maybeSingle(),
      admin
        .from('anime_notification_subscriptions')
        .select('anime_id, anime_title, anime_slug, min_episode, updated_at')
        .eq('user_id', profile.id)
        .eq('enabled', true)
        .order('updated_at', { ascending: false }),
    ]);

  if (settingsResult.error) throw settingsResult.error;
  if (subscriptionsResult.error) {
    throw subscriptionsResult.error;
  }

  return {
    accountLinked: true,
    systemNotifications: Boolean(
      settingsResult.data?.telegram_enabled &&
        settingsResult.data?.telegram_verified_at,
    ),
    anime: (subscriptionsResult.data ?? []).map((item) => ({
      animeId: Number(item.anime_id),
      animeTitle: String(item.anime_title || 'Аниме'),
      animeSlug: String(item.anime_slug || item.anime_id),
      minEpisode: Math.max(1, Number(item.min_episode) || 1),
    })),
  };
}
