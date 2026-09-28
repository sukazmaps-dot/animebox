'use client';

import type { CSSProperties } from 'react';

import PremiumProfileAtmosphere from '@/components/premium/PremiumProfileAtmosphere';
import PremiumParticleLayer from '@/components/profile/PremiumParticleLayer';
import ProfileFrameOverlay from '@/components/profile/ProfileFrameOverlay';
import {
  premiumBannerStyle,
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
  profileFrameKey = null,
  premiumFrameMotion = false,
  compact = false,
}: {
  avatarUrl: string | null;
  avatarTransform: PremiumMediaTransform;
  profileFrameKey?: string | null;
  premiumFrameMotion?: boolean;
  compact?: boolean;
}) {
  const imageClass = compact
    ? 'premium-studio-v23__context-avatar'
    : 'premium-studio-v12__preview-avatar';

  const avatar = avatarUrl ? (
    <img
      className={imageClass}
      src={avatarUrl}
      alt=""
      loading="eager"
      decoding="async"
      style={premiumMediaStyle(avatarTransform) as CSSProperties}
    />
  ) : (
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

  if (!profileFrameKey) return avatar;

  return (
    <span
      className="premium-studio-v23__preview-avatar-frame-shell"
      data-compact={compact ? 'true' : 'false'}
    >
      {avatar}
      <ProfileFrameOverlay
        frameKey={profileFrameKey}
        premium={premiumFrameMotion}
        className="premium-studio-v23__preview-avatar-frame"
      />
    </span>
  );
}

export default function PremiumStudioLivePreview({
  settings,
  avatarUrl,
  bannerUrl,
  avatarTransform,
  bannerTransform,
  username = 'Твой профиль',
  bio = 'Расскажи немного о себе и своих любимых аниме.',
  profileFrameKey = null,
  context = 'profile',
}: {
  settings: PremiumStudioSettings;
  avatarUrl: string | null;
  bannerUrl: string | null;
  avatarTransform: PremiumMediaTransform;
  bannerTransform: PremiumMediaTransform;
  username?: string;
  bio?: string;
  profileFrameKey?: string | null;
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
    'data-premium-banner-height': settings.bannerHeightMode,
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
            profileFrameKey={profileFrameKey}
            premiumFrameMotion={renderedSettings.motionMode !== 'off'}
            compact
          />

          <div className="premium-studio-v23__context-copy">
            <div className="premium-studio-v23__context-name">
              <strong
                className="premium-profile-v21__nickname"
                data-effect={renderedSettings.nicknameEffect}
              >
                {username}
              </strong>
              <span aria-label="AnimeBox Premium">✦</span>
            </div>

            {context === 'mini' && (
              <>
                <small>50 УРОВЕНЬ · PREMIUM</small>
                <p>Мини-профиль показывает тот же стиль, только спокойнее и компактнее.</p>
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
                <small>СОВМЕСТНЫЙ ПРОСМОТР</small>
                <p>В комнате остаются только лёгкий акцент, рамка и Premium-метка — видео ничего не перекрывает.</p>
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
            style={
              premiumBannerStyle(settings, bannerTransform) as CSSProperties
            }
          />
        )}
        <div />
      </div>

      <div className="premium-studio-v12__preview-body premium-studio-v15__preview-body">
        <PreviewAvatar
          avatarUrl={avatarUrl}
          avatarTransform={avatarTransform}
          profileFrameKey={profileFrameKey}
          premiumFrameMotion={renderedSettings.motionMode !== 'off'}
        />

        <div className="premium-studio-v15__preview-copy">
          <div className="premium-studio-v15__preview-badges">
            <span>ANIMEBOX PREMIUM</span>
            <small>{{
              classic: 'КЛАССИКА',
              cinema: 'КИНО',
              collector: 'КОЛЛЕКЦИОНЕР',
              minimal: 'МИНИМАЛИЗМ',
            }[settings.profileLayout]}</small>
          </div>

          <h3>
            <span
              className="premium-profile-v21__nickname"
              data-effect={settings.nicknameEffect}
            >
              {username}
            </span>
          </h3>

          <p>{bio.trim() || 'Расскажи немного о себе и своих любимых аниме.'}</p>

          <div className="premium-studio-v15__preview-chips">
            <i>Оформление профиля</i>
            <i>Плеер {settings.syncPlayerTheme ? 'в том же стиле' : 'оформлен отдельно'}</i>
            <i>Свечение {settings.glowStrength}%</i>
          </div>

          <div className="premium-studio-v23__preview-meta">
            <span>В AnimeBox с недавнего времени</span>
            <span>Аккаунт активен</span>
          </div>
        </div>

        <button type="button">Редактировать профиль</button>
        <div className="premium-studio-v12__fake-progress"><span /></div>
      </div>
    </section>
  );
}
