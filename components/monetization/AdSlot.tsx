'use client';

import Link from 'next/link';
import AdsterraNativeBanner from '@/components/monetization/AdsterraNativeBanner';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { useAuthState } from '@/components/AuthStateProvider';
import {
  getSponsorMe,
  peekSponsorMe,
} from '@/lib/sponsor-me-client';
import {
  AD_PLACEMENT_DEFINITIONS,
  type AdPlacement,
  type AdFormat,
  type AdRuntimeConfig,
} from '@/lib/ads';
import {
  clearAdConfigCache,
  getAdRuntimeConfig,
  reserveAdExposure,
} from '@/lib/ads-client';
import {
  AD_PROVIDER,
  ADS_ENABLED,
  MONETIZATION_ENABLED,
} from '@/lib/monetization';

type AdSlotProps = {
  placement: AdPlacement;
  format?: AdFormat;
  className?: string;
};

/**
 * Provider-agnostic ad mount.
 *
 * Rules:
 * - never renders for sponsor/staff accounts with the adFree entitlement;
 * - obeys runtime placement switches from /admin/ads;
 * - reserves only a small number of ad exposures per browser session;
 * - applies a global cooldown between ad blocks;
 * - provider=none renders nothing, so enabling the ad system before a provider
 *   is connected never creates empty holes in the UI.
 */
export default function AdSlot({
  placement,
  format,
  className = '',
}: AdSlotProps) {
  const { user, loading: authLoading } = useAuthState();
  const cached = useMemo(() => peekSponsorMe(user?.id, 1), [user?.id]);
  const [adFree, setAdFree] = useState(
    Boolean(cached?.benefits.adFree || cached?.role),
  );
  const [sponsorResolved, setSponsorResolved] = useState(
    !user?.id || Boolean(cached),
  );
  const [config, setConfig] = useState<AdRuntimeConfig | null>(null);
  const [reserved, setReserved] = useState(false);
  const [providerFailed, setProviderFailed] = useState(false);

  const resolvedFormat = format ?? AD_PLACEMENT_DEFINITIONS[placement].format;
  const handleProviderError = useCallback(() => setProviderFailed(true), []);

  useEffect(() => {
    let active = true;

    if (!user?.id) {
      queueMicrotask(() => {
        if (!active) return;
        setAdFree(false);
        setSponsorResolved(true);
      });
      return () => {
        active = false;
      };
    }

    const currentCached = peekSponsorMe(user.id, 1);

    if (currentCached) {
      queueMicrotask(() => {
        if (!active) return;
        setAdFree(Boolean(currentCached.benefits.adFree || currentCached.role));
        setSponsorResolved(true);
      });
    } else {
      queueMicrotask(() => {
        if (active) setSponsorResolved(false);
      });
    }

    const refresh = (force = false) => {
      void getSponsorMe(user.id, 1, { force })
        .then((data) => {
          if (!active) return;
          setAdFree(Boolean(data.benefits.adFree || data.role));
          setSponsorResolved(true);
        })
        .catch(() => {
          if (!active) return;
          // Fail closed for logged-in users: if sponsor entitlement cannot be
          // verified, prefer hiding ads over accidentally showing them to a
          // paid/ad-free account.
          setAdFree(true);
          setSponsorResolved(true);
        });
    };

    refresh(false);

    const onSupportPaid = () => refresh(true);
    window.addEventListener('animebox:support-paid', onSupportPaid);
    return () => {
      active = false;
      window.removeEventListener('animebox:support-paid', onSupportPaid);
    };
  }, [user?.id]);

  useEffect(() => {
    let active = true;

    void getAdRuntimeConfig()
      .then((next) => {
        if (active) setConfig(next);
      })
      .catch(() => {
        if (active) setConfig(null);
      });

    const refresh = () => {
      clearAdConfigCache();
      setReserved(false);
      setProviderFailed(false);
      void getAdRuntimeConfig({ force: true })
        .then((next) => {
          if (active) setConfig(next);
        })
        .catch(() => undefined);
    };

    window.addEventListener('animebox:ads-config-updated', refresh);
    return () => {
      active = false;
      window.removeEventListener('animebox:ads-config-updated', refresh);
    };
  }, []);

  const eligible = Boolean(
    MONETIZATION_ENABLED &&
      ADS_ENABLED &&
      AD_PROVIDER !== 'none' &&
      config?.enabled &&
      config.provider !== 'none' &&
      config.placements[placement] &&
      !authLoading &&
      sponsorResolved &&
      !adFree,
  );

  useEffect(() => {
    if (!eligible || !config || reserved) return;
    const allowed = reserveAdExposure(placement, config);
    if (!allowed) return;
    queueMicrotask(() => setReserved(true));
  }, [config, eligible, placement, reserved]);

  if (!eligible || !reserved || !config || providerFailed) return null;

  return (
    <aside
      className={`monetization-ad monetization-ad--${resolvedFormat} ${className}`.trim()}
      data-ad-placement={placement}
      data-ad-provider={config.provider}
      aria-label="Реклама"
    >
      <span className="monetization-ad__label">Реклама</span>

      {config.provider === 'house' ? (
        <Link className="monetization-ad__house" href="/support">
          <span>AnimeBox</span>
          <strong>Помоги проекту расти без навязчивой рекламы</strong>
          <small>Поддержка проекта отключает наши рекламные блоки на подходящих уровнях.</small>
          <b>Поддержать →</b>
        </Link>
      ) : config.provider === 'adsterra' ? (
        <div
          className="monetization-ad__mount monetization-ad__mount--adsterra"
          data-ad-mount={placement}
          data-ad-format={resolvedFormat}
        >
          <AdsterraNativeBanner onError={handleProviderError} />
        </div>
      ) : (
        <div
          className="monetization-ad__mount"
          data-ad-mount={placement}
          data-ad-format={resolvedFormat}
        />
      )}
    </aside>
  );
}
