import 'server-only';

import { adminClient } from '@/lib/community-server';
import {
  approveProfileMediaReviewGroup,
  rejectProfileMediaReviewGroup,
} from '@/lib/profile-media-review-server';

type Scope = 'base' | 'premium';
type Kind = 'avatar' | 'banner';
type Decision = 'approve' | 'review' | 'block';

type ModerationResult = {
  decision: Decision;
  reason: string;
  provider: 'openai';
  model: string;
  categories: Record<string, boolean>;
  scores: Record<string, number>;
  raw: Record<string, unknown> | null;
};

const QUARANTINE_BUCKET = 'profile-media-quarantine';
const MODERATION_TIMEOUT_MS = 5_000;
const MAX_AUTO_ATTEMPTS = 5;
const AUTO_MODERATION_ENABLED = false;

function finiteScore(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function technicalReason(reason: string) {
  return (
    reason === 'moderation_rate_limited' ||
    reason === 'moderation_quota_unavailable' ||
    reason === 'moderation_timeout' ||
    reason === 'moderation_unavailable' ||
    reason.startsWith('moderation_http_')
  );
}

function retryDelayMs(attempt: number) {
  if (attempt <= 1) return 30_000;
  if (attempt === 2) return 60_000;
  if (attempt === 3) return 120_000;
  if (attempt === 4) return 300_000;
  return 600_000;
}

async function errorDetails(response: Response) {
  try {
    const payload = (await response.json()) as {
      error?: {
        code?: string | null;
        type?: string | null;
        message?: string | null;
      };
    };

    return {
      code: payload.error?.code?.trim() || null,
      type: payload.error?.type?.trim() || null,
      message: payload.error?.message?.trim() || null,
    };
  } catch {
    return { code: null, type: null, message: null };
  }
}

function quotaLike(details: {
  code: string | null;
  type: string | null;
  message: string | null;
}) {
  const haystack = [details.code, details.type, details.message]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  return /insufficient_quota|credit|billing|spend|quota/.test(haystack);
}

async function moderateUrl(imageUrl: string, kind: Kind): Promise<ModerationResult> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();

  if (!apiKey) {
    return {
      decision: 'review',
      reason: 'moderation_provider_not_configured',
      provider: 'openai',
      model: 'omni-moderation-latest',
      categories: {},
      scores: {},
      raw: null,
    };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), MODERATION_TIMEOUT_MS);

  try {
    const response = await fetch('https://api.openai.com/v1/moderations', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'omni-moderation-latest',
        input: [{ type: 'image_url', image_url: { url: imageUrl } }],
      }),
      cache: 'no-store',
      signal: controller.signal,
    });

    if (!response.ok) {
      const details = await errorDetails(response);
      const reason =
        response.status === 429 && quotaLike(details)
          ? 'moderation_quota_unavailable'
          : response.status === 429
            ? 'moderation_rate_limited'
            : `moderation_http_${response.status}`;

      return {
        decision: 'review',
        reason,
        provider: 'openai',
        model: 'omni-moderation-latest',
        categories: {},
        scores: {},
        raw: {
          http_status: response.status,
          error_code: details.code,
          error_type: details.type,
        },
      };
    }

    const payload = (await response.json()) as {
      model?: string;
      results?: Array<{
        categories?: Record<string, boolean>;
        category_scores?: Record<string, number>;
      }>;
    };

    const result = payload.results?.[0];
    const categories = result?.categories ?? {};
    const scores = result?.category_scores ?? {};

    const sexualScore = finiteScore(scores.sexual);
    const sexualMinorsScore = finiteScore(scores['sexual/minors']);
    const graphicScore = finiteScore(scores['violence/graphic']);
    const violenceScore = finiteScore(scores.violence);
    const selfHarmScore = Math.max(
      finiteScore(scores['self-harm']),
      finiteScore(scores['self-harm/intent']),
      finiteScore(scores['self-harm/instructions']),
    );
    const hateThreatScore = finiteScore(scores['hate/threatening']);

    const hardBlock =
      Boolean(categories['sexual/minors']) ||
      sexualMinorsScore >= 0.02 ||
      (Boolean(categories.sexual) && sexualScore >= 0.88) ||
      sexualScore >= 0.94 ||
      (Boolean(categories['violence/graphic']) && graphicScore >= 0.82) ||
      graphicScore >= 0.9 ||
      selfHarmScore >= 0.88 ||
      hateThreatScore >= 0.88;

    if (hardBlock) {
      return {
        decision: 'block',
        reason: 'unsafe_profile_media_v2',
        provider: 'openai',
        model: payload.model || 'omni-moderation-latest',
        categories,
        scores,
        raw: payload as unknown as Record<string, unknown>,
      };
    }

    const bannerMultiplier = kind === 'banner' ? 1.12 : 1;
    const needsReview =
      sexualScore >= 0.62 * bannerMultiplier ||
      graphicScore >= 0.55 * bannerMultiplier ||
      violenceScore >= 0.72 * bannerMultiplier ||
      selfHarmScore >= 0.62 ||
      hateThreatScore >= 0.62;

    return {
      decision: needsReview ? 'review' : 'approve',
      reason: needsReview ? 'borderline_profile_media_v2' : 'safe_profile_media_v2',
      provider: 'openai',
      model: payload.model || 'omni-moderation-latest',
      categories,
      scores,
      raw: payload as unknown as Record<string, unknown>,
    };
  } catch (error) {
    return {
      decision: 'review',
      reason:
        error instanceof Error && error.name === 'AbortError'
          ? 'moderation_timeout'
          : 'moderation_unavailable',
      provider: 'openai',
      model: 'omni-moderation-latest',
      categories: {},
      scores: {},
      raw: null,
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function updateRows(groupId: string, result: ModerationResult) {
  const { error } = await adminClient()
    .from('profile_media_moderation')
    .update({
      reason: result.reason,
      provider: result.provider,
      provider_model: result.model,
      categories: result.categories,
      category_scores: result.scores,
      moderation_result: result.raw ?? {},
      updated_at: new Date().toISOString(),
    })
    .eq('review_group_id', groupId)
    .eq('status', 'review');

  if (error) throw error;
}

async function reschedule(
  groupId: string,
  attempts: number,
  reason: string,
  forceManual = false,
) {
  const giveUp = forceManual || attempts >= MAX_AUTO_ATTEMPTS;
  const now = new Date().toISOString();

  const { error } = await adminClient()
    .from('profile_media_review_groups')
    .update({
      automation_state: giveUp ? 'manual' : 'retry',
      auto_attempts: attempts,
      next_auto_check_at: giveUp
        ? null
        : new Date(Date.now() + retryDelayMs(attempts)).toISOString(),
      last_auto_check_at: now,
      auto_last_reason: reason,
      updated_at: now,
    })
    .eq('id', groupId)
    .eq('status', 'review');

  if (error) throw error;
}

async function processGroup(group: {
  id: string;
  scope: Scope;
  kind: Kind;
  auto_attempts: number | null;
}) {
  const admin = adminClient();
  const claimTime = new Date().toISOString();

  const claim = await admin
    .from('profile_media_review_groups')
    .update({
      automation_state: 'processing',
      last_auto_check_at: claimTime,
      updated_at: claimTime,
    })
    .eq('id', group.id)
    .eq('status', 'review')
    .eq('automation_state', 'retry')
    .select('id')
    .maybeSingle();

  if (claim.error) throw claim.error;
  if (!claim.data) return 'skipped' as const;

  try {
    const { data: rows, error: rowsError } = await admin
      .from('profile_media_moderation')
      .select('variant,quarantine_path')
      .eq('review_group_id', group.id)
      .eq('status', 'review')
      .order('variant', { ascending: true });

    if (rowsError) throw rowsError;

    const primary =
      rows?.find((row) => row.variant === 'original') ??
      rows?.find((row) => Boolean(row.quarantine_path));

    if (!primary?.quarantine_path) {
      await reschedule(group.id, MAX_AUTO_ATTEMPTS, 'missing_quarantine_media', true);
      return 'manual' as const;
    }

    const signed = await admin.storage
      .from(QUARANTINE_BUCKET)
      .createSignedUrl(primary.quarantine_path, 2 * 60);

    if (signed.error || !signed.data?.signedUrl) {
      throw signed.error || new Error('moderation_signed_url_failed');
    }

    const result = await moderateUrl(signed.data.signedUrl, group.kind);
    await updateRows(group.id, result);

    if (result.decision === 'approve') {
      await approveProfileMediaReviewGroup(group.id, null);
      return 'approved' as const;
    }

    if (result.decision === 'block') {
      await rejectProfileMediaReviewGroup(group.id, null);
      return 'rejected' as const;
    }

    const attempts = Math.max(1, Number(group.auto_attempts) || 1) + 1;

    if (!technicalReason(result.reason)) {
      await reschedule(group.id, attempts, result.reason, true);
      return 'manual' as const;
    }

    await reschedule(group.id, attempts, result.reason);
    return attempts >= MAX_AUTO_ATTEMPTS ? 'manual' as const : 'retry' as const;
  } catch (error) {
    const attempts = Math.max(1, Number(group.auto_attempts) || 1) + 1;
    const reason =
      error instanceof Error ? error.message.slice(0, 160) : 'auto_review_failed';

    await reschedule(group.id, attempts, reason);
    console.error('[ProfileMediaAutoReview] group failed:', group.id, error);
    return attempts >= MAX_AUTO_ATTEMPTS ? 'manual' as const : 'retry' as const;
  }
}

export async function processAutomaticProfileMediaReviews(limit = 4) {
  if (!AUTO_MODERATION_ENABLED) {
    return {
      disabled: true,
      checked: 0,
      approved: 0,
      rejected: 0,
      retry: 0,
      manual: 0,
      skipped: 0,
    };
  }

  const admin = adminClient();
  const safeLimit = Math.max(1, Math.min(10, Math.floor(limit)));

  const { data, error } = await admin
    .from('profile_media_review_groups')
    .select('id,scope,kind,auto_attempts')
    .eq('status', 'review')
    .eq('automation_state', 'retry')
    .lte('next_auto_check_at', new Date().toISOString())
    .order('next_auto_check_at', { ascending: true })
    .limit(safeLimit);

  if (error) throw error;

  const stats = {
    checked: 0,
    approved: 0,
    rejected: 0,
    retry: 0,
    manual: 0,
    skipped: 0,
  };

  for (const group of data ?? []) {
    const status = await processGroup({
      id: group.id,
      scope: group.scope as Scope,
      kind: group.kind as Kind,
      auto_attempts: group.auto_attempts,
    });

    stats.checked += 1;
    stats[status] += 1;
  }

  return stats;
}
