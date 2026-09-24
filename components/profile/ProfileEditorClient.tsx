'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

import { useAuthState } from '@/components/AuthStateProvider';
import PremiumStudioClient, { type PremiumStudioHandle } from '@/components/premium/PremiumStudioClient';
import PremiumMediaCropEditor from '@/components/premium/PremiumMediaCropEditor';
import AnimeBoxLoader from '@/components/ui/AnimeBoxLoader';
import ProfileWidgetEditor from '@/components/profile/ProfileWidgetEditor';
import Icon from '@/components/Icon';
import { notifyAuthChanged } from '@/lib/auth-events';
import { communityRequest } from '@/lib/community-client';
import { notifyProfileAppearanceChanged } from '@/lib/profile-live-sync';
import { resolveProfileAppearance } from '@/lib/profile-appearance';
import { readProfileCache, saveProfileCache } from '@/lib/profile-cache';
import { createClient } from '@/lib/supabase/client';
import {
  discardPrivateProfileMedia,
  profileMediaFetchWithTimeout,
  uploadPrivateProfileMedia,
  type PendingProfileMediaUpload,
} from '@/lib/profile-media-upload-client';
import { prepareBaseProfileMedia } from '@/lib/profile-media-crop-client';
import { normalizePickedImage } from '@/lib/profile-media-normalize-client';
import type { ProfileWidgetsData } from '@/types/profile-widgets';
import type {
  PremiumMediaTransform,
  PremiumStudioSettings,
} from '@/lib/premium-studio';

type EditorTab = 'profile' | 'showcase' | 'style';

type ProfileRow = {
  id: string;
  username: string | null;
  bio: string | null;
  avatar_path: string | null;
  banner_path: string | null;
  created_at: string;
};

type Props = {
  initialTab?: EditorTab;
};

type BaseMediaEditorState = {
  kind: 'avatar' | 'banner';
  file: File;
  src: string;
  transform: PremiumMediaTransform;
};

function normalizedTab(value: string | null | undefined): EditorTab {
  if (value === 'style' || value === 'premium') return 'style';
  if (value === 'showcase' || value === 'widgets') return 'showcase';
  return 'profile';
}

