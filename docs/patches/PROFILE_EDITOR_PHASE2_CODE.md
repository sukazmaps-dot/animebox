# Фаза 2: полный код изменённых компонентов и правил

Снимок реализации для ревью. Компоненты приведены целиком, включая контекст неизменённых обработчиков. ТЗ, точные замены тестов и ручная приёмка — в PROFILE_EDITOR_PHASE2.md.

## components/profile/ProfileEditorClient.tsx

```tsx
'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

import { useProfileEditorAnchors } from '@/hooks/useProfileEditorAnchors';
import { profileEditorAnchor, type ProfileEditorAnchor } from '@/lib/profile-editor-navigation';
import { useProfileEditorHistory } from '@/hooks/useProfileEditorHistory';
import type { ProfileEditorDraft } from '@/lib/profile-editor-draft';
import { observeProfileEditorDock } from '@/lib/profile-editor-dock';
import { FREE_BANNER_STYLES, normalizeBannerStyle, type BannerStyle } from '@/lib/profile-banner-style';

import { useAuthState } from '@/components/AuthStateProvider';
import PremiumStudioClient, { type PremiumStudioHandle } from '@/components/premium/PremiumStudioClient';
import ProfileMediaModal from '@/components/profile/ProfileMediaModal';
import PremiumMediaCropEditor from '@/components/premium/PremiumMediaCropEditor';
import AnimeBoxLoader from '@/components/ui/AnimeBoxLoader';
import ProfileWidgetEditor from '@/components/profile/ProfileWidgetEditor';
import ProfileRewardsPanel from '@/components/profile/ProfileRewardsPanel';
import ProgressionOverview from '@/components/progression/ProgressionOverview';
import ProfileDirectEditSurface from '@/components/profile/ProfileDirectEditSurface';
import ProfileEditorLivePreview, { type ProfileEditorSection } from '@/components/profile/ProfileEditorLivePreview';
import TelegramAccountLinkCard from '@/components/profile/TelegramAccountLinkCard';
import Icon from '@/components/Icon';
import { notifyAuthChanged } from '@/lib/auth-events';
import { usernamePolicyError } from '@/lib/auth-identity-policy';
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
import { prepareBaseProfileMedia, extractDominantColor } from '@/lib/profile-media-crop-client';
import { normalizePickedImage } from '@/lib/profile-media-normalize-client';
import type { ProfileWidgetsData } from '@/types/profile-widgets';
import {DEFAULT_PREMIUM_STUDIO_SETTINGS,type PremiumMediaTransform,type PremiumStudioSettings} from '@/lib/premium-studio';
import {themeShareData} from '@/lib/profile-theme-share';

type EditorTab = 'profile' | 'style' | 'showcase' | 'rewards';

type ProfileRow = {
  id: string;
  username: string | null;
  bio: string | null;
  avatar_path: string | null;
  banner_path: string | null;
  banner_color?: string;
  banner_color_mode?: 'auto' | 'manual';
  banner_style?: BannerStyle | null;
  created_at: string;
};

type Props = {
  initialTab?: EditorTab | 'avatar' | 'banner' | 'frame';
  initialAnchor?: ProfileEditorAnchor;
};

type BaseMediaEditorState = {
  kind: 'avatar' | 'banner';
  file: File;
  src: string;
  transform: PremiumMediaTransform;
};

function normalizedTab(value: string | null | undefined): EditorTab {
  if (value === 'style' || value === 'premium') return 'style';
  if (value === 'avatar' || value === 'banner' || value === 'frame') return 'profile';
  if (value === 'appearance' || value === 'media') return 'profile';
  if (value === 'showcase' || value === 'widgets') return 'showcase';
  if (value === 'rewards' || value === 'awards') return 'rewards';
  return 'profile';
}

export default function ProfileEditorClient(props: Props) {
  const {user}=useAuthState();
  // A new account must never inherit the previous account's in-memory draft/files.
  return <ProfileEditorWorkspace key={user?.id ?? 'guest'} {...props} />;
}

function ProfileEditorWorkspace({ initialTab = 'profile', initialAnchor }: Props) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const {
    user,
    loading: authLoading,
    refresh: refreshAuth,
  } = useAuthState();

  const savebarRef = useCallback((node: HTMLDivElement | null) => {
    if (node) return observeProfileEditorDock(node);
  }, []);

  const [activeTab, setActiveTab] = useState<EditorTab>(normalizedTab(initialTab));
  const [selectedFrame, setSelectedFrame] = useState<string | null>(null);
  const [savedFrame, setSavedFrame] = useState<string | null>(null);
  const frameInitializedRef = useRef(false);
  const frameDraftRestoredRef = useRef(false);
  const [resetUndoAvailable,setResetUndoAvailable]=useState(false);
  const [frameLoaded, setFrameLoaded] = useState(false);
  useEffect(() => {
    document.documentElement.classList.add('ab-profile-editor-open');
    return () => document.documentElement.classList.remove('ab-profile-editor-open');
  }, []);
  const [profile, setProfile] = useState<ProfileRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState('');

  useEffect(() => {
    if (!saved) return;
    const timer = window.setTimeout(() => setSaved(''), 3500);
    return () => window.clearTimeout(timer);
  }, [saved]);

  const [username, setUsername] = useState('');
  const [bio, setBio] = useState('');
  const [bannerColor, setBannerColor] = useState('#70618c');
  const [bannerColorMode, setBannerColorMode] = useState<'auto' | 'manual'>('auto');
  const [bannerStyle, setBannerStyle] = useState<BannerStyle>('soft');
  const bannerColorRequestRef = useRef(0);
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
  const [premiumDraft, setPremiumDraft] = useState<PremiumStudioSettings | null>(null);
  const [comparing, setComparing] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [premiumActive, setPremiumActive] = useState(false);
  const premiumStudioRef = useRef<PremiumStudioHandle | null>(null);
  const [premiumDirty, setPremiumDirty] = useState(false);
  const [premiumBusy, setPremiumBusy] = useState(false);
  const [showcase, setShowcase] = useState<ProfileWidgetsData | null>(null);
  const [showcaseMaxFavorites, setShowcaseMaxFavorites] = useState(6);
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
      .select('id, username, bio, avatar_path, banner_path, banner_color, banner_color_mode, banner_style, created_at')
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
        setBannerColor(next.banner_color ?? '#70618c');
        setBannerColorMode(next.banner_color_mode ?? 'auto');
        setBannerStyle(normalizeBannerStyle(next.banner_style));
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
    queueMicrotask(() => {
      if (!active) return;
      setShowcaseLoading(true);
      setShowcaseError('');
    });

    void communityRequest<{
      ok: boolean;
      widgets: ProfileWidgetsData;
      capabilities?: {
        extraShowcases?: boolean;
        maxFavorites?: number;
      };
    }>('profile-widgets')
      .then((payload) => {
        if (!active) return;
        setShowcase(payload.widgets);
        setShowcaseMaxFavorites(
          Number.isSafeInteger(payload.capabilities?.maxFavorites)
            ? Math.max(6, Number(payload.capabilities?.maxFavorites))
            : 6,
        );
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
    const requestRef = baseMediaRequestRef;
    const colorRequestRef = bannerColorRequestRef;
    return () => {
      requestRef.current++;
      colorRequestRef.current++;
      if (baseMediaPreviewUrlRef.current) {
        URL.revokeObjectURL(baseMediaPreviewUrlRef.current);
        baseMediaPreviewUrlRef.current = null;
      }
    };
  }, []);


  function switchTab(tab: EditorTab) {
    document.querySelector<HTMLElement>('.profile-editor-v13')?.scrollTo({ top: 0 });
    setComparing(false);
    setActiveTab(tab);
    setError('');
    setSaved('');
    const url = tab === 'profile' ? '/profile/edit' : `/profile/edit?tab=${tab}`;
    window.history.replaceState(window.history.state, '', url);
  }

  useEffect(() => {
    const updateViewport = () => {
      const vp = window.visualViewport;
      document.documentElement.style.setProperty('--ab-editor-viewport-height', `${vp?.height ?? window.innerHeight}px`);
      document.documentElement.style.setProperty('--ab-editor-viewport-top', `${vp?.offsetTop ?? 0}px`);
      const keyboardInset = Math.max(0, window.innerHeight - ((vp?.offsetTop ?? 0) + (vp?.height ?? window.innerHeight)));
      document.documentElement.toggleAttribute('data-profile-editor-keyboard',keyboardInset>120);
      if(keyboardInset>120 && document.activeElement instanceof HTMLElement && document.activeElement.matches('.profile-editor-v13 input,.profile-editor-v13 textarea')) {
        document.activeElement.scrollIntoView({block:'nearest'});
      }
      document.documentElement.style.setProperty('--ab-editor-keyboard-inset', `${keyboardInset}px`);
    };
    updateViewport();
    window.visualViewport?.addEventListener('resize', updateViewport);
    window.visualViewport?.addEventListener('scroll', updateViewport);
    return () => {
      document.documentElement.removeAttribute('data-profile-editor-keyboard');
      window.visualViewport?.removeEventListener('resize', updateViewport);
      window.visualViewport?.removeEventListener('scroll', updateViewport);
      document.documentElement.style.removeProperty('--ab-editor-viewport-height');
      document.documentElement.style.removeProperty('--ab-editor-viewport-top');
      document.documentElement.style.removeProperty('--ab-editor-keyboard-inset');
    };
  }, []);

  function leaveEditor() {
    if (dirty && !window.confirm('Есть несохранённые изменения. Выйти без сохранения?')) return;
    router.push('/profile');
  }

  function cancelChanges() {
    if (!dirty && !premiumDirty) return;
    editorHistory.checkpoint();
    editorHistory.discard();
    resetDraft();
    setResetUndoAvailable(true);
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

    if (kind === 'banner' && !premiumActive) {
      setBaseMediaError('Изображение баннера доступно с Premium. Без Premium выбери цвет.');
      return;
    }
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
        premiumActive,
      );
      const preview = URL.createObjectURL(optimized);

      if (editor.kind === 'avatar') {
        if (bannerColorMode === 'auto') {
          bannerColorRequestRef.current++;
          try { setBannerColor(await extractDominantColor(optimized)); }
          catch { console.warn('[ProfileMedia] color sampling unavailable'); }
        }
        setAvatarFile(optimized);
        setAvatarPreview(preview);
        setRemoveAvatar(false);
        setSaved('Кадр аватара подготовлен и оптимизирован — нажми «Сохранить изменения».');
      } else {
        setBannerFile(optimized);
        setBannerPreview(preview);
        setRemoveBanner(false);
        setSaved('Баннер подогнан и оптимизирован — нажми «Сохранить изменения».');
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
  const currentBannerUrl = premiumActive ? publicMediaUrl(profile?.banner_path) : null;
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
    : null;
  const premiumAvatarOverride = Boolean(
    premiumActive ? premiumAnimatedAvatar || premiumStaticAvatar : premiumStaticAvatar,
  );
  const premiumBannerOverride = Boolean(
    premiumActive && (premiumAnimatedBanner || premiumStaticBanner),
  );

  const baseDirty = Boolean(
    profile && (
      username.trim() !== (profile.username ?? '').trim() ||
      bio.trim() !== (profile.bio ?? '').trim() ||
      bannerColor !== (profile.banner_color ?? '#70618c') ||
      bannerColorMode !== (profile.banner_color_mode ?? 'auto') ||
      bannerStyle !== normalizeBannerStyle(profile.banner_style) ||
      avatarFile ||
      bannerFile ||
      removeAvatar ||
      removeBanner
    )
  );
  const frameDirty = frameLoaded && selectedFrame !== savedFrame;
  const dirty = baseDirty || (premiumActive && premiumDirty) || frameDirty;
  const editorBusy=saving||premiumBusy||baseMediaProcessing||Boolean(baseMediaOpening)||Boolean(baseMediaEditor);
  const editorDraft = useMemo<ProfileEditorDraft>(() => ({
    username,bio,bannerColor,bannerColorMode,bannerStyle,frame:selectedFrame,
    premium:premiumDraft ?? premiumSettings,avatar:avatarFile,banner:bannerFile,removeAvatar,removeBanner,
  }),[username,bio,bannerColor,bannerColorMode,bannerStyle,selectedFrame,premiumDraft,premiumSettings,avatarFile,bannerFile,removeAvatar,removeBanner]);
  const applyEditorDraft = useCallback((next:ProfileEditorDraft) => {
    bannerColorRequestRef.current++;
    setUsername(next.username);setBio(next.bio);setBannerColor(next.bannerColor);
    setBannerColorMode(next.bannerColorMode);setBannerStyle(normalizeBannerStyle(next.bannerStyle));
    frameDraftRestoredRef.current=true;setResetUndoAvailable(false);
    setSelectedFrame(next.frame);setAvatarFile(next.avatar);setBannerFile(next.banner);
    setRemoveAvatar(next.removeAvatar);setRemoveBanner(next.removeBanner);
    setAvatarPreview(next.avatar ? URL.createObjectURL(next.avatar) : null);
    setBannerPreview(next.banner ? URL.createObjectURL(next.banner) : null);
    if(next.premium)premiumStudioRef.current?.setDraft(next.premium);
    setError('');setSaved('');
  },[]);
  const editorHistory = useProfileEditorHistory({
    userId:user?.id ?? null,ready:!loading && !!profile && profile.id===user?.id && premiumDraft!==null,
    baseline:JSON.stringify([profile,premiumSettings,savedFrame]),draft:editorDraft,
    dirty:dirty || (!premiumActive && premiumDirty),onApply:applyEditorDraft,
  });
  const { activeAnchor, navigateToAnchor } = useProfileEditorAnchors(
    !loading && !!profile && activeTab === 'profile', initialAnchor ?? profileEditorAnchor(initialTab),
  );
  function navigatePreview(section: ProfileEditorSection) {
    if (section === 'style') { switchTab('style'); return; }
    if (activeTab !== 'profile') switchTab('profile');
    else setComparing(false);
    navigateToAnchor(profileEditorAnchor(section));
  }

  const fieldDirty:Record<string,boolean> = {
    profile:username.trim()!==(profile?.username ?? '').trim() || bio.trim()!==(profile?.bio ?? '').trim(),
    avatar:!!avatarFile||removeAvatar,
    banner:!!bannerFile||removeBanner||bannerColor!==(profile?.banner_color ?? '#70618c')||bannerStyle!==normalizeBannerStyle(profile?.banner_style)||bannerColorMode!==(profile?.banner_color_mode ?? 'auto'),
    frame:frameDirty,style:premiumDirty,
  };
  const sectionDirty:Record<string,boolean> = {
    ...fieldDirty,
    profile: fieldDirty.profile || fieldDirty.avatar || fieldDirty.banner || fieldDirty.frame,
  };
  const configuredSections=[!!(username.trim()&&bio.trim()),!!(avatarFile||profile?.avatar_path),!!(bannerFile||profile?.banner_path||bannerColorMode==='manual'),!!selectedFrame,!!premiumDraft && JSON.stringify(themeShareData(premiumDraft))!==JSON.stringify(themeShareData(DEFAULT_PREMIUM_STUDIO_SETTINGS))].filter(Boolean).length;
  // Expired Premium users can edit ordinary fields without repurchasing an unchanged
  // legacy Premium fill. Only a newly selected paid style or recolor needs upsell.
  const bannerFillUpgradeRequired = !premiumActive &&
    !FREE_BANNER_STYLES.includes(bannerStyle) &&
    (bannerStyle !== normalizeBannerStyle(profile?.banner_style) ||
      bannerColor.toLowerCase() !== (profile?.banner_color ?? '#70618c').toLowerCase());
  const needsPremiumCTA = bannerFillUpgradeRequired || (!premiumActive && activeTab === 'style' && !baseDirty);
  // Native Telegram back follows the same draft confirmation as the close button.
  useEffect(() => {
    const tg = (window as Window & {Telegram?:{WebApp?:{BackButton?:{
      show?:()=>void; hide?:()=>void; onClick?:(handler:()=>void)=>void; offClick?:(handler:()=>void)=>void;
    }}}}).Telegram?.WebApp?.BackButton;
    if (!tg) return;
    const back = () => {
      if (dirty && !window.confirm('Есть несохранённые изменения. Выйти без сохранения?')) return;
      router.push('/profile');
    };
    tg.show?.(); tg.onClick?.(back);
    return () => { tg.offClick?.(back); tg.hide?.(); };
  }, [dirty,router]);


  useEffect(() => {
    if (!dirty) return;
    const confirmUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', confirmUnload);
    return () => window.removeEventListener('beforeunload', confirmUnload);
  }, [dirty]);



  async function saveProfile() {
    if (!profile || !user || editorBusy || !dirty) return;

    const cleanUsername = username.trim();
    const cleanBio = bio.trim();

    setError('');
    setSaved('');

    const usernameError = usernamePolicyError(cleanUsername);
    if (usernameError) {
      setError(usernameError);
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

      const studioDraft = premiumActive && premiumDirty ? premiumStudioRef.current?.getDraft() ?? premiumSettings : null;
      let payload: {profile?: ProfileRow; settings?: PremiumStudioSettings; error?: string} = {};
      if (baseDirty || (premiumActive && premiumDirty)) {
        const response = await profileMediaFetchWithTimeout('/api/profile/editor', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ...(baseDirty
              ? { profile: {
                  username: cleanUsername, bio: cleanBio,
                  avatarPath: finalAvatarPath, bannerPath: finalBannerPath,
                  bannerColor, bannerColorMode, bannerStyle,
                } }
              : {}),
            ...(premiumActive && premiumDirty && studioDraft ? { studio: studioDraft } : {}),
            ...(pendingMedia.length ? { pendingMedia } : {}),
          }),
        }, 20_000);
        payload = (await response.json()) as typeof payload;
        if (!response.ok) {
          if (pendingMedia.length) await discardPrivateProfileMedia(pendingMedia);
          throw new Error(payload.error || 'Не удалось сохранить профиль.');
        }
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
      setBannerColor(next.banner_color ?? bannerColor);
      setBannerColorMode(next.banner_color_mode ?? bannerColorMode);
      setBannerStyle(normalizeBannerStyle(next.banner_style));
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

      if (frameDirty) {
        try {
          const frameResponse = await fetch('/api/community/leaderboard-rewards', {
            method: 'POST', cache: 'no-store',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'select_frame', frameKey: selectedFrame }),
          });
          const frameResult = (await frameResponse.json()) as {error?:string;selectedFrame?:string|null};
          if (!frameResponse.ok) throw new Error(frameResult.error || 'Не удалось сохранить рамку.');
          setSavedFrame(frameResult.selectedFrame ?? null);
          window.dispatchEvent(new Event('animebox:profile-cosmetic-changed'));
        } catch (frameError) {
          // Base/media updates have already committed; never delete those files here.
          setError('Профиль сохранён, но рамку выбрать не удалось: ' +
            (frameError instanceof Error ? frameError.message : 'Повтори попытку.'));
          return;
        }
      }
      editorHistory.discard();setResetUndoAvailable(false);
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

  function resetDraft() {
    if (!profile) return;
    setSelectedFrame(savedFrame);
    bannerColorRequestRef.current++;
    setUsername(profile.username ?? '');
    setBio(profile.bio ?? '');
    setBannerColor(profile.banner_color ?? '#70618c');
    setBannerColorMode(profile.banner_color_mode ?? 'auto');
    setBannerStyle(normalizeBannerStyle(profile.banner_style));
    setAvatarFile(null);
    setBannerFile(null);
    setRemoveAvatar(false);
    setRemoveBanner(false);
    if (avatarPreview) URL.revokeObjectURL(avatarPreview);
    if (bannerPreview) URL.revokeObjectURL(bannerPreview);
    setAvatarPreview(null);
    setBannerPreview(null);
    setBaseMediaError('');
    setError('');
    setSaved('Черновик сброшен.');
    if (premiumDirty) {
      premiumStudioRef.current?.markSaved(premiumSettings ?? DEFAULT_PREMIUM_STUDIO_SETTINGS);
      setPremiumDirty(false);
    }
  }

  useEffect(()=>{
    const keydown=(event:KeyboardEvent)=>{
      if(!(event.ctrlKey||event.metaKey))return;
      if(event.key.toLowerCase()==='s') {
        event.preventDefault();
        if(!document.querySelector('dialog[open],[aria-modal="true"]'))document.querySelector<HTMLButtonElement>('[data-editor-save]')?.click();
        return;
      }
      if(editorBusy || document.querySelector('dialog[open],[aria-modal="true"]'))return;
      const target=event.target as HTMLElement;
      // Text inputs keep native undo; the toolbar undoes changes across sections.
      if(target.closest('input,textarea,[contenteditable="true"]'))return;
      if(event.key.toLowerCase()==='z'){event.preventDefault();if(event.shiftKey)editorHistory.redo();else editorHistory.undo();}
      if(event.key.toLowerCase()==='y'){event.preventDefault();editorHistory.redo();}
    };
    window.addEventListener('keydown',keydown);
    return()=>window.removeEventListener('keydown',keydown);
  });

  useEffect(()=>{
    if(!resetUndoAvailable)return;
    const timer=setTimeout(()=>setResetUndoAvailable(false),8000);
    return()=>clearTimeout(timer);
  },[resetUndoAvailable]);

  async function clearPremiumFallbackMedia(media: 'avatar' | 'banner' | 'all' = 'all') {
    if (!user?.id) return;
    setError('');
    setSaved('');
    try {
      const response = await fetch(`/api/premium/studio?media=${media}`, { method: 'DELETE' });
      const payload = (await response.json()) as { settings?: PremiumStudioSettings; error?: string };
      if (!response.ok) throw new Error(payload.error || 'Не удалось вернуть базовые медиа.');
      setPremiumSettings(payload.settings ?? null);
      setSaved(
        media === 'avatar'
          ? 'Снова используется базовый аватар ✓'
          : media === 'banner'
            ? 'Снова используется базовый баннер ✓'
            : 'Снова используются базовые аватар и баннер ✓',
      );
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
          <div className="profile-editor-v31__header-title">
            <button type="button" onClick={leaveEditor} aria-label="Закрыть редактор">×</button>
            <h1>Редактор профиля</h1>
          </div>
          <span className="profile-editor-v31__status" role="status" aria-live="polite">{saving ? 'Сохранение…' : dirty ? '● Не сохранено' : '✓ Сохранено'}</span>
        </header>

        <div className="profile-editor-v31__live-preview">
          <button type="button" className="profile-editor-v31__expand" onClick={() => setPreviewOpen(true)}>⤢ Развернуть превью</button>
          <ProfileEditorLivePreview
            username={comparing ? profile.username ?? '' : username} bio={comparing ? profile.bio ?? '' : bio} avatarUrl={comparing ? displayedAvatar : resolvedAvatarPreview}
            bannerUrl={comparing ? displayedBanner : resolvedBannerPreview} bannerColor={comparing ? profile.banner_color ?? '#70618c' : bannerColor}
            bannerStyle={comparing ? normalizeBannerStyle(profile.banner_style) : bannerStyle} premiumActive={premiumActive}
            frameKey={comparing ? savedFrame : selectedFrame} onNavigate={navigatePreview}
            previewPremiumFill={bannerFillUpgradeRequired}
          />
        </div>

        <nav className="profile-editor-v13__tabs profile-editor-v18__rail" aria-label="Разделы редактора профиля">
          {([
            ['profile','Профиль','user'],
            ['style','Оформление','crown'],
            ['showcase','Витрина','image'],
            ['rewards','Награды','trophy'],
          ] as const).map(([section,label,icon]) => (
            <button key={section} data-section={section} data-dirty={sectionDirty[section] || undefined} className={activeTab === section ? 'is-active' : ''}
              aria-current={activeTab===section?'page':undefined} type="button" onClick={()=>switchTab(section)}>
              <Icon name={icon} size={17} weight="regular" /><span>{label}</span>
            </button>
          ))}
        </nav>

        <fieldset className="profile-editor-v31__settings" disabled={editorBusy}>
        <div className="profile-editor-v31__tools">
          <span>Настроено {configuredSections} из 5</span>
          <button type="button" disabled={!editorHistory.canUndo || editorBusy} onClick={editorHistory.undo} title="Отменить изменение (Ctrl+Z)">↶</button>
          <button type="button" disabled={!editorHistory.canRedo || editorBusy} onClick={editorHistory.redo} title="Вернуть изменение (Ctrl+Shift+Z)">↷</button>
          <button type="button" aria-pressed={comparing}
            onPointerDown={event=>{event.currentTarget.setPointerCapture(event.pointerId);setComparing(true);}}
            onPointerUp={()=>setComparing(false)} onPointerCancel={()=>setComparing(false)} onBlur={()=>setComparing(false)}
            onKeyDown={event=>{if(event.key===' '||event.key==='Enter'){event.preventDefault();setComparing(true);}}}
            onKeyUp={()=>setComparing(false)}>Сравнить</button>
        </div>
        {editorHistory.recovery && <div className="profile-editor-v31__recovery" role="status">
          <span>На устройстве есть несохранённый черновик.</span>
          <button type="button" disabled={editorBusy} onClick={editorHistory.restore}>Восстановить</button>
          <button type="button" disabled={editorBusy} onClick={editorHistory.discard}>Удалить</button>
        </div>}
        {editorHistory.notice && <p className="profile-editor-v31__draft-note">{editorHistory.notice}</p>}
        <div className="profile-editor-v13__premium-tab" hidden={activeTab !== 'style'}>
            <PremiumStudioClient
              ref={premiumStudioRef}
              embedded
              hideDock
              comparing={comparing}
              onDraftChange={setPremiumDraft}
              initialSettings={premiumSettings}
              initialAllowed={premiumActive}
              previewUsername={username}
              previewBio={bio}
              fallbackAvatarUrl={resolvedAvatarPreview}
              fallbackBannerUrl={resolvedBannerPreview}
              onDirtyChange={setPremiumDirty}
              onBusyChange={setPremiumBusy}
              onSettingsCommitted={(settings) => {
                setPremiumSettings(settings);
                setPremiumDirty(false);
              }}
            />
          </div>
        {(error || baseMediaError) && (
          <div className="profile-editor-v31__error" role="alert">{baseMediaError || error}</div>
        )}
        {activeTab === 'rewards' ? (
          <div className="profile-editor-v13__showcase-tab profile-editor-v18__rewards-tab">
            <ProgressionOverview />
            <ProfileRewardsPanel />
          </div>
        ) : activeTab === 'showcase' ? (
          <div className="profile-editor-v13__showcase-tab">
            <div className="profile-editor-v13__section-title profile-editor-v13__showcase-title">
              <div>
                <span>ВИТРИНА ПРОФИЛЯ</span>
                <h2>Витрина профиля</h2>
                <p>Настрой порядок блоков и закрепи любимые аниме — всё в одном месте.</p>
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
                maxFavorites={showcaseMaxFavorites}
                onSaved={(widgets) => {
                  setShowcase(widgets);
                  setSaved('Витрина сохранена ✓');
                }}
              />
            )}
          </div>
        ) : null}

          <div className="profile-editor-v19__direct-tab" hidden={activeTab !== 'profile'}>
          <nav className="profile-editor-v32__anchors" data-profile-anchor-nav aria-label="Настройки профиля">
            {([['name','Имя'],['avatar','Аватар'],['banner','Баннер'],['frame','Рамка']] as const).map(([anchor,label]) => (
              <button type="button" key={anchor} aria-current={activeAnchor === anchor ? 'location' : undefined}
                onClick={() => navigateToAnchor(anchor)}>{label}</button>
            ))}
          </nav>
            <ProfileDirectEditSurface
            section="profile"
            showPreview={false}
            onSectionChange={navigatePreview}
            onFrameChange={setSelectedFrame}
            selectedFrameDraft={frameLoaded ? selectedFrame : undefined}
            onFrameLoaded={frame => {
              if (frameInitializedRef.current) return;
              frameInitializedRef.current = true;
              setFrameLoaded(true);
              if(!frameDraftRestoredRef.current)setSelectedFrame(frame);
              setSavedFrame(frame);
            }}
            username={username}
            bio={bio}
            avatarUrl={resolvedAvatarPreview}
            bannerUrl={resolvedBannerPreview}
            baseAvatarUrl={displayedAvatar}
            baseBannerUrl={displayedBanner}
            bannerColor={bannerColor}
            bannerColorMode={bannerColorMode}
            bannerStyle={bannerStyle}
            onBannerStyleChange={(style) => { setBannerStyle(style); setSaved(''); setBaseMediaError(''); }}
            onBannerColorChange={async (color, mode, skipSampling) => {
              const request = ++bannerColorRequestRef.current;
              setBannerColorMode(mode); setSaved(''); setBaseMediaError('');
              // Once Premium expires, selecting a new color falls back to a free fill.
              // A saved Premium fill remains visible until explicitly edited.
              if (!premiumActive && !FREE_BANNER_STYLES.includes(bannerStyle) && bannerStyle === normalizeBannerStyle(profile.banner_style)) setBannerStyle('soft');
              if (mode === 'manual' || skipSampling) { setBannerColor(color); return; }
              try {
                const file = avatarFile ?? new File([await (await fetch(displayedAvatar)).blob()], 'avatar');
                const sampled = await extractDominantColor(file);
                if (request === bannerColorRequestRef.current) setBannerColor(sampled);
              } catch { if (request === bannerColorRequestRef.current) setBaseMediaError('Не удалось подобрать цвет. Выбери его вручную.'); }
            }}
            premiumActive={premiumActive}
            avatarPremiumOverride={premiumAvatarOverride}
            bannerPremiumOverride={premiumBannerOverride}
            avatarBusy={baseMediaOpening === 'avatar'}
            bannerBusy={baseMediaOpening === 'banner'}
            canRemoveAvatar={Boolean(profile.avatar_path || avatarFile)}
            canRemoveBanner={Boolean(profile.banner_path || bannerFile)}
            error={baseMediaError || error}
            message=""
            onUsernameChange={(value) => {
              setUsername(value);
              setSaved('');
            }}
            onBioChange={(value) => {
              setBio(value);
              setSaved('');
            }}
            onAvatarFile={(file) => stageMedia('avatar', file)}
            onBannerFile={(file) => stageMedia('banner', file)}
            onRemoveAvatar={() => {
              setAvatarFile(null);
              if (avatarPreview) URL.revokeObjectURL(avatarPreview);
              setAvatarPreview(null);
              setRemoveAvatar(true);
              setSaved('');
            }}
            onRemoveBanner={() => {
              setBannerFile(null);
              if (bannerPreview) URL.revokeObjectURL(bannerPreview);
              setBannerPreview(null);
              setRemoveBanner(true);
              setSaved('');
            }}
            onUseBaseAvatar={() => clearPremiumFallbackMedia('avatar')}
            onUseBaseBanner={() => clearPremiumFallbackMedia('banner')}
            onOpenPremium={() => switchTab('style')}
          />

          <TelegramAccountLinkCard />
          </div>

        </fieldset>

        <div ref={savebarRef} data-visible="true" className={`profile-editor-v13__mobile-save profile-editor-v18__savebar ${dirty ? 'is-dirty' : ''}`} >
          <span className="profile-editor-v18__savebar-copy">
            <strong>Правки видны в предпросмотре</strong>
            {resetUndoAvailable && <button type="button" disabled={editorBusy} onClick={()=>{editorHistory.undo();setResetUndoAvailable(false);}}>Вернуть сброшенное</button>}
            {error ? <small className="profile-editor-v31__error" role="alert">{error}</small> : dirty && <small>Изменения ещё не сохранены.</small>}
          </span>
          <button type="button" className="profile-editor-v18__reset" disabled={editorBusy || (!dirty && !premiumDirty)} onClick={cancelChanges}>
            Сбросить
          </button>
          <button type="button" data-editor-save disabled={(!dirty && !needsPremiumCTA) || saving || premiumBusy || baseMediaProcessing || Boolean(baseMediaOpening)}
            onClick={() => needsPremiumCTA ? router.push('/premium#premium-plans') : void saveProfile()}>
            {saving ? 'Сохраняем…' : needsPremiumCTA ? 'Сохранить с Premium' : 'Сохранить'}
          </button>
        </div>
      </section>

      {previewOpen && <ProfileMediaModal busy={false} onClose={()=>setPreviewOpen(false)} labelledBy="profile-expanded-preview-title">
        <section className="profile-editor-v31__preview-dialog">
          <header><h2 id="profile-expanded-preview-title">Предпросмотр профиля</h2><button type="button" onClick={()=>setPreviewOpen(false)}>Закрыть</button></header>
          <ProfileEditorLivePreview expanded username={username} bio={bio} avatarUrl={resolvedAvatarPreview}
            bannerUrl={resolvedBannerPreview} bannerColor={bannerColor} bannerStyle={bannerStyle}
            premiumActive={premiumActive} frameKey={selectedFrame} previewPremiumFill={bannerFillUpgradeRequired}
            onNavigate={section=>{setPreviewOpen(false);navigatePreview(section);}} />
        </section>
      </ProfileMediaModal>}

      {baseMediaEditor && (
        <ProfileMediaModal busy={baseMediaProcessing} onClose={closeBaseMediaEditor} labelledBy="base-media-editor-title">
          <section
            className={`premium-media-editor-modal__dialog ${baseMediaEditor.kind === 'banner' ? 'is-banner' : 'is-avatar'}`}
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
                    ? 'Перетащи изображение и выбери масштаб. Выбранный кадр будет виден в профиле, комментариях и меню.'
                    : 'Перетащи изображение внутри рамки и выбери кадр для баннера.'}
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
              baked
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
        </ProfileMediaModal>
      )}
    </main>
  );
}
```

