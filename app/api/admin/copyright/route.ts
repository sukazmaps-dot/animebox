import {
  requireAdmin,
  requireAdminMutation,
  writeAdminAudit,
} from '@/lib/admin-server';
import {
  adminClient,
  ApiError,
  readJsonBody,
  response,
} from '@/lib/community-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const STATUSES = new Set([
  'received',
  'needs_information',
  'under_review',
  'action_taken',
  'rejected',
  'closed',
]);
const SCOPES = new Set(['title', 'season', 'episode', 'provider']);

function cleanText(value: unknown, max = 1_000) {
  if (typeof value !== 'string') return '';
  return value
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

function positiveInteger(value: unknown, label: string) {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number <= 0) {
    throw new ApiError(400, 'Некорректное поле: ' + label + '.');
  }
  return number;
}

function externalCaseNumber() {
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const suffix = crypto.randomUUID().replace(/-/g, '').slice(0, 8).toUpperCase();
  return `AB-EXT-${date}-${suffix}`;
}

function externalSourceUrl(value: unknown) {
  const cleaned = cleanText(value, 1_000);
  if (!cleaned) return null;

  try {
    const url = new URL(cleaned);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      throw new Error('unsupported protocol');
    }
    return url.toString();
  } catch {
    throw new ApiError(400, 'Некорректный URL внешнего уведомления.');
  }
}

function animeBoxUrls(value: unknown) {
  const raw = Array.isArray(value)
    ? value
    : typeof value === 'string'
      ? value.split(/\r?\n/)
      : [];
  const urls = [...new Set(
    raw
      .map((item) => cleanText(item, 900))
      .filter(Boolean)
      .slice(0, 30),
  )];

  if (!urls.length) {
    throw new ApiError(400, 'Укажи хотя бы один затронутый URL AnimeBox.');
  }

  for (const value of urls) {
    try {
      const url = new URL(value);
      const host = url.hostname.toLowerCase();
      if (
        (url.protocol !== 'http:' && url.protocol !== 'https:') ||
        (host !== 'youranimebox.com' && host !== 'www.youranimebox.com')
      ) {
        throw new Error('foreign url');
      }
    } catch {
      throw new ApiError(400, 'Затронутые URL должны вести на youranimebox.com.');
    }
  }

  return urls;
}

async function suppressEpisodeSeo(input: {
  animeId: number;
  scope: string;
  episode?: number | null;
}) {
  if (input.scope === 'provider') return;

  const admin = adminClient();
  let query = admin
    .from('seo_episode_index')
    .update({ indexable: false })
    .eq('anime_id', input.animeId);

  if (input.scope === 'episode' && input.episode) {
    query = query.eq('episode_number', input.episode);
  }

  const { error } = await query;
  if (error && !/seo_episode_index|schema cache|relation/i.test(error.message)) {
    throw error;
  }
}

async function insertCaseAction(input: {
  caseId: string;
  action: string;
  actorId: string;
  actorRole: string;
  details?: Record<string, unknown>;
}) {
  const result = await adminClient().from('copyright_actions').insert({
    case_id: input.caseId,
    action: input.action,
    actor_id: input.actorId,
    actor_role: input.actorRole,
    details: input.details ?? {},
  });
  if (result.error) throw result.error;
}

export async function GET() {
  try {
    await requireAdmin(['owner', 'admin']);
    const admin = adminClient();

    const [casesResult, restrictionsResult] = await Promise.all([
      admin
        .from('copyright_cases')
        .select(
          'id,case_number,source_type,external_reference,source_url,claimant_name,claimant_company,claimant_email,claimant_role,work_title,rights_description,authority_statement,signature,status,created_at,updated_at,reviewed_at',
        )
        .order('created_at', { ascending: false })
        .limit(100),
      admin
        .from('copyright_restrictions')
        .select(
          'id,case_id,scope,anime_id,season,episode,provider,reason,active,created_at,lifted_at',
        )
        .order('created_at', { ascending: false })
        .limit(250),
    ]);

    if (casesResult.error) throw casesResult.error;
    if (restrictionsResult.error) throw restrictionsResult.error;

    const cases = casesResult.data ?? [];
    const caseIds = cases.map((item) => item.id);
    const urlsResult = caseIds.length
      ? await admin
          .from('copyright_case_urls')
          .select('case_id,url')
          .in('case_id', caseIds)
          .order('created_at', { ascending: true })
      : { data: [], error: null };

    if (urlsResult.error) throw urlsResult.error;

    const urlsByCase = new Map<string, string[]>();
    for (const item of urlsResult.data ?? []) {
      const list = urlsByCase.get(item.case_id) ?? [];
      list.push(item.url);
      urlsByCase.set(item.case_id, list);
    }

    const restrictions = restrictionsResult.data ?? [];
    const openCases = cases.filter((item) =>
      ['received', 'needs_information', 'under_review'].includes(item.status),
    );

    return response({
      ok: true,
      metrics: {
        openCases: openCases.length,
        received: cases.filter((item) => item.status === 'received').length,
        actionTaken: cases.filter((item) => item.status === 'action_taken').length,
        activeRestrictions: restrictions.filter((item) => item.active).length,
      },
      cases: cases.map((item) => ({
        ...item,
        urls: urlsByCase.get(item.id) ?? [],
      })),
      restrictions,
    });
  } catch (error) {
    if (error instanceof ApiError) {
      return response({ ok: false, error: error.message }, error.status);
    }

    const message = error instanceof Error ? error.message : String(error);
    console.error('[Admin copyright GET]', error);
    return response(
      {
        ok: false,
        error: /copyright_|schema cache|relation/i.test(message)
          ? 'copyright_migration_required'
          : 'copyright_admin_unavailable',
      },
      503,
    );
  }
}