export default function ProfileEditorClient({ initialTab = 'profile' }: Props) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const {
    user,
    loading: authLoading,
    refresh: refreshAuth,
  } = useAuthState();

  const [activeTab, setActiveTab] = useState<EditorTab>(normalizedTab(initialTab));
  const [profile, setProfile] = useState<ProfileRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState('');

  const [username, setUsername] = useState('');
  const [bio, setBio] = useState('');
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [bannerFile, setBannerFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [bannerPreview, setBannerPreview] = useState<string | null>(null);
  const [baseMediaEditor, setBaseMediaEditor] = useState<BaseMediaEditorState | null>(null);
  const [baseMediaProcessing, setBaseMediaProcessing] = useState(false);
  const [baseMediaOpening, setBaseMediaOpening] = useState<'avatar' | 'banner' | null>(null);
  const [baseMediaError, setBaseMediaError] = useState('');
  const baseMediaRequestRef = useRef(0);
  const baseMediaPreviewUrlRef = useRef<string | null>(null);
  const [removeAvatar, setRemoveAvatar] = useState(false);
  const [removeBanner, setRemoveBanner] = useState(false);
  const [premiumSettings, setPremiumSettings] = useState<PremiumStudioSettings | null>(null);
  const [premiumActive, setPremiumActive] = useState(false);
  const premiumStudioRef = useRef<PremiumStudioHandle | null>(null);
  const [premiumDirty, setPremiumDirty] = useState(false);
  const [premiumBusy, setPremiumBusy] = useState(false);
  const [showcase, setShowcase] = useState<ProfileWidgetsData | null>(null);
  const [showcaseLoading, setShowcaseLoading] = useState(false);
  const [showcaseError, setShowcaseError] = useState('');
  const [showcaseReloadKey, setShowcaseReloadKey] = useState(0);

  useEffect(() => {
    let active = true;
    let cachedFrame: number | null = null;

    if (authLoading) return () => { active = false; };
    if (!user) {
      router.replace('/login?next=/profile/edit');
      return () => { active = false; };
    }

    const cached = readProfileCache<ProfileRow>(user.id);
    if (cached?.username) {
      cachedFrame = window.requestAnimationFrame(() => {
        if (!active) return;
        setProfile(cached);
        setUsername(cached.username ?? '');
        setBio(cached.bio ?? '');
        setLoading(false);
      });
    }

    void supabase
      .from('profiles')
      .select('id, username, bio, avatar_path, banner_path, created_at')
      .eq('id', user.id)
      .single()
      .then(({ data, error: loadError }) => {
        if (!active) return;
        if (loadError || !data) {
          setError('Не удалось загрузить профиль.');
          setLoading(false);
          return;
        }

        const next = data as ProfileRow;
        setProfile(next);
        setUsername(next.username ?? '');
        setBio(next.bio ?? '');
        saveProfileCache(user.id, next);
        setLoading(false);
      });

    return () => {
      active = false;
      if (cachedFrame != null) window.cancelAnimationFrame(cachedFrame);
    };
  }, [authLoading, router, supabase, user]);

  useEffect(() => {
    if (!user?.id || activeTab !== 'showcase' || showcase) return;

    let active = true;
    setShowcaseLoading(true);
    setShowcaseError('');

    void communityRequest<{ ok: boolean; widgets: ProfileWidgetsData }>('profile-widgets')
      .then((payload) => {
        if (active) setShowcase(payload.widgets);
      })
      .catch((loadError) => {
        if (active) {
          setShowcaseError(
            loadError instanceof Error
              ? loadError.message
              : 'Не удалось загрузить витрину.',
          );
        }
      })
      .finally(() => {
        if (active) setShowcaseLoading(false);
      });

    return () => {
      active = false;
    };
  }, [activeTab, showcase, showcaseReloadKey, user?.id]);

  useEffect(() => {
    if (!user?.id) {
      const frame = window.requestAnimationFrame(() => {
        setPremiumSettings(null);
        setPremiumActive(false);
      });
      return () => window.cancelAnimationFrame(frame);
    }

    let active = true;
    const loadAppearance = () => {
      void fetch('/api/profile/editor', { cache: 'no-store' })
        .then(async (response) => {
          if (!response.ok || !active) return;
          const payload = (await response.json()) as {
            allowed?: boolean;
            settings?: PremiumStudioSettings;
          };
          setPremiumSettings(payload.settings ?? null);
          setPremiumActive(Boolean(payload.allowed));
        })
        .catch(() => {
          if (!active) return;
          setPremiumSettings(null);
          setPremiumActive(false);
        });
    };

    loadAppearance();
    window.addEventListener('animebox:premium-studio-updated', loadAppearance);
    window.addEventListener('animebox:entitlements-changed', loadAppearance);

    return () => {
      active = false;
      window.removeEventListener('animebox:premium-studio-updated', loadAppearance);
      window.removeEventListener('animebox:entitlements-changed', loadAppearance);
    };
  }, [user?.id]);

  useEffect(() => {
    return () => {
      if (avatarPreview) URL.revokeObjectURL(avatarPreview);
    };
  }, [avatarPreview]);

  useEffect(() => {
    return () => {
      if (bannerPreview) URL.revokeObjectURL(bannerPreview);
    };
  }, [bannerPreview]);

  useEffect(() => {
    return () => {
      if (baseMediaPreviewUrlRef.current) {
        URL.revokeObjectURL(baseMediaPreviewUrlRef.current);
        baseMediaPreviewUrlRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (!baseMediaEditor) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !baseMediaProcessing) {
        closeBaseMediaEditor();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [baseMediaEditor, baseMediaProcessing]);

  function switchTab(tab: EditorTab) {
    setActiveTab(tab);
    setError('');
    setSaved('');
    const url = tab === 'profile' ? '/profile/edit' : `/profile/edit?tab=${tab}`;
    window.history.replaceState(null, '', url);
  }

  function revokeBaseMediaPreviewLater(src?: string | null) {
    const current = src ?? baseMediaPreviewUrlRef.current;
    if (!current) return;

    if (baseMediaPreviewUrlRef.current === current) {
      baseMediaPreviewUrlRef.current = null;
    }

    window.requestAnimationFrame(() => {
      URL.revokeObjectURL(current);
    });
  }

  function closeBaseMediaEditor() {
    if (baseMediaProcessing) return;

    const src = baseMediaEditor?.src ?? baseMediaPreviewUrlRef.current;
    setBaseMediaEditor(null);
    revokeBaseMediaPreviewLater(src);
  }

  async function stageMedia(kind: 'avatar' | 'banner', file?: File) {
    if (!file || baseMediaProcessing || baseMediaOpening) return;

    const requestId = ++baseMediaRequestRef.current;
    setBaseMediaOpening(kind);
    setBaseMediaError('');
    setError('');
    setSaved('');

    try {
      const normalized = await normalizePickedImage(file);

      if (baseMediaRequestRef.current !== requestId) {
        return;
      }

      const previewUrl = URL.createObjectURL(normalized);

      if (baseMediaPreviewUrlRef.current) {
        revokeBaseMediaPreviewLater(baseMediaPreviewUrlRef.current);
      }

      baseMediaPreviewUrlRef.current = previewUrl;

      setBaseMediaEditor({
        kind,
        file: normalized,
        src: previewUrl,
        transform: { x: 50, y: 50, zoom: 1 },
      });
    } catch (previewError) {
      if (baseMediaRequestRef.current !== requestId) return;

      console.error('[ProfileMedia] normalize failed', {
        name: file.name,
        type: file.type,
        size: file.size,
        error: previewError,
      });

      setBaseMediaError(
        previewError instanceof Error
          ? previewError.message
          : 'Не удалось обработать выбранное изображение.',
      );
    } finally {
      if (baseMediaRequestRef.current === requestId) {
        setBaseMediaOpening(null);
      }
    }
  }

  async function confirmBaseMediaEditor() {
    const editor = baseMediaEditor;
    if (!editor || baseMediaProcessing) return;

    setBaseMediaProcessing(true);
    setBaseMediaError('');
    setError('');

    try {
      const optimized = await prepareBaseProfileMedia(
        editor.file,
        editor.kind,
        editor.transform,
      );
      const preview = URL.createObjectURL(optimized);

      if (editor.kind === 'avatar') {
        setAvatarFile(optimized);
        setAvatarPreview(preview);
        setRemoveAvatar(false);
        setSaved('Кадр аватара подготовлен и оптимизирован — нажми «Сохранить всё».');
      } else {
        setBannerFile(optimized);
        setBannerPreview(preview);
        setRemoveBanner(false);
        setSaved('Баннер подогнан и оптимизирован — нажми «Сохранить всё».');
      }

      const editorSrc = editor.src;
      setBaseMediaEditor(null);
      revokeBaseMediaPreviewLater(editorSrc);
    } catch (requestError) {
      const message =
        requestError instanceof Error
          ? requestError.message
          : 'Не удалось подготовить изображение.';
      setBaseMediaError(message);
      setError(message);
    } finally {
      setBaseMediaProcessing(false);
    }
  }

  function publicMediaUrl(path: string | null | undefined) {
    if (!path) return null;
    return supabase.storage.from('profile-media').getPublicUrl(path).data.publicUrl;
  }

  const currentAvatarUrl = publicMediaUrl(profile?.avatar_path) || '/default-avatar.webp';
  const currentBannerUrl = publicMediaUrl(profile?.banner_path);
  const displayedAvatar = removeAvatar ? '/default-avatar.webp' : avatarPreview || currentAvatarUrl;
  const displayedBanner = removeBanner ? null : bannerPreview || currentBannerUrl;

  const premiumAnimatedAvatar = publicMediaUrl(premiumSettings?.avatarPath);
  const premiumStaticAvatar = publicMediaUrl(premiumSettings?.avatarStaticPath);
  const premiumAnimatedBanner = publicMediaUrl(premiumSettings?.bannerPath);
  const premiumStaticBanner = publicMediaUrl(premiumSettings?.bannerStaticPath);

  const resolvedAvatarPreview = premiumActive
    ? premiumAnimatedAvatar || premiumStaticAvatar || displayedAvatar
    : premiumStaticAvatar || displayedAvatar;
  const resolvedBannerPreview = premiumActive
    ? premiumAnimatedBanner || premiumStaticBanner || displayedBanner
    : premiumStaticBanner || displayedBanner;
  const premiumAvatarOverride = Boolean(
    premiumActive ? premiumAnimatedAvatar || premiumStaticAvatar : premiumStaticAvatar,
  );
  const premiumBannerOverride = Boolean(
    premiumActive ? premiumAnimatedBanner || premiumStaticBanner : premiumStaticBanner,
  );

  const baseDirty = Boolean(
    profile && (
      username.trim() !== (profile.username ?? '').trim() ||
      bio.trim() !== (profile.bio ?? '').trim() ||
      avatarFile ||
      bannerFile ||
      removeAvatar ||
      removeBanner
    )
  );
  const dirty = baseDirty || premiumDirty;

  async function saveProfile() {
    if (!profile || !user || saving || premiumBusy || !dirty) return;

    const cleanUsername = username.trim();
    const cleanBio = bio.trim();

    setError('');
    setSaved('');

    if (cleanUsername.length < 3 || cleanUsername.length > 24) {
      setError('Ник должен содержать от 3 до 24 символов.');
      return;
    }
    if (cleanBio.length > 300) {
      setError('Описание не может быть длиннее 300 символов.');
      return;
    }

    setSaving(true);
    const pendingMedia: PendingProfileMediaUpload[] = [];

    try {
      let finalAvatarPath = removeAvatar ? null : profile.avatar_path;
      let finalBannerPath = removeBanner ? null : profile.banner_path;

      if (avatarFile && !removeAvatar) {
        const upload = await uploadPrivateProfileMedia({
          scope: 'base',
          kind: 'avatar',
          variant: 'original',
          body: avatarFile,
        });
        pendingMedia.push(upload);
        finalAvatarPath = upload.publicPath;
      }

      if (bannerFile && !removeBanner) {
        const upload = await uploadPrivateProfileMedia({
          scope: 'base',
          kind: 'banner',
          variant: 'original',
          body: bannerFile,
        });
        pendingMedia.push(upload);
        finalBannerPath = upload.publicPath;
      }

      const studioDraft = premiumDirty ? premiumStudioRef.current?.getDraft() ?? premiumSettings : null;
      const response = await profileMediaFetchWithTimeout('/api/profile/editor', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...(baseDirty
            ? {
                profile: {
                  username: cleanUsername,
                  bio: cleanBio,
                  avatarPath: finalAvatarPath,
                  bannerPath: finalBannerPath,
                },
              }
            : {}),
          ...(premiumDirty && studioDraft ? { studio: studioDraft } : {}),
          ...(pendingMedia.length ? { pendingMedia } : {}),
        }),
      }, 20_000);
      const payload = (await response.json()) as {
        profile?: ProfileRow;
        settings?: PremiumStudioSettings;
        error?: string;
      };

      if (!response.ok) {
        if (pendingMedia.length) {
          await discardPrivateProfileMedia(pendingMedia);
        }
        throw new Error(payload.error || 'Не удалось сохранить профиль.');
      }

      const next = payload.profile ?? profile;
      const oldFiles: string[] = [];
      if (baseDirty) {
        if (profile.avatar_path && profile.avatar_path !== next.avatar_path) oldFiles.push(profile.avatar_path);
        if (profile.banner_path && profile.banner_path !== next.banner_path) oldFiles.push(profile.banner_path);
      }
      if (oldFiles.length) void supabase.storage.from('profile-media').remove(oldFiles);

      if (payload.settings) {
        setPremiumSettings(payload.settings);
        premiumStudioRef.current?.markSaved(payload.settings);
        setPremiumDirty(false);
      }
      setProfile(next);
      setUsername(next.username ?? '');
      setBio(next.bio ?? '');
      setAvatarFile(null);
      setBannerFile(null);
      setRemoveAvatar(false);
      setRemoveBanner(false);
      if (avatarPreview) URL.revokeObjectURL(avatarPreview);
      if (bannerPreview) URL.revokeObjectURL(bannerPreview);
      setAvatarPreview(null);
      setBannerPreview(null);
      saveProfileCache(user.id, next);

      const committedStudio =
        payload.settings ??
        premiumSettings;

      const appearance = resolveProfileAppearance({
        baseAvatarPath: next.avatar_path,
        baseBannerPath: next.banner_path,
        premiumStudio: committedStudio,
        premiumActive,
      });

      notifyAuthChanged({
        userId: user.id,
        profile: {
          id: user.id,
          username: next.username,
          avatar_path: next.avatar_path,
          display_avatar_path: appearance.avatarPath,
          display_avatar_transform: appearance.avatarTransform,
        },
      });

      notifyProfileAppearanceChanged(user.id);
      if (payload.settings) {
        window.dispatchEvent(new Event('animebox:premium-studio-updated'));
      }
      void refreshAuth();
      router.refresh();

      setSaved('Профиль и оформление сохранены ✓');
    } catch (requestError) {
      if (pendingMedia.length) {
        await discardPrivateProfileMedia(pendingMedia);
      }
      setError(requestError instanceof Error ? requestError.message : 'Не удалось сохранить профиль.');
    } finally {
      setSaving(false);
    }
  }

  async function clearPremiumFallbackMedia() {
    if (!user?.id) return;
    setError('');
    setSaved('');
    try {
      const response = await fetch('/api/premium/studio?media=all', { method: 'DELETE' });
      const payload = (await response.json()) as { settings?: PremiumStudioSettings; error?: string };
      if (!response.ok) throw new Error(payload.error || 'Не удалось вернуть базовые медиа.');
      setPremiumSettings(payload.settings ?? null);
      setSaved('Снова используются базовые аватар и баннер ✓');
      window.dispatchEvent(new Event('animebox:premium-studio-updated'));
      notifyProfileAppearanceChanged(user.id);
      void refreshAuth();
      router.refresh();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Не удалось вернуть базовые медиа.');
    }
  }

  if (loading) {
    return (
      <main className="profile-editor-v13" data-editor-tab={activeTab}>
        <div className="profile-editor-v13__loading">
          <AnimeBoxLoader label="Открываем редактор профиля…" size={54} />
        </div>
      </main>
    );
  }

  if (!profile) {
    return (
      <main className="profile-editor-v13" data-editor-tab={activeTab}>
        <div className="profile-editor-v13__loading">{error || 'Профиль не найден'}</div>
      </main>
    );
  }

  return (
    <main className="profile-editor-v13" data-editor-tab={activeTab}>
      <div className="profile-editor-v13__ambient" aria-hidden="true" />

      <section className="profile-editor-v13__shell">
        <header className="profile-editor-v13__header">
          <div>
            <span>ANIMEBOX PROFILE LAB</span>
            <h1>Редактор профиля</h1>
            <p>Собери профиль под себя — от базовой информации до Premium-оформления.</p>
          </div>

          <div className="profile-editor-v13__header-actions">
            {dirty && <small>Есть несохранённые изменения</small>}
            <Link href="/profile">← В профиль</Link>
            <button type="button" disabled={!dirty || saving || premiumBusy || baseMediaProcessing || Boolean(baseMediaOpening)} onClick={() => void saveProfile()}>
              {saving ? 'Сохраняем…' : dirty ? 'Сохранить всё' : 'Сохранено'}
            </button>
          </div>
        </header>

        <nav className="profile-editor-v13__tabs" aria-label="Разделы редактора профиля">
          <button className={activeTab === 'profile' ? 'is-active' : ''} onClick={() => switchTab('profile')} type="button">
            Профиль и оформление
          </button>
          <button className={activeTab === 'showcase' ? 'is-active' : ''} onClick={() => switchTab('showcase')} type="button">
            Витрина
          </button>
          <button className={activeTab === 'style' ? 'is-active is-premium' : 'is-premium'} onClick={() => switchTab('style')} type="button">
            <Icon name="crown" size={19} weight="fill" /> Стиль
          </button>
        </nav>

        {activeTab === 'style' ? (
          <div className="profile-editor-v13__premium-tab">
            <PremiumStudioClient
              ref={premiumStudioRef}
              embedded
              hideDock
              initialSettings={premiumSettings}
              initialAllowed={premiumActive}
              onDirtyChange={setPremiumDirty}
              onBusyChange={setPremiumBusy}
              onSettingsCommitted={(settings) => {
                setPremiumSettings(settings);
                setPremiumDirty(false);
              }}
            />
          </div>
        ) : activeTab === 'showcase' ? (
          <div className="profile-editor-v13__showcase-tab">
            <div className="profile-editor-v13__section-title profile-editor-v13__showcase-title">
              <div>
                <span>PROFILE SHOWCASE</span>
                <h2>Витрина профиля</h2>
                <p>Собери порядок виджетов и закрепи любимые аниме — всё внутри общего редактора.</p>
              </div>
            </div>

            {showcaseLoading && (
              <div className="profile-editor-v13__showcase-state">
                <AnimeBoxLoader label="Загружаем витрину…" size={46} />
              </div>
            )}

            {!showcaseLoading && showcaseError && (
              <div className="profile-editor-v13__showcase-state is-error" role="alert">
                {showcaseError}
                <button
                  type="button"
                  onClick={() => {
                    setShowcaseError('');
                    setShowcase(null);
                    setShowcaseReloadKey((value) => value + 1);
                  }}
                >
                  Повторить
                </button>
              </div>
            )}

            {!showcaseLoading && showcase && (
              <ProfileWidgetEditor
                embedded
                data={showcase}
                onSaved={(widgets) => {
                  setShowcase(widgets);
                  setSaved('Витрина сохранена ✓');
                }}
              />
            )}
          </div>
        ) : (
          <div className="profile-editor-v13__workspace">
            <div className="profile-editor-v13__controls">
              <>
                <section className="profile-editor-v13__panel">
  <div className="profile-editor-v13__section-title">
    <div>
      <h2>Основная информация</h2>
      <p>То, что увидят другие пользователи AnimeBox.</p>
    </div>
  </div>

  <label className="profile-editor-v13__field">
    <span><strong>Имя пользователя</strong><small>{username.trim().length}/24</small></span>
    <input value={username} maxLength={24} onChange={(event) => { setUsername(event.target.value); setSaved(''); }} />
  </label>

  <label className="profile-editor-v13__field">
    <span><strong>О себе</strong><small>{bio.length}/300</small></span>
    <textarea value={bio} maxLength={300} rows={7} onChange={(event) => { setBio(event.target.value); setSaved(''); }} />
  </label>

  <div className="profile-editor-v13__hint-card">
    <strong>Совет</strong>
    <p>Короткое био и узнаваемый ник лучше читаются в комментариях, рейтинге и публичном профиле.</p>
  </div>
</section>
                <div className="profile-editor-v13__section-divider" aria-hidden="true" />
                <section className="profile-editor-v13__panel">
                  <div className="profile-editor-v13__section-title">
                    <div>
                      <h2>Базовое оформление</h2>
                      <p>Обычный аватар и баннер доступны всем пользователям.</p>
                    </div>
                  </div>

                  <div className="profile-editor-v13__media-block">
                    <div className="profile-editor-v13__banner-editor">
                      {displayedBanner ? <img src={displayedBanner} alt="Предпросмотр баннера" /> : <div>ANIMEBOX PROFILE</div>}
                      <div className="profile-editor-v13__media-actions">
                        <label aria-busy={baseMediaOpening === 'banner'}>
                          {baseMediaOpening === 'banner' ? 'Открываем…' : 'Сменить и подогнать'}
                          <input
                            hidden
                            type="file"
                            accept="image/jpeg,image/jpg,image/png,image/webp,image/avif,image/heic,image/heif,.jpg,.jpeg,.png,.webp,.avif,.heic,.heif"
                            onChange={(event) => {
                              const input = event.currentTarget;
                              const file = input.files?.[0];

                              void stageMedia('banner', file).finally(() => {
                                input.value = '';
                              });
                            }}
                          />
                        </label>
                        {(profile.banner_path || bannerFile) && (
                          <button type="button" onClick={() => { setBannerFile(null); if (bannerPreview) URL.revokeObjectURL(bannerPreview); setBannerPreview(null); setRemoveBanner(true); setSaved(''); }}>Удалить</button>
                        )}
                      </div>
                    </div>

                    <div className="profile-editor-v13__avatar-editor">
                      <img src={displayedAvatar} alt="Предпросмотр аватара" />
                      <div>
                        <strong>Аватар профиля</strong>
                        <small>JPG, PNG, WebP, AVIF, HEIC/HEIF · до 16 МБ · AnimeBox очистит метаданные и подготовит лёгкий WebP</small>
                        <div className="profile-editor-v13__media-actions is-inline">
                          <label aria-busy={baseMediaOpening === 'avatar'}>
                            {baseMediaOpening === 'avatar' ? 'Открываем…' : 'Выбрать и кадрировать'}
                            <input
                              hidden
                              type="file"
                              accept="image/jpeg,image/jpg,image/png,image/webp,image/avif,image/heic,image/heif,.jpg,.jpeg,.png,.webp,.avif,.heic,.heif"
                              onChange={(event) => {
                                const input = event.currentTarget;
                                const file = input.files?.[0];

                                void stageMedia('avatar', file).finally(() => {
                                  input.value = '';
                                });
                              }}
                            />
                          </label>
                          {(profile.avatar_path || avatarFile) && (
                            <button type="button" onClick={() => { setAvatarFile(null); if (avatarPreview) URL.revokeObjectURL(avatarPreview); setAvatarPreview(null); setRemoveAvatar(true); setSaved(''); }}>Сбросить</button>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>

                  {baseMediaError && (
                    <div className="profile-editor-v13__media-error" role="alert">
                      {baseMediaError}
                    </div>
                  )}

                  {(premiumAvatarOverride || premiumBannerOverride) && (
                    <div className="profile-editor-v17__appearance-status">
                      <strong>{premiumActive ? 'Premium-оформление сейчас перекрывает базовые медиа' : 'Premium закончился — используется статический fallback'}</strong>
                      <p>
                        {premiumActive
                          ? 'Базовый аватар и баннер остаются запасными. Итоговый preview справа показывает то, что реально видят пользователи.'
                          : 'Анимации и Premium-эффекты выключены, но сохранённые статические WEBP-версии аватара/баннера остаются активны.'}
                      </p>
                      <div className="profile-editor-v17__appearance-actions">
                        <button type="button" onClick={() => switchTab('style')}>Открыть Стиль</button>
                        <button type="button" className="is-secondary" onClick={() => void clearPremiumFallbackMedia()}>
                          Использовать базовые медиа
                        </button>
                      </div>
                    </div>
                  )}

                  <div className="profile-editor-v13__premium-callout">
                    <Icon name="crown" size={44} weight="regular" />
                    <div>
                      <strong>Хочешь анимированный баннер, glow и собственную палитру?</strong>
                      <p>Открой вкладку «Стиль» — Premium-возможности встроены в тот же редактор.</p>
                    </div>
                    <button type="button" onClick={() => switchTab('style')}>Открыть стиль</button>
                  </div>
                </section>
              </>

              {(error || saved) && (
                <div className={`profile-editor-v13__message ${error ? 'is-error' : ''}`}>{error || saved}</div>
              )}
            </div>

            <aside className="profile-editor-v13__preview-column">
              <div className="profile-editor-v13__preview-sticky">
                <div className="profile-editor-v13__preview-label">
                  <span>LIVE PREVIEW</span>
                  <small>Предпросмотр базового профиля</small>
                </div>

                <article className="profile-editor-v13__profile-preview">
                  <div className="profile-editor-v13__preview-banner">
                    {resolvedBannerPreview ? <img src={resolvedBannerPreview} alt="" aria-hidden="true" /> : <div />}
                    <span />
                  </div>
                  <div className="profile-editor-v13__preview-body">
                    <img src={resolvedAvatarPreview} alt="" />
                    <div>
                      <span>ANIMEBOX USER</span>
                      <h3>{username.trim() || 'Пользователь'}</h3>
                      <p>{bio.trim() || 'Расскажи немного о себе и своих любимых аниме.'}</p>
                    </div>
                  </div>
                </article>

                <div className="profile-editor-v13__preview-note">
                  Это итоговый профиль: базовые данные + активный Premium override или статический fallback после окончания подписки.
                </div>
              </div>
            </aside>
          </div>
        )}

        <div className="profile-editor-v13__mobile-save">
          <Link href="/profile">Отмена</Link>
          <button type="button" disabled={!dirty || saving || premiumBusy || baseMediaProcessing || Boolean(baseMediaOpening)} onClick={() => void saveProfile()}>
            {saving ? 'Сохраняем…' : 'Сохранить изменения'}
          </button>
        </div>
      </section>

      {baseMediaEditor && (
        <div
          className="premium-media-editor-modal"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !baseMediaProcessing) {
              closeBaseMediaEditor();
            }
          }}
        >
          <section
            className={`premium-media-editor-modal__dialog ${baseMediaEditor.kind === 'banner' ? 'is-banner' : 'is-avatar'}`}
            role="dialog"
            aria-modal="true"
            aria-labelledby="base-media-editor-title"
          >
            <div className="premium-media-editor-modal__top">
              <div>
                <span>{baseMediaEditor.kind === 'avatar' ? 'AVATAR' : 'BANNER'}</span>
                <h2 id="base-media-editor-title">
                  {baseMediaEditor.kind === 'avatar'
                    ? 'Настрой кадр аватара'
                    : 'Подгони баннер под профиль'}
                </h2>
                <p>
                  {baseMediaEditor.kind === 'avatar'
                    ? 'Перетащи изображение и выбери масштаб. После подтверждения AnimeBox создаст лёгкий квадратный WEBP, который одинаково выглядит в профиле, комментариях и меню.'
                    : 'Перетащи изображение внутри широкой рамки. После подтверждения AnimeBox подготовит облегчённый WEBP под баннер профиля.'}
                </p>
              </div>
              <button
                type="button"
                className="premium-media-editor-modal__close"
                onClick={closeBaseMediaEditor}
                disabled={baseMediaProcessing}
                aria-label="Закрыть редактор"
              >
                ×
              </button>
            </div>

            <PremiumMediaCropEditor
              kind={baseMediaEditor.kind}
              src={baseMediaEditor.src}
              value={baseMediaEditor.transform}
              onChange={(transform) =>
                setBaseMediaEditor((current) =>
                  current ? { ...current, transform } : current
                )
              }
            />

            <div className="premium-media-editor-modal__actions">
              <button
                type="button"
                className="is-secondary"
                onClick={closeBaseMediaEditor}
                disabled={baseMediaProcessing}
              >
                Отмена
              </button>
              <button
                type="button"
                className="is-primary"
                onClick={() => void confirmBaseMediaEditor()}
                disabled={baseMediaProcessing}
              >
                {baseMediaProcessing
                  ? 'Оптимизируем…'
                  : baseMediaEditor.kind === 'avatar'
                    ? 'Применить кадр'
                    : 'Применить подгонку'}
              </button>
            </div>
          </section>
        </div>
      )}
    </main>
  );
}
