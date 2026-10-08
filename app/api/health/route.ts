import { deploymentRelease } from '@/lib/deployment-readiness';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export function GET() {
  return Response.json({ ok: true, status: 'alive', release: deploymentRelease() }, {
    headers: { 'Cache-Control': 'private, no-store' },
  });
}
