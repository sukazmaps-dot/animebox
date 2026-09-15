'use client';

import { ChangeEvent, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/client';

type Props = {
  bannerPath: string | null;
  onUploaded: (path: string) => void;
};

export default function ProfileBannerUpload({
  bannerPath,
  onUploaded,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);

  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');

  const supabase = createClient();

  const bannerUrl = bannerPath
    ? supabase.storage
        .from('profile-media')
        .getPublicUrl(bannerPath).data.publicUrl
    : null;

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
      setError('Поддерживаются JPG, PNG и WEBP.');
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      setError('Баннер не должен быть больше 5 МБ.');
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

      const newPath =
        `${user.id}/banner-${Date.now()}.${extension}`;

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

      const { error: profileError } =
        await supabase
          .from('profiles')
          .update({
            banner_path: newPath,
          })
          .eq('id', user.id);

      if (profileError) {
        await supabase.storage
          .from('profile-media')
          .remove([newPath]);

        throw profileError;
      }

      if (
        bannerPath &&
        bannerPath !== newPath
      ) {
        await supabase.storage
          .from('profile-media')
          .remove([bannerPath]);
      }

      onUploaded(newPath);
    } catch (error) {
      console.error(error);

      setError(
        error instanceof Error
          ? error.message
          : 'Не удалось загрузить баннер.',
      );
    } finally {
      setUploading(false);

      if (inputRef.current) {
        inputRef.current.value = '';
      }
    }
  }

  return (
    <div className="profile-banner-editor">
      <button
        type="button"
        className="profile-banner-editor__button"
        onClick={() => inputRef.current?.click()}
        disabled={uploading}
      >
        {bannerUrl ? (
          <img
            src={bannerUrl}
            alt=""
            className="profile-banner-editor__image"
          />
        ) : (
          <div className="profile-banner-editor__fallback" />
        )}

        <span className="profile-banner-editor__overlay">
          {uploading ? 'Загрузка...' : 'Изменить баннер'}
        </span>
      </button>

      <input
        ref={inputRef}
        hidden
        type="file"
        accept="image/jpeg,image/png,image/webp"
        onChange={handleFile}
      />

      {error && (
        <p className="profile-banner-editor__error">
          {error}
        </p>
      )}
    </div>
  );
}