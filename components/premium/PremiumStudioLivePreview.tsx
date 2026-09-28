'use client';

import type { CSSProperties } from 'react';

import PremiumProfileAtmosphere from '@/components/premium/PremiumProfileAtmosphere';
import PremiumParticleLayer from '@/components/profile/PremiumParticleLayer';
import {
  premiumMediaStyle,
  premiumSceneContextSettings,
  premiumStudioCssVariables,
  type PremiumMediaTransform,
  type PremiumSceneContext,
  type PremiumStudioSettings,
} from '@/lib/premium-studio';

type PreviewContext = Extract<
  PremiumSceneContext,
  'profile' | 'mini' | 'comment' | 'watch-party'
>;

function PreviewAvatar({
  avatarUrl,
  avatarTransform,
  compact = false,
}: {
  avatarUrl: string | null;
  avatarTransform: PremiumMediaTransform;
  compact?: boolean;
}) {
  if (avatarUrl) {
    return (
      <img
        className={compact ? 'premium-studio-v23__context-avatar' : 'premium-studio-v12__preview-avatar'}
        src={avatarUrl}
        alt=""
        loading="eager"
        decoding="async"
        style={premiumMediaStyle(avatarTransform) as CSSProperties}
      />
    );
  }

  return (
    <span
      className={
        compact
          ? 'premium-studio-v23__context-avatar premium-studio-v23__context-avatar--placeholder'
          : 'premium-studio-v20__avatar-placeholder'
      }
      aria-hidden="true"
    >
      <svg viewBox="0 0 64 64" focusable="false">
        <circle cx="32" cy="24" r="10" />
        <path d="M14 54c2-12 9-18 18-18s16 6 18 18" />
        <path d="m48 14 2 5 5 2-5 2-2 5-2-5-5-2 5-2Z" />
      </svg>
    </span>
  );
}

export default function PremiumStudioLivePreview({
  settings,
  avatarUrl,
  bannerUrl,
  avatarTransform,
  bannerTransform,
  context = 'profile',
}: {
  settings: PremiumStudioSettings;
  avatarUrl: string | null;
  bannerUrl: string | null;
  avatarTransform: PremiumMediaTransform;
  bannerTransform: PremiumMediaTransform;
  context?: PreviewContext;
}) {
  const renderedSettings = premiumSceneContextSettings(settings, context);
  const cssVars = premiumStudioCssVariables(renderedSettings);

  const sceneProps = {
    className: `premium-studio-v12__preview premium-studio-v15__preview premium-studio-v21__preview premium-studio-v23__preview premium-studio-v23__preview--${context} border-${settings.borderStyle}`,
    style: cssVars as CSSProperties,
    'data-premium-atmosphere': renderedSettings.atmosphereEffect,
    'data-premium-motion': renderedSettings.motionMode,
    'data-premium-hero': settings.heroStyle,
    'data-premium-surface': settings.surfaceStyle,
    'data-premium-entrance': renderedSettings.entranceEffect,
    'data-premium-layout': settings.profileLayout,
    'data-preview-context': context,
  };

  if (context !== 'profile') {
    return (
      <section {...sceneProps}>
        <PremiumProfileAtmosphere
          effect={renderedSettings.atmosphereEffect}
          motion={renderedSettings.motionMode}
          variant="preview"
        />
        <PremiumParticleLayer
          effect={renderedSettings.particleEffect}
          className="premium-studio-v18__particle-layer"
        />

        <div className="premium-studio-v23__context-card">
          <PreviewAvatar
            avatarUrl={avatarUrl}
            avatarTransform={avatarTransform}
            compact
          />

          <div className="premium-studio-v23__context-copy">
            <div className="premium-studio-v23__context-name">
              <strong
                className="premium-profile-v21__nickname"
                data-effect={renderedSettings.nicknameEffect}
              >
                Твой профиль
              </strong>
              <span aria-label="AnimeBox Premium">✦</span>
            </div>

            {context === 'mini' && (
              <>
                <small>LEVEL 50 · PREMIUM SCENE</small>
                <p>Мини-профиль сохраняет характер сцены, но снижает интенсивность эффектов.</p>
                <div className="premium-studio-v23__context-tags">
                  <i>7 достижений</i>
                  <i>29ч просмотра</i>
                </div>
              </>
            )}

            {context === 'comment' && (
              <>
                <small>только что · 18 серия</small>
                <p>Очень сильная серия. Здесь Premium остаётся заметным, но не мешает читать обсуждение.</p>
              </>
            )}

            {context === 'watch-party' && (
              <>
                <small>WATCH TOGETHER · В КОМНАТЕ</small>
                <p>Тонкий accent, рамка и Premium-метка без эффектов поверх самого видео.</p>
                <div className="premium-studio-v23__room-status"><i /> В сети</div>
              </>
            )}
          </div>
        </div>
      </section>
    );
  }

  return (
    <section {...sceneProps}>
      <PremiumProfileAtmosphere
        effect={renderedSettings.atmosphereEffect}
        motion={renderedSettings.motionMode}
        variant="preview"
      />

      <PremiumParticleLayer
        effect={renderedSettings.particleEffect}
        className="premium-studio-v18__particle-layer"
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
        <PreviewAvatar
          avatarUrl={avatarUrl}
          avatarTransform={avatarTransform}
        />

        <div className="premium-studio-v15__preview-copy">
          <div className="premium-studio-v15__preview-badges">
            <span>ANIMEBOX PREMIUM</span>
            <small>{settings.profileLayout.toUpperCase()}</small>
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
            Profile Scene объединяет палитру, атмосферу, layout и эффекты в один
            стиль, который аккуратно переносится в социальные поверхности AnimeBox.
          </p>

          <div className="premium-studio-v15__preview-chips">
            <i>Profile Scene</i>
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
