'use client';

import { useEffect, useState } from 'react';

import { useAuthState } from '@/components/AuthStateProvider';
import ProfileAnimeIdentity from '@/components/profile/ProfileAnimeIdentity';
import type { CommunityProfile } from '@/lib/community-client';
import {
  getCommunityProfileCached,
  invalidateCommunityProfile,
  peekCommunityProfile,
} from '@/lib/community-profile-cache';

export default function ProfileAnimeIdentityLoader({
  premium = false,
  foundingNumber = null,
}: {
  premium?: boolean;
  foundingNumber?: number | null;
}) {
  const { user } = useAuthState();
  const [data, setData] = useState<CommunityProfile | null>(() =>
    peekCommunityProfile(user?.id),
  );

  useEffect(() => {
    if (!user?.id) {
      setData(null);
      return;
    }

    let active = true;
    const userId = user.id;

    const load = (force = false) => {
      if (force) invalidateCommunityProfile(userId);
      void getCommunityProfileCached(userId, force)
        .then((profile) => {
          if (active) setData(profile);
        })
        .catch(() => {
          // CommunityProfile renders the full error state. Identity stays optional.
        });
    };

    load();

    const refresh = () => load(true);
    window.addEventListener('library-updated', refresh);
    window.addEventListener('animebox:progression-updated', refresh);

    return () => {
      active = false;
      window.removeEventListener('library-updated', refresh);
      window.removeEventListener('animebox:progression-updated', refresh);
    };
  }, [user?.id]);

  if (!data) return null;

  const { stats, progression } = data;

  return (
    <ProfileAnimeIdentity
      premium={premium}
      foundingNumber={foundingNumber}
      level={progression.level}
      rank={progression.rank}
      stats={{
        episodes: stats.episodes,
        titles: stats.titles,
        activeMs: stats.active_ms,
        comments: stats.comments,
        watching: stats.watching,
        planned: stats.planned,
        completed: stats.completed,
        dropped: stats.dropped,
        shonenTitles: stats.shonen_titles,
        romanceTitles: stats.romance_titles,
        actionTitles: stats.action_titles,
        fantasyTitles: stats.fantasy_titles,
        comedyTitles: stats.comedy_titles,
        longestStreak: stats.longest_streak,
      }}
    />
  );
}
