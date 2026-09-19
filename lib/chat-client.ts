'use client';

import type {
  ChatAuthor,
  ChatMeState,
  ChatMessagesPage,
  ChatReaction,
  ChatReportReason,
  ChatSettingsState,
} from '@/types/chat';

async function readJson<T>(response: Response): Promise<T> {
  const data = (await response.json()) as T & { error?: string };
  if (!response.ok) throw new Error(data.error || 'Ошибка чата.');
  return data;
}

export async function getOlderChatMessages(cursor: string) {
  const response = await fetch(`/api/chat/messages?cursor=${encodeURIComponent(cursor)}`, {
    cache: 'no-store',
  });
  return readJson<ChatMessagesPage>(response);
}

export async function sendChatMessage(input: {
  body: string;
  replyTo: string | null;
  requestId: string;
}) {
  const response = await fetch('/api/chat/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
    cache: 'no-store',
  });
  return readJson<{ id: string; createdAt: string }>(response);
}

export async function deleteChatMessage(id: string) {
  const response = await fetch('/api/chat/messages', {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id }),
    cache: 'no-store',
  });
  return readJson<{ success: boolean }>(response);
}

export async function toggleChatReaction(messageId: string, reaction: ChatReaction) {
  const response = await fetch('/api/chat/reactions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messageId, reaction }),
    cache: 'no-store',
  });
  return readJson<{ active: boolean }>(response);
}

export async function fetchChatAuthors(ids: string[]) {
  const unique = [...new Set(ids.filter(Boolean))].slice(0, 40);
  if (!unique.length) return [];
  const response = await fetch(`/api/chat/authors?ids=${encodeURIComponent(unique.join(','))}`, {
    cache: 'no-store',
  });
  return readJson<{ authors: ChatAuthor[] }>(response).then((value) => value.authors);
}

export async function getChatSettings() {
  const response = await fetch('/api/chat/settings', { cache: 'no-store' });
  return readJson<ChatSettingsState>(response);
}

export async function getChatMe() {
  const response = await fetch('/api/chat/me', { cache: 'no-store' });
  return readJson<ChatMeState>(response);
}

export async function markChatSeen() {
  const response = await fetch('/api/chat/me', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'mark_seen' }),
    cache: 'no-store',
  });
  return readJson<{ ok: boolean; seenAt: string }>(response);
}

export async function reportChatMessage(input: {
  messageId: string;
  reason: ChatReportReason;
  details?: string;
}) {
  const response = await fetch('/api/chat/reports', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
    cache: 'no-store',
  });
  return readJson<{ ok: boolean }>(response);
}

export async function moderateCommunity(input: Record<string, unknown>) {
  const response = await fetch('/api/admin/community', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
    cache: 'no-store',
  });
  return readJson<{ ok: boolean }>(response);
}
