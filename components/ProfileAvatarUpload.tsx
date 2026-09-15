'use client';

import { ChangeEvent, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/client';

type Props = {
  username: string;
  avatarPath: string | null;
  onUploaded: (path: string) => void;
};

export default function ProfileAvatarUpload({
  username,
  avatarPath,
  onUploaded,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);

  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');

  const supabase = createClient();

  function getAvatarUrl(path: string | null) {
    if (!path) return null;

    const { data } = supabase.storage
      .from('profile-media')
      .getPublicUrl(path);

    return data.publicUrl;
  }

const avatarUrl =
  getAvatarUrl(avatarPath) || '/default-avatar.webp';

  async function handleFile(
    event: ChangeEvent<HTMLInputElement>,
  ) {
    const file = event.target.files?.[0];

    if (!file) return;

    setError('');

    const allowedTypes = [
      'image/jpeg',
      'image/png',
      'image/webp',
    ];

    if (!allowedTypes.includes(file.type)) {
      setError('Поддерживаются только JPG, PNG и WEBP.');
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      setError('Аватар не должен быть больше 5 МБ.');
      return;
    }

    setUploading(true);

    try {
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError || !user) {
        throw new Error('Пользователь не авторизован.');
      }

      const extension =
        file.name.split('.').pop()?.toLowerCase() || 'jpg';

      /*
       * Каждый новый аватар получает новый путь.
       * Поэтому браузер не покажет старую картинку из cache.
       */
      const newPath =
        `${user.id}/avatar-${Date.now()}.${extension}`;

      const { error: uploadError } =
        await supabase.storage
          .from('profile-media')
          .upload(newPath, file, {
            cacheControl: '3600',
            upsert: false,
            contentType: file.type,
          });

      if (uploadError) {
        throw uploadError;
      }

      /*
       * Сохраняем новый путь в profiles.
       */
      const { error: profileError } =
        await supabase
          .from('profiles')
          .update({
            avatar_path: newPath,
          })
          .eq('id', user.id);

      if (profileError) {
        /*
         * Если БД не обновилась —
         * удаляем только что загруженный файл.
         */
        await supabase.storage
          .from('profile-media')
          .remove([newPath]);

        throw profileError;
      }

      /*
       * Старый аватар больше не нужен.
       */
      if (
        avatarPath &&
        avatarPath !== newPath
      ) {
        await supabase.storage
          .from('profile-media')
          .remove([avatarPath]);
      }

      onUploaded(newPath);
    } catch (error) {
      console.error(error);

      setError(
        error instanceof Error
          ? error.message
          : 'Не удалось загрузить аватар.',
      );
    } finally {
      setUploading(false);

      if (inputRef.current) {
        inputRef.current.value = '';
      }
    }
  }

  return (
    <div className="profile-avatar-editor">
      <button
        type="button"
        className="profile-avatar-editor__button"
        onClick={() => inputRef.current?.click()}
        disabled={uploading}
        aria-label="Изменить аватар"
      >
       <img
  src={avatarUrl}
  alt={`Аватар ${username}`}
  className="profile-avatar-editor__image"
/>

        <span className="profile-avatar-editor__overlay">
          {uploading ? '...' : 'Изменить'}
        </span>
      </button>

      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        onChange={handleFile}
        hidden
      />

      {error && (
        <p className="profile-avatar-editor__error">
          {error}
        </p>
      )}
    </div>
  );
}