export async function POST(request: Request) {
  try {
    const { user, role } = await requireAdminMutation(request, ['owner', 'admin']);
    const body = await readJsonBody(request, { maxBytes: 16_000 });
    const action = cleanText(body.action, 60);
    const admin = adminClient();

    if (action === 'set_status') {
      const caseId = cleanText(body.caseId, 60);
      const status = cleanText(body.status, 40);
      const note = cleanText(body.note, 1_000);

      if (!UUID.test(caseId) || !STATUSES.has(status)) {
        throw new ApiError(400, 'Некорректное дело или статус.');
      }

      const update = await admin
        .from('copyright_cases')
        .update({
          status,
          reviewed_by: user.id,
          reviewed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', caseId);
      if (update.error) throw update.error;

      await insertCaseAction({
        caseId,
        action: 'status_changed',
        actorId: user.id,
        actorRole: role,
        details: { status, note: note || null },
      });
      await writeAdminAudit({
        actorId: user.id,
        actorRole: role,
        action: 'copyright_case_status',
        targetType: 'copyright_case',
        targetId: caseId,
        reason: note || null,
        details: { status },
        request,
      });

      return response({ ok: true });
    }

    if (action === 'add_restriction') {
      const caseId = cleanText(body.caseId, 60);
      if (!UUID.test(caseId)) throw new ApiError(400, 'Некорректное дело.');

      const scope = cleanText(body.scope, 30);
      if (!SCOPES.has(scope)) {
        throw new ApiError(400, 'Некорректная область ограничения.');
      }

      const animeId = positiveInteger(body.animeId, 'animeId');
      const season =
        body.season == null || body.season === ''
          ? null
          : positiveInteger(body.season, 'season');
      const episode =
        body.episode == null || body.episode === ''
          ? null
          : positiveInteger(body.episode, 'episode');
      const provider = cleanText(body.provider, 120);
      const reason = cleanText(body.reason, 1_000);

      if (scope === 'season' && season == null) {
        throw new ApiError(400, 'Для ограничения сезона укажи номер сезона.');
      }
      if (scope === 'episode' && episode == null) {
        throw new ApiError(400, 'Для ограничения эпизода укажи номер серии.');
      }
      if (scope === 'provider' && !provider) {
        throw new ApiError(400, 'Для ограничения источника укажи provider.');
      }

      const exists = await admin
        .from('copyright_cases')
        .select('id')
        .eq('id', caseId)
        .maybeSingle();
      if (exists.error) throw exists.error;
      if (!exists.data) throw new ApiError(404, 'Дело не найдено.');

      const inserted = await admin
        .from('copyright_restrictions')
        .insert({
          case_id: caseId,
          scope,
          anime_id: animeId,
          season,
          episode,
          provider: provider || null,
          reason: reason || null,
          active: true,
          created_by: user.id,
        })
        .select('id')
        .single();
      if (inserted.error) throw inserted.error;

      const caseUpdate = await admin
        .from('copyright_cases')
        .update({
          status: 'action_taken',
          reviewed_by: user.id,
          reviewed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', caseId);
      if (caseUpdate.error) throw caseUpdate.error;

      await insertCaseAction({
        caseId,
        action: 'restriction_added',
        actorId: user.id,
        actorRole: role,
        details: {
          restrictionId: inserted.data.id,
          scope,
          animeId,
          season,
          episode,
          provider: provider || null,
          reason: reason || null,
        },
      });
      await writeAdminAudit({
        actorId: user.id,
        actorRole: role,
        action: 'copyright_restriction_add',
        targetType: 'copyright_restriction',
        targetId: inserted.data.id,
        reason: reason || null,
        details: {
          caseId,
          scope,
          animeId,
          season,
          episode,
          provider: provider || null,
        },
        request,
      });

      return response({ ok: true, restrictionId: inserted.data.id });
    }

    if (action === 'lift_restriction') {
      const restrictionId = cleanText(body.restrictionId, 60);
      const note = cleanText(body.note, 1_000);
      if (!UUID.test(restrictionId)) {
        throw new ApiError(400, 'Некорректное ограничение.');
      }

      const current = await admin
        .from('copyright_restrictions')
        .select('id,case_id,active')
        .eq('id', restrictionId)
        .maybeSingle();
      if (current.error) throw current.error;
      if (!current.data) throw new ApiError(404, 'Ограничение не найдено.');

      const update = await admin
        .from('copyright_restrictions')
        .update({
          active: false,
          lifted_at: new Date().toISOString(),
          lifted_by: user.id,
        })
        .eq('id', restrictionId)
        .eq('active', true);
      if (update.error) throw update.error;

      await insertCaseAction({
        caseId: current.data.case_id,
        action: 'restriction_lifted',
        actorId: user.id,
        actorRole: role,
        details: { restrictionId, note: note || null },
      });
      await writeAdminAudit({
        actorId: user.id,
        actorRole: role,
        action: 'copyright_restriction_lift',
        targetType: 'copyright_restriction',
        targetId: restrictionId,
        reason: note || null,
        details: { caseId: current.data.case_id },
        request,
      });

      return response({ ok: true });
    }

    throw new ApiError(400, 'Неизвестное действие Copyright Admin.');
  } catch (error) {
    if (error instanceof ApiError) {
      return response({ ok: false, error: error.message }, error.status);
    }

    console.error('[Admin copyright POST]', error);
    return response({ ok: false, error: 'Не удалось выполнить действие.' }, 503);
  }
}
