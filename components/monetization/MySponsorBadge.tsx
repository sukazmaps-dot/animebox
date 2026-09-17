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

    const apply = (data: SponsorMeData | null) => {
      if (!active || !data) return;
      setIdentity({ sponsor: data.sponsor, role: data.role });
    };

    apply(peekSponsorMe(user.id, 1));

    const load = (force = false) => {
      void getSponsorMe(user.id, 1, { force })
        .then(apply)
        .catch((error) => {
          if ((error as Error & { status?: number }).status === 401) return;
          console.error('[Identity] failed to load my badge:', error);
        });
    };

    load();
    const refresh = () => load(true);
    window.addEventListener('animebox:sponsor-preferences-changed', refresh);

    return () => {
      active = false;
      window.removeEventListener('animebox:sponsor-preferences-changed', refresh);
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
