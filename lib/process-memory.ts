import type { SystemProcessMemoryHealth } from '@/lib/system-health';

function safeInteger(value: number) {
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
}

/**
 * A point-in-time view of this Node.js process.
 * RSS is not additive with heap/external values; arrayBuffers is included in external.
 */
export function getProcessMemorySnapshot(): SystemProcessMemoryHealth {
  const usage = process.memoryUsage();

  return {
    sampledAt: new Date().toISOString(),
    uptimeSeconds: safeInteger(process.uptime()),
    rssBytes: safeInteger(usage.rss),
    heapTotalBytes: safeInteger(usage.heapTotal),
    heapUsedBytes: safeInteger(usage.heapUsed),
    externalBytes: safeInteger(usage.external),
    arrayBuffersBytes: safeInteger(usage.arrayBuffers),
  };
}
