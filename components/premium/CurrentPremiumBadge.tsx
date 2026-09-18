'use client';

import { useEffect, useState } from 'react';

import { useAuthState } from '@/components/AuthStateProvider';
import { getPremiumMe } from '@/lib/entitlements-client';

export default function CurrentPremiumBadge() {
  const { user } = useAuthState();
  const [active, setActive] = useState(false);

  useEffect(() => {
    if (!user?.id) {
      setActive(false);
      return;
    }

    let mounted = true;
    const refresh = () => {
      void getPremiumMe({ force: true })
        .then((data) => {
          if (mounted) setActive(Boolean(data.entitlements.premiumBadge));
        })
        .catch(() => {
          if (mounted) setActive(false);
        });
    };

    refresh();
    window.addEventListener('animebox:entitlements-changed', refresh);
    return () => {
      mounted = false;
      window.removeEventListener('animebox:entitlements-changed', refresh);
    };
  }, [user?.id]);

  if (!active) return null;

  return (
    <span className="animebox-premium-badge" title="AnimeBox Premium">
      <img
        className="animebox-premium-badge__icon"
        src="/premium/premium-user.webp"
        alt=""
        aria-hidden="true"
      />
      Premium
    </span>
  );
}
