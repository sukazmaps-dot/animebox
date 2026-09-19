'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type { User } from '@supabase/supabase-js';

import { createClient } from '@/lib/supabase/client';
import { resolveProfileAppearance } from '@/lib/profile-appearance';
import type { PremiumStudioSettings } from '@/lib/premium-studio';
import {
  AUTH_CHANGED_EVENT,
  type AuthChangedDetail,
  type AuthProfileSnapshot,
} from '@/lib/auth-events';
import {
  TELEGRAM_AUTOLOGIN_CHANGED_EVENT,
  disableTelegramAutoLogin,
  enableTelegramAutoLogin,
  isTelegramAutoLoginDisabled,
  isTelegramMiniAppRuntime,
} from '@/lib/telegram-auto-login';

type AuthStateValue = {
  user: User | null;
  profile: AuthProfileSnapshot | null;
  loading: boolean;
  refresh: () => Promise<void>;
  signOut: () => Promise<void>;
  telegramMiniApp: boolean;
  telegramAutoLoginDisabled: boolean;
  resumeTelegramAutoLogin: () => void;
};

type CachedAuthProfile = {
  userId: string;
  profile: AuthProfileSnapshot;
  expiresAt: number;
};

const CACHE_KEY = 'animebox:auth-shell:v1';
const CACHE_TTL = 5 * 60 * 1000;

const AuthStateContext = createContext<AuthStateValue | null>(null);

function readCachedProfile(userId: string): AuthProfileSnapshot | null {
  try {
    const raw = window.localStorage.getItem(CACHE_KEY);
    if (!raw) return null;

    const cached = JSON.parse(raw) as CachedAuthProfile;

    if (
      cached.userId !== userId ||
      cached.expiresAt <= Date.now() ||
      !cached.profile?.id
    ) {
      window.localStorage.removeItem(CACHE_KEY);
      return null;
    }

    return cached.profile;
  } catch {
    return null;
  }
}

function saveCachedProfile(profile: AuthProfileSnapshot) {
  try {
    const value: CachedAuthProfile = {
      userId: profile.id,
      profile,
      expiresAt: Date.now() + CACHE_TTL,
    };

    window.localStorage.setItem(CACHE_KEY, JSON.stringify(value));
  } catch {
    // Restricted/private WebViews may deny localStorage. The app still works.
  }
}

function clearCachedProfile() {
  try {
    window.localStorage.removeItem(CACHE_KEY);
  } catch {
    // Ignore storage failures.
  }
}

function fallbackProfile(user: User): AuthProfileSnapshot {
  const metadata = user.user_metadata ?? {};

  const username =
    (typeof metadata.username === 'string' && metadata.username.trim()) ||
    (typeof metadata.full_name === 'string' && metadata.full_name.trim()) ||
    (typeof metadata.name === 'string' && metadata.name.trim()) ||
    user.email?.split('@')[0] ||
    'Пользователь';

  return {
    id: user.id,
    username,
    avatar_path: null,
    display_avatar_path: null,
    display_avatar_transform: null,
  };
}

