'use client';

import { useEffect, useMemo, useState } from 'react';

import { resolveIdentityKind, type PublicIdentityRole } from '@/lib/identity';
import type { SponsorStatus } from '@/lib/sponsor';

type Props = {
  src: string;
  alt: string;
  role?: PublicIdentityRole;
  sponsor?: SponsorStatus | null;
  loadCurrentIdentity?: boolean;
  className?: string;
};

type IdentityState = {
  role: PublicIdentityRole;
  sponsor: SponsorStatus | null;
};

const FRAME_BY_KIND = {
  owner: '/brand/identity/frame-owner.webp',
  patron: '/brand/identity/frame-patron.webp',
  premium: '/brand/identity/frame-premium.webp',
  supporter: '/brand/identity/frame-supporter.webp',
} as const;

export default function UserAvatarWithFrame({
  src,
  alt,
  role = null,
  sponsor = null,
  loadCurrentIdentity = false,
  className = '',
}: Props) {
  const [fetchedIdentity, setFetchedIdentity] = useState<IdentityState | null>(null);

  useEffect(() => {
    if (!loadCurrentIdentity) return;

    const controller = new AbortController();

    fetch('/api/monetization/sponsor/me', {
      cache: 'no-store',
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) return null;
        const data = (await response.json()) as Partial<IdentityState>;
        return {
          role: data.role ?? null,
          sponsor: data.sponsor ?? null,
        } satisfies IdentityState;
      })
      .then((identity) => {
        if (identity) setFetchedIdentity(identity);
      })
      .catch((error) => {
        if (error instanceof DOMException && error.name === 'AbortError') return;
        console.error('[AvatarFrame] failed to load identity:', error);
      });

    return () => controller.abort();
  }, [loadCurrentIdentity]);

  const currentIdentity = loadCurrentIdentity
    ? fetchedIdentity ?? { role, sponsor }
    : { role, sponsor };

  const kind = useMemo(
    () => resolveIdentityKind(currentIdentity.role, currentIdentity.sponsor),
    [currentIdentity.role, currentIdentity.sponsor],
  );

  const frameSrc =
    kind === 'owner' ||
    kind === 'patron' ||
    kind === 'premium' ||
    kind === 'supporter'
      ? FRAME_BY_KIND[kind]
      : null;

  return (
    <div
      className={`profile-v2__avatar-wrap relative h-[88px] w-[88px] shrink-0 overflow-visible sm:h-[116px] sm:w-[116px] ${className}`.trim()}
      data-avatar-frame={frameSrc ? kind : 'none'}
    >
      <img
        src={src}
        alt={alt}
        className={`absolute left-1/2 top-1/2 z-[1] -translate-x-1/2 -translate-y-1/2 rounded-full object-cover ring-4 ring-[#091221] transition-[width,height] duration-200 ${
          frameSrc ? 'h-[85%] w-[85%]' : 'h-full w-full'
        }`}
      />

      {frameSrc && (
        <img
          src={frameSrc}
          alt=""
          aria-hidden="true"
          className="user-avatar-frame__overlay pointer-events-none absolute inset-0 z-10 h-full w-full select-none object-contain"
          draggable={false}
        />
      )}
    </div>
  );
}
