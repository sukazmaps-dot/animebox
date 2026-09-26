'use client';

import type { CSSProperties } from 'react';

import PremiumProfileAtmosphere from '@/components/premium/PremiumProfileAtmosphere';
import {
  premiumMediaStyle,
  premiumStudioCssVariables,
  type PremiumMediaTransform,
  type PremiumStudioSettings,
} from '@/lib/premium-studio';

export default function PremiumStudioLivePreview({
  settings,
  avatarUrl,
  bannerUrl,
  avatarTransform,
  bannerTransform,
}: {
  settings: PremiumStudioSettings;
  avatarUrl: string | null;
  bannerUrl: string | null;
  avatarTransform: PremiumMediaTransform;
  bannerTransform: PremiumMediaTransform;
}) {
  const cssVars = premiumStudioCssVariables(settings);

  return (
    <section
      className={`premium-studio-v12__preview premium-studio-v15__preview premium-studio-v21__preview border-${settings.borderStyle}`}
      style={cssVars as CSSProperties}
      data-premium-atmosphere={settings.atmosphereEffect}
      data-premium-motion={settings.motionMode}
      data-premium-hero={settings.heroStyle}
      data-premium-surface={settings.surfaceStyle}
      data-premium-entrance={settings.entranceEffect}
    >
      <PremiumProfileAtmosphere
        effect={settings.atmosphereEffect}
        motion={settings.motionMode}
        variant="preview"
      />

      <div className="premium-studio-v12__preview-banner premium-studio-v15__preview-banner">
        {bannerUrl && (
          <img
            src={bannerUrl}
            alt=""
            aria-hidden="true"
            loading="eager"
            decoding="async"
            style={premiumMediaStyle(bannerTransform) as CSSProperties}
          />
        )}
        <div />
      </div>

      <div className="premium-studio-v12__preview-body premium-studio-v15__preview-body">
        {avatarUrl ? (
          <img
            className="premium-studio-v12__preview-avatar"
            src={avatarUrl}
            alt=""
            loading="eager"
            decoding="async"
            style={premiumMediaStyle(avatarTransform) as CSSProperties}
          />
        ) : (
          <span className="premium-studio-v20__avatar-placeholder" aria-hidden="true">
            <svg viewBox="0 0 64 64" focusable="false">
              <circle cx="32" cy="24" r="10" />
              <path d="M14 54c2-12 9-18 18-18s16 6 18 18" />
              <path d="m48 14 2 5 5 2-5 2-2 5-2-5-5-2 5-2Z" />
            </svg>
          </span>
        )}

        <div className="premium-studio-v15__preview-copy">
          <div className="premium-studio-v15__preview-badges">
            <span>ANIMEBOX PREMIUM</span>
            <small>ЖИВАЯ ТЕМА</small>
          </div>

          <h3>
            <span
              className="premium-profile-v21__nickname"
              data-effect={settings.nicknameEffect}
            >
              Твой профиль
            </span>
          </h3>

          <p>
            Палитра применяется ко всей странице профиля, а Smart Contrast не
            даёт тексту исчезнуть на похожем фоне.
          </p>

          <div className="premium-studio-v15__preview-chips">
            <i>Тема профиля</i>
            <i>Плеер {settings.syncPlayerTheme ? 'синхронизирован' : 'отдельно'}</i>
            <i>Свечение {settings.glowStrength}%</i>
          </div>

          <div className="premium-studio-v16__preview-stats">
            <span><b>29ч</b><small>просмотр</small></span>
            <span><b>51</b><small>серия</small></span>
            <span><b>7</b><small>в списках</small></span>
          </div>

          <div className="premium-studio-v16__preview-library">
            <i />
            <span>
              <strong>Продолжить просмотр</strong>
              <small>Последний тайтл · 18 серия</small>
            </span>
            <b>→</b>
          </div>
        </div>

        <button type="button">Акцентная кнопка</button>
        <div className="premium-studio-v12__fake-progress"><span /></div>
      </div>
    </section>
  );
}
