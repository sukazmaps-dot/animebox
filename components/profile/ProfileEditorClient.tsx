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
import ProfileEditorViewport from '@/components/profile/ProfileEditorViewport';
import ProfileEditorShowcasePreview from '@/components/profile/ProfileEditorShowcasePreview';
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

type ShowcasePayload = {
  ok: boolean; widgets: ProfileWidgetsData;
  capabilities?: { extraShowcases?: boolean; maxFavorites?: number };
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
  return <ProfileEditorViewport><ProfileEditorWorkspace key={user?.id ?? 'guest'} {...props} /></ProfileEditorViewport>;
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

  const showcaseRequestRef = useRef<Promise<ShowcasePayload> | null>(null);
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
    if (!user?.id || (activeTab !== 'profile' && activeTab !== 'showcase') || showcase) return;

    let active = true;
    queueMicrotask(() => {
      if (!active) return;
      setShowcaseLoading(true);
      setShowcaseError('');
    });

    if (!showcaseRequestRef.current) {
      showcaseRequestRef.current = communityRequest<ShowcasePayload>('profile-widgets')
        .finally(() => { showcaseRequestRef.current = null; });
    }
    void showcaseRequestRef.current
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
          <ProfileEditorLivePreview full createdAt={profile.created_at} appearance={comparing ? premiumSettings : premiumDraft ?? premiumSettings}
            username={comparing ? profile.username ?? '' : username} bio={comparing ? profile.bio ?? '' : bio} avatarUrl={comparing ? displayedAvatar : resolvedAvatarPreview}
            bannerUrl={comparing ? displayedBanner : resolvedBannerPreview} bannerColor={comparing ? profile.banner_color ?? '#70618c' : bannerColor}
            bannerStyle={comparing ? normalizeBannerStyle(profile.banner_style) : bannerStyle} premiumActive={premiumActive}
            frameKey={comparing ? savedFrame : selectedFrame} onNavigate={navigatePreview}
            previewPremiumFill={bannerFillUpgradeRequired}
          />
        </div>

        <aside className="profile-editor-v33__board" hidden={activeTab !== 'profile'}>
          <ProfileEditorShowcasePreview data={showcase} loading={showcaseLoading || (!showcase && !showcaseError)} error={showcaseError}
            onConfigure={() => switchTab('showcase')}
            onRetry={() => { setShowcaseError(''); setShowcaseReloadKey(value => value + 1); }} />
        </aside>

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
              <button type="button" key={anchor} data-profile-anchor-link={anchor} aria-current={activeAnchor === anchor ? 'location' : undefined}
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
          <ProfileEditorLivePreview expanded createdAt={profile.created_at} appearance={comparing ? premiumSettings : premiumDraft ?? premiumSettings} username={username} bio={bio} avatarUrl={resolvedAvatarPreview}
            bannerUrl={resolvedBannerPreview} bannerColor={bannerColor} bannerStyle={bannerStyle}
            premiumActive={premiumActive} frameKey={selectedFrame} previewPremiumFill={bannerFillUpgradeRequired}
            onNavigate={section=>{setPreviewOpen(false);navigatePreview(section);}} />
          <ProfileEditorShowcasePreview data={showcase} loading={showcaseLoading || (!showcase && !showcaseError)} error={showcaseError}
            onConfigure={() => { setPreviewOpen(false); switchTab('showcase'); }}
            onRetry={() => { setShowcaseError(''); setShowcaseReloadKey(value => value + 1); }} />
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