## components/profile/ProfileDirectEditSurface.tsx

```tsx
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
  const frameRequestRef = useRef<Promise<FramePayload> | null>(null);
  const avatarInputRef = useRef<HTMLInputElement | null>(null);
  const bannerInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    let active = true;

    const load = () => {
      setFrameLoading(true);
      if (!frameRequestRef.current) {
        frameRequestRef.current = fetch('/api/community/leaderboard-rewards', { cache: 'no-store' })
          .then(async response => {
            const payload = await response.json() as FramePayload;
            if (!response.ok) throw new Error(payload.error || 'Не удалось загрузить рамки.');
            return payload;
          }).finally(() => { frameRequestRef.current = null; });
      }
      void frameRequestRef.current
        .then(payload => {
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
                onClick={() => onSectionChange?.('frame')}
                title="Открыть инвентарь рамок"
              >
                <span className={styles.frameDot} />
                {activeFrameLabel}
                {isLevelFrameKey(selectedFrame) && premiumActive && <b>АНИМАЦИЯ PREMIUM</b>}
              </button>

              {editingBio ? (
                <textarea
                  className={styles.inlineBio}
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

      <div className={styles.cardStack}>
      <section id="profile-editor-name" data-profile-anchor="name" className={styles.inspector} aria-label="Имя и описание">
        <div className={styles.inspectorHead}><h3>Имя и описание</h3></div>
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

      </section>
      <section id="profile-editor-avatar" data-profile-anchor="avatar" className={styles.inspector} aria-label="Аватар и рамка">
        <div className={styles.inspectorHead}><h3>Аватар и рамка</h3></div>
        <>
            <div className={styles.inspectorSection}>
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
            </div>

            <div id="profile-editor-frame" data-profile-anchor="frame" className={styles.inventorySection}>
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
            </div>
          </>   </section>
      <section id="profile-editor-banner" data-profile-anchor="banner" className={styles.inspector} aria-label="Баннер">
        <div className={styles.inspectorHead}><h3>Баннер</h3></div>
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

      </section>
      </div>

    </div>
  );
}
```

