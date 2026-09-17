import type { SponsorStatus, SponsorTier } from '@/lib/sponsor';

export type PublicIdentityRole = 'owner' | 'admin' | 'moderator' | null;
export type IdentityKind = 'owner' | 'admin' | 'moderator' | SponsorTier | 'none';

export function resolveIdentityKind(
  role: PublicIdentityRole,
  sponsor: SponsorStatus | null | undefined,
): IdentityKind {
  if (role === 'owner') return 'owner';
  if (role === 'admin') return 'admin';
  if (role === 'moderator') return 'moderator';
  return sponsor?.tier ?? 'none';
}
