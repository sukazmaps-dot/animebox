'use client';

import {
  ChangeEvent,
  FormEvent,
  useEffect,
  useState,
} from 'react';

import { createClient } from '@/lib/supabase/client';

type SavedProfile = {
  username: string;
  bio: string | null;
  avatar_path: string | null;
  banner_path: string | null;
};

type Props = {
  open: boolean;

  username: string;
  bio: string | null;

  avatarPath: string | null;
  bannerPath: string | null;

  onClose: () => void;
  onSaved: (profile: SavedProfile) => void;
};

const MAX_FILE_SIZE = 5 * 1024 * 1024;

const allowedTypes = [
  'image/jpeg',
  'image/png',
  'image/webp',
];

export default function ProfileEditModal({
  open,
  username,
  bio,
  avatarPath,
  bannerPath,
  onClose,
  onSaved,
}: Props) {
  const [newUsername, setNewUsername] =
    useState(username);

  const [newBio, setNewBio] =
    useState(bio ?? '');

  const [avatarFile, setAvatarFile] =
    useState<File | null>(null);

  const [bannerFile, setBannerFile] =
    useState<File | null>(null);

  const [avatarPreview, setAvatarPreview] =
    useState<string | null>(null);

  const [bannerPreview, setBannerPreview] =
    useState<string | null>(null);

  const [removeAvatar, setRemoveAvatar] =
    useState(false);

  const [removeBanner, setRemoveBanner] =
    useState(false);

  const [saving, setSaving] =
    useState(false);

  const [error, setError] =
    useState('');

  const supabase = createClient();

  const currentAvatarUrl = avatarPath
    ? supabase.storage
        .from('profile-media')
        .getPublicUrl(avatarPath)
        .data.publicUrl
    : '/default-avatar.webp';

  const currentBannerUrl = bannerPath
    ? supabase.storage
        .from('profile-media')
        .getPublicUrl(bannerPath)
        .data.publicUrl
    : null;

  useEffect(() => {
    if (!open) return;

    setNewUsername(username);
    setNewBio(bio ?? '');

    setAvatarFile(null);
    setBannerFile(null);

    setAvatarPreview(null);
    setBannerPreview(null);

    setRemoveAvatar(false);
    setRemoveBanner(false);

    setError('');

    const previousOverflow =
      document.body.style.overflow;

    document.body.style.overflow = 'hidden';

    function handleEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        onClose();
      }
    }

    window.addEventListener(
      'keydown',
      handleEscape,
    );

    return () => {
      document.body.style.overflow =
        previousOverflow;

      window.removeEventListener(
        'keydown',
        handleEscape,
      );
    };
  }, [
    open,
    username,
    bio,
    avatarPath,
    bannerPath,
    onClose,
  ]);

  useEffect(() => {
    return () => {
      if (avatarPreview) {
        URL.revokeObjectURL(avatarPreview);
      }

      if (bannerPreview) {
        URL.revokeObjectURL(bannerPreview);
      }
    };
  }, [avatarPreview, bannerPreview]);

  function validateFile(file: File) {
    if (!allowedTypes.includes(file.type)) {
      return 'Поддерживаются только JPG, PNG и WEBP.';
    }

    if (file.size > MAX_FILE_SIZE) {
      return 'Файл не должен быть больше 5 МБ.';
    }

    return null;
  }

  function handleAvatar(
    event: ChangeEvent<HTMLInputElement>,
  ) {
    const file = event.target.files?.[0];

    if (!file) return;

    const fileError = validateFile(file);

    if (fileError) {
      setError(fileError);
      return;
    }

    if (avatarPreview) {
      URL.revokeObjectURL(avatarPreview);
    }

    setAvatarFile(file);
    setAvatarPreview(
      URL.createObjectURL(file),
    );

    setRemoveAvatar(false);
    setError('');

    event.target.value = '';
  }

  function handleBanner(
    event: ChangeEvent<HTMLInputElement>,
  ) {
    const file = event.target.files?.[0];

    if (!file) return;

    const fileError = validateFile(file);

    if (fileError) {
      setError(fileError);
      return;
    }

    if (bannerPreview) {
      URL.revokeObjectURL(bannerPreview);
    }

    setBannerFile(file);
    setBannerPreview(
      URL.createObjectURL(file),
    );

    setRemoveBanner(false);
    setError('');

    event.target.value = '';
  }

  function getExtension(file: File) {
    if (file.type === 'image/png') {
      return 'png';
    }

    if (file.type === 'image/webp') {
      return 'webp';
    }

    return 'jpg';
  }

  async function handleSubmit(
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    const cleanUsername =
      newUsername.trim();

    const cleanBio =
      newBio.trim();

    setError('');

    if (
      cleanUsername.length < 3 ||
      cleanUsername.length > 24
    ) {
      setError(
        'Ник должен содержать от 3 до 24 символов.',
      );

      return;
    }

    if (cleanBio.length > 300) {
      setError(
        'Описание не может быть длиннее 300 символов.',
      );

      return;
    }

    setSaving(true);

    let uploadedAvatarPath: string | null =
      null;

    let uploadedBannerPath: string | null =
      null;

    try {
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError || !user) {
        throw new Error(
          'Пользователь не авторизован.',
        );
      }

      let finalAvatarPath =
        removeAvatar
          ? null
          : avatarPath;

      let finalBannerPath =
        removeBanner
          ? null
          : bannerPath;

      /*
       * AVATAR
       */

      if (avatarFile && !removeAvatar) {
        const extension =
          getExtension(avatarFile);

        uploadedAvatarPath =
          `${user.id}/avatar-${Date.now()}.${extension}`;

        const { error: uploadError } =
          await supabase.storage
            .from('profile-media')
            .upload(
              uploadedAvatarPath,
              avatarFile,
              {
                cacheControl: '3600',
                upsert: false,
                contentType:
                  avatarFile.type,
              },
            );

        if (uploadError) {
          throw uploadError;
        }

        finalAvatarPath =
          uploadedAvatarPath;
      }

      /*
       * BANNER
       */

      if (bannerFile && !removeBanner) {
        const extension =
          getExtension(bannerFile);

        uploadedBannerPath =
          `${user.id}/banner-${Date.now()}.${extension}`;

        const { error: uploadError } =
          await supabase.storage
            .from('profile-media')
            .upload(
              uploadedBannerPath,
              bannerFile,
              {
                cacheControl: '3600',
                upsert: false,
                contentType:
                  bannerFile.type,
              },
            );

        if (uploadError) {
          throw uploadError;
        }

        finalBannerPath =
          uploadedBannerPath;
      }

      /*
       * ОДНО ОБНОВЛЕНИЕ PROFILE
       */

      const {
        data,
        error: updateError,
      } = await supabase
        .from('profiles')
        .update({
          username: cleanUsername,
          bio: cleanBio || null,
          avatar_path: finalAvatarPath,
          banner_path: finalBannerPath,
        })
        .eq('id', user.id)
        .select(
          'username, bio, avatar_path, banner_path',
        )
        .single();

      if (updateError) {
        /*
         * Если БД не сохранилась —
         * удаляем новые файлы.
         */

        const filesToDelete = [
          uploadedAvatarPath,
          uploadedBannerPath,
        ].filter(
          (path): path is string =>
            Boolean(path),
        );

        if (filesToDelete.length) {
          await supabase.storage
            .from('profile-media')
            .remove(filesToDelete);
        }

        if (updateError.code === '23505') {
          setError(
            'Этот ник уже занят.',
          );

          return;
        }

        throw updateError;
      }

      /*
       * БД сохранена.
       * Теперь старые файлы можно удалить.
       */

      const oldFilesToDelete: string[] =
        [];

      if (
        avatarPath &&
        avatarPath !== data.avatar_path
      ) {
        oldFilesToDelete.push(
          avatarPath,
        );
      }

      if (
        bannerPath &&
        bannerPath !== data.banner_path
      ) {
        oldFilesToDelete.push(
          bannerPath,
        );
      }

      if (oldFilesToDelete.length) {
        await supabase.storage
          .from('profile-media')
          .remove(oldFilesToDelete);
      }

      onSaved({
        username:
          data.username ??
          cleanUsername,

        bio:
          data.bio ?? null,

        avatar_path:
          data.avatar_path ?? null,

        banner_path:
          data.banner_path ?? null,
      });

      onClose();
    } catch (error) {
      console.error(error);

      setError(
        error instanceof Error
          ? error.message
          : 'Не удалось сохранить профиль.',
      );
    } finally {
      setSaving(false);
    }
  }

  if (!open) {
    return null;
  }

  const displayedAvatar =
    removeAvatar
      ? '/default-avatar.webp'
      : avatarPreview ||
        currentAvatarUrl;

  const displayedBanner =
    removeBanner
      ? null
      : bannerPreview ||
        currentBannerUrl;

  return (
    <div
      className="profile-edit-modal"
      role="dialog"
      aria-modal="true"
      aria-label="Редактирование профиля"
    >
      <button
        type="button"
        className="profile-edit-modal__backdrop"
        onClick={onClose}
        aria-label="Закрыть"
      />

      <div className="profile-edit-modal__window profile-editor">
        <div className="profile-edit-modal__head">
          <div>
            <span>
              ANIMEBOX PROFILE
            </span>

            <h2>
              Редактировать профиль
            </h2>

            <p>
              Настрой внешний вид своего
              аккаунта.
            </p>
          </div>

          <button
            type="button"
            className="profile-edit-modal__close"
            onClick={onClose}
            aria-label="Закрыть"
          >
            ×
          </button>
        </div>

        <form
          className="profile-edit-modal__form"
          onSubmit={handleSubmit}
        >
          {/* MEDIA PREVIEW */}

          <div className="profile-editor__media">
            <div className="profile-editor__banner">
              {displayedBanner ? (
                <img
                  src={displayedBanner}
                  alt="Баннер профиля"
                />
              ) : (
                <div className="profile-editor__banner-default" />
              )}

              <label className="profile-editor__banner-action">
                Сменить баннер

                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  hidden
                  onChange={handleBanner}
                />
              </label>

              {(bannerPath ||
                bannerFile) && (
                <button
                  type="button"
                  className="profile-editor__remove-banner"
                  onClick={() => {
                    setRemoveBanner(true);
                    setBannerFile(null);
                    setBannerPreview(null);
                  }}
                >
                  Удалить
                </button>
              )}
            </div>

            <div className="profile-editor__avatar-row">
              <div className="profile-editor__avatar">
                <img
                  src={displayedAvatar}
                  alt="Аватар профиля"
                />
              </div>

              <div className="profile-editor__avatar-actions">
                <strong>
                  Аватар профиля
                </strong>

                <span>
                  JPG, PNG или WEBP • до 5 МБ
                </span>

                <div>
                  <label>
                    Выбрать изображение

                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      hidden
                      onChange={handleAvatar}
                    />
                  </label>

                  {(avatarPath ||
                    avatarFile) && (
                    <button
                      type="button"
                      onClick={() => {
                        setRemoveAvatar(true);
                        setAvatarFile(null);
                        setAvatarPreview(null);
                      }}
                    >
                      Сбросить
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* USERNAME */}

          <label className="profile-edit-modal__field">
            <div className="profile-edit-modal__field-head">
              <span>
                Имя пользователя
              </span>

              <small>
                {newUsername.length}/24
              </small>
            </div>

            <input
              value={newUsername}
              onChange={(event) =>
                setNewUsername(
                  event.target.value,
                )
              }
              minLength={3}
              maxLength={24}
              placeholder="Твой ник"
              autoComplete="off"
              required
            />
          </label>

          {/* BIO */}

          <label className="profile-edit-modal__field">
            <div className="profile-edit-modal__field-head">
              <span>
                О себе
              </span>

              <small>
                {newBio.length}/300
              </small>
            </div>

            <textarea
              value={newBio}
              onChange={(event) =>
                setNewBio(
                  event.target.value,
                )
              }
              maxLength={300}
              rows={4}
              placeholder="Расскажи немного о себе и любимых аниме..."
            />
          </label>

          {error && (
            <div className="profile-edit-modal__error">
              {error}
            </div>
          )}

          <div className="profile-edit-modal__footer">
            <button
              type="button"
              className="profile-edit-modal__cancel"
              onClick={onClose}
              disabled={saving}
            >
              Отмена
            </button>

            <button
              type="submit"
              className="profile-edit-modal__save"
              disabled={saving}
            >
              {saving
                ? 'Сохраняем...'
                : 'Сохранить изменения'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}