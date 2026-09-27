import 'server-only';

import { adminClient } from '@/lib/community-server';

type TrustState = 'normal' | 'suspicious' | 'high_risk';

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function trustState(metadata: unknown): TrustState | null {
  const state = asRecord(metadata)?.state;
  return state === 'normal' || state === 'suspicious' || state === 'high_risk'
    ? state
    : null;
}

function signalCodes(metadata: unknown) {
  const raw = asRecord(metadata)?.signal_codes;
  return Array.isArray(raw)
    ? raw.filter((value): value is string => typeof value === 'string')
    : [];
}

export async function getWatchTrustAdminSnapshot() {
  const admin = adminClient();
  const since7d = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  const { data, error } = await admin
    .from('product_events')
    .select('user_id,session_id,metadata,created_at')
    .eq('event_name', 'watch_trust_assessed')
    .gte('created_at', since7d)
    .order('created_at', { ascending: false })
    .limit(2_000);

  if (error) throw error;

  const rows = data ?? [];
  const stateCounts: Record<TrustState, number> = {
    normal: 0,
    suspicious: 0,
    high_risk: 0,
  };
  const signalCounts = new Map<string, number>();
  const recentHighRisk: Array<{
    userId: string | null;
    sessionId: string | null;
    score: number;
    phase: string | null;
    signals: string[];
    createdAt: string;
  }> = [];

  for (const row of rows) {
    const metadata = asRecord(row.metadata);
    const state = trustState(row.metadata);
    if (state) stateCounts[state] += 1;

    const signals = signalCodes(row.metadata);
    for (const code of signals) {
      signalCounts.set(code, (signalCounts.get(code) ?? 0) + 1);
    }

    if (state === 'high_risk' && recentHighRisk.length < 30) {
      recentHighRisk.push({
        userId: typeof row.user_id === 'string' ? row.user_id : null,
        sessionId:
          typeof row.session_id === 'string' ? row.session_id : null,
        score: Math.max(0, Math.min(100, Number(metadata?.score ?? 0))),
        phase: typeof metadata?.phase === 'string' ? metadata.phase : null,
        signals,
        createdAt: String(row.created_at),
      });
    }
  }

  return {
    generatedAt: new Date().toISOString(),
    window: '7d',
    assessments: rows.length,
    states: stateCounts,
    highRiskRate:
      rows.length > 0 ? stateCounts.high_risk / rows.length : 0,
    topSignals: [...signalCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 12)
      .map(([code, count]) => ({ code, count })),
    recentHighRisk,
  };
}
