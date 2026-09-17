import type { Metadata } from 'next';
import Link from 'next/link';

import SponsorBadge from '@/components/monetization/SponsorBadge';
import AnimeBoxStar from '@/components/monetization/AnimeBoxStar';
import UserAvatarWithFrame from '@/components/profile/UserAvatarWithFrame';
import UserIdentity from '@/components/identity/UserIdentity';
import { adminClient } from '@/lib/community-server';
import {
  getSponsorPreferenceRows,
  sponsorPublicCosmeticsFromRow,
} from '@/lib/sponsor-benefits-server';
import { makeSponsorStatus, resolveSponsorTier, type SponsorTier } from '@/lib/sponsor';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Спонсоры AnimeBox',
  description: 'Пользователи, которые помогают развивать AnimeBox.',
  robots: { index: false, follow: true },
};

type WallEntry = {
  userId: string;
  username: string;
  avatarUrl: string;
  totalStars: number;
  showStarAmount: boolean;
  tier: SponsorTier;
};

async function loadSupporters(): Promise<WallEntry[]> {
  const admin = adminClient();
  const { data: preferenceRows, error: preferenceError } = await admin
    .from('sponsor_preferences')
    .select('user_id,show_star_amount')
    .eq('wall_visible', true)
    .limit(100);
  if (preferenceError) {
    console.error('[Supporter wall] preferences:', preferenceError);
    return [];
  }

  const ids = (preferenceRows ?? []).map((row) => row.user_id).filter(Boolean);
  if (!ids.length) return [];

  const [directoryResult, profilesResult] = await Promise.all([
    admin.from('sponsor_directory_v3').select('user_id,total_stars,sponsor_tier').in('user_id', ids),
    admin.from('profiles').select('id,username,avatar_path').in('id', ids),
  ]);
  if (directoryResult.error || profilesResult.error) {
    console.error('[Supporter wall] load:', directoryResult.error ?? profilesResult.error);
    return [];
  }

  const prefs = new Map((preferenceRows ?? []).map((row) => [row.user_id, row]));
  const profiles = new Map((profilesResult.data ?? []).map((row) => [row.id, row]));

  return (directoryResult.data ?? [])
    .flatMap((row) => {
      if (!row.user_id) return [];
      const tier = resolveSponsorTier(Number(row.total_stars ?? 0));
      const profile = profiles.get(row.user_id);
      if (!tier || !profile) return [];
      const avatarUrl = profile.avatar_path
        ? admin.storage.from('profile-media').getPublicUrl(profile.avatar_path).data.publicUrl
        : '/default-avatar.webp';
      return [{
        userId: row.user_id,
        username: profile.username?.trim() || 'Пользователь',
        avatarUrl,
        totalStars: Number(row.total_stars ?? 0),
        showStarAmount: prefs.get(row.user_id)?.show_star_amount !== false,
        tier,
      } satisfies WallEntry];
    })
    .sort((a, b) => b.totalStars - a.totalStars);
}

export default async function SupportersPage() {
  const supporters = await loadSupporters();
  const preferenceRows = await getSponsorPreferenceRows(supporters.map((item) => item.userId));

  return (
    <main className="sponsor-v3-wall-page">
      <header className="sponsor-v3-wall-head">
        <span>ANIMEBOX SUPPORTERS</span>
        <h1>Стена спонсоров</h1>
        <p>Спасибо людям, которые помогают AnimeBox расти. Здесь отображаются только пользователи, которые сами включили публикацию.</p>
        <Link href="/settings/sponsor" className="btn btn--ghost">Настроить видимость</Link>
      </header>

      {supporters.length ? (
        <div className="sponsor-v3-wall-grid">
          {supporters.map((entry, index) => {
            const cosmetics = sponsorPublicCosmeticsFromRow(preferenceRows.get(entry.userId), entry.tier);
            const sponsor = makeSponsorStatus(entry.totalStars, cosmetics);
            return (
              <Link className="sponsor-v3-wall-card" href={`/profile/${entry.userId}`} key={entry.userId}>
                <span className="sponsor-v3-wall-rank">#{index + 1}</span>
                <UserAvatarWithFrame src={entry.avatarUrl} alt={`Аватар ${entry.username}`} sponsor={sponsor} />
                <div className="sponsor-v3-wall-copy">
                  <UserIdentity username={entry.username} sponsor={sponsor} />
                  <SponsorBadge tier={entry.tier} />
                  {entry.showStarAmount ? (
                    <strong>{entry.totalStars.toLocaleString('ru-RU')} <AnimeBoxStar size={18} /></strong>
                  ) : (
                    <small>Сумма скрыта</small>
                  )}
                </div>
              </Link>
            );
          })}
        </div>
      ) : (
        <section className="sponsor-v3-wall-empty">
          <strong>Пока здесь тихо</strong>
          <p>Спонсоры могут включить отображение на этой странице в настройках оформления.</p>
        </section>
      )}
    </main>
  );
}