## components/profile/ProfileEditorLivePreview.tsx

```tsx
'use client';
import ProfileFrameOverlay from '@/components/profile/ProfileFrameOverlay';
import { bannerStyleBackground, visibleBannerStyle, type BannerStyle } from '@/lib/profile-banner-style';
import styles from './ProfileEditorLivePreview.module.css';

// Preview targets include legacy deep-link anchors, independently of the four navigation tabs.
export type ProfileEditorSection = 'profile' | 'avatar' | 'banner' | 'frame' | 'style';
type Props = {
  expanded?: boolean; username: string; bio: string; avatarUrl: string; bannerUrl: string | null;
  bannerColor: string; bannerStyle: BannerStyle; premiumActive: boolean;
  frameKey?: string | null;
  previewPremiumFill?: boolean;
  onNavigate: (section: ProfileEditorSection) => void;
};
export default function ProfileEditorLivePreview({
  expanded=false, username, bio, avatarUrl, bannerUrl, bannerColor, bannerStyle,
  premiumActive, frameKey, previewPremiumFill=false, onNavigate,
}: Props) {
  const background = bannerStyleBackground(bannerColor, previewPremiumFill ? bannerStyle : visibleBannerStyle(bannerStyle, premiumActive));
  return (
    <section className={`${styles.preview} ${expanded ? styles.expanded : ""}`} aria-label="Живой предпросмотр профиля">
      <button type="button" className={styles.banner}
        style={{ background }} onClick={() => onNavigate('banner')} aria-controls="profile-editor-banner" aria-label="Настроить баннер">
        {bannerUrl && <img src={bannerUrl} alt="" />}
        <span className={styles.shade} aria-hidden="true" />
        <span className={styles.editBanner}>✎ Баннер</span>
      </button>
      <div className={styles.identity}>
        <button type="button" className={styles.avatar} onClick={() => onNavigate('avatar')} aria-controls="profile-editor-avatar" aria-label="Настроить аватар">
          <img src={avatarUrl} alt="" />
          <ProfileFrameOverlay frameKey={frameKey ?? null} premium={premiumActive} />
          <span className={styles.editAvatar} aria-hidden="true">✎</span>
        </button>
        <div className={styles.copy}>
          <button className={styles.name} type="button" onClick={() => onNavigate('profile')}
            aria-controls="profile-editor-name" title={username.trim() || 'Пользователь'}>{username.trim() || 'Пользователь'} <span>✎</span></button>
          <p className={styles.bio} title={bio}>{bio.trim() || 'Добавь пару слов о себе…'}</p>
        </div>
      </div>
    </section>
  );
}
```

