'use client';

import { useEffect, useMemo, useState } from 'react';
import { useAuthState } from '@/components/AuthStateProvider';
import ProfileFrameOverlay from '@/components/profile/ProfileFrameOverlay';
import type { PublicIdentityRole } from '@/lib/identity';
import type { SponsorStatus } from '@/lib/sponsor';
import { getSponsorMe, peekSponsorMe } from '@/lib/sponsor-me-client';
import { resolveAvatarIdentityVisuals } from '@/lib/avatar-identity';
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
  seasonFrameKey?: string | null;
  profileFrameKey?: string | null;
  premiumFrameMotion?: boolean;
  preferStatic?: boolean;
};

type IdentityState = {
  role: PublicIdentityRole;
  sponsor: SponsorStatus | null;
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
  seasonFrameKey = null,
  profileFrameKey = null,
  premiumFrameMotion = false,
  preferStatic = false,
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

  const activeProfileFrameKey = profileFrameKey ?? seasonFrameKey;
  const displayedSrc = preferStatic && mobileSrc ? mobileSrc : src;
  const visuals = useMemo(
    () =>
      resolveAvatarIdentityVisuals({
        role: currentIdentity.role,
        sponsor: currentIdentity.sponsor,
        profileFrameKey: activeProfileFrameKey,
      }),
    [
      activeProfileFrameKey,
      currentIdentity.role,
      currentIdentity.sponsor,
    ],
  );

  return (
    <div
      className={`profile-v2__avatar-wrap relative isolate h-[108px] w-[108px] shrink-0 overflow-visible sm:h-[152px] sm:w-[152px] ${className}`.trim()}
      data-avatar-frame={visuals.dataFrameKey}
    >
      <div
        className="absolute z-10 overflow-hidden rounded-full ring-4 ring-[#091221] transition-[inset] duration-200"
        style={{ inset: `${visuals.avatarInsetPct}%` }}
      >
        <picture className="absolute inset-0 block h-full w-full">
          {mobileSrc && mobileSrc !== displayedSrc && (
            <source
              media="(prefers-reduced-motion: reduce)"
              srcSet={mobileSrc}
            />
          )}
          <img
            src={displayedSrc}
            alt={alt}
            className="block h-full w-full max-w-none select-none object-cover"
            style={premiumMediaStyle(mediaTransform)}
            draggable={false}
          />
        </picture>
      </div>

      {visuals.identityFrameSrc && (
        <img
          src={visuals.identityFrameSrc}
          alt=""
          aria-hidden="true"
          className="user-avatar-frame__overlay pointer-events-none absolute inset-0 z-20 block h-full w-full max-w-none select-none object-contain"
          draggable={false}
        />
      )}

      <ProfileFrameOverlay
        frameKey={visuals.profileFrameKey}
        premium={premiumFrameMotion}
      />
    </div>
  );
}
