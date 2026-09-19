import type { PublicIdentityRole } from '@/lib/identity';
import type { SponsorStatus } from '@/lib/sponsor';
import type { PremiumMediaTransform } from '@/lib/premium-studio';

export const CHAT_REACTIONS = ['love', 'cry', 'fire', 'wow', 'dead', 'peak'] as const;
export type ChatReaction = (typeof CHAT_REACTIONS)[number];
export type ChatMessageKind = 'user' | 'system';
export type ChatReportReason = 'spam' | 'abuse' | 'nsfw' | 'spoiler' | 'scam' | 'other';

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
  kind?: ChatMessageKind;
  author: ChatAuthor | null;
  reactions: Record<ChatReaction, number>;
};

export type ChatMessagesPage = {
  messages: ChatMessage[];
  nextCursor: string | null;
};

export type ChatPinnedMessage = {
  id: string;
  body: string;
  userId: string;
  username: string;
  createdAt: string;
};

export type ChatSettingsState = {
  slowModeSeconds: number;
  pinnedMessage: ChatPinnedMessage | null;
};

export type ChatNotificationItem = {
  id: string;
  type: 'mention' | 'reply';
  messageId: string;
  createdAt: string;
  actorId: string;
  actorUsername: string;
  body: string;
};

export type ChatMeState = {
  role: PublicIdentityRole;
  restriction: {
    status: 'active' | 'muted' | 'banned';
    expiresAt: string | null;
  };
  slowModeSeconds: number;
  lastSeenAt: string | null;
  unreadMessages: number;
  unreadNotifications: number;
  notifications: ChatNotificationItem[];
};

export type HomeChatTeaserMessage = Pick<
  ChatMessage,
  'id' | 'body' | 'created_at' | 'deleted_at' | 'author'
>;
