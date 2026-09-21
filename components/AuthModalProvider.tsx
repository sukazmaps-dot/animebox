'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from 'react';
import Image from 'next/image';
import { usePathname, useRouter } from 'next/navigation';

import GoogleAuthButton from '@/components/GoogleAuthButton';
import TelegramAuthButton from '@/components/TelegramAuthButton';
import { useAuthState } from '@/components/AuthStateProvider';
import { createClient } from '@/lib/supabase/client';
import { trackProductClientEvent } from '@/lib/product-events-client';
import { markTelegramWelcomePending } from '@/lib/telegram-growth-client';

type AuthMode = 'login' | 'register';

type AuthIntent =
  | 'account'
  | 'tracker'
  | 'favorite'
  | 'comment'
  | 'premium'
  | 'notification'
  | 'profile'
  | 'watch_party'
  | 'unknown';

type OpenAuthOptions = {
  mode?: AuthMode;
  next?: string;
  intent?: AuthIntent;
  title?: string;
  onSuccess?: () => void | Promise<void>;
};

type AuthModalContextValue = {
  openAuth: (options?: OpenAuthOptions) => void;
  closeAuth: () => void;
  isOpen: boolean;
};

type ModalState = {
  open: boolean;
  mode: AuthMode;
  next: string;
  intent: AuthIntent;
  title?: string;
  onSuccess?: () => void | Promise<void>;
};

const AuthModalContext = createContext<AuthModalContextValue | null>(null);

function safePath(value: string | null | undefined, fallback = '/') {
  return value && value.startsWith('/') && !value.startsWith('//')
    ? value
    : fallback;
}

function currentPath() {
  if (typeof window === 'undefined') return '/';
  return `${window.location.pathname}${window.location.search}${window.location.hash}`;
}

function inferIntent(anchor: HTMLAnchorElement): AuthIntent {
  const explicit = anchor.dataset.authIntent as AuthIntent | undefined;
  if (explicit) return explicit;

  const source = `${anchor.closest('[class]')?.getAttribute('class') || ''} ${anchor.textContent || ''}`.toLowerCase();
  if (/трекер|list/.test(source)) return 'tracker';
  if (/избран|favorite/.test(source)) return 'favorite';
  if (/коммент|comment/.test(source)) return 'comment';
  if (/premium|премиум|подпис/.test(source)) return 'premium';
  if (/уведом|notification/.test(source)) return 'notification';
  if (/профил|profile/.test(source)) return 'profile';
  if (/watch together|party|комнат/.test(source)) return 'watch_party';
  return 'account';
}

function sourceLabel(intent: AuthIntent) {
  switch (intent) {
    case 'tracker':
      return 'сохранить тайтл и синхронизировать трекер';
    case 'favorite':
      return 'сохранить избранное';
    case 'comment':
      return 'оставить комментарий';
    case 'premium':
      return 'продолжить оформление Premium';
    case 'notification':
      return 'настроить уведомления';
    case 'profile':
      return 'открыть персональный профиль';
    case 'watch_party':
      return 'продолжить в Watch Together';
    default:
      return 'сохранить прогресс и персональные рекомендации';
  }
}

function isDuplicateEmailError(code?: string, message?: string) {
  return (
    code === 'user_already_exists' ||
    code === 'email_exists' ||
    /already registered|already exists|already been registered/i.test(message ?? '')
  );
}

