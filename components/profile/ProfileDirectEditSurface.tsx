'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

import Icon from '@/components/Icon';
import ProfileFrameOverlay from '@/components/profile/ProfileFrameOverlay';
import BannerColorSheet from '@/components/profile/BannerColorSheet';
import type { ProfileEditorSection } from '@/components/profile/ProfileEditorLivePreview';
import { BANNER_COLOR_PRESETS, bannerStyleBackground, visibleBannerStyle, type BannerStyle } from '@/lib/profile-banner-style';
import { isLevelFrameKey, levelFrameAvatarScale, levelFrameLabel, LEVEL_MILESTONES, type LevelFrameKey } from '@/lib/progression';

import styles from './ProfileDirectEditSurface.module.css';

type InspectorTarget = 'avatar' | 'banner' | 'username' | 'bio';
type FrameFilter = 'all' | 'level' | 'league';

type LeagueFrame = {
  key: string;
  label: string;
  expiresAt?: string | null;
};

type FramePayload = {
  selectedFrame?: string | null;
  unlockedLevelFrames?: LevelFrameKey[];
  unlockedFrames?: LeagueFrame[];
  error?: string;
};

type Props = {
  section?: ProfileEditorSection;
  showPreview?: boolean;
  onSectionChange?: (section: ProfileEditorSection) => void;
  onFrameChange?: (frame: string | null) => void;
  onFrameLoaded?: (frame: string | null) => void;
  selectedFrameDraft?: string | null;
  username: string;
  bio: string;
  avatarUrl: string;
  bannerUrl: string | null;
  baseAvatarUrl: string;
  baseBannerUrl: string | null;
  bannerColor?: string;
  bannerColorMode?: 'auto' | 'manual';
  bannerStyle?: BannerStyle;
  onBannerStyleChange?: (style: BannerStyle) => void;
  onBannerColorChange?: (color: string, mode: 'auto' | 'manual', skipSampling?: boolean) => void | Promise<void>;
  premiumActive: boolean;
  avatarPremiumOverride: boolean;
  bannerPremiumOverride: boolean;
  avatarBusy: boolean;
  bannerBusy: boolean;
  canRemoveAvatar: boolean;
  canRemoveBanner: boolean;
  error?: string;
  message?: string;
  onUsernameChange: (value: string) => void;
  onBioChange: (value: string) => void;
  onAvatarFile: (file?: File) => void | Promise<void>;
  onBannerFile: (file?: File) => void | Promise<void>;
  onRemoveAvatar: () => void;
  onRemoveBanner: () => void;
  onUseBaseAvatar: () => void | Promise<void>;
  onUseBaseBanner: () => void | Promise<void>;
  onOpenPremium: () => void;
};

const MEDIA_ACCEPT =
  'image/jpeg,image/jpg,image/png,image/webp,image/avif,image/heic,image/heif,.jpg,.jpeg,.png,.webp,.avif,.heic,.heif';

function frameDisplayName(frame: string | null | undefined, league: LeagueFrame[]) {
  if (!frame) return 'Без рамки';
  if (isLevelFrameKey(frame)) return levelFrameLabel(frame);
  return league.find((item) => item.key === frame)?.label ?? 'Лиговая рамка';
}

function formatExpiry(value?: string | null) {
  if (!value) return null;
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return null;
  return new Intl.DateTimeFormat('ru-RU', {
    day: '2-digit',
    month: 'short',
  }).format(date);
}

