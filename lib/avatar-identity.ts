import type { PublicIdentityRole } from '@/lib/identity';
import { resolveIdentityKind } from '@/lib/identity';
import { isProfileFrameKey, type ProfileFrameKey } from '@/lib/profile-frames';
import { isLevelFrameKey, levelFrameAvatarScale } from '@/lib/progression';
import {
  resolveSponsorFrame,
  type SponsorStatus,
  type SponsorTier,
} from '@/lib/sponsor';

export type IdentityFrameKind = 'owner' | SponsorTier;

const FRAME_BY_KIND: Record<IdentityFrameKind, string> = {
  owner: '/brand/identity/frame-owner.webp',
  patron: '/brand/identity/frame-patron.webp',
  premium: '/brand/identity/frame-premium.webp',
  supporter: '/brand/identity/frame-supporter.webp',
};

export type AvatarIdentityVisuals = {
  identityKind: ReturnType<typeof resolveIdentityKind>;
  profileFrameKey: ProfileFrameKey | null;
  identityFrameKind: IdentityFrameKind | null;
  identityFrameSrc: string | null;
  avatarScale: number;
  avatarInsetPct: number;
  identityFrameScale: number;
  identityFrameTranslateY: number;
  dataFrameKey: string;
};

const IDENTITY_FRAME_GEOMETRY: Record<
  IdentityFrameKind,
  {
    avatarScale: number;
    frameScale: number;
    translateY: number;
  }
> = {
  owner: {
    avatarScale: 0.91,
    frameScale: 1.08,
    translateY: 0,
  },
  supporter: {
    avatarScale: 0.92,
    frameScale: 1.1,
    translateY: 0,
  },
  premium: {
    avatarScale: 0.92,
    frameScale: 1.1,
    translateY: 0,
  },
  patron: {
    avatarScale: 0.91,
    frameScale: 1.1,
    translateY: 0,
  },
};

export function resolveAvatarIdentityVisuals({
  role,
  sponsor,
  profileFrameKey,
}: {
  role?: PublicIdentityRole;
  sponsor?: SponsorStatus | null;
  profileFrameKey?: string | null;
}): AvatarIdentityVisuals {
  const identityKind = resolveIdentityKind(role ?? null, sponsor ?? null);
  const resolvedProfileFrameKey = isProfileFrameKey(profileFrameKey)
    ? profileFrameKey
    : null;

  let identityFrameKind: IdentityFrameKind | null = null;

  // Explicit profile cosmetics (Level or League) own the single frame slot.
  // When no cosmetic is equipped, Owner wins over sponsor-tier identity frames.
  if (!resolvedProfileFrameKey) {
    if (identityKind === 'owner') {
      identityFrameKind = 'owner';
    } else if (
      identityKind === 'supporter' ||
      identityKind === 'premium' ||
      identityKind === 'patron'
    ) {
      identityFrameKind = resolveSponsorFrame(
        identityKind,
        sponsor?.cosmetics?.selectedFrame,
      );
    }
  }

  const identityFrameSrc = identityFrameKind
    ? FRAME_BY_KIND[identityFrameKind]
    : null;

  const milestoneScale =
    resolvedProfileFrameKey && isLevelFrameKey(resolvedProfileFrameKey)
      ? levelFrameAvatarScale(resolvedProfileFrameKey)
      : null;

  const identityGeometry = identityFrameKind
    ? IDENTITY_FRAME_GEOMETRY[identityFrameKind]
    : null;

  const avatarScale =
    milestoneScale ??
    (resolvedProfileFrameKey
      ? 0.82
      : identityGeometry?.avatarScale ?? 1);

  return {
    identityKind,
    profileFrameKey: resolvedProfileFrameKey,
    identityFrameKind,
    identityFrameSrc,
    avatarScale,
    avatarInsetPct: Math.max(0, (1 - avatarScale) * 50),
    identityFrameScale: identityGeometry?.frameScale ?? 1,
    identityFrameTranslateY: identityGeometry?.translateY ?? 0,
    dataFrameKey:
      resolvedProfileFrameKey ??
      identityFrameKind ??
      'none',
  };
}