export function AuthModalProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { refresh, telegramMiniApp, resumeTelegramAutoLogin } = useAuthState();
  const [state, setState] = useState<ModalState>({
    open: false,
    mode: 'login',
    next: '/',
    intent: 'account',
  });

  const closeAuth = useCallback(() => {
    setState((current) => ({ ...current, open: false, onSuccess: undefined }));
  }, []);

  const openAuth = useCallback((options: OpenAuthOptions = {}) => {
    const next = safePath(options.next, currentPath());
    setState({
      open: true,
      mode: options.mode ?? 'login',
      next,
      intent: options.intent ?? 'account',
      title: options.title,
      onSuccess: options.onSuccess,
    });

    trackProductClientEvent('auth_modal_opened', {
      source: telegramMiniApp ? 'telegram_mini_app' : 'web',
      path: typeof window === 'undefined' ? pathname : window.location.pathname,
      metadata: {
        mode: options.mode ?? 'login',
        intent: options.intent ?? 'account',
      },
    });
  }, [pathname, telegramMiniApp]);

  useEffect(() => {
    if (!state.open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeAuth();
    };
    window.addEventListener('keydown', onKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [closeAuth, state.open]);

  useEffect(() => {
    if (
      pathname === '/login' ||
      pathname === '/register' ||
      pathname === '/onboarding' ||
      pathname.startsWith('/auth/')
    ) {
      return;
    }

    const onClick = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const target = event.target instanceof Element ? event.target.closest('a') : null;
      if (!(target instanceof HTMLAnchorElement)) return;
      if (target.target && target.target !== '_self') return;

      let url: URL;
      try {
        url = new URL(target.href, window.location.href);
      } catch {
        return;
      }
      if (url.origin !== window.location.origin) return;
      if (url.pathname !== '/login' && url.pathname !== '/register') return;

      event.preventDefault();
      const requestedNext = safePath(url.searchParams.get('next'), currentPath());
      openAuth({
        mode: url.pathname === '/register' ? 'register' : 'login',
        next: requestedNext,
        intent: inferIntent(target),
      });
    };

    document.addEventListener('click', onClick, true);
    return () => document.removeEventListener('click', onClick, true);
  }, [openAuth, pathname]);

  const completeAuth = useCallback(async ({ needsOnboarding = false }: { needsOnboarding?: boolean } = {}) => {
    trackProductClientEvent('auth_completed', {
      source: telegramMiniApp ? 'telegram_mini_app' : 'web',
      path: typeof window === 'undefined' ? pathname : window.location.pathname,
      metadata: {
        mode: state.mode,
        intent: state.intent,
        needsOnboarding,
      },
      flush: true,
    });

    await refresh();
    const pending = state.onSuccess;
    const target = safePath(state.next, '/');
    closeAuth();

    if (pending) {
      await pending();
      return;
    }

    if (needsOnboarding) {
      router.push(`/onboarding?next=${encodeURIComponent(target)}`);
      return;
    }

    const here = currentPath();
    if (target !== here && target !== window.location.pathname) {
      router.push(target);
      router.refresh();
    }
  }, [closeAuth, pathname, refresh, router, state.intent, state.mode, state.next, state.onSuccess, telegramMiniApp]);

  const value = useMemo<AuthModalContextValue>(() => ({
    openAuth,
    closeAuth,
    isOpen: state.open,
  }), [closeAuth, openAuth, state.open]);

  return (
    <AuthModalContext.Provider value={value}>
      {children}
      {state.open && (
        <AuthModal
          state={state}
          setState={setState}
          closeAuth={closeAuth}
          completeAuth={completeAuth}
          telegramMiniApp={telegramMiniApp}
          resumeTelegramAutoLogin={resumeTelegramAutoLogin}
        />
      )}
    </AuthModalContext.Provider>
  );
}