export function AuthStateProvider({ children }: { children: ReactNode }) {
  const supabase = useMemo(() => createClient(), []);

  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<AuthProfileSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [telegramMiniApp, setTelegramMiniApp] = useState(false);
  const [telegramAutoLoginDisabled, setTelegramAutoLoginDisabled] =
    useState(false);

  const refreshSerial = useRef(0);

  const refresh = useCallback(async () => {
    const serial = ++refreshSerial.current;

    const {
      data: { user: verifiedUser },
      error: userError,
    } = await supabase.auth.getUser();

    if (serial !== refreshSerial.current) return;

    if (!verifiedUser) {
      const status = (userError as { status?: number } | null)?.status;
      const missingSession =
        !userError ||
        userError.name === 'AuthSessionMissingError' ||
        status === 401 ||
        status === 403;

      if (missingSession) {
        setUser(null);
        setProfile(null);
        clearCachedProfile();
      }

      setLoading(false);
      return;
    }

    setUser(verifiedUser);

    const cached = readCachedProfile(verifiedUser.id);
    if (cached) {
      setProfile(cached);
      setLoading(false);
    } else {
      setProfile((current) =>
        current?.id === verifiedUser.id ? current : fallbackProfile(verifiedUser),
      );
      setLoading(false);
    }

    const { data, error } = await supabase
      .from('profiles')
      .select('id, username, avatar_path')
      .eq('id', verifiedUser.id)
      .maybeSingle();

    if (serial !== refreshSerial.current) return;

    if (error) {
      console.error('[AuthState] profile load:', error);
      return;
    }

    let nextProfile: AuthProfileSnapshot = data
      ? {
          id: data.id,
          username: data.username,
          avatar_path: data.avatar_path,
          display_avatar_path: data.avatar_path,
          display_avatar_transform: null,
        }
      : fallbackProfile(verifiedUser);

    try {
      const studioResponse = await fetch('/api/premium/studio', { cache: 'no-store' });
      if (studioResponse.ok) {
        const payload = (await studioResponse.json()) as {
          allowed?: boolean;
          settings?: PremiumStudioSettings;
        };
        const appearance = resolveProfileAppearance({
          baseAvatarPath: nextProfile.avatar_path,
          baseBannerPath: null,
          premiumStudio: payload.settings ?? null,
          premiumActive: Boolean(payload.allowed),
        });
        nextProfile = {
          ...nextProfile,
          display_avatar_path: appearance.avatarPath,
          display_avatar_transform: appearance.avatarTransform,
        };
      }
    } catch {
      // Shell avatar falls back to the base profile if Premium appearance lookup fails.
    }

    if (serial !== refreshSerial.current) return;
    setProfile(nextProfile);
    saveCachedProfile(nextProfile);
  }, [supabase]);

  useEffect(() => {
    function syncTelegramMode() {
      const inMiniApp = isTelegramMiniAppRuntime();

      setTelegramMiniApp(inMiniApp);
      setTelegramAutoLoginDisabled(
        inMiniApp && isTelegramAutoLoginDisabled(),
      );
    }

    syncTelegramMode();

    window.addEventListener(
      TELEGRAM_AUTOLOGIN_CHANGED_EVENT,
      syncTelegramMode,
    );

    return () => {
      window.removeEventListener(
        TELEGRAM_AUTOLOGIN_CHANGED_EVENT,
        syncTelegramMode,
      );
    };
  }, []);

  useEffect(() => {
    let active = true;

    async function hydrateFromLocalSession() {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!active) return;

      if (session?.user) {
        const cached = readCachedProfile(session.user.id);

        setUser(session.user);
        setProfile(cached ?? fallbackProfile(session.user));
      }

      // Do not block the shell on a network round-trip.
      setLoading(false);

      void refresh();
    }

    void hydrateFromLocalSession();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (!active) return;

      if (event === 'SIGNED_OUT') {
        refreshSerial.current += 1;
        setUser(null);
        setProfile(null);
        setLoading(false);
        clearCachedProfile();
        return;
      }

      if (session?.user) {
        const cached = readCachedProfile(session.user.id);

        setUser(session.user);
        setProfile(cached ?? fallbackProfile(session.user));
        setLoading(false);
      }

      // Supabase recommends keeping the auth callback lightweight.
      window.setTimeout(() => {
        if (active) void refresh();
      }, 0);
    });

    function handleAuthChanged(event: Event) {
      if (!active) return;

      const detail = (event as CustomEvent<AuthChangedDetail>).detail;
      const optimisticProfile = detail?.profile;
      const optimisticUserId = detail?.userId ?? optimisticProfile?.id;

      if (optimisticUserId) {
        const nextProfile: AuthProfileSnapshot = {
          id: optimisticUserId,
          username:
            typeof optimisticProfile?.username === 'string'
              ? optimisticProfile.username
              : null,
          avatar_path:
            typeof optimisticProfile?.avatar_path === 'string'
              ? optimisticProfile.avatar_path
              : null,
          display_avatar_path:
            typeof optimisticProfile?.display_avatar_path === 'string'
              ? optimisticProfile.display_avatar_path
              : typeof optimisticProfile?.avatar_path === 'string'
                ? optimisticProfile.avatar_path
                : null,
          display_avatar_transform:
            optimisticProfile?.display_avatar_transform ?? null,
        };

        setProfile(nextProfile);
        saveCachedProfile(nextProfile);
        setLoading(false);
      }

      window.setTimeout(() => {
        if (active) void refresh();
      }, 0);
    }

    window.addEventListener(AUTH_CHANGED_EVENT, handleAuthChanged);
    window.addEventListener('animebox:premium-studio-updated', refresh);
    window.addEventListener('animebox:entitlements-changed', refresh);

    return () => {
      active = false;
      subscription.unsubscribe();
      window.removeEventListener(AUTH_CHANGED_EVENT, handleAuthChanged);
      window.removeEventListener('animebox:premium-studio-updated', refresh);
      window.removeEventListener('animebox:entitlements-changed', refresh);
    };
  }, [refresh, supabase]);

  const signOut = useCallback(async () => {
    refreshSerial.current += 1;

    if (isTelegramMiniAppRuntime()) {
      disableTelegramAutoLogin();
      setTelegramMiniApp(true);
      setTelegramAutoLoginDisabled(true);
    }

    clearCachedProfile();
    setUser(null);
    setProfile(null);
    setLoading(false);

    const { error } = await supabase.auth.signOut();

    if (error) {
      console.error('[AuthState] sign out:', error);

      // Keep the local logout usable even if the global revoke request fails.
      const { error: localError } = await supabase.auth.signOut({
        scope: 'local',
      });

      if (localError) {
        console.error('[AuthState] local sign out:', localError);
      }
    }
  }, [supabase]);

  const resumeTelegramAutoLogin = useCallback(() => {
    enableTelegramAutoLogin();
    setTelegramMiniApp(isTelegramMiniAppRuntime());
    setTelegramAutoLoginDisabled(false);

    // A full reload lets TelegramMiniAppBridge start a fresh verified flow.
    window.location.reload();
  }, []);

  const value = useMemo<AuthStateValue>(
    () => ({
      user,
      profile,
      loading,
      refresh,
      signOut,
      telegramMiniApp,
      telegramAutoLoginDisabled,
      resumeTelegramAutoLogin,
    }),
    [
      loading,
      profile,
      refresh,
      resumeTelegramAutoLogin,
      signOut,
      telegramAutoLoginDisabled,
      telegramMiniApp,
      user,
    ],
  );

  return (
    <AuthStateContext.Provider value={value}>
      {children}
    </AuthStateContext.Provider>
  );
}

export function useAuthState() {
  const value = useContext(AuthStateContext);

  if (!value) {
    throw new Error('useAuthState must be used inside AuthStateProvider');
  }

  return value;
}
