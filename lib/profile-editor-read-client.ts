import { withLoadDeadline } from '@/lib/load-deadline';
import type { PremiumStudioSettings } from '@/lib/premium-studio';

type EditorAppearance = {
  profile?: { id: string };
  allowed?: boolean;
  settings?: PremiumStudioSettings;
  error?: string;
};
const pending = new Map<string, Promise<EditorAppearance>>();

/** Only concurrent reads for the same account are shared; permissions are not cached. */
export function readProfileEditorAppearance(userId: string): Promise<EditorAppearance> {
  const existing = pending.get(userId);
  if (existing) return existing;
  const request = withLoadDeadline(async signal => {
    const response = await fetch('/api/profile/editor', { cache: 'no-store', signal });
    const payload = await response.json() as EditorAppearance;
    if (!response.ok) throw new Error('PROFILE_EDITOR_READ_FAILED');
    if (payload.profile?.id && payload.profile.id !== userId) throw new Error('PROFILE_ACCOUNT_MISMATCH');
    return payload;
  }).finally(() => {
    if (pending.get(userId) === request) pending.delete(userId);
  });
  pending.set(userId, request);
  return request;
}
