import 'server-only';

import { createHash } from 'node:crypto';
import { basename } from 'node:path';

import { ApiError, adminClient } from '@/lib/community-server';

export type ProfileMediaScope = 'base' | 'premium';
export type ProfileMediaKind = 'avatar' | 'banner';
export type ProfileMediaVariant = 'original' | 'static';

export type ProfileMediaCandidate = {
  variant: ProfileMediaVariant;
  path: string;
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

async function moderateWithOpenAI(bytes: Buffer, mimeType: string): Promise<ModerationResult> {
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
    const response = await fetch('https://api.openai.com/v1/moderations', {
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
    });

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

    const hardBlock =
      Boolean(categories['sexual/minors']) ||
      Boolean(categories['violence/graphic']) ||
      (Boolean(categories.sexual) && sexualScore >= 0.5) ||
      sexualScore >= 0.72 ||
      sexualMinorsScore >= 0.03 ||
      graphicScore >= 0.5;

    if (hardBlock) {
      return {
        decision: 'block',
        reason: 'unsafe_profile_media',
        provider: 'openai',
        model: payload.model || 'omni-moderation-latest',
        categories,
        scores,
        raw: payload as unknown as Record<string, unknown>,
      };
    }

    const needsReview =
      Boolean(result?.flagged) ||
      sexualScore >= 0.24 ||
      graphicScore >= 0.2 ||
      Boolean(categories.violence) ||
      Boolean(categories.hate) ||
      Boolean(categories['hate/threatening']) ||
      Boolean(categories['self-harm']);

    return {
      decision: needsReview ? 'review' : 'approve',
      reason: needsReview ? 'borderline_profile_media' : 'safe_profile_media',
      provider: 'openai',
      model: payload.model || 'omni-moderation-latest',
      categories,
      scores,
      raw: payload as unknown as Record<string, unknown>,
    };
  } catch (error) {
    console.error('[ProfileMediaSafety] moderation request failed:', error);
    return {
      decision: 'review',
      reason: 'moderation_unavailable',
      provider: 'openai',
      model: 'omni-moderation-latest',
      categories: {},
      scores: {},
      raw: null,
    };
  }
}

async function loadAndModerate(candidate: ProfileMediaCandidate): Promise<LoadedMedia> {
  const admin = adminClient();
  const { data, error } = await admin.storage.from(PUBLIC_BUCKET).download(candidate.path);

  if (error || !data) {
    throw new ApiError(400, 'Не удалось проверить загруженное изображение. Загрузите файл заново.');
  }

  const bytes = Buffer.from(await data.arrayBuffer());
  const mimeType = data.type || inferMimeType(candidate.path);
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  const animated = detectAnimation(bytes, mimeType);

  const cached = await cachedDecision(sha256);
  let moderation = cached ?? (await moderateWithOpenAI(bytes, mimeType));

  // v1 intentionally fails closed for animated user media. Image moderation
  // is reliable for a still frame, but an unsafe frame can appear later in a
  // GIF/animated WebP. These files go to the manual queue unless their exact
  // hash was already manually approved before.
  if (animated && !cached && moderation.decision === 'approve') {
    moderation = {
      ...moderation,
      decision: 'review',
      reason: 'animated_media_manual_review',
    };
  }

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
      const quarantinePath = `${userId}/${groupId}/${item.candidate.variant}-${basename(item.candidate.path)}`;

      const { error: uploadError } = await admin.storage
        .from(QUARANTINE_BUCKET)
        .upload(quarantinePath, item.bytes, {
          contentType: item.mimeType,
          cacheControl: '0',
          upsert: false,
        });

      if (uploadError) throw uploadError;

      const { data: inserted, error: insertError } = await admin
        .from('profile_media_moderation')
        .insert({
          review_group_id: groupId,
          user_id: userId,
          scope: group.scope,
          kind: group.kind,
          variant: item.candidate.variant,
          public_path: item.candidate.path,
          quarantine_path: quarantinePath,
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
    throw error;
  }
}

export async function screenProfileMediaGroups(
  userId: string,
  groups: ProfileMediaCandidateGroup[],
) {
  for (const group of groups) {
    if (!group.candidates.length) continue;

    const items = await Promise.all(group.candidates.map(loadAndModerate));
    const blocked = items.find((item) => item.moderation.decision === 'block');

    if (blocked) {
      await Promise.all(
        items.map((item) => recordImmediate(userId, group, item, 'rejected').catch((error) => {
          console.error('[ProfileMediaSafety] rejected audit write:', error);
        })),
      );

      const paths = items.map((item) => item.candidate.path);
      if (paths.length) {
        const { error } = await adminClient().storage.from(PUBLIC_BUCKET).remove(paths);
        if (error) console.error('[ProfileMediaSafety] rejected cleanup:', error);
      }

      throw new ApiError(
        422,
        'Изображение не прошло правила AnimeBox. Выберите другой аватар или баннер.',
      );
    }

    const review = items.some((item) => item.moderation.decision === 'review');
    if (review) {
      await quarantineGroup(userId, group, items);
      throw new ApiError(
        409,
        'Изображение отправлено на дополнительную проверку. Пока останется прежнее оформление.',
      );
    }

    for (const item of items) {
      await recordImmediate(userId, group, item, 'approved');
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
