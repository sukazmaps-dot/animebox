import { deploymentReady, deploymentRelease } from '@/lib/deployment-readiness';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export function GET() {
  const ok = deploymentReady();
  return Response.json({ ok, status: ok ? 'ready' : 'not_ready', release: deploymentRelease() }, {
    status: ok ? 200 : 503,
    headers: { 'Cache-Control': 'private, no-store' },
  });
}
