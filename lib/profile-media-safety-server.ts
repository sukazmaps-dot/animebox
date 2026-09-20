import 'server-only';

import { createHash } from 'node:crypto';

import { ApiError, adminClient } from '@/lib/community-server';

export type ProfileMediaScope = 'base' | 'premium';
export type ProfileMediaKind = 'avatar' | 'banner';
export type ProfileMediaVariant = 'original' | 'static';

export type ProfileMediaCandidate = {
  variant: ProfileMediaVariant;
  path: string;
  quarantinePath: string;
};

export type ProfileMediaCandidateGroup = {
  scope: ProfileMediaScope;
  kind: ProfileMediaKind;
  applyPayload: Record<string, unknown>;
  candidates: ProfileMediaCandidate[];
};

type ModerationDecision = 'approve' | 'review' | 'block';

type ModerationResult = {
  decision: ModerationDecision;
  reason: string;
  provider: string;
  model: string | null;
  categories: Record<string, boolean>;
  scores: Record<string, number>;
  raw: Record<string, unknown> | null;
};

type LoadedMedia = {
  candidate: ProfileMediaCandidate;
  bytes: Buffer;
  mimeType: string;
  size: number;
  sha256: string;
  animated: boolean;
  moderation: ModerationResult;
};

const PUBLIC_BUCKET = 'profile-media';
const QUARANTINE_BUCKET = 'profile-media-quarantine';

function inferMimeType(path: string) {
  const lower = path.toLowerCase();
  if (lower.endsWith('.gif')) return 'image/gif';
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
  return 'image/webp';
}

function detectAnimation(bytes: Buffer, mimeType: string) {
  if (mimeType === 'image/gif') return true;

  if (mimeType === 'image/webp') {
    return bytes.includes(Buffer.from('ANIM'));
  }

  if (mimeType === 'image/png') {
    return bytes.includes(Buffer.from('acTL'));
  }

  return false;
}

function finiteScore(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

async function cachedDecision(sha256: string): Promise<ModerationResult | null> {
  const admin = adminClient();
  const { data, error } = await admin
    .from('profile_media_moderation')
    .select('status,reason,provider,provider_model,categories,category_scores,moderation_result')
    .eq('sha256', sha256)
    .in('status', ['approved', 'rejected'])
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error('[ProfileMediaSafety] cache lookup:', error);
    return null;
  }

  if (!data) return null;

  // Old v1 rejects were produced with intentionally conservative thresholds.
  // Re-evaluate them under the v2 policy so harmless anime art does not stay
  // permanently blocked just because its hash was seen before the policy update.
  if (data.status === 'rejected' && data.reason !== 'unsafe_profile_media_v2') {
    return null;
  }

  return {
    decision: data.status === 'approved' ? 'approve' : 'block',
    reason: data.reason || (data.status === 'approved' ? 'cached_approved' : 'cached_rejected'),
    provider: data.provider || 'cache',
    model: data.provider_model || null,
    categories: (data.categories as Record<string, boolean> | null) ?? {},
    scores: (data.category_scores as Record<string, number> | null) ?? {},
    raw: (data.moderation_result as Record<string, unknown> | null) ?? null,
  };
}

type ModerationContext = {
  scope: ProfileMediaScope;
  kind: ProfileMediaKind;
};

const MODERATION_TIMEOUT_MS = 9_000;

