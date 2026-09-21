import { NextResponse } from 'next/server';

import { adminClient } from '@/lib/community-server';
import { processAutomaticProfileMediaReviews } from '@/lib/profile-media-auto-review-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const JOB_SECRET_NAME = 'animebox_profile_media_cron_secret';

async function authorized(request: Request) {
  const candidate = request.headers.get('x-animebox-job-secret')?.trim();
  if (!candidate) return false;

  const { data, error } = await adminClient().rpc('verify_internal_job_secret', {
    job_name: JOB_SECRET_NAME,
    candidate,
  });

  if (error) {
    console.error('[ProfileMediaAutoReview] secret verification failed:', error);
    return false;
  }

  return data === true;
}

export async function POST(request: Request) {
  if (!(await authorized(request))) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }

  try {
    const result = await processAutomaticProfileMediaReviews(4);
    return NextResponse.json(
      { ok: true, ...result },
      { headers: { 'Cache-Control': 'no-store, max-age=0' } },
    );
  } catch (error) {
    console.error('[ProfileMediaAutoReview] cron failed:', error);
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : 'profile_media_auto_review_failed',
      },
      { status: 500 },
    );
  }
}