## app/profile/edit/page.tsx

```tsx
import type { Metadata } from 'next';

import { profileEditorAnchor } from '@/lib/profile-editor-navigation';
import ProfileEditorClient from '@/components/profile/ProfileEditorClient';

export const metadata: Metadata = {
  title: 'Редактор профиля',
  robots: { index: false, follow: false },
};

type PageProps = {
  searchParams: Promise<{ tab?: string }>;
};

export default async function ProfileEditPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const tab =
    params.tab === 'style' || params.tab === 'premium'
      ? 'style'
      : params.tab === 'appearance' || params.tab === 'media'
        ? 'profile'
        : params.tab === 'showcase' || params.tab === 'widgets'
          ? 'showcase'
          : params.tab === 'rewards' || params.tab === 'awards'
            ? 'rewards'
            : 'profile';

  return <ProfileEditorClient initialTab={tab} initialAnchor={profileEditorAnchor(params.tab)} />;
}
```

## hooks/useProfileEditorAnchors.ts

```ts
'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import type { ProfileEditorAnchor } from '@/lib/profile-editor-navigation';

/** The editor root owns scrolling. Navigation never focuses an input or opens a picker. */
export function useProfileEditorAnchors(enabled: boolean, initialAnchor: ProfileEditorAnchor) {
  const [activeAnchor, setActiveAnchor] = useState<ProfileEditorAnchor>(initialAnchor);
  const [request, setRequest] = useState<{ anchor: ProfileEditorAnchor; sequence: number } | null>(null);
  const initialApplied = useRef(false);
  const navigateToAnchor = useCallback((anchor: ProfileEditorAnchor) => {
    setRequest(previous => ({ anchor, sequence: (previous?.sequence ?? 0) + 1 }));
  }, []);

  useEffect(() => {
    if (!enabled) return;
    const root = document.querySelector<HTMLElement>('.profile-editor-v13');
    const chips = document.querySelector<HTMLElement>('[data-profile-anchor-nav]');
    const header = root?.querySelector<HTMLElement>('.profile-editor-v13__header');
    const preview = root?.querySelector<HTMLElement>('.profile-editor-v31__live-preview');
    const navigation = root?.querySelector<HTMLElement>('.profile-editor-v18__rail');
    if (!root || !chips) return;
    const anchors = [...root.querySelectorAll<HTMLElement>('[data-profile-anchor]')];
    let frame = 0;
    const measure = () => {
      frame = 0;
      const compact = window.matchMedia('(max-width: 899px)').matches;
      const horizontalNavigation = window.matchMedia('(min-width: 900px) and (max-width: 1179px)').matches;
      const top = (header?.getBoundingClientRect().height ?? 0) +
        (compact && preview ? preview.getBoundingClientRect().height : 0) +
        (horizontalNavigation && navigation ? navigation.getBoundingClientRect().height : 0);
      root.style.setProperty('--profile-editor-chips-top', `${top}px`);
      const offset = top + chips.getBoundingClientRect().height + 12;
      root.style.setProperty('--profile-editor-anchor-offset', `${offset}px`);
      const threshold = root.getBoundingClientRect().top + offset + 2;
      const ordered = [...anchors].sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top);
      let current = ordered[0];
      for (const anchor of ordered) if (anchor.getBoundingClientRect().top <= threshold) current = anchor;
      // A short last card cannot always reach the sticky threshold before the scroll ends.
      const last = ordered.at(-1);
      if (last && root.scrollTop > 0 && root.scrollTop + root.clientHeight >= root.scrollHeight - 2) current = last;
      if (current) setActiveAnchor(current.dataset.profileAnchor as ProfileEditorAnchor);
    };
    const schedule = () => { if (!frame) frame = requestAnimationFrame(measure); };
    const observer = new ResizeObserver(schedule);
    [header, preview, navigation, chips, ...anchors].forEach(node => { if (node) observer.observe(node); });
    root.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule);
    measure();
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      root.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
      root.style.removeProperty('--profile-editor-chips-top');
      root.style.removeProperty('--profile-editor-anchor-offset');
    };
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return;
    if (!request && initialApplied.current) return;
    if (!request && initialAnchor === 'name') { initialApplied.current = true; return; }
    const anchor = request?.anchor ?? initialAnchor;
    let second = 0;
    const first = requestAnimationFrame(() => {
      second = requestAnimationFrame(() => {
        const root = document.querySelector<HTMLElement>('.profile-editor-v13');
        const target = root?.querySelector<HTMLElement>(`[data-profile-anchor="${anchor}"]`);
        if (!root || !target) return;
        initialApplied.current = true;
        const offset = parseFloat(root.style.getPropertyValue('--profile-editor-anchor-offset')) || 120;
        root.scrollTo({ top: root.scrollTop + target.getBoundingClientRect().top - root.getBoundingClientRect().top - offset,
          behavior: !request || window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
        setActiveAnchor(anchor);
        setRequest(null);
      });
    });
    return () => { cancelAnimationFrame(first); cancelAnimationFrame(second); };
  }, [enabled, initialAnchor, request]);

  return { activeAnchor, navigateToAnchor };
}
```

