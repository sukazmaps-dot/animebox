import 'server-only';

import { adminRoleFor } from '@/lib/admin-server';
import type { PublicIdentityRole } from '@/lib/identity';

export function publicIdentityRoleFor(userId: string): PublicIdentityRole {
  const role = adminRoleFor(userId);
  if (role === 'owner' || role === 'admin' || role === 'moderator') return role;
  return null;
}

export function getPublicIdentityRoles(userIds: string[]) {
  const result = new Map<string, PublicIdentityRole>();
  for (const id of new Set(userIds.filter(Boolean))) {
    result.set(id, publicIdentityRoleFor(id));
  }
  return result;
}
