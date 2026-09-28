import type { PublicIdentityRole } from '@/lib/identity';
import type { SponsorStatus } from '@/lib/sponsor';
import type { PremiumMediaTransform } from '@/lib/premium-studio';
import type { ProfileFrameKey } from '@/lib/profile-frames';

export type CommunityComment = {
  id: string;
  user_id: string | null;
  parent_id: string | null;
  body: string;
  is_spoiler: boolean;
  depth: number;
  created_at: string;
  deleted_at: string | null;
  author?: {
    username: string | null;
    avatarUrl: string | null;
    avatarTransform: PremiumMediaTransform | null;
    ogNumber: number | null;
    sponsor: SponsorStatus | null;
    premium: boolean;
    role: PublicIdentityRole;
    profileFrameKey: ProfileFrameKey | null;
  } | null;
};

export type CommunityCommentsPage = {
  comments: CommunityComment[];
  nextCursor: string | null;
};
