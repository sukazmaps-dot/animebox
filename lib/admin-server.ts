import 'server-only';

import type { User } from '@supabase/supabase-js';

import { ApiError, adminClient, userClient } from '@/lib/community-server';

export type AdminRole = 'owner' | 'admin' | 'moderator';

function idsFromEnv(name: string) {
  return new Set(
    (process.env[name] ?? '')
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean),
  );
}

export function adminRoleFor(userId: string): AdminRole | null {
  const owners = new Set([
    ...idsFromEnv('ADMIN_OWNER_IDS'),
    // Backward compatible with the monetization panel already installed.
    ...idsFromEnv('MONETIZATION_ADMIN_IDS'),
  ]);

  if (owners.has(userId)) return 'owner';
  if (idsFromEnv('ADMIN_IDS').has(userId)) return 'admin';
  if (idsFromEnv('MODERATOR_IDS').has(userId)) return 'moderator';
  return null;
}

export async function requireAdmin(
  allowed: AdminRole[] = ['owner', 'admin', 'moderator'],
): Promise<{ user: User; role: AdminRole }> {
  const { user } = await userClient();
  const role = adminRoleFor(user.id);

  if (!role || !allowed.includes(role)) {
    throw new ApiError(403, 'Нет доступа к этому разделу админ-панели.');
  }

  return { user, role };
}

export async function writeAdminAudit(input: {
  actorId: string;
  actorRole: AdminRole;
  action: string;
  targetType: string;
  targetId?: string | null;
  reason?: string | null;
  details?: Record<string, unknown>;
}) {
  const { error } = await adminClient().from('admin_audit_log').insert({
    actor_id: input.actorId,
    actor_role: input.actorRole,
    action: input.action,
    target_type: input.targetType,
    target_id: input.targetId ?? null,
    reason: input.reason?.trim() || null,
    details: input.details ?? {},
  });

  if (error) throw error;
}

export async function assertCanComment(userId: string) {
  const { data, error } = await adminClient()
    .from('admin_user_controls')
    .select('status,expires_at')
    .eq('user_id', userId)
    .maybeSingle();

  // The feature remains backward compatible until the admin migration runs.
  if (error && /admin_user_controls|relation|schema cache/i.test(error.message)) {
    return;
  }
  if (error) throw error;
  if (!data || data.status === 'active') return;

  if (data.expires_at && Date.parse(data.expires_at) <= Date.now()) {
    await adminClient()
      .from('admin_user_controls')
      .update({ status: 'active', expires_at: null, updated_at: new Date().toISOString() })
      .eq('user_id', userId);
    return;
  }

  throw new ApiError(
    403,
    data.status === 'muted'
      ? 'Возможность писать комментарии временно ограничена.'
      : 'Аккаунту запрещено публиковать комментарии.',
  );
}
