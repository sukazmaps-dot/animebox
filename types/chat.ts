import type { PublicIdentityRole } from '@/lib/identity';
import type { SponsorStatus } from '@/lib/sponsor';
import type { PremiumMediaTransform } from '@/lib/premium-studio';

export const CHAT_REACTIONS = ['love', 'cry', 'fire', 'wow', 'dead', 'peak'] as const;
export type ChatReaction = (typeof CHAT_REACTIONS)[number];

export type ChatAuthor = {
  id: string;
  username: string | null;
  avatarUrl: string | null;
  avatarTransform: PremiumMediaTransform | null;
  sponsor: SponsorStatus | null;
  role: PublicIdentityRole;
  premium: boolean;
};

export type ChatMessage = {
  id: string;
  user_id: string;
  body: string;
  reply_to: string | null;
  created_at: string;
  edited_at: string | null;
  deleted_at: string | null;
  author: ChatAuthor | null;
  reactions: Record<ChatReaction, number>;
};

export type ChatMessagesPage = {
  messages: ChatMessage[];
  nextCursor: string | null;
};

export type HomeChatTeaserMessage = Pick<
  ChatMessage,
  'id' | 'body' | 'created_at' | 'deleted_at' | 'author'
>;
