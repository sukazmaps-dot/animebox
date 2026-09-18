'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';

import { useAuthState } from '@/components/AuthStateProvider';
import { getPremiumMe, peekPremiumMe } from '@/lib/entitlements-client';
import {
  getSponsorMe,
  peekSponsorMe,
  type SponsorMeData,
} from '@/lib/sponsor-me-client';
import { SPONSOR_META } from '@/lib/sponsor';

type MembershipState = {
  premium: boolean;
  premiumEndsAt: string | null;
  sponsor: SponsorMeData['sponsor'];
};

const EMPTY_STATE: MembershipState = {
  premium: false,
  premiumEndsAt: null,
  sponsor: null,
};

function formatShortDate(value: string | null) {
  if (!value) return null;

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  return new Intl.DateTimeFormat('ru-RU', {
    day: 'numeric',
    month: 'short',
  })
    .format(date)
    .replace('.', '');
}

export default function SidebarMembership() {
  const { user } = useAuthState();

  const cachedPremium = user?.id ? peekPremiumMe() : null;
  const cachedSponsor = user?.id ? peekSponsorMe(user.id, 1) : null;

  const [state, setState] = useState<MembershipState>(() => ({
    premium: Boolean(cachedPremium?.premium),
    premiumEndsAt: cachedPremium?.subscription?.endsAt ?? null,
    sponsor: cachedSponsor?.sponsor ?? null,
  }));

  useEffect(() => {
    if (!user?.id) {
      // Auth state is external state; reset the sidebar when the session ends.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setState(EMPTY_STATE);
      return;
    }

    let active = true;

    const applyCached = () => {
      const premium = peekPremiumMe();
      const sponsor = peekSponsorMe(user.id, 1);

      if (!premium && !sponsor) return;

      setState((current) => ({
        premium: premium ? Boolean(premium.premium) : current.premium,
        premiumEndsAt: premium
          ? premium.subscription?.endsAt ?? null
          : current.premiumEndsAt,
        sponsor: sponsor ? sponsor.sponsor : current.sponsor,
      }));
    };

    const refresh = () => {
      applyCached();

      void Promise.allSettled([
        getPremiumMe(),
        getSponsorMe(user.id, 1),
      ]).then(([premiumResult, sponsorResult]) => {
        if (!active) return;

        setState((current) => ({
          premium:
            premiumResult.status === 'fulfilled'
              ? Boolean(premiumResult.value.premium)
              : current.premium,
          premiumEndsAt:
            premiumResult.status === 'fulfilled'
              ? premiumResult.value.subscription?.endsAt ?? null
              : current.premiumEndsAt,
          sponsor:
            sponsorResult.status === 'fulfilled'
              ? sponsorResult.value.sponsor
              : current.sponsor,
        }));
      });
    };

    refresh();

    window.addEventListener('animebox:entitlements-changed', refresh);
    window.addEventListener('animebox:sponsor-preferences-changed', refresh);

    return () => {
      active = false;
      window.removeEventListener('animebox:entitlements-changed', refresh);
      window.removeEventListener('animebox:sponsor-preferences-changed', refresh);
    };
  }, [user?.id]);

  const premiumEndLabel = useMemo(
    () => formatShortDate(state.premiumEndsAt),
    [state.premiumEndsAt],
  );

  const sponsorLabel = state.sponsor
    ? SPONSOR_META[state.sponsor.tier].shortLabel
    : null;

  return (
    <Link
      href="/premium"
      className={`sidebar-membership ${state.premium ? 'is-active' : ''}`}
      aria-label={state.premium ? 'AnimeBox Premium активен' : 'Открыть AnimeBox Premium'}
    >
      <span className="sidebar-membership__icon" aria-hidden="true">
        ✦
      </span>

      <span className="sidebar-membership__copy">
        <strong>{state.premium ? 'Premium активен' : 'AnimeBox Premium'}</strong>
        <small>
          {state.premium
            ? premiumEndLabel
              ? `до ${premiumEndLabel}`
              : 'Подписка активна'
            : 'Без рекламы • бонусы'}
        </small>
      </span>

      {sponsorLabel && (
        <span className="sidebar-membership__status">{sponsorLabel}</span>
      )}
    </Link>
  );
}
