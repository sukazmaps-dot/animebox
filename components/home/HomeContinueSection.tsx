'use client';

import HomeContinueWatching from '@/components/HomeContinueWatching';
import { useHomeFeedRuntime } from '@/components/home/HomeFeedRuntimeProvider';

/** No separate request: reuse the already hydrated home feed state. */
export default function HomeContinueSection() {
  const { continueWatchingItems } = useHomeFeedRuntime();
  return <HomeContinueWatching items={continueWatchingItems} />;
}
