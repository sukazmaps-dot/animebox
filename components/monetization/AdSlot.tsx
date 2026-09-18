'use client';

import Link from 'next/link';
import AdsterraNativeBanner from '@/components/monetization/AdsterraNativeBanner';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

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
  beginAdExposure,
  clearAdConfigCache,
  commitAdExposure,
  getAdRuntimeConfig,
  releaseAdExposure,
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
 * UX rules:
 * - never renders for sponsor/staff accounts with the adFree entitlement;
 * - lazily starts the provider only when the slot is approaching the viewport;
 * - counts a session impression only after the provider actually rendered;
 * - no-fill / ad-block failures do not consume the cap or cooldown;
 * - the same placement is shown at most once per browser session;
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
  const slotRef = useRef<HTMLDivElement>(null);

  const [adFree, setAdFree] = useState(
    Boolean(cached?.benefits.adFree || cached?.role),
  );
  const [sponsorResolved, setSponsorResolved] = useState(
    !user?.id || Boolean(cached),
  );
  const [config, setConfig] = useState<AdRuntimeConfig | null>(null);
  const [nearViewport, setNearViewport] = useState(false);
  const [reserved, setReserved] = useState(false);
  const [rendered, setRendered] = useState(false);
  const [providerFailed, setProviderFailed] = useState(false);

  const resolvedFormat = format ?? AD_PLACEMENT_DEFINITIONS[placement].format;

  const handleProviderReady = useCallback(() => {
    commitAdExposure(placement);
    setRendered(true);
    setProviderFailed(false);
  }, [placement]);

  const handleProviderError = useCallback(() => {
    releaseAdExposure(placement);
    setReserved(false);
    setRendered(false);
    setProviderFailed(true);
  }, [placement]);

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
      releaseAdExposure(placement);
      setNearViewport(false);
      setReserved(false);
      setRendered(false);
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
  }, [placement]);

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
    if (!eligible || nearViewport || providerFailed) return;
    const node = slotRef.current;
    if (!node) return;

    if (typeof IntersectionObserver === 'undefined') {
      queueMicrotask(() => setNearViewport(true));
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        setNearViewport(true);
        observer.disconnect();
      },
      {
        // Start loading before the slot becomes visible so the third-party
        // widget is usually ready by the time the user reaches it.
        rootMargin: '650px 0px',
        threshold: 0.01,
      },
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, [eligible, nearViewport, providerFailed]);

  useEffect(() => {
    if (!eligible || !nearViewport || !config || reserved || providerFailed) return;
    const allowed = beginAdExposure(placement, config);
    if (!allowed) return;
    queueMicrotask(() => setReserved(true));
  }, [config, eligible, nearViewport, placement, providerFailed, reserved]);

  useEffect(() => {
    if (!reserved || rendered || config?.provider !== 'house') return;
    queueMicrotask(() => handleProviderReady());
  }, [config?.provider, handleProviderReady, rendered, reserved]);

  useEffect(() => {
    return () => {
      if (reserved && !rendered) releaseAdExposure(placement);
    };
  }, [placement, rendered, reserved]);

  const shouldRenderProvider = Boolean(
    eligible &&
      reserved &&
      config &&
      !providerFailed &&
      (config.provider === 'house' || config.provider === 'adsterra'),
  );

  return (
    <div
      ref={slotRef}
      className={`monetization-ad-slot ${rendered ? 'is-rendered' : ''} ${reserved ? 'is-loading' : ''}`.trim()}
      data-ad-slot={placement}
      data-ad-state={providerFailed ? 'failed' : rendered ? 'rendered' : reserved ? 'loading' : 'idle'}
    >
      {shouldRenderProvider && config ? (
        <aside
          className={`monetization-ad monetization-ad--${resolvedFormat} ${className}`.trim()}
          data-ad-placement={placement}
          data-ad-provider={config.provider}
          aria-label="Реклама"
          aria-busy={!rendered}
        >
          {rendered && (
            <div className="monetization-ad__meta" aria-hidden="true">
              <span>Реклама</span>
              <small>Партнёрский блок</small>
            </div>
          )}

          <div className="monetization-ad__surface">
            {config.provider === 'house' ? (
              <Link className="monetization-ad__house" href="/support">
                <span>AnimeBox</span>
                <strong>Помоги проекту расти без навязчивой рекламы</strong>
                <small>Поддержка проекта отключает наши рекламные блоки на подходящих уровнях.</small>
                <b>Поддержать →</b>
              </Link>
            ) : (
              <div
                className="monetization-ad__mount monetization-ad__mount--adsterra"
                data-ad-mount={placement}
                data-ad-format={resolvedFormat}
              >
                <AdsterraNativeBanner
                  onReady={handleProviderReady}
                  onError={handleProviderError}
                />
              </div>
            )}
          </div>
        </aside>
      ) : null}
    </div>
  );
}
