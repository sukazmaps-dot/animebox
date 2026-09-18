import 'server-only';

import { createSupabaseAdmin } from '@/lib/supabase/admin';
import { PREMIUM_ENTITLEMENTS } from '@/lib/premium-server';

export type BoostyBridgeState =
  | 'not_configured'
  | 'telegram_not_linked'
  | 'not_member'
  | 'active'
  | 'grace_period'
  | 'error';

export type BoostyBridgeStatus = {
  configured: boolean;
  boostyUrl: string | null;
  telegramLinked: boolean;
  telegramId: string | null;
  state: BoostyBridgeState;
  memberStatus: string | null;
  subscriptionId: string | null;
  lastVerifiedAt: string | null;
  lastSuccessAt: string | null;
  graceUntil: string | null;
  lastError: string | null;
};

type TelegramMemberPayload = {
  ok?: boolean;
  result?: {
    status?: string;
    is_member?: boolean;
  };
  description?: string;
  error_code?: number;
};

function boostyUrl() {
  return process.env.NEXT_PUBLIC_BOOSTY_URL?.trim() || null;
}

function graceHours() {
  const raw = Number(process.env.BOOSTY_PREMIUM_GRACE_HOURS ?? '48');
  if (!Number.isFinite(raw)) return 48;
  return Math.max(12, Math.min(168, Math.round(raw)));
}

function config() {
  const botToken = process.env.TELEGRAM_BOT_TOKEN?.trim() || '';
  const chatId = process.env.BOOSTY_PREMIUM_CHAT_ID?.trim() || '';
  return {
    botToken,
    chatId,
    graceHours: graceHours(),
    boostyUrl: boostyUrl(),
    configured: Boolean(botToken && chatId),
  };
}

function memberCounts(status: string | undefined, isMember: boolean | undefined) {
  if (status === 'creator' || status === 'administrator' || status === 'member') return true;
  if (status === 'restricted') return isMember === true;
  return false;
}

async function telegramMember(telegramId: string) {
  const current = config();
  if (!current.configured) {
    throw new Error('boosty_premium_not_configured');
  }

  const url = new URL(`https://api.telegram.org/bot${current.botToken}/getChatMember`);
  url.searchParams.set('chat_id', current.chatId);
  url.searchParams.set('user_id', telegramId);

  const response = await fetch(url, {
    method: 'GET',
    cache: 'no-store',
    headers: { Accept: 'application/json' },
  });

  const payload = (await response.json().catch(() => ({}))) as TelegramMemberPayload;
  if (!response.ok || !payload.ok || !payload.result) {
    const message = payload.description || `Telegram getChatMember failed (${response.status})`;
    throw new Error(message);
  }

  const status = payload.result.status || 'unknown';
  return {
    status,
    active: memberCounts(status, payload.result.is_member),
  };
}

function mapLink(
  row: Record<string, unknown> | null,
  telegramLinked: boolean,
  telegramId: string | null,
): BoostyBridgeStatus {
  const current = config();
  if (!current.configured) {
    return {
      configured: false,
      boostyUrl: current.boostyUrl,
      telegramLinked,
      telegramId,
      state: 'not_configured',
      memberStatus: null,
      subscriptionId: null,
      lastVerifiedAt: null,
      lastSuccessAt: null,
      graceUntil: null,
      lastError: null,
    };
  }

  if (!telegramLinked) {
    return {
      configured: true,
      boostyUrl: current.boostyUrl,
      telegramLinked: false,
      telegramId: null,
      state: 'telegram_not_linked',
      memberStatus: null,
      subscriptionId: null,
      lastVerifiedAt: null,
      lastSuccessAt: null,
      graceUntil: null,
      lastError: null,
    };
  }

  const state = typeof row?.status === 'string'
    ? (row.status as BoostyBridgeState)
    : 'not_member';

  return {
    configured: true,
    boostyUrl: current.boostyUrl,
    telegramLinked,
    telegramId,
    state,
    memberStatus: typeof row?.member_status === 'string' ? row.member_status : null,
    subscriptionId: typeof row?.subscription_id === 'string' ? row.subscription_id : null,
    lastVerifiedAt: typeof row?.last_verified_at === 'string' ? row.last_verified_at : null,
    lastSuccessAt: typeof row?.last_success_at === 'string' ? row.last_success_at : null,
    graceUntil: typeof row?.grace_until === 'string' ? row.grace_until : null,
    lastError: typeof row?.last_error === 'string' ? row.last_error : null,
  };
}

async function profileTelegramId(userId: string) {
  const admin = createSupabaseAdmin();
  const { data, error } = await admin
    .from('profiles')
    .select('telegram_id')
    .eq('id', userId)
    .maybeSingle();
  if (error) throw error;
  const value = data?.telegram_id;
  if (value == null || !/^\d+$/.test(String(value))) return null;
  return String(value);
}

