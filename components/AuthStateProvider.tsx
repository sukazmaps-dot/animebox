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
import {
  AUTH_CHANGED_EVENT,
  type AuthChangedDetail,
  type AuthProfileSnapshot,
} from '@/lib/auth-events';

type AuthStateValue = {
  user: User | null;
  profile: AuthProfileSnapshot | null;
  loading: boolean;
  refresh: () => Promise<void>;
  signOut: () => Promise<void>;
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
  };
}

export function AuthStateProvider({ children }: { children: ReactNode }) {
  const supabase = useMemo(() => createClient(), []);

  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<AuthProfileSnapshot | null>(null);
  const [loading, setLoading] = useState(true);

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

    const nextProfile: AuthProfileSnapshot = data
      ? {
          id: data.id,
          username: data.username,
          avatar_path: data.avatar_path,
        }
      : fallbackProfile(verifiedUser);

    setProfile(nextProfile);
    saveCachedProfile(nextProfile);
  }, [supabase]);

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

    return () => {
      active = false;
      subscription.unsubscribe();
      window.removeEventListener(AUTH_CHANGED_EVENT, handleAuthChanged);
    };
  }, [refresh, supabase]);

  const signOut = useCallback(async () => {
    refreshSerial.current += 1;
    clearCachedProfile();
    setUser(null);
    setProfile(null);
    setLoading(false);

    const { error } = await supabase.auth.signOut();
    if (error) {
      console.error('[AuthState] sign out:', error);
    }
  }, [supabase]);

  const value = useMemo<AuthStateValue>(
    () => ({
      user,
      profile,
      loading,
      refresh,
      signOut,
    }),
    [loading, profile, refresh, signOut, user],
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
