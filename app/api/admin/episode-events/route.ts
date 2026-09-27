import { ApiError, adminClient, failure, positiveInteger, readBody, response } from '@/lib/community-server';
import { requireAdmin, requireAdminMutation, writeAdminAudit } from '@/lib/admin-server';

const EVENT_KINDS = new Set([
  'character_intro',
  'battle',
  'tension',
  'reveal',
  'secret',
  'death',
  'finale',
  'arc_complete',
  'episode_milestone',
]);
const RARITIES = new Set(['common', 'uncommon', 'rare', 'epic', 'legendary']);

function textValue(value: unknown, max: number) {
  if (typeof value !== 'string') throw new ApiError(400, 'Некорректный текст.');
  const normalized = value.trim();
  if (!normalized || normalized.length > max) throw new ApiError(400, 'Некорректный текст.');
  return normalized;
}

function atMs(value: unknown) {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0 || value > 28_800_000) {
    throw new ApiError(400, 'Некорректный таймкод.');
  }
  return value;
}

export async function GET(request: Request) {
  try {
    await requireAdmin(['owner', 'admin', 'moderator']);
    const url = new URL(request.url);
    const animeIdRaw = url.searchParams.get('animeId');
    const episodeRaw = url.searchParams.get('episode');
    const admin = adminClient();

    let query = admin
      .from('episode_events')
      .select('id,anime_id,episode_number,event_key,kind,title,description,at_ms,rarity,image_url,confidence,status,source,analyzer_version,created_at,updated_at')
      .order('anime_id', { ascending: true })
      .order('episode_number', { ascending: true })
      .order('at_ms', { ascending: true })
      .limit(300);

    if (animeIdRaw) query = query.eq('anime_id', positiveInteger(Number(animeIdRaw)));
    if (episodeRaw) query = query.eq('episode_number', positiveInteger(Number(episodeRaw)));

    const { data, error } = await query;
    if (error) throw error;
    return response({ events: data ?? [] });
  } catch (error) {
    return failure(error);
  }
}

export async function POST(request: Request) {
  try {
    const { user, role } = await requireAdminMutation(request, ['owner', 'admin']);
    const body = await readBody(request);
    const action = String(body.action || '');
    const admin = adminClient();

    if (action === 'upsert_candidate') {
      const animeId = positiveInteger(body.animeId);
      const episode = positiveInteger(body.episode);
      const eventKey = textValue(body.eventKey, 120);
      const kind = textValue(body.kind, 40);
      const rarity = textValue(body.rarity ?? 'common', 20);
      if (!EVENT_KINDS.has(kind)) throw new ApiError(400, 'Неизвестный тип события.');
      if (!RARITIES.has(rarity)) throw new ApiError(400, 'Неизвестная редкость.');

      const confidenceRaw = Number(body.confidence ?? 1);
      const confidence = Number.isFinite(confidenceRaw)
        ? Math.max(0, Math.min(1, confidenceRaw))
        : 1;

      const { data, error } = await admin
        .from('episode_events')
        .upsert({
          anime_id: animeId,
          episode_number: episode,
          event_key: eventKey,
          kind,
          title: textValue(body.title, 180),
          description: typeof body.description === 'string' ? body.description.trim().slice(0, 700) : '',
          at_ms: atMs(body.atMs),
          rarity,
          image_url: typeof body.imageUrl === 'string' ? body.imageUrl.trim().slice(0, 1000) || null : null,
          confidence,
          status: 'draft',
          source: typeof body.source === 'string' ? body.source.trim().slice(0, 80) || 'offline_analyzer' : 'offline_analyzer',
          analyzer_version: typeof body.analyzerVersion === 'string' ? body.analyzerVersion.trim().slice(0, 80) || null : null,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'anime_id,episode_number,event_key' })
        .select('id,status')
        .single();

      if (error) throw error;
      return response({ event: data }, 201);
    }

    if (action === 'review') {
      const id = textValue(body.id, 80);
      const status = String(body.status || '');
      if (status !== 'approved' && status !== 'rejected') {
        throw new ApiError(400, 'Некорректный статус ревью.');
      }

      const { data, error } = await admin
        .from('episode_events')
        .update({
          status,
          approved_at: status === 'approved' ? new Date().toISOString() : null,
          approved_by: status === 'approved' ? user.id : null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', id)
        .select('id,anime_id,episode_number,event_key,status')
        .single();

      if (error) throw error;

      await writeAdminAudit({
        actorId: user.id,
        actorRole: role,
        action: `episode_event_${status}`,
        targetType: 'episode_event',
        targetId: id,
        details: data as Record<string, unknown>,
        request,
      });

      return response({ event: data });
    }

    throw new ApiError(400, 'Неизвестное действие.');
  } catch (error) {
    return failure(error);
  }
}
