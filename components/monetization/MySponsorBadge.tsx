'use client';

import { useEffect, useState } from 'react';

import SponsorBadge from '@/components/monetization/SponsorBadge';
import type { SponsorStatus } from '@/lib/sponsor';

export default function MySponsorBadge() {
  const [sponsor, setSponsor] = useState<SponsorStatus | null>(null);

  useEffect(() => {
    const controller = new AbortController();

    fetch('/api/monetization/sponsor/me', {
      cache: 'no-store',
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) return null;
        const data = (await response.json()) as {
          sponsor?: SponsorStatus | null;
        };
        return data.sponsor ?? null;
      })
      .then((status) => setSponsor(status))
      .catch((error) => {
        if (error instanceof DOMException && error.name === 'AbortError') return;
        console.error('[Sponsor] failed to load my badge:', error);
      });

    return () => controller.abort();
  }, []);

  return sponsor ? <SponsorBadge tier={sponsor.tier} /> : null;
}