export async function getBoostyPremiumBridgeStatus(userId: string): Promise<BoostyBridgeStatus> {
  const admin = createSupabaseAdmin();
  const telegramId = await profileTelegramId(userId);
  if (!telegramId) return mapLink(null, false, null);

  const { data, error } = await admin
    .from('boosty_premium_links')
    .select('status,member_status,subscription_id,last_verified_at,last_success_at,grace_until,last_error')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    // A missing migration should not make /premium unusable.
    if (String(error.message || '').toLowerCase().includes('boosty_premium_links')) {
      return mapLink(null, true, telegramId);
    }
    throw error;
  }

  return mapLink((data ?? null) as Record<string, unknown> | null, true, telegramId);
}

async function upsertEntitlements({
  userId,
  subscriptionId,
  startsAt,
  expiresAt,
}: {
  userId: string;
  subscriptionId: string;
  startsAt: string;
  expiresAt: string;
}) {
  const admin = createSupabaseAdmin();
  const now = new Date().toISOString();
  const { error } = await admin.from('user_entitlements').upsert(
    PREMIUM_ENTITLEMENTS.map((entitlement) => ({
      user_id: userId,
      entitlement,
      source: 'premium',
      source_id: subscriptionId,
      active: true,
      starts_at: startsAt,
      expires_at: expiresAt,
      metadata: {
        plan: 'monthly',
        provider: 'boosty',
        verification: 'telegram_group',
      },
      updated_at: now,
    })),
    { onConflict: 'user_id,entitlement,source,source_id' },
  );
  if (error) throw error;
}

async function markSubscriptionInactive({
  userId,
  subscriptionId,
  expired,
}: {
  userId: string;
  subscriptionId: string;
  expired: boolean;
}) {
  const admin = createSupabaseAdmin();
  const now = new Date().toISOString();

  const { error } = await admin
    .from('premium_subscriptions')
    .update({
      status: expired ? 'expired' : 'grace_period',
      auto_renew: false,
      updated_at: now,
    })
    .eq('id', subscriptionId)
    .eq('user_id', userId)
    .eq('source', 'boosty_telegram');
  if (error) throw error;

  if (expired) {
    const { error: entitlementError } = await admin
      .from('user_entitlements')
      .update({ active: false, updated_at: now })
      .eq('user_id', userId)
      .eq('source', 'premium')
      .eq('source_id', subscriptionId);
    if (entitlementError) throw entitlementError;
  }
}

