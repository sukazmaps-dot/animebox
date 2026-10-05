import { Suspense } from 'react';
import ChatLoadingShell from '@/components/chat/ChatLoadingShell';
import type { Metadata } from 'next';

import GlobalChatV11Client from '@/components/chat/GlobalChatV11Client';
import { getChatMessagesPage } from '@/lib/chat-server';
import type { ChatMessagesPage } from '@/types/chat';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Общий чат',
  description: 'Общий чат сообщества AnimeBox.',
  robots: {
    index: false,
    follow: true,
  },
};

async function ChatHistory() {
  let initialPage: ChatMessagesPage = { messages: [], nextCursor: null };

  try {
    initialPage = await getChatMessagesPage({ limit: 24 });
  } catch (error) {
    console.error('[Chat page] initial history unavailable', error);
  }

  return <GlobalChatV11Client initialPage={initialPage} />;
}

export default function ChatPage() {
  return <Suspense fallback={<ChatLoadingShell />}><ChatHistory /></Suspense>;
}
