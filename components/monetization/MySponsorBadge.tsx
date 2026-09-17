'use client';

import { useEffect, useState } from 'react';
import { useAuthState } from '@/components/AuthStateProvider';

import UserIdentity from '@/components/identity/UserIdentity';
import {
  getSponsorMe,
  peekSponsorMe,
  type SponsorMeData,
} from '@/lib/sponsor-me-client';

export default function MySponsorBadge({ username }: { username: string }) {
  const { user } = useAuthState();
  const cached = peekSponsorMe(user?.id, 1);
  const [identity, setIdentity] = useState<
    Pick<SponsorMeData, 'sponsor' | 'role'>
  >({
    sponsor: cached?.sponsor ?? null,
    role: cached?.role ?? null,
  });

  useEffect(() => {
    let active = true;

    if (!user?.id) return;

    const nextCached = peekSponsorMe(user.id, 1);
    queueMicrotask(() => {
      if (!active) return;
      setIdentity({
        sponsor: nextCached?.sponsor ?? null,
        role: nextCached?.role ?? null,
      });
    });

    void getSponsorMe(user.id, 1)
      .then((data) => {
        if (!active) return;
        setIdentity({ sponsor: data.sponsor, role: data.role });
      })
      .catch((error) => {
        if ((error as Error & { status?: number }).status === 401) return;
        console.error('[Identity] failed to load my badge:', error);
      });

    return () => {
      active = false;
    };
  }, [user?.id]);

  return (
    <UserIdentity
      username={username}
      role={identity.role}
      sponsor={identity.sponsor}
      showLabel
    />
  );
}
