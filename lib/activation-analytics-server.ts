import 'server-only';

import { createSupabaseAdmin } from '@/lib/supabase/admin';
import type {
  ActivationDashboard,
  ActivationRange,
  ActivationStage,
  ActivationSurface,
} from '@/lib/activation-analytics';

const ACTIVATION_EVENTS = [
  'page_view',
  'auth_modal_opened',
  'auth_completed',
  'registration_session',
  'onboarding_started',
  'onboarding_completed',
  'anime_open',
  'player_started',
] as const;

const PAGE_SIZE = 1_000;
const MAX_EVENTS = 20_000;

type Row = {
  event_name: string;
  session_id: string | null;
  source: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
};

function pct(numerator: number, denominator: number) {
  return denominator > 0 ? Math.round((numerator / denominator) * 10_000) / 100 : 0;
}

function sourceOf(row: Row) {
  const metadata = row.metadata && typeof row.metadata === 'object' && !Array.isArray(row.metadata)
    ? row.metadata
    : {};
  const source = typeof metadata.surface === 'string' && metadata.surface.trim()
    ? metadata.surface.trim()
    : typeof row.source === 'string' && row.source.trim()
      ? row.source.trim()
      : 'web';
  if (source === 'telegram' || source === 'telegram_mini_app') return 'telegram';
  if (source === 'mobile') return 'mobile';
  if (source === 'desktop') return 'desktop';
  return source.slice(0, 64);
}

async function loadEvents(rangeDays: ActivationRange) {
  const admin = createSupabaseAdmin();
  const since = new Date(Date.now() - rangeDays * 24 * 60 * 60 * 1_000).toISOString();
  const rows: Row[] = [];

  for (let offset = 0; offset < MAX_EVENTS; offset += PAGE_SIZE) {
    const { data, error } = await admin
      .from('product_events')
      .select('event_name,session_id,source,metadata,created_at')
      .in('event_name', [...ACTIVATION_EVENTS])
      .gte('created_at', since)
      .order('created_at', { ascending: true })
      .range(offset, offset + PAGE_SIZE - 1);

    if (error) throw error;
    const page = (data || []) as Row[];
    rows.push(...page);
    if (page.length < PAGE_SIZE) break;
  }

  return { rows, truncated: rows.length >= MAX_EVENTS };
}

export async function getActivationDashboard(days: number): Promise<ActivationDashboard> {
  const rangeDays: ActivationRange = days === 30 ? 30 : 7;
  const { rows, truncated } = await loadEvents(rangeDays);
  const sets = new Map<string, Set<string>>();
  const surfaceMap = new Map<string, ActivationSurface & { _sessions: Map<string, Set<string>> }>();

  const setFor = (eventName: string) => {
    let set = sets.get(eventName);
    if (!set) {
      set = new Set<string>();
      sets.set(eventName, set);
    }
    return set;
  };

  const surfaceFor = (source: string) => {
    let item = surfaceMap.get(source);
    if (!item) {
      item = {
        source,
        authOpened: 0,
        authCompleted: 0,
        registrations: 0,
        playerStarts: 0,
        _sessions: new Map(),
      };
      surfaceMap.set(source, item);
    }
    return item;
  };

  for (const row of rows) {
    if (!row.session_id) continue;
    setFor(row.event_name).add(row.session_id);

    const source = sourceOf(row);
    const surface = surfaceFor(source);
    let eventSessions = surface._sessions.get(row.event_name);
    if (!eventSessions) {
      eventSessions = new Set<string>();
      surface._sessions.set(row.event_name, eventSessions);
    }
    eventSessions.add(row.session_id);
  }

  for (const surface of surfaceMap.values()) {
    surface.authOpened = surface._sessions.get('auth_modal_opened')?.size ?? 0;
    surface.authCompleted = surface._sessions.get('auth_completed')?.size ?? 0;
    surface.registrations = surface._sessions.get('registration_session')?.size ?? 0;
    surface.playerStarts = surface._sessions.get('player_started')?.size ?? 0;
  }

  const visits = setFor('page_view').size;
  const authOpened = setFor('auth_modal_opened').size;
  const authCompleted = setFor('auth_completed').size;
  const registrations = setFor('registration_session').size;
  const onboardingCompleted = setFor('onboarding_completed').size;
  const animeOpen = setFor('anime_open').size;
  const playerStart = setFor('player_started').size;

  const rawStages = [
    ['visit', 'Visit', visits],
    ['auth_open', 'Auth opened', authOpened],
    ['auth_complete', 'Auth completed', authCompleted],
    ['anime_open', 'Anime opened', animeOpen],
    ['player_start', 'Player started', playerStart],
  ] as const;

  const funnel: ActivationStage[] = rawStages.map(([key, label, sessions], index) => {
    const previous = index > 0 ? rawStages[index - 1][2] : null;
    return {
      key,
      label,
      sessions,
      rateFromPrevious: previous == null ? null : pct(sessions, previous),
      rateFromVisits: pct(sessions, visits),
    };
  });

  return {
    rangeDays,
    generatedAt: new Date().toISOString(),
    dataSince: rows[0]?.created_at ?? null,
    sampledEvents: rows.length,
    truncated,
    kpis: {
      visitSessions: visits,
      authOpenedSessions: authOpened,
      authCompletedSessions: authCompleted,
      registrationSessions: registrations,
      onboardingCompletedSessions: onboardingCompleted,
      animeOpenSessions: animeOpen,
      playerStartSessions: playerStart,
      authCompletionRate: pct(authCompleted, authOpened),
      visitToPlayRate: pct(playerStart, visits),
    },
    funnel,
    surfaces: [...surfaceMap.values()]
      .map((surface) => ({
        source: surface.source,
        authOpened: surface.authOpened,
        authCompleted: surface.authCompleted,
        registrations: surface.registrations,
        playerStarts: surface.playerStarts,
      }))
      .sort((a, b) => b.authOpened - a.authOpened || b.playerStarts - a.playerStarts),
  };
}
