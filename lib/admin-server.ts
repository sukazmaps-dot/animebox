import 'server-only';

import type { User } from '@supabase/supabase-js';

import { consumeIpAndUserRateLimit } from '@/lib/api-rate-limit';
import { ApiError, adminClient, userClient } from '@/lib/community-server';

export type AdminRole = 'owner' | 'admin' | 'moderator';

const ROLE_RANK: Record<AdminRole, number> = {
  moderator: 1,
  admin: 2,
  owner: 3,
};

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
    // Legacy fallback. Keep it for now so existing production access is not
    // accidentally revoked; new owner configuration should use ADMIN_OWNER_IDS.
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

export async function requireAdminMutation(
  request: Request,
  allowed: AdminRole[] = ['owner', 'admin', 'moderator'],
): Promise<{ user: User; role: AdminRole }> {
  const auth = await requireAdmin(allowed);

  try {
    const permitted = await consumeIpAndUserRateLimit(request, auth.user.id, {
      ip: {
        scope: 'admin_mutation_ip',
        limit: 60,
        windowSeconds: 60,
      },
      user: {
        scope: 'admin_mutation_user',
        limit: 30,
        windowSeconds: 60,
      },
    });

    if (!permitted) {
      throw new ApiError(
        429,
        'Слишком много действий в админ-панели. Подожди минуту.',
      );
    }
  } catch (error) {
    if (error instanceof ApiError) throw error;

    console.error('[Admin security] mutation limiter unavailable', error);
    throw new ApiError(
      503,
      'Защита админ-панели временно недоступна. Попробуй через минуту.',
    );
  }

  return auth;
}

export function assertCanModerateTarget(
  actorId: string,
  actorRole: AdminRole,
  targetId: string | null | undefined,
) {
  if (!targetId || targetId === actorId) return;

  const targetRole = adminRoleFor(targetId);
  if (!targetRole) return;

  if (ROLE_RANK[targetRole] >= ROLE_RANK[actorRole]) {
    throw new ApiError(
      403,
      'Нельзя применить это действие к равной или более высокой роли.',
    );
  }
}

export async function writeAdminAudit(input: {
  actorId: string;
  actorRole: AdminRole;
  action: string;
  targetType: string;
  targetId?: string | null;
  reason?: string | null;
  details?: Record<string, unknown>;
  request?: Request;
}) {
  const requestId = input.request?.headers.get('x-animebox-request-id')?.trim();

  const { error } = await adminClient().from('admin_audit_log').insert({
    actor_id: input.actorId,
    actor_role: input.actorRole,
    action: input.action,
    target_type: input.targetType,
    target_id: input.targetId ?? null,
    reason: input.reason?.trim() || null,
    details: {
      ...(input.details ?? {}),
      ...(requestId ? { request_id: requestId } : {}),
    },
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
