import 'server-only';

import { adminClient } from '@/lib/community-server';

export type ProfileMediaModerationHealth = {
  status: 'disabled' | 'healthy' | 'degraded' | 'unavailable' | 'not_configured' | 'idle';
  enabled: boolean;
  configured: boolean;
  provider: 'openai';
  model: string;
  checked24h: number;
  approved24h: number;
  rejected24h: number;
  borderline24h: number;
  technicalFailures24h: number;
  rateLimited24h: number;
  quotaFailures24h: number;
  latestReason: string | null;
  latestAt: string | null;
};

function isTechnical(reason: string | null) {
  if (!reason) return false;
  return (
    reason === 'moderation_provider_not_configured' ||
    reason === 'moderation_rate_limited' ||
    reason === 'moderation_quota_unavailable' ||
    reason === 'moderation_timeout' ||
    reason === 'moderation_unavailable' ||
    reason.startsWith('moderation_http_')
  );
}

export async function getProfileMediaModerationHealth(): Promise<ProfileMediaModerationHealth> {
  const enabled =
    process.env.PROFILE_MEDIA_AUTO_MODERATION?.trim().toLowerCase() === 'true';
  const configured = Boolean(process.env.OPENAI_API_KEY?.trim());
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const { data, error } = await adminClient()
    .from('profile_media_moderation')
    .select('status,reason,provider,provider_model,created_at')
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(250);

  if (error) throw error;

  const rows = data ?? [];
  const approved = rows.filter((row) => row.status === 'approved').length;
  const rejected = rows.filter((row) => row.status === 'rejected').length;
  const borderline = rows.filter((row) => row.reason === 'borderline_profile_media_v2').length;
  const technical = rows.filter((row) => isTechnical(row.reason)).length;
  const rateLimited = rows.filter(
    (row) =>
      row.reason === 'moderation_rate_limited' ||
      row.reason === 'moderation_http_429',
  ).length;
  const quota = rows.filter((row) => row.reason === 'moderation_quota_unavailable').length;
  const latest = rows[0] ?? null;
  const latestAgeMs = latest?.created_at
    ? Date.now() - Date.parse(latest.created_at)
    : Number.POSITIVE_INFINITY;
  const freshTechnicalFailure =
    latestAgeMs <= 15 * 60 * 1000 && isTechnical(latest?.reason ?? null);

  let status: ProfileMediaModerationHealth['status'] = enabled ? 'idle' : 'disabled';
  if (enabled && !configured) status = 'not_configured';
  else if (enabled && quota > 0 && freshTechnicalFailure) status = 'unavailable';
  else if (enabled && (freshTechnicalFailure || rateLimited >= 3)) status = 'degraded';
  else if (enabled && (approved > 0 || rejected > 0 || borderline > 0)) status = 'healthy';

  return {
    status,
    enabled,
    configured,
    provider: 'openai',
    model: 'omni-moderation-latest',
    checked24h: rows.length,
    approved24h: approved,
    rejected24h: rejected,
    borderline24h: borderline,
    technicalFailures24h: technical,
    rateLimited24h: rateLimited,
    quotaFailures24h: quota,
    latestReason: latest?.reason ?? null,
    latestAt: latest?.created_at ?? null,
  };
}
