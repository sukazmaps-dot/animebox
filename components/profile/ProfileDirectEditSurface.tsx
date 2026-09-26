'use client';

import { useEffect, useMemo, useState } from 'react';

import Icon from '@/components/Icon';
import ProfileFrameOverlay from '@/components/profile/ProfileFrameOverlay';
import { isLevelFrameKey, levelFrameLabel, LEVEL_MILESTONES, type LevelFrameKey } from '@/lib/progression';

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
  username: string;
  bio: string;
  avatarUrl: string;
  bannerUrl: string | null;
  baseAvatarUrl: string;
  baseBannerUrl: string | null;
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
  onUseBaseMedia: () => void | Promise<void>;
  onOpenPremium: () => void;
};

const MEDIA_ACCEPT =
  'image/jpeg,image/jpg,image/png,image/webp,image/avif,image/heic,image/heif,.jpg,.jpeg,.png,.webp,.avif,.heic,.heif';

function frameDisplayName(frame: string | null | undefined, league: LeagueFrame[]) {
  if (!frame) return 'Без рамки';
  if (isLevelFrameKey(frame)) return levelFrameLabel(frame);
  return league.find((item) => item.key === frame)?.label ?? 'League-рамка';
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
  username,
  bio,
  avatarUrl,
  bannerUrl,
  baseAvatarUrl,
  baseBannerUrl,
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
  onUseBaseMedia,
  onOpenPremium,
}: Props) {
  const [target, setTarget] = useState<InspectorTarget>('avatar');
  const [editingName, setEditingName] = useState(false);
  const [editingBio, setEditingBio] = useState(false);
  const [frameFilter, setFrameFilter] = useState<FrameFilter>('all');
  const [frames, setFrames] = useState<FramePayload | null>(null);
  const [frameLoading, setFrameLoading] = useState(true);
  const [frameBusy, setFrameBusy] = useState('');
  const [frameError, setFrameError] = useState('');

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

  async function selectFrame(frameKey: string | null) {
    if (frameBusy) return;
    setFrameBusy(frameKey ?? 'none');
    setFrameError('');

    try {
      const response = await fetch('/api/community/leaderboard-rewards', {
        method: 'POST',
        cache: 'no-store',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'select_frame', frameKey }),
      });
      const payload = await response.json() as FramePayload;
      if (!response.ok) throw new Error(payload.error || 'Не удалось выбрать рамку.');

      setFrames((current) => ({
        ...(current ?? {}),
        selectedFrame: payload.selectedFrame ?? null,
      }));
      window.dispatchEvent(new Event('animebox:profile-cosmetic-changed'));
    } catch (selectError) {
      setFrameError(
        selectError instanceof Error ? selectError.message : 'Не удалось выбрать рамку.',
      );
    } finally {
      setFrameBusy('');
    }
  }

  const leagueFrames = frames?.unlockedFrames ?? [];
  const levelFrames = frames?.unlockedLevelFrames ?? [];
  const selectedFrame = frames?.selectedFrame ?? null;
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

  function openUsername() {
    setTarget('username');
    setEditingName(true);
  }

  function openBio() {
    setTarget('bio');
    setEditingBio(true);
  }

  return (
    <div className={styles.workspace}>
      <section className={styles.canvas}>
        <div className={styles.canvasHead}>
          <div>
            <span>DIRECT EDIT</span>
            <h2>Редактируй профиль прямо на профиле</h2>
            <p>Нажми на аватар, баннер, ник или описание — справа откроются настройки именно этого элемента.</p>
          </div>
          <div className={styles.liveBadge}><span /> LIVE</div>
        </div>

        <article className={styles.profileCard}>
          <button
            type="button"
            className={styles.banner}
            data-selected={target === 'banner' ? 'true' : 'false'}
            onClick={() => setTarget('banner')}
            aria-label="Редактировать баннер"
          >
            {bannerUrl ? <img src={bannerUrl} alt="" aria-hidden="true" /> : <span className={styles.bannerEmpty}>ANIMEBOX PROFILE</span>}
            <span className={styles.bannerShade} />
            <span className={styles.editChip}><Icon name="image" size={14} /> Баннер</span>
          </button>

          <div className={styles.profileBody}>
            <button
              type="button"
              className={styles.avatarButton}
              data-selected={target === 'avatar' ? 'true' : 'false'}
              onClick={() => setTarget('avatar')}
              aria-label="Редактировать аватар и рамку"
            >
              <span className={styles.avatarShell}>
                <img src={avatarUrl} alt="" />
                <ProfileFrameOverlay
                  frameKey={selectedFrame}
                  premium={premiumActive}
                  className={styles.avatarFrame}
                />
              </span>
              <span className={styles.avatarEdit}>✎</span>
            </button>

            <div className={styles.identity}>
              <span className={styles.identityEyebrow}>ANIMEBOX USER</span>

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
                  {username.trim() || 'Пользователь'} <span>✎</span>
                </button>
              )}

              <button
                type="button"
                className={styles.frameLine}
                onClick={() => setTarget('avatar')}
                title="Открыть инвентарь рамок"
              >
                <span className={styles.frameDot} />
                {activeFrameLabel}
                {isLevelFrameKey(selectedFrame) && premiumActive && <b>PREMIUM MOTION</b>}
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
            <span><Icon name="spark" size={13} /> Профиль обновляется в реальном времени</span>
            {premiumActive ? <b>PREMIUM ACTIVE</b> : <button type="button" onClick={onOpenPremium}>Premium ✦</button>}
          </div>
        </article>

        {(error || message) && (
          <div className={error ? styles.messageError : styles.message} role={error ? 'alert' : 'status'}>
            {error || message}
          </div>
        )}

        <div className={styles.canvasHint}>
          <strong>Один профиль — один редактор.</strong>
          <span>Больше не нужно прыгать между «Профиль» и «Оформление»: базовые данные, медиа и рамка находятся здесь.</span>
        </div>
      </section>

      <aside className={styles.inspector} data-target={target}>
        <div className={styles.inspectorHead}>
          <div>
            <span>НАСТРОЙКИ ЭЛЕМЕНТА</span>
            <h3>
              {target === 'avatar' && 'Аватар и рамка'}
              {target === 'banner' && 'Баннер профиля'}
              {target === 'username' && 'Имя пользователя'}
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

        {target === 'username' && (
          <div className={styles.inspectorSection}>
            <label className={styles.field}>
              <span><strong>Имя пользователя</strong><small>{username.trim().length}/24</small></span>
              <input
                value={username}
                maxLength={24}
                autoFocus
                onChange={(event) => onUsernameChange(event.target.value)}
              />
            </label>
            <p className={styles.help}>Ник сразу отражается в live-preview. После сохранения он обновится в профиле, комментариях и меню.</p>
          </div>
        )}

        {target === 'bio' && (
          <div className={styles.inspectorSection}>
            <label className={styles.field}>
              <span><strong>Описание</strong><small>{bio.length}/300</small></span>
              <textarea
                value={bio}
                maxLength={300}
                rows={7}
                autoFocus
                onChange={(event) => onBioChange(event.target.value)}
              />
            </label>
            <p className={styles.help}>Короткое био лучше читается в мини-профиле и на мобильных устройствах.</p>
          </div>
        )}

        {target === 'banner' && (
          <div className={styles.inspectorSection}>
            <div className={styles.mediaPreview} data-kind="banner">
              {baseBannerUrl ? <img src={baseBannerUrl} alt="" /> : <span>Без базового баннера</span>}
            </div>
            <div className={styles.actionRow}>
              <label className={styles.primaryAction} aria-busy={bannerBusy}>
                <Icon name="image" size={15} />
                {bannerBusy ? 'Открываем…' : 'Изменить баннер'}
                <input
                  hidden
                  type="file"
                  accept={MEDIA_ACCEPT}
                  onChange={(event) => {
                    const input = event.currentTarget;
                    const file = input.files?.[0];
                    void Promise.resolve(onBannerFile(file)).finally(() => {
                      input.value = '';
                    });
                  }}
                />
              </label>
              {canRemoveBanner && (
                <button type="button" className={styles.dangerAction} onClick={onRemoveBanner}>
                  Удалить
                </button>
              )}
            </div>
            <p className={styles.help}>JPG, PNG, WebP, AVIF, HEIC/HEIF · до 16 МБ. Перед сохранением откроется crop-editor.</p>
            {bannerPremiumOverride && (
              <div className={styles.overrideCard}>
                <Icon name="crown" size={18} />
                <div>
                  <strong>Сейчас виден Premium-вариант</strong>
                  <p>Изменения базового баннера сохранятся как запасной вариант.</p>
                </div>
                <button type="button" onClick={() => void onUseBaseMedia()}>Использовать базовый</button>
              </div>
            )}
            <button type="button" className={styles.premiumLink} onClick={onOpenPremium}>
              <Icon name="crown" size={15} /> Анимированный баннер и Premium-палитра
            </button>
          </div>
        )}

        {target === 'avatar' && (
          <>
            <div className={styles.inspectorSection}>
              <div className={styles.avatarControl}>
                <span className={styles.avatarControlPreview}>
                  <img src={baseAvatarUrl} alt="" />
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
                <label className={styles.primaryAction} aria-busy={avatarBusy}>
                  <Icon name="image" size={15} />
                  {avatarBusy ? 'Открываем…' : 'Изменить аватар'}
                  <input
                    hidden
                    type="file"
                    accept={MEDIA_ACCEPT}
                    onChange={(event) => {
                      const input = event.currentTarget;
                      const file = input.files?.[0];
                      void Promise.resolve(onAvatarFile(file)).finally(() => {
                        input.value = '';
                      });
                    }}
                  />
                </label>
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
                    <strong>Premium-медиа активно</strong>
                    <p>Базовый аватар остаётся сохранённым и вернётся после переключения.</p>
                  </div>
                  <button type="button" onClick={() => void onUseBaseMedia()}>Базовый вариант</button>
                </div>
              )}
            </div>

            <div className={styles.inventorySection}>
              <div className={styles.inventoryHead}>
                <div>
                  <span>FRAME INVENTORY</span>
                  <h4>Твои рамки</h4>
                </div>
                <strong>{ownedFrames.length}</strong>
              </div>

              <div className={styles.filters}>
                {([
                  ['all', 'Все'],
                  ['level', 'LVL'],
                  ['league', 'League'],
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
                      disabled={Boolean(frameBusy)}
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
                    return (
                      <button
                        type="button"
                        className={styles.frameItem}
                        data-selected={selected ? 'true' : 'false'}
                        key={frame.key}
                        disabled={Boolean(frameBusy)}
                        onClick={() => void selectFrame(selected ? null : frame.key)}
                      >
                        <span className={styles.frameThumb}>
                          <img src={baseAvatarUrl} alt="" />
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
                                ? 'LVL · Premium motion включён'
                                : 'LVL · статичная версия'
                              : expiry
                                ? `League · до ${expiry}`
                                : 'League-награда'}
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
                      <p><strong>{milestone.rank}</strong><small>Откроется на LVL {milestone.level}</small></p>
                    </div>
                  ))}
                </div>
              )}

              <div className={styles.frameRule}>
                <Icon name="info" size={15} />
                <p>
                  <strong>Активна только одна рамка.</strong>
                  Уровневая и League-рамка используют один слот и автоматически заменяют друг друга.
                </p>
              </div>

              <div className={styles.premiumFrameCard} data-active={premiumActive ? 'true' : 'false'}>
                <Icon name="crown" size={20} />
                <div>
                  <strong>{premiumActive ? 'Premium motion активен' : 'Premium оживляет LVL-рамки'}</strong>
                  <p>
                    {premiumActive
                      ? 'Открытая уровнем рамка получает motion, glow и дополнительные эффекты.'
                      : 'Все рамки открываются обычной прогрессией. Premium только добавляет анимацию к уже заработанной LVL-рамке.'}
                  </p>
                </div>
                {!premiumActive && <button type="button" onClick={onOpenPremium}>Подробнее</button>}
              </div>
            </div>
          </>
        )}
      </aside>
    </div>
  );
}
