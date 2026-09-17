'use client';

import { useEffect, useState } from 'react';

import { useAuthState } from '@/components/AuthStateProvider';
import {
  getSponsorMe,
  peekSponsorMe,
} from '@/lib/sponsor-me-client';
import {
  AD_PROVIDER,
  ADS_ENABLED,
  MONETIZATION_ENABLED,
} from '@/lib/monetization';

type AdSlotProps = {
  placement: string;
  format?: 'horizontal' | 'rectangle' | 'native';
  className?: string;
};

/**
 * Provider-agnostic ad mount. Premium/Patron sponsors and staff do not render it.
 * No third-party provider script is injected here yet.
 */
export default function AdSlot({
  placement,
  format = 'horizontal',
  className = '',
}: AdSlotProps) {
  const { user } = useAuthState();
  const cached = peekSponsorMe(user?.id, 1);
  const [adFree, setAdFree] = useState(
    Boolean(cached?.benefits.adFree || cached?.role),
  );

  useEffect(() => {
    if (!user?.id) return;
    let active = true;

    const refresh = () => {
      void getSponsorMe(user.id, 1, { force: true })
        .then((data) => {
          if (active) setAdFree(Boolean(data.benefits.adFree || data.role));
        })
        .catch(() => {
          // Ads should not break the page when sponsor status is temporarily unavailable.
        });
    };

    void getSponsorMe(user.id, 1)
      .then((data) => {
        if (active) setAdFree(Boolean(data.benefits.adFree || data.role));
      })
      .catch(() => undefined);

    window.addEventListener('animebox:support-paid', refresh);
    return () => {
      active = false;
      window.removeEventListener('animebox:support-paid', refresh);
    };
  }, [user?.id]);

  if (!MONETIZATION_ENABLED || !ADS_ENABLED || adFree) {
    return null;
  }

  return (
    <aside
      className={`monetization-ad monetization-ad--${format} ${className}`.trim()}
      data-ad-placement={placement}
      data-ad-provider={AD_PROVIDER}
      aria-label="Реклама"
    >
      <span className="monetization-ad__label">Реклама</span>
      <div className="monetization-ad__mount" data-ad-mount={placement} />
    </aside>
  );
}