function AuthModal({
  state,
  setState,
  closeAuth,
  completeAuth,
  telegramMiniApp,
  resumeTelegramAutoLogin,
}: {
  state: ModalState;
  setState: React.Dispatch<React.SetStateAction<ModalState>>;
  closeAuth: () => void;
  completeAuth: (options?: { needsOnboarding?: boolean }) => Promise<void>;
  telegramMiniApp: boolean;
  resumeTelegramAutoLogin: () => void;
}) {
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  useEffect(() => {
    const dialog = dialogRef.current;
    const focusable = dialog?.querySelector<HTMLElement>('input, button, [href]');
    focusable?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Tab' || !dialog) return;
      const items = Array.from(
        dialog.querySelectorAll<HTMLElement>(
          'button:not([disabled]), input:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])',
        ),
      ).filter((item) => item.offsetParent !== null);
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    dialog?.addEventListener('keydown', onKeyDown);
    return () => dialog?.removeEventListener('keydown', onKeyDown);
  }, []);

  const setMode = (mode: AuthMode) => {
    setError('');
    setMessage('');
    setState((current) => ({ ...current, mode }));
    trackProductClientEvent('auth_mode_changed', {
      source: telegramMiniApp ? 'telegram_mini_app' : 'web',
      path: window.location.pathname,
      metadata: { mode, intent: state.intent },
    });
  };

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setMessage('');

    const cleanEmail = email.trim().toLowerCase();
    const cleanUsername = username.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      setError('Введите корректный email.');
      return;
    }
    if (!password || (state.mode === 'register' && password.length < 6)) {
      setError(state.mode === 'register' ? 'Пароль должен содержать минимум 6 символов.' : 'Введите пароль.');
      return;
    }
    if (state.mode === 'register') {
      if (cleanUsername.length < 3 || cleanUsername.length > 24) {
        setError('Ник должен содержать от 3 до 24 символов.');
        return;
      }
      if (password !== confirmPassword) {
        setError('Пароли не совпадают.');
        return;
      }
    }

    setLoading(true);
    try {
      const supabase = createClient();
      if (state.mode === 'login') {
        const { data, error: signInError } = await supabase.auth.signInWithPassword({
          email: cleanEmail,
          password,
        });
        if (signInError || !data.session) throw signInError ?? new Error('session_missing');
        await completeAuth();
        return;
      }

      const { data, error: signupError } = await supabase.auth.signUp({
        email: cleanEmail,
        password,
        options: { data: { username: cleanUsername } },
      });
      if (signupError) {
        if (isDuplicateEmailError(signupError.code, signupError.message)) {
          throw new Error('Эта почта уже используется.');
        }
        throw signupError;
      }

      if (data.session) {
        markTelegramWelcomePending(data.session.user.id, 'email');
        await completeAuth();
      } else {
        setMessage('Аккаунт создан. Подтверди email по письму, затем войди в AnimeBox.');
      }
    } catch (submitError) {
      const raw = submitError instanceof Error ? submitError.message : '';
      setError(
        raw === 'Invalid login credentials' || raw === 'session_missing'
          ? 'Неверный email или пароль.'
          : raw || 'Не удалось выполнить вход. Попробуй ещё раз.',
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      className="auth-modal-v2"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) closeAuth();
      }}
    >
      <div
        ref={dialogRef}
        className="auth-modal-v2__dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="auth-modal-title"
      >
        <button type="button" className="auth-modal-v2__close" onClick={closeAuth} aria-label="Закрыть окно входа">×</button>

        <aside className="auth-modal-v2__story" aria-hidden="true">
          <div className="auth-modal-v2__brand">
            <Image src="/logo.png" alt="" width={34} height={34} />
            <span>ANIMEBOX</span>
          </div>
          <span className="auth-modal-v2__eyebrow">ТВОЙ ANIME HUB</span>
          <h2>{state.title || (state.mode === 'login' ? 'Продолжай с того же места' : 'Собери свой AnimeBox')}</h2>
          <p>Войди, чтобы {sourceLabel(state.intent)}. Текущая страница останется открытой.</p>
          <div className="auth-modal-v2__benefits">
            <span><b>✓</b> Прогресс между устройствами</span>
            <span><b>✓</b> Персональные рекомендации</span>
            <span><b>✓</b> Трекер, профиль и достижения</span>
          </div>
          <div className="auth-modal-v2__glow" />
        </aside>

        <section className="auth-modal-v2__form-side">
          <div className="auth-modal-v2__mode" role="tablist" aria-label="Вход или регистрация">
            <button type="button" role="tab" aria-selected={state.mode === 'login'} className={state.mode === 'login' ? 'is-active' : ''} onClick={() => setMode('login')}>Вход</button>
            <button type="button" role="tab" aria-selected={state.mode === 'register'} className={state.mode === 'register' ? 'is-active' : ''} onClick={() => setMode('register')}>Регистрация</button>
          </div>

          <div className="auth-modal-v2__heading">
            <span>{state.mode === 'login' ? 'ANIMEBOX ACCOUNT' : 'JOIN ANIMEBOX'}</span>
            <h2 id="auth-modal-title">{state.mode === 'login' ? 'С возвращением' : 'Создай аккаунт'}</h2>
            <p>{state.mode === 'login' ? 'Войди без перехода на отдельную страницу.' : 'Пара полей — и можно сохранять прогресс.'}</p>
          </div>

          <div className="auth-modal-v2__social">
            <GoogleAuthButton
              label={state.mode === 'login' ? 'Войти через Google' : 'Продолжить через Google'}
              next={state.next}
              navigateOnSuccess={false}
              onSuccess={({ needsOnboarding }) => completeAuth({ needsOnboarding })}
            />

            {telegramMiniApp ? (
              <button
                type="button"
                className="auth-modal-v2__telegram-mini"
                onClick={() => {
                  closeAuth();
                  resumeTelegramAutoLogin();
                }}
              >
                Войти через Telegram Mini App
              </button>
            ) : (
              <TelegramAuthButton
                label="Войти через Telegram"
                next={state.next}
                navigateOnSuccess={false}
                onSuccess={() => completeAuth()}
                onError={(value) => setError(value)}
              />
            )}
          </div>

          <div className="auth-modal-v2__divider"><span /><small>или через email</small><span /></div>

          <form className="auth-modal-v2__form" onSubmit={submit} noValidate>
            {state.mode === 'register' && (
              <label>
                <span>Имя пользователя</span>
                <input value={username} onChange={(event) => setUsername(event.target.value)} autoComplete="username" maxLength={24} placeholder="Например: ghoul cat" />
              </label>
            )}
            <label>
              <span>Email</span>
              <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" placeholder="name@example.com" />
            </label>
            <label>
              <span className="auth-modal-v2__label-row">Пароль <button type="button" onClick={() => setShowPassword((value) => !value)}>{showPassword ? 'Скрыть' : 'Показать'}</button></span>
              <input type={showPassword ? 'text' : 'password'} value={password} onChange={(event) => setPassword(event.target.value)} autoComplete={state.mode === 'login' ? 'current-password' : 'new-password'} placeholder="••••••••" />
            </label>
            {state.mode === 'register' && (
              <label>
                <span>Повтори пароль</span>
                <input type={showPassword ? 'text' : 'password'} value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} autoComplete="new-password" placeholder="••••••••" />
              </label>
            )}

            {state.mode === 'login' && (
              <a className="auth-modal-v2__forgot" href="/auth/forgot-password">Забыли пароль?</a>
            )}

            {error && <div className="auth-modal-v2__error" role="alert">{error}</div>}
            {message && <div className="auth-modal-v2__message" role="status">{message}</div>}

            <button className="auth-modal-v2__submit" type="submit" disabled={loading}>
              {loading ? 'Подождите…' : state.mode === 'login' ? 'Войти в AnimeBox' : 'Создать аккаунт'}
            </button>
          </form>

          <p className="auth-modal-v2__legal">Продолжая, вы соглашаетесь с правилами AnimeBox и политикой конфиденциальности.</p>
        </section>
      </div>
    </div>
  );
}

export function useAuthModal() {
  const value = useContext(AuthModalContext);
  if (!value) throw new Error('useAuthModal must be used inside AuthModalProvider');
  return value;
}
