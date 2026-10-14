import { requireAdmin } from '@/lib/admin-server';
import { adminClient, failure } from '@/lib/community-server';
import { closedLeaderboardPeriods } from '@/lib/leaderboard-periods';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    await requireAdmin(['owner', 'admin']);
    const admin = adminClient();
    const [health, seasons, job] = await Promise.all([
      admin.rpc('leaderboard_data_health'),
      admin.from('leaderboard_seasons').select('id,period_type,period_key,starts_at,ends_at,archive_status,calculation_version').order('ends_at', { ascending: false }).limit(1000),
      admin.from('system_job_runs').select('status,started_at,error_code,summary').eq('job_key', 'leaderboard-seasons').order('started_at', { ascending: false }).limit(1),
    ]);
    if (health.error) throw health.error;
    if (seasons.error) throw seasons.error;
    if (job.error) throw job.error;
    const rows = seasons.data ?? [];
    const first = rows.reduce((value, row) => row.starts_at < value ? row.starts_at : value, String(health.data?.coveredFrom));
    const periods = closedLeaderboardPeriods(new Date(first), new Date());
    const known = new Set(rows.map(row => `${row.period_type}:${row.period_key}`));
    const missing = periods.filter(p => !known.has(`${p.periodType}:${p.periodKey}`));
    const key = new URL(request.url).searchParams.get('preview');
    let preview = null;
    if (key) {
      const period = periods.find(p => `${p.periodType}:${p.periodKey}` === key);
      if (!period) return Response.json({ error: 'invalid_period' }, { status: 400, headers: { 'Cache-Control': 'private, no-store' } });
      const result = await admin.rpc('leaderboard_archive_preview', { p_starts_at: period.startsAt, p_ends_at: period.endsAt });
      if (result.error) throw result.error;
      preview = result.data;
    }
    return Response.json({ health: health.data, lastJob: job.data?.[0] ?? null, missing,
      partial: rows.filter(row => row.archive_status === 'partial'), periods, preview },
    { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) { return failure(error); }
}