## lib/profile-editor-navigation.ts

```ts
export type ProfileEditorAnchor = 'name' | 'avatar' | 'banner' | 'frame';
export function profileEditorAnchor(value?: string | null): ProfileEditorAnchor {
  return value === 'avatar' || value === 'banner' || value === 'frame' ? value : 'name';
}

```

## app/profile-editor-v13.css

Полный завершающий блок владельца геометрии, включая изменённые правила и соседний контекст.

```css
.profile-editor-v13 {
  --editor-header-height: 64px;
  --editor-preview-height: 192px;
  --editor-tab-height: 56px;
  --editor-surface: var(--ab-ui-surface);
  --editor-border: color-mix(in srgb,var(--ab-ui-accent) 20%, transparent);
  position: fixed;
  top: var(--ab-editor-viewport-top,0px);
  left: 0; right: 0;
  height: var(--ab-editor-viewport-height,100dvh);
  min-height:0;
  box-sizing:border-box;
  z-index: 750;
  overflow-x: hidden;
  overflow-y: auto;
  overscroll-behavior: contain;
  scroll-padding-top: calc(var(--editor-header-height) + var(--editor-preview-height) + var(--editor-tab-height));
  padding: 0 0 calc(var(--profile-editor-savebar-height, 108px) + 32px + env(safe-area-inset-bottom) + var(--ab-editor-keyboard-inset, 0px));
  background: var(--ab-ui-canvas);
  isolation: isolate;
}
.profile-editor-v13 .profile-editor-v13__shell {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  grid-template-areas: 'header' 'preview' 'nav' 'settings';
  grid-template-rows: auto auto auto 1fr;
  align-items: start;
  max-width: 1400px;
  width: 100%;
  margin: 0 auto;
  overflow: visible;
  border: 0;
  border-radius: 0;
  background: var(--editor-surface);
}
.profile-editor-v13 .profile-editor-v13__header {
  grid-area: header;
  position: sticky;
  top: 0;
  z-index: 62;
  height: var(--editor-header-height);
  min-height: 0;
  padding: 8px max(16px,env(safe-area-inset-left));
  border-bottom: 1px solid var(--editor-border);
  background: var(--editor-surface);
}
.profile-editor-v31__header-title { display:flex;align-items:center;gap:10px;min-width:0; }
.profile-editor-v31__header-title button {
  width:44px;height:44px;flex:0 0 44px;border:0;border-radius:12px;
  background:transparent;color:var(--ab-ui-text);font-size:27px;cursor:pointer;
}
.profile-editor-v31__header-title h1 { font-size: 18px; font-weight:800; letter-spacing:-.02em; }
.profile-editor-v31__status {color:var(--ab-ui-muted);font-size:11px;white-space:nowrap; }
.profile-editor-v31__live-preview {
  grid-area: preview;
  min-width: 0;
  position: sticky;
  top: var(--editor-header-height);
  z-index: 61;
  height: var(--editor-preview-height);
  display: grid;
  align-items: center;
  background: var(--editor-surface);
  border-bottom: 1px solid var(--editor-border);
  box-shadow: 0 10px 24px rgba(0,0,0,.18);
}
.profile-editor-v13 .profile-editor-v13__tabs.profile-editor-v18__rail {
  grid-area: nav;
  position: sticky;
  top: calc(var(--editor-header-height) + var(--editor-preview-height));
  z-index: 60;
  display:flex; flex-direction:row; flex-wrap:nowrap; align-items:center; gap:5px;
  height:var(--editor-tab-height); min-height:0;
  width:100%; padding:5px 12px; overflow-x:auto;
  background:var(--editor-surface);
  border-bottom:1px solid var(--editor-border);
  scrollbar-width:none;
}
.profile-editor-v13 .profile-editor-v13__tabs.profile-editor-v18__rail button {
  display:flex; flex:1 0 auto; justify-content:center; align-items:center;
  width:auto;min-width:65px;min-height:44px;height:44px;padding:0 11px;gap:5px;
  border-radius:12px;
}
.profile-editor-v13 .profile-editor-v13__tabs.profile-editor-v18__rail button span {
  display:inline;font-size:11px;font-weight:700;line-height:1.2;font-family:inherit;color:inherit;
}
.profile-editor-v31__settings {grid-area:settings;min-width:0;min-inline-size:0;margin:0;padding:0;border:0;}
.profile-editor-v13[data-editor-tab='style'] {--editor-preview-height:0px;}
.profile-editor-v13[data-editor-tab='style'] .profile-editor-v31__live-preview {display:none;}
.profile-editor-v13 .profile-editor-v13__premium-tab[hidden] { display:none; }
.profile-editor-v13 .profile-editor-v19__direct-tab {padding: 0 16px 24px; width:100%;max-width:none;margin:0;}
.profile-editor-v13 .profile-editor-v19__direct-tab [data-settings-only='true'] {
  display:block;
  padding: 12px 0;
}
.profile-editor-v13 .profile-editor-v19__direct-tab [data-settings-only='true'] [data-profile-anchor] {
  width:100%;max-width:none;margin:0;position:static;
  box-shadow:none;
}
.profile-editor-v13 .profile-editor-v13__premium-tab,
.profile-editor-v13 .profile-editor-v13__showcase-tab {padding:12px 16px 24px;width:100%;max-width:none;margin:0;}
.profile-editor-v13 .profile-editor-v18__savebar,
.profile-editor-v13 .profile-editor-v18__savebar[data-visible='false'] {
  position:fixed;
  left:max(12px,env(safe-area-inset-left));
  right:max(12px,env(safe-area-inset-right));
  bottom:max(8px,env(safe-area-inset-bottom));
  width:min(780px,calc(100% - 24px));
  margin:0 auto;
  display:grid;
  grid-template-columns:minmax(0,1fr) auto auto;
  min-height:72px;
  z-index:800;
  gap:8px;padding:10px 12px;
  border-radius:16px;
  border:1px solid var(--editor-border);
  background:var(--editor-surface);
}
.profile-editor-v13 .profile-editor-v18__savebar button {min-width:88px;min-height:44px;width:auto;padding-inline:14px;}
.profile-editor-v13 .profile-editor-v18__savebar-copy {grid-column:auto;padding:0;}
.profile-editor-v13 .profile-editor-v18__savebar-copy small:not(.profile-editor-v31__error) {display:none;}
@media(max-width:600px) {
  .profile-editor-v13 {--editor-header-height:56px;--editor-tab-height:54px;}
  .profile-editor-v13 .profile-editor-v13__header {padding-inline:12px;}
  .profile-editor-v31__header-title h1 {font-size:16px;}
  .profile-editor-v31__status {font-size:9px;}
  .profile-editor-v13 .profile-editor-v13__tabs.profile-editor-v18__rail {padding:5px 8px;}
  .profile-editor-v13 .profile-editor-v13__tabs.profile-editor-v18__rail button {min-width:65px;padding:0 8px;}
  .profile-editor-v13 .profile-editor-v13__tabs.profile-editor-v18__rail button span {font-size:10px;}
  .profile-editor-v13 .profile-editor-v18__savebar {
    grid-template-columns:minmax(0,1fr) minmax(88px,auto) minmax(88px,auto);
    min-height:66px;align-items:center;
  }
  .profile-editor-v13 .profile-editor-v18__savebar-copy strong {font-size:10px;}
  .profile-editor-v13 .profile-editor-v18__savebar button {min-width:0;padding-inline:9px;font-size:11px;}
}
@media(max-width:365px) {
  .profile-editor-v13 .profile-editor-v18__savebar {grid-template-columns:1fr 1fr;}
  .profile-editor-v13 .profile-editor-v18__savebar-copy {grid-column:1/-1;}
}
@media(prefers-reduced-motion:reduce) {
  .profile-editor-v13 :where(button, .profile-editor-v31__live-preview) {transition:none;}
}

.profile-editor-v31__error {max-width:800px;margin:12px auto;padding:12px 16px;border:1px solid color-mix(in srgb,var(--ab-ui-danger) 35%,transparent);border-radius:12px;background:color-mix(in srgb,var(--ab-ui-danger) 10%,var(--ab-ui-surface));color:var(--ab-ui-text);font-size:12px;}
.profile-editor-v13 .profile-editor-v18__savebar {bottom:calc(max(8px,env(safe-area-inset-bottom)) + var(--ab-editor-keyboard-inset,0px));}
.profile-editor-v13 input:focus,.profile-editor-v13 textarea:focus {scroll-margin-top:calc(var(--editor-header-height) + var(--editor-preview-height) + var(--editor-tab-height) + 12px);scroll-margin-bottom:calc(var(--profile-editor-savebar-height,108px) + var(--editor-mobile-nav-height,0px) + 16px);}

/* A real right column starts only when both form and preview remain usable.
 * Premium owns its right-hand preview inside the same two-column content area. */
@media (min-width: 900px) {
  .profile-editor-v13 {--editor-preview-height:0px;scroll-padding-top:calc(var(--editor-header-height) + var(--editor-tab-height) + 16px);}
  .profile-editor-v13 .profile-editor-v13__shell {
    grid-template-columns:minmax(0,1fr) minmax(300px,360px);
    grid-template-areas:'header header' 'nav nav' 'settings preview';
    grid-template-rows:auto auto 1fr;
    min-height:100%;
    padding-inline:16px;
    column-gap:16px;
  }
  .profile-editor-v31__live-preview {
    top:calc(var(--editor-header-height) + var(--editor-tab-height) + 16px);
    height:auto;
    margin-top:16px;
    border:0;
    box-shadow:none;
  }
  .profile-editor-v13 .profile-editor-v13__tabs.profile-editor-v18__rail {top:var(--editor-header-height);}
  .profile-editor-v13[data-editor-tab='style'] .profile-editor-v31__settings {grid-column:1 / -1;}
}
@media (min-width: 1180px) {
  .profile-editor-v13 {--editor-tab-height:0px;scroll-padding-top:calc(var(--editor-header-height) + 16px);}
  .profile-editor-v13 .profile-editor-v13__shell {
    grid-template-columns:180px minmax(0,1fr) minmax(320px,380px);
    grid-template-areas:'header header header' 'nav settings preview';
    grid-template-rows:auto 1fr;
    column-gap:24px;
    padding-inline:24px;
  }
  .profile-editor-v13 .profile-editor-v13__tabs.profile-editor-v18__rail {
    top:calc(var(--editor-header-height) + 16px);
    flex-direction:column;
    align-items:stretch;
    height:auto;
    margin-top:16px;
    padding:8px;
    border:1px solid var(--editor-border);
    border-radius:16px;
    overflow:visible;
  }
  .profile-editor-v13 .profile-editor-v13__tabs.profile-editor-v18__rail button {flex:0 0 auto;width:100%;justify-content:flex-start;}
  .profile-editor-v13[data-editor-tab='style'] .profile-editor-v31__settings {grid-column:2 / -1;}
}

/* Shared controls and the mobile app navigation belong to this workspace. */
.profile-editor-v31__expand {position:absolute;top:16px;left:20px;z-index:2;min-height:44px;border:1px solid var(--editor-border);border-radius:10px;padding:0 10px;background:var(--editor-surface);color:var(--ab-ui-text);font-size:11px;cursor:pointer;}
.profile-editor-v31__tools {display:flex;flex-wrap:wrap;align-items:center;gap:6px;margin:12px 16px;}
.profile-editor-v31__tools > span {margin-right:auto;font-size:11px;color:var(--ab-ui-muted);}
.profile-editor-v31__tools button,.profile-editor-v31__recovery button {min-width:44px;min-height:44px;padding:0 10px;border:1px solid var(--editor-border);border-radius:10px;background:var(--editor-surface);color:var(--ab-ui-text);cursor:pointer;font-size:12px;}
.profile-editor-v31__tools button:disabled {opacity:.4;cursor:default;}
.profile-editor-v31__recovery {display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin:12px 16px;padding:12px;border:1px solid var(--editor-border);border-radius:12px;font-size:12px;}
.profile-editor-v31__draft-note {margin:8px 16px;font-size:11px;color:var(--ab-ui-muted);}
.profile-editor-v13 .profile-editor-v13__tabs button[data-dirty=true]::after {content:'';width:6px;height:6px;border-radius:50%;background:var(--ab-ui-accent);flex:0 0 6px;}
.profile-editor-v31__preview-dialog {width:min(800px,100%);margin:auto;padding:16px;background:var(--ab-ui-surface);border-radius:18px;}
.profile-editor-v31__preview-dialog header {display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:16px;}
.profile-editor-v31__preview-dialog h2 {font-size:18px;}
.profile-editor-v31__preview-dialog header button {min-height:44px;padding:0 12px;border:1px solid var(--ab-ui-border);border-radius:10px;color:var(--ab-ui-text);background:var(--ab-ui-raised);cursor:pointer;}
@media(max-width:899px) {
  .profile-editor-v13 {--editor-tab-height:0px;--editor-mobile-nav-height:64px;padding-bottom:calc(var(--profile-editor-savebar-height,108px) + var(--editor-mobile-nav-height) + 32px + env(safe-area-inset-bottom));}
  .profile-editor-v13 .profile-editor-v13__tabs.profile-editor-v18__rail {
    position:fixed;top:auto;bottom:var(--ab-editor-keyboard-inset,0px);left:0;right:0;
    display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:2px;
    width:100%;max-width:900px;height:calc(var(--editor-mobile-nav-height) + env(safe-area-inset-bottom));
    min-height:0;margin:0 auto;padding:4px 8px calc(4px + env(safe-area-inset-bottom));
    overflow:visible;z-index:810;border:0;border-top:1px solid var(--editor-border);border-radius:0;
  }
  .profile-editor-v13 .profile-editor-v13__tabs.profile-editor-v18__rail > button {flex:none;width:100%;min-width:0;height:56px;min-height:44px;flex-direction:column;padding:4px 0;gap:3px;position:relative;}
  .profile-editor-v13 .profile-editor-v13__tabs button[data-dirty=true]::after {position:absolute;top:4px;right:12px;}
  .profile-editor-v13 .profile-editor-v18__savebar {bottom:calc(var(--editor-mobile-nav-height) + max(8px,env(safe-area-inset-bottom)) + var(--ab-editor-keyboard-inset,0px));}
  .profile-editor-v13 .premium-studio-v22__preview-fab {bottom:calc(var(--profile-editor-savebar-height,108px) + var(--editor-mobile-nav-height) + max(8px,env(safe-area-inset-bottom)) + var(--ab-editor-keyboard-inset,0px) + 16px);}
}

@media(max-width:899px) {
  html[data-profile-editor-keyboard] .profile-editor-v13 {--editor-preview-height:0px;}
  html[data-profile-editor-keyboard] .profile-editor-v31__live-preview {display:none;}
}

.profile-editor-v13 .profile-editor-v31__error {
  display:block;
  max-width:none;
  margin:4px 0 0;
  padding:0;
  border:0;
  background:transparent;
  color:var(--ab-ui-danger);
  font-size:11px;
  white-space:normal;
}

/* Short Android landscape / compact Mini App viewports: keep controls usable. */
@media (max-height: 660px) {
  .profile-editor-v13 { --editor-preview-height: 164px; }
}
@media (max-height: 500px) {
  .profile-editor-v13 { --editor-preview-height: 132px; --editor-tab-height: 50px; }
  .profile-editor-v13 .profile-editor-v18__savebar { min-height: 56px; }
}

/* Profile editor phase 2: four destinations and one anchored profile page.
   Geometry stays owned here; no new important cascade layer. */
.profile-editor-v13 .profile-editor-v19__direct-tab[hidden] { display:none; }
.profile-editor-v32__anchors {
  position:sticky; top:var(--profile-editor-chips-top,var(--editor-header-height)); z-index:55;
  display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:4px;
  padding:8px 0; background:var(--editor-surface);
}
.profile-editor-v32__anchors button {
  min-width:0; min-height:44px; padding:8px 4px; border:1px solid var(--editor-border);
  border-radius:12px; background:var(--editor-surface); color:var(--ab-ui-text); cursor:pointer;
}
.profile-editor-v32__anchors button[aria-current='location'] { background:var(--ab-ui-raised); border-color:var(--ab-ui-accent); }
.profile-editor-v32__anchors button:focus-visible { outline:2px solid var(--ab-ui-accent); outline-offset:2px; }
```

