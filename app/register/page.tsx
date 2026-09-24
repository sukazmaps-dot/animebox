'use client';

import {
  FormEvent,
  useState,
} from 'react';

import Link from 'next/link';

import GoogleAuthButton from '@/components/GoogleAuthButton';
import TelegramAuthButton from '@/components/TelegramAuthButton';
import { safeInternalPath } from '@/lib/browser-navigation';

import { emailAuthRequest } from '@/lib/email-auth-client';
import { usernamePolicyError } from '@/lib/auth-identity-policy';
import { markTelegramWelcomePending } from '@/lib/telegram-growth-client';


export default function RegisterPage() {
  const [nextPath] = useState(() =>
    safeInternalPath(
      typeof window === 'undefined'
        ? null
        : new URLSearchParams(window.location.search).get('next'),
      '/profile',
    ),
  );

  const [
    username,
    setUsername,
  ] =
    useState('');

  const [
    email,
    setEmail,
  ] =
    useState('');

  const [
    password,
    setPassword,
  ] =
    useState('');

  const [
    confirmPassword,
    setConfirmPassword,
  ] =
    useState('');

  const [
    showPassword,
    setShowPassword,
  ] =
    useState(false);

  const [
    message,
    setMessage,
  ] =
    useState('');

  const [
    error,
    setError,
  ] =
    useState('');

  const [
    usernameError,
    setUsernameError,
  ] =
    useState('');

  const [
    emailError,
    setEmailError,
  ] =
    useState('');

  const [
    passwordError,
    setPasswordError,
  ] =
    useState('');

  const [
    confirmPasswordError,
    setConfirmPasswordError,
  ] =
    useState('');

  const [
    loading,
    setLoading,
  ] =
    useState(false);

  async function handleSubmit(
    event:
      FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    setMessage('');
    setError('');
    setUsernameError('');
    setEmailError('');
    setPasswordError('');
    setConfirmPasswordError('');

    const cleanUsername =
      username.trim();

    const cleanEmail =
      email
        .trim()
        .toLowerCase();

    let hasError = false;

    const usernameErrorMessage = usernamePolicyError(cleanUsername);
    if (usernameErrorMessage) {
      setUsernameError(usernameErrorMessage);
      hasError = true;
    }

    if (!cleanEmail) {
      setEmailError(
        'Введите email.',
      );

      hasError = true;
    } else if (
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(
        cleanEmail,
      )
    ) {
      setEmailError(
        'Введите корректный email, например name@example.com.',
      );

      hasError = true;
    }

    if (password.length < 8) {
      setPasswordError(
        'Пароль должен содержать минимум 8 символов.',
      );

      hasError = true;
    }

    if (!confirmPassword) {
      setConfirmPasswordError(
        'Повторите пароль.',
      );

      hasError = true;
    } else if (
      password !== confirmPassword
    ) {
      setConfirmPasswordError(
        'Пароли не совпадают.',
      );

      hasError = true;
    }

    if (hasError) {
      return;
    }

    setLoading(true);

    try {
      const result = await emailAuthRequest({
        mode: 'register',
        email: cleanEmail,
        password,
        username: cleanUsername,
      });

      if (result.needsEmailConfirmation) {
        setMessage(
          'Аккаунт создан. Подтверди email по письму, после этого можно будет войти.',
        );
        setLoading(false);
        return;
      }

      if (result.userId) {
        markTelegramWelcomePending(result.userId, 'email');
      }
      window.location.replace(nextPath);
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : 'Не удалось создать аккаунт.',
      );
      setLoading(false);
    }
  }

  return (
    <main className="auth-page">
      <div className="auth-card">
        <div className="auth-card__badge">
          JOIN ANIMEBOX
        </div>

        <h1>
          Создай аккаунт
        </h1>

        <p className="auth-card__subtitle">
          Сохраняй тайтлы,
          продолжай просмотр с
          любого устройства и
          собирай достижения.
        </p>

        <div className="auth-social">
          <GoogleAuthButton
            label="Продолжить через Google"
            next={nextPath}
          />

          <TelegramAuthButton
            label="Продолжить через Telegram"
            next={nextPath}
            onError={(value) => {
              setMessage('');
              setError(value);
            }}
          />

          <div className="auth-divider">
            <span />

            <small>
              или зарегистрируйся
              через email
            </small>

            <span />
          </div>
        </div>

        <form
          onSubmit={
            handleSubmit
          }
          className="auth-form"
          noValidate
        >
          <label>
            <span>
              Имя пользователя
            </span>

            <input
              value={
                username
              }
              onChange={(event) => {
                setUsername(
                  event.target.value,
                );

                if (usernameError) {
                  setUsernameError('');
                }
              }}
              className={
                usernameError
                  ? 'auth-input--error'
                  : undefined
              }
              maxLength={24}
              placeholder="Например: ghoul cat"
              autoComplete="username"
              aria-invalid={Boolean(usernameError)}
              required
            />

            {usernameError && (
              <span className="auth-field-error">
                <span
                  className="auth-field-error__icon"
                  aria-hidden="true"
                >
                  !
                </span>

                {usernameError}
              </span>
            )}
          </label>

          <label>
            <span>
              Email
            </span>

            <input
              type="email"
              value={email}
              onChange={(event) => {
                setEmail(
                  event.target.value,
                );

                if (emailError) {
                  setEmailError('');
                }
              }}
              className={
                emailError
                  ? 'auth-input--error'
                  : undefined
              }
              placeholder="name@example.com"
              autoComplete="email"
              aria-invalid={Boolean(emailError)}
              required
            />

            {emailError && (
              <span className="auth-field-error">
                <span
                  className="auth-field-error__icon"
                  aria-hidden="true"
                >
                  !
                </span>

                {emailError}
              </span>
            )}
          </label>

          <label>
            <div className="auth-form__label-row">
              <span>
                Пароль
              </span>

              <button
                type="button"
                onClick={() =>
                  setShowPassword(
                    (
                      current,
                    ) =>
                      !current,
                  )
                }
              >
                {showPassword
                  ? 'Скрыть'
                  : 'Показать'}
              </button>
            </div>

            <input
              type={
                showPassword
                  ? 'text'
                  : 'password'
              }
              value={
                password
              }
              onChange={(event) => {
                setPassword(
                  event.target.value,
                );

                if (passwordError) {
                  setPasswordError('');
                }

                if (confirmPasswordError) {
                  setConfirmPasswordError('');
                }
              }}
              className={
                passwordError
                  ? 'auth-input--error'
                  : undefined
              }
              placeholder="Минимум 8 символов"
              autoComplete="new-password"
              minLength={8}
              aria-invalid={Boolean(passwordError)}
              required
            />

            {passwordError && (
              <span className="auth-field-error">
                <span
                  className="auth-field-error__icon"
                  aria-hidden="true"
                >
                  !
                </span>

                {passwordError}
              </span>
            )}
          </label>

          <label>
            <span>
              Повторите пароль
            </span>

            <input
              type={
                showPassword
                  ? 'text'
                  : 'password'
              }
              value={
                confirmPassword
              }
              onChange={(event) => {
                setConfirmPassword(
                  event.target.value,
                );

                if (confirmPasswordError) {
                  setConfirmPasswordError('');
                }
              }}
              className={
                confirmPasswordError
                  ? 'auth-input--error'
                  : undefined
              }
              placeholder="Введите пароль ещё раз"
              autoComplete="new-password"
              minLength={8}
              aria-invalid={Boolean(confirmPasswordError)}
              required
            />

            {confirmPasswordError && (
              <span className="auth-field-error">
                <span
                  className="auth-field-error__icon"
                  aria-hidden="true"
                >
                  !
                </span>

                {confirmPasswordError}
              </span>
            )}
          </label>

          {error && (
            <div className="auth-form__error">
              {error}
            </div>
          )}

          {message && (
            <div className="auth-form__success">
              {message}
            </div>
          )}

          <button
            type="submit"
            className="auth-form__submit"
            disabled={
              loading
            }
          >
            {loading
              ? 'Создаём аккаунт...'
              : 'Создать аккаунт'}
          </button>
        </form>

        <div className="auth-card__switch">
          Уже есть аккаунт?{' '}
          <Link href={nextPath === '/profile' ? '/login' : `/login?next=${encodeURIComponent(nextPath)}`}>
            Войти
          </Link>
        </div>
      </div>
    </main>
  );
}