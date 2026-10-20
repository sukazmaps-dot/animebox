'use client';

import { useReportWebVitals } from 'next/web-vitals';

import { performanceRouteGroup, safeFieldVital } from '@/lib/field-vitals';
import { trackProductClientEvent } from '@/lib/product-events-client';

// First-party, deliberately tiny sample. Never create a telemetry request on
// every page load, and never block paint, input, auth or player progress.
const SAMPLE_RATE = 0.02;
let sampleDecision: boolean | null = null;
const reported = new Set<string>();

type FieldMetric = {
  id: string;
  name: string;
  value: number;
  rating?: string;
  navigationType?: string;
};

function report(metric: FieldMetric) {
  if (process.env.NODE_ENV !== 'production' || typeof window === 'undefined') return;
  if (sampleDecision === null) sampleDecision = Math.random() < SAMPLE_RATE;
  if (!sampleDecision) return;

  const route = performanceRouteGroup(window.location.pathname);
  const sanitized = safeFieldVital(metric);
  if (!route || !sanitized || !metric.id || reported.has(metric.id)) return;

  // Core Web Vitals can update as more events arrive. This sample records
  // the first report for each metric ID, so diagnostics should be interpreted
  // as a sampled signal, not an exhaustive final-vitals dataset.
  reported.add(metric.id);
  if (reported.size > 256) reported.clear();
  try {
    trackProductClientEvent('field_web_vital', {
      source: 'field_performance',
      path: route,
      metadata: {
        ...sanitized,
        viewport: window.innerWidth < 768 ? 'mobile' : 'desktop',
        runtime: window.matchMedia('(display-mode: standalone)').matches
          ? 'standalone'
          : 'browser',
        sample_rate: SAMPLE_RATE,
      },
    });
  } catch {
    // Analytics is never permitted to affect the user's experience.
  }
}

export default function FieldWebVitals() {
  useReportWebVitals(report);
  return null;
}