export async function verifyBoostyPremiumForUser(
  userId: string,
  options: { force?: boolean } = {},
): Promise<BoostyBridgeStatus> {
  const admin = createSupabaseAdmin();
  const currentConfig = config();
  const telegramId = await profileTelegramId(userId);

  if (!currentConfig.configured) return mapLink(null, Boolean(telegramId), telegramId);
  if (!telegramId) return mapLink(null, false, null);

  const { data: existingLink, error: linkError } = await admin
    .from('boosty_premium_links')
    .select('user_id,telegram_id,status,member_status,subscription_id,last_verified_at,last_success_at,grace_until,last_error')
    .eq('user_id', userId)
    .maybeSingle();
  if (linkError) throw linkError;

  if (!options.force && existingLink?.last_verified_at) {
    const ageMs = Date.now() - Date.parse(existingLink.last_verified_at);
    if (Number.isFinite(ageMs) && ageMs < 15_000) {
      return mapLink(existingLink as Record<string, unknown>, true, telegramId);
    }
  }

  const now = new Date();
  const nowIso = now.toISOString();

  let membership: { active: boolean; status: string };
  try {
    membership = await telegramMember(telegramId);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'telegram_membership_check_failed';
    const { error: saveError } = await admin.from('boosty_premium_links').upsert({
      user_id: userId,
      telegram_id: telegramId,
      subscription_id: existingLink?.subscription_id ?? null,
      status: 'error',
      member_status: existingLink?.member_status ?? null,
      last_verified_at: nowIso,
      last_success_at: existingLink?.last_success_at ?? null,
      grace_until: existingLink?.grace_until ?? null,
      last_error: message.slice(0, 500),
      updated_at: nowIso,
    }, { onConflict: 'user_id' });
    if (saveError) throw saveError;
    return mapLink({
      ...existingLink,
      status: 'error',
      last_verified_at: nowIso,
      last_error: message,
    } as Record<string, unknown>, true, telegramId);
  }

  if (membership.active) {
    const leaseUntil = new Date(now.getTime() + currentConfig.graceHours * 3_600_000).toISOString();
    let subscriptionId = typeof existingLink?.subscription_id === 'string'
      ? existingLink.subscription_id
      : null;
    let startsAt = nowIso;

    if (subscriptionId) {
      const { data: existingSubscription, error: subscriptionLookupError } = await admin
        .from('premium_subscriptions')
        .select('id,starts_at,status')
        .eq('id', subscriptionId)
        .eq('user_id', userId)
        .eq('source', 'boosty_telegram')
        .maybeSingle();
      if (subscriptionLookupError) throw subscriptionLookupError;

      if (existingSubscription?.id) {
        startsAt = existingSubscription.starts_at;
        const { error: updateError } = await admin
          .from('premium_subscriptions')
          .update({
            status: 'active',
            ends_at: leaseUntil,
            cancelled_at: null,
            auto_renew: false,
            updated_at: nowIso,
            metadata: {
              provider: 'boosty',
              verification: 'telegram_group',
              telegram_id: telegramId,
              member_status: membership.status,
              rolling_lease_hours: currentConfig.graceHours,
            },
          })
          .eq('id', subscriptionId);
        if (updateError) throw updateError;
      } else {
        subscriptionId = null;
      }
    }

    if (!subscriptionId) {
      const { data: liveSubscription, error: liveLookupError } = await admin
        .from('premium_subscriptions')
        .select('id,starts_at')
        .eq('user_id', userId)
        .eq('source', 'boosty_telegram')
        .in('status', ['active', 'grace_period'])
        .order('ends_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (liveLookupError) throw liveLookupError;

      if (liveSubscription?.id) {
        subscriptionId = String(liveSubscription.id);
        startsAt = String(liveSubscription.starts_at);
        const { error: reuseError } = await admin
          .from('premium_subscriptions')
          .update({
            status: 'active',
            ends_at: leaseUntil,
            cancelled_at: null,
            auto_renew: false,
            updated_at: nowIso,
            metadata: {
              provider: 'boosty',
              verification: 'telegram_group',
              telegram_id: telegramId,
              member_status: membership.status,
              rolling_lease_hours: currentConfig.graceHours,
            },
          })
          .eq('id', subscriptionId);
        if (reuseError) throw reuseError;
      }
    }

    if (!subscriptionId) {
      const { data: subscription, error: createError } = await admin
        .from('premium_subscriptions')
        .insert({
          user_id: userId,
          plan: 'monthly',
          status: 'active',
          source: 'boosty_telegram',
          starts_at: nowIso,
          ends_at: leaseUntil,
          auto_renew: false,
          metadata: {
            provider: 'boosty',
            verification: 'telegram_group',
            telegram_id: telegramId,
            member_status: membership.status,
            rolling_lease_hours: currentConfig.graceHours,
          },
        })
        .select('id,starts_at')
        .single();
      if (createError) throw createError;
      subscriptionId = String(subscription.id);
      startsAt = String(subscription.starts_at);
    }

    await upsertEntitlements({ userId, subscriptionId, startsAt, expiresAt: leaseUntil });

    const { data: savedLink, error: saveError } = await admin.from('boosty_premium_links').upsert({
      user_id: userId,
      telegram_id: telegramId,
      subscription_id: subscriptionId,
      status: 'active',
      member_status: membership.status,
      last_verified_at: nowIso,
      last_success_at: nowIso,
      grace_until: leaseUntil,
      last_error: null,
      updated_at: nowIso,
    }, { onConflict: 'user_id' }).select('status,member_status,subscription_id,last_verified_at,last_success_at,grace_until,last_error').single();
    if (saveError) throw saveError;

    return mapLink(savedLink as Record<string, unknown>, true, telegramId);
  }

  const subscriptionId = typeof existingLink?.subscription_id === 'string'
    ? existingLink.subscription_id
    : null;
  let nextState: BoostyBridgeState = 'not_member';
  let graceUntil = typeof existingLink?.grace_until === 'string' ? existingLink.grace_until : null;

  if (subscriptionId) {
    const { data: subscription, error: subscriptionError } = await admin
      .from('premium_subscriptions')
      .select('id,ends_at,status')
      .eq('id', subscriptionId)
      .eq('user_id', userId)
      .eq('source', 'boosty_telegram')
      .maybeSingle();
    if (subscriptionError) throw subscriptionError;

    if (subscription?.id) {
      graceUntil = subscription.ends_at;
      const expired = Date.parse(subscription.ends_at) <= Date.now();
      await markSubscriptionInactive({ userId, subscriptionId, expired });
      nextState = expired ? 'not_member' : 'grace_period';
    }
  }

  const { data: savedLink, error: saveError } = await admin.from('boosty_premium_links').upsert({
    user_id: userId,
    telegram_id: telegramId,
    subscription_id: subscriptionId,
    status: nextState,
    member_status: membership.status,
    last_verified_at: nowIso,
    last_success_at: existingLink?.last_success_at ?? null,
    grace_until: graceUntil,
    last_error: null,
    updated_at: nowIso,
  }, { onConflict: 'user_id' }).select('status,member_status,subscription_id,last_verified_at,last_success_at,grace_until,last_error').single();
  if (saveError) throw saveError;

  return mapLink(savedLink as Record<string, unknown>, true, telegramId);
}

export async function listBoostyUsersForRecheck(limit = 100) {
  const admin = createSupabaseAdmin();
  const safeLimit = Math.max(1, Math.min(250, Math.round(limit)));
  const { data, error } = await admin
    .from('boosty_premium_links')
    .select('user_id')
    .in('status', ['active', 'grace_period', 'error'])
    .order('last_verified_at', { ascending: true, nullsFirst: true })
    .limit(safeLimit);
  if (error) throw error;
  return (data ?? []).map((row) => String(row.user_id));
}