async function moderateWithOpenAI(
  bytes: Buffer,
  mimeType: string,
  context: ModerationContext,
): Promise<ModerationResult> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();

  if (!apiKey) {
    return {
      decision: 'review',
      reason: 'moderation_provider_not_configured',
      provider: 'manual',
      model: null,
      categories: {},
      scores: {},
      raw: null,
    };
  }

  try {
    const dataUrl = `data:${mimeType};base64,${bytes.toString('base64')}`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), MODERATION_TIMEOUT_MS);
    let response: Response;

    try {
      response = await fetch('https://api.openai.com/v1/moderations', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'omni-moderation-latest',
          input: [
            {
              type: 'image_url',
              image_url: { url: dataUrl },
            },
          ],
        }),
        cache: 'no-store',
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeout);
    }

    if (!response.ok) {
      console.error('[ProfileMediaSafety] moderation HTTP', response.status);
      return {
        decision: 'review',
        reason: `moderation_http_${response.status}`,
        provider: 'openai',
        model: 'omni-moderation-latest',
        categories: {},
        scores: {},
        raw: null,
      };
    }

    const payload = (await response.json()) as {
      model?: string;
      results?: Array<{
        flagged?: boolean;
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

    // Profile-media policy v2: only high-confidence severe content is blocked
    // automatically. Stylised anime art often receives small non-zero scores;
    // those should not turn a harmless avatar into a hard rejection.
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

    const bannerMultiplier = context.kind === 'banner' ? 1.12 : 1;
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
    console.error('[ProfileMediaSafety] moderation request failed:', error);
    const timeout = error instanceof Error && error.name === 'AbortError';
    return {
      decision: 'review',
      reason: timeout ? 'moderation_timeout' : 'moderation_unavailable',
      provider: 'openai',
      model: 'omni-moderation-latest',
      categories: {},
      scores: {},
      raw: null,
    };
  }
}

async function loadAndModerate(
  candidate: ProfileMediaCandidate,
  context: ModerationContext,
): Promise<LoadedMedia> {
  const admin = adminClient();
  const { data, error } = await admin.storage
    .from(QUARANTINE_BUCKET)
    .download(candidate.quarantinePath);

  if (error || !data) {
    throw new ApiError(400, 'Не удалось проверить приватно загруженное изображение. Загрузите файл заново.');
  }

  const bytes = Buffer.from(await data.arrayBuffer());
  const mimeType = data.type || inferMimeType(candidate.path);
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  const animated = detectAnimation(bytes, mimeType);

  const cached = await cachedDecision(sha256);
  const moderation = cached ?? (await moderateWithOpenAI(bytes, mimeType, context));

  // v2 no longer sends every animated avatar to manual review by default.
  // The constrained upload sizes plus the provider decision are used instead;
  // suspicious/flagged animation still lands in the normal review queue.

  return {
    candidate,
    bytes,
    mimeType,
    size: bytes.byteLength,
    sha256,
    animated,
    moderation,
  };
}

async function recordImmediate(
  userId: string,
  group: ProfileMediaCandidateGroup,
  item: LoadedMedia,
  status: 'approved' | 'rejected',
) {
  const { error } = await adminClient().from('profile_media_moderation').insert({
    user_id: userId,
    scope: group.scope,
    kind: group.kind,
    variant: item.candidate.variant,
    public_path: item.candidate.path,
    quarantine_path: null,
    sha256: item.sha256,
    mime_type: item.mimeType,
    file_size: item.size,
    animated: item.animated,
    status,
    reason: item.moderation.reason,
    provider: item.moderation.provider,
    provider_model: item.moderation.model,
    categories: item.moderation.categories,
    category_scores: item.moderation.scores,
    moderation_result: item.moderation.raw ?? {},
  });

  if (error) throw error;
}

async function quarantineGroup(
  userId: string,
  group: ProfileMediaCandidateGroup,
  items: LoadedMedia[],
) {
  const admin = adminClient();
  const groupId = crypto.randomUUID();

  const { error: groupError } = await admin.from('profile_media_review_groups').insert({
    id: groupId,
    user_id: userId,
    scope: group.scope,
    kind: group.kind,
    status: 'review',
    apply_payload: group.applyPayload,
  });

  if (groupError) throw groupError;

  const insertedIds: string[] = [];

  try {
    for (const item of items) {
      const { data: inserted, error: insertError } = await admin
        .from('profile_media_moderation')
        .insert({
          review_group_id: groupId,
          user_id: userId,
          scope: group.scope,
          kind: group.kind,
          variant: item.candidate.variant,
          public_path: item.candidate.path,
          quarantine_path: item.candidate.quarantinePath,
          sha256: item.sha256,
          mime_type: item.mimeType,
          file_size: item.size,
          animated: item.animated,
          status: 'review',
          reason: item.moderation.reason,
          provider: item.moderation.provider,
          provider_model: item.moderation.model,
          categories: item.moderation.categories,
          category_scores: item.moderation.scores,
          moderation_result: item.moderation.raw ?? {},
        })
        .select('id')
        .single();

      if (insertError) throw insertError;
      if (inserted?.id) insertedIds.push(String(inserted.id));
    }

    // Defense in depth: a pending file must never exist in the public bucket.
    const publicPaths = items.map((item) => item.candidate.path);
    if (publicPaths.length) {
      const { error: removeError } = await admin.storage.from(PUBLIC_BUCKET).remove(publicPaths);
      if (removeError) console.error('[ProfileMediaSafety] public cleanup:', removeError);
    }
  } catch (error) {
    if (insertedIds.length) {
      await admin.from('profile_media_moderation').delete().in('id', insertedIds);
    }
    await admin.from('profile_media_review_groups').delete().eq('id', groupId);
    const quarantinePaths = items.map((item) => item.candidate.quarantinePath);
    if (quarantinePaths.length) {
      await admin.storage.from(QUARANTINE_BUCKET).remove(quarantinePaths);
    }
    throw error;
  }
}

