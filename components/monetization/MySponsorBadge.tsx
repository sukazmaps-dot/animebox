'use client';

import { useEffect, useState } from 'react';

import UserIdentity from '@/components/identity/UserIdentity';
import type { PublicIdentityRole } from '@/lib/identity';
import type { SponsorStatus } from '@/lib/sponsor';

type IdentityState = {
  sponsor: SponsorStatus | null;
  role: PublicIdentityRole;
};

export default function MySponsorBadge({ username }: { username: string }) {
  const [identity, setIdentity] = useState<IdentityState>({ sponsor: null, role: null });

  useEffect(() => {
    const controller = new AbortController();

    fetch('/api/monetization/sponsor/me', {
      cache: 'no-store',
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) return null;
        const data = (await response.json()) as Partial<IdentityState>;
        return {
          sponsor: data.sponsor ?? null,
          role: data.role ?? null,
        } satisfies IdentityState;
      })
      .then((status) => {
        if (status) setIdentity(status);
      })
      .catch((error) => {
        if (error instanceof DOMException && error.name === 'AbortError') return;
        console.error('[Identity] failed to load my badge:', error);
      });

    return () => controller.abort();
  }, []);

  return (
    <UserIdentity
      username={username}
      role={identity.role}
      sponsor={identity.sponsor}
      showLabel
    />
  );
}