## components/profile/ProfileDirectEditSurface.module.css

Полный завершающий блок владельца геометрии, включая изменённые правила и соседний контекст.

```css
.bannerModes button { min-height:40px; flex:1 1 auto; padding:8px 12px; border-radius:10px; border:1px solid var(--ab-ui-border); background:var(--ab-ui-surface); color:var(--ab-ui-text); font-size:11px; cursor:pointer; }
.bannerModes button[data-active='true'] { border-color:var(--ab-ui-accent); background:color-mix(in srgb,var(--ab-ui-accent) 12%,var(--ab-ui-surface)); }
.bannerPalette { min-width:0; }
@media (max-width: 768px) { .inspector { scroll-margin-top: 120px; } }


/* Compact settings-only layout: preview now belongs to ProfileEditorLivePreview. */
.workspace[data-settings-only='true'] { display:block; padding: 0; }
.workspace[data-settings-only='true'] .inspector { width:100%;max-height:none;position:static;box-shadow:none; }
.bannerDropzone { display:flex;align-items:center;justify-content:center;flex-direction:column;gap:9px;width:100%;min-height:132px;border:1px dashed var(--ab-ui-accent);border-radius:16px;background:var(--ab-ui-raised);color:var(--ab-ui-text);cursor:pointer;overflow:hidden;font-size:13px; }
.bannerDropzone > img {width:100%;max-height:160px;object-fit:cover;}
.bannerDropzone:disabled { opacity:.65; cursor: not-allowed; }

/* 31.3 compact swatches and equal-width single-row fill controls */
.bannerPresetGrid {display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:8px;margin:12px 0;}
.bannerPreset {position:relative;aspect-ratio:1;min-height:0;min-width:0;width:100%;padding:3px;border:2px solid transparent;border-radius:50%;background:transparent;cursor:pointer;}
.bannerPreset[data-active='true'] {border-color:var(--ab-ui-accent);outline:2px solid color-mix(in srgb,var(--ab-ui-accent) 24%,transparent);}
.bannerPresetSwatch {display:block;min-height:0;width:100%;height:100%;border:1px solid rgba(255,255,255,.18);border-radius:50%;}
.premiumStar {position:absolute;right:-3px;bottom:-3px;font-size:12px;color:var(--ab-ui-accent);background:var(--ab-ui-surface);border-radius:50%;width:16px;height:16px;}
.fillModeRail {display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:5px;margin:12px 0;}
.fillModeRail button {min-width:0;min-height:44px;padding:8px 3px;border:1px solid var(--ab-ui-border);border-radius:12px;background:var(--ab-ui-surface);color:var(--ab-ui-text);font-size:10px;cursor:pointer;}
.fillModeRail button[data-active='true'] {border-color:var(--ab-ui-accent);background:color-mix(in srgb,var(--ab-ui-accent) 16%,var(--ab-ui-surface));}
.colorActionRow {display:grid;grid-template-columns:minmax(0,1fr) auto auto;gap:8px;align-items:center;}
.colorActionRow button {display:flex;align-items:center;justify-content:center;gap:8px;min-height:44px;padding:0 10px;border-radius:12px;border:1px solid var(--ab-ui-border);background:var(--ab-ui-raised);color:var(--ab-ui-text);font-size:11px;cursor:pointer;}
.colorActionRow .colorOpen {min-width:0;justify-content:flex-start;}
.colorOpen > span:nth-child(2) {min-width:0;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;}
.colorOpenSwatch {width:22px;height:22px;flex:0 0 22px;border-radius:7px;border:1px solid #aaa;}
@media(max-width:430px){
  .fillModeRail {grid-template-columns:repeat(2,minmax(0,1fr));}
  .bannerPresetGrid {grid-template-columns:repeat(4,minmax(0,1fr));}
  .colorActionRow {grid-template-columns:repeat(2,minmax(0,1fr));}
  .colorActionRow .colorOpen {grid-column:1/-1;}
}

/* Phase 2: a single mounted surface owns all cards and one frame inventory. */
.cardStack { display:grid; grid-template-columns:minmax(0,1fr); gap:16px; min-width:0; }
.cardStack > .inspector { position:static; width:100%; min-width:0; max-width:none; max-height:none; overflow:visible; }
.cardStack button { min-width:44px; min-height:44px; }
.cardStack :is(input:not([type='file']), textarea) { min-height:44px; }
.cardStack [data-profile-anchor] { scroll-margin-top:var(--profile-editor-anchor-offset,120px); }
.cardStack .inventorySection { scroll-margin-top:var(--profile-editor-anchor-offset,120px); }
@media (prefers-reduced-motion:reduce) { .cardStack { scroll-behavior:auto; } }
```