async function approveImmediately(
  userId: string,
  group: ProfileMediaCandidateGroup,
  item: LoadedMedia,
) {
  const admin = adminClient();
  const uploaded = await admin.storage.from(PUBLIC_BUCKET).upload(item.candidate.path, item.bytes, {
    contentType: item.mimeType,
    cacheControl: '31536000',
    upsert: false,
  });
  if (uploaded.error) throw uploaded.error;

  try {
    await recordImmediate(userId, group, item, 'approved');
  } catch (error) {
    await admin.storage.from(PUBLIC_BUCKET).remove([item.candidate.path]);
    throw error;
  }

  const cleanup = await admin.storage
    .from(QUARANTINE_BUCKET)
    .remove([item.candidate.quarantinePath]);
  if (cleanup.error) console.error('[ProfileMediaSafety] approved quarantine cleanup:', cleanup.error);
}

export async function screenProfileMediaGroups(
  userId: string,
  groups: ProfileMediaCandidateGroup[],
) {
  for (const group of groups) {
    if (!group.candidates.length) continue;

    const context: ModerationContext = { scope: group.scope, kind: group.kind };
    const items = await Promise.all(group.candidates.map((candidate) => loadAndModerate(candidate, context)));
    const blocked = items.find((item) => item.moderation.decision === 'block');

    if (blocked) {
      await Promise.all(
        items.map((item) => recordImmediate(userId, group, item, 'rejected').catch((error) => {
          console.error('[ProfileMediaSafety] rejected audit write:', error);
        })),
      );

      const admin = adminClient();
      const publicPaths = items.map((item) => item.candidate.path);
      const quarantinePaths = items.map((item) => item.candidate.quarantinePath);
      if (publicPaths.length) {
        const { error } = await admin.storage.from(PUBLIC_BUCKET).remove(publicPaths);
        if (error) console.error('[ProfileMediaSafety] rejected public cleanup:', error);
      }
      if (quarantinePaths.length) {
        const { error } = await admin.storage.from(QUARANTINE_BUCKET).remove(quarantinePaths);
        if (error) console.error('[ProfileMediaSafety] rejected quarantine cleanup:', error);
      }

      throw new ApiError(
        422,
        'Изображение содержит материал, который нельзя использовать в публичном профиле AnimeBox. Выберите другое изображение.',
      );
    }

    const review = items.some((item) => item.moderation.decision === 'review');
    if (review) {
      await quarantineGroup(userId, group, items);
      throw new ApiError(
        409,
        'Мы не стали отклонять изображение автоматически: оно отправлено на дополнительную проверку. Пока останется прежнее оформление.',
      );
    }

    for (const item of items) {
      await approveImmediately(userId, group, item);
    }
  }
}

export async function signedReviewMedia(groupId: string) {
  const admin = adminClient();
  const { data, error } = await admin
    .from('profile_media_moderation')
    .select('id,variant,quarantine_path,mime_type,animated,reason,categories,category_scores')
    .eq('review_group_id', groupId)
    .eq('status', 'review')
    .order('variant', { ascending: true });

  if (error) throw error;

  return Promise.all(
    (data ?? []).map(async (item) => {
      let signedUrl: string | null = null;
      if (item.quarantine_path) {
        const signed = await admin.storage
          .from(QUARANTINE_BUCKET)
          .createSignedUrl(item.quarantine_path, 15 * 60);
        signedUrl = signed.data?.signedUrl ?? null;
      }
      return { ...item, signedUrl };
    }),
  );
}
