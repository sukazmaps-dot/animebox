'use client';

import { useEffect, useMemo, useState } from 'react';
import { useAuthState } from '@/components/AuthStateProvider';

import { resolveIdentityKind, type PublicIdentityRole } from '@/lib/identity';
import {
  resolveSponsorFrame,
  type SponsorStatus,
  type SponsorTier,
} from '@/lib/sponsor';
import { getSponsorMe, peekSponsorMe } from '@/lib/sponsor-me-client';
import {
  premiumMediaStyle,
  type PremiumMediaTransform,
} from '@/lib/premium-studio';

type Props = {
  src: string;
  mobileSrc?: string | null;
  alt: string;
  role?: PublicIdentityRole;
  sponsor?: SponsorStatus | null;
  loadCurrentIdentity?: boolean;
  className?: string;
  mediaTransform?: PremiumMediaTransform | null;
};

type IdentityState = {
  role: PublicIdentityRole;
  sponsor: SponsorStatus | null;
};

const FRAME_BY_KIND: Record<'owner' | SponsorTier, string> = {
  owner: '/brand/identity/frame-owner.webp',
  patron: '/brand/identity/frame-patron.webp',
  premium: '/brand/identity/frame-premium.webp',
  supporter: '/brand/identity/frame-supporter.webp',
};

export default function UserAvatarWithFrame({
  src,
  mobileSrc = null,
  alt,
  role = null,
  sponsor = null,
  loadCurrentIdentity = false,
  className = '',
  mediaTransform = null,
}: Props) {
  const { user } = useAuthState();
  const cached = loadCurrentIdentity ? peekSponsorMe(user?.id, 1) : null;
  const [fetchedIdentity, setFetchedIdentity] = useState<IdentityState | null>(
    cached
      ? { role: cached.role ?? null, sponsor: cached.sponsor ?? null }
      : null,
  );

  useEffect(() => {
    if (!loadCurrentIdentity || !user?.id) return;

    let active = true;
    const nextCached = peekSponsorMe(user.id, 1);
    queueMicrotask(() => {
      if (!active) return;
      setFetchedIdentity(
        nextCached
          ? { role: nextCached.role ?? null, sponsor: nextCached.sponsor ?? null }
          : null,
      );
    });

    const reload = () => {
      void getSponsorMe(user.id, 1, { force: true })
        .then((data) => {
          if (!active) return;
          setFetchedIdentity({
            role: data.role ?? null,
            sponsor: data.sponsor ?? null,
          });
        })
        .catch((error) => {
          if ((error as Error & { status?: number }).status === 401) return;
          console.error('[AvatarFrame] failed to load identity:', error);
        });
    };

    void getSponsorMe(user.id, 1)
      .then((data) => {
        if (!active) return;
        setFetchedIdentity({
          role: data.role ?? null,
          sponsor: data.sponsor ?? null,
        });
      })
      .catch((error) => {
        if ((error as Error & { status?: number }).status === 401) return;
        console.error('[AvatarFrame] failed to load identity:', error);
      });

    window.addEventListener('animebox:sponsor-preferences-changed', reload);
    return () => {
      active = false;
      window.removeEventListener('animebox:sponsor-preferences-changed', reload);
    };
  }, [loadCurrentIdentity, user?.id]);

  const currentIdentity = loadCurrentIdentity
    ? fetchedIdentity ?? { role, sponsor }
    : { role, sponsor };

  const kind = useMemo(
    () => resolveIdentityKind(currentIdentity.role, currentIdentity.sponsor),
    [currentIdentity.role, currentIdentity.sponsor],
  );

  const frameKind = useMemo(() => {
    if (kind === 'owner') return 'owner' as const;
    if (kind !== 'supporter' && kind !== 'premium' && kind !== 'patron') return null;
    return resolveSponsorFrame(
      kind,
      currentIdentity.sponsor?.cosmetics?.selectedFrame,
    );
  }, [currentIdentity.sponsor?.cosmetics?.selectedFrame, kind]);

  const frameSrc = frameKind ? FRAME_BY_KIND[frameKind] : null;

  return (
    <div
      className={`profile-v2__avatar-wrap relative h-[88px] w-[88px] shrink-0 overflow-visible sm:h-[116px] sm:w-[116px] ${className}`.trim()}
      data-avatar-frame={frameKind ?? 'none'}
    >
      <div
        className={`absolute left-1/2 top-1/2 z-[1] -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-full ring-4 ring-[#091221] transition-[width,height] duration-200 ${
          frameSrc ? 'h-[85%] w-[85%]' : 'h-full w-full'
        }`}
      >
        <picture className="block h-full w-full">
          {mobileSrc && mobileSrc !== src && (
            <source
              media="(max-width: 768px), (prefers-reduced-motion: reduce)"
              srcSet={mobileSrc}
            />
          )}
          <img
            src={src}
            alt={alt}
            className="h-full w-full select-none object-cover"
            style={premiumMediaStyle(mediaTransform)}
            draggable={false}
          />
        </picture>
      </div>

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