export default function ProfileDirectEditSurface({
  section = 'profile',
  showPreview = true,
  onSectionChange,
  onFrameChange,
  onFrameLoaded,
  selectedFrameDraft,
  username,
  bio,
  avatarUrl,
  bannerUrl,
  baseAvatarUrl,
  baseBannerUrl,
  bannerColor = '#70618c',
  bannerColorMode = 'auto',
  bannerStyle = 'soft',
  onBannerStyleChange,
  onBannerColorChange,
  premiumActive,
  avatarPremiumOverride,
  bannerPremiumOverride,
  avatarBusy,
  bannerBusy,
  canRemoveAvatar,
  canRemoveBanner,
  error = '',
  message = '',
  onUsernameChange,
  onBioChange,
  onAvatarFile,
  onBannerFile,
  onRemoveAvatar,
  onRemoveBanner,
  onUseBaseAvatar,
  onUseBaseBanner,
  onOpenPremium,
}: Props) {
  const [profileField, setProfileField] = useState<'username'|'bio'>('username');
  const target: InspectorTarget = section === 'profile' ? profileField : section === 'banner' ? 'banner' : 'avatar';
  const [bannerEditorMode, setBannerEditorMode] = useState<'color' | 'image'>('color');
  const [sheetStart, setSheetStart] = useState<{color:string;mode:'auto'|'manual'}|null>(null);
  const [editingName, setEditingName] = useState(false);
  const [editingBio, setEditingBio] = useState(false);
  const [frameFilter, setFrameFilter] = useState<FrameFilter>('all');
  const [frames, setFrames] = useState<FramePayload | null>(null);
  const [frameLoading, setFrameLoading] = useState(true);
  const [frameError, setFrameError] = useState('');
  const inspectorRef = useRef<HTMLElement | null>(null);
  const avatarInputRef = useRef<HTMLInputElement | null>(null);
  const bannerInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    let active = true;

    const load = () => {
      setFrameLoading(true);
      void fetch('/api/community/leaderboard-rewards', { cache: 'no-store' })
        .then(async (response) => {
          const payload = await response.json() as FramePayload;
          if (!response.ok) throw new Error(payload.error || 'Не удалось загрузить рамки.');
          if (active) {
            setFrames(payload);
            onFrameLoaded?.(payload.selectedFrame ?? null);
            setFrameError('');
          }
        })
        .catch((loadError) => {
          if (active) {
            setFrameError(
              loadError instanceof Error ? loadError.message : 'Не удалось загрузить рамки.',
            );
          }
        })
        .finally(() => {
          if (active) setFrameLoading(false);
        });
    };

    load();
    window.addEventListener('animebox:profile-cosmetic-changed', load);
    window.addEventListener('animebox:leaderboard-reward-claimed', load);

    return () => {
      active = false;
      window.removeEventListener('animebox:profile-cosmetic-changed', load);
      window.removeEventListener('animebox:leaderboard-reward-claimed', load);
    };
  }, []);

  function selectFrame(frameKey: string | null) {
    // Stage selection locally; common Save/Cancel dock owns persistence.
    setFrameError('');
    setFrames(current => ({ ...(current ?? {}), selectedFrame: frameKey }));
    onFrameChange?.(frameKey);
  }

  const leagueFrames = frames?.unlockedFrames ?? [];
  const levelFrames = frames?.unlockedLevelFrames ?? [];
  const selectedFrame = selectedFrameDraft === undefined ? frames?.selectedFrame ?? null : selectedFrameDraft;
  const ownedFrames = useMemo(() => {
    const level = levelFrames.map((key) => ({
      key,
      label: levelFrameLabel(key),
      kind: 'level' as const,
      expiresAt: null,
    }));
    const league = leagueFrames.map((item) => ({
      key: item.key,
      label: item.label,
      kind: 'league' as const,
      expiresAt: item.expiresAt ?? null,
    }));

    return [...level, ...league].filter((item) => {
      if (frameFilter === 'level') return item.kind === 'level';
      if (frameFilter === 'league') return item.kind === 'league';
      return true;
    });
  }, [frameFilter, leagueFrames, levelFrames]);

  const nextLockedLevelFrames = useMemo(() => {
    const unlocked = new Set(levelFrames);
    return LEVEL_MILESTONES
      .filter((item) => item.frameKey && !unlocked.has(item.frameKey))
      .slice(0, 2);
  }, [levelFrames]);

  const activeFrameLabel = frameDisplayName(selectedFrame, leagueFrames);
  const selectedMilestoneScale = levelFrameAvatarScale(selectedFrame);
  const editorMilestoneScale = selectedMilestoneScale
    ? Math.min(0.72, selectedMilestoneScale + 0.14)
    : null;

  function openBannerColorEditor() {
    onSectionChange?.('banner');
    setBannerEditorMode('color');
    if (window.matchMedia('(max-width: 768px)').matches) {
      window.requestAnimationFrame(() => {
        inspectorRef.current?.scrollIntoView({
          behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
          block: 'start',
        });
      });
    }
  }

  function openMediaPicker(kind: 'avatar' | 'banner') {
    if (kind === 'avatar') {
      onSectionChange?.('avatar');
      avatarInputRef.current?.click();
      return;
    }

    onSectionChange?.('banner');
    if (premiumActive) bannerInputRef.current?.click();
  }

  function handleMediaInput(kind: 'avatar' | 'banner', input: HTMLInputElement) {
    const file = input.files?.[0];
    const action = kind === 'avatar' ? onAvatarFile : onBannerFile;

    void Promise.resolve(action(file)).finally(() => {
      input.value = '';
    });
  }

  function openUsername() {
    setProfileField('username'); onSectionChange?.('profile');
    setEditingName(true);
  }

  function openBio() {
    setProfileField('bio'); onSectionChange?.('profile');
    setEditingBio(true);
  }

  return (
    <div className={styles.workspace} data-settings-only={showPreview ? 'false' : 'true'}>
      <input
        ref={avatarInputRef}
        className={styles.hiddenMediaInput}
        type="file"
        tabIndex={-1}
        aria-hidden="true"
        accept={MEDIA_ACCEPT}
        onChange={(event) => handleMediaInput('avatar', event.currentTarget)}
      />
      <input
        ref={bannerInputRef}
        className={styles.hiddenMediaInput}
        type="file"
        tabIndex={-1}
        aria-hidden="true"
        accept={MEDIA_ACCEPT}
        onChange={(event) => handleMediaInput('banner', event.currentTarget)}
      />
      {showPreview && <section className={styles.canvas}>
        <div className={styles.canvasHead}>
          <div>
            <span>ПРОФИЛЬ</span>
            <h2>Настраивай профиль прямо здесь</h2>
            <p>Нажми на аватар или баннер, чтобы изменить оформление. Имя и описание можно менять прямо на карточке.</p>
          </div>
          <div className={styles.liveBadge}><span /> СРАЗУ</div>
        </div>

        <article className={styles.profileCard}>
          <button
            type="button"
            className={styles.banner}
            style={{background: bannerStyleBackground(bannerColor, visibleBannerStyle(bannerStyle, premiumActive))}}
            data-selected={target === 'banner' ? 'true' : 'false'}
            onClick={openBannerColorEditor}
            aria-label="Настроить баннер"
          >
            {bannerUrl && <img src={bannerUrl} alt="" aria-hidden="true" />}
            <span className={styles.bannerShade} />
            <span className={styles.editChip}><Icon name="image" size={14} /> Изменить баннер</span>
          </button>

          <div className={styles.profileBody}>
            <button
              type="button"
              className={styles.avatarButton}
              data-selected={target === 'avatar' ? 'true' : 'false'}
              onClick={() => openMediaPicker('avatar')}
              aria-label="Изменить аватар"
            >
              <span
                className={styles.avatarShell}
                data-framed={selectedFrame ? 'true' : 'false'}
                data-milestone={isLevelFrameKey(selectedFrame) ? 'true' : 'false'}
              >
                <img
                  src={avatarUrl}
                  alt=""
                  style={
                    editorMilestoneScale
                      ? {
                          width: `${editorMilestoneScale * 100}%`,
                          height: `${editorMilestoneScale * 100}%`,
                        }
                      : undefined
                  }
                />
                <ProfileFrameOverlay
                  frameKey={selectedFrame}
                  premium={premiumActive}
                  className={styles.avatarFrame}
                />
              </span>
              <span className={styles.avatarEdit}>✎</span>
              <span className={styles.avatarChangeOverlay}>Изменить</span>
            </button>

            <div className={styles.identity}>

              {editingName ? (
                <input
                  className={styles.inlineName}
                  autoFocus
                  value={username}
                  maxLength={24}
                  onChange={(event) => onUsernameChange(event.target.value)}
                  onBlur={() => setEditingName(false)}
                  onKeyDown={(event) => {
                    if (event.key === 'Escape' || event.key === 'Enter') {
                      event.currentTarget.blur();
                    }
                  }}
                />
              ) : (
                <button
                  type="button"
                  className={styles.nameButton}
                  data-selected={target === 'username' ? 'true' : 'false'}
                  onClick={openUsername}
                >
                  <strong className={styles.nameValue}>{username.trim() || 'Пользователь'}</strong>
                  <span className={styles.editGlyph}>✎</span>
                </button>
              )}

              <button
                type="button"
                className={styles.frameLine}
                onClick={() => onSectionChange?.('avatar')}
                title="Открыть инвентарь рамок"
              >
                <span className={styles.frameDot} />
                {activeFrameLabel}
                {isLevelFrameKey(selectedFrame) && premiumActive && <b>АНИМАЦИЯ PREMIUM</b>}
              </button>

              {editingBio ? (
                <textarea
                  className={styles.inlineBio}
                  autoFocus
                  value={bio}
                  maxLength={300}
                  rows={3}
                  onChange={(event) => onBioChange(event.target.value)}
                  onBlur={() => setEditingBio(false)}
                  onKeyDown={(event) => {
                    if (event.key === 'Escape') event.currentTarget.blur();
                  }}
                />
              ) : (
                <button
                  type="button"
                  className={styles.bioButton}
                  data-selected={target === 'bio' ? 'true' : 'false'}
                  onClick={openBio}
                >
                  {bio.trim() || 'Добавь пару слов о себе…'}
                  <span>✎</span>
                </button>
              )}
            </div>
          </div>

          <div className={styles.cardFooter}>
            <span><Icon name="spark" size={13} /> Изменения сразу видны здесь</span>
            {premiumActive ? <b>PREMIUM АКТИВЕН</b> : <button type="button" onClick={onOpenPremium}>Premium ✦</button>}
          </div>
        </article>

        {(error || message) && (
          <div className={error ? styles.messageError : styles.message} role={error ? 'alert' : 'status'}>
            {error || message}
          </div>
        )}

        <div className={styles.canvasHint}>
          <strong>Всё для профиля — в одном месте.</strong>
          <span>Имя, описание, аватар, баннер и рамка теперь настраиваются в одном редакторе.</span>
        </div>
      </section>}

      <aside ref={inspectorRef} className={styles.inspector} data-target={target}>
        <div className={styles.inspectorHead}>
          <div>
            <span>НАСТРОЙКИ ЭЛЕМЕНТА</span>
            <h3>
              {target === 'avatar' && (section === 'frame' ? 'Рамка профиля' : 'Аватар')}
              {target === 'banner' && 'Баннер профиля'}
              {target === 'username' && 'Имя и описание'}
              {target === 'bio' && 'О себе'}
            </h3>
          </div>
          <span className={styles.targetIcon}>
            <Icon
              name={target === 'banner' ? 'image' : target === 'avatar' ? 'user' : 'settings'}
              size={18}
            />
          </span>
        </div>

        {section === 'profile' && (
          <div className={styles.inspectorSection}>
            <label className={styles.field}>
              <span><strong>Имя пользователя</strong><small>{username.trim().length}/24</small></span>
              <input
                value={username}
                maxLength={24}
                onChange={(event) => onUsernameChange(event.target.value)}
              />
            </label>
            <p className={styles.help}>Новое имя сразу видно в предпросмотре. После сохранения оно обновится в профиле, комментариях и меню.</p>
          </div>
        )}

        {section === 'profile' && (
          <div className={styles.inspectorSection}>
            <label className={styles.field}>
              <span><strong>Описание</strong><small>{bio.length}/300</small></span>
              <textarea
                value={bio}
                maxLength={300}
                rows={5}
                onChange={(event) => onBioChange(event.target.value)}
              />
            </label>
            <p className={styles.help}>Короткое био лучше читается в мини-профиле и на мобильных устройствах.</p>
          </div>
        )}

        {target === 'banner' && (
          <div className={styles.inspectorSection}>
            <div className={styles.bannerModes} role="tablist" aria-label="Режим редактирования баннера">
              <button type="button" role="tab" aria-selected={bannerEditorMode === 'color'}
                data-active={bannerEditorMode === 'color'} onClick={() => setBannerEditorMode('color')}>Цвет</button>
              <button type="button" role="tab" aria-selected={bannerEditorMode === 'image'}
                data-active={bannerEditorMode === 'image'} onClick={() => setBannerEditorMode('image')}>Картинка</button>
            </div>

            {bannerEditorMode === 'color' ? (
              <div role="tabpanel" className={styles.bannerPalette}>
                <p className={styles.help}>Выбери оттенок — изменения сразу видны в превью.</p>
                <div className={styles.bannerPresetGrid} aria-label="Цвета баннера">
                  {BANNER_COLOR_PRESETS.map(preset => {
                    const locked=Boolean(preset.premium && !premiumActive);
                    const active=bannerColor.toLowerCase()===preset.color && bannerStyle===preset.style && bannerColorMode==='manual';
                    return (
                      <button type="button" key={preset.label} className={styles.bannerPreset}
                        data-active={active} title={preset.label} aria-label={preset.label+(locked?' — Premium':'')}
                        aria-pressed={active}
                        onClick={() => {
                          // Paid fills may be previewed by everyone. Saving opens the Premium upsell.
                          onBannerStyleChange?.(preset.style);
                          void onBannerColorChange?.(preset.color,'manual');
                          try {
                            (window as Window & {Telegram?:{WebApp?:{HapticFeedback?:{selectionChanged?:()=>void}}}}).Telegram?.WebApp?.HapticFeedback?.selectionChanged?.();
                          }catch {}
                        }}>
                        <span className={styles.bannerPresetSwatch} style={{background:bannerStyleBackground(preset.color,preset.style)}} />
                        {locked && <span className={styles.premiumStar} aria-hidden="true">✦</span>}
                      </button>
                    );
                  })}
                </div>
                <div className={styles.fillModeRail} role="group" aria-label="Тип заливки">
                  {(['solid','soft','glow','sunset'] as const).map(choice => {

                    const labels:Record<BannerStyle,string>={solid:'Однотонный',soft:'Градиент',glow:'Свечение ✦',sunset:'Закат ✦'};
                    return <button type="button" key={choice} data-active={bannerStyle===choice}
                      aria-pressed={bannerStyle===choice}
                      onClick={()=>onBannerStyleChange?.(choice)}>
                      {labels[choice]}
                    </button>;
                  })}
                </div>
                <div className={styles.colorActionRow}>
                  <button type="button" className={styles.colorOpen} onClick={()=>setSheetStart({color:bannerColor,mode:bannerColorMode})}>
                    <span className={styles.colorOpenSwatch} style={{background:bannerColor}} />
                    <span>Свой цвет · {bannerColor.toUpperCase()}</span>
                    <span aria-hidden="true">✎</span>
                  </button>
                  <button type="button" onClick={()=>void onBannerColorChange?.(bannerColor,'auto')}>Из аватара</button>
                  <button type="button" onClick={()=>{
                    onBannerStyleChange?.('soft');
                    void onBannerColorChange?.('#70618c','manual');
                  }}>↺ Сброс</button>
                </div>
                {sheetStart && <BannerColorSheet
                  color={sheetStart.color}
                  onPreview={color=>void onBannerColorChange?.(color,'manual')}
                  onCancel={()=>{
                    void onBannerColorChange?.(sheetStart.color,sheetStart.mode,true);
                    setSheetStart(null);
                  }}
                  onAccept={()=>setSheetStart(null)}
                />}
                <p className={styles.help}>10 цветов доступны бесплатно. Дополнительные эффекты — Premium.</p>

              </div>
            ) : (
              <div role="tabpanel">
                <button type="button" className={styles.bannerDropzone} disabled={bannerBusy}
                  onClick={() => premiumActive ? openMediaPicker('banner') : onOpenPremium()}>
                  {baseBannerUrl ? <img src={baseBannerUrl} alt="Текущий баннер" /> : <Icon name="image" size={26} />}
                  <span>{premiumActive ? (baseBannerUrl ? 'Заменить изображение' : 'Загрузить баннер · 960×320') : 'Картинка баннера · Premium'}</span>
                </button>
                <div className={styles.actionRow}>
                  <button type="button" className={styles.primaryAction} aria-busy={bannerBusy}
                    disabled={bannerBusy || !premiumActive} onClick={() => openMediaPicker('banner')}>
                    <Icon name="image" size={15} />
                    {bannerBusy ? 'Открываем…' : 'Загрузить картинку'}
                  </button>
                  {canRemoveBanner && <button type="button" className={styles.dangerAction} onClick={onRemoveBanner}>Удалить</button>}
                </div>
                <p className={styles.help}>{premiumActive
                  ? 'JPG, PNG, WebP, AVIF, HEIC/HEIF · до 32 МБ до сжатия. Итоговый баннер до 300 КБ.'
                  : 'Для загрузки картинки и анимации требуется Premium. Цвет доступен бесплатно.'}</p>
                {bannerPremiumOverride && (
                  <div className={styles.overrideCard}>
                    <Icon name="crown" size={18} />
                    <div><strong>Сейчас виден Premium-баннер</strong>
                      <p>Цвет будет запасным оформлением, пока есть изображение.</p></div>
                    <button type="button" onClick={() => void onUseBaseBanner()}>Использовать базовый</button>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {target === 'avatar' && (
          <>
            {section !== 'frame' && <div className={styles.inspectorSection}>
              <div className={styles.avatarControl}>
                <span
                  className={styles.avatarControlPreview}
                  data-framed={selectedFrame ? 'true' : 'false'}
                  data-milestone={isLevelFrameKey(selectedFrame) ? 'true' : 'false'}
                >
                  <img
                    src={baseAvatarUrl}
                    alt=""
                    style={
                      selectedMilestoneScale
                        ? {
                            width: `${selectedMilestoneScale * 100}%`,
                            height: `${selectedMilestoneScale * 100}%`,
                          }
                        : undefined
                    }
                  />
                  <ProfileFrameOverlay
                    frameKey={selectedFrame}
                    premium={premiumActive}
                  />
                </span>
                <div>
                  <strong>Аватар</strong>
                  <small>Нажми, чтобы заменить или настроить кадр.</small>
                </div>
              </div>

              <div className={styles.actionRow}>
                <button
                  type="button"
                  className={styles.primaryAction}
                  aria-busy={avatarBusy}
                  disabled={avatarBusy}
                  onClick={() => openMediaPicker('avatar')}
                >
                  <Icon name="image" size={15} />
                  {avatarBusy ? 'Открываем…' : 'Изменить аватар'}
                </button>
                {canRemoveAvatar && (
                  <button type="button" className={styles.dangerAction} onClick={onRemoveAvatar}>
                    Сбросить
                  </button>
                )}
              </div>

              {avatarPremiumOverride && (
                <div className={styles.overrideCard}>
                  <Icon name="crown" size={18} />
                  <div>
                    <strong>{premiumActive ? 'Premium-аватар активен' : 'Используется сохранённая статичная версия'}</strong>
                    <p>{premiumActive ? 'Базовый аватар остаётся сохранённым и вернётся после переключения.' : 'Premium-анимация уже выключена; базовый аватар можно вернуть отдельно от баннера.'}</p>
                  </div>
                  <button type="button" onClick={() => void onUseBaseAvatar()}>Базовый вариант</button>
                </div>
              )}
            </div>}

            {section === 'frame' && <div className={styles.inventorySection}>
              <div className={styles.inventoryHead}>
                <div>
                  <span>КОЛЛЕКЦИЯ РАМОК</span>
                  <h4>Твои рамки</h4>
                </div>
                <strong>{ownedFrames.length}</strong>
              </div>

              <div className={styles.filters}>
                {([
                  ['all', 'Все'],
                  ['level', 'Уровень'],
                  ['league', 'Лига'],
                ] as const).map(([value, label]) => (
                  <button
                    type="button"
                    key={value}
                    data-active={frameFilter === value ? 'true' : 'false'}
                    onClick={() => setFrameFilter(value)}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {frameLoading ? (
                <div className={styles.inventoryState}>Загружаем рамки…</div>
              ) : (
                <div className={styles.frameGrid}>
                  {frameFilter === 'all' && (
                    <button
                      type="button"
                      className={styles.frameItem}
                      data-selected={!selectedFrame ? 'true' : 'false'}
                      disabled={frameLoading}
                      onClick={() => void selectFrame(null)}
                    >
                      <span className={styles.noFrame}>○</span>
                      <span><strong>Без рамки</strong><small>Чистый аватар</small></span>
                      <b>{!selectedFrame ? '✓' : ''}</b>
                    </button>
                  )}

                  {ownedFrames.map((frame) => {
                    const selected = selectedFrame === frame.key;
                    const expiry = formatExpiry(frame.expiresAt);
                    const milestoneScale = levelFrameAvatarScale(frame.key);
                    return (
                      <button
                        type="button"
                        className={styles.frameItem}
                        data-selected={selected ? 'true' : 'false'}
                        key={frame.key}
                        disabled={frameLoading}
                        onClick={() => void selectFrame(selected ? null : frame.key)}
                      >
                        <span className={styles.frameThumb} data-kind={frame.kind}>
                          <img
                            src={baseAvatarUrl}
                            alt=""
                            style={
                              milestoneScale
                                ? {
                                    width: `${milestoneScale * 100}%`,
                                    height: `${milestoneScale * 100}%`,
                                  }
                                : undefined
                            }
                          />
                          <ProfileFrameOverlay
                            frameKey={frame.key}
                            premium={premiumActive}
                          />
                        </span>
                        <span>
                          <strong>{frame.label}</strong>
                          <small>
                            {frame.kind === 'level'
                              ? premiumActive
                                ? 'Уровневая · анимация Premium включена'
                                : 'Уровневая · статичная версия'
                              : expiry
                                ? `Лига · до ${expiry}`
                                : 'Награда лиги'}
                          </small>
                        </span>
                        <b>{selected ? '✓' : ''}</b>
                      </button>
                    );
                  })}

                  {!ownedFrames.length && frameFilter !== 'all' && (
                    <div className={styles.inventoryState}>В этой категории пока нет рамок.</div>
                  )}
                </div>
              )}

              {frameError && <p className={styles.frameError}>{frameError}</p>}

              {frameFilter !== 'league' && nextLockedLevelFrames.length > 0 && (
                <div className={styles.lockedFrames}>
                  <span>МОЖНО ОТКРЫТЬ</span>
                  {nextLockedLevelFrames.map((milestone) => (
                    <div key={milestone.level}>
                      <span className={styles.lockedThumb}>🔒</span>
                      <p><strong>{milestone.title}</strong><small>Откроется на {milestone.level} уровне</small></p>
                    </div>
                  ))}
                </div>
              )}

              <div className={styles.frameRule}>
                <Icon name="info" size={15} />
                <p>
                  <strong>Активна только одна рамка.</strong>
                  Уровневая и лиговая рамка используют один слот и заменяют друг друга.
                </p>
              </div>

              <div className={styles.premiumFrameCard} data-active={premiumActive ? 'true' : 'false'}>
                <Icon name="crown" size={20} />
                <div>
                  <strong>{premiumActive ? 'Анимация Premium активна' : 'Premium добавляет анимацию к уровневым рамкам'}</strong>
                  <p>
                    {premiumActive
                      ? 'Открытая уровнем рамка получает анимацию, свечение и дополнительные эффекты.'
                      : 'Все рамки открываются обычной прогрессией. Premium только добавляет анимацию к уже заработанной уровневой рамке.'}
                  </p>
                </div>
                {!premiumActive && <button type="button" onClick={onOpenPremium}>Подробнее</button>}
              </div>
            </div>}
          </>
        )}
      </aside>
    </div>
  );
}